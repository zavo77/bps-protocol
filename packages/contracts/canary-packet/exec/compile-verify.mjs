// TASK 10B-8A item 1 — compile ALL bundled sources with the exact solc 0.8.26 (vendored solc-js)
// from the bundled Standard JSON input (incl. the exact OpenZeppelin remapping) and require all
// eight creation AND runtime bytecodes to equal the bundled artifacts.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const solc = require("solc");
const U = (p) => new URL(p, import.meta.url);
const rj = (p) => JSON.parse(readFileSync(U(p), "utf8"));

const EXPECTED_SOLC = "0.8.26";
const REQUIRED_REMAPPING = "@openzeppelin/contracts/=../../node_modules/@openzeppelin/contracts/";
const R = []; const ok = (n, c, d = "") => R.push({ n, pass: !!c, d });

const input = rj("compiler/standard-json-input.json");
ok(`solc is exactly ${EXPECTED_SOLC}`, solc.version().startsWith(EXPECTED_SOLC), solc.version());
ok("Standard JSON contains the exact OpenZeppelin remapping", Array.isArray(input.settings.remappings) && input.settings.remappings.includes(REQUIRED_REMAPPING));
ok("Standard JSON settings: optimizer enabled runs=200, evmVersion=cancun", input.settings.optimizer?.enabled === true && input.settings.optimizer?.runs === 200 && input.settings.evmVersion === "cancun");
ok("Standard JSON contains all 37 bundled sources", Object.keys(input.sources).length === 37);

// every declared source must be present in the bundle and byte-identical to the input content
const idx = rj("compiler/source-index.json").index;
let srcOk = true;
for (const [p, v] of Object.entries(input.sources)) {
  const rel = idx[p];
  if (!rel) { srcOk = false; continue; }
  if (readFileSync(U(rel), "utf8") !== v.content) srcOk = false;
}
ok("every Standard JSON source == the corresponding bundled source file", srcOk);

input.settings.outputSelection = { "*": { "*": ["evm.bytecode.object", "evm.deployedBytecode.object"] } };
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter(e => e.severity === "error");
ok("compilation succeeded with no errors", errors.length === 0, errors.slice(0, 2).map(e => e.formattedMessage || e.message).join(" | "));

const CONTRACTS = {
  BPSCanaryToken: "src/canary/BPSCanaryToken.sol",
  BPSLockingVault: "src/BPSLockingVault.sol",
  DistributionClaimManager: "src/DistributionClaimManager.sol",
  RialtoStockAcquisitionAdapter: "src/adapters/RialtoStockAcquisitionAdapter.sol",
  DistributionFundingCoordinator: "src/DistributionFundingCoordinator.sol",
  StockAcquisitionVault: "src/StockAcquisitionVault.sol",
  UniswapV3BPSSwapAdapter: "src/adapters/UniswapV3BPSSwapAdapter.sol",
  BPSTradeRouter: "src/BPSTradeRouter.sol",
};
let allMatch = true; const detail = [];
for (const [name, path] of Object.entries(CONTRACTS)) {
  const c = out.contracts?.[path]?.[name];
  const art = rj(`artifacts/${name}.json`);
  if (!c) { allMatch = false; detail.push(`${name}:not-compiled`); continue; }
  const cre = ("0x" + c.evm.bytecode.object).toLowerCase();
  const run = ("0x" + c.evm.deployedBytecode.object).toLowerCase();
  const okC = cre === art.bytecode.object.toLowerCase();
  const okR = run === art.deployedBytecode.object.toLowerCase();
  if (!okC || !okR) { allMatch = false; detail.push(`${name}:${okC ? "" : "creation "}${okR ? "" : "runtime"}`); }
}
ok("all EIGHT recompiled creation AND runtime bytecodes == bundled artifacts", allMatch, detail.join(","));

console.log("[compile] solc", solc.version());
for (const r of R) console.log(` [${r.pass ? "PASS" : "FAIL"}] ${r.n}${r.d ? "  (" + r.d + ")" : ""}`);
const passed = R.filter(r => r.pass).length;
console.log(`\n[compile] ${passed}/${R.length} checks passed`);
const allPass = R.every(r => r.pass);
if (process.argv.includes("--exit")) process.exit(allPass ? 0 : 1);
export default { allPass };
