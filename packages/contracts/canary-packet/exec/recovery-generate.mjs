// TASK 10D-8 — assemble the fresh v9 RECOVERY packet (PURE TIME REFRESH of the reviewed v8) + policy + canonical recovery authorization.
// Original steps 1-13 are verified completed anchors; ONLY the final six tester transactions (original
// steps 14-19, tester nonces 2-7) are signable. No deployer transaction is actionable. Preserves the
// accepted v7 gas policy (1.25x per-step cost ceilings, 50,000,000 wei priority ceiling) and the accepted
// deadline-refresh mechanism for the remaining deadline-bearing steps 15 and 17 ONLY (source deadline must
// equal the bound v7 deadline 1784946528). Read-only; no chain write.
import { readFileSync, writeFileSync } from "node:fs";
import { keccak256, getAddress, decodeFunctionData, encodeFunctionData } from "viem";
import { buildRecoveryCanonical, RECOVERY_SCOPE, PRIORITY_CEILING_WEI } from "./operator/recovery-canonical.mjs";
import { digestOf } from "./operator/canonical.mjs";

const U = (p) => new URL(p, import.meta.url);
const rj = (p) => JSON.parse(readFileSync(U(p), "utf8"));
const rehearsal = rj("canary-unsigned-packet.json");
const v8 = rj("v8-accepted-packet.json");                     // REVIEWED v8 canonical (source of the 6 txs)
const policy = rj("review-policy.json");
const anchorFile = rj("recovery-anchor.json");
const snap = rj("recovery-snapshot.json");
const price = rj("recovery-price-snapshot.json");
const A = getAddress, B = (x) => BigInt(x);
const stable = (v) => Array.isArray(v) ? "[" + v.map(stable).join(",") + "]" : (v && typeof v === "object") ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}" : JSON.stringify(v);
const toHexUtf8 = (s) => { let h = "0x"; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h += (c < 16 ? "0" : "") + c.toString(16); } return h; };

const CAP_MICRO = B(price.selected.microUsd);
const WINDOW = 21600;
const OLD_DEADLINE = 1784949999n;                              // the BOUND v8 deadline (reviewed source value)
const NEW_DEADLINE = BigInt(snap.pinnedBlock.timestamp) + BigInt(WINDOW);
const ROUTER_ABI = JSON.parse(readFileSync(U("artifacts/BPSTradeRouter.json"), "utf8")).abi;
const DEADLINE_STEPS = { "buyExactWethForBps": { abi: ROUTER_ABI }, "sellExactBpsForWeth": { abi: ROUTER_ABI } };

function refreshDeadline(label, oldData) {
  const { abi } = DEADLINE_STEPS[label];
  const dec = decodeFunctionData({ abi, data: oldData });
  const oldDl = BigInt(dec.args[dec.args.length - 1]);
  if (oldDl !== OLD_DEADLINE) throw new Error(label + ": accepted source deadline " + oldDl + " != bound v8 deadline " + OLD_DEADLINE);
  const newData = encodeFunctionData({ abi, functionName: dec.functionName, args: [...dec.args.slice(0, -1), NEW_DEADLINE] });
  if (newData.length !== oldData.length) throw new Error(label + ": calldata length changed");
  if (newData.slice(0, 10).toLowerCase() !== oldData.slice(0, 10).toLowerCase()) throw new Error(label + ": selector changed");
  const diffBytes = [];
  for (let i = 2; i < oldData.length; i += 2) if (oldData.slice(i, i + 2).toLowerCase() !== newData.slice(i, i + 2).toLowerCase()) diffBytes.push((i - 2) / 2);
  if (diffBytes.length === 0) throw new Error(label + ": no bytes changed");
  const wordOffsetBytes = 4 + Math.floor((diffBytes[0] - 4) / 32) * 32;
  for (const bo of diffBytes) if (bo < wordOffsetBytes || bo >= wordOffsetBytes + 32) throw new Error(label + ": byte " + bo + " outside the single deadline word @" + wordOffsetBytes);
  const newWord = BigInt("0x" + newData.slice(2 + wordOffsetBytes * 2, 2 + wordOffsetBytes * 2 + 64));
  const oldWord = BigInt("0x" + oldData.slice(2 + wordOffsetBytes * 2, 2 + wordOffsetBytes * 2 + 64));
  if (newWord !== NEW_DEADLINE || oldWord !== OLD_DEADLINE) throw new Error(label + ": deadline word mismatch");
  const dec2 = decodeFunctionData({ abi, data: newData });
  const norm = (v) => JSON.stringify(v, (k, x) => typeof x === "bigint" ? x.toString() : x);
  if (norm(dec.args.slice(0, -1)) !== norm(dec2.args.slice(0, -1))) throw new Error(label + ": non-deadline argument changed");
  if (BigInt(dec2.args[dec2.args.length - 1]) !== NEW_DEADLINE) throw new Error(label + ": decoded new deadline wrong");
  return { newData, wordOffsetBytes, oldDataKeccak: keccak256(oldData), newDataKeccak: keccak256(newData) };
}

// ---- the final SIX tester transactions = accepted v7 steps 14-19 (tester nonces 2-7) ----
const src6 = v8.immediateTransactions.filter(t => t.originalIndex >= 14);
if (src6.length !== 6) throw new Error("expected 6 source txs, got " + src6.length);
const TESTER = A(policy.wallets.tester);
const deadlineRefreshSteps = [];
const remainingTxs = src6.map((t, i) => {
  if (A(t.signer) !== TESTER) throw new Error(t.label + ": signer is not the tester");
  const gasLimit = B(t.gasLimit), maxFee = B(t.maxFeePerGas), maxPrio = B(t.maxPriorityFeePerGas);
  const reviewedCost = gasLimit * maxFee;
  let data = t.dataOrInitCode, dataKeccak = t.dataKeccak, decodedArgs = t.decodedArgs;
  if (DEADLINE_STEPS[t.label]) {
    const r = refreshDeadline(t.label, t.dataOrInitCode);
    data = r.newData; dataKeccak = r.newDataKeccak;
    decodedArgs = { ...t.decodedArgs, deadline: NEW_DEADLINE.toString() };
    deadlineRefreshSteps.push({ originalIndex: t.originalIndex, label: t.label, wordOffsetBytes: r.wordOffsetBytes, oldDataKeccak: r.oldDataKeccak, newDataKeccak: r.newDataKeccak });
  } else if (keccak256(t.dataOrInitCode).toLowerCase() !== t.dataKeccak.toLowerCase()) throw new Error(t.label + ": accepted calldata hash mismatch");
  return {
    originalIndex: t.originalIndex, remainingIndex: i,
    seq: t.seq, phase: t.phase, label: t.label, signer: TESTER, nonce: t.nonce, txType: t.txType,
    to: t.to ? A(t.to) : null, predictedCreationAddress: null,
    value: t.value || "0", dataOrInitCode: data, dataKeccak, decodedArgs,
    chainId: 4663, gasLimit: gasLimit.toString(), maxFeePerGas: maxFee.toString(), maxPriorityFeePerGas: maxPrio.toString(),
    gasCeilings: {
      gasLimitCeiling: (gasLimit * 2n).toString(),
      maxFeeCeilingWei: maxFee.toString(),
      maxPriorityCeilingWei: PRIORITY_CEILING_WEI,
      reviewedMaxGasCostWei: reviewedCost.toString(),
      maxGasCostCeilingWei: (reviewedCost * 5n / 4n).toString(),   // accepted v7 policy: exactly 1.25x
    },
  };
});
if (!remainingTxs.every((t, i) => t.originalIndex === i + 14 && t.nonce === i + 2)) throw new Error("original index / tester nonce sequencing broken");
if (deadlineRefreshSteps.map(d => d.originalIndex).join(",") !== "15,17") throw new Error("deadline refresh must cover exactly original steps 15 and 17");

// ---- v8 exposure: realized gas (steps 1-13) + principal (accepted model) + max authorized gas (14-19) ----
const realizedGasWei = B(anchorFile.realizedGasWei);
const immediate14to19Reviewed = remainingTxs.reduce((acc, t) => acc + B(t.gasCeilings.reviewedMaxGasCostWei), 0n);
const allImmediateReviewed = rehearsal.immediateTransactions.reduce((acc, t) => acc + B(t.gasLimit) * B(t.maxFeePerGas), 0n);
const nonImmediateReviewed = B(rehearsal.capArithmetic.allInclusiveGasWei) - allImmediateReviewed;   // delayed + funding (1x)
if (nonImmediateReviewed < 0n) throw new Error("gas decomposition negative");
const remainingMaxGasWei = immediate14to19Reviewed * 5n / 4n + nonImmediateReviewed;
const remainingPrincipalWei = B(rehearsal.forkFunding.inbound.deployer.weth) + B(rehearsal.forkFunding.inbound.tester.weth); // accepted model: full principal remains at risk
const aggregateWei = realizedGasWei + remainingPrincipalWei + remainingMaxGasWei;
const aggregateMicroUsd = (aggregateWei * CAP_MICRO) / 10n ** 18n;
if (aggregateMicroUsd > 130_000_000n) throw new Error(`recovery exposure $${(Number(aggregateMicroUsd) / 1e6).toFixed(6)} exceeds $130 — NOT generating an executable packet`);

const meta = {
  task: "10D-8-recovery-v9", kind: "EXECUTION-ENABLED BPSC-TEST canary RECOVERY v9 packet (pure time refresh of the reviewed v8) (original steps 1-13 completed on chain; final SIX tester transactions; localhost Rabby operator; per-tx user approval; NO key handling)",
  mode: "recovery", live: true, executable: true, executionAuthorized: true, fundingAuthorized: true,
  chainId: 4663, authorization: { canary: true, production: false, scope: RECOVERY_SCOPE, maxAllInclusiveExposureUsd: 130, signingChannel: "user Rabby extension via per-transaction eth_sendTransaction only", delayedWithdrawalDisabled: "tester nonce 8 withdraw NOT executable from the recovery operator" },
  deployer: A(policy.wallets.deployer), tester: TESTER,
  forkBlock: String(snap.pinnedBlock.number), forkBlockHash: snap.pinnedBlock.hash, forkTimestamp: String(snap.pinnedBlock.timestamp), forkBaseFeePerGasWei: String(snap.pinnedBlock.baseFeePerGasWei),
  generatedAtUtc: new Date().toISOString(), expiresAtUtc: new Date(Number(NEW_DEADLINE) * 1000).toISOString(), validityWindowSeconds: WINDOW,
  originalStepCount: 19,
  v5ZipSha256: anchorFile.v5ZipSha256, v5ReviewedAuthorizationDigest: anchorFile.v5ReviewedAuthorizationDigest,
  v6ZipSha256: anchorFile.v6ZipSha256, v6RecoveryAuthorizationDigest: anchorFile.v6RecoveryAuthorizationDigest,
  v7ZipSha256: anchorFile.v7ZipSha256, v7RecoveryAuthorizationDigest: anchorFile.v7RecoveryAuthorizationDigest,
  v8ZipSha256: anchorFile.v8ZipSha256, v8RecoveryAuthorizationDigest: anchorFile.v8RecoveryAuthorizationDigest,
  gasPolicy: {
    perStepCostMultiplier: "1.25x reviewed maxGasCostWei (exact, remaining steps 14-19 only; accepted v7 policy preserved)",
    maxPriorityCeilingWei: PRIORITY_CEILING_WEI,
    maxFeeCeilingUnchanged: true, gasLimitCeilingUnchanged: true,
    authorization: "TASK 10D-6 option B (accepted): per-step maximum gas-cost ceilings exactly 1.25x reviewed; maxFeePerGas ceiling unchanged; maxPriorityFeePerGas ceiling exactly 50000000 wei; gasLimit ceiling unchanged; $130 all-inclusive cap unchanged. Preserved unchanged for v8 (TASK 10D-7).",
  },
  deadlineRefresh: {
    authorization: "TASK 10D-8 (pure v9 time refresh): the previously authorized deadline-refresh mechanism applies to the remaining deadline-bearing steps 15 and 17 ONLY. The reviewed source deadline (the bound v8 value 1784949999) was refreshed to the canonical v8 packet expiry via strict ABI decode/re-encode; a byte-diff proof restricts each change to the single 32-byte deadline word; the other four remaining calldatas are byte-identical to the accepted v7 versions.",
    oldDeadline: OLD_DEADLINE.toString(), newDeadline: NEW_DEADLINE.toString(),
    newDeadlineEqualsPacketExpiry: true,
    steps: deadlineRefreshSteps,
  },
  accountPolicy: "ALL six remaining transactions are TESTER transactions (nonces 2-7). The operator refuses to connect with any account other than the tester, and a wrong-account pre-check is a NON-HALTING refusal (nothing was sent; switching accounts and retrying the pre-check is safe) — the v7 terminal halt on accountSelected cannot recur. No deployer transaction is actionable.",
  feeBounds: { maxFeePerGasWei: policy.gas.maxFeePerGasWei, maxPriorityFeePerGasWei: PRIORITY_CEILING_WEI, pinnedBaseFeePerGasWei: String(snap.pinnedBlock.baseFeePerGasWei) },
};

const recoveryPacket = {
  meta,
  safetyFlags: { broadcastReady: true, liveWritesApproved: true, executionAuthorized: true, fundingAuthorized: true },
  completedSteps: anchorFile.completedSteps,
  remaining: { count: 6, allSignersTester: true, note: "final six tester transactions (original steps 14-19; tester nonces 2-7); NO deployer transaction is actionable" },
  addressGuards: { poolAddress: A(anchorFile.poolAddress), infrastructure: rehearsal.addressGuards.infrastructure.map(A), completedContracts: snap.completedContracts },
  deployedRuntimeCodeHashes: rehearsal.deployedRuntimeCodeHashes,
  dependencies: snap.externalCodeHashes,
  lpUsage: rehearsal.lpUsage, buyAccounting: rehearsal.buyAccounting, sellAccounting: rehearsal.sellAccounting, lockAndWithdraw: rehearsal.lockAndWithdraw,
  positionTokenId: anchorFile.positionTokenId,
  provenance: { repoHead: rehearsal.provenance.repoHead, dirtyTrackedTree: rehearsal.provenance.dirtyTrackedTree, contracts: rehearsal.provenance.contracts },
  capArithmetic: { capPriceMicroUsd: CAP_MICRO.toString(), realizedGasWei: realizedGasWei.toString(), remainingPrincipalWei: remainingPrincipalWei.toString(), remainingMaxGasWei: remainingMaxGasWei.toString(), immediate14to19ReviewedWei: immediate14to19Reviewed.toString(), immediate14to19CeilingWei: (immediate14to19Reviewed * 5n / 4n).toString(), nonImmediateReviewedWei: nonImmediateReviewed.toString(), aggregateWei: aggregateWei.toString(), aggregateMicroUsd: aggregateMicroUsd.toString(), aggregateUsd: (Number(aggregateMicroUsd) / 1e6).toFixed(6) },
  immediateTransactions: remainingTxs,
  delayedWithdrawalSubPacket: rehearsal.delayedWithdrawalSubPacket,
};

const signable = (t) => ({ originalIndex: t.originalIndex, chainId: 4663, signer: A(t.signer), nonce: t.nonce, type: 2, to: t.to ? A(t.to) : null, value: t.value || "0", data: t.dataOrInitCode, gasLimit: t.gasLimit, maxFeePerGas: t.maxFeePerGas, maxPriorityFeePerGas: t.maxPriorityFeePerGas });
recoveryPacket.meta.remainingExecutionDigest = keccak256(toHexUtf8(stable(remainingTxs.map(signable))));

const canon = buildRecoveryCanonical({ packet: recoveryPacket, policy, snapshot: snap, getAddress });
if (canon.errors.length) throw new Error("recovery canonical build failed: " + canon.errors.join("; "));
const recoveryAuthorizationDigest = digestOf(canon.object, keccak256);
recoveryPacket.meta.recoveryAuthorizationDigest = recoveryAuthorizationDigest;

policy.recoveryAuthorizationDigest = recoveryAuthorizationDigest;
policy.recoveryExpectedNonces = { deployer: 16, tester: 2 };
writeFileSync(U("recovery-policy.json"), JSON.stringify(policy, null, 2));
writeFileSync(U("operator/recovery-authorization.json"), JSON.stringify(canon.object, null, 2));
writeFileSync(U("recovery-packet.json"), JSON.stringify(recoveryPacket, null, 2));

console.log("remainingExecutionDigest:", recoveryPacket.meta.remainingExecutionDigest);
console.log("recoveryAuthorizationDigest:", recoveryAuthorizationDigest);
console.log("realizedGasWei (steps 1-13):", realizedGasWei.toString());
console.log("remainingPrincipalWei:", remainingPrincipalWei.toString(), "remainingMaxGasWei:", remainingMaxGasWei.toString(), "(immediate14-19 reviewed", immediate14to19Reviewed.toString(), "-> ceiling", (immediate14to19Reviewed * 5n / 4n).toString(), "+ nonImmediate", nonImmediateReviewed.toString() + ")");
console.log("aggregateWei:", aggregateWei.toString(), "= $" + (Number(aggregateMicroUsd) / 1e6).toFixed(6), "(cap $130)");
console.log("deadline refresh: old", OLD_DEADLINE.toString(), "(" + new Date(Number(OLD_DEADLINE) * 1000).toISOString() + ") -> new", NEW_DEADLINE.toString(), "(" + new Date(Number(NEW_DEADLINE) * 1000).toISOString() + ")");
for (const d of deadlineRefreshSteps) console.log(`  orig ${d.originalIndex} ${d.label.padEnd(20)} word@byte ${d.wordOffsetBytes}  ${d.oldDataKeccak} -> ${d.newDataKeccak}`);
console.log("per-step ceilings (reviewed -> 1.25x):");
for (const t of remainingTxs) console.log(`  orig ${t.originalIndex} ${t.label.padEnd(28)} nonce ${t.nonce}  ${t.gasCeilings.reviewedMaxGasCostWei} -> ${t.gasCeilings.maxGasCostCeilingWei}`);
