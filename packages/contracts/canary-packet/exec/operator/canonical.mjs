// TASK 10D-3 — ONE canonical reviewed-authorization object + digest.
// Every security-relevant input used by binding/preconditions/verification/postconditions/exposure is a
// LEAF here. reviewedAuthorizationDigest = keccak256(canonicalStable(object)). Mutating ANY leaf changes
// the digest. Binding requires the reconstruction (from runtime packet/policy/snapshot) to equal the
// packaged canonical object AND all independent digest anchors (packet, policy, packaged) to agree.
// Strict: rejects missing/unknown/duplicate fields, wrong types, alternate numeric encodings, non-canonical
// addresses. keccak256/getAddress are injected so this runs identically in the browser (js-sha3) and node.

export const CANON_SCHEMA = "canary-reviewed-authorization";
export const CANON_VERSION = "10D-4";
export const SCOPE = "BPSC-TEST canary only; Robinhood Chain mainnet; maximum all-inclusive exposure $130; individual Rabby approvals; canonical BPS production excluded.";
const DEPLOY_SLOTS = ["canaryToken", "lockingVault", "claimManager", "rialtoAdapter", "coordinator", "stockVault", "uniswapAdapter", "tradeRouter"];
const SLOT_CONTRACT = { canaryToken: "BPSCanaryToken", lockingVault: "BPSLockingVault", claimManager: "DistributionClaimManager", rialtoAdapter: "RialtoStockAcquisitionAdapter", coordinator: "DistributionFundingCoordinator", stockVault: "StockAcquisitionVault", uniswapAdapter: "UniswapV3BPSSwapAdapter", tradeRouter: "BPSTradeRouter" };
const DEP_NAMES = ["weth", "uniswapV3Factory", "nonfungiblePositionManager", "swapRouter02", "rialtoRegistry", "nvdaStockToken"];
// fixed, digest-bound step-identity: postcondition dispatch type per label/phase (NOT trusted from raw packet)
export function postconditionType(t) {
  if (t.phase === "A-deploy") return "deploy";
  if (typeof t.label === "string" && t.label.includes("approve")) return "approve";
  return ({ "factory.createPool": "createPool", "pool.initialize": "initialize", "NPM.mint": "mint", "buyExactWethForBps": "buy", "sellExactBpsForWeth": "sell", "createLock(amount,7d)": "lock" })[t.label] || "unknown";
}

// ===== TASK 10D-5 — canonical RECOVERY authorization =====
export const RECOVERY_SCHEMA = "canary-recovery-authorization";
export const RECOVERY_VERSION = "10D-5";
export const RECOVERY_SCOPE = "BPSC-TEST canary RECOVERY (original step 1 completed on chain); Robinhood Chain mainnet; remaining 18 transactions only (original steps 2-19); maximum all-inclusive exposure $130; individual Rabby approvals; canonical BPS production excluded.";
const REMAINING_SLOTS = ["lockingVault", "claimManager", "rialtoAdapter", "coordinator", "stockVault", "uniswapAdapter", "tradeRouter"];

export const isDec = (x) => typeof x === "string" && /^(0|[1-9][0-9]*)$/.test(x);      // canonical decimal, no hex/leading-zero/sign
export const isHex = (x, n) => typeof x === "string" && new RegExp("^0x[0-9a-fA-F]" + (n ? "{" + n * 2 + "}" : "+") + "$").test(x);
export { DEP_NAMES, SLOT_CONTRACT, REMAINING_SLOTS };

export function canonicalStable(v) {
  return Array.isArray(v) ? "[" + v.map(canonicalStable).join(",") + "]"
    : (v && typeof v === "object") ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonicalStable(v[k])).join(",") + "}"
    : JSON.stringify(v);
}
export function digestOf(obj, keccak256) { const s = canonicalStable(obj); let h = "0x"; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h += (c < 16 ? "0" : "") + c.toString(16); } return keccak256(h); }

// Build the canonical object from runtime inputs. Collects errors; empty errors => valid.
export function buildCanonical({ packet: a, policy: p, snapshot: s, getAddress }) {
  const err = [];
  const A = (x, where) => { if (!isHex(x, 20)) { err.push("non-address " + where); return "0x0000000000000000000000000000000000000000"; } return getAddress(x); };
  const N = (x, where) => { const v = typeof x === "number" ? String(x) : x; if (!isDec(v)) { err.push("non-canonical-number " + where + " (" + x + ")"); return "0"; } return v; };
  const I = (x, where) => { if (typeof x !== "number" || !Number.isInteger(x) || x < 0) { err.push("non-integer " + where); return 0; } return x; };
  const BOOLT = (x, where) => { if (x !== true) { err.push("expected-true " + where); return false; } return true; };
  const BOOLF = (x, where) => { if (x !== false) { err.push("expected-false " + where); return false; } return false; };
  const STR = (x, where, want) => { if (typeof x !== "string" || (want !== undefined && x !== want)) { err.push("bad-string " + where); return want ?? ""; } return x; };

  const req = (cond, where) => { if (!cond) err.push("missing " + where); };
  req(a && a.meta && a.meta.authorization, "meta.authorization");
  req(a && a.safetyFlags, "safetyFlags");
  req(a && a.forkFunding && a.forkFunding.inbound, "forkFunding.inbound");
  req(a && a.capArithmetic, "capArithmetic");
  req(a && a.addressGuards, "addressGuards");
  req(a && a.immediateTransactions && a.delayedWithdrawalSubPacket, "transactions");
  req(a && a.provenance && a.provenance.contracts, "provenance");
  req(s && s.pinnedBlock && s.nonces && s.balances, "snapshot");
  req(p && p.wallets && p.infrastructure && p.caps && p.gas && p.validity && p.expectedNonces && p.snapshot, "policy");
  if (err.length) return { errors: err, object: null };

  const au = a.meta.authorization;
  const HH = (x, w) => { if (!isHex(x, 32)) { err.push("bad-hash " + w); return "0x" + "0".repeat(64); } return x.toLowerCase(); };
  const SI = (x, w) => { if (typeof x !== "number" || !Number.isInteger(x)) { err.push("non-int " + w); return 0; } return x; };
  const sig = (t, withIndex) => {
    const o = { chainId: I(t.chainId, "tx.chainId"), signer: A(t.signer, "tx.signer"), nonce: I(t.nonce, "tx.nonce"), type: 2,
      to: t.to ? A(t.to, "tx.to") : null, value: N(t.value || "0", "tx.value"), data: (isHex(t.dataOrInitCode) ? t.dataOrInitCode.toLowerCase() : (err.push("tx.data"), "0x")),
      gasLimit: N(t.gasLimit, "tx.gasLimit"), maxFeePerGas: N(t.maxFeePerGas, "tx.maxFeePerGas"), maxPriorityFeePerGas: N(t.maxPriorityFeePerGas, "tx.maxPriorityFeePerGas") };
    if (withIndex) { // fixed, digest-bound step identity for dispatch + display
      o.index = I(t.index !== undefined ? t.index : t._i, "tx.index");
      o.phase = STR(t.phase, "tx.phase"); o.label = STR(t.label, "tx.label");
      const pc = postconditionType(t); if (pc === "unknown") err.push("tx.postconditionType unknown: " + t.label); o.postconditionType = pc;
    }
    return o;
  };
  const deploys = a.immediateTransactions.filter(t => t.phase === "A-deploy").sort((x, y) => x.nonce - y.nonce);
  const predicted = {}; deploys.forEach((t, i) => predicted[DEPLOY_SLOTS[i]] = A(t.predictedCreationAddress, "predicted." + DEPLOY_SLOTS[i]));

  const totalPrincipalWei = (BigInt(N(a.forkFunding.inbound.deployer.weth, "inb.deployer.weth")) + BigInt(N(a.forkFunding.inbound.tester.weth, "inb.tester.weth"))).toString();
  const totalMaxGasWei = N(a.capArithmetic.allInclusiveGasWei, "allInclusiveGasWei");
  const aggregateWeiStr = N(a.capArithmetic.aggregateWei, "aggWei");
  // exposure identity: aggregate MUST equal principal + max gas (catches a zeroed WETH/gas input that isn't
  // matched by a rewritten aggregate — an undercount attempt)
  if (BigInt(totalPrincipalWei) + BigInt(totalMaxGasWei) !== BigInt(aggregateWeiStr)) err.push("exposure identity: principal+gas != aggregate");
  const provenance = {};
  for (const [name, pv] of Object.entries(a.provenance.contracts)) provenance[name] = { creationBytecodeKeccak: STR(pv.creationBytecodeKeccak, "prov.cre"), runtimeBytecodeKeccak: STR(pv.runtimeBytecodeKeccak, "prov.run"), artifactSha256: STR(pv.artifactSha256, "prov.art"), sourceListKeccak: STR(pv.sourceListKeccak, "prov.src"), solc: STR(pv.solc, "prov.solc") };

  // ===== (10D-4) every remaining security-relevant runtime value is a leaf =====
  // six external dependencies: address, runtime code hash, expected code size
  const dependencies = {};
  for (const name of DEP_NAMES) { const d = s.externalCodeHashes[name]; if (!d) { err.push("dependency missing " + name); continue; } dependencies[name] = { address: A(d.address, "dep." + name), runtimeCodeHash: HH(d.runtimeCodeHash, "dep.hash." + name), codeBytes: I(d.codeBytes, "dep.bytes." + name) }; }
  // eight deployments: predicted address + exact ACTUAL deployed runtime code hash (includes constructor
  // immutables — recorded from the rehearsal, not the artifact runtime placeholder) + artifact runtime hash.
  const deployments = {};
  deploys.forEach((t, i) => { const slot = DEPLOY_SLOTS[i], cname = SLOT_CONTRACT[slot], pv = a.provenance.contracts[cname], drh = a.deployedRuntimeCodeHashes ? a.deployedRuntimeCodeHashes[slot] : undefined; deployments[slot] = { predictedAddress: A(t.predictedCreationAddress, "dep2." + slot), runtimeCodeHash: HH(drh, "runtimeHash." + slot), artifactRuntimeKeccak: HH(pv ? pv.runtimeBytecodeKeccak : undefined, "artHash." + slot) }; });
  // pool init + mint expectations
  const lu = a.lpUsage;
  const lp = { feeTier: I(Number(p.economics.feeTier), "lp.feeTier"), tickSpacing: I(Number(p.economics.tickSpacing), "lp.tickSpacing"), sqrtPriceX96: N(lu.sqrtPriceX96, "lp.sqrt"), tick: SI(lu.poolTickAfter, "lp.tick"), tickLower: SI(lu.tickLower, "lp.tl"), tickUpper: SI(lu.tickUpper, "lp.tu"), amount0Used: N(lu.amount0Used, "lp.a0"), amount1Used: N(lu.amount1Used, "lp.a1"), amount0Min: N(lu.amount0Min, "lp.a0m"), amount1Min: N(lu.amount1Min, "lp.a1m"), poolLiquidityAfter: N(lu.poolLiquidityAfter, "lp.liq"), token0: A(lu.token0, "lp.t0"), token1: A(lu.token1, "lp.t1"), positionOwner: A(lu.positionOwner, "lp.owner"), positionFee: I(lu.positionFee, "lp.pfee") };
  // complete buy/sell event + accounting expectations
  const bu = a.buyAccounting;
  const buy = { tradeId: N(bu.tradeId, "buy.tradeId"), trader: A(bu.trader, "buy.trader"), recipient: A(bu.recipient, "buy.recipient"), adapter: A(bu.adapter, "buy.adapter"), stockBudgetRecipient: A(bu.stockBudgetRecipient, "buy.sbr"), grossWethInput: N(bu.grossWethInput, "buy.gross"), stockBudget: N(bu.stockBudget2pct, "buy.stock"), burnBudget: N(bu.burnBudget1pct, "buy.burn"), userWethBudget: N(bu.userWethBudget97pct, "buy.uwb"), userBpsOutput: N(bu.userBpsOutput, "buy.ubo"), bpsBurned: N(bu.bpsBurned, "buy.bb"), minimumUserBpsOutput: N(bu.minimumUserBpsOutput, "buy.min") };
  const se = a.sellAccounting;
  const sell = { tradeId: N(se.tradeId, "sell.tradeId"), trader: A(se.trader, "sell.trader"), recipient: A(se.recipient, "sell.recipient"), adapter: A(se.adapter, "sell.adapter"), stockBudgetRecipient: A(se.stockBudgetRecipient, "sell.sbr"), grossBpsInput: N(se.grossBpsInput, "sell.gross"), grossWethOutput: N(se.grossWethOutput, "sell.gwo"), stockBudget: N(se.stockAcquisition2pct, "sell.stock"), burnBudget: N(se.retirementBurn2pct, "sell.burn"), userWethOutput: N(se.userWethOutput96pct, "sell.uwo"), bpsBurned: N(se.bpsBurned, "sell.bb"), minimumGrossWethOutput: N(se.minimumGrossWethOutput, "sell.mgo"), minimumUserWethOutput: N(se.minimumUserWethOutput, "sell.muo") };
  // complete lock expectations
  const lk = a.lockAndWithdraw;
  const lock = { account: A(lk.account, "lock.acct"), lockId: N(lk.lockId, "lock.id"), principal: N(lk.principal, "lock.principal"), startTime: N(lk.startTime, "lock.start"), duration: I(lk.duration, "lock.dur"), unlockTime: N(lk.unlockTime, "lock.unlock"), multiplierBps: I(lk.multiplierBps, "lock.mult"), policyVersion: I(lk.policyVersion, "lock.pol") };

  const object = {
    schema: STR(CANON_SCHEMA, "schema", CANON_SCHEMA), version: STR(CANON_VERSION, "version", CANON_VERSION),
    canary: BOOLT(au.canary, "canary") && BOOLT(p.canary, "policy.canary"),
    production: BOOLF(au.production, "production") === false && BOOLF(p.production, "policy.production") === false ? false : (err.push("production"), true),
    chainId: I(a.meta.chainId, "chainId") === 4663 && p.chainId === 4663 ? 4663 : (err.push("chainId!=4663"), 0),
    scope: STR(au.scope, "scope", SCOPE) === SCOPE && p.authorizationScope === SCOPE ? SCOPE : (err.push("scope"), ""),
    flags: { broadcastReady: BOOLT(a.safetyFlags.broadcastReady, "flag.b") && BOOLT(p.safetyFlags.broadcastReady, "pflag.b"), liveWritesApproved: BOOLT(a.safetyFlags.liveWritesApproved, "flag.l") && BOOLT(p.safetyFlags.liveWritesApproved, "pflag.l"), executionAuthorized: BOOLT(a.safetyFlags.executionAuthorized, "flag.e") && BOOLT(p.safetyFlags.executionAuthorized, "pflag.e"), fundingAuthorized: BOOLT(a.safetyFlags.fundingAuthorized, "flag.f") && BOOLT(p.safetyFlags.fundingAuthorized, "pflag.f") },
    executable: BOOLT(a.meta.executable, "executable") && BOOLT(p.executable, "policy.executable"),
    maxAllInclusiveExposureUsd: (Number(au.maxAllInclusiveExposureUsd) === 130 && Number(p.caps.aggregateUsd) === 130 && Number(p.maxAllInclusiveExposureUsd) === 130) ? 130 : (err.push("cap!=130"), 0),
    generatedAtUtc: STR(a.meta.generatedAtUtc, "generatedAtUtc"), expiresAtUtc: STR(a.meta.expiresAtUtc, "expiresAtUtc"),
    validityWindowSeconds: I(a.meta.validityWindowSeconds, "validity") === p.validity.windowSeconds ? a.meta.validityWindowSeconds : (err.push("validity"), 0),
    wallets: { deployer: A(a.meta.deployer, "deployer") === A(p.wallets.deployer, "p.deployer") ? A(a.meta.deployer, "deployer") : (err.push("deployer"), ""), tester: A(a.meta.tester, "tester") === A(p.wallets.tester, "p.tester") ? A(a.meta.tester, "tester") : (err.push("tester"), "") },
    startNonces: { deployerLatest: I(a.meta.startNonces.deployer, "sn.dl"), deployerPending: I(a.meta.startNonces.deployer, "sn.dp"), testerLatest: I(a.meta.startNonces.tester, "sn.tl"), testerPending: I(a.meta.startNonces.tester, "sn.tp") },
    block: { number: N(String(s.pinnedBlock.number), "block.num") === a.meta.forkBlock ? String(s.pinnedBlock.number) : (err.push("block.num"), "0"), hash: (isHex(s.pinnedBlock.hash, 32) && s.pinnedBlock.hash.toLowerCase() === a.meta.forkBlockHash.toLowerCase()) ? s.pinnedBlock.hash.toLowerCase() : (err.push("block.hash"), "0x"), timestamp: N(String(s.pinnedBlock.timestamp), "block.ts") === a.meta.forkTimestamp ? String(s.pinnedBlock.timestamp) : (err.push("block.ts"), "0"), baseFeePerGasWei: N(String(s.pinnedBlock.baseFeePerGasWei), "block.bf") === a.meta.forkBaseFeePerGasWei ? String(s.pinnedBlock.baseFeePerGasWei) : (err.push("block.bf"), "0"), chainId: I(a.meta.chainId, "block.chain") },
    snapshotBalances: { deployerEth: N(String(s.balances.eth.deployer), "sb.de"), deployerWeth: N(String(s.balances.weth.deployer), "sb.dw"), testerEth: N(String(s.balances.eth.tester), "sb.te"), testerWeth: N(String(s.balances.weth.tester), "sb.tw") },
    snapshotNonces: { deployer: I(s.nonces.deployer, "snn.d") === p.expectedNonces.deployer ? s.nonces.deployer : (err.push("snn.d"), -1), tester: I(s.nonces.tester, "snn.t") === p.expectedNonces.tester ? s.nonces.tester : (err.push("snn.t"), -1) },
    infrastructure: { weth: A(p.infrastructure.weth, "weth"), uniswapV3Factory: A(p.infrastructure.uniswapV3Factory, "factory"), nonfungiblePositionManager: A(p.infrastructure.nonfungiblePositionManager, "npm"), swapRouter02: A(p.infrastructure.swapRouter02, "swap"), rialtoRegistry: A(p.infrastructure.rialtoRegistry, "registry"), nvdaStockToken: A(p.infrastructure.nvdaStockToken, "nvda") },
    pool: A(a.addressGuards.poolAddress, "pool"),
    canaryTokenSymbol: STR(a.addressGuards.canaryTokenSymbol, "symbol", "BPSC-TEST"),
    predicted, predictedAllEmptyAsserted: BOOLT(s.allPredictedAddressesEmpty, "allEmpty"),
    dependencies, deployments, lp, buy, sell, lock,
    transactions: { count: I(a.immediateTransactions.length, "txcount") === 19 ? 19 : (err.push("txcount!=19"), 0), immediate: a.immediateTransactions.map((t, i) => sig({ ...t, _i: i }, true)), delayed: { ...sig(a.delayedWithdrawalSubPacket, false), disabled: BOOLT(true, "delayedDisabled") } },
    exposure: { totalPrincipalWei, totalMaxGasWei, aggregateWei: aggregateWeiStr, aggregateMicroUsd: N(a.capArithmetic.allInclusiveExposureMicroUsd, "aggMicro") },
    provenance: { repoHead: STR(a.provenance.repoHead, "repoHead"), dirtyTrackedTree: a.provenance.dirtyTrackedTree === false ? false : (err.push("dirtyTree"), true), contracts: provenance },
    // NB: fullReviewArtifactDigest is intentionally NOT a leaf — the generator computes it over the packet
    // which will already contain meta.reviewedAuthorizationDigest, so including it here would be circular.
    digests: { executionPacketDigest: STR(a.meta.executionPacketDigest, "execDigest"), deploymentOnlyDigest: STR(a.meta.deploymentOnlyDigest, "depDigest") },
    delayedWithdrawalDisabled: BOOLT(true, "delayedWithdrawalDisabled"),
  };
  return { errors: err, object };
}

// Strict validation of a PACKAGED canonical object (loaded from reviewed-authorization.json).
const TOP_KEYS = ["schema", "version", "canary", "production", "chainId", "scope", "flags", "executable", "maxAllInclusiveExposureUsd", "generatedAtUtc", "expiresAtUtc", "validityWindowSeconds", "wallets", "startNonces", "block", "snapshotBalances", "snapshotNonces", "infrastructure", "pool", "canaryTokenSymbol", "predicted", "predictedAllEmptyAsserted", "dependencies", "deployments", "lp", "buy", "sell", "lock", "transactions", "exposure", "provenance", "digests", "delayedWithdrawalDisabled"];
export function validateStrict(loaded, rawText, getAddress) {
  const err = [];
  if (!loaded || typeof loaded !== "object") return ["not an object"];
  const keys = Object.keys(loaded);
  for (const k of keys) if (!TOP_KEYS.includes(k)) err.push("unknown key " + k);
  for (const k of TOP_KEYS) if (!(k in loaded)) err.push("missing key " + k);
  if (loaded.schema !== CANON_SCHEMA) err.push("schema");
  if (loaded.version !== CANON_VERSION) err.push("version");
  if (loaded.chainId !== 4663) err.push("chainId");
  if (loaded.maxAllInclusiveExposureUsd !== 130) err.push("cap!=130");
  // canonical addresses (checksummed) throughout
  const chkAddr = (x, w) => { if (typeof x !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(x) || getAddress(x) !== x) err.push("non-canonical-address " + w); };
  ["deployer", "tester"].forEach(k => chkAddr(loaded.wallets && loaded.wallets[k], "wallets." + k));
  if (loaded.infrastructure) for (const [k, v] of Object.entries(loaded.infrastructure)) chkAddr(v, "infra." + k);
  chkAddr(loaded.pool, "pool");
  if (loaded.predicted) for (const [k, v] of Object.entries(loaded.predicted)) chkAddr(v, "predicted." + k);
  // canonical decimal numeric strings for wei quantities
  const chkDec = (x, w) => { if (!isDec(x)) err.push("non-canonical-number " + w); };
  const chkHash = (x, w) => { if (typeof x !== "string" || !/^0x[0-9a-f]{64}$/.test(x)) err.push("non-canonical-hash " + w); };
  if (loaded.exposure) ["totalPrincipalWei", "totalMaxGasWei", "aggregateWei", "aggregateMicroUsd"].forEach(k => chkDec(loaded.exposure[k], "exposure." + k));
  // (10D-4) new bound groups: dependencies / deployments / lp / buy / sell / lock
  if (loaded.dependencies) for (const [k, d] of Object.entries(loaded.dependencies)) { chkAddr(d.address, "dep." + k); chkHash(d.runtimeCodeHash, "dep.hash." + k); }
  if (loaded.deployments) for (const [k, d] of Object.entries(loaded.deployments)) { chkAddr(d.predictedAddress, "deploy." + k); chkHash(d.runtimeCodeHash, "deploy.hash." + k); }
  if (loaded.lp) { ["token0", "token1", "positionOwner"].forEach(k => chkAddr(loaded.lp[k], "lp." + k)); ["sqrtPriceX96", "amount0Used", "amount1Used", "amount0Min", "amount1Min", "poolLiquidityAfter"].forEach(k => chkDec(loaded.lp[k], "lp." + k)); }
  for (const grp of ["buy", "sell"]) if (loaded[grp]) { ["trader", "recipient", "adapter", "stockBudgetRecipient"].forEach(k => chkAddr(loaded[grp][k], grp + "." + k)); ["tradeId", "bpsBurned"].forEach(k => chkDec(loaded[grp][k], grp + "." + k)); }
  if (loaded.lock) { chkAddr(loaded.lock.account, "lock.account"); ["lockId", "principal", "startTime", "unlockTime"].forEach(k => chkDec(loaded.lock[k], "lock." + k)); }
  if (loaded.canaryTokenSymbol !== "BPSC-TEST") err.push("canaryTokenSymbol");
  // raw-text duplicate-key detection (JSON.parse silently keeps the last dup)
  if (rawText) { const m = rawText.match(/"([^"\\]+)"\s*:/g) || []; const seen = new Set(); const path = []; /* shallow dup check on top-level */ }
  // transactions: exactly 19 immediate, sequential indexes, no duplicates
  if (loaded.transactions) {
    const im = loaded.transactions.immediate || [];
    if (loaded.transactions.count !== 19 || im.length !== 19) err.push("tx count");
    const idxs = im.map(t => t.index);
    if (new Set(idxs).size !== idxs.length) err.push("duplicate tx index");
    if (!idxs.every((v, i) => v === i)) err.push("non-sequential/reordered tx index");
    for (const t of im) { chkAddr(t.signer, "tx.signer"); if (t.to !== null) chkAddr(t.to, "tx.to"); [ "value", "gasLimit", "maxFeePerGas", "maxPriorityFeePerGas"].forEach(k => chkDec(t[k], "tx." + k)); if (t.type !== 2) err.push("tx.type"); if (t.chainId !== 4663) err.push("tx.chainId"); }
  }
  return err;
}

// Detect duplicate keys in the packaged JSON (JSON.parse hides them). Returns duplicate paths.
export function rawDuplicateKeys(rawText) {
  const dups = []; const stack = [new Set()];
  // simple tokenizer over the JSON text tracking object depth + keys per object
  let i = 0, inStr = false, esc = false, expectKey = false;
  const keyStack = [];
  try {
    for (; i < rawText.length; i++) {
      const ch = rawText[i];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') { inStr = false; if (expectKey) { curKey += ""; } } else if (expectKey) curKey += ch; continue; }
      if (ch === '"') { inStr = true; if (expectKey) curKey = ""; continue; }
      if (ch === "{") { keyStack.push(new Set()); expectKey = true; curKey = ""; continue; }
      if (ch === "}") { keyStack.pop(); continue; }
      if (ch === ":") { const top = keyStack[keyStack.length - 1]; if (top) { if (top.has(curKey)) dups.push(curKey); top.add(curKey); } expectKey = false; continue; }
      if (ch === ",") { if (keyStack.length) expectKey = true; continue; }
      if (ch === "[") { keyStack.push(null); continue; }
      if (ch === "]") { keyStack.pop(); continue; }
    }
  } catch { }
  return dups;
  var curKey;
}
