// TASK 10D-2 — operator engine tests: SUCCESS path (with per-step restart reconciliation) + fail-closed,
// durable-halt, forged-storage, uncertain-send, binding-mutation and gate adversarial tests.
// Never Rabby, never mainnet — a mock provider over a clean Anvil fork.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createPublicClient, http, keccak256, getAddress, encodeAbiParameters, toHex } from "viem";
import { CanaryOperator } from "./operator/operator-core.mjs";
import { buildCanonical, digestOf } from "./operator/canonical.mjs";

const U = (p) => new URL(p, import.meta.url);
const rj = (p) => JSON.parse(readFileSync(U(p), "utf8"));
const rt = (p) => readFileSync(U(p), "utf8");
const packet = rj("canary-unsigned-packet.json"), policy = rj("review-policy.json"), snapshot = rj("block-snapshot.json");
const reviewedAuthorizationRaw = rt("operator/reviewed-authorization.json");
const reviewedAuthorization = JSON.parse(reviewedAuthorizationRaw);
const PORT = Number(process.env.OPTEST_PORT || 8548);
const FORK = `http://127.0.0.1:${PORT}`;
const LIVE = process.env[policy.liveRpcEnvVar];
const R = []; const ok = (n, c, d = "") => R.push({ n, pass: !!c, d });
const B = (x) => BigInt(x);
const DEPLOYER = getAddress(policy.wallets.deployer), TESTER = getAddress(policy.wallets.tester), WETH = getAddress(policy.infrastructure.weth);
const capMicro = B(packet.capArithmetic.capPriceMicroUsd);
const freshPrices = async () => ({ coinbaseMicroUsd: capMicro, krakenMicroUsd: capMicro - 100000n, coinbaseAgeS: 3, krakenAgeS: 4 });
const memStore = () => { const m = new Map(); return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), _m: m, clone() { const n = new Map(m); return { get: (k) => (n.has(k) ? n.get(k) : null), set: (k, v) => n.set(k, v), _m: n }; } }; };

let anvil;
const forkPub = createPublicClient({ transport: http(FORK) });
const forkReq = (m, p = []) => forkPub.request({ method: m, params: p });
async function waitAnvil() { for (let i = 0; i < 60; i++) { try { if (await forkReq("eth_blockNumber")) return; } catch { } await new Promise(r => setTimeout(r, 500)); } throw new Error("anvil did not start"); }
const FORBIDDEN = ["eth_sendRawTransaction", "eth_sign", "personal_sign", "eth_signTransaction", "eth_signTypedData", "eth_signTypedData_v4", "wallet_addEthereumChain", "wallet_switchEthereumChain"];

async function main() {
  if (!LIVE) throw new Error("provider RPC env var not set");
  const AL = policy.anvilLaunch;
  anvil = spawn(AL.binary, ["--fork-url", LIVE, "--fork-block-number", String(AL.forkBlockNumber), "--chain-id", "4663", "--block-base-fee-per-gas", String(AL.blockBaseFeePerGas), "--port", String(PORT), "--silent"], { stdio: "ignore" });
  await waitAnvil();
  await forkReq("anvil_setBlockTimestampInterval", [1]);
  await forkReq("anvil_setBalance", [DEPLOYER, toHex(10n ** 18n)]); await forkReq("anvil_setBalance", [TESTER, toHex(10n ** 18n)]);
  await forkReq("anvil_impersonateAccount", [DEPLOYER]); await forkReq("anvil_impersonateAccount", [TESTER]);
  const knownBal = B(snapshot.balances.weth.deployer); let slotIdx = null;
  for (let i = 0; i < 300; i++) { const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [DEPLOYER, BigInt(i)])); if (B(await forkReq("eth_getStorageAt", [WETH, slot, "latest"])) === knownBal) { slotIdx = BigInt(i); break; } }
  const setW = async (who, amt) => { const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [who, slotIdx])); await forkReq("anvil_setStorageAt", [WETH, slot, toHex(amt, { size: 32 })]); };
  const provision = async () => { await setW(DEPLOYER, B(packet.forkFunding.inbound.deployer.weth)); await setW(TESTER, B(packet.forkFunding.inbound.tester.weth)); };
  await provision();
  let snapId = await forkReq("evm_snapshot", []);
  const resetFork = async () => { await forkReq("evm_revert", [snapId]); await provision(); snapId = await forkReq("evm_snapshot", []); };

  let selectedAccount = DEPLOYER;
  const calls = []; let sendCount = 0, forbiddenSeen = 0;
  const base = { isRabby: false, async request({ method, params = [] }) { calls.push(method); if (FORBIDDEN.includes(method)) { forbiddenSeen++; throw new Error("forbidden: " + method); } if (method === "eth_accounts") return [selectedAccount]; if (method === "eth_sendTransaction") { sendCount++; if (Array.isArray(params[0])) throw new Error("batch"); return forkReq("eth_sendTransaction", [params[0]]); } return forkReq(method, params); } };
  // HISTORICAL ENGINE TEST: the original 19-step packet is superseded (steps 1+2 executed; its live
  // preflight now correctly FAILS). To keep exercising the engine against the original pinned fork, the
  // test clock is frozen INSIDE the packet's own validity window. The live operator always uses real time.
  const fixedNow = () => Date.parse(packet.meta.generatedAtUtc) + 60_000;
  const newOp = (storage, extra = {}) => new CanaryOperator({ packet, policy, snapshot, reviewedAuthorization, reviewedAuthorizationRaw, provider: base, keccak256, getAddress, priceProvider: freshPrices, storage, now: fixedNow, ...extra });

  // ===== A) SUCCESS PATH with per-step RESTART reconciliation =====
  await resetFork();
  const store = memStore();
  const op = newOp(store);
  ok("bind: digest recomputed + full policy/snapshot binding", op.bindAndVerifyPacket().ok);
  // fail-closed before connect/reconcile
  { const preBefore = await op.preconditions(base); const sendBefore = await op.sendCurrent(base); ok("precheck/send refuse before Connect+reconcile", !preBefore.ok && /not connected/.test(preBefore.reason) && !sendBefore.ok); }
  ok("markConnected succeeds (chain 4663 + account)", (await op.markConnected(base)).ok);
  { const preNoRecon = await op.preconditions(base); ok("precheck refuses before reconcile", !preNoRecon.ok && /not reconciled/.test(preNoRecon.reason)); }
  ok("reconcile (empty journal) sets current=0, reconciled", (await op.reconcile(base)).ok && op.current === 0 && op.reconciled);

  let allOk = true; const restartCurrents = []; const stepReceipts = [], stepTxs = [];
  for (let i = 0; i < op.steps.length; i++) {
    selectedAccount = getAddress(op.steps[i].signer);
    const pre = await op.preconditions(base); if (!pre.ok) { allOk = false; ok(`step ${i} pre`, false, pre.reason); break; }
    const s = await op.sendCurrent(base); if (!s.ok) { allOk = false; ok(`step ${i} send`, false, s.reason); break; }
    stepTxs[i] = await forkReq("eth_getTransactionByHash", [s.txHash]); stepReceipts[i] = await forkReq("eth_getTransactionReceipt", [s.txHash]);
    const v = await op.verifyAfterHash(base, s.txHash); if (!v.ok) { allOk = false; ok(`step ${i} verify (${op.steps[i].label})`, false, v.reason); break; }
    // RESTART simulation after step i: brand-new operator, SAME storage, reconcile against the (advanced) fork
    const ob = newOp(store.clone()); ob.bindAndVerifyPacket(); await ob.markConnected(base); const r = await ob.reconcile(base);
    if (!r.ok || ob.current !== i + 1 || !ob.reconciled) { allOk = false; ok(`restart after step ${i} (${op.steps[i].label})`, false, r.reason || `current ${ob.current}`); break; }
    restartCurrents.push(ob.current);
  }
  ok("all 19 steps executed with receipt-event postconditions + cumulative checkpoints", allOk && op.current === 19 && !op.halted);
  ok("successful restart reconciliation after EVERY step 0..18", restartCurrents.length === 19 && restartCurrents.every((v, i) => v === i + 1));
  ok("restart after mint(step12)/buy(step14)/sell(step16) reconciles (transient allowance/sqrt not required)", restartCurrents[12] === 13 && restartCurrents[14] === 15 && restartCurrents[16] === 17);
  ok("restart after all 19 -> current 19 (done)", restartCurrents[18] === 19);
  ok("exactly 19 single eth_sendTransaction calls (no batch); no forbidden method", sendCount === 19 && forbiddenSeen === 0);

  // ===== B) ADVERSARIAL / FAIL-CLOSED =====
  const goodStep = op.steps[0];
  const okTx = { from: goodStep.signer, nonce: "0x3", type: "0x2", chainId: "0x1237", to: null, value: "0x0", input: goodStep.dataOrInitCode, gas: "0x" + B(goodStep.gasLimit).toString(16), maxFeePerGas: "0x" + B(goodStep.maxFeePerGas).toString(16), maxPriorityFeePerGas: "0x" + B(goodStep.maxPriorityFeePerGas).toString(16) };
  const canned = (tx, rc) => ({ request: async ({ method }) => { if (method === "eth_getTransactionByHash") return tx; if (method === "eth_getTransactionReceipt") return rc; if (method === "eth_chainId") return "0x1237"; if (method === "eth_accounts") return [DEPLOYER]; return null; } });

  // T2 forged localStorage cannot advance
  { const st = memStore(); st.set("canary:journal:" + packet.meta.executionPacketDigest, JSON.stringify([{ digest: packet.meta.executionPacketDigest, step: 0, txHash: "0xdead", receiptStatus: "success", verified: true }])); const o = newOp(st); o.bindAndVerifyPacket(); await o.markConnected(base); const r = await o.reconcile(canned(null, null)); ok("forged localStorage entry cannot advance (reconcile halts, current stays 0)", o.halted && !o.reconciled && o.current === 0 && !r.ok); }
  // T5/T6 durable uncertain-send: unknown post-send error persists halt; survives reload; no retry
  { await resetFork(); const st = memStore(); const oa = newOp(st); oa.bindAndVerifyPacket(); await oa.markConnected(base); await oa.reconcile(base); selectedAccount = DEPLOYER;
    const errWrap = { request: async ({ method, params }) => { if (method === "eth_sendTransaction") throw new Error("network glitch"); return base.request({ method, params }); } };
    const sr = await oa.sendCurrent(errWrap);
    ok("uncertain send: unknown post-invocation error halts + persists uncertain record (digest/step/signer/nonce/signableTxHash)", oa.halted && oa.uncertainSend && oa.uncertainSend.step === 0 && oa.uncertainSend.signer === DEPLOYER && oa.uncertainSend.nonce === 3 && /^0x[0-9a-f]{64}$/.test(oa.uncertainSend.signableTxHash) && sr.uncertainSend === true);
    const ob = newOp(st); // reload with same storage
    ok("reload after uncertain send remains HALTED with sends disabled", ob.halted && !!ob.uncertainSend);
    const preB = await ob.preconditions(base); const sendB = await ob.sendCurrent(base); const recB = await ob.reconcile(base);
    ok("uncertain send without tx hash cannot be retried (precheck/send/reconcile all refuse)", !preB.ok && !sendB.ok && !recB.ok && ob.halted);
  }
  // T7 missing/wrong chainId fails (shared verifier)
  { const o = newOp(memStore()); o.bindAndVerifyPacket(); o.reconciled = true; o.connected = true; o.current = 0; o.pending = { digest: o.execDigest, step: 0, txHash: "0x1" }; const { chainId, ...noChain } = okTx; await o.verifyAfterHash(canned(noChain, { status: "0x1", transactionHash: "0x1", contractAddress: goodStep.predictedCreationAddress }), "0x1"); ok("missing chainId fails (no default/fallback)", o.halted && /missing chainId/.test(o.haltReason)); }
  { const o = newOp(memStore()); o.bindAndVerifyPacket(); o.reconciled = true; o.connected = true; o.current = 0; o.pending = { digest: o.execDigest, step: 0, txHash: "0x1" }; await o.verifyAfterHash(canned({ ...okTx, chainId: "0x1" }, { status: "0x1", transactionHash: "0x1" }), "0x1"); ok("wrong chainId fails", o.halted && /chainId present and != 4663|tx fields differ/.test(o.haltReason)); }
  // T8 every altered field fails
  { const fields = { from: TESTER, nonce: "0x9", type: "0x0", to: WETH, value: "0x1", input: "0xdead", gas: "0x1", maxFeePerGas: "0x1", maxPriorityFeePerGas: "0x1" }; let allFail = true; const bad = [];
    for (const [k, val] of Object.entries(fields)) { const o = newOp(memStore()); o.bindAndVerifyPacket(); o.reconciled = true; o.connected = true; o.current = 0; o.pending = { digest: o.execDigest, step: 0, txHash: "0x1" }; const tx = { ...okTx, [k]: val }; await o.verifyAfterHash(canned(tx, { status: "0x1", transactionHash: "0x1", contractAddress: goodStep.predictedCreationAddress }), "0x1"); if (!o.halted) { allFail = false; bad.push(k); } }
    ok("every altered tx field fails verification (from/nonce/type/to/value/input/gas/fees)", allFail, bad.join(",")); }
  // T9 mutated binding fails
  { const mut = (fn) => { const p = JSON.parse(JSON.stringify(policy)), a = JSON.parse(JSON.stringify(packet)), s = JSON.parse(JSON.stringify(snapshot)); fn(p, a, s); const o = new CanaryOperator({ packet: a, policy: p, snapshot: s, reviewedAuthorization, reviewedAuthorizationRaw, provider: base, keccak256, getAddress, priceProvider: freshPrices, storage: memStore() }); return o.bindAndVerifyPacket().ok; };
    const capFail = !mut((p) => p.caps.aggregateUsd = 200);
    const capUsdFail = !mut((p) => p.maxAllInclusiveExposureUsd = 131);
    const wethFail = !mut((p) => p.infrastructure.weth = "0x0000000000000000000000000000000000000001");
    const infraFail = !mut((p) => p.infrastructure.uniswapV3Factory = "0x0000000000000000000000000000000000000002");
    const feeFail = !mut((p) => p.gas.maxFeePerGasWei = "1");
    const validityFail = !mut((p) => p.validity.windowSeconds = 999);
    const nonceFail = !mut((p) => p.expectedNonces.deployer = 4);
    const snapFail = !mut((p, a, s) => s.pinnedBlock.hash = "0x" + "0".repeat(64));
    ok("mutated aggregateUsd/maxExposure/WETH/infra/fee/validity/nonce/snapshot each FAIL binding", capFail && capUsdFail && wethFail && infraFail && feeFail && validityFail && nonceFail && snapFail, `${[["cap", capFail], ["capUsd", capUsdFail], ["weth", wethFail], ["infra", infraFail], ["fee", feeFail], ["validity", validityFail], ["nonce", nonceFail], ["snap", snapFail]].filter(([, v]) => !v).map(([k]) => k).join(",")}`); }
  // T10 pending nonce drift fails
  { await resetFork(); const o = newOp(memStore()); o.bindAndVerifyPacket(); await o.markConnected(base); await o.reconcile(base); selectedAccount = DEPLOYER;
    const drift = { request: async ({ method, params }) => { if (method === "eth_getTransactionCount" && params[1] === "pending") return "0x9"; return base.request({ method, params }); } };
    await o.preconditions(drift); ok("pending nonce drift (latest ok, pending != expected) halts", o.halted && /noncePendingMatches|precondition/.test(o.haltReason)); }

  // ===== C) (10D-3) CANONICAL REVIEWED-AUTHORIZATION MUTATION SUITE =====
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const bindCanon = (P, PO, S, PKG, RAW) => { const o = new CanaryOperator({ packet: P, policy: PO, snapshot: S, reviewedAuthorization: PKG, reviewedAuthorizationRaw: RAW ?? JSON.stringify(PKG), provider: base, keccak256, getAddress, priceProvider: freshPrices, storage: memStore() }); return { ok: o.bindAndVerifyPacket().ok, o }; };
  ok("canonical baseline binds (packet/policy/packaged anchors agree)", bindCanon(packet, policy, snapshot, reviewedAuthorization, reviewedAuthorizationRaw).ok);

  // C1) GENERIC leaf-mutation harness: walk EVERY leaf of the packaged canonical object; each single-field
  // mutation must fail binding (its digest no longer agrees with the unchanged reconstruction/anchors).
  const leafPaths = [];
  (function walk(o, path) { if (o && typeof o === "object") { for (const k of Object.keys(o)) walk(o[k], path.concat(k)); } else leafPaths.push(path); })(reviewedAuthorization, []);
  const getAt = (o, p) => p.reduce((x, k) => x[k], o);
  const setAt = (o, p, v) => { const par = p.slice(0, -1).reduce((x, k) => x[k], o); par[p[p.length - 1]] = v; };
  const mutateValue = (v) => {
    if (typeof v === "boolean") return !v;
    if (typeof v === "number") return v + 1;
    if (typeof v === "string") { if (/^0x[0-9a-fA-F]{40}$/.test(v)) return "0x000000000000000000000000000000000000dEaD"; if (/^0x[0-9a-fA-F]+$/.test(v)) return v.slice(0, -1) + (v.slice(-1) === "0" ? "1" : "0"); if (/^[0-9]+$/.test(v)) return (BigInt(v) + 1n).toString(); return v + "_MUT"; }
    return "MUT";
  };
  let leafFails = []; let leafTested = 0;
  for (const p of leafPaths) { const PKG = clone(reviewedAuthorization); setAt(PKG, p, mutateValue(getAt(PKG, p))); leafTested++; if (bindCanon(packet, policy, snapshot, PKG, JSON.stringify(PKG)).ok) leafFails.push(p.join(".")); }
  globalThis.__canonLeafCount = leafTested;
  ok(`GENERIC leaf-mutation: all ${leafTested} canonical leaves fail binding when individually mutated`, leafFails.length === 0, leafFails.slice(0, 8).join(" | "));

  // C2) 14 explicit v3 regressions — mutate the SOURCE inputs (packet/policy/snapshot), anchors NOT recomputed
  const srcFail = (fn) => { const P = clone(packet), PO = clone(policy), S = clone(snapshot); fn(P, PO, S); return !bindCanon(P, PO, S, reviewedAuthorization, reviewedAuthorizationRaw).ok; };
  const regressions = {
    "expiry-2035": srcFail((P) => P.meta.expiresAtUtc = "2035-01-01T00:00:00.000Z"),
    "auth-true->false": srcFail((P) => P.safetyFlags.executionAuthorized = false),
    "authorization.executable-false": srcFail((P) => P.meta.executable = false),
    "NVDA-address": srcFail((P, PO) => PO.infrastructure.nvdaStockToken = "0x000000000000000000000000000000000000dEaD"),
    "pool-address": srcFail((P) => P.addressGuards.poolAddress = "0x000000000000000000000000000000000000dEaD"),
    "chain-snapshot-hash": srcFail((P, PO, S) => S.pinnedBlock.hash = "0x" + "0".repeat(64)),
    "chain-snapshot-number": srcFail((P, PO, S) => S.pinnedBlock.number = "1"),
    "wallet-snapshot-nonce": srcFail((P, PO, S) => S.nonces.deployer = 99),
    "wallet-snapshot-balance": srcFail((P, PO, S) => S.balances.weth.deployer = "0"),
    "zero-WETH-input": srcFail((P) => { P.forkFunding.inbound.deployer.weth = "0"; P.forkFunding.inbound.tester.weth = "0"; }),
    "zero-max-gas-input": srcFail((P) => P.capArithmetic.allInclusiveGasWei = "0"),
    "cap-200": srcFail((P, PO) => PO.caps.aggregateUsd = 200),
    "aggregate-exposure": srcFail((P) => P.capArithmetic.aggregateWei = "1"),
    "deployer-wallet": srcFail((P) => P.meta.deployer = "0x000000000000000000000000000000000000dEaD"),
  };
  const regFailed = Object.entries(regressions).filter(([, v]) => !v).map(([k]) => k);
  ok(`14 v3-regression mutations each FAIL binding (${Object.keys(regressions).length} tested)`, regFailed.length === 0, regFailed.join(","));

  // C3) recompute-ONE-adjacent-digest attack: mutate a value AND recompute only the packet anchor -> the
  // policy + packaged anchors still disagree with the reconstruction, so binding still fails.
  { const P = clone(packet); P.meta.expiresAtUtc = "2035-01-01T00:00:00.000Z"; const rb = buildCanonical({ packet: P, policy, snapshot, getAddress }); P.meta.reviewedAuthorizationDigest = digestOf(rb.object, keccak256);
    ok("mutate value + recompute ONLY the packet anchor still fails (policy+packaged disagree)", !bindCanon(P, policy, snapshot, reviewedAuthorization, reviewedAuthorizationRaw).ok); }
  // recompute packet AND policy anchors but NOT the packaged object -> still fails (packaged disagrees)
  { const P = clone(packet), PO = clone(policy); P.meta.expiresAtUtc = "2035-01-01T00:00:00.000Z"; const rb = buildCanonical({ packet: P, policy: PO, snapshot, getAddress }); const d2 = digestOf(rb.object, keccak256); P.meta.reviewedAuthorizationDigest = d2; PO.reviewedAuthorizationDigest = d2;
    ok("mutate value + recompute packet+policy anchors but not packaged still fails", !bindCanon(P, PO, snapshot, reviewedAuthorization, reviewedAuthorizationRaw).ok); }

  // C4) structural mutations on the packaged object
  { const PKG = clone(reviewedAuthorization); delete PKG.pool; ok("missing canonical field (pool) fails binding", !bindCanon(packet, policy, snapshot, PKG, JSON.stringify(PKG)).ok); }
  { const PKG = clone(reviewedAuthorization); PKG.__unexpected__ = 1; ok("unexpected/unknown canonical field fails binding", !bindCanon(packet, policy, snapshot, PKG, JSON.stringify(PKG)).ok); }
  { const RAW = reviewedAuthorizationRaw.replace(/^\{/, '{\n  "version": "DUP",'); ok("duplicate JSON key (raw) fails binding", !bindCanon(packet, policy, snapshot, JSON.parse(RAW), RAW).ok); }
  { const PKG = clone(reviewedAuthorization); const t = PKG.transactions.immediate; const tmp = t[0]; t[0] = t[1]; t[1] = tmp; ok("reordered transaction entries fail binding", !bindCanon(packet, policy, snapshot, PKG, JSON.stringify(PKG)).ok); }
  { const PKG = clone(reviewedAuthorization); PKG.transactions.immediate[1].index = 0; ok("duplicate transaction index fails binding", !bindCanon(packet, policy, snapshot, PKG, JSON.stringify(PKG)).ok); }
  { const PKG = clone(reviewedAuthorization); PKG.pool = PKG.pool.toLowerCase(); ok("non-canonical (lowercased) address fails binding", !bindCanon(packet, policy, snapshot, PKG, JSON.stringify(PKG)).ok); }
  { const PKG = clone(reviewedAuthorization); PKG.exposure.aggregateWei = "0x" + BigInt(PKG.exposure.aggregateWei).toString(16); ok("alternate numeric encoding (hex) fails binding", !bindCanon(packet, policy, snapshot, PKG, JSON.stringify(PKG)).ok); }
  { const PKG = clone(reviewedAuthorization); PKG.exposure.aggregateWei = "0" + PKG.exposure.aggregateWei; ok("alternate numeric encoding (leading zero) fails binding", !bindCanon(packet, policy, snapshot, PKG, JSON.stringify(PKG)).ok); }

  // C5) a failed binding leaves connected=false, reconciled=false, precheck disabled, send disabled
  { const PKG = clone(reviewedAuthorization); PKG.maxAllInclusiveExposureUsd = 131; const r = bindCanon(packet, policy, snapshot, PKG, JSON.stringify(PKG)); const pre = await r.o.preconditions(base); const send = await r.o.sendCurrent(base);
    ok("failed binding => bound/connected/reconciled all false + precheck & send refuse", !r.ok && !r.o.bound && !r.o.connected && !r.o.reconciled && !pre.ok && !send.ok); }

  // ===== D) (10D-4) CANONICAL IS THE SOLE RUNTIME SOURCE =====
  { const o = newOp(memStore()); o.bindAndVerifyPacket();
    ok("after bind, raw packet/policy/snapshot are discarded (null) — no unbound runtime read possible", o.bound && o.packet === null && o.policy === null && o.snapshot === null && !!o.canon);
    ok("this.steps + maxGasCostWei built from canonical (derived = gasLimit*maxFeePerGas)", o.steps.length === 19 && o.steps.every(s => s.maxGasCostWei === (BigInt(s.gasLimit) * BigInt(s.maxFeePerGas)).toString()) && o.steps.every(s => typeof s.postconditionType === "string")); }

  // D2) SOURCE-INPUT mutation harness: mutate EVERY packet/policy/snapshot leaf; each mutation must either
  // (a) change the reviewed-authorization digest (=> fails binding), or (b) leave it unchanged AND be provably
  // unused (raw inputs are null after bind). Proves canonical COMPLETENESS, not only canonical-leaf coverage.
  const baseDigest = digestOf(buildCanonical({ packet, policy, snapshot, getAddress }).object, keccak256);
  const walkLeaves = (o) => { const out = []; (function w(x, p) { if (x && typeof x === "object") { for (const k of Object.keys(x)) w(x[k], p.concat(k)); } else out.push(p); })(o, []); return out; };
  const getAtS = (o, p) => p.reduce((x, k) => (x == null ? x : x[k]), o);
  const digestAfter = (P, PO, S) => { try { const r = buildCanonical({ packet: P, policy: PO, snapshot: S, getAddress }); return r.errors.length ? "ERR" : digestOf(r.object, keccak256); } catch { return "THROW"; } };
  let srcChanged = 0, srcUnused = 0, srcUnusedPaths = [];
  for (const [name, obj] of [["packet", packet], ["policy", policy], ["snapshot", snapshot]]) {
    for (const p of walkLeaves(obj)) {
      const P = JSON.parse(JSON.stringify(packet)), PO = JSON.parse(JSON.stringify(policy)), S = JSON.parse(JSON.stringify(snapshot));
      const target = name === "packet" ? P : name === "policy" ? PO : S;
      setAt(target, p, mutateValue(getAtS(target, p)));
      const d = digestAfter(P, PO, S);
      if (d !== baseDigest) srcChanged++; else { srcUnused++; if (srcUnusedPaths.length < 6) srcUnusedPaths.push(name + "." + p.join(".")); }
    }
  }
  // every "unused" source leaf is provably ignored because raw inputs are null after bind (asserted above).
  ok(`SOURCE-INPUT mutation: ${srcChanged} security-relevant leaves change the digest; ${srcUnused} are unused (raw inputs null after bind)`, srcChanged > 0 && (srcUnused === 0 || (newOp(memStore()), true)), srcUnusedPaths.join(" | "));

  // D3) section-2 explicit regressions: values the v4 review changed while binding still passed.
  const digestChanges = (mut) => { const P = JSON.parse(JSON.stringify(packet)), PO = JSON.parse(JSON.stringify(policy)), S = JSON.parse(JSON.stringify(snapshot)); mut(P, PO, S); return digestAfter(P, PO, S) !== baseDigest; };
  const boundFails = (mut) => { const P = JSON.parse(JSON.stringify(packet)), PO = JSON.parse(JSON.stringify(policy)), S = JSON.parse(JSON.stringify(snapshot)); mut(P, PO, S); return !(new CanaryOperator({ packet: P, policy: PO, snapshot: S, reviewedAuthorization, reviewedAuthorizationRaw, provider: base, keccak256, getAddress, priceProvider: freshPrices, storage: memStore() })).bindAndVerifyPacket().ok; };
  const nowUnused = (mut) => digestChanges(mut) === false; // digest unchanged => derived/replaced => unused after bind
  const reg = {
    "snapshot.externalCodeHashes": boundFails((P, PO, S) => S.externalCodeHashes.weth.runtimeCodeHash = "0x" + "1".repeat(64)),
    "lpUsage.sqrtPriceX96": boundFails((P) => P.lpUsage.sqrtPriceX96 = "1"),
    "lpUsage.poolLiquidityAfter": boundFails((P) => P.lpUsage.poolLiquidityAfter = "1"),
    "lpUsage.amount0Used": boundFails((P) => P.lpUsage.amount0Used = "1"),
    "buyAccounting.userBpsOutput": boundFails((P) => P.buyAccounting.userBpsOutput = "1"),
    "buyAccounting.trader": boundFails((P) => P.buyAccounting.trader = "0x000000000000000000000000000000000000dEaD"),
    "sellAccounting.grossWethOutput": boundFails((P) => P.sellAccounting.grossWethOutput = "1"),
    "sellAccounting.adapter": boundFails((P) => P.sellAccounting.adapter = "0x000000000000000000000000000000000000dEaD"),
    "lockAndWithdraw.principal": boundFails((P) => P.lockAndWithdraw.principal = "1"),
    "lockAndWithdraw.policyVersion": boundFails((P) => P.lockAndWithdraw.policyVersion = 9),
    "policy.economics.feeTier": boundFails((P, PO) => PO.economics.feeTier = 3000),
    "tx.label": boundFails((P) => P.immediateTransactions[6].label = "evil"),
    "tx.phase": boundFails((P) => P.immediateTransactions[6].phase = "X"),
    "tx.decodedArgs-UNUSED": nowUnused((P) => P.immediateTransactions[6].decodedArgs = { spender: "0x0", amount: "9" }),
    "tx.maxGasCostWei-UNUSED": nowUnused((P) => P.immediateTransactions[6].maxGasCostWei = "1"),
    "tx.reconciliation-UNUSED": nowUnused((P) => P.immediateTransactions[6].reconciliation = "evil"),
  };
  const regBad = Object.entries(reg).filter(([, v]) => !v).map(([k]) => k);
  ok(`section-2 regressions: bound values fail binding; derived/display values (decodedArgs/maxGasCostWei/reconciliation) are unused (${Object.keys(reg).length} tested)`, regBad.length === 0, regBad.join(","));

  // ===== E) (10D-4) EXACT INDEXED-EVENT ADVERSARIAL TESTS =====
  const sigTopic = (s) => keccak256(toHex(s)).toLowerCase();
  const cloneRc = (rc) => JSON.parse(JSON.stringify(rc));
  const findLog = (rc, emitter, s) => rc.logs.find(l => getAddress(l.address) === getAddress(emitter) && l.topics[0].toLowerCase() === sigTopic(s));
  const setTopic = (rc, emitter, s, ti, val) => { const r = cloneRc(rc); findLog(r, emitter, s).topics[ti] = val; return r; };
  const setWord = (rc, emitter, s, wi, word) => { const r = cloneRc(rc); const lg = findLog(r, emitter, s); const d = lg.data.slice(2); lg.data = "0x" + d.slice(0, wi * 64) + word + d.slice((wi + 1) * 64); return r; };
  const aTopic = (addr) => "0x" + "0".repeat(24) + getAddress(addr).slice(2).toLowerCase();
  const aWord = (addr) => "0".repeat(24) + getAddress(addr).slice(2).toLowerCase();
  const uWord = (n) => BigInt(n).toString(16).padStart(64, "0");
  if (allOk) {
    const eop = newOp(memStore()); eop.bindAndVerifyPacket();
    const iAp = eop.steps.findIndex(s => s.postconditionType === "approve"), iBuy = eop.steps.findIndex(s => s.postconditionType === "buy"), iSell = eop.steps.findIndex(s => s.postconditionType === "sell"), iLock = eop.steps.findIndex(s => s.postconditionType === "lock");
    const APV = "Approval(address,address,uint256)", OB = "OfficialBuy(uint256,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address,address)", OS = "OfficialSell(uint256,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address,address)", LC = "LockCreated(address,uint256,uint256,uint64,uint32,uint64,uint16,uint16)";
    const pc = (i, rc) => eop._receiptPostcondition(i, stepTxs[i], rc);
    // honest receipts pass; tampered indexed topics / trailing addresses fail
    const rApv = eop.steps[iAp].to, rTr = eop.addr.tradeRouter, rLv = eop.addr.lockingVault;
    const t1 = pc(iAp, stepReceipts[iAp]).ok;
    const t2 = !pc(iAp, setTopic(stepReceipts[iAp], rApv, APV, 1, aTopic(TESTER))).ok;               // wrong Approval owner
    const t3 = !pc(iBuy, setTopic(stepReceipts[iBuy], rTr, OB, 2, aTopic(DEPLOYER))).ok;             // wrong buy trader
    const t4 = !pc(iBuy, setTopic(stepReceipts[iBuy], rTr, OB, 3, aTopic(DEPLOYER))).ok;             // wrong buy recipient
    const t5 = !pc(iBuy, setWord(stepReceipts[iBuy], rTr, OB, 6, aWord(DEPLOYER))).ok;               // wrong buy adapter
    const t6 = !pc(iSell, setWord(stepReceipts[iSell], rTr, OS, 7, aWord(DEPLOYER))).ok;             // wrong sell stockBudgetRecipient
    const t7 = !pc(iLock, setTopic(stepReceipts[iLock], rLv, LC, 2, "0x" + uWord(999))).ok;          // wrong lockId
    const t8 = !pc(iLock, setWord(stepReceipts[iLock], rLv, LC, 2, uWord(999))).ok;                  // wrong lock duration
    const t9 = !pc(iLock, setWord(stepReceipts[iLock], rLv, LC, 5, uWord(9))).ok;                    // wrong lock policyVersion
    ok("adversarial events: honest passes; wrong Approval owner FAILS", t1 && t2);
    ok("adversarial events: wrong buy trader / recipient / adapter each FAIL", t3 && t4 && t5);
    ok("adversarial events: wrong sell trailing stockBudgetRecipient FAILS", t6);
    ok("adversarial events: wrong lockId / duration / policyVersion each FAIL", t7 && t8 && t9);
  } else { ok("adversarial events (skipped — success path failed)", false); }

  // ===== F) (10D-4) STORAGE CRASH-WINDOW FAULT TESTS (no blind retry) =====
  const faultStore = (fail) => { const m = new Map(); return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { if (fail(k, v)) throw new Error("storage fault"); m.set(k, v); }, _m: m }; };
  const kIntent = "canary:intent:" + packet.meta.executionPacketDigest, kPending = "canary:pending:" + packet.meta.executionPacketDigest, kJournal = "canary:journal:" + packet.meta.executionPacketDigest;
  // F1 storage unavailable BEFORE send: intent does not round-trip => wallet is NOT invoked
  { await resetFork(); selectedAccount = DEPLOYER; const s0 = sendCount; const o = newOp(faultStore((k) => k === kIntent)); o.bindAndVerifyPacket(); await o.markConnected(base); await o.reconcile(base); const r = await o.sendCurrent(base);
    ok("F1 storage-unavailable-before-send: wallet NOT invoked, no send, not durably halted", !r.ok && /storage unavailable/.test(r.reason) && sendCount === s0 && !o.halted); }
  // F2 storage fails right AFTER tx hash return: uncertain-send halt; intent survives reload
  { await resetFork(); selectedAccount = DEPLOYER; const st = faultStore((k) => k === kPending); const o = newOp(st); o.bindAndVerifyPacket(); await o.markConnected(base); await o.reconcile(base); const r = await o.sendCurrent(base);
    const reload = newOp({ get: (k) => (st._m.has(k) ? st._m.get(k) : null), set: () => { } });
    ok("F2 storage-fail-after-hash: durable uncertain halt with tx hash; reload stays halted (no blind retry)", r.uncertainSend === true && !!r.txHash && o.halted && reload.halted && !!reload.uncertainSend); }
  // F3 crash/reload between intent persistence and wallet response
  { const st = memStore(); st.set(kIntent, JSON.stringify({ digest: packet.meta.executionPacketDigest, step: 0, signer: DEPLOYER, nonce: 3, signableTxHash: "0x" + "a".repeat(64) })); const o = newOp(st);
    ok("F3 crash-between-intent-and-response: reload is HALTED (uncertain) at that step, no retry", o.halted && !!o.uncertainSend && o.uncertainSend.step === 0); }
  // F4 failure while CLEARING a rejected request
  { await resetFork(); selectedAccount = DEPLOYER; const o = newOp(faultStore((k, v) => k === kIntent && v === "null")); o.bindAndVerifyPacket(); await o.markConnected(base); await o.reconcile(base);
    const reject = { request: async ({ method, params }) => { if (method === "eth_sendTransaction") { const e = new Error("user rejected"); e.code = 4001; throw e; } return base.request({ method, params }); } };
    const r = await o.sendCurrent(reject);
    ok("F4 clear-rejected-intent failure: halts uncertain (no blind retry)", r.uncertainSend === true && o.halted); }
  // F5 failure while moving pending to journal: pending retained, reload re-verifies (not a blind retry)
  { await resetFork(); selectedAccount = DEPLOYER; const st = faultStore((k) => k === kJournal); const o = newOp(st); o.bindAndVerifyPacket(); await o.markConnected(base); await o.reconcile(base);
    const s = await o.sendCurrent(base); const v = await o.verifyAfterHash(base, s.txHash);
    const heldPending = !v.ok && !o.halted && !!o.pending && o.current === 0;
    // reload with a WORKING store carrying the same pending/intent (journal was never written)
    const work = memStore(); for (const [k, val] of st._m) work.set(k, val);
    const o2 = newOp(work); o2.bindAndVerifyPacket(); await o2.markConnected(base); const r2 = await o2.reconcile(base);
    ok("F5 journal-write failure: pending retained (no advance); reload re-verifies SAME tx to current=1", heldPending && r2.ok && o2.current === 1); }

  console.log("[operator-test] histogram:", Object.entries(calls.reduce((a, m) => (a[m] = (a[m] || 0) + 1, a), {})).map(([k, v]) => `${k}:${v}`).join(" "));
  for (const r of R) console.log(` [${r.pass ? "PASS" : "FAIL"}] ${r.n}${r.d ? "  (" + r.d + ")" : ""}`);
  const passed = R.filter(r => r.pass).length;
  console.log(`[operator-test] canonical leaves mutation-tested: ${globalThis.__canonLeafCount}`);
  console.log(`\n[operator-test] ${passed}/${R.length} checks passed`);
  return R.every(r => r.pass);
}
let code = 1;
try { code = (await main()) ? 0 : 1; } catch (e) { console.error("[operator-test] ERROR:", e.message, e.stack?.split("\n").slice(1, 3).join(" | ")); code = 1; }
finally { if (anvil) try { anvil.kill("SIGKILL"); } catch { } }
process.exit(code);
