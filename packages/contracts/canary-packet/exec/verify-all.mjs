// TASK 10D-1 — one-command verification. Runs compile, offline, clean-fork replay, operator engine test
// (success + fault-injection), static safety scan, and manifest verification. All must pass.
// Documented command:  npm ci --ignore-scripts && node verify-all.mjs
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const run = (script, label, needsFork) => {
  console.log(`\n>>> ${label}${needsFork ? " (spawns a clean Anvil fork; needs anvil + ROBINHOOD_CHAIN_RPC_URL)" : ""}`);
  const r = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), "--exit"], { stdio: "inherit", cwd: here });
  return { label, ok: r.status === 0 };
};

const results = [];
results.push(run("compile-verify.mjs", "compilation (solc 0.8.26 -> 8 bytecodes)"));
results.push(run("verify-packet.mjs", "offline verifier"));
results.push(run("manifest-verify.mjs", "manifest integrity"));
results.push(run("static-scan.mjs", "static safety scan"));
results.push(run("replay-verify.mjs", "independent clean-fork replay", true));
results.push(run("operator-test.mjs", "operator engine + fault-injection test", true));
results.push(run("browser-smoke.mjs", "real localhost-server browser/HTTP smoke"));
results.push(run("recovery-test.mjs", "v9 RECOVERY replay (steps 1-13 imported + 6/6 tester) + adversarial + mutation suites", true));
results.push(run("recovery-browser-smoke.mjs", "v9 RECOVERY localhost browser/HTTP smoke (port 8741)"));

console.log("\n========================================================");
for (const r of results) console.log(` ${r.ok ? "PASS" : "FAIL"}  ${r.label}`);
const pass = results.every(r => r.ok);
console.log(pass ? " VERIFY-ALL: PASS" : " VERIFY-ALL: FAIL");
console.log("========================================================");
process.exit(pass ? 0 : 1);
