// TASK 10D-8 — v9 RECOVERY browser wiring (pure time refresh of the reviewed v8) (fail-closed; injection-safe DOM building only).
// Original steps 1-13 are VERIFIED completed on-chain anchors: no precheck, no confirm, no send path
// exists for them. ALL six remaining transactions are TESTER transactions — connect refuses any other
// account (non-halting), and a wrong-account pre-check is a safe refusal (the v7 terminal halt fix).
// Storage uses the DISTINCT "canaryv9" namespace; v5/v6/v7/v8 records are never read, mutated or migrated.
// inside Rabby via per-transaction eth_sendTransaction after an explicit click.
import { RecoveryOperator } from "./recovery-core.mjs";
import { keccak256, getAddress } from "./vendor/eth.js";

const $ = (id) => document.getElementById(id);
const say = (m, cls) => { const el = $("log"); const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = m; el.prepend(d); };
let op = null, provider = null;
const loadJson = async (p) => { const r = await fetch(p, { cache: "no-store" }); if (!r.ok) throw new Error("load " + p); return r.json(); };
const loadText = async (p) => { const r = await fetch(p, { cache: "no-store" }); if (!r.ok) throw new Error("load " + p); return r.text(); };
const storage = { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v) };
const toMicro = (dec) => { const [i, f = ""] = String(dec).split("."); return BigInt(i) * 1_000_000n + BigInt((f + "000000").slice(0, 6)); };

// fresh Coinbase + Kraken with cache disabled; validate + fail closed on timeout/malformed
async function priceProvider() {
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("price timeout")), ms))]);
  const t0 = Date.now();
  const [cb, kr] = await withTimeout(Promise.all([
    fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("coinbase " + r.status); return r.json(); }),
    fetch("https://api.kraken.com/0/public/Ticker?pair=ETHUSD", { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("kraken " + r.status); return r.json(); }),
  ]), 8000);
  const cbAmt = cb && cb.data && cb.data.amount, krAmt = kr && kr.result && Object.values(kr.result)[0] && Object.values(kr.result)[0].c && Object.values(kr.result)[0].c[0];
  if (!/^\d+(\.\d+)?$/.test(String(cbAmt)) || !/^\d+(\.\d+)?$/.test(String(krAmt))) throw new Error("malformed price data");
  const age = (Date.now() - t0) / 1000;
  return { coinbaseMicroUsd: toMicro(cbAmt), krakenMicroUsd: toMicro(krAmt), coinbaseAgeS: age, krakenAgeS: age };
}

function detectRabby() {
  const eth = window.ethereum; if (!eth) return { ok: false, reason: "No injected EVM provider. Install/enable Rabby." };
  const list = eth.providers && Array.isArray(eth.providers) ? eth.providers : [eth];
  const rabbys = list.filter(p => p && p.isRabby);
  if (rabbys.length === 0) return { ok: false, reason: "Rabby not detected; this operator requires Rabby." };
  if (rabbys.length > 1) return { ok: false, reason: "Ambiguous: multiple Rabby providers. Aborting (fail closed)." };
  return { ok: true, provider: rabbys[0] };
}

// injection-safe DOM builders — dynamic text ONLY via textContent
function el(tag, opts = {}, kids = []) { const e = document.createElement(tag); if (opts.class) e.className = opts.class; if (opts.text !== undefined) e.textContent = opts.text; if (opts.id) e.id = opts.id; if (opts.disabled) e.disabled = true; for (const k of kids) e.appendChild(k); return e; }
function row(k, v) { return el("tr", {}, [el("th", { text: k }), el("td", { text: v })]); }
function setPanel(...nodes) { const p = $("panel"); p.textContent = ""; for (const n of nodes) p.appendChild(n); }
const STEP_DESC = { deploy: "deploy contract at predicted CREATE address; verify runtime code hash + immutable wiring", approve: "ERC-20 approval; verify Approval(owner=signer, spender, amount)", createPool: "create Uniswap V3 pool; verify PoolCreated(token0,token1,fee,tickSpacing,pool)", initialize: "initialize pool; verify Initialize(sqrtPriceX96, tick)", mint: "mint LP position; verify IncreaseLiquidity + ERC-721 Transfer + position state", buy: "official buy; verify OfficialBuy(tradeId,trader,recipient,amounts,adapter,budget)", sell: "official sell; verify OfficialSell(tradeId,trader,recipient,amounts,adapter,budget)", lock: "create 7-day lock; verify LockCreated(account,lockId,principal,unlock,multiplier,policy)" };

async function init() {
  const [recoveryPacket, recoveryPolicy, recoverySnapshot, recoveryAuthorizationRaw] = await Promise.all([
    loadJson("./recovery-packet.json"), loadJson("./recovery-policy.json"), loadJson("./recovery-snapshot.json"), loadText("./recovery-authorization.json")]);
  const recoveryAuthorization = JSON.parse(recoveryAuthorizationRaw);
  op = new RecoveryOperator({ recoveryPacket, recoveryPolicy, recoverySnapshot, recoveryAuthorization, recoveryAuthorizationRaw, provider: null, keccak256, getAddress, priceProvider, storage });
  $("scope").textContent = recoveryPacket.meta.authorization.scope;
  $("digest").textContent = recoveryPacket.meta.recoveryAuthorizationDigest;
  $("anchor").textContent = recoveryPacket.completedSteps[0].txHash;
  $("anchor2").textContent = recoveryPacket.completedSteps[1].txHash;
  $("anchor13").textContent = recoveryPacket.completedSteps[12].txHash;
  $("anchorCount").textContent = recoveryPacket.completedSteps.length + " (original steps 1-13, all verified on chain)";
  $("expiry").textContent = recoveryPacket.meta.expiresAtUtc;
  const bind = op.bindAndVerifyPacket();
  if (!bind.ok) { say("REFUSED: recovery binding failed — " + op.haltReason, "fail"); $("connect").disabled = true; return; }
  if (op.completedStepIsActionable()) { say("REFUSED: internal assertion failed — completed steps 1/2 must not be actionable.", "fail"); $("connect").disabled = true; return; }
  if (op.halted) { say("DURABLE HALT from a prior v9 session: " + op.haltReason, "fail"); $("connect").disabled = true; renderHalted(); return; }
  say("Recovery bound (v9): canonical recovery authorization digest " + bind.recoveryAuthorizationDigest + " agrees across packet, policy, and packaged operator. Original steps 1-13 verified complete on chain and non-actionable. ALL six remaining transactions are TESTER transactions (nonces 2-7). Per-step gas-cost ceiling = exactly 1.25x reviewed; priority ceiling 0.05 gwei. Runtime values come ONLY from the bound object.", "ok");
  const det = detectRabby(); if (!det.ok) { say("BLOCKED: " + det.reason, "fail"); $("connect").disabled = true; return; }
  provider = det.provider; op.provider = provider;
  say("Rabby detected. Select the TESTER account (0x78B2...6024) in Rabby, then click Connect; the operator verifies the account, re-verifies all 13 completed anchors + pool/position state, and reconciles before enabling any transaction.");
}

async function connect() {
  try {
    await provider.request({ method: "eth_requestAccounts" }); // connection only; no signing
    const mc = await op.markConnected(provider);
    if (!mc.ok) { say((mc.wrongAccount ? "WRONG ACCOUNT (safe, nothing sent): " : "Connect blocked: ") + mc.reason, mc.wrongAccount ? "warn" : "fail"); return; }
    const r = await op.reconcile(provider);
    if (!r.ok) { say("Recovery reconciliation FAILED — " + (r.reason || op.haltReason) + ". Controls remain disabled.", "fail"); renderHalted(); return; }
    if (r.pendingUnresolved) { say("A pending transaction is not yet on chain; sends stay disabled until it confirms + verifies.", "warn"); render(); return; }
    say("Connected as the tester + reconciled (all 13 completed anchors re-verified on chain). Resuming at remaining transaction " + (op.current + 1) + " of 6 (original step " + (op.current < op.steps.length ? op.steps[op.current].originalIndex : 19) + ").", "ok");
    render();
  } catch (e) { say("connect error: " + e.message, "fail"); }
}

function renderHalted() { setPanel(el("div", { class: "fail", text: "HALTED: " + (op.haltReason || "reconciliation required") + ". No automatic retry. Regenerate + re-review to proceed." })); }

function render() {
  if (!(op.bound && op.connected && op.reconciled) || op.halted) { renderHalted(); return; }
  const i = op.current, done = i >= op.steps.length;
  const orig = done ? 19 : op.steps[i].originalIndex;
  $("progress").textContent = done ? "COMPLETE — all 6 remaining transactions verified" : `Original step ${orig} of 19 — Remaining transaction ${i + 1} of 6` + (op.pending ? " — PENDING (sends disabled)" : "");
  if (done) { setPanel(el("div", { class: "ok", text: "Original steps 1-13 verified complete on chain. All 6 remaining tester transactions executed and verified (original steps 14-19). The full 19-step canary plan is COMPLETE except the delayed tester-nonce-8 withdrawal, which is NOT executable here." })); return; }
  if (op.pending) {
    const btn = el("button", { id: "resume", text: "Verify pending transaction" });
    setPanel(el("div", { class: "warn", text: "Transaction pending (" + op.pending.txHash + "). Verify it before continuing; additional sends disabled." }), el("div", { class: "actions" }, [btn]));
    btn.onclick = () => doVerify(op.pending.txHash); return;
  }
  const t = op.steps[i], hash = keccak256(t.dataOrInitCode);
  const nodes = [];
  // completed anchor lines (display only — no controls exist for them)
  nodes.push(el("div", { class: "ok", text: "Original steps 1-13 verified complete on chain (13 anchors)." }));
  nodes.push(el("div", { class: "warn", text: "ALL remaining transactions are TESTER transactions (nonces 2-7). Keep the TESTER account (0x78B2...6024) selected in Rabby. A wrong-account pre-check is a safe, NON-HALTING refusal — switch accounts and re-run it." }));
  const table = el("table", {}, [
    row("original step", orig + " of 19 (" + t.phase + " — " + t.label + ")"),
    row("remaining transaction", (i + 1) + " of 6"),
    row("signer", getAddress(t.signer)),
    row("nonce", String(t.nonce)),
    row("target", t.to ? getAddress(t.to) : "CREATE → " + t.predictedCreationAddress),
    row("value / type / chainId", t.value + " wei / 0x2 / 4663"),
    row("reviewed gas limit (ceiling 2x)", t.gasLimit + " (ceiling " + t.gasCeilings.gasLimitCeiling + ")"),
    row("max fee / priority ceilings", t.gasCeilings.maxFeeCeilingWei + " / " + t.gasCeilings.maxPriorityCeilingWei + " wei"),
    row("step max gas cost: reviewed / 1.25x ceiling", t.gasCeilings.reviewedMaxGasCostWei + " / " + t.gasCeilings.maxGasCostCeilingWei + " wei (1.25x explicitly authorized)"),
    row("postcondition", t.postconditionType),
  ]);
  const hashRow = el("tr", {}, [el("th", { text: "calldata/init-code keccak" }), el("td", { class: "mono", text: hash })]);
  table.appendChild(hashRow);
  table.appendChild(row("expected result", STEP_DESC[t.postconditionType] || t.phase));
  nodes.push(table);
  const precheck = el("button", { id: "precheck", text: "1) Run pre-transaction checks (fresh live-price exposure; latest+pending nonce)" });
  nodes.push(el("div", { class: "actions" }, [precheck, el("button", { id: "confirm", text: "2) Confirm this transaction", disabled: true }), el("button", { id: "send", text: "3) Open Rabby approval for THIS transaction", disabled: true })]));
  setPanel(...nodes);
  precheck.onclick = doPrecheck;
}

let precheckPassed = false;
async function doPrecheck() {
  precheckPassed = false; $("confirm").disabled = true; $("send").disabled = true;
  const r = await op.preconditions(provider);
  if (r && r.wrongAccount) { say("WRONG ACCOUNT (safe, nothing sent, NOT halted): " + r.reason, "warn"); return; }
  if (!r.ok) { say("PRE-CHECK FAILED: " + (r.reason || op.haltReason) + " — HALTED.", "fail"); renderHalted(); return; }
  say("Pre-checks PASSED: " + Object.keys(r.gates).join(", ") + (r.exposure ? ` | recovery exposure (incl. actual step-1 gas) $${(Number(r.exposure.exposureMicro) / 1e6).toFixed(6)} @ higher live price` : ""), "ok");
  precheckPassed = true; const c = $("confirm"); c.disabled = false;
  c.onclick = () => { if (precheckPassed) { $("send").disabled = false; say("Confirmed. Click (3) to open the Rabby approval for THIS single transaction."); } };
}
async function doSend() {
  if (!precheckPassed) return; $("send").disabled = true;
  const r = await op.sendCurrent(provider);
  if (r.userRejected) { say("You rejected the transaction in Rabby. Same step; no state changed.", "warn"); precheckPassed = false; render(); return; }
  if (r.uncertainSend) { say("UNCERTAIN SEND: halted durably; supply the tx hash to resolve or regenerate under review. No blind retry.", "fail"); renderHalted(); return; }
  if (!r.ok) { say("SEND blocked/halted: " + (r.reason || op.haltReason), "fail"); render(); return; }
  say("Rabby returned tx hash " + r.txHash + " (pending persisted) — verifying with bounded gas envelope…"); render(); await doVerify(r.txHash);
}
async function doVerify(txHash) {
  const v = await op.verifyAfterHash(provider, txHash);
  if (!v.ok) { say("POST-VERIFY failed: " + (v.reason || op.haltReason) + " — HALTED.", "fail"); renderHalted(); return; }
  say("Remaining transaction " + (v.step + 1) + " of 6 verified (bounded-gas verifier + event postcondition + cumulative checkpoint). Journalled.", "ok");
  precheckPassed = false; render();
}
document.addEventListener("click", (e) => { if (e.target && e.target.id === "send") doSend(); });
$("connect").onclick = connect;
init().catch(e => say("init error: " + e.message, "fail"));
