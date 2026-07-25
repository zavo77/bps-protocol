// TASK 10D — minimal static server for the canary operator, bound ONLY to 127.0.0.1.
// Read-only file serving from this directory + the parent packet/policy/snapshot. No signing, no RPC,
// no external binding. Start manually with: node operator/serve.mjs   (default http://127.0.0.1:8737)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, normalize, join } from "node:path";

const HOST = "127.0.0.1";                 // never 0.0.0.0 — localhost only
const PORT = Number(process.env.OPERATOR_PORT || 8737);
const OP_DIR = fileURLToPath(new URL(".", import.meta.url));
const EXEC_DIR = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css" };
// only these files may be served (the operator app + every module it imports + the data files it reads)
const ALLOW = new Set(["/", "/index.html", "/app.js", "/operator-core.mjs", "/canonical.mjs", "/vendor/eth.js", "/vendor/sha3.js",
  "/reviewed-authorization.json", "/canary-unsigned-packet.json", "/review-policy.json", "/block-snapshot.json"]);

const server = createServer(async (req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  if (!ALLOW.has(p)) { res.writeHead(403).end("forbidden"); return; }
  // packet/policy/snapshot live one level up (exec dir); operator files live here
  const base = ["/canary-unsigned-packet.json", "/review-policy.json", "/block-snapshot.json"].includes(p) ? EXEC_DIR : OP_DIR;
  const file = normalize(join(base, p.replace(/^\//, "")));
  if (!file.startsWith(base)) { res.writeHead(403).end("forbidden"); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch { res.writeHead(404).end("not found"); }
});
server.listen(PORT, HOST, () => console.log(`Canary operator served at http://${HOST}:${PORT}/ (localhost only). Open in the browser where Rabby is installed.`));
