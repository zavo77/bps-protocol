// TASK 10D-2 — browser wiring (fail-closed). Signing happens ONLY inside Rabby via per-transaction
// eth_sendTransaction after an explicit click. No key/seed/keystore/raw signature; no eth_sendRawTransaction.
// Controls stay disabled until bound -> connected -> reconciled. Durable halt/uncertain-send survives reload.
import { CanaryOperator } from "./operator-core.mjs";
import { keccak256, getAddress } from "./vendor/eth.js";

const $ = (id) => document.getElementById(id);
const say = (m, cls) => { const el = $("log"); const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = m; el.prepend(d); };
let op = null, provider = null;
const loadJson = async (p) => { const r = await fetch(p, { cache: "no-store" }); if (!r.ok) throw new Error("load " + p); return r.json(); };
const loadText = async (p) => { const r = await fetch(p, { cache: "no-store" }); if (!r.ok) throw new Error("load " + p); return r.text(); };
const storage = { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v) };
const toMicro = (dec) => { const [i, f = ""] = String(dec).split("."); return BigInt(i) * 1_000_000n + BigInt((f + "000000").slice(0, 6)); };

// (6) fresh Coinbase + Kraken with cache disabled; validate + fail closed on timeout/malformed
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

async function init() {
  const [packet, policy, snapshot, reviewedAuthorizationRaw] = await Promise.all([loadJson("./canary-unsigned-packet.json"), loadJson("./review-policy.json"), loadJson("./block-snapshot.json"), loadText("./reviewed-authorization.json")]);
  // (10D-3) the packaged canonical reviewed-authorization object is the SINGLE bound runtime data source.
  // Raw text is kept so binding can strict-validate it (unknown/duplicate keys, non-canonical encodings).
  const reviewedAuthorization = JSON.parse(reviewedAuthorizationRaw);
  op = new CanaryOperator({ packet, policy, snapshot, reviewedAuthorization, reviewedAuthorizationRaw, provider: null, keccak256, getAddress, priceProvider, storage });
  $("scope").textContent = packet.meta.authorization.scope; $("digest").textContent = packet.meta.executionPacketDigest; $("expiry").textContent = packet.meta.expiresAtUtc;
  const bind = op.bindAndVerifyPacket();
  if (!bind.ok) { say("REFUSED: packet binding failed — " + op.haltReason, "fail"); $("connect").disabled = true; return; }
  if (op.halted) { say("DURABLE HALT from a prior session: " + op.haltReason + (op.uncertainSend ? " (uncertain send at step " + op.uncertainSend.step + "; supply the tx hash to resolve or regenerate under review)" : ""), "fail"); $("connect").disabled = true; renderHalted(); return; }
  say("Packet bound: canonical reviewed-authorization reconstructed; digest " + bind.reviewedAuthorizationDigest + " agrees across packet, policy, and packaged operator; executionPacketDigest recomputed over all 19 txs. Runtime values are sourced ONLY from the bound object.", "ok");
  const det = detectRabby(); if (!det.ok) { say("BLOCKED: " + det.reason, "fail"); $("connect").disabled = true; return; }
  provider = det.provider; op.provider = provider;
  say("Rabby detected. Click Connect, then the operator will reconcile before enabling any transaction.");
}

async function connect() {
  try {
    await provider.request({ method: "eth_requestAccounts" }); // connection only; no signing
    const mc = await op.markConnected(provider);
    if (!mc.ok) { say("Connect blocked: " + mc.reason, "fail"); return; }
    const r = await op.reconcile(provider);
    if (!r.ok) { say("Reconciliation FAILED — " + (r.reason || op.haltReason) + ". Controls remain disabled.", "fail"); renderHalted(); return; }
    if (r.pendingUnresolved) { say("A pending transaction is not yet on chain; sends stay disabled until it confirms + verifies.", "warn"); render(); return; }
    say("Connected + reconciled. Resumed at step " + (op.current + 1) + " of " + op.steps.length + ".", "ok");
    render();
  } catch (e) { say("connect error: " + e.message, "fail"); }
}

// (10D-4) DOM builders — NEVER interpolate packet/tx/provider-error/storage values into innerHTML.
// All dynamic text is inserted via textContent so HTML/handlers in any value render as inert text.
function el(tag, opts = {}, kids = []) { const e = document.createElement(tag); if (opts.class) e.className = opts.class; if (opts.text !== undefined) e.textContent = opts.text; if (opts.id) e.id = opts.id; if (opts.disabled) e.disabled = true; for (const k of kids) e.appendChild(k); return e; }
function row(k, v) { return el("tr", {}, [el("th", { text: k }), el("td", { text: v })]); }
function setPanel(...nodes) { const p = $("panel"); p.textContent = ""; for (const n of nodes) p.appendChild(n); }
// fixed, safe per-type descriptions (NOT taken from packet free-text)
const STEP_DESC = { deploy: "deploy contract at predicted CREATE address; verify runtime code hash + immutable wiring", approve: "ERC-20 approval; verify Approval(owner=signer, spender, amount)", createPool: "create Uniswap V3 pool; verify PoolCreated(token0,token1,fee,tickSpacing,pool)", initialize: "initialize pool; verify Initialize(sqrtPriceX96, tick)", mint: "mint LP position; verify IncreaseLiquidity + ERC-721 Transfer + position state", buy: "official buy; verify OfficialBuy(tradeId,trader,recipient,amounts,adapter,budget)", sell: "official sell; verify OfficialSell(tradeId,trader,recipient,amounts,adapter,budget)", lock: "create 7-day lock; verify LockCreated(account,lockId,principal,unlock,multiplier,policy)" };

function renderHalted() { setPanel(el("div", { class: "fail", text: "HALTED: " + (op.haltReason || "reconciliation required") + ". No automatic retry. Regenerate + re-review to proceed." })); }

function render() {
  if (!(op.bound && op.connected && op.reconciled) || op.halted) { renderHalted(); return; }
  const i = op.current, done = i >= op.steps.length;
  $("progress").textContent = `Step ${Math.min(i + 1, op.steps.length)} / ${op.steps.length}` + (done ? " — COMPLETE" : "") + (op.pending ? " — PENDING (sends disabled)" : "");
  if (done) { setPanel(el("div", { class: "ok", text: "All " + op.steps.length + " immediate steps executed and verified. The delayed tester-nonce-8 withdrawal is NOT executable here." })); return; }
  if (op.pending) {
    const btn = el("button", { id: "resume", text: "Verify pending transaction" });
    setPanel(el("div", { class: "warn", text: "Transaction pending (" + op.pending.txHash + "). Verify it before continuing; additional sends disabled." }), el("div", { class: "actions" }, [btn]));
    btn.onclick = () => doVerify(op.pending.txHash); return;
  }
  const t = op.steps[i], hash = keccak256(t.dataOrInitCode);
  const table = el("table", {}, [
    row("step", (i + 1) + " of " + op.steps.length + " (" + t.phase + " — " + t.label + ")"),
    row("signer", getAddress(t.signer)),
    row("nonce", String(t.nonce)),
    row("target", t.to ? getAddress(t.to) : "CREATE → " + t.predictedCreationAddress),
    row("value / type / chainId", t.value + " wei / 0x2 / 4663"),
    row("gas limit", t.gasLimit),
    row("max fee / priority", t.maxFeePerGas + " / " + t.maxPriorityFeePerGas + " wei"),
    row("postcondition", t.postconditionType),
  ]);
  const hashRow = el("tr", {}, [el("th", { text: "calldata/init-code keccak" }), el("td", { class: "mono", text: hash })]);
  table.appendChild(hashRow);
  table.appendChild(row("expected result", STEP_DESC[t.postconditionType] || t.phase));
  const precheck = el("button", { id: "precheck", text: "1) Run pre-transaction checks (fresh live-price exposure; latest+pending nonce)" });
  const actions = el("div", { class: "actions" }, [precheck, el("button", { id: "confirm", text: "2) Confirm this transaction", disabled: true }), el("button", { id: "send", text: "3) Open Rabby approval for THIS transaction", disabled: true })]);
  setPanel(table, actions);
  precheck.onclick = doPrecheck;
}

let precheckPassed = false;
async function doPrecheck() {
  precheckPassed = false; $("confirm").disabled = true; $("send").disabled = true;
  const r = await op.preconditions(provider);
  if (!r.ok) { say("PRE-CHECK FAILED: " + (r.reason || op.haltReason) + " — HALTED.", "fail"); renderHalted(); return; }
  say("Pre-checks PASSED: " + Object.keys(r.gates).join(", ") + (r.exposure ? ` | exposure $${(Number(r.exposure.exposureMicro) / 1e6).toFixed(6)} @ higher live price` : ""), "ok");
  precheckPassed = true; const c = $("confirm"); c.disabled = false;
  c.onclick = () => { if (precheckPassed) { $("send").disabled = false; say("Confirmed. Click (3) to open the Rabby approval for THIS single transaction."); } };
}
async function doSend() {
  if (!precheckPassed) return; $("send").disabled = true;
  const r = await op.sendCurrent(provider);
  if (r.userRejected) { say("You rejected the transaction in Rabby. Same step; no state changed.", "warn"); precheckPassed = false; render(); return; }
  if (r.uncertainSend) { say("UNCERTAIN SEND: the wallet errored after the request was invoked. Halted durably; supply the tx hash to resolve or regenerate under review. No blind retry.", "fail"); renderHalted(); return; }
  if (!r.ok) { say("SEND blocked/halted: " + (r.reason || op.haltReason), "fail"); render(); return; }
  say("Rabby returned tx hash " + r.txHash + " (pending persisted) — verifying…"); render(); await doVerify(r.txHash);
}
async function doVerify(txHash) {
  const v = await op.verifyAfterHash(provider, txHash);
  if (!v.ok) { say("POST-VERIFY failed: " + (v.reason || op.haltReason) + " — HALTED.", "fail"); renderHalted(); return; }
  say("Step " + (v.step + 1) + " verified (shared field/receipt verifier + event postcondition + cumulative checkpoint). Journalled.", "ok");
  precheckPassed = false; render();
}
document.addEventListener("click", (e) => { if (e.target && e.target.id === "send") doSend(); });
$("connect").onclick = connect;
init().catch(e => say("init error: " + e.message, "fail"));
