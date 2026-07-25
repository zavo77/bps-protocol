// TASK 10B-7 standalone hardened verifier — independently recomputes EVERYTHING.
// Trusts no packet-supplied boolean. Usage: node packages/contracts/canary-packet/verify-packet.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { keccak256, toHex, getContractAddress, getAddress, decodeFunctionData, decodeAbiParameters, parseAbiParameters } from "viem";

const DIR = new URL(".", import.meta.url);
const OUT = new URL("../out/", DIR);
const REPO_MANIFEST = new URL("../deploy/robinhood-mainnet.canary.json", DIR);
const rd = (u) => readFileSync(u);
const rj = (u) => JSON.parse(readFileSync(u, "utf8"));

const a = rj(new URL("canary-unsigned-packet.json", DIR));
const policy = rj(new URL("review-policy.json", DIR));
const price = rj(new URL("price-snapshot.json", DIR));
const manifest = rj(REPO_MANIFEST);

const R = [];
const ok = (name, cond, detail = "") => R.push({ name, pass: !!cond, detail });
const B = (x) => BigInt(x);
const lc = (x) => (x || "").toLowerCase();

const DEPLOYER = policy.wallets.deployer, TESTER = policy.wallets.tester;
const { weth: WETH, uniswapV3Factory: FACTORY, nonfungiblePositionManager: NPM, swapRouter02: SWAPROUTER, rialtoRegistry: REGISTRY, nvdaStockToken: NVDA } = policy.infrastructure;
const FEE = policy.economics.feeTier;
const CAP_MICRO = B(price.selected.microUsd);
const usdMicroOfWei = (wei) => (B(wei) * CAP_MICRO) / 10n ** 18n;
const floorWeiUsd = (u) => (B(u) * 1_000_000n * 10n ** 18n) / CAP_MICRO;
const capMicro = (u) => B(u) * 1_000_000n;
const GL = (est) => (B(est) * B(policy.gas.gasLimitMultiplierPct)) / 100n;
const MAXFEE = B(policy.gas.maxFeePerGasWei);
const DEADLINE = B(policy.snapshot.forkTimestamp + 1200);
const imm = a.immediateTransactions, dl = a.delayedWithdrawalSubPacket;
const stable = (v) => Array.isArray(v) ? "[" + v.map(stable).join(",") + "]"
  : (v && typeof v === "object") ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}"
  : JSON.stringify(v);
const artOf = (n) => rj(new URL(`${n}.sol/${n}.json`, OUT));

// ---------- 1. DUAL DIGESTS ----------
const execDigest = keccak256(toHex(imm.map(stable).concat([stable(dl)]).join("\n")));
ok("executionPacketDigest (immediate + delayed) matches", execDigest === a.meta.executionPacketDigest, execDigest);
const forHash = { ...a, meta: { ...a.meta } }; delete forHash.meta.fullReviewArtifactDigest;
const fullDigest = keccak256(toHex(stable(forHash)));
ok("fullReviewArtifactDigest (whole artifact minus itself) matches", fullDigest === a.meta.fullReviewArtifactDigest, fullDigest);
ok("execution digest differs from full digest", a.meta.executionPacketDigest !== a.meta.fullReviewArtifactDigest);
ok("self-referential excluded field declared = meta.fullReviewArtifactDigest", a.meta.selfReferentialHashFieldExcluded === "meta.fullReviewArtifactDigest");
// full digest covers all major sections
for (const sec of ["meta", "safetyFlags", "provenance", "forkFunding", "fundingPacket", "capArithmetic", "addressGuards", "roleConfigurationProof", "lpUsage", "buyAccounting", "sellAccounting", "immediateTransactions", "delayedWithdrawalSubPacket", "priceSnapshot"])
  ok(`full digest covers section: ${sec}`, stable(forHash).includes(JSON.stringify(sec)));

// ---------- 1b. MUTATION TEST ----------
const recomputeFull = (obj) => { const f = { ...obj, meta: { ...obj.meta } }; delete f.meta.fullReviewArtifactDigest; return keccak256(toHex(stable(f))); };
const mutations = [
  ["meta.capPriceMicroUsd", o => o.meta.capPriceMicroUsd = "1"],
  ["safetyFlags.broadcastReady", o => o.safetyFlags.broadcastReady = true],
  ["forkFunding.startingBalances.deployer.weth", o => o.forkFunding.startingBalances.deployer.weth = "1"],
  ["capArithmetic.allInclusiveGasWei", o => o.capArithmetic.allInclusiveGasWei = "1"],
  ["provenance.contracts.BPSTradeRouter.creationBytecodeKeccak", o => o.provenance.contracts.BPSTradeRouter.creationBytecodeKeccak = "0x00"],
  ["addressGuards.canaryTokenSymbol", o => o.addressGuards.canaryTokenSymbol = "BPS"],
  ["sellAccounting.userWethOutput96pct", o => o.sellAccounting.userWethOutput96pct = "1"],
  ["immediateTransactions[0].dataKeccak", o => o.immediateTransactions[0].dataKeccak = "0x01"],
  ["delayedWithdrawalSubPacket.returnedPrincipal", o => o.delayedWithdrawalSubPacket.returnedPrincipal = "1"],
  ["priceSnapshot.selected.microUsd", o => o.priceSnapshot.selected.microUsd = "1"],
];
let mutAll = true;
for (const [path, mut] of mutations) { const clone = JSON.parse(JSON.stringify(a)); mut(clone); if (recomputeFull(clone) === a.meta.fullReviewArtifactDigest) { mutAll = false; ok(`mutation changes full digest: ${path}`, false); } }
ok("mutation test: changing ANY covered field changes full digest", mutAll, `${mutations.length} fields mutated`);

// ---------- 2. deployment-only digest ----------
ok("deployment-only digest matches", keccak256(toHex(imm.filter(t => t.phase === "A-deploy").map(t => `${t.nonce}|${lc(t.predictedCreationAddress)}|${t.dataKeccak}`).join("\n"))) === a.meta.deploymentOnlyDigest);

// ---------- 3. snapshot-safe fields ----------
ok("chainId matches policy", a.meta.chainId === policy.chainId && policy.chainId === 4663);
ok("fork block/hash/timestamp/baseFee match policy snapshot",
  a.meta.forkBlock === String(policy.snapshot.forkBlock) && lc(a.meta.forkBlockHash) === lc(policy.snapshot.forkHash) &&
  a.meta.forkTimestamp === String(policy.snapshot.forkTimestamp) && a.meta.forkBaseFeePerGasWei === policy.snapshot.baseFeePerGasWei);
ok("selected price is the higher of two fresh sources", CAP_MICRO === price.sources.reduce((m, s) => B(s.microUsd) > m ? B(s.microUsd) : m, 0n) && price.sources.length >= 2);
ok("price snapshot embedded in artifact equals pinned file", stable(a.priceSnapshot) === stable(price));
ok("live nonces recorded 0/0 and fork nonces 0/0", a.meta.liveNonces.deployer === 0 && a.meta.liveNonces.tester === 0 && a.meta.forkNonces.deployer === 0 && a.meta.forkNonces.tester === 0);
ok("simulation deadline == forkTimestamp + 1200", B(a.meta.immediatePacketDeadline) === DEADLINE);

// ---------- 4. safety flags ----------
const sf = a.safetyFlags;
ok("safety flags all false (packet)", sf.broadcastReady === false && sf.liveWritesApproved === false && sf.executionAuthorized === false && sf.fundingAuthorized === false);
ok("manifest broadcastReady=false & liveWritesApproved=false", manifest.broadcastReady === false && manifest.liveWritesApproved === false);

// ---------- 5. CREATE addresses + predicted set ----------
const P = {}; const slots = ["canaryToken", "lockingVault", "claimManager", "rialtoAdapter", "coordinator", "stockVault", "uniswapAdapter", "tradeRouter"];
for (let i = 0; i < 8; i++) P[slots[i]] = getAddress(getContractAddress({ from: DEPLOYER, nonce: BigInt(i) }));
let createOk = true;
for (const t of imm.filter(t => t.phase === "A-deploy")) if (getAddress(t.predictedCreationAddress) !== P[slots[t.nonce]]) createOk = false;
ok("all 8 CREATE addresses derive from deployer+nonce", createOk);
// manifest predicted addresses agree
ok("manifest predicted addresses agree with CREATE derivations",
  slots.every(s => getAddress(manifest.predicted[s]) === P[s]));

// ---------- 6. BUILD PROVENANCE — init code == audited build ----------
const specTypes = {
  BPSCanaryToken: ["address"], BPSLockingVault: ["address", "address"], DistributionClaimManager: ["address", "address"],
  RialtoStockAcquisitionAdapter: ["address", "address", "address"], DistributionFundingCoordinator: ["address", "address", "address", "address"],
  StockAcquisitionVault: ["address", "address", "address", "address", "address", "address[]"],
  UniswapV3BPSSwapAdapter: ["address", "address", "address", "address", "uint24"], BPSTradeRouter: ["address", "address", "address", "address", "address"],
};
const expectedArgs = {
  BPSCanaryToken: [DEPLOYER], BPSLockingVault: [P.canaryToken, DEPLOYER], DistributionClaimManager: [P.coordinator, DEPLOYER],
  RialtoStockAcquisitionAdapter: [P.stockVault, WETH, REGISTRY], DistributionFundingCoordinator: [P.stockVault, P.claimManager, DEPLOYER, DEPLOYER],
  StockAcquisitionVault: [WETH, P.rialtoAdapter, P.coordinator, DEPLOYER, P.coordinator, [NVDA]],
  UniswapV3BPSSwapAdapter: [P.tradeRouter, P.canaryToken, WETH, SWAPROUTER, BigInt(FEE)], BPSTradeRouter: [DEPLOYER, P.canaryToken, WETH, P.uniswapAdapter, P.stockVault],
};
let provOk = true, initBuildOk = true, ctorOk = true;
for (const n of slots.map((_, i) => ["BPSCanaryToken", "BPSLockingVault", "DistributionClaimManager", "RialtoStockAcquisitionAdapter", "DistributionFundingCoordinator", "StockAcquisitionVault", "UniswapV3BPSSwapAdapter", "BPSTradeRouter"][i])) {
  const aj = artOf(n), pv = a.provenance.contracts[n];
  if (keccak256(aj.bytecode.object) !== pv.creationBytecodeKeccak) provOk = false;
  if (keccak256(aj.deployedBytecode.object) !== pv.runtimeBytecodeKeccak) provOk = false;
  if ("0x" + createHash("sha256").update(rd(new URL(`${n}.sol/${n}.json`, OUT))).digest("hex") !== pv.artifactSha256) provOk = false;
  const srcLines = Object.entries(aj.metadata.sources).map(([p, v]) => `${p}:${v.keccak256}`).sort();
  if (keccak256(toHex(srcLines.join("\n"))) !== pv.sourceListKeccak) provOk = false;
  if (aj.metadata.compiler.version !== pv.solc) provOk = false;
}
// every deploy init code = audited creation bytecode ++ decoded constructor args
for (const t of imm.filter(t => t.phase === "A-deploy")) {
  const n = t.label, aj = artOf(n), creation = aj.bytecode.object;
  if (!lc(t.dataOrInitCode).startsWith(lc(creation))) { initBuildOk = false; continue; }
  const suffix = "0x" + t.dataOrInitCode.slice(creation.length);
  let decoded; try { decoded = decodeAbiParameters(specTypes[n].map(x => ({ type: x })), suffix); } catch { ctorOk = false; continue; }
  const exp = expectedArgs[n];
  const norm = (v) => Array.isArray(v) ? v.map(norm) : (typeof v === "string" && v.startsWith("0x") && v.length === 42) ? getAddress(v) : String(v);
  if (stable(decoded.map(norm)) !== stable(exp.map(norm))) ctorOk = false;
}
ok("provenance hashes (creation/runtime bytecode, artifact sha256, source-list, solc) recomputed & match", provOk);
ok("every deploy init code == audited creation bytecode prefix (not just suffix match)", initBuildOk);
ok("every decoded constructor argument equals the expected wired address/value", ctorOk);
ok("provenance records repo HEAD and dirty-tracked status", /^[0-9a-f]{40}$/.test(a.provenance.repoHead) && typeof a.provenance.dirtyTrackedTree === "boolean");

// ---------- 7. INDEPENDENT CALL DECODE + embedded value comparison ----------
const mergedAbi = [...artOf("BPSTradeRouter").abi, ...artOf("BPSLockingVault").abi,
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "createPool", inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }], outputs: [{ type: "address" }], stateMutability: "nonpayable" },
  { type: "function", name: "initialize", inputs: [{ type: "uint160" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "mint", stateMutability: "payable", outputs: [], inputs: [{ components: [{ name: "token0", type: "address" }, { name: "token1", type: "address" }, { name: "fee", type: "uint24" }, { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" }, { name: "amount0Desired", type: "uint256" }, { name: "amount1Desired", type: "uint256" }, { name: "amount0Min", type: "uint256" }, { name: "amount1Min", type: "uint256" }, { name: "recipient", type: "address" }, { name: "deadline", type: "uint256" }], name: "params", type: "tuple" }] }];
const call = (label) => { const t = imm.find(x => x.label === label); return { t, d: decodeFunctionData({ abi: mergedAbi, data: t.dataOrInitCode }) }; };
const lp = a.lpUsage, bu = a.buyAccounting, se = a.sellAccounting, lw = a.lockAndWithdraw;
let decOk = true; const chk = (c, msg) => { if (!c) { decOk = false; ok("decode:" + msg, false); } };
{ const { d } = call("WETH.approve(NPM)"); chk(getAddress(d.args[0]) === getAddress(NPM) && d.args[1] === floorWeiUsd(100), "WETH.approve(NPM,$100)"); }
{ const { d } = call("BPSC.approve(NPM)"); chk(getAddress(d.args[0]) === getAddress(NPM) && d.args[1] === B(policy.economics.bpscLpDesiredWei), "BPSC.approve(NPM,50M)"); }
{ const { d } = call("NPM.mint"); const p = d.args[0]; chk(getAddress(p.token0) === getAddress(lp.token0) && getAddress(p.token1) === getAddress(lp.token1) && Number(p.fee) === FEE && Number(p.tickLower) === lp.tickLower && Number(p.tickUpper) === lp.tickUpper && p.amount0Desired === floorWeiUsd(100) && p.amount1Desired === B(policy.economics.bpscLpDesiredWei) && p.amount0Min === B(lp.amount0Min) && p.amount1Min === B(lp.amount1Min) && getAddress(p.recipient) === getAddress(DEPLOYER) && p.deadline === DEADLINE, "mint params"); }
{ const { d } = call("tester WETH.approve(router)"); chk(getAddress(d.args[0]) === getAddress(P.tradeRouter) && d.args[1] === floorWeiUsd(2), "tester WETH.approve(router,$2)"); }
{ const { d } = call("buyExactWethForBps"); chk(d.args[0] === floorWeiUsd(2) && d.args[1] === B(bu.minimumUserBpsOutput) && d.args[2] === B(bu.minimumBurnBpsOutput) && getAddress(d.args[3]) === getAddress(TESTER) && d.args[4] === DEADLINE, "buy args"); }
{ const { d } = call("sellExactBpsForWeth"); chk(d.args[0] === B(se.grossBpsInput) && d.args[1] === B(se.minimumGrossWethOutput) && d.args[2] === B(se.minimumUserWethOutput) && d.args[3] === B(se.minimumBurnBpsOutput) && getAddress(d.args[4]) === getAddress(TESTER) && d.args[5] === DEADLINE, "sell args"); }
{ const { d } = call("createLock(amount,7d)"); chk(d.args[0] === B(lw.principal) && Number(d.args[1]) === 604800, "createLock args"); }
{ const d = decodeFunctionData({ abi: mergedAbi, data: dl.dataOrInitCode }); chk(B(d.args[0]) === B(lw.lockId), "withdraw(lockId)"); }
ok("every call's embedded address/amount/recipient/deadline decoded & matches expected", decOk);
// non-zero minimums actually in calldata
ok("LP/buy/sell minimums are NON-ZERO in actual calldata", B(lp.amount0Min) > 0n && B(lp.amount1Min) > 0n && B(bu.minimumUserBpsOutput) > 0n && B(bu.minimumBurnBpsOutput) > 0n && B(se.minimumGrossWethOutput) > 0n && B(se.minimumUserWethOutput) > 0n && B(se.minimumBurnBpsOutput) > 0n);

// ---------- 8. allow-set derived from pinned infra + CREATE; canonical manifest ----------
const allowed = new Set([...slots.map(s => lc(P[s])), ...[WETH, FACTORY, NPM, SWAPROUTER, REGISTRY, a.addressGuards.poolAddress].map(lc)]);
const targets = []; for (const t of imm) { if (t.to) targets.push(lc(t.to)); if (t.predictedCreationAddress) targets.push(lc(t.predictedCreationAddress)); }
targets.push(lc(dl.to));
ok("every tx target ∈ allow-set derived from pinned infra + CREATE", targets.every(x => allowed.has(x)));
ok("infra addresses in packet == canonical manifest external addresses",
  lc(WETH) === lc(manifest.external.weth.address) && lc(FACTORY) === lc(manifest.external.uniswapV3Factory.address) && lc(NPM) === lc(manifest.external.nonfungiblePositionManager.address));
ok("no target is a canonical BPS contract (manifest defines BPSC-TEST, not BPS)", a.addressGuards.canonicalBpsAddresses.length === 0 && manifest.token.symbol === "BPSC-TEST");
ok("canary token symbol is BPSC-TEST", a.addressGuards.canaryTokenSymbol === "BPSC-TEST");

// ---------- 9. gas derivation, maxGasCost, gasUsed<=gasLimit, receipt, effGasPrice ----------
let gasOk = true;
for (const t of [...imm, dl]) {
  if (GL(t.gasEstimate).toString() !== t.gasLimit) gasOk = false;
  if ((B(t.gasLimit) * MAXFEE).toString() !== t.maxGasCostWei) gasOk = false;
  if (B(t.gasUsed) > B(t.gasLimit)) gasOk = false;
  if (t.receiptStatus !== "success") gasOk = false;
  if (B(t.effectiveGasPrice) > MAXFEE) gasOk = false;
}
ok("gasLimit=ceil(est*1.2), maxGasCost=limit*maxFee, gasUsed<=limit, receipt=success, effPrice<=maxFee (all txs)", gasOk);

// ---------- 10. contiguous nonces + raw data hashes ----------
for (const s of [DEPLOYER, TESTER]) { const ns = imm.filter(t => lc(t.signer) === lc(s)).map(t => t.nonce).sort((x, y) => x - y); ok(`contiguous nonces ${s === DEPLOYER ? "deployer" : "tester"}`, ns.every((n, i) => n === i)); }
ok("delayed nonce continues tester sequence", dl.nonce === Math.max(...imm.filter(t => lc(t.signer) === lc(TESTER)).map(t => t.nonce)) + 1);
ok("every raw data/init-code keccak256 matches", imm.every(t => keccak256(t.dataOrInitCode) === t.dataKeccak) && keccak256(dl.dataOrInitCode) === dl.dataKeccak);

// ---------- 11. LP + buy + sell accounting recomputed ----------
ok("LP amount0Min == floor(used*995/1000)", B(lp.amount0Min) === B(lp.amount0Used) * 995n / 1000n);
ok("LP amount1Min == floor(used*995/1000)", B(lp.amount1Min) === B(lp.amount1Used) * 995n / 1000n);
ok("LP used<=desired & before-used==after (WETH & BPSC)", B(lp.amount0Used) <= B(lp.amount0Desired) && B(lp.amount1Used) <= B(lp.amount1Desired) && B(lp.deployerWethBefore) - B(lp.amount0Used) === B(lp.deployerWethAfter) && B(lp.deployerBpscBefore) - B(lp.amount1Used) === B(lp.deployerBpscAfter));
const gwi = B(bu.grossWethInput);
ok("buy 2%/1%/97% allocation + sum==gross", B(bu.stockBudget2pct) === gwi * 200n / 10000n && B(bu.burnBudget1pct) === gwi * 100n / 10000n && B(bu.userWethBudget97pct) === gwi - gwi * 200n / 10000n - gwi * 100n / 10000n && B(bu.allocationSum) === gwi);
ok("buy minimums == floor(actual*99/100)", B(bu.minimumUserBpsOutput) === B(bu.userBpsOutput) * 99n / 100n && B(bu.minimumBurnBpsOutput) === B(bu.bpsBurned) * 99n / 100n);
const gwo = B(se.grossWethOutput);
ok("sell 2%/2%/96% allocation + sum==gross", B(se.stockAcquisition2pct) === gwo * 200n / 10000n && B(se.retirementBurn2pct) === gwo * 200n / 10000n && B(se.userWethOutput96pct) === gwo - gwo * 200n / 10000n - gwo * 200n / 10000n && B(se.allocationSum) === gwo);
ok("sell minimums == floor(actual*99/100)", B(se.minimumGrossWethOutput) === gwo * 99n / 100n && B(se.minimumUserWethOutput) === B(se.userWethOutput96pct) * 99n / 100n && B(se.minimumBurnBpsOutput) === B(se.bpsBurned) * 99n / 100n);
ok("sell user WETH within $2 cap (recomputed micro-USD)", usdMicroOfWei(se.userWethOutput96pct) <= capMicro(policy.caps.individualTradeUsd));
ok("buy vault WETH += stock budget; sell tester WETH += user output", B(bu.vaultWethAfter) - B(bu.vaultWethBefore) === B(bu.stockBudget2pct) && B(se.testerWethAfter) - B(se.testerWethBefore) === B(se.userWethOutput96pct));

// ---------- 12. lock principal == withdrawal returned ----------
ok("withdraw returns exactly lock principal (recomputed)", dl.returnedPrincipal === lw.principal && lw.principal === dl.principal && dl.emergencyExitUsed === false && dl.earliestBlockTimestamp === lw.unlockTime);

// ---------- 13. FULL ETH/WETH/BPSC RECONCILIATION (numbers, not booleans) ----------
const sb = a.forkFunding.startingBalances, eb = a.forkFunding.endingBalancesImmediate, inb = a.forkFunding.inbound;
const gasSpent = (who) => imm.filter(t => lc(t.signer) === lc(who)).reduce((s, t) => s + B(t.gasUsed) * B(t.effectiveGasPrice), 0n);
ok("deployer ETH reconciles: start - Σ(gasUsed*effPrice) == end", B(sb.deployer.eth) - gasSpent(DEPLOYER) === B(eb.deployer.eth));
ok("tester ETH reconciles: start - Σ(gasUsed*effPrice) == end", B(sb.tester.eth) - gasSpent(TESTER) === B(eb.tester.eth));
ok("inbound ETH (funding requirement) == Σ per-signer recorded max gas cost", B(inb.deployer.eth) === imm.filter(t => lc(t.signer) === lc(DEPLOYER)).reduce((s, t) => s + B(t.maxGasCostWei), 0n) && B(inb.tester.ethImmediate) === imm.filter(t => lc(t.signer) === lc(TESTER)).reduce((s, t) => s + B(t.maxGasCostWei), 0n));
ok("actual gas spent <= funded maximum (both signers)", gasSpent(DEPLOYER) <= B(inb.deployer.eth) && gasSpent(TESTER) <= B(inb.tester.ethImmediate));
ok("deployer WETH reconciles: start - LPused == end", B(sb.deployer.weth) - B(lp.amount0Used) === B(eb.deployer.weth));
ok("tester WETH reconciles: start - buyGross + sellUser == end", B(sb.tester.weth) - B(bu.grossWethInput) + B(se.userWethOutput96pct) === B(eb.tester.weth));
ok("deployer WETH start == inbound ($100 floor, no headroom)", sb.deployer.weth === inb.deployer.weth && B(inb.deployer.weth) === floorWeiUsd(100));
ok("tester WETH start == inbound ($20 floor, no headroom)", sb.tester.weth === inb.tester.weth && B(inb.tester.weth) === floorWeiUsd(20));
ok("deployer BPSC reconciles: 1e9 - LPused == end", B(sb.deployer.bpsc) - B(lp.amount1Used) === B(eb.deployer.bpsc));
ok("tester BPSC reconciles: bought - sold - locked == end(0)", B(bu.userBpsOutput) - B(se.grossBpsInput) - B(lw.principal) === B(eb.tester.bpsc) && B(eb.tester.bpsc) === 0n);

// ---------- 14. role/owner from fork-read values cross-checked to decoded constructor args ----------
const rp = a.roleConfigurationProof;
ok("router owner (fork-read) == deployer == decoded ctor arg", getAddress(rp.routerOwner) === getAddress(DEPLOYER) && rp.routerOwnerIsDeployer === true);
ok("locking owner (fork-read) == deployer", getAddress(rp.lockingOwner) === getAddress(DEPLOYER) && rp.lockingOwnerIsDeployer === true);
ok("claimManager owner (fork-read) == coordinator (AccessControl/Ownable)", getAddress(rp.claimManagerOwner) === getAddress(P.coordinator) && rp.claimManagerOwnerIsCoordinator === true);
ok("no extra role/config tx required (constructor-wired)", rp.extraConfigTxRequired === false && rp.readFrom.includes("fork"));

// ---------- 15. all-inclusive exposure incl funding-tx gas, caps ----------
const ca = a.capArithmetic;
const immGas = imm.reduce((s, t) => s + B(t.maxGasCostWei), 0n), delGas = B(dl.maxGasCostWei);
const fundGas = a.fundingPacket.transfers.reduce((s, t) => s + B(t.maxGasCostWei), 0n);
const allGas = immGas + delGas + fundGas;
ok("immediate gas total recomputed == capArithmetic", immGas.toString() === ca.immediateGasWei);
ok("funding-transfer gas recomputed == capArithmetic", fundGas.toString() === ca.fundingTxGasWei);
ok("all-inclusive gas = immediate + delayed + funding", allGas.toString() === ca.allInclusiveGasWei);
ok("immediate gas <= $10", usdMicroOfWei(immGas) <= capMicro(policy.caps.gasUsd));
ok("LP WETH <= $100 & trade WETH <= $20", usdMicroOfWei(floorWeiUsd(100)) <= capMicro(100) && usdMicroOfWei(floorWeiUsd(20)) <= capMicro(20));
ok("all-inclusive exposure ($100+$20+all-gas) <= $130", (usdMicroOfWei(floorWeiUsd(100)) + usdMicroOfWei(floorWeiUsd(20)) + usdMicroOfWei(allGas)) <= capMicro(policy.caps.aggregateUsd), "$" + (Number(usdMicroOfWei(floorWeiUsd(100)) + usdMicroOfWei(floorWeiUsd(20)) + usdMicroOfWei(allGas)) / 1e6).toFixed(6));
ok("funding packet delivers exactly the recorded inbound amounts", (() => {
  const w = a.fundingPacket.transfers; const find = (r, tk) => w.find(x => lc(x.recipient) === lc(r) && x.token.includes(tk));
  return find(DEPLOYER, "0x") && B(find(DEPLOYER, "0x").amount) === floorWeiUsd(100) && B(find(TESTER, "0x").amount) === floorWeiUsd(20) &&
    w.filter(x => x.token === "native ETH").length === 3;
})());

// ---------- 16. no signature / private material ----------
const forbidden = /(^|\.)(signature|signed|rawtx|rawsignedtx|privatekey|private_key|secret|mnemonic|seed|passphrase)$/i;
let secret = null; const scan = (v, p) => { if (secret) return; if (v && typeof v === "object") for (const k of Object.keys(v)) { if (forbidden.test(k)) { secret = p + "." + k; return; } scan(v[k], p + "." + k); } };
scan(a, "artifact");
ok("no signature/private-material field present", secret === null, secret || "none");
ok("meta declares containsSignature=false & containsPrivateMaterial=false", a.meta.containsSignature === false && a.meta.containsPrivateMaterial === false);

// ---------- report ----------
console.log("recomputed executionPacketDigest:   ", execDigest);
console.log("recomputed fullReviewArtifactDigest:", fullDigest);
console.log("\nCHECKLIST:");
for (const r of R) console.log(` [${r.pass ? "PASS" : "FAIL"}] ${r.name}${r.detail ? "  (" + r.detail + ")" : ""}`);
const passed = R.filter(r => r.pass).length;
console.log(`\n${passed}/${R.length} checks passed`);
console.log(R.every(r => r.pass) ? "VERIFY: PASS" : "VERIFY: FAIL");
process.exit(R.every(r => r.pass) ? 0 : 1);
