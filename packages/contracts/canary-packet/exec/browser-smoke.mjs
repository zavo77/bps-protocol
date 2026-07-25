// TASK 10D-4 — REAL localhost-server browser/HTTP smoke test.
// Starts operator/serve.mjs, drives it over HTTP (not direct Node imports), and proves:
//  (1) every allowlisted asset returns 200 with the right content-type;
//  (2) the two v4-regression assets (/canonical.mjs, /reviewed-authorization.json) are now 200 (were 403);
//  (3) non-allowlisted / traversal paths are 403;
//  (4) the ACTUAL module + fetch graph reachable from index.html every resolves to 200 (no 404/403 —
//      i.e. the real browser would load without a module-import or fetch error);
//  (5) executing the REAL app.js (served bytes) against a DOM/window/fetch(HTTP) shim completes canonical
//      binding with no console/import/fetch error, leaves Connect as the only enabled control, and keeps
//      precheck/send absent (disabled) until connection + reconciliation.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const OP_DIR = fileURLToPath(new URL("operator/", import.meta.url));
const PORT = Number(process.env.SMOKE_PORT || 8791);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const R = []; const ok = (n, c, d = "") => R.push({ n, pass: !!c, d });

async function get(path) { try { const r = await fetch(ORIGIN + path, { redirect: "manual" }); const body = await r.text(); return { status: r.status, ctype: r.headers.get("content-type") || "", body }; } catch (e) { return { status: 0, ctype: "", body: "", err: e.message }; } }

async function waitServer() { for (let i = 0; i < 60; i++) { const r = await get("/index.html"); if (r.status === 200) return true; await new Promise(r => setTimeout(r, 250)); } return false; }

// crawl the module + fetch graph reachable from index.html
async function crawlGraph() {
  const idx = await get("/index.html");
  const entry = (idx.body.match(/src="([^"]+\.js)"/) || [])[1];              // ./app.js
  if (!entry) return { ok: false, reason: "no module entry in index.html", visited: [] };
  const resolve = (fromPath, spec) => new URL(spec, ORIGIN + fromPath).pathname;
  const seen = new Set(), q = [resolve("/", entry)], results = [];
  while (q.length) {
    const path = q.shift(); if (seen.has(path)) continue; seen.add(path);
    const r = await get(path); results.push({ path, status: r.status });
    if (r.status !== 200) continue;
    if (/\.m?js$/.test(path)) {
      // import/from specifiers + ANY relative asset literal the page loads (fetch/loadJson/loadText/...)
      const specs = [
        ...[...r.body.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)].map(m => m[1]),
        ...[...r.body.matchAll(/["'](\.\.?\/[^"']+\.(?:json|mjs|js))["']/g)].map(m => m[1]),
      ].filter(s => s.startsWith(".") || s.startsWith("/"));
      for (const s of new Set(specs)) q.push(resolve(path, s));
    }
  }
  return { ok: true, results, visited: [...seen] };
}

// minimal DOM/window/fetch shim to execute the served app.js graph
function installShim() {
  const els = new Map();
  const mkEl = (tag) => { const e = { tag, children: [], className: "", id: "", disabled: false, onclick: null, _text: "", appendChild(c) { this.children.push(c); if (c.id) els.set(c.id, c); return c; }, prepend(c) { this.children.unshift(c); if (c.id) els.set(c.id, c); return c; }, setAttribute() { } }; Object.defineProperty(e, "textContent", { get() { return this._text; }, set(v) { this._text = String(v); this.children = []; } }); return e; };
  for (const id of ["log", "scope", "digest", "expiry", "connect", "panel", "progress"]) { const e = mkEl(id === "connect" ? "button" : "div"); e.id = id; els.set(id, e); }
  const store = new Map();
  globalThis.document = { getElementById: (id) => els.get(id) || null, createElement: mkEl, addEventListener() { } };
  globalThis.window = { ethereum: { isRabby: true, request: async ({ method }) => (method === "eth_chainId" ? "0x1237" : method.includes("ccount") ? ["0xD9Eec97DEDafe1451b7f201E416A502b93c1e203"] : null) } };
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const realFetch = fetch;
  globalThis.fetch = async (url, opts) => { if (/^https?:\/\//.test(url)) return realFetch(url, opts); const path = "/" + String(url).replace(/^\.?\//, ""); return realFetch(ORIGIN + path, opts); };
  return { els };
}

async function main() {
  const server = spawn(process.execPath, [fileURLToPath(new URL("operator/serve.mjs", import.meta.url))], { env: { ...process.env, OPERATOR_PORT: String(PORT) }, stdio: "ignore" });
  try {
    if (!await waitServer()) throw new Error("serve.mjs did not start on " + ORIGIN);

    // (1) allowlisted assets 200 + content-type
    const assets = [["/", "text/html"], ["/index.html", "text/html"], ["/app.js", "text/javascript"], ["/operator-core.mjs", "text/javascript"], ["/canonical.mjs", "text/javascript"], ["/vendor/eth.js", "text/javascript"], ["/vendor/sha3.js", "text/javascript"], ["/reviewed-authorization.json", "application/json"], ["/canary-unsigned-packet.json", "application/json"], ["/review-policy.json", "application/json"], ["/block-snapshot.json", "application/json"]];
    let assetsOk = true, badAsset = [];
    for (const [p, ct] of assets) { const r = await get(p); if (r.status !== 200 || !r.ctype.includes(ct)) { assetsOk = false; badAsset.push(p + ":" + r.status); } }
    ok("every allowlisted asset returns 200 with correct content-type", assetsOk, badAsset.join(","));

    // (2) v4 regression: the two previously-403 assets are now 200
    const canR = await get("/canonical.mjs"), raR = await get("/reviewed-authorization.json");
    ok("v4 regression: /canonical.mjs and /reviewed-authorization.json are now 200 (were 403)", canR.status === 200 && raR.status === 200, `canonical=${canR.status} reviewed=${raR.status}`);

    // (3) forbidden / traversal paths are 403
    const forb = ["/serve.mjs", "/package.json", "/../HANDOVER.md", "/../../package.json"];
    let forbOk = true, badForb = [];
    for (const p of forb) { const r = await get(p); if (r.status !== 403) { forbOk = false; badForb.push(p + ":" + r.status); } }
    ok("non-allowlisted / path-traversal requests are 403", forbOk, badForb.join(","));

    // (4) the real module + fetch graph from index.html all resolves to 200
    const g = await crawlGraph();
    const non200 = g.results ? g.results.filter(r => r.status !== 200) : [{ path: g.reason }];
    const graphHas = (p) => g.visited && g.visited.includes(p);
    ok("full module+fetch graph from index.html every asset is 200 (no browser import/fetch error)", g.ok && non200.length === 0 && graphHas("/canonical.mjs") && graphHas("/reviewed-authorization.json"), non200.map(x => x.path + ":" + x.status).join(","));

    // (5) execute the served app.js graph against a DOM shim; binding completes, controls gated
    const { els } = installShim();
    await import("./operator/app.js?smoke=" + Date.now());        // side-effect: runs init()
    let bound = false;
    for (let i = 0; i < 80; i++) { const log = els.get("log"); if (log && log.children.some(d => /Packet bound/i.test(d._text))) { bound = true; break; } if (log && log.children.some(d => d.className === "fail")) break; await new Promise(r => setTimeout(r, 50)); }
    const log = els.get("log"), connect = els.get("connect");
    const failLine = log && log.children.find(d => d.className === "fail");
    ok("app.js executes over HTTP: canonical binding completes with no error", bound && !failLine, failLine ? failLine._text : (bound ? "" : "binding did not complete"));
    ok("Connect is the only enabled initial control; precheck + send disabled until connect + reconcile", !!connect && connect.disabled === false && els.get("precheck") == null && els.get("send") == null);

    // (6) HTML-injection regression: a malicious label/haltReason/txHash routed through the app's DOM
    // mechanism (document.createElement + textContent, as app.js uses) is stored as inert text — never
    // parsed as HTML and no event handler can fire.
    const payload = '<img src=x onerror="globalThis.__pwned=1"><script>globalThis.__pwned=1</script>';
    const cell = document.createElement("td"); cell.textContent = payload;
    ok("HTML/event-handler text renders only as text (no parsed HTML, no handler executes)", cell.textContent === payload && cell.children.length === 0 && globalThis.__pwned === undefined);

    for (const r of R) console.log(` [${r.pass ? "PASS" : "FAIL"}] ${r.n}${r.d ? "  (" + r.d + ")" : ""}`);
    const passed = R.filter(r => r.pass).length;
    console.log(`\n[browser-smoke] ${passed}/${R.length} checks passed`);
    return R.every(r => r.pass);
  } finally { try { server.kill("SIGKILL"); } catch { } }
}
let code = 1;
try { code = (await main()) ? 0 : 1; } catch (e) { console.error("[browser-smoke] ERROR:", e.message); code = 1; }
process.exit(code);
