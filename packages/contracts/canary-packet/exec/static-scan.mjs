// TASK 10D — static safety scan over the operator + scripts (source-level guards).
// Rejects: private-key/seed/keystore handling, raw-transaction broadcasting, tx batching, automatic sends,
// local signer construction, and any embedded RPC credential. Comment lines that merely NAME a forbidden
// pattern to prohibit it are allowed; actual USE is not.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, extname } from "node:path";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const R = []; const ok = (n, c, d = "") => R.push({ n, pass: !!c, d });

// gather source files (skip node_modules, artifacts, sources, compiler data, json)
function files(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (["node_modules", "artifacts", "sources", "compiler", "manifests", ".git"].includes(e)) continue;
    const p = join(dir, e); const s = statSync(p);
    if (s.isDirectory()) files(p, acc);
    else if ([".mjs", ".js", ".html"].includes(extname(p))) acc.push(p);
  }
  return acc;
}
// exclude the scanner itself (it necessarily names every forbidden pattern to detect it)
const SELF = fileURLToPath(new URL("./static-scan.mjs", import.meta.url));
const srcFiles = files(DIR).filter(f => f !== SELF);

// strip line comments so that "prohibit eth_sendRawTransaction" in a comment is not a false positive,
// while real code using it is caught.
const codeOf = (f) => readFileSync(f, "utf8").split("\n").map(l => {
  const i = l.indexOf("//"); return i >= 0 ? l.slice(0, i) : l;
}).join("\n");

// USE (call-site) patterns that must never appear. Bare denylist string literals like the array element
// "eth_sendRawTransaction" do NOT match a call site, so naming a method to BLOCK it is not flagged.
const FORBIDDEN = [
  ["private-key/keystore construction", /\bprivateKeyToAccount\s*\(|\bnew\s+Wallet\s*\(|\bmnemonicToAccount\s*\(|\bWallet\.fromPhrase\s*\(|\bdecryptKeystore\s*\(|\bimportKey\s*\(/],
  ["seed/mnemonic generation", /\bentropyToMnemonic\s*\(|\bgenerateMnemonic\s*\(|\bmnemonicToSeed\s*\(/],
  ["raw transaction broadcast", /request\s*\(\s*["']eth_sendRawTransaction["']|\bsendRawTransaction\s*\(/],
  ["local signer / walletClient account", /createWalletClient\s*\(\s*\{[^}]*\baccount\s*:/],
  ["raw signing methods", /\bsignTransaction\s*\(|_signTypedData\s*\(|\.signMessage\s*\(/],
  ["account abstraction / session keys", /\bsendUserOperation\s*\(|\bbundlerClient\b|\bentryPoint\s*\./i],
  ["transaction batching", /\bwallet_sendCalls\b|\bsendTransactionBatch\s*\(|\beth_sendTransactionBatch\b/],
  ["automatic send loop", /setInterval\s*\([^)]*(send|sendCurrent)/i],
];

let anyBad = false; const findings = [];
for (const f of srcFiles) {
  const code = codeOf(f);
  for (const [name, re] of FORBIDDEN) {
    const m = re.exec(code);
    if (m) { anyBad = true; findings.push(`${f.replace(DIR, "")}: ${name} (${m[0]})`); }
  }
}
ok("no forbidden pattern (key/seed/keystore, raw broadcast, local signer, raw sign, AA/session keys, batching, auto-send)", !anyBad, findings.slice(0, 6).join(" | "));

// The operator's ONLY broadcast path must be a single eth_sendTransaction with a single tx object.
const opCorePath = fileURLToPath(new URL("./operator/operator-core.mjs", import.meta.url));
const opCore = readFileSync(opCorePath, "utf8");
ok("operator-core sends via eth_sendTransaction with a single tx (no array/batch)", /eth_sendTransaction",\s*\[this\._buildSendTx\(t\)\]/.test(opCore) && !/eth_sendTransaction",\s*\[\[/.test(opCore));
ok("operator-core maintains an explicit FORBIDDEN_METHODS denylist including eth_sendRawTransaction", /FORBIDDEN_METHODS/.test(opCore) && /eth_sendRawTransaction/.test(opCore));
// detect actual retry MECHANISMS (not the word "retry" inside a halt message string)
ok("operator-core never auto-retries (no retry/replacement mechanism)", !/\.retry\s*\(|retryTransaction\s*\(|replaceTransaction\s*\(|speedUp\s*\(|resendTransaction\s*\(|setTimeout\s*\([^)]*\bsendCurrent\b|while\s*\([^)]*\bsendCurrent\b/i.test(codeOf(opCorePath)));

// (10D-4) SINGLE bound runtime source: raw packet/policy/snapshot may be referenced ONLY up to the point
// they are discarded (`this.packet = null`). No runtime method may read them after binding.
{
  const code = codeOf(opCorePath); const anchor = "this.snapshot = null";
  const idx = code.indexOf(anchor);
  const after = idx >= 0 ? code.slice(idx + anchor.length) : code;
  ok("operator-core discards raw inputs after bind AND no runtime method reads this.packet/policy/snapshot", idx >= 0 && !/this\.(packet|policy|snapshot)\b/.test(after), idx < 0 ? "no discard found" : "raw read after discard");
}

// (10D-4) the browser UI has NO HTML/JS injection sink — every dynamic value goes through textContent /
// createElement, so packet/tx/provider-error/storage text can never be parsed as HTML or execute.
{
  const appPath = fileURLToPath(new URL("./operator/app.js", import.meta.url));
  const app = codeOf(appPath);
  const sinks = /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML\s*\(|document\.write\s*\(|\beval\s*\(|new\s+Function\s*\(/.exec(app);
  ok("operator app.js has NO HTML/JS injection sink (innerHTML/outerHTML/insertAdjacentHTML/document.write/eval)", !sinks, sinks ? sinks[0] : "textContent/createElement only");
}

// ---- credential scan: no RPC URL / api-key / secret anywhere in shipped source or data ----
function allShipped(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (["node_modules", ".git"].includes(e)) continue;
    const p = join(dir, e); const s = statSync(p);
    if (s.isDirectory()) allShipped(p, acc);
    else if ([".mjs", ".js", ".html", ".json", ".md", ".txt"].includes(extname(p))) acc.push(p);
  }
  return acc;
}
const shipped = allShipped(DIR).filter(f => f !== SELF); // the scanner necessarily contains the key-token regex
const URL_RE = /https?:\/\/[^\s"'\\)]+/g;
const ALLOWED_HOSTS = new Set(["api.coinbase.com", "api.kraken.com", "github.com", "raw.githubusercontent.com", "127.0.0.1", "localhost",
  "registry.npmjs.org"]); // ordinary package-lock.json resolved URLs (npm registry) — never a provider RPC
// documentation domains that legitimately appear in audited Solidity metadata / comments (suffix match):
const DOC_SUFFIXES = ["openzeppelin.com", "ethereum.org", "soliditylang.org", "spdx.org", "creativecommons.org", "emn178.github.io",
  "blockscout.com"]; // public block explorer host in the canary manifest (NOT the provider RPC, which is env-var only)
const hostAllowed = (h) => ALLOWED_HOSTS.has(h) || DOC_SUFFIXES.some(s => h === s || h.endsWith("." + s));
// audited, bytecode-verified build inputs (compiler input, sources, artifacts) legitimately contain
// documentation/example URLs; the credential concern is the PROVIDER RPC/key, scanned everywhere below.
// audited build inputs + bundled deployment manifests contain documented public reference URLs
// (explorer, whitelist API, EIP docs); the credential concern (provider RPC/key) is scanned in ALL files.
// package-lock.json legitimately contains registry + author funding/homepage URLs (paulmillr.com, etc.);
// it is still key-token scanned below. The provider RPC/key would never appear in a lockfile.
const isConfigOrAudited = (f) => /[\\/](compiler|sources|artifacts|manifests)[\\/]/.test(f) || /[\\/]package-lock\.json$/.test(f);
let leak = null;
for (const f of shipped) {
  const txt = readFileSync(f, "utf8");
  // provider-key-shaped token: scan EVERY shipped file (including audited)
  if (/alchemy|infura|quiknode|\/v2\/[A-Za-z0-9_-]{20,}/i.test(txt)) { leak = `${f.replace(DIR, "")}: provider-key-shaped token`; break; }
  // non-doc URL host: only in operator/scripts/reports/packet (not audited Solidity metadata)
  if (!isConfigOrAudited(f)) for (const u of (txt.match(URL_RE) || [])) { let h; try { h = new URL(u).hostname; } catch { continue; } if (!hostAllowed(h)) { leak = `${f.replace(DIR, "")}: ${h}`; break; } }
  if (leak) break;
}
ok("no RPC/provider URL or key token anywhere; no non-doc URL in operator/reports (env-var reference only)", leak === null, leak || "clean");

for (const r of R) console.log(` [${r.pass ? "PASS" : "FAIL"}] ${r.n}${r.d ? "  (" + r.d + ")" : ""}`);
const passed = R.filter(r => r.pass).length;
console.log(`\n[static-scan] ${passed}/${R.length} checks passed`);
process.exit(R.every(r => r.pass) ? 0 : 1);
