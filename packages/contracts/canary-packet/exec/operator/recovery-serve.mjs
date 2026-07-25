// TASK 10D-8 — minimal static server for the v9 RECOVERY operator, bound ONLY to 127.0.0.1 on a DISTINCT
// port (8741) from the v5 (8737), v6 (8738), v7 (8739) and v8 (8740) operators. Read-only file serving from the operator dir +
// the recovery data files one level up. No signing, no RPC. Start with: node operator/recovery-serve.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, normalize, join } from "node:path";

const HOST = "127.0.0.1";                                   // never 0.0.0.0 — localhost only
const PORT = Number(process.env.RECOVERY_OPERATOR_PORT || 8741);
const OP_DIR = fileURLToPath(new URL(".", import.meta.url));
const EXEC_DIR = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css" };
// every module the recovery page imports + the recovery data files it reads
const ALLOW = new Set(["/", "/recovery-index.html", "/recovery-app.js", "/recovery-core.mjs", "/operator-core.mjs", "/canonical.mjs", "/recovery-canonical.mjs", "/vendor/eth.js", "/vendor/sha3.js",
  "/recovery-authorization.json", "/recovery-packet.json", "/recovery-policy.json", "/recovery-snapshot.json"]);
const AT_EXEC = new Set(["/recovery-packet.json", "/recovery-policy.json", "/recovery-snapshot.json"]);

const server = createServer(async (req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/recovery-index.html";
  if (!ALLOW.has(p)) { res.writeHead(403).end("forbidden"); return; }
  const base = AT_EXEC.has(p) ? EXEC_DIR : OP_DIR;
  const file = normalize(join(base, p.replace(/^\//, "")));
  if (!file.startsWith(base)) { res.writeHead(403).end("forbidden"); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch { res.writeHead(404).end("not found"); }
});
server.listen(PORT, HOST, () => console.log(`Canary RECOVERY operator (v9) served at http://${HOST}:${PORT}/ (localhost only). Distinct from the v5/v6/v7/v8 operators.`));
