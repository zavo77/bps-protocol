// TASK 10D-7 — read-only v8 RECOVERY preflight against the live provider RPC (env only). Gates:
//  0 chain 4663; 1 packet not expired AND live block timestamp strictly before expiry (== refreshed
//  deadlines); 2 deployer latest=pending=16 + tester latest=pending=2; 3 balances sufficient;
//  4 six dependency code hashes+sizes unchanged; 5 ALL EIGHT completed contracts code exact + pool +
//  LP position state exact; 6 base fee within envelope; 7 exposure (realized 1-13 + principal + max gas
//  14-19 at 1.25x) <= $130 at fresh higher price; 8 authorization flags + ALL 13 anchors canonical on chain.
import { readFileSync } from "node:fs";
import { createPublicClient, http, keccak256, getAddress } from "viem";

const U = (p) => new URL(p, import.meta.url);
const rj = (p) => JSON.parse(readFileSync(U(p), "utf8"));
const a = rj("recovery-packet.json"), policy = rj("recovery-policy.json"), auth = rj("operator/recovery-authorization.json");
const ENV = policy.liveRpcEnvVar || "ROBINHOOD_CHAIN_RPC_URL";
const RPC = process.env[ENV];
if (!RPC) { console.error(`FAIL: ${ENV} not set`); process.exit(1); }
const c = createPublicClient({ transport: http(RPC) });
const rpc = (m, p = []) => c.request({ method: m, params: p });
const B = (x) => BigInt(x); const A = getAddress;
const R = []; const gate = (n, cond, d = "") => R.push({ n, pass: !!cond, d });

const DEPLOYER = A(auth.wallets.deployer), TESTER = A(auth.wallets.tester);
const hexUtf8 = (s) => { let h = "0x"; for (let i = 0; i < s.length; i++) { const cc = s.charCodeAt(i); h += (cc < 16 ? "0" : "") + cc.toString(16); } return h; };
const sel = (sg) => keccak256(hexUtf8(sg)).slice(0, 10);
const encAddr = (x) => A(x).toLowerCase().slice(2).padStart(64, "0");
const encUint = (n) => B(n).toString(16).padStart(64, "0");

async function main() {
  const chainId = Number(B(await rpc("eth_chainId")));
  const now = new Date();
  gate("0. provider chain is 4663", chainId === 4663, "chainId=" + chainId);
  const headBlk = await rpc("eth_getBlockByNumber", ["latest", false]);
  const expEpoch = Math.floor(Date.parse(a.meta.expiresAtUtc) / 1000);
  gate("1. packet not expired AND live block timestamp strictly before expiry (== refreshed deadlines)", now <= new Date(a.meta.expiresAtUtc) && Number(B(headBlk.timestamp)) < expEpoch && Number(auth.deadlineRefresh.newDeadline) === expEpoch, `now=${now.toISOString()} chainTs=${Number(B(headBlk.timestamp))} expires=${a.meta.expiresAtUtc}`);
  const dl = Number(B(await rpc("eth_getTransactionCount", [DEPLOYER, "latest"]))), dp = Number(B(await rpc("eth_getTransactionCount", [DEPLOYER, "pending"])));
  const tl = Number(B(await rpc("eth_getTransactionCount", [TESTER, "latest"]))), tp = Number(B(await rpc("eth_getTransactionCount", [TESTER, "pending"])));
  gate("2. deployer latest=pending=16 and tester latest=pending=2", dl === 16 && dp === 16 && tl === 2 && tp === 2, `deployer ${dl}/${dp} tester ${tl}/${tp}`);
  const tEth = B(await rpc("eth_getBalance", [TESTER, "latest"]));
  const balOf = async (who) => B(await rpc("eth_call", [{ to: auth.infrastructure.weth, data: sel("balanceOf(address)") + encAddr(who) }, "latest"]));
  const tW = await balOf(TESTER);
  gate("3. tester balances sufficient (>= snapshot; all remaining txs are tester txs)", tEth >= B(auth.snapshotBalances.testerEth) && tW >= B(auth.snapshotBalances.testerWeth), `tester ETH ${tEth} WETH ${tW}`);
  let depOk = true, depBad = [];
  for (const [k, d] of Object.entries(auth.dependencies)) { const code = await rpc("eth_getCode", [d.address, "latest"]); if (keccak256(code).toLowerCase() !== d.runtimeCodeHash.toLowerCase() || (code.length - 2) / 2 !== d.codeBytes) { depOk = false; depBad.push(k); } }
  gate("4. six dependency code hashes + sizes unchanged", depOk, depBad.join(","));
  let ccOk = true, ccBad = [];
  for (const [slot, d] of Object.entries(auth.completedContracts)) { const code = await rpc("eth_getCode", [d.address, "latest"]); if (keccak256(code).toLowerCase() !== d.runtimeCodeHash.toLowerCase()) { ccOk = false; ccBad.push(slot); } }
  const gp = A("0x" + (await rpc("eth_call", [{ to: auth.infrastructure.uniswapV3Factory, data: sel("getPool(address,address,uint24)") + encAddr(auth.lp.token0) + encAddr(auth.lp.token1) + encUint(auth.lp.feeTier) }, "latest"])).slice(-40));
  const owner = A("0x" + (await rpc("eth_call", [{ to: auth.infrastructure.nonfungiblePositionManager, data: sel("ownerOf(uint256)") + encUint(auth.positionTokenId) }, "latest"])).slice(-40));
  const pos = await rpc("eth_call", [{ to: auth.infrastructure.nonfungiblePositionManager, data: sel("positions(uint256)") + encUint(auth.positionTokenId) }, "latest"]);
  const liq = B("0x" + pos.slice(2 + 7 * 64, 2 + 8 * 64));
  gate("5. ALL 8 completed contracts code exact + pool + LP position (owner/liquidity) exact", ccOk && gp === A(auth.pool) && owner === DEPLOYER && liq.toString() === auth.positionLiquidity, ccBad.join(","));
  const maxPrio = B(a.meta.feeBounds.maxPriorityFeePerGasWei), maxFee = B(a.meta.feeBounds.maxFeePerGasWei);
  gate("6. current base fee fits the fee envelope", B(headBlk.baseFeePerGas) + maxPrio <= maxFee, `baseFee=${B(headBlk.baseFeePerGas)} + prio=${maxPrio} <= max=${maxFee}`);
  const [cb, kr] = await Promise.all([
    fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { cache: "no-store" }).then(r => r.json()),
    fetch("https://api.kraken.com/0/public/Ticker?pair=ETHUSD", { cache: "no-store" }).then(r => r.json()),
  ]);
  const toMicro = (dec) => { const [i, f = ""] = String(dec).split("."); return BigInt(i) * 1_000_000n + BigInt((f + "000000").slice(0, 6)); };
  const cbP = toMicro(cb.data.amount), krP = toMicro(Object.values(kr.result)[0].c[0]);
  const higher = cbP > krP ? cbP : krP;
  const agg = B(auth.exposure.realizedGasWei) + B(auth.exposure.remainingPrincipalWei) + B(auth.exposure.remainingMaxGasWei);
  const micro = (agg * higher) / 10n ** 18n;
  gate("7. exposure (realized gas 1-13 + principal + max gas 14-19 at 1.25x) <= $130 at fresh higher price", agg === B(auth.exposure.aggregateWei) && micro <= 130_000_000n, `$${(Number(micro) / 1e6).toFixed(6)} (coinbase ${cb.data.amount} / kraken ${Object.values(kr.result)[0].c[0]})`);
  let anchorOk = true, anchorBad = [];
  for (const anc of auth.completedSteps) {
    const tx = await rpc("eth_getTransactionByHash", [anc.txHash]);
    const rc = await rpc("eth_getTransactionReceipt", [anc.txHash]);
    if (!(tx && rc && B(rc.status) === 1n && A(tx.from) === A(anc.signer) && Number(B(tx.nonce)) === anc.nonce && keccak256(tx.input).toLowerCase() === anc.inputKeccak.toLowerCase() && (!anc.createdAddress || A(rc.contractAddress) === A(anc.createdAddress)))) { anchorOk = false; anchorBad.push(anc.originalIndex); }
  }
  const flagsOk = ["broadcastReady", "liveWritesApproved", "executionAuthorized", "fundingAuthorized"].every(k => a.safetyFlags[k] === true && auth.flags[k] === true);
  gate("8. authorization flags true + ALL 13 completed anchors canonical on chain", anchorOk && flagsOk, anchorBad.join(","));

  console.log("RECOVERY PREFLIGHT (v8)");
  for (const r of R) console.log(` [${r.pass ? "PASS" : "FAIL"}] ${r.n}${r.d ? "  (" + r.d + ")" : ""}`);
  const pass = R.every(r => r.pass);
  console.log(pass ? "RECOVERY PREFLIGHT: PASS — recovery execution authorized for the final SIX tester transactions; signing occurs only via per-tx Rabby approval with the TESTER selected." : "RECOVERY PREFLIGHT: FAIL — do not execute; regenerate.");
  process.exit(pass ? 0 : 1);
}
main().catch(e => { console.error("RECOVERY PREFLIGHT ERROR:", e.message); process.exit(1); });
