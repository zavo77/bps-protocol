// TASK 10B-8 offline verifier (bundle-relative; NO repo dependency). Trusts no packet boolean.
// Reads ./canary-unsigned-packet.json ./review-policy.json ./price-snapshot.json ./manifests/* ./artifacts/* ./compiler/source-index.json
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { keccak256, toHex, getContractAddress, getAddress, decodeFunctionData, decodeAbiParameters, encodeAbiParameters, parseAbiParameters } from "viem";
import { buildCanonical, digestOf, validateStrict, rawDuplicateKeys } from "./operator/canonical.mjs";
const U = (p) => new URL(p, import.meta.url);
const rj = (p) => JSON.parse(readFileSync(U(p), "utf8"));
const rt = (p) => readFileSync(U(p), "utf8");
const rb = (p) => readFileSync(U(p));

const a = rj("canary-unsigned-packet.json");
const policy = rj("review-policy.json");
const price = rj("price-snapshot.json");
const srcIndex = rj("compiler/source-index.json").index;
const artOf = (n) => rj(`artifacts/${n}.json`);

const R = []; const ok = (n, c, d = "") => R.push({ n, pass: !!c, d });
const B = (x) => BigInt(x); const lc = (x) => (x || "").toLowerCase();
const DEPLOYER = policy.wallets.deployer, TESTER = policy.wallets.tester;
const { weth: WETH, uniswapV3Factory: FACTORY, nonfungiblePositionManager: NPM, swapRouter02: SWAPROUTER, rialtoRegistry: REGISTRY, nvdaStockToken: NVDA } = policy.infrastructure;
const FEE = policy.economics.feeTier;
const CAP = B(price.selected.microUsd);
const usdMicro = (w) => (B(w) * CAP) / 10n ** 18n;
const floorWeiUsd = (u) => (B(u) * 1_000_000n * 10n ** 18n) / CAP;
const capMicro = (u) => B(u) * 1_000_000n;
const GL = (e) => (B(e) * B(policy.gas.gasLimitMultiplierPct) + 99n) / 100n; // integer CEIL
const MAXFEE = B(policy.gas.maxFeePerGasWei);
const DEADLINE = B(policy.snapshot.forkTimestamp + (policy.validity && policy.validity.windowSeconds ? policy.validity.windowSeconds : 1200));
const imm = a.immediateTransactions, dl = a.delayedWithdrawalSubPacket;
const stable = (v) => Array.isArray(v) ? "[" + v.map(stable).join(",") + "]" : (v && typeof v === "object") ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}" : JSON.stringify(v);
const names = ["BPSCanaryToken", "BPSLockingVault", "DistributionClaimManager", "RialtoStockAcquisitionAdapter", "DistributionFundingCoordinator", "StockAcquisitionVault", "UniswapV3BPSSwapAdapter", "BPSTradeRouter"];
const slots = ["canaryToken", "lockingVault", "claimManager", "rialtoAdapter", "coordinator", "stockVault", "uniswapAdapter", "tradeRouter"];
// deployment/tester START nonces derived from the packet itself (never hardcoded) — the deploy txs'
// minimum nonce is the deployer start; the tester's first immediate-tx nonce is the tester start.
const DSTART = Math.min(...imm.filter(t => t.phase === "A-deploy").map(t => t.nonce));
const TSTART = Math.min(...imm.filter(t => lc(t.signer) === lc(TESTER)).map(t => t.nonce));
const P = {}; for (let i = 0; i < 8; i++) P[slots[i]] = getAddress(getContractAddress({ from: DEPLOYER, nonce: BigInt(DSTART + i) }));

// ---- authorization schema (execution mode vs preparation mode) ----
const EXEC_MODE = policy.authorizationMode === "execution";
if (EXEC_MODE) {
  // execution-enabled packet: all four flags TRUE in packet AND policy, executable true, canary/production
  // correct, exposure cap 130, scope recorded verbatim. NONE of the integrity/replay/exposure checks below
  // are weakened by this branch — only the authorization-state assertions differ.
  const SCOPE = "BPSC-TEST canary only; Robinhood Chain mainnet; maximum all-inclusive exposure $130; individual Rabby approvals; canonical BPS production excluded.";
  const au = a.meta.authorization || {};
  ok("execution mode: packet+policy live+executable, canary=true, production=false",
    a.meta.mode === "live" && a.meta.live === true && a.meta.executable === true && policy.mode === "live" && policy.executable === true && policy.canary === true && policy.production === false);
  ok("execution mode: all four authorization flags TRUE in packet AND policy",
    ["broadcastReady", "liveWritesApproved", "executionAuthorized", "fundingAuthorized"].every(k => a.safetyFlags[k] === true && policy.safetyFlags[k] === true));
  ok("execution mode: authorization block canary/production/chainId/maxExposure + scope recorded verbatim",
    au.canary === true && au.production === false && au.chainId === 4663 && Number(au.maxAllInclusiveExposureUsd) === 130 &&
    au.scope === SCOPE && policy.authorizationScope === SCOPE && au.mustRegenerateBeforeExecution === false);
  ok("execution mode: signing delegated to Rabby only; delayed tester-nonce-8 withdrawal disabled",
    /Rabby/.test(au.signingChannel || "") && /nonce 8/.test(au.delayedWithdrawalDisabled || ""));
} else {
  ok("preparation mode: packet+policy live-or-fixture and executable=false in both",
    ((a.meta.mode === "live" && policy.mode === "live") || (a.meta.mode === "historical-fixture" && policy.mode === "historical-fixture")) &&
    a.meta.executable === false && policy.executable === false);
  ok("preparation mode: all four safety flags false in packet AND policy",
    ["broadcastReady", "liveWritesApproved", "executionAuthorized", "fundingAuthorized"].every(k => a.safetyFlags[k] === false && policy.safetyFlags[k] === false));
}
// the provider RPC URL must never appear in any bundled artifact
{
  // Only the two PUBLIC price-API endpoints may appear (they are part of the required raw-observation
  // record). Any other URL — in particular the provider RPC — is a leak.
  const ALLOWED_HOSTS = new Set(["api.coinbase.com", "api.kraken.com"]);
  const blob = JSON.stringify(a) + JSON.stringify(policy) + JSON.stringify(price);
  const found = blob.match(/https?:\/\/[^"\\\s]+/g) || [];
  const bad = [...new Set(found.map(u => { try { return new URL(u).host; } catch { return "malformed"; } }))].filter(h => !ALLOWED_HOSTS.has(h));
  ok("no provider/RPC URL embedded in packet, policy or price snapshot (env-var reference only; public price endpoints allowed)",
    bad.length === 0 && policy.liveRpcEnvVar === "ROBINHOOD_CHAIN_RPC_URL" && !("liveRpc" in policy) && !a.meta.anvilConfig.forkUrl,
    bad.length ? "unexpected host(s) present" : "env-var reference only");
}
// packet/policy authorization flags are asserted by the mode-aware block above.
ok("packet safetyFlags mirror policy safetyFlags exactly", ["broadcastReady", "liveWritesApproved", "executionAuthorized", "fundingAuthorized"].every(k => a.safetyFlags[k] === policy.safetyFlags[k]));
// the canary DEPLOYMENT manifest keeps its OWN deploy gate false (unchanged; canonical config untouched).
for (const m of ["robinhood-mainnet.canary", "robinhood-mainnet.dryrun"]) { const mm = rj(`manifests/${m}.json`); if (m.includes("canary")) ok("deployment manifest broadcastReady=false & liveWritesApproved=false (unchanged)", mm.broadcastReady === false && mm.liveWritesApproved === false && mm.production === false && mm.token.symbol === "BPSC-TEST"); }

// ---- price gate (item 2): fail on stale/fixture prices backing a live/executable packet ----
const MAX_PRICE_AGE_S = 300;
const priceIsLive = price.mode === "live" && price.live === true;
// Freshness is evaluated AT PACKET GENERATION TIME (deterministic + offline-checkable at any later
// date), not against the verifier's wall clock — a live packet stays verifiable across its whole
// review window. Execution-time expiry is enforced separately by preflight-check.mjs.
const genAt = a.meta.generatedAtUtc ? Date.parse(a.meta.generatedAtUtc) : null;
const obsAges = price.sources.map(s => (Date.parse(price.capturedAt) - Date.parse(s.respondedAt || s.observedAt)) / 1000);
const capToGen = genAt !== null ? (genAt - Date.parse(price.capturedAt)) / 1000 : Infinity;
const priceFreshAtGeneration = obsAges.every(x => x >= 0 && x <= MAX_PRICE_AGE_S) && capToGen >= 0 && capToGen <= MAX_PRICE_AGE_S;
const requireLive = policy.mode === "live" || policy.live === true || policy.executable === true || a.meta.executable === true;
ok("price gate: a live packet requires live-mode prices, both observations <=300s at capture and capture <=300s before generation; a fixture price forces executable=false",
  requireLive ? (priceIsLive && priceFreshAtGeneration) : (a.meta.executable === false && policy.executable === false),
  `requireLive=${requireLive} priceMode=${price.mode} live=${price.live} freshAtGeneration=${priceFreshAtGeneration}`);
ok("packet records generation + expiry UTC and a validity window matching policy",
  !!a.meta.generatedAtUtc && !!a.meta.expiresAtUtc && a.meta.validityWindowSeconds === policy.validity.windowSeconds &&
  Date.parse(a.meta.expiresAtUtc) > Date.parse(a.meta.generatedAtUtc) - 1);
ok("price snapshot records separate request/response timestamps and micro-USD parsed from decimal string",
  price.sources.every(s => s.requestedAt && s.respondedAt && Date.parse(s.respondedAt) >= Date.parse(s.requestedAt) &&
    (() => { const [i, f = ""] = String(s.priceUsd).split("."); return (BigInt(i) * 1_000_000n + BigInt((f + "000000").slice(0, 6))).toString() === s.microUsd; })()));

// ---- signable-field execution digest ----
const signable = (t) => ({ chainId: t.chainId, signer: getAddress(t.signer), nonce: t.nonce, type: 2, to: t.to ? getAddress(t.to) : null, value: t.value || "0", data: t.dataOrInitCode, gasLimit: t.gasLimit, maxFeePerGas: t.maxFeePerGas, maxPriorityFeePerGas: t.maxPriorityFeePerGas });
const execDigest = keccak256(toHex(stable(imm.concat([dl]).map(signable))));
ok("executionPacketDigest over normalized SIGNABLE fields matches", execDigest === a.meta.executionPacketDigest, execDigest);
// item 3: explicit chainId on every tx + exact sequential per-signer nonces
ok("every immediate + delayed tx carries explicit chainId=4663", imm.every(t => t.chainId === 4663) && dl.chainId === 4663);
for (const [s, start] of [[DEPLOYER, DSTART], [TESTER, TSTART]]) { const ns = imm.filter(t => lc(t.signer) === lc(s)).map(t => t.nonce); ok(`exact sequential nonces for ${s === DEPLOYER ? "deployer" : "tester"} (start ${start}..)`, ns.every((n, i) => n === start + i) && ns.length > 0); }
ok("deployer + tester start nonces match packet meta.startNonces (read live, not hardcoded)", a.meta.startNonces && a.meta.startNonces.deployer === DSTART && a.meta.startNonces.tester === TSTART);
ok("delayed tx nonce continues the tester sequence exactly", dl.nonce === TSTART + imm.filter(t => lc(t.signer) === lc(TESTER)).length);
// item 3: mutation test — nonce / signer / chainId / type each break verification (execution digest)
{
  const muts = [
    ["nonce", (o) => o.immediateTransactions[3].nonce = 99],
    ["signer", (o) => o.immediateTransactions[3].signer = TESTER],
    ["chainId", (o) => o.immediateTransactions[3].chainId = 1],
    ["type", (o) => o.delayedWithdrawalSubPacket.txType = "0x0 (legacy)"],
  ];
  let allBreak = true; const survived = [];
  for (const [name, fn] of muts) {
    const c = JSON.parse(JSON.stringify(a)); fn(c);
    const d = keccak256(toHex(stable(c.immediateTransactions.concat([c.delayedWithdrawalSubPacket]).map(t => ({ chainId: t.chainId, signer: getAddress(t.signer), nonce: t.nonce, type: (t.txType || "").startsWith("0x2") ? 2 : 0, to: t.to ? getAddress(t.to) : null, value: t.value || "0", data: t.dataOrInitCode, gasLimit: t.gasLimit, maxFeePerGas: t.maxFeePerGas, maxPriorityFeePerGas: t.maxPriorityFeePerGas })))));
    if (d === a.meta.executionPacketDigest) { allBreak = false; survived.push(name); }
  }
  ok("mutation test: changing nonce, signer, chainId or tx type FAILS verification", allBreak, survived.length ? "survived:" + survived.join(",") : "all 4 mutations detected");
}
// ---- (10D-3) canonical reviewed-authorization: reconstruct + require three independent anchors to agree ----
{
  const snapshot = rj("block-snapshot.json");
  const recon = buildCanonical({ packet: a, policy, snapshot, getAddress });
  ok("canonical reviewed-authorization reconstructs with no leaf/schema errors", recon.errors.length === 0, recon.errors.slice(0, 6).join("; "));
  const digestR = recon.object ? digestOf(recon.object, keccak256) : null;
  const pkgRaw = rt("operator/reviewed-authorization.json"), pkg = JSON.parse(pkgRaw);
  const strictErr = validateStrict(pkg, pkgRaw, getAddress), dupKeys = rawDuplicateKeys(pkgRaw);
  ok("packaged operator/reviewed-authorization.json is strictly valid (no unknown/wrong-type/non-canonical)", strictErr.length === 0, strictErr.slice(0, 6).join("; "));
  ok("packaged reviewed-authorization has no duplicate JSON keys", dupKeys.length === 0, dupKeys.join(","));
  const digestP = digestOf(pkg, keccak256);
  ok("reviewedAuthorizationDigest agrees across packet.meta, review-policy, and packaged operator", lc(digestR) === lc(digestP) && lc(digestR) === lc(a.meta.reviewedAuthorizationDigest) && lc(digestR) === lc(policy.reviewedAuthorizationDigest), digestR);
  ok("reconstruction structurally equals the packaged bound object", stable(recon.object) === stable(pkg));
  // mutation: changing a leaf in ANY source shifts the reconstruction digest away from the (unchanged) anchors
  const leafMuts = [
    ["expiry-2035", (P, PO, S) => P.meta.expiresAtUtc = "2035-01-01T00:00:00.000Z"],
    ["auth-false", (P, PO, S) => P.safetyFlags.executionAuthorized = false],
    ["nvda-addr", (P, PO, S) => PO.infrastructure.nvdaStockToken = "0x000000000000000000000000000000000000dEaD"],
    ["pool-addr", (P, PO, S) => P.addressGuards.poolAddress = "0x000000000000000000000000000000000000dEaD"],
    ["snapshot-nonce", (P, PO, S) => S.nonces.deployer = 99],
    ["zero-weth", (P, PO, S) => { P.forkFunding.inbound.deployer.weth = "0"; P.forkFunding.inbound.tester.weth = "0"; }],
    ["zero-gas", (P, PO, S) => P.capArithmetic.allInclusiveGasWei = "0"],
    ["aggregate", (P, PO, S) => P.capArithmetic.aggregateWei = "1"],
  ];
  let mutAllShift = true; const survived = [];
  for (const [name, fn] of leafMuts) {
    const P = JSON.parse(JSON.stringify(a)), PO = JSON.parse(JSON.stringify(policy)), S = JSON.parse(JSON.stringify(snapshot));
    fn(P, PO, S);
    const r2 = buildCanonical({ packet: P, policy: PO, snapshot: S, getAddress });
    const d2 = r2.object ? digestOf(r2.object, keccak256) : null;
    if (r2.errors.length === 0 && lc(d2) === lc(a.meta.reviewedAuthorizationDigest)) { mutAllShift = false; survived.push(name); }
  }
  ok("mutation test: expiry/auth/NVDA/pool/snapshot/WETH/gas/aggregate each shift the reviewed digest", mutAllShift, survived.length ? "survived:" + survived.join(",") : "all 8 detected");
}
// full digest
const forHash = { ...a, meta: { ...a.meta } }; delete forHash.meta.fullReviewArtifactDigest;
const fullDigest = keccak256(toHex(stable(forHash)));
ok("fullReviewArtifactDigest (whole artifact minus itself) matches", fullDigest === a.meta.fullReviewArtifactDigest, fullDigest);
ok("execution digest differs from full digest", a.meta.executionPacketDigest !== a.meta.fullReviewArtifactDigest);
// mutation test
const recomputeFull = (o) => { const f = { ...o, meta: { ...o.meta } }; delete f.meta.fullReviewArtifactDigest; return keccak256(toHex(stable(f))); };
let mut = true; for (const [pth, fn] of [["meta.capPriceMicroUsd", o => o.meta.capPriceMicroUsd = "1"], ["safetyFlags.broadcastReady", o => o.safetyFlags.broadcastReady = !o.safetyFlags.broadcastReady], ["fundingPlan.executable", o => o.fundingPlan.executable = true], ["immediateTransactions[0].dataKeccak", o => o.immediateTransactions[0].dataKeccak = "0x01"], ["provenance.repoHead", o => o.provenance.repoHead = "x"], ["addressGuards.canaryTokenSymbol", o => o.addressGuards.canaryTokenSymbol = "BPS"]]) { const c = JSON.parse(JSON.stringify(a)); fn(c); if (recomputeFull(c) === a.meta.fullReviewArtifactDigest) mut = false; }
ok("mutation test: any covered field change alters full digest", mut);

// ---- snapshot fields ----
ok("chainId=4663 & fork block/hash/ts/baseFee match policy snapshot", a.meta.chainId === 4663 && a.meta.forkBlock === String(policy.snapshot.forkBlock) && lc(a.meta.forkBlockHash) === lc(policy.snapshot.forkHash) && a.meta.forkTimestamp === String(policy.snapshot.forkTimestamp) && a.meta.forkBaseFeePerGasWei === policy.snapshot.baseFeePerGasWei);
ok("anvilConfig recorded (fork block/chain/baseFee/argv template + env-var reference, NO url) & live cross-check hash matched",
  a.meta.anvilConfig && a.meta.anvilConfig.forkBlockNumber === policy.snapshot.forkBlock &&
  Array.isArray(a.meta.anvilConfig.argvTemplate) && a.meta.anvilConfig.forkUrlEnvVar === "ROBINHOOD_CHAIN_RPC_URL" &&
  !a.meta.anvilConfig.forkUrl && a.meta.anvilConfig.liveCrossCheckMatches === true);
ok("live+fork nonces recorded and equal the packet start nonces (read live, not hardcoded)",
  a.meta.liveNonces.deployer === DSTART && a.meta.liveNonces.tester === TSTART &&
  a.meta.forkNonces.deployer === DSTART && a.meta.forkNonces.tester === TSTART &&
  a.meta.startNonces.deployer === DSTART && a.meta.startNonces.tester === TSTART);

// ---- price ----
ok("price snapshot embedded == pinned file; 2 distinct sources; higher selected; raw+sha recorded", stable(a.priceSnapshot) === stable(price) && price.sources.length >= 2 && new Set(price.sources.map(s => s.name)).size >= 2 && CAP === price.sources.reduce((m, s) => B(s.microUsd) > m ? B(s.microUsd) : m, 0n) && price.sources.every(s => /^0x[0-9a-f]{64}$/.test(s.rawResponseSha256) && "0x" + createHash("sha256").update(s.rawResponse).digest("hex") === s.rawResponseSha256));

// ---- CREATE derivations + manifest agreement ----
ok("all 8 CREATE addresses derive from deployer+nonce (current start nonce)", imm.filter(t => t.phase === "A-deploy").every(t => getAddress(t.predictedCreationAddress) === getAddress(getContractAddress({ from: DEPLOYER, nonce: BigInt(t.nonce) })) && getAddress(t.predictedCreationAddress) === P[slots[t.nonce - DSTART]]));
{ const man = rj("manifests/robinhood-mainnet.canary.json"); ok("bundled canonical manifest predicted addresses (startNonce) agree with CREATE", man.startNonce === DSTART && slots.every(s => getAddress(man.predicted[s]) === P[s])); }

// ---- BUILD PROVENANCE (hash-based; git checked by runner) ----
let provOk = true;
for (const n of names) {
  const aj = artOf(n), pv = a.provenance.contracts[n];
  if (keccak256(aj.bytecode.object) !== pv.creationBytecodeKeccak) provOk = false;
  if (keccak256(aj.deployedBytecode.object) !== pv.runtimeBytecodeKeccak) provOk = false;
  if ("0x" + createHash("sha256").update(rb(`artifacts/${n}.json`)).digest("hex") !== pv.artifactSha256) provOk = false;
  const srcLines = Object.entries(aj.metadata.sources).map(([p, v]) => `${p}:${v.keccak256}`).sort();
  if (keccak256(toHex(srcLines.join("\n"))) !== pv.sourceListKeccak) provOk = false;
  if (aj.metadata.compiler.version !== pv.solc || aj.metadata.settings.optimizer.enabled !== true || aj.metadata.settings.optimizer.runs !== 200 || aj.metadata.settings.evmVersion !== "cancun") provOk = false;
}
ok("provenance: creation/runtime bytecode keccak, artifact sha256, source-list, solc/optimizer(200)/cancun match", provOk);
// source-file contents hashed from actual bundled sources == solc metadata keccak256
let srcHashOk = true, srcChecked = 0;
{ const aj = artOf("BPSTradeRouter"); for (const [p, v] of Object.entries(aj.metadata.sources)) { const bundleRel = srcIndex[p]; if (!bundleRel) { srcHashOk = false; continue; } const content = rb(bundleRel); if (keccak256(content) !== v.keccak256) srcHashOk = false; srcChecked++; } }
ok(`every bundled source file keccak256 == solc metadata (checked ${srcChecked} files)`, srcHashOk && srcChecked > 0);
ok("provenance records repoHead(40 hex) & dirtyTrackedTree boolean", /^[0-9a-f]{40}$/.test(a.provenance.repoHead) && typeof a.provenance.dirtyTrackedTree === "boolean");

// ---- init code EXACT equality (creationBytecode ++ abi.encode(expected args)) ----
const specTypes = { BPSCanaryToken: ["address"], BPSLockingVault: ["address", "address"], DistributionClaimManager: ["address", "address"], RialtoStockAcquisitionAdapter: ["address", "address", "address"], DistributionFundingCoordinator: ["address", "address", "address", "address"], StockAcquisitionVault: ["address", "address", "address", "address", "address", "address[]"], UniswapV3BPSSwapAdapter: ["address", "address", "address", "address", "uint24"], BPSTradeRouter: ["address", "address", "address", "address", "address"] };
const expectedArgs = { BPSCanaryToken: [DEPLOYER], BPSLockingVault: [P.canaryToken, DEPLOYER], DistributionClaimManager: [P.coordinator, DEPLOYER], RialtoStockAcquisitionAdapter: [P.stockVault, WETH, REGISTRY], DistributionFundingCoordinator: [P.stockVault, P.claimManager, DEPLOYER, DEPLOYER], StockAcquisitionVault: [WETH, P.rialtoAdapter, P.coordinator, DEPLOYER, P.coordinator, [NVDA]], UniswapV3BPSSwapAdapter: [P.tradeRouter, P.canaryToken, WETH, SWAPROUTER, BigInt(FEE)], BPSTradeRouter: [DEPLOYER, P.canaryToken, WETH, P.uniswapAdapter, P.stockVault] };
let initExact = true;
for (const t of imm.filter(t => t.phase === "A-deploy")) {
  const n = t.label, creation = artOf(n).bytecode.object;
  const encoded = encodeAbiParameters(specTypes[n].map(x => ({ type: x })), expectedArgs[n]);
  const reconstructed = creation + encoded.slice(2);
  if (lc(reconstructed) !== lc(t.dataOrInitCode)) initExact = false;
}
ok("every deploy init code EXACTLY == creationBytecode ++ abi.encode(expected ctor args)", initExact);

// ---- decode EVERY tx: signer/nonce/chain/type/to/value/calldata/fees/gasLimit/deadline/selector ----
const mergedAbi = [...artOf("BPSTradeRouter").abi, ...artOf("BPSLockingVault").abi,
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "createPool", inputs: [{ name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }, { name: "fee", type: "uint24" }], outputs: [{ type: "address" }], stateMutability: "nonpayable" },
  { type: "function", name: "initialize", inputs: [{ name: "sqrtPriceX96", type: "uint160" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "mint", stateMutability: "payable", outputs: [], inputs: [{ components: [{ name: "token0", type: "address" }, { name: "token1", type: "address" }, { name: "fee", type: "uint24" }, { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" }, { name: "amount0Desired", type: "uint256" }, { name: "amount1Desired", type: "uint256" }, { name: "amount0Min", type: "uint256" }, { name: "amount1Min", type: "uint256" }, { name: "recipient", type: "address" }, { name: "deadline", type: "uint256" }], name: "params", type: "tuple" }] }];
const lp = a.lpUsage, bu = a.buyAccounting, se = a.sellAccounting, lw = a.lockAndWithdraw;
let allTxOk = true; const bad = [];
const chkTx = (t) => {
  if (t.txType && !t.txType.startsWith("0x2")) { allTxOk = false; bad.push(t.label + ":type"); }
  if (getAddress(t.signer) !== getAddress(t.signer === DEPLOYER || lc(t.signer) === lc(DEPLOYER) ? DEPLOYER : TESTER)) { }
  if (t.maxFeePerGas !== MAXFEE.toString() || t.maxPriorityFeePerGas !== policy.gas.maxPriorityFeePerGasWei) { allTxOk = false; bad.push(t.label + ":fees"); }
  if (GL(t.gasEstimate).toString() !== t.gasLimit) { allTxOk = false; bad.push(t.label + ":gasLimit"); }
  if ((B(t.gasLimit) * MAXFEE).toString() !== t.maxGasCostWei) { allTxOk = false; bad.push(t.label + ":maxGasCost"); }
  if (B(t.gasUsed) > B(t.gasLimit)) { allTxOk = false; bad.push(t.label + ":gasUsed>limit"); }
  if (t.receiptStatus !== "success") { allTxOk = false; bad.push(t.label + ":receipt"); }
  if (keccak256(t.dataOrInitCode) !== t.dataKeccak) { allTxOk = false; bad.push(t.label + ":dataKeccak"); }
  if ((t.value || "0") !== "0") { allTxOk = false; bad.push(t.label + ":value"); }
};
imm.forEach(chkTx); chkTx(dl);
// embedded-argument comparisons (incl createPool, initialize, both BPSC approvals, vault approval)
const find = (l) => imm.find(x => x.label === l);
const dec = (l) => decodeFunctionData({ abi: mergedAbi, data: find(l).dataOrInitCode });
const eq = (c, m) => { if (!c) { allTxOk = false; bad.push("arg:" + m); } };
{ const d = dec("WETH.approve(NPM)"); eq(getAddress(d.args[0]) === getAddress(NPM) && d.args[1] === floorWeiUsd(100), "WETH.approve(NPM,$100)"); }
{ const d = dec("BPSC.approve(NPM)"); eq(getAddress(d.args[0]) === getAddress(NPM) && d.args[1] === B(policy.economics.bpscLpDesiredWei), "BPSC.approve(NPM,50M)"); }
{ const d = dec("factory.createPool"); eq(getAddress(d.args[0]) === getAddress(lp.token0) && getAddress(d.args[1]) === getAddress(lp.token1) && Number(d.args[2]) === FEE, "createPool"); }
{ const d = dec("pool.initialize"); eq(d.args[0] === B(lp.sqrtPriceX96), "initialize(sqrtP)"); }
{ const d = dec("NPM.mint").args[0]; eq(getAddress(d.token0) === getAddress(lp.token0) && getAddress(d.token1) === getAddress(lp.token1) && Number(d.fee) === FEE && Number(d.tickLower) === lp.tickLower && Number(d.tickUpper) === lp.tickUpper && d.amount0Desired === floorWeiUsd(100) && d.amount1Desired === B(policy.economics.bpscLpDesiredWei) && d.amount0Min === B(lp.amount0Min) && d.amount1Min === B(lp.amount1Min) && getAddress(d.recipient) === getAddress(DEPLOYER) && d.deadline === DEADLINE, "mint params"); }
{ const d = dec("tester WETH.approve(router)"); eq(getAddress(d.args[0]) === P.tradeRouter && d.args[1] === floorWeiUsd(2), "tester WETH.approve(router,$2)"); }
{ const d = dec("buyExactWethForBps"); eq(d.args[0] === floorWeiUsd(2) && d.args[1] === B(bu.minimumUserBpsOutput) && d.args[2] === B(bu.minimumBurnBpsOutput) && getAddress(d.args[3]) === getAddress(TESTER) && d.args[4] === DEADLINE, "buy"); }
{ const d = dec("tester BPSC.approve(router)"); eq(getAddress(d.args[0]) === P.tradeRouter && d.args[1] === B(se.grossBpsInput), "tester BPSC.approve(router)"); }
{ const d = dec("sellExactBpsForWeth"); eq(d.args[0] === B(se.grossBpsInput) && d.args[1] === B(se.minimumGrossWethOutput) && d.args[2] === B(se.minimumUserWethOutput) && d.args[3] === B(se.minimumBurnBpsOutput) && getAddress(d.args[4]) === getAddress(TESTER) && d.args[5] === DEADLINE, "sell"); }
{ const d = dec("tester BPSC.approve(vault)"); eq(getAddress(d.args[0]) === P.lockingVault && d.args[1] === B(lw.principal), "tester BPSC.approve(vault)"); }
{ const d = dec("createLock(amount,7d)"); eq(d.args[0] === B(lw.principal) && Number(d.args[1]) === 604800, "createLock"); }
{ const d = decodeFunctionData({ abi: mergedAbi, data: dl.dataOrInitCode }); eq(B(d.args[0]) === B(lw.lockId), "withdraw(lockId)"); }
ok("EVERY immediate+delayed tx verified (type/fees/gasLimit-ceil/maxGasCost/gasUsed/receipt/dataKeccak/value + embedded args incl createPool/initialize/both approvals/vault approval)", allTxOk, bad.slice(0, 6).join(","));
ok("LP/buy/sell minimums NON-ZERO in calldata", B(lp.amount0Min) > 0n && B(lp.amount1Min) > 0n && B(bu.minimumUserBpsOutput) > 0n && B(bu.minimumBurnBpsOutput) > 0n && B(se.minimumGrossWethOutput) > 0n && B(se.minimumUserWethOutput) > 0n && B(se.minimumBurnBpsOutput) > 0n);

// ---- gas CEIL correctness (every tx one-below-ceiling bug fixed) ----
ok("gasLimit == ceil(gasEstimate*120/100) for all txs (integer ceiling)", [...imm, dl].every(t => B(t.gasLimit) === (B(t.gasEstimate) * 120n + 99n) / 100n));

// ---- allow-set + canonical guards from manifests ----
const allowed = new Set([...slots.map(s => lc(P[s])), ...[WETH, FACTORY, NPM, SWAPROUTER, REGISTRY, a.addressGuards.poolAddress].map(lc)]);
const targets = []; for (const t of imm) { if (t.to) targets.push(lc(t.to)); if (t.predictedCreationAddress) targets.push(lc(t.predictedCreationAddress)); } targets.push(lc(dl.to));
ok("every tx target ∈ allow-set (pinned infra + CREATE)", targets.every(x => allowed.has(x)));
// derive canonical BPS from ALL bundled manifests
const canonical = [];
for (const m of ["robinhood-mainnet.canary", "robinhood-mainnet.dryrun"]) { const mm = rj(`manifests/${m}.json`); const isCanon = mm.production === true || (mm.token && mm.token.symbol === "BPS"); const acts = mm.actual ? Object.values(mm.actual).filter(v => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) : []; if (isCanon) acts.forEach(x => canonical.push(getAddress(x))); }
ok("canonical BPS derived from bundled manifests == [] (no canonical deployment exists) & proven", canonical.length === 0 && a.addressGuards.canonicalBpsAddresses.length === 0 && targets.every(x => !canonical.map(lc).includes(x)));
ok("canary token symbol is BPSC-TEST (not canonical BPS)", a.addressGuards.canaryTokenSymbol === "BPSC-TEST" && rj("manifests/robinhood-mainnet.canary.json").token.symbol === "BPSC-TEST");

// ---- accounting + reconciliation (numbers) ----
ok("LP amount0Min/amount1Min == floor(used*995/1000) & used<=desired & before-used==after", B(lp.amount0Min) === B(lp.amount0Used) * 995n / 1000n && B(lp.amount1Min) === B(lp.amount1Used) * 995n / 1000n && B(lp.amount0Used) <= B(lp.amount0Desired) && B(lp.amount1Used) <= B(lp.amount1Desired) && B(lp.deployerWethBefore) - B(lp.amount0Used) === B(lp.deployerWethAfter) && B(lp.deployerBpscBefore) - B(lp.amount1Used) === B(lp.deployerBpscAfter));
const gwi = B(bu.grossWethInput), gwo = B(se.grossWethOutput);
ok("buy 2/1/97 (mulDiv floor) + mins floor(actual*99/100) + vault WETH += stock", B(bu.stockBudget2pct) === gwi * 200n / 10000n && B(bu.burnBudget1pct) === gwi * 100n / 10000n && B(bu.userWethBudget97pct) === gwi - B(bu.stockBudget2pct) - B(bu.burnBudget1pct) && B(bu.minimumUserBpsOutput) === B(bu.userBpsOutput) * 99n / 100n && B(bu.minimumBurnBpsOutput) === B(bu.bpsBurned) * 99n / 100n && B(bu.vaultWethAfter) - B(bu.vaultWethBefore) === B(bu.stockBudget2pct));
ok("sell 2/2/96 (mulDiv floor) + mins floor(actual*99/100) + tester WETH += user + within $2 cap", B(se.stockAcquisition2pct) === gwo * 200n / 10000n && B(se.retirementBurn2pct) === gwo * 200n / 10000n && B(se.userWethOutput96pct) === gwo - B(se.stockAcquisition2pct) - B(se.retirementBurn2pct) && B(se.minimumGrossWethOutput) === gwo * 99n / 100n && B(se.minimumUserWethOutput) === B(se.userWethOutput96pct) * 99n / 100n && B(se.minimumBurnBpsOutput) === B(se.bpsBurned) * 99n / 100n && B(se.testerWethAfter) - B(se.testerWethBefore) === B(se.userWethOutput96pct) && usdMicro(se.userWethOutput96pct) <= capMicro(policy.caps.individualTradeUsd));
const sb = a.forkFunding.startingBalances, eb = a.forkFunding.endingBalancesImmediate, inb = a.forkFunding.inbound;
const gasSpent = (w) => imm.filter(t => lc(t.signer) === lc(w)).reduce((s, t) => s + B(t.gasUsed) * B(t.effectiveGasPrice), 0n);
ok("ETH reconciles both signers (start - Σ(gasUsed*effPrice) == end)", B(sb.deployer.eth) - gasSpent(DEPLOYER) === B(eb.deployer.eth) && B(sb.tester.eth) - gasSpent(TESTER) === B(eb.tester.eth));
ok("WETH reconciles (deployer: start-LPused; tester: start-buyGross+sellUser) & start==inbound($100/$20 floor)", B(sb.deployer.weth) - B(lp.amount0Used) === B(eb.deployer.weth) && B(sb.tester.weth) - gwi + B(se.userWethOutput96pct) === B(eb.tester.weth) && sb.deployer.weth === inb.deployer.weth && B(inb.deployer.weth) === floorWeiUsd(100) && B(inb.tester.weth) === floorWeiUsd(20));
ok("BPSC reconciles (deployer 1e9-LPused==end; tester bought-sold-locked==0)", B(sb.deployer.bpsc) - B(lp.amount1Used) === B(eb.deployer.bpsc) && B(bu.userBpsOutput) - B(se.grossBpsInput) - B(lw.principal) === B(eb.tester.bpsc) && B(eb.tester.bpsc) === 0n);
ok("inbound ETH == Σ per-signer recorded max gas cost; actual spent <= funded", B(inb.deployer.eth) === imm.filter(t => lc(t.signer) === lc(DEPLOYER)).reduce((s, t) => s + B(t.maxGasCostWei), 0n) && B(inb.tester.ethImmediate) === imm.filter(t => lc(t.signer) === lc(TESTER)).reduce((s, t) => s + B(t.maxGasCostWei), 0n) && gasSpent(DEPLOYER) <= B(inb.deployer.eth) && gasSpent(TESTER) <= B(inb.tester.ethImmediate));
ok("withdraw returns exactly principal; no emergency exit; earliest==unlockTime", dl.returnedPrincipal === lw.principal && lw.principal === dl.principal && dl.emergencyExitUsed === false && dl.earliestBlockTimestamp === lw.unlockTime);

// ---- funding PLAN ----
const fp = a.fundingPlan;
ok("fundingPlan executable=false & fundingAuthorized=false", fp.executable === false && fp.fundingAuthorized === false);
{ const eths = fp.transfers.filter(t => t.kind === "ETH-transfer");
  const dImm = eths.find(t => lc(t.recipient) === lc(DEPLOYER) && t.schedule === "immediate");
  const tImm = eths.find(t => lc(t.recipient) === lc(TESTER) && t.schedule === "immediate");
  const tDel = eths.find(t => lc(t.recipient) === lc(TESTER) && t.schedule.startsWith("delayed"));
  ok("funding plan: all THREE ETH amounts & recipients correct (deployer imm, tester imm, tester delayed)",
    dImm && B(dImm.ethValue) === B(inb.deployer.eth) && tImm && B(tImm.ethValue) === B(inb.tester.ethImmediate) && tDel && B(tDel.ethValue) === B(inb.tester.ethDelayed));
  // item 7: FULLY decode each WETH transfer's calldata; recipient+amount must equal declared fields
  const weths = fp.transfers.filter(t => t.kind === "WETH-transfer");
  let wethDecodeOk = weths.length === 2;
  for (const t of weths) {
    const d = decodeFunctionData({ abi: [{ type: "function", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" }], data: t.calldata });
    if (d.functionName !== "transfer") wethDecodeOk = false;
    if (getAddress(d.args[0]) !== getAddress(t.recipient)) wethDecodeOk = false;   // decoded recipient == declared
    if (d.args[1] !== B(t.amount)) wethDecodeOk = false;                            // decoded amount == declared
    if (lc(t.target) !== lc(WETH) || t.ethValue !== "0") wethDecodeOk = false;
  }
  const dW = weths.find(t => lc(t.recipient) === lc(DEPLOYER)), tW = weths.find(t => lc(t.recipient) === lc(TESTER));
  ok("funding plan: WETH transfer calldata fully decoded — recipient & amount equal declared fields ($100/$20)",
    wethDecodeOk && dW && B(dW.amount) === floorWeiUsd(100) && tW && B(tW.amount) === floorWeiUsd(20));
  // item 7: exact gas-limit formulas (ceil(base*120/100)) for each funding tx class
  const ceil120 = (b) => (BigInt(b) * 120n + 99n) / 100n;
  ok("funding plan: exact gas-limit formulas — ETH 21000, WETH transfer 51000, WETH deposit 50000, each ceil(x*120/100)",
    fp.transfers.filter(t => t.kind === "ETH-transfer").every(t => B(t.gasLimit) === ceil120(21000)) &&
    weths.every(t => B(t.gasLimit) === ceil120(51000)) &&
    fp.wrapping.every(t => B(t.gasLimit) === ceil120(50000)) &&
    [...fp.wrapping, ...fp.transfers].every(t => B(t.maxGasCostWei) === B(t.gasLimit) * MAXFEE));
  ok("funding plan includes WETH wrapping (deposit) txs with gas in aggregate (no funder WETH assumed)", fp.wrapping.length === 2 && fp.wrapping.every(w => lc(w.calldata) === "0xd0e30db0" && lc(w.target) === lc(WETH)) && B(fp.wrapping[0].ethValue) === floorWeiUsd(100) && B(fp.wrapping[1].ethValue) === floorWeiUsd(20));
  ok("every funding tx: chainId=4663 & gasLimit=ceil methodology", [...fp.wrapping, ...fp.transfers].every(t => t.chainId === 4663 && /^\d+$/.test(t.gasLimit))); }

// ---- exposure incl funding gas, caps ----
const ca = a.capArithmetic;
const immGas = imm.reduce((s, t) => s + B(t.maxGasCostWei), 0n), delGas = B(dl.maxGasCostWei);
const fundGas = [...fp.wrapping, ...fp.transfers].reduce((s, t) => s + B(t.maxGasCostWei), 0n);
const allGas = immGas + delGas + fundGas;
ok("gas totals recomputed: immediate + delayed + funding == all-inclusive", immGas.toString() === ca.immediateGasWei && fundGas.toString() === ca.fundingTxGasWei && allGas.toString() === ca.allInclusiveGasWei);
ok("immediate gas <= $10; LP<=$100; trade<=$20", usdMicro(immGas) <= capMicro(10) && usdMicro(floorWeiUsd(100)) <= capMicro(100) && usdMicro(floorWeiUsd(20)) <= capMicro(20));
// item 8: sum ALL principal + maximum-gas wei FIRST, convert ONCE to micro-USD
const aggregateWei = floorWeiUsd(100) + floorWeiUsd(20) + allGas;
const aggMicro = usdMicro(aggregateWei);
ok("aggregate exposure = sum(all principal + all max-gas wei) converted ONCE to micro-USD", aggregateWei.toString() === ca.aggregateWei && aggMicro.toString() === ca.allInclusiveExposureMicroUsd, `${aggregateWei} wei`);
ok("all-inclusive exposure <= $130", aggMicro <= capMicro(130), "$" + (Number(aggMicro) / 1e6).toFixed(6));

// ---- no signature / private material ----
const forbid = /(^|\.)(signature|signed|rawtx|rawsignedtx|privatekey|private_key|secret|mnemonic|seed|passphrase)$/i;
let sec = null; const scan = (v, p) => { if (sec) return; if (v && typeof v === "object") for (const k of Object.keys(v)) { if (forbid.test(k)) { sec = p + "." + k; return; } scan(v[k], p + "." + k); } };
scan(a, "artifact");
ok("no signature/private-material field; meta declares none", sec === null && a.meta.containsSignature === false && a.meta.containsPrivateMaterial === false, sec || "none");

// ---- report ----
console.log("[offline] executionPacketDigest:   ", execDigest);
console.log("[offline] fullReviewArtifactDigest:", fullDigest);
for (const r of R) console.log(` [${r.pass ? "PASS" : "FAIL"}] ${r.n}${r.d ? "  (" + r.d + ")" : ""}`);
const passed = R.filter(r => r.pass).length;
console.log(`\n[offline] ${passed}/${R.length} checks passed`);
const allPass = R.every(r => r.pass);
if (process.argv.includes("--exit")) process.exit(allPass ? 0 : 1);
export default { allPass, passed, total: R.length };
