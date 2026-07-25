// TASK 10B-8 one-command verification runner. Self-contained: uses only bundled files + vendored viem.
// Runs: (1) offline verifier, (2) independent clean-fork replay, (3) git provenance (when in a repo).
// Requires: node (>=20), anvil in PATH, and network access to the live RPC (for forking only).
import { spawnSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
const U = (p) => new URL(p, import.meta.url);
const a = JSON.parse(readFileSync(U("canary-unsigned-packet.json"), "utf8"));
const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function run(script) {
  const r = spawnSync(process.execPath, [new URL(script, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "--exit"], { stdio: "inherit", cwd: here });
  return r.status === 0;
}

console.log("========================================================");
console.log(" TASK 10B-8 canary review bundle — verification runner");
console.log(" mode:", a.meta.mode, "| live:", a.meta.live, "| executable:", a.meta.executable);
console.log("========================================================\n");

console.log(">>> (1/4) SOURCE COMPILATION (solc 0.8.26, all 37 sources -> 8 bytecodes)\n");
const compiled = run("compile-verify.mjs");

console.log("\n>>> (2/4) OFFLINE VERIFIER\n");
const offline = run("verify-packet.mjs");

console.log("\n>>> (3/4) INDEPENDENT CLEAN-FORK REPLAY\n");
const replay = run("replay-verify.mjs");

console.log("\n>>> (4/4) GIT BUILD PROVENANCE\n");
let gitStatus;
try {
  const head = execSync("git rev-parse HEAD", { cwd: here, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  const dirty = execSync("git status --porcelain --untracked-files=no", { cwd: here, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  const headMatch = head === a.provenance.repoHead;
  const clean = dirty.length === 0;
  console.log(` git HEAD ${head} ${headMatch ? "==" : "!="} recorded repoHead`);
  console.log(` tracked tree ${clean ? "clean" : "DIRTY"}; recorded dirtyTrackedTree=${a.provenance.dirtyTrackedTree}`);
  gitStatus = headMatch && clean && a.provenance.dirtyTrackedTree === false;
  console.log(gitStatus ? " [PASS] git provenance" : " [FAIL] git provenance");
} catch {
  gitStatus = "n/a";
  console.log(" [N/A] not inside a git repository (extracted bundle) — build provenance is established");
  console.log("       independently by the offline verifier via source-file + artifact + bytecode hashes.");
}

console.log("\n========================================================");
const gitOk = gitStatus === true || gitStatus === "n/a";
const pass = compiled && offline && replay && gitOk;
console.log(` compile: ${compiled ? "PASS" : "FAIL"} | offline: ${offline ? "PASS" : "FAIL"} | replay: ${replay ? "PASS" : "FAIL"} | git: ${gitStatus === "n/a" ? "N/A" : (gitStatus ? "PASS" : "FAIL")}`);
const label = a.meta.mode === "live"
  ? "LIVE packet — preparation only; NOT funding or execution authorization"
  : "historical fixture — non-live, non-executable";
console.log(pass ? ` OVERALL: PASS  (${label})` : " OVERALL: FAIL");
console.log("========================================================");
process.exit(pass ? 0 : 1);
