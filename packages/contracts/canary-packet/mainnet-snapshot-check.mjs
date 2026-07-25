// TASK 10F-1 — read-only mainnet non-mutation snapshot (before/after the fork rehearsal).
// Reads ONLY: nonces, canary contract state, lock, allowances, pool/LP. Never signs or broadcasts.
// RPC from env ROBINHOOD_CHAIN_RPC_URL; the URL is never printed or persisted.
import { createPublicClient, http, keccak256, getAddress } from "viem";
const RPC = process.env.ROBINHOOD_CHAIN_RPC_URL;
if (!RPC) { console.error("FAIL: ROBINHOOD_CHAIN_RPC_URL not set"); process.exit(1); }
const c = createPublicClient({ transport: http(RPC) });
const rpc = (m, p = []) => c.request({ method: m, params: p });
const B = (x) => BigInt(x);
const A = (x) => getAddress(x);
const DEPLOYER = "0xD9Eec97DEDafe1451b7f201E416A502b93c1e203";
const TESTER = "0x78B256A742fa2c0f84ebdAf570fCDC16Ee206024";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const BPSC = "0x2E6C3dC1e04C45d4B9d40BeE392a135beA50A5d7";
const ROUTER = "0x4847b410D1243eD38B481B89B1D1D59a8C8691e6";
const VAULT = "0xeFA9d1C40358E281da21A1BC20a204c849cB8A42";
const STOCKVAULT = "0x9a5a55361BcFDD6Ded4A6EAa02D997F1108EdeC6";
const NPM = "0x73991a25c818bf1f1128deaab1492d45638de0d3";
const POOL = "0x4A429194dC4E4A1f3b1cD24bBaf7754f65ABc5EF";
const hexUtf8 = (s) => { let h = "0x"; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(2, "0"); return h; };
const sel = (s) => keccak256(hexUtf8(s)).slice(0, 10);
const encAddr = (x) => A(x).toLowerCase().slice(2).padStart(64, "0");
const encUint = (n) => B(n).toString(16).padStart(64, "0");
const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
const out = {
  utc: new Date().toISOString(),
  chainId: Number(B(await rpc("eth_chainId"))),
  block: B(await rpc("eth_blockNumber")).toString(),
  deployerNonceLatest: Number(B(await rpc("eth_getTransactionCount", [DEPLOYER, "latest"]))),
  deployerNoncePending: Number(B(await rpc("eth_getTransactionCount", [DEPLOYER, "pending"]))),
  testerNonceLatest: Number(B(await rpc("eth_getTransactionCount", [TESTER, "latest"]))),
  testerNoncePending: Number(B(await rpc("eth_getTransactionCount", [TESTER, "pending"]))),
  stockVaultWeth: B(await call(WETH, sel("balanceOf(address)") + encAddr(STOCKVAULT))).toString(),
  bpscTotalSupply: B(await call(BPSC, sel("totalSupply()"))).toString(),
  testerLockedPrincipal: B(await call(VAULT, sel("lockedPrincipal(address)") + encAddr(TESTER))).toString(),
  testerWethAllowanceRouter: B(await call(WETH, sel("allowance(address,address)") + encAddr(TESTER) + encAddr(ROUTER))).toString(),
  testerBpscAllowanceRouter: B(await call(BPSC, sel("allowance(address,address)") + encAddr(TESTER) + encAddr(ROUTER))).toString(),
  testerBpscAllowanceVault: B(await call(BPSC, sel("allowance(address,address)") + encAddr(TESTER) + encAddr(VAULT))).toString(),
  deployerWethAllowanceNpm: B(await call(WETH, sel("allowance(address,address)") + encAddr(DEPLOYER) + encAddr(NPM))).toString(),
  poolLiquidity: B(await call(POOL, sel("liquidity()"))).toString(),
  lpOwner371728: A("0x" + (await call(NPM, sel("ownerOf(uint256)") + encUint(371728))).slice(-40)),
};
console.log(JSON.stringify(out, null, 2));
