// TASK 10D-8 — v9 RECOVERY operator tests + clean-fork recovery replay (pure time refresh of reviewed v8).
// Forks POST original-steps-1-13 (all 8 contracts deployed; pool created+initialized; LP minted; deployer
// nonce 16, tester nonce 2), imports/verifies the 13 anchors, and executes the FINAL SIX tester
// transactions (original steps 14-19) via a mock provider using the REAL on-fork balances/state.
// Covers: no-rebroadcast of steps 1-13 (no deployer tx actionable), tester-account connect gate +
// NON-HALTING wrong-account precheck (the v7 terminal-halt fix), tester nonces exactly 2-7 (nonce 8
// disabled), deadline-only byte-diff vs the accepted v7 calldata (steps 15/17), the accepted v7 gas policy,
// chainId + provider-chain boundaries, v8 storage isolation from v5/v6/v7, uncertain-send + storage faults,
// restart at every remaining step, and canonical-leaf + source-input mutation suites.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createPublicClient, http, keccak256, getAddress, toHex } from "viem";
import { RecoveryOperator } from "./operator/recovery-core.mjs";

const U = (p) => new URL(p, import.meta.url);
const rj = (p) => JSON.parse(readFileSync(U(p), "utf8"));
const rt = (p) => readFileSync(U(p), "utf8");
const recoveryPacket = rj("recovery-packet.json"), recoveryPolicy = rj("recovery-policy.json"), recoverySnapshot = rj("recovery-snapshot.json");
const v8src = rj("v8-accepted-packet.json");
const recoveryAuthorizationRaw = rt("operator/recovery-authorization.json"), recoveryAuthorization = JSON.parse(recoveryAuthorizationRaw);
const PORT = Number(process.env.RECTEST_PORT || 8549);
const FORK = `http://127.0.0.1:${PORT}`;
const LIVE = process.env[recoveryPolicy.liveRpcEnvVar];
const R = []; const ok = (n, c, d = "") => R.push({ n, pass: !!c, d });
const B = (x) => BigInt(x);
const DEPLOYER = getAddress(recoveryPolicy.wallets.deployer), TESTER = getAddress(recoveryPolicy.wallets.tester);
const capMicro = B(recoveryPacket.capArithmetic.capPriceMicroUsd);
const freshPrices = async () => ({ coinbaseMicroUsd: capMicro, krakenMicroUsd: capMicro - 100000n, coinbaseAgeS: 3, krakenAgeS: 4 });
const memStore = () => { const m = new Map(); return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), _m: m, clone() { const n = new Map(m); return { get: (k) => (n.has(k) ? n.get(k) : null), set: (k, v) => n.set(k, v), _m: n }; } }; };

let anvil;
const forkPub = createPublicClient({ transport: http(FORK) });
const forkReq = (m, p = []) => forkPub.request({ method: m, params: p });
async function waitAnvil() { for (let i = 0; i < 80; i++) { try { if (await forkReq("eth_blockNumber")) return; } catch { } await new Promise(r => setTimeout(r, 500)); } throw new Error("anvil did not start"); }
const FORBIDDEN = ["eth_sendRawTransaction", "eth_sign", "personal_sign", "eth_signTransaction", "eth_signTypedData", "eth_signTypedData_v4", "wallet_addEthereumChain", "wallet_switchEthereumChain"];

async function main() {
  if (!LIVE) throw new Error("provider RPC env var not set");
  anvil = spawn("anvil", ["--fork-url", LIVE, "--fork-block-number", String(recoverySnapshot.pinnedBlock.number), "--chain-id", "4663", "--block-base-fee-per-gas", String(recoverySnapshot.pinnedBlock.baseFeePerGasWei), "--port", String(PORT), "--silent"], { stdio: "ignore" });
  await waitAnvil();
  await forkReq("anvil_setBlockTimestampInterval", [1]);
  await forkReq("anvil_setBalance", [TESTER, toHex(10n ** 18n)]);       // gas only; WETH/state are REAL post-step-13
  await forkReq("anvil_impersonateAccount", [TESTER]);
  let snapId = await forkReq("evm_snapshot", []);
  const resetFork = async () => { await forkReq("evm_revert", [snapId]); snapId = await forkReq("evm_snapshot", []); };

  let selectedAccount = TESTER; const calls = []; let sendCount = 0, forbiddenSeen = 0;
  const base = { isRabby: false, async request({ method, params = [] }) { calls.push(method); if (FORBIDDEN.includes(method)) { forbiddenSeen++; throw new Error("forbidden: " + method); } if (method === "eth_accounts") return [selectedAccount]; if (method === "eth_sendTransaction") { sendCount++; if (Array.isArray(params[0])) throw new Error("batch"); if (getAddress(params[0].from) === DEPLOYER) throw new Error("DEPLOYER SEND ATTEMPTED"); return forkReq("eth_sendTransaction", [params[0]]); } return forkReq(method, params); } };
  const newOp = (storage, extra = {}) => new RecoveryOperator({ recoveryPacket, recoveryPolicy, recoverySnapshot, recoveryAuthorization, recoveryAuthorizationRaw, provider: base, keccak256, getAddress, priceProvider: freshPrices, storage, ...extra });

  // ===== A) bind + non-actionability + account gates + 6/6 replay with per-step restart =====
  await resetFork();
  const store = memStore(); const op = newOp(store);
  ok("v9 bind (13 anchors + v5/v6/v7/v8 anchors + corrected deployerStepRange 1-13 + gas policy + deadline refresh + 6 tester signables)", op.bindAndVerifyPacket().ok);
  ok("fork resumes with deployer nonce 16 / tester nonce 2", Number(B(await forkReq("eth_getTransactionCount", [DEPLOYER, "latest"]))) === 16 && Number(B(await forkReq("eth_getTransactionCount", [TESTER, "latest"]))) === 2);
  ok("steps 1-13 cannot be sent again (no deployer tx, no originalIndex<=13, tester nonces exactly 2-7)", !op.completedStepIsActionable() && op.steps.length === 6 && op.steps.every((s, i) => getAddress(s.signer) === TESTER && s.nonce === i + 2 && s.originalIndex === i + 14) && !op.steps.some(s => s.nonce === 8));
  ok("tester nonce 8 (delayed withdrawal) remains disabled", op.delayedDisabled === true && op.canon.delayedWithdrawalDisabled === true && !op.steps.some(s => s.nonce === 8));
  // deployer-selected connect fails (NON-halting) before any control; tester-selected passes
  selectedAccount = DEPLOYER;
  { const mc = await op.markConnected(base); ok("deployer-selected CONNECT fails with a non-halting wrongAccount refusal", !mc.ok && mc.wrongAccount === true && !op.halted && !op.connected); }
  selectedAccount = TESTER;
  ok("tester-selected connect passes", (await op.markConnected(base)).ok && op.connected);
  ok("reconcile imports+verifies ALL 13 anchors + pool/position state; current=0", (await op.reconcile(base)).ok && op.current === 0 && op.reconciled);
  // wrong-account PRECHECK is a NON-HALTING refusal (the v7 failure mode), then tester passes
  selectedAccount = DEPLOYER;
  { const pre = await op.preconditions(base); ok("deployer-selected PRE-CHECK refuses WITHOUT halting (v7 terminal halt cannot recur)", !pre.ok && pre.wrongAccount === true && !op.halted && op.reconciled); }
  selectedAccount = TESTER;
  { const pre = await op.preconditions(base); ok("tester-selected pre-check passes", pre.ok === true && !op.halted); }

  let allOk = true; const restartCurrents = []; let st0Tx = null, st0Rc = null, st0Ref = null;
  for (let i = 0; i < op.steps.length; i++) {
    selectedAccount = TESTER;
    const pre = await op.preconditions(base); if (!pre.ok) { allOk = false; ok(`remaining ${i} (orig ${op.steps[i].originalIndex}) pre`, false, pre.reason); break; }
    const s = await op.sendCurrent(base); if (!s.ok) { allOk = false; ok(`remaining ${i} send`, false, s.reason); break; }
    if (i === 0) { st0Ref = op.steps[0]; st0Tx = await forkReq("eth_getTransactionByHash", [s.txHash]); st0Rc = await forkReq("eth_getTransactionReceipt", [s.txHash]); }
    const v = await op.verifyAfterHash(base, s.txHash); if (!v.ok) { allOk = false; ok(`remaining ${i} verify (${op.steps[i].label})`, false, v.reason); break; }
    const ob = newOp(store.clone()); ob.bindAndVerifyPacket(); await ob.markConnected(base); const r = await ob.reconcile(base);
    if (!r.ok || ob.current !== i + 1) { allOk = false; ok(`restart after remaining ${i}`, false, r.reason || `current ${ob.current}`); break; }
    restartCurrents.push(ob.current);
  }
  ok("clean-fork recovery replay: steps 1-13 imported + final 6/6 tester txs executed & verified", allOk && op.current === 6 && !op.halted);
  ok("successful restart reconciliation after EVERY remaining step (13 anchors re-verified each time)", restartCurrents.length === 6 && restartCurrents.every((v, i) => v === i + 1));
  ok("exactly 6 single eth_sendTransaction calls; no forbidden method; no deployer send", sendCount === 6 && forbiddenSeen === 0);

  // ===== B) DEADLINE REFRESH — byte-diff proof vs the ACCEPTED v7 calldata (steps 15/17 only) =====
  {
    const dr = recoveryPacket.meta.deadlineRefresh;
    const expEpoch = Math.floor(Date.parse(recoveryPacket.meta.expiresAtUtc) / 1000);
    ok("new deadline == pinned ts + 21600 == packet expiry; old deadline == bound v8 value 1784949999", dr.oldDeadline === "1784949999" && B(dr.newDeadline) === B(recoverySnapshot.pinnedBlock.timestamp) + 21600n && Number(dr.newDeadline) === expEpoch);
    let diffOk = true, identOk = true, decOk = true; const details = [];
    for (const t of recoveryPacket.immediateTransactions) {
      const src = v8src.immediateTransactions.find(r => r.originalIndex === t.originalIndex);
      const step = dr.steps.find(x => x.originalIndex === t.originalIndex);
      if (!step) { if (t.dataOrInitCode.toLowerCase() !== src.dataOrInitCode.toLowerCase()) { identOk = false; details.push("changed:" + t.label); } continue; }
      const a = src.dataOrInitCode, b = t.dataOrInitCode;
      if (a.length !== b.length || a.slice(0, 10).toLowerCase() !== b.slice(0, 10).toLowerCase()) { diffOk = false; details.push("len/sel:" + t.label); continue; }
      const diffs = []; for (let i = 2; i < a.length; i += 2) if (a.slice(i, i + 2).toLowerCase() !== b.slice(i, i + 2).toLowerCase()) diffs.push((i - 2) / 2);
      if (!diffs.every(bo => bo >= step.wordOffsetBytes && bo < step.wordOffsetBytes + 32) || diffs.length === 0) { diffOk = false; details.push("outside-word:" + t.label); }
      const oldW = BigInt("0x" + a.slice(2 + step.wordOffsetBytes * 2, 2 + step.wordOffsetBytes * 2 + 64));
      const newW = BigInt("0x" + b.slice(2 + step.wordOffsetBytes * 2, 2 + step.wordOffsetBytes * 2 + 64));
      if (oldW.toString() !== dr.oldDeadline || newW.toString() !== dr.newDeadline) decOk = false;
      if (keccak256(a).toLowerCase() !== step.oldDataKeccak.toLowerCase() || keccak256(b).toLowerCase() !== step.newDataKeccak.toLowerCase()) decOk = false;
    }
    ok("byte-diff: only the single 32-byte deadline word differs in steps 15/17", diffOk, details.join(","));
    ok("the other FOUR remaining calldatas are byte-identical to the reviewed v8 versions", identOk, details.join(","));
    ok("old/new deadline words + old/new dataKeccak match the recorded refresh metadata", decOk);
  }
  // runtime deadline gate: provider timestamp at/after expiry halts
  { await resetFork(); const o = newOp(memStore()); o.bindAndVerifyPacket(); selectedAccount = TESTER; await o.markConnected(base); await o.reconcile(base);
    const lateTs = toHex(BigInt(Math.floor(Date.parse(recoveryPacket.meta.expiresAtUtc) / 1000)) + 1n);
    const late = { request: async ({ method, params }) => { if (method === "eth_getBlockByNumber") { const h = await base.request({ method, params }); return { ...h, timestamp: lateTs }; } return base.request({ method, params }); } };
    const r = await o.preconditions(late);
    ok("provider block timestamp at/after packet expiry HALTS the pre-check", !r.ok && o.halted && /strictly before the packet expiry/.test(o.haltReason)); }

  // ===== C) accepted v7 gas policy + bounded verifier adversarial on the captured real step-14 tx =====
  const gop = op, st0 = st0Ref, txHash0 = st0Rc.transactionHash;
  const canned = (txOverride, chainId = "0x1237") => ({ request: async ({ method }) => { if (method === "eth_chainId") return chainId; if (method === "eth_getTransactionByHash") return { ...st0Tx, ...txOverride }; if (method === "eth_getTransactionReceipt") return st0Rc; return null; } });
  const g = st0.gasCeilings;
  const vt = async (over, chainId) => (await gop._verifyTxAndReceipt(canned(over, chainId), st0, txHash0)).ok;
  ok("honest returned tx verifies (orig step 14)", await vt({}));
  ok("1.25x policy: cost at ceiling passes; above FAILS", (B(g.maxGasCostCeilingWei) * 4n === B(g.reviewedMaxGasCostWei) * 5n) && !(await vt({ gas: toHex(B(g.maxGasCostCeilingWei) / B(st0.maxFeePerGas) + 2n) })));
  ok("priority exactly 50,000,000 passes; 50,000,001 FAILS", (await vt({ maxPriorityFeePerGas: toHex(50000000n) })) && !(await vt({ maxPriorityFeePerGas: toHex(50000001n) })));
  ok("maxFee above reviewed ceiling FAILS", !(await vt({ maxFeePerGas: toHex(B(g.maxFeeCeilingWei) + 1n) })));
  ok("gasLimit above 2x ceiling FAILS", !(await vt({ gas: toHex(B(g.gasLimitCeiling) + 1n) })));
  ok("critical field: wrong sender FAILS", !(await vt({ from: DEPLOYER })));
  ok("critical field: wrong nonce FAILS", !(await vt({ nonce: "0x63" })));
  ok("critical field: wrong value FAILS", !(await vt({ value: "0x1" })));
  ok("critical field: wrong calldata FAILS", !(await vt({ input: "0xdeadbeef" })));
  ok("critical field: wrong type (legacy) FAILS", !(await vt({ type: "0x0" })));
  ok("critical field: non-empty access list FAILS", !(await vt({ accessList: [{ address: TESTER, storageKeys: [] }] })));
  ok("chainId ABSENT accepted (eth_chainId==4663 independently)", await (async () => { const p = { request: async ({ method }) => { if (method === "eth_chainId") return "0x1237"; if (method === "eth_getTransactionByHash") { const { chainId, ...noc } = st0Tx; return noc; } if (method === "eth_getTransactionReceipt") return st0Rc; return null; } }; return (await gop._verifyTxAndReceipt(p, st0, txHash0)).ok; })());
  ok("chainId PRESENT and wrong FAILS", !(await vt({ chainId: "0x1" })));
  ok("provider chain != 4663 at verify boundary FAILS", !(await vt({}, "0x1")));

  // ===== D) exposure: realized (1-13) + principal + max gas (14-19); >$130 fails =====
  {
    const ca = recoveryPacket.capArithmetic;
    const agg = B(ca.realizedGasWei) + B(ca.remainingPrincipalWei) + B(ca.remainingMaxGasWei);
    const micro = (agg * capMicro) / 10n ** 18n;
    ok("exposure = realized gas(1-13) + principal + max gas(14-19 at 1.25x) <= $130 (no double count)", agg === B(ca.aggregateWei) && micro <= 130_000_000n);
    const oHigh = newOp(memStore(), { priceProvider: async () => ({ coinbaseMicroUsd: 2100000000n, krakenMicroUsd: 2100000000n, coinbaseAgeS: 1, krakenAgeS: 1 }) });
    oHigh.bindAndVerifyPacket();
    const gate = await oHigh._exposureGate();
    ok("aggregate exposure above $130 at fresh prices FAILS the exposure gate", gate.ok === false && (agg * 2100000000n) / 10n ** 18n > 130_000_000n);
  }

  // ===== E) v8 isolation: v5/v6/v7 records never read as authority nor mutated =====
  {
    const st = memStore();
    st.set("canary:halt:0xv5", JSON.stringify({ reason: "V5 — UNTOUCHED" }));
    st.set("canaryv6:halt:0xv6", JSON.stringify({ reason: "V6 — UNTOUCHED" }));
    st.set("canaryv7:halt:0xv7", JSON.stringify({ reason: "V7 — UNTOUCHED" }));
    st.set("canaryv8:halt:" + recoveryPacket.meta.v8RecoveryAuthorizationDigest, JSON.stringify({ reason: "V8 — UNTOUCHED", uncertainSend: null }));
    const o = newOp(st); o.bindAndVerifyPacket();
    ok("v9 uses canaryv9 namespace; v5/v6/v7/v8 halt records untouched and not authoritative", o._kHalt.startsWith("canaryv9:") && !o.halted && st.get("canary:halt:0xv5").includes("UNTOUCHED") && st.get("canaryv6:halt:0xv6").includes("UNTOUCHED") && st.get("canaryv7:halt:0xv7").includes("UNTOUCHED") && st.get("canaryv8:halt:" + recoveryPacket.meta.v8RecoveryAuthorizationDigest).includes("UNTOUCHED"));
  }

  // ===== F) uncertain-send + storage faults (fail-closed; no blind retry) =====
  const faultStore = (fail) => { const m = new Map(); return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { if (fail(k, v)) throw new Error("storage fault"); m.set(k, v); }, _m: m }; };
  const kJournal = "canaryv9:journal:" + recoveryPacket.meta.recoveryAuthorizationDigest;
  { await resetFork(); const st = faultStore((k) => k === kJournal); const o = newOp(st); o.bindAndVerifyPacket(); selectedAccount = TESTER; await o.markConnected(base); await o.reconcile(base);
    const errWrap = { request: async ({ method, params }) => { if (method === "eth_sendTransaction") throw new Error("network glitch"); return base.request({ method, params }); } };
    await o.sendCurrent(errWrap);
    const realHash = await base.request({ method: "eth_sendTransaction", params: [{ from: TESTER, to: o.steps[0].to, value: "0x0", data: o.steps[0].dataOrInitCode, gas: toHex(B(o.steps[0].gasLimit)), maxFeePerGas: toHex(B(o.steps[0].maxFeePerGas)), maxPriorityFeePerGas: toHex(B(o.steps[0].maxPriorityFeePerGas)), type: "0x2", nonce: toHex(B(o.steps[0].nonce)), chainId: "0x1237" }] });
    const res = await o.resolveUncertainSend(base, realHash);
    ok("resolveUncertainSend with failing journal write stays HALTED (no blind retry)", !res.ok && o.halted && !!o.uncertainSend && o.current === 0);
  }
  { await resetFork(); const s0 = sendCount; const o = newOp(faultStore((k) => k.startsWith("canaryv9:intent:"))); o.bindAndVerifyPacket(); selectedAccount = TESTER; await o.markConnected(base); await o.reconcile(base);
    const r = await o.sendCurrent(base);
    ok("storage-unavailable-before-send: wallet NOT invoked", !r.ok && /storage unavailable/.test(r.reason) && sendCount === s0);
  }
  { const st = memStore(); st.set("canaryv9:intent:" + recoveryPacket.meta.recoveryAuthorizationDigest, JSON.stringify({ digest: recoveryPacket.meta.recoveryAuthorizationDigest, step: 0, signer: TESTER, nonce: 2, signableTxHash: "0x" + "a".repeat(64) })); const o = newOp(st);
    ok("crash-between-intent-and-response: reload HALTED uncertain (no new send for that nonce)", o.halted && !!o.uncertainSend && o.uncertainSend.step === 0);
  }

  // ===== G) canonical-leaf mutation suite =====
  const { buildRecoveryCanonical } = await import("./operator/recovery-canonical.mjs");
  const { digestOf } = await import("./operator/canonical.mjs");
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const bindWith = (P, PO, S, PKG, RAW) => { try { const o = new RecoveryOperator({ recoveryPacket: P, recoveryPolicy: PO, recoverySnapshot: S, recoveryAuthorization: PKG, recoveryAuthorizationRaw: RAW ?? JSON.stringify(PKG), provider: base, keccak256, getAddress, priceProvider: freshPrices, storage: memStore() }); return { ok: o.bindAndVerifyPacket().ok, o }; } catch { return { ok: false, o: null }; } };
  const leafPaths = [];
  (function walk(o, p) { if (o && typeof o === "object") { for (const k of Object.keys(o)) walk(o[k], p.concat(k)); } else leafPaths.push(p); })(recoveryAuthorization, []);
  const getAt = (o, p) => p.reduce((x, k) => x[k], o);
  const setAt = (o, p, v) => { const par = p.slice(0, -1).reduce((x, k) => x[k], o); par[p[p.length - 1]] = v; };
  const mutVal = (v) => { if (typeof v === "boolean") return !v; if (typeof v === "number") return v + 1; if (typeof v === "string") { if (/^0x[0-9a-fA-F]{40}$/.test(v)) return "0x000000000000000000000000000000000000dEaD"; if (/^0x[0-9a-fA-F]+$/.test(v)) return v.slice(0, -1) + (v.slice(-1) === "0" ? "1" : "0"); if (/^[0-9]+$/.test(v)) return (BigInt(v) + 1n).toString(); return v + "_MUT"; } return "MUT"; };
  let leafFails = [], leafTested = 0;
  for (const p of leafPaths) { const PKG = clone(recoveryAuthorization); setAt(PKG, p, mutVal(getAt(PKG, p))); leafTested++; if (bindWith(recoveryPacket, recoveryPolicy, recoverySnapshot, PKG).ok) leafFails.push(p.join(".")); }
  globalThis.__recoveryLeafCount = leafTested;
  ok(`GENERIC leaf-mutation: all ${leafTested} canonical v9 leaves fail binding when mutated`, leafFails.length === 0, leafFails.slice(0, 8).join(" | "));

  // ===== H) source-input mutation completeness + v8 regressions =====
  const baseDigest = digestOf(buildRecoveryCanonical({ packet: recoveryPacket, policy: recoveryPolicy, snapshot: recoverySnapshot, getAddress }).object, keccak256);
  const digestAfter = (P, PO, S) => { try { const r = buildRecoveryCanonical({ packet: P, policy: PO, snapshot: S, getAddress }); return r.errors.length ? "ERR" : digestOf(r.object, keccak256); } catch { return "THROW"; } };
  let srcChanged = 0, srcUnused = 0;
  for (const [name, obj] of [["packet", recoveryPacket], ["policy", recoveryPolicy], ["snapshot", recoverySnapshot]]) {
    const paths = []; (function w(x, p) { if (x && typeof x === "object") { for (const k of Object.keys(x)) w(x[k], p.concat(k)); } else paths.push(p); })(obj, []);
    for (const p of paths) {
      const P = clone(recoveryPacket), PO = clone(recoveryPolicy), S = clone(recoverySnapshot);
      const target = name === "packet" ? P : name === "policy" ? PO : S;
      setAt(target, p, mutVal(getAt(target, p)));
      if (digestAfter(P, PO, S) !== baseDigest) srcChanged++; else srcUnused++;
    }
  }
  { const o = bindWith(recoveryPacket, recoveryPolicy, recoverySnapshot, recoveryAuthorization, recoveryAuthorizationRaw).o;
    ok(`SOURCE-INPUT mutation: ${srcChanged} leaves shift the digest; ${srcUnused} unused (raw inputs null after bind)`, srcChanged > 0 && o.recoveryPacket === null && o.recoveryPolicy === null && o.recoverySnapshot === null); }
  globalThis.__recoverySrcChanged = srcChanged; globalThis.__recoverySrcUnused = srcUnused;

  const srcFail = (fn) => { const P = clone(recoveryPacket), PO = clone(recoveryPolicy), S = clone(recoverySnapshot); fn(P, PO, S); return !bindWith(P, PO, S, recoveryAuthorization, recoveryAuthorizationRaw).ok; };
  const reg = {
    "anchor13-txHash": srcFail((P) => P.completedSteps[12].txHash = "0x" + "1".repeat(64)),
    "anchor3-actualGasCost": srcFail((P) => { P.completedSteps[2].actualGasCostWei = "1"; }),
    "realized-gas-total": srcFail((P) => P.capArithmetic.realizedGasWei = "1"),
    "deployer-step-injected": (() => { const P = clone(recoveryPacket); P.immediateTransactions[0].signer = DEPLOYER; return !bindWith(P, recoveryPolicy, recoverySnapshot, recoveryAuthorization, recoveryAuthorizationRaw).ok; })(),
    "step13-injected-into-signables": (() => { const P = clone(recoveryPacket); P.immediateTransactions[0].originalIndex = 13; P.immediateTransactions[0].nonce = 15; return !bindWith(P, recoveryPolicy, recoverySnapshot, recoveryAuthorization, recoveryAuthorizationRaw).ok; })(),
    "tester-nonce-8-injected": (() => { const P = clone(recoveryPacket); P.immediateTransactions[5].nonce = 8; return !bindWith(P, recoveryPolicy, recoverySnapshot, recoveryAuthorization, recoveryAuthorizationRaw).ok; })(),
    "cost-ceiling-above-1.25x": srcFail((P) => P.immediateTransactions[0].gasCeilings.maxGasCostCeilingWei = (B(P.immediateTransactions[0].gasCeilings.maxGasCostCeilingWei) + 1n).toString()),
    "priority-ceiling-changed": srcFail((P) => { P.immediateTransactions[0].gasCeilings.maxPriorityCeilingWei = "60000000"; }),
    "v7-anchor-tamper": srcFail((P) => P.meta.v7RecoveryAuthorizationDigest = "0x" + "2".repeat(64)),
    "v8-anchor-tamper": srcFail((P) => P.meta.v8RecoveryAuthorizationDigest = "0x" + "2".repeat(64)),
    "deployerStepRange-regression": (() => { const PKG = clone(recoveryAuthorization); PKG.originalPlan.deployerStepRange = "2-13"; return !bindWith(recoveryPacket, recoveryPolicy, recoverySnapshot, PKG).ok; })(),
    "completed-anchor-signer-not-deployer": srcFail((P) => { P.completedSteps[4].signer = P.meta.tester; }),
    "deployer-nonce-expectation": srcFail((P, PO, S) => S.expectedNonces.deployer = 17),
    "tester-nonce-expectation": srcFail((P, PO, S) => S.expectedNonces.tester = 3),
    "aggregate-exposure": srcFail((P) => P.capArithmetic.aggregateWei = "1"),
    "positionTokenId-tamper": srcFail((P, PO, S) => { P.positionTokenId = "999999"; S.positionTokenId = "999999"; }),
  };
  const regBad = Object.entries(reg).filter(([, v]) => !v).map(([k]) => k);
  ok(`v9 regressions: anchors/realized-gas/deployer-injection/nonce-8/gas-policy/v7+v8-anchors/deployer-range/nonces/exposure/position all FAIL binding (${Object.keys(reg).length} tested)`, regBad.length === 0, regBad.join(","));

  console.log("[recovery-test] canonical v9 leaves mutation-tested:", globalThis.__recoveryLeafCount, "| source-input changed:", srcChanged, "unused:", srcUnused);
  console.log("[recovery-test] histogram:", Object.entries(calls.reduce((a, m) => (a[m] = (a[m] || 0) + 1, a), {})).map(([k, v]) => `${k}:${v}`).join(" "));
  for (const r of R) console.log(` [${r.pass ? "PASS" : "FAIL"}] ${r.n}${r.d ? "  (" + r.d + ")" : ""}`);
  const passed = R.filter(r => r.pass).length;
  console.log(`\n[recovery-test] ${passed}/${R.length} checks passed`);
  return R.every(r => r.pass);
}
let code = 1;
try { code = (await main()) ? 0 : 1; } catch (e) { console.error("[recovery-test] ERROR:", e.message, e.stack?.split("\n").slice(1, 3).join(" | ")); code = 1; }
finally { if (anvil) try { anvil.kill("SIGKILL"); } catch { } }
process.exit(code);
