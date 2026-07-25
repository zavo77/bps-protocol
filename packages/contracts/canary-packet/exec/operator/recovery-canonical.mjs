// TASK 10D-8 — canonical v9 RECOVERY authorization (pure time refresh of the reviewed v8). Original steps 1-13 are verified completed on-chain
// anchors (permanently non-actionable); ONLY the final six tester transactions (original steps 14-19,
// tester nonces 2-7) are signable. No deployer transaction is actionable. Preserves the accepted v7 gas
// policy (per-step cost ceiling exactly 1.25x reviewed; priority ceiling exactly 50,000,000 wei; maxFee +
// 2x gasLimit ceilings unchanged; $130 cap) and the accepted deadline-refresh mechanism for the remaining
// deadline-bearing steps 15 and 17 only (source deadline must equal the bound v7 value 1784946528).
// recoveryAuthorizationDigest = keccak256(canonicalStable(object)); every security-relevant value is a leaf.
import { isDec, isHex, postconditionType, DEP_NAMES } from "./canonical.mjs";

export const RECOVERY_SCHEMA = "canary-recovery-authorization";
export const RECOVERY_VERSION = "10D-8";
export const RECOVERY_SCOPE = "BPSC-TEST canary RECOVERY v9 (original steps 1-13 completed on chain; pure time refresh of the reviewed v8); Robinhood Chain mainnet; final SIX tester transactions only (original steps 14-19, tester nonces 2-7); per-step gas-cost ceiling exactly 1.25x reviewed (accepted); maximum all-inclusive exposure $130; individual Rabby approvals; canonical BPS production excluded.";
export const PRIORITY_CEILING_WEI = "50000000"; // exactly 0.05 gwei — accepted v7 policy
export const ALL_SLOTS = ["canaryToken", "lockingVault", "claimManager", "rialtoAdapter", "coordinator", "stockVault", "uniswapAdapter", "tradeRouter"];

export function buildRecoveryCanonical({ packet: a, policy: p, snapshot: s, getAddress }) {
  const err = [];
  const A = (x, w) => { if (!isHex(x, 20)) { err.push("non-address " + w); return "0x0000000000000000000000000000000000000000"; } return getAddress(x); };
  const N = (x, w) => { const v = typeof x === "number" ? String(x) : x; if (!isDec(v)) { err.push("non-canonical-number " + w + "(" + x + ")"); return "0"; } return v; };
  const I = (x, w) => { if (typeof x !== "number" || !Number.isInteger(x) || x < 0) { err.push("non-integer " + w); return 0; } return x; };
  const SI = (x, w) => { if (typeof x !== "number" || !Number.isInteger(x)) { err.push("non-int " + w); return 0; } return x; };
  const HH = (x, w) => { if (!isHex(x, 32)) { err.push("bad-hash " + w); return "0x" + "0".repeat(64); } return x.toLowerCase(); };
  const BT = (x, w) => { if (x !== true) { err.push("expected-true " + w); return false; } return true; };
  const BF = (x, w) => { if (x !== false) { err.push("expected-false " + w); return false; } return false; };
  const STR = (x, w, want) => { if (typeof x !== "string" || (want !== undefined && x !== want)) { err.push("bad-string " + w); return want ?? ""; } return x; };
  const req = (c, w) => { if (!c) err.push("missing " + w); };
  req(a && a.meta && a.meta.authorization, "meta");
  req(a && Array.isArray(a.completedSteps) && a.completedSteps.length === 13, "13 completed anchors");
  req(a && a.immediateTransactions && a.immediateTransactions.length === 6, "6 immediate");
  req(a && a.capArithmetic, "capArithmetic");
  req(a && a.lpUsage && a.buyAccounting && a.sellAccounting && a.lockAndWithdraw, "expectations");
  req(a && a.provenance && a.provenance.contracts, "provenance");
  req(a && a.addressGuards && a.addressGuards.completedContracts, "guards");
  req(s && s.pinnedBlock && s.nonces && s.balances && s.externalCodeHashes && s.expectedNonces && s.completedContracts, "snapshot");
  req(p && p.wallets && p.infrastructure && p.economics && p.gas, "policy");
  if (err.length) return { errors: err, object: null };

  const au = a.meta.authorization, lu = a.lpUsage, bu = a.buyAccounting, se = a.sellAccounting, lk = a.lockAndWithdraw, ca = a.capArithmetic;
  const TESTER = A(p.wallets.tester, "tester0");

  // the SIX signable tester transactions (original steps 14-19, tester nonces 2-7) — no deployer signable
  const sigStep = (t) => {
    const g = t.gasCeilings || {};
    const pc = postconditionType(t); if (pc === "unknown") err.push("pc unknown " + t.label);
    if (A(t.signer, "tx.s") !== TESTER) err.push("signable signer is NOT the tester @ " + t.label);
    const reviewedCost = BigInt(N(t.gasLimit, "x")) * BigInt(N(t.maxFeePerGas, "x"));
    if (BigInt(N(g.reviewedMaxGasCostWei, "gc.rev")) !== reviewedCost) err.push("gc.reviewed != gasLimit*maxFee @ " + t.label);
    if (BigInt(N(g.maxGasCostCeilingWei, "gc.cost")) * 4n !== reviewedCost * 5n) err.push("gc.cost != exactly 1.25x reviewed @ " + t.label);
    if (N(g.maxFeeCeilingWei, "gc.mf") !== N(t.maxFeePerGas, "x")) err.push("gc.maxFee ceiling changed @ " + t.label);
    if (N(g.maxPriorityCeilingWei, "gc.mp") !== PRIORITY_CEILING_WEI) err.push("gc.priority != exactly 50000000 @ " + t.label);
    if (BigInt(N(g.gasLimitCeiling, "gc.gl")) !== BigInt(N(t.gasLimit, "x")) * 2n) err.push("gc.gasLimit ceiling != 2x reviewed @ " + t.label);
    return {
      originalIndex: I(t.originalIndex, "tx.orig"), remainingIndex: I(t.remainingIndex, "tx.rem"),
      phase: STR(t.phase, "tx.phase"), label: STR(t.label, "tx.label"), postconditionType: pc,
      chainId: I(t.chainId, "tx.chain"), signer: A(t.signer, "tx.signer"), nonce: I(t.nonce, "tx.nonce"), type: 2,
      to: t.to ? A(t.to, "tx.to") : null, value: N(t.value || "0", "tx.value"),
      data: (isHex(t.dataOrInitCode) ? t.dataOrInitCode.toLowerCase() : (err.push("tx.data"), "0x")),
      gasLimit: N(t.gasLimit, "tx.gas"), maxFeePerGas: N(t.maxFeePerGas, "tx.maxFee"), maxPriorityFeePerGas: N(t.maxPriorityFeePerGas, "tx.maxPrio"),
      gasCeilings: { gasLimitCeiling: N(g.gasLimitCeiling, "gc.gl"), maxFeeCeilingWei: N(g.maxFeeCeilingWei, "gc.mf"), maxPriorityCeilingWei: N(g.maxPriorityCeilingWei, "gc.mp"), reviewedMaxGasCostWei: N(g.reviewedMaxGasCostWei, "gc.rev"), maxGasCostCeilingWei: N(g.maxGasCostCeilingWei, "gc.cost") },
    };
  };

  // the THIRTEEN completed anchors — every field digest-bound
  const anchors = a.completedSteps.map((x, i) => {
    if (I(x.originalIndex, "anc.oi") !== i + 1) err.push("anchor originalIndex sequence @ " + i);
    const out = {
      originalIndex: I(x.originalIndex, "anc.oi"), label: STR(x.label, "anc.lbl"), txHash: HH(x.txHash, "anc.hash"),
      signer: A(x.signer, "anc.signer"), nonce: I(x.nonce, "anc.nonce"),
      to: x.to ? A(x.to, "anc.to") : null, createdAddress: x.createdAddress ? A(x.createdAddress, "anc.created") : null,
      inputKeccak: HH(x.inputKeccak, "anc.ik"), blockNumber: N(x.blockNumber, "anc.bn"), blockHash: HH(x.blockHash, "anc.bh"),
      gasUsed: N(x.gasUsed, "anc.gu"), effectiveGasPriceWei: N(x.effectiveGasPriceWei, "anc.egp"), actualGasCostWei: N(x.actualGasCostWei, "anc.cost"),
    };
    if (x.deployedRuntimeCodeHash) { out.deployedRuntimeCodeHash = HH(x.deployedRuntimeCodeHash, "anc.rh"); out.deployedCodeSize = I(x.deployedCodeSize, "anc.sz"); }
    if (x.positionTokenId) out.positionTokenId = N(x.positionTokenId, "anc.tid");
    // deployer steps use nonces 3..15 (originalIndex+2)
    if (out.nonce !== out.originalIndex + 2) err.push("anchor nonce != originalIndex+2 @ " + out.originalIndex);
    return out;
  });
  // completed deployer range identity: anchors are DEPLOYER transactions covering exactly original steps 1-13
  const DEPLOYER0 = A(p.wallets.deployer, "dep0");
  if (!(anchors.length === 13 && anchors.every((x, i) => x.originalIndex === i + 1 && x.signer === DEPLOYER0))) err.push("completed deployer range != exactly 1-13");
  // realized gas identity: sum of anchor actual costs == bound realizedGasWei
  const realizedSum = anchors.reduce((acc, x) => acc + BigInt(x.actualGasCostWei), 0n);
  if (realizedSum !== BigInt(N(ca.realizedGasWei, "ca.rg"))) err.push("realized gas identity: sum(anchors) != realizedGasWei");

  const completedContracts = {};
  for (const slot of ALL_SLOTS) { const cc = s.completedContracts[slot]; if (!cc) { err.push("completed contract missing " + slot); continue; } completedContracts[slot] = { address: A(cc.address, "cc." + slot), runtimeCodeHash: HH(cc.runtimeCodeHash, "cch." + slot) }; }
  const dependencies = {};
  for (const name of DEP_NAMES) { const d = s.externalCodeHashes[name]; if (!d) { err.push("dep " + name); continue; } dependencies[name] = { address: A(d.address, "dep." + name), runtimeCodeHash: HH(d.runtimeCodeHash, "deph." + name), codeBytes: I(d.codeBytes, "depb." + name) }; }

  // deadline refresh identities (steps 15 + 17 only; old == bound v7 value)
  const dr = a.meta.deadlineRefresh || {};
  const expEpoch = Math.floor(Date.parse(a.meta.expiresAtUtc) / 1000);
  const newDl = N(dr.newDeadline, "dr.new"), oldDl = N(dr.oldDeadline, "dr.old");
  if (oldDl !== "1784949999") err.push("dr.oldDeadline != bound v8 deadline 1784949999");
  if (BigInt(newDl) !== BigInt(String(s.pinnedBlock.timestamp)) + 21600n) err.push("dr.newDeadline != pinned ts + 21600");
  if (Number(newDl) !== expEpoch) err.push("dr.newDeadline != packet expiry epoch");
  const drSteps = Array.isArray(dr.steps) ? dr.steps : [];
  if (drSteps.map(x => x.originalIndex).join(",") !== "15,17") err.push("dr.steps != [15,17]");
  const drCanon = drSteps.map(x => {
    const tx = a.immediateTransactions.find(t => t.originalIndex === x.originalIndex);
    if (!tx) { err.push("dr step tx missing " + x.originalIndex); return null; }
    const off = I(x.wordOffsetBytes, "dr.off");
    const word = BigInt("0x" + tx.dataOrInitCode.slice(2 + off * 2, 2 + off * 2 + 64));
    if (word.toString() !== newDl) err.push("dr: bound calldata word != new deadline @ step " + x.originalIndex);
    return { originalIndex: I(x.originalIndex, "dr.oi"), label: STR(x.label, "dr.lbl"), wordOffsetBytes: off, oldDataKeccak: HH(x.oldDataKeccak, "dr.okk"), newDataKeccak: HH(x.newDataKeccak, "dr.nkk") };
  }).filter(Boolean);

  const realizedGasWei = N(ca.realizedGasWei, "exp.rg"), remainingPrincipalWei = N(ca.remainingPrincipalWei, "exp.principal"), remainingMaxGasWei = N(ca.remainingMaxGasWei, "exp.maxgas"), aggregateWei = N(ca.aggregateWei, "exp.agg");
  if (BigInt(realizedGasWei) + BigInt(remainingPrincipalWei) + BigInt(remainingMaxGasWei) !== BigInt(aggregateWei)) err.push("recovery exposure identity: realized+principal+maxgas != aggregate");

  const object = {
    schema: STR(RECOVERY_SCHEMA, "schema", RECOVERY_SCHEMA), version: STR(RECOVERY_VERSION, "version", RECOVERY_VERSION),
    canary: BT(au.canary, "canary") && BT(p.canary, "pcanary"),
    production: (BF(au.production, "prod") === false && BF(p.production, "pprod") === false) ? false : (err.push("prod"), true),
    chainId: I(a.meta.chainId, "chain") === 4663 && p.chainId === 4663 ? 4663 : (err.push("chain"), 0),
    scope: STR(au.scope, "scope", RECOVERY_SCOPE) === RECOVERY_SCOPE ? RECOVERY_SCOPE : (err.push("scope"), ""),
    flags: { broadcastReady: BT(a.safetyFlags.broadcastReady, "f.b") && BT(p.safetyFlags.broadcastReady, "pf.b"), liveWritesApproved: BT(a.safetyFlags.liveWritesApproved, "f.l") && BT(p.safetyFlags.liveWritesApproved, "pf.l"), executionAuthorized: BT(a.safetyFlags.executionAuthorized, "f.e") && BT(p.safetyFlags.executionAuthorized, "pf.e"), fundingAuthorized: BT(a.safetyFlags.fundingAuthorized, "f.f") && BT(p.safetyFlags.fundingAuthorized, "pf.f") },
    executable: BT(a.meta.executable, "exec"),
    maxAllInclusiveExposureUsd: Number(au.maxAllInclusiveExposureUsd) === 130 ? 130 : (err.push("cap"), 0),
    generatedAtUtc: STR(a.meta.generatedAtUtc, "gen"), expiresAtUtc: STR(a.meta.expiresAtUtc, "exp"),
    validityWindowSeconds: I(a.meta.validityWindowSeconds, "vw"),
    wallets: { deployer: A(a.meta.deployer, "dep") === A(p.wallets.deployer, "pdep") ? A(a.meta.deployer, "dep") : (err.push("deployer"), ""), tester: A(a.meta.tester, "test") === TESTER ? TESTER : (err.push("tester"), "") },
    v5: { zipSha256: STR(a.meta.v5ZipSha256, "v5zip"), reviewedAuthorizationDigest: HH(a.meta.v5ReviewedAuthorizationDigest, "v5rad") },
    v6: { zipSha256: STR(a.meta.v6ZipSha256, "v6zip"), recoveryAuthorizationDigest: HH(a.meta.v6RecoveryAuthorizationDigest, "v6rad") },
    v7: { zipSha256: STR(a.meta.v7ZipSha256, "v7zip"), recoveryAuthorizationDigest: HH(a.meta.v7RecoveryAuthorizationDigest, "v7rad") },
    v8: { zipSha256: STR(a.meta.v8ZipSha256, "v8zip"), recoveryAuthorizationDigest: HH(a.meta.v8RecoveryAuthorizationDigest, "v8rad") },
    gasPolicy: {
      perStepCostMultiplier: STR(a.meta.gasPolicy.perStepCostMultiplier, "gp.mult"),
      maxPriorityCeilingWei: N(a.meta.gasPolicy.maxPriorityCeilingWei, "gp.prio") === PRIORITY_CEILING_WEI ? PRIORITY_CEILING_WEI : (err.push("gp.prio"), "0"),
      maxFeeCeilingUnchanged: BT(a.meta.gasPolicy.maxFeeCeilingUnchanged, "gp.mf"),
      gasLimitCeilingUnchanged: BT(a.meta.gasPolicy.gasLimitCeilingUnchanged, "gp.gl"),
      authorization: STR(a.meta.gasPolicy.authorization, "gp.auth"),
    },
    deadlineRefresh: { oldDeadline: oldDl, newDeadline: newDl, newDeadlineEqualsPacketExpiry: BT(dr.newDeadlineEqualsPacketExpiry, "dr.eq"), authorization: STR(dr.authorization, "dr.auth"), steps: drCanon },
    accountPolicy: STR(a.meta.accountPolicy, "acctPolicy"),
    originalPlan: { stepCount: I(a.meta.originalStepCount, "osc") === 19 ? 19 : (err.push("osc"), 0), deployerStepRange: STR("1-13", "dsr", "1-13"), testerStepRange: STR("14-19", "tsr", "14-19") },
    completedSteps: anchors,
    remaining: { count: I(a.remaining.count, "rc") === 6 ? 6 : (err.push("rc"), 0), allSignersTester: BT(a.remaining.allSignersTester, "ast"), deployerExpectedNonce: I(s.expectedNonces.deployer, "rdn") === 16 ? 16 : (err.push("rdn"), 0), testerExpectedNonce: I(s.expectedNonces.tester, "rtn") === 2 ? 2 : (err.push("rtn"), 0) },
    block: { number: N(String(s.pinnedBlock.number), "b.n") === a.meta.forkBlock ? String(s.pinnedBlock.number) : (err.push("b.n"), "0"), hash: (isHex(s.pinnedBlock.hash, 32) && s.pinnedBlock.hash.toLowerCase() === a.meta.forkBlockHash.toLowerCase()) ? s.pinnedBlock.hash.toLowerCase() : (err.push("b.h"), "0x"), timestamp: N(String(s.pinnedBlock.timestamp), "b.t") === a.meta.forkTimestamp ? String(s.pinnedBlock.timestamp) : (err.push("b.t"), "0"), baseFeePerGasWei: N(String(s.pinnedBlock.baseFeePerGasWei), "b.bf") === a.meta.forkBaseFeePerGasWei ? String(s.pinnedBlock.baseFeePerGasWei) : (err.push("b.bf"), "0"), chainId: I(a.meta.chainId, "b.c") },
    snapshotBalances: { deployerEth: N(String(s.balances.eth.deployer), "sb.de"), deployerWeth: N(String(s.balances.weth.deployer), "sb.dw"), testerEth: N(String(s.balances.eth.tester), "sb.te"), testerWeth: N(String(s.balances.weth.tester), "sb.tw") },
    completedContracts,
    positionTokenId: N(a.positionTokenId, "ptid") === N(String(s.positionTokenId), "ptid2") ? N(a.positionTokenId, "ptid") : (err.push("positionTokenId"), "0"),
    positionLiquidity: N(String(s.positionLiquidity), "pliq"),
    infrastructure: { weth: A(p.infrastructure.weth, "weth"), uniswapV3Factory: A(p.infrastructure.uniswapV3Factory, "fac"), nonfungiblePositionManager: A(p.infrastructure.nonfungiblePositionManager, "npm"), swapRouter02: A(p.infrastructure.swapRouter02, "swap"), rialtoRegistry: A(p.infrastructure.rialtoRegistry, "reg"), nvdaStockToken: A(p.infrastructure.nvdaStockToken, "nvda") },
    dependencies,
    pool: A(a.addressGuards.poolAddress, "pool"), canaryTokenSymbol: STR("BPSC-TEST", "sym", "BPSC-TEST"),
    lp: { feeTier: I(Number(p.economics.feeTier), "lp.fee"), tickSpacing: I(Number(p.economics.tickSpacing), "lp.ts"), sqrtPriceX96: N(lu.sqrtPriceX96, "lp.sq"), tick: SI(lu.poolTickAfter, "lp.tick"), tickLower: SI(lu.tickLower, "lp.tl"), tickUpper: SI(lu.tickUpper, "lp.tu"), amount0Used: N(lu.amount0Used, "lp.a0"), amount1Used: N(lu.amount1Used, "lp.a1"), amount0Min: N(lu.amount0Min, "lp.a0m"), amount1Min: N(lu.amount1Min, "lp.a1m"), poolLiquidityAfter: N(lu.poolLiquidityAfter, "lp.liq"), token0: A(lu.token0, "lp.t0"), token1: A(lu.token1, "lp.t1"), positionOwner: A(lu.positionOwner, "lp.owner"), positionFee: I(lu.positionFee, "lp.pf") },
    buy: { tradeId: N(bu.tradeId, "b.id"), trader: A(bu.trader, "b.tr"), recipient: A(bu.recipient, "b.rc"), adapter: A(bu.adapter, "b.ad"), stockBudgetRecipient: A(bu.stockBudgetRecipient, "b.sbr"), grossWethInput: N(bu.grossWethInput, "b.g"), stockBudget: N(bu.stockBudget2pct, "b.s"), burnBudget: N(bu.burnBudget1pct, "b.bn"), userWethBudget: N(bu.userWethBudget97pct, "b.u"), userBpsOutput: N(bu.userBpsOutput, "b.ub"), bpsBurned: N(bu.bpsBurned, "b.bb"), minimumUserBpsOutput: N(bu.minimumUserBpsOutput, "b.min") },
    sell: { tradeId: N(se.tradeId, "s.id"), trader: A(se.trader, "s.tr"), recipient: A(se.recipient, "s.rc"), adapter: A(se.adapter, "s.ad"), stockBudgetRecipient: A(se.stockBudgetRecipient, "s.sbr"), grossBpsInput: N(se.grossBpsInput, "s.g"), grossWethOutput: N(se.grossWethOutput, "s.gwo"), stockBudget: N(se.stockAcquisition2pct, "s.s"), burnBudget: N(se.retirementBurn2pct, "s.bn"), userWethOutput: N(se.userWethOutput96pct, "s.u"), bpsBurned: N(se.bpsBurned, "s.bb"), minimumGrossWethOutput: N(se.minimumGrossWethOutput, "s.mg"), minimumUserWethOutput: N(se.minimumUserWethOutput, "s.mu") },
    lock: { account: A(lk.account, "l.ac"), lockId: N(lk.lockId, "l.id"), principal: N(lk.principal, "l.p"), startTime: N(lk.startTime, "l.st"), duration: I(lk.duration, "l.d"), unlockTime: N(lk.unlockTime, "l.ut"), multiplierBps: I(lk.multiplierBps, "l.m"), policyVersion: I(lk.policyVersion, "l.pv") },
    transactions: { count: I(a.immediateTransactions.length, "txc") === 6 ? 6 : (err.push("txc"), 0), immediate: a.immediateTransactions.map(sigStep), delayed: { disabled: BT(true, "del") } },
    exposure: { realizedGasWei, remainingPrincipalWei, remainingMaxGasWei, aggregateWei, aggregateMicroUsd: N(ca.aggregateMicroUsd, "exp.micro") },
    provenance: { repoHead: STR(a.provenance.repoHead, "ph"), dirtyTrackedTree: a.provenance.dirtyTrackedTree === false ? false : (err.push("dirty"), true) },
    digests: { remainingExecutionDigest: HH(a.meta.remainingExecutionDigest, "red") },
    delayedWithdrawalDisabled: BT(true, "dwd"),
  };
  return { errors: err, object };
}

const RECOVERY_TOP_KEYS = ["schema", "version", "canary", "production", "chainId", "scope", "flags", "executable", "maxAllInclusiveExposureUsd", "generatedAtUtc", "expiresAtUtc", "validityWindowSeconds", "wallets", "v5", "v6", "v7", "v8", "gasPolicy", "deadlineRefresh", "accountPolicy", "originalPlan", "completedSteps", "remaining", "block", "snapshotBalances", "completedContracts", "positionTokenId", "positionLiquidity", "infrastructure", "dependencies", "pool", "canaryTokenSymbol", "lp", "buy", "sell", "lock", "transactions", "exposure", "provenance", "digests", "delayedWithdrawalDisabled"];
export function validateRecoveryStrict(loaded, rawText, getAddress) {
  const err = [];
  if (!loaded || typeof loaded !== "object") return ["not an object"];
  for (const k of Object.keys(loaded)) if (!RECOVERY_TOP_KEYS.includes(k)) err.push("unknown key " + k);
  for (const k of RECOVERY_TOP_KEYS) if (!(k in loaded)) err.push("missing key " + k);
  if (loaded.schema !== RECOVERY_SCHEMA) err.push("schema");
  if (loaded.version !== RECOVERY_VERSION) err.push("version");
  if (loaded.chainId !== 4663) err.push("chainId");
  if (loaded.maxAllInclusiveExposureUsd !== 130) err.push("cap");
  const chkAddr = (x, w) => { if (typeof x !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(x) || getAddress(x) !== x) err.push("non-canonical-address " + w); };
  const chkDec = (x, w) => { if (!isDec(x)) err.push("non-canonical-number " + w); };
  const chkHash = (x, w) => { if (typeof x !== "string" || !/^0x[0-9a-f]{64}$/.test(x)) err.push("non-canonical-hash " + w); };
  ["deployer", "tester"].forEach(k => chkAddr(loaded.wallets && loaded.wallets[k], "wallets." + k));
  if (loaded.infrastructure) for (const [k, v] of Object.entries(loaded.infrastructure)) chkAddr(v, "infra." + k);
  chkAddr(loaded.pool, "pool");
  if (Array.isArray(loaded.completedSteps)) {
    if (loaded.completedSteps.length !== 13) err.push("completedSteps != 13");
    loaded.completedSteps.forEach((x, i) => { if (x.originalIndex !== i + 1) err.push("anchor seq @ " + i); chkHash(x.txHash, "anc.hash"); chkDec(x.actualGasCostWei, "anc.cost"); if (x.nonce !== x.originalIndex + 2) err.push("anchor nonce @ " + x.originalIndex); });
  } else err.push("completedSteps missing");
  if (loaded.completedContracts) { const slots = Object.keys(loaded.completedContracts); if (slots.length !== 8) err.push("completedContracts != 8"); for (const [k, d] of Object.entries(loaded.completedContracts)) { chkAddr(d.address, "cc." + k); chkHash(d.runtimeCodeHash, "cch." + k); } }
  if (loaded.originalPlan && loaded.originalPlan.deployerStepRange !== "1-13") err.push("deployerStepRange != 1-13");
  if (Array.isArray(loaded.completedSteps) && loaded.wallets && !loaded.completedSteps.every(x => x.signer === loaded.wallets.deployer)) err.push("completed anchors not all deployer");
  if (loaded.exposure) ["realizedGasWei", "remainingPrincipalWei", "remainingMaxGasWei", "aggregateWei", "aggregateMicroUsd"].forEach(k => chkDec(loaded.exposure[k], "exposure." + k));
  if (loaded.gasPolicy && loaded.gasPolicy.maxPriorityCeilingWei !== PRIORITY_CEILING_WEI) err.push("gasPolicy.priority");
  if (loaded.deadlineRefresh) {
    const dr = loaded.deadlineRefresh;
    if (dr.oldDeadline !== "1784949999") err.push("dr.old");
    const expEpoch = Math.floor(Date.parse(loaded.expiresAtUtc) / 1000);
    if (Number(dr.newDeadline) !== expEpoch) err.push("dr.new != expiry");
    if (!Array.isArray(dr.steps) || dr.steps.map(x => x.originalIndex).join(",") !== "15,17") err.push("dr.steps");
    if (loaded.transactions && Array.isArray(dr.steps)) for (const x of dr.steps) {
      const tx = (loaded.transactions.immediate || []).find(t => t.originalIndex === x.originalIndex);
      if (!tx) { err.push("dr tx " + x.originalIndex); continue; }
      const word = BigInt("0x" + tx.data.slice(2 + x.wordOffsetBytes * 2, 2 + x.wordOffsetBytes * 2 + 64));
      if (word.toString() !== dr.newDeadline) err.push("dr word @ " + x.originalIndex);
      chkHash(x.oldDataKeccak, "dr.okk"); chkHash(x.newDataKeccak, "dr.nkk");
    }
  }
  if (loaded.transactions) {
    const im = loaded.transactions.immediate || [];
    if (loaded.transactions.count !== 6 || im.length !== 6) err.push("tx count");
    if (!im.map(t => t.originalIndex).every((v, i) => v === i + 14)) err.push("original indices not 14..19");
    if (!im.map(t => t.nonce).every((v, i) => v === i + 2)) err.push("tester nonces not 2..7");
    if (loaded.wallets) for (const t of im) if (t.signer !== loaded.wallets.tester) err.push("non-tester signable @ " + t.originalIndex);
    if (im.some(t => t.originalIndex <= 13)) err.push("completed step present in signables");
    for (const t of im) {
      chkAddr(t.signer, "tx.signer"); if (t.to !== null) chkAddr(t.to, "tx.to");
      ["value", "gasLimit", "maxFeePerGas", "maxPriorityFeePerGas"].forEach(k => chkDec(t[k], "tx." + k));
      if (t.type !== 2) err.push("tx.type"); if (t.chainId !== 4663) err.push("tx.chainId");
      ["gasLimitCeiling", "maxFeeCeilingWei", "maxPriorityCeilingWei", "reviewedMaxGasCostWei", "maxGasCostCeilingWei"].forEach(k => chkDec(t.gasCeilings[k], "gc." + k));
      if (BigInt(t.gasCeilings.reviewedMaxGasCostWei) !== BigInt(t.gasLimit) * BigInt(t.maxFeePerGas)) err.push("gc.reviewed identity @ " + t.originalIndex);
      if (BigInt(t.gasCeilings.maxGasCostCeilingWei) * 4n !== BigInt(t.gasCeilings.reviewedMaxGasCostWei) * 5n) err.push("gc.1.25x identity @ " + t.originalIndex);
      if (t.gasCeilings.maxFeeCeilingWei !== t.maxFeePerGas) err.push("gc.maxFee unchanged @ " + t.originalIndex);
      if (t.gasCeilings.maxPriorityCeilingWei !== PRIORITY_CEILING_WEI) err.push("gc.priority @ " + t.originalIndex);
      if (BigInt(t.gasCeilings.gasLimitCeiling) !== BigInt(t.gasLimit) * 2n) err.push("gc.gasLimit 2x @ " + t.originalIndex);
    }
  }
  return err;
}
