// TASK 10D-1 — manifest verifier. Fails on any MISSING, CHANGED, DUPLICATE, or UNEXPECTED file.
// node_modules (reinstalled via `npm ci`) and MANIFEST-sha256.txt itself are outside the manifest by design.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const MAN = join(DIR, "MANIFEST-sha256.txt");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const R = []; const ok = (n, c, d = "") => R.push({ n, pass: !!c, d });

// parse manifest
const lines = readFileSync(MAN, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
const expected = new Map(); const dupes = [];
for (const l of lines) {
  const m = /^([0-9a-f]{64})\s+(.+)$/.exec(l);
  if (!m) { R.push({ n: "manifest line parseable", pass: false, d: l }); continue; }
  const path = m[2].split("/").join(sep);
  if (expected.has(path)) dupes.push(path);
  expected.set(path, m[1]);
}
ok("no duplicate entries in manifest", dupes.length === 0, dupes.join(","));

// enumerate on-disk files (exclude node_modules + the manifest itself)
function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules") continue;
    const p = join(dir, e); const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (p !== MAN) acc.push(p);
  }
  return acc;
}
const onDisk = walk(DIR).map(p => relative(DIR, p));

const missing = [...expected.keys()].filter(p => !onDisk.includes(p));
const unexpected = onDisk.filter(p => !expected.has(p));
const changed = [];
for (const [p, h] of expected) {
  if (missing.includes(p)) continue;
  const actual = sha256(readFileSync(join(DIR, p)));
  if (actual !== h) changed.push(p);
}
ok("no missing files", missing.length === 0, missing.slice(0, 8).join(","));
ok("no changed files (sha256 matches manifest)", changed.length === 0, changed.slice(0, 8).join(","));
ok("no unexpected files (every on-disk file is in the manifest)", unexpected.length === 0, unexpected.slice(0, 8).join(","));
ok("manifest lists at least the core artifacts", ["canary-unsigned-packet.json", "review-policy.json", "block-snapshot.json", "operator/operator-core.mjs", "operator/app.js", "package.json", "package-lock.json"].every(f => expected.has(f.split("/").join(sep))));

for (const r of R) console.log(` [${r.pass ? "PASS" : "FAIL"}] ${r.n}${r.d ? "  (" + r.d + ")" : ""}`);
const passed = R.filter(r => r.pass).length;
console.log(`\n[manifest-verify] ${passed}/${R.length} checks passed (${expected.size} manifest entries, ${onDisk.length} on-disk files)`);
process.exit(R.every(r => r.pass) ? 0 : 1);
