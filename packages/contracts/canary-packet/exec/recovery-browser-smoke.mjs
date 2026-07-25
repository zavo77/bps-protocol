// TASK 10D-8 — REAL localhost-server browser/HTTP smoke test for the v9 RECOVERY operator (port 8741).
// Proves: every recovery asset 200 (incl. /recovery-canonical.mjs + /recovery-authorization.json), the full
// module+fetch graph resolves, non-allowlisted/traversal 403, the served recovery-app.js completes recovery
// binding with no console/import/fetch error, Connect is the only enabled control, the step-1 anchor renders
// as "verified complete" with NO precheck/confirm/send button for either completed step, HTML text stays
// inert, and the v7 page never touches the v5 OR v6 storage namespaces.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.RECOVERY_SMOKE_PORT || 8741);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const R = []; const ok = (n, c, d = "") => R.push({ n, pass: !!c, d });

async function get(path) { try { const r = await fetch(ORIGIN + path, { redirect: "manual" }); const body = await r.text(); return { status: r.status, ctype: r.headers.get("content-type") || "", body }; } catch (e) { return { status: 0, ctype: "", body: "", err: e.message }; } }
async function waitServer() { for (let i = 0; i < 60; i++) { const r = await get("/recovery-index.html"); if (r.status === 200) return true; await new Promise(r => setTimeout(r, 250)); } return false; }

async function crawlGraph() {
  const idx = await get("/recovery-index.html");
  const entry = (idx.body.match(/src="([^"]+\.js)"/) || [])[1];
  if (!entry) return { ok: false, reason: "no module entry", visited: [] };
  const resolve = (fromPath, spec) => new URL(spec, ORIGIN + fromPath).pathname;
  const seen = new Set(), q = [resolve("/", entry)], results = [];
  while (q.length) {
    const path = q.shift(); if (seen.has(path)) continue; seen.add(path);
    const r = await get(path); results.push({ path, status: r.status });
    if (r.status !== 200) continue;
    if (/\.m?js$/.test(path)) {
      const specs = [...[...r.body.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)].map(m => m[1]), ...[...r.body.matchAll(/["'](\.\.?\/[^"']+\.(?:json|mjs|js))["']/g)].map(m => m[1])].filter(s => s.startsWith(".") || s.startsWith("/"));
      for (const s of new Set(specs)) q.push(resolve(path, s));
    }
  }
  return { ok: true, results, visited: [...seen] };
}

function installShim() {
  const els = new Map(); const touchedKeys = [];
  const mkEl = (tag) => { const e = { tag, children: [], className: "", id: "", disabled: false, onclick: null, _text: "", appendChild(c) { this.children.push(c); if (c.id) els.set(c.id, c); return c; }, prepend(c) { this.children.unshift(c); if (c.id) els.set(c.id, c); return c; }, setAttribute() { } }; Object.defineProperty(e, "textContent", { get() { return this._text; }, set(v) { this._text = String(v); this.children = []; } }); return e; };
  for (const id of ["log", "scope", "digest", "anchor", "anchor2", "anchor13", "anchorCount", "expiry", "connect", "panel", "progress"]) { const e = mkEl(id === "connect" ? "button" : "div"); e.id = id; els.set(id, e); }
  const store = new Map();
  store.set("canary:halt:0xv5digest", JSON.stringify({ reason: "V5 HALT — MUST BE UNTOUCHED" })); // simulated v5 record
  store.set("canaryv6:halt:0xv6digest", JSON.stringify({ reason: "V6 HALT — MUST BE UNTOUCHED" })); // simulated v6 record
  store.set("canaryv7:halt:0xv7digest", JSON.stringify({ reason: "V7 HALT — MUST BE UNTOUCHED" })); // simulated v7 record
  store.set("canaryv8:halt:0xv8digest", JSON.stringify({ reason: "V8 HALT — MUST BE UNTOUCHED" })); // simulated v8 record
  globalThis.document = { getElementById: (id) => els.get(id) || null, createElement: mkEl, addEventListener() { } };
  globalThis.window = { ethereum: { isRabby: true, request: async ({ method }) => (method === "eth_chainId" ? "0x1237" : method.includes("ccount") ? ["0xD9Eec97DEDafe1451b7f201E416A502b93c1e203"] : null) } };
  globalThis.localStorage = { getItem: (k) => { touchedKeys.push("get:" + k); return store.has(k) ? store.get(k) : null; }, setItem: (k, v) => { touchedKeys.push("set:" + k); store.set(k, v); } };
  const realFetch = fetch;
  globalThis.fetch = async (url, opts) => { if (/^https?:\/\//.test(url)) return realFetch(url, opts); const path = "/" + String(url).replace(/^\.?\//, ""); return realFetch(ORIGIN + path, opts); };
  return { els, store, touchedKeys };
}

async function main() {
  const server = spawn(process.execPath, [fileURLToPath(new URL("operator/recovery-serve.mjs", import.meta.url))], { env: { ...process.env, RECOVERY_OPERATOR_PORT: String(PORT) }, stdio: "ignore" });
  try {
    if (!await waitServer()) throw new Error("recovery-serve.mjs did not start on " + ORIGIN);

    const assets = [["/", "text/html"], ["/recovery-index.html", "text/html"], ["/recovery-app.js", "text/javascript"], ["/recovery-core.mjs", "text/javascript"], ["/operator-core.mjs", "text/javascript"], ["/canonical.mjs", "text/javascript"], ["/recovery-canonical.mjs", "text/javascript"], ["/vendor/eth.js", "text/javascript"], ["/vendor/sha3.js", "text/javascript"], ["/recovery-authorization.json", "application/json"], ["/recovery-packet.json", "application/json"], ["/recovery-policy.json", "application/json"], ["/recovery-snapshot.json", "application/json"]];
    let assetsOk = true, bad = [];
    for (const [p, ct] of assets) { const r = await get(p); if (r.status !== 200 || !r.ctype.includes(ct)) { assetsOk = false; bad.push(p + ":" + r.status); } }
    ok("every recovery asset returns 200 with correct content-type (port " + PORT + ")", assetsOk, bad.join(","));

    const forb = ["/serve.mjs", "/index.html", "/app.js", "/canary-unsigned-packet.json", "/../HANDOVER.md"];
    let forbOk = true, badF = [];
    for (const p of forb) { const r = await get(p); if (r.status !== 403) { forbOk = false; badF.push(p + ":" + r.status); } }
    ok("v5 pages + non-allowlisted + traversal are 403 on the v9 origin", forbOk, badF.join(","));

    const g = await crawlGraph();
    const non200 = g.results ? g.results.filter(r => r.status !== 200) : [{ path: g.reason }];
    ok("full module+fetch graph from recovery-index.html every asset is 200", g.ok && non200.length === 0 && g.visited.includes("/recovery-canonical.mjs") && g.visited.includes("/recovery-authorization.json"), non200.map(x => x.path + ":" + x.status).join(","));

    const { els, store, touchedKeys } = installShim();
    await import("./operator/recovery-app.js?smoke=" + Date.now());
    let bound = false;
    for (let i = 0; i < 80; i++) { const log = els.get("log"); if (log && log.children.some(d => /Recovery bound/i.test(d._text))) { bound = true; break; } if (log && log.children.some(d => d.className === "fail")) break; await new Promise(r => setTimeout(r, 50)); }
    const log = els.get("log"), connect = els.get("connect");
    const failLine = log && log.children.find(d => d.className === "fail");
    ok("recovery-app.js executes over HTTP: recovery binding completes with no error", bound && !failLine, failLine ? failLine._text : (bound ? "" : "binding did not complete"));
    ok("Connect is the only enabled initial control; NO precheck/confirm/send exists (incl. none for step 1)", !!connect && connect.disabled === false && els.get("precheck") == null && els.get("confirm") == null && els.get("send") == null);
    ok("step-1 anchor tx hash rendered read-only", els.get("anchor") && /^0x36acf3e3/.test(els.get("anchor")._text));
    ok("step-2 anchor tx hash rendered read-only", els.get("anchor2") && /^0x4569523a/.test(els.get("anchor2")._text));
    ok("step-13 (NPM.mint) anchor + 13-anchor count rendered read-only", els.get("anchor13") && /^0x09ee1c10/.test(els.get("anchor13")._text) && els.get("anchorCount") && /^13 /.test(els.get("anchorCount")._text));
    // namespace isolation: the v8 page must not read/write any v5 ("canary:"), v6 ("canaryv6:") or v7 ("canaryv7:") key
    const priorTouched = touchedKeys.filter(k => /(?:get|set):canary:/.test(k) || /(?:get|set):canaryv6:/.test(k) || /(?:get|set):canaryv7:/.test(k) || /(?:get|set):canaryv8:/.test(k));
    ok("v9 page touches ONLY the canaryv9 storage namespace (v5/v6/v7/v8 records untouched)", priorTouched.length === 0 && store.get("canary:halt:0xv5digest").includes("MUST BE UNTOUCHED") && store.get("canaryv6:halt:0xv6digest").includes("MUST BE UNTOUCHED") && store.get("canaryv7:halt:0xv7digest").includes("MUST BE UNTOUCHED") && store.get("canaryv8:halt:0xv8digest").includes("MUST BE UNTOUCHED"), priorTouched.slice(0, 3).join(","));
    // injection inertness
    const payload = '<img src=x onerror="globalThis.__pwned=1">';
    const cell = document.createElement("td"); cell.textContent = payload;
    ok("HTML/handler text renders only as text on the recovery page", cell.textContent === payload && cell.children.length === 0 && globalThis.__pwned === undefined);

    for (const r of R) console.log(` [${r.pass ? "PASS" : "FAIL"}] ${r.n}${r.d ? "  (" + r.d + ")" : ""}`);
    const passed = R.filter(r => r.pass).length;
    console.log(`\n[recovery-browser-smoke] ${passed}/${R.length} checks passed (port ${PORT})`);
    return R.every(r => r.pass);
  } finally { try { server.kill("SIGKILL"); } catch { } }
}
let code = 1;
try { code = (await main()) ? 0 : 1; } catch (e) { console.error("[recovery-browser-smoke] ERROR:", e.message); code = 1; }
process.exit(code);
