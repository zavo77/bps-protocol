// TASK 10E-1 — POST-CANARY MAINNET RECONCILIATION (strictly read-only; RPC from env, never recorded).
// Independently reconstructs the six tester transactions (nonces 2-7 = original steps 14-19) by
// binary-searching each tester-nonce transition block, verifies every field/receipt/event against the
// accepted v9 canonical, re-verifies all completed protocol state, recalculates realized gas / principal /
// fees / final balances, and writes the machine-readable evidence manifest JSON to docs/audit/.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createPublicClient, http, keccak256, getAddress, toHex, decodeEventLog } from "viem";

const U = (p) => new URL(p, import.meta.url);
const rj = (p) => JSON.parse(readFileSync(U(p), "utf8"));
const packet = rj("exec/recovery-packet.json");                          // accepted v9 (digest re-verified by caller)
const auth = rj("exec/operator/recovery-authorization.json");
const policy = rj("exec/recovery-policy.json");
const rehearsal = rj("exec/canary-unsigned-packet.json");
const ENV = policy.liveRpcEnvVar || "ROBINHOOD_CHAIN_RPC_URL";
const RPC = process.env[ENV];
if (!RPC) { console.error(`FAIL: ${ENV} not set`); process.exit(1); }
const c = createPublicClient({ transport: http(RPC) });
const rpc = (m, p = []) => c.request({ method: m, params: p });
const B = (x) => BigInt(x);
const A = (x) => getAddress(x);

const DEPLOYER = A(auth.wallets.deployer), TESTER = A(auth.wallets.tester);
const WETH = A(auth.infrastructure.weth), NPM = A(auth.infrastructure.nonfungiblePositionManager), FACTORY = A(auth.infrastructure.uniswapV3Factory);
const POOL = A(auth.pool);
const CC = auth.completedContracts;
const ROUTER = A(CC.tradeRouter.address), VAULT = A(CC.lockingVault.address), STOCKVAULT = A(CC.stockVault.address), BPSC = A(CC.canaryToken.address);
const V9_PIN = B(packet.meta.forkBlock);                            // tester nonce was 2 at this block

const fails = [];
const need = (cond, msg) => { if (!cond) fails.push(msg); return !!cond; };
const hexUtf8 = (s) => { let h = "0x"; for (let i = 0; i < s.length; i++) { const cc2 = s.charCodeAt(i); h += (cc2 < 16 ? "0" : "") + cc2.toString(16); } return h; };
const sig0 = (s) => keccak256(hexUtf8(s)).toLowerCase();
const sel = (s) => sig0(s).slice(0, 10);
const encAddr = (x) => A(x).toLowerCase().slice(2).padStart(64, "0");
const encUint = (n) => B(n).toString(16).padStart(64, "0");
const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);

async function nonceCount(addr, block) { return Number(B(await rpc("eth_getTransactionCount", [addr, toHex(B(block))]))); }
async function findTesterTxByNonce(nonce, lo, hi) {
  let a = lo, b = hi;
  while (a < b) { const mid = (a + b) >> 1n; ((await nonceCount(TESTER, mid)) >= nonce + 1) ? (b = mid) : (a = mid + 1n); }
  const blk = await rpc("eth_getBlockByNumber", [toHex(a), true]);
  const tx = blk.transactions.find(t => A(t.from) === TESTER && Number(B(t.nonce)) === nonce);
  if (!tx) throw new Error("tester nonce " + nonce + " tx not found in transition block " + a);
  return tx;
}

const EV = {
  approval: sig0("Approval(address,address,uint256)"),
  officialBuy: sig0("OfficialBuy(uint256,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address,address)"),
  officialSell: sig0("OfficialSell(uint256,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address,address)"),
  lockCreated: sig0("LockCreated(address,uint256,uint256,uint64,uint32,uint64,uint16,uint16)"),
};
const words = (data) => { const d = data.slice(2); const out = []; for (let i = 0; i < d.length; i += 64) out.push(BigInt("0x" + d.slice(i, i + 64))); return out; };

async function main() {
  const chainId = Number(B(await rpc("eth_chainId")));
  need(chainId === 4663, "chainId != 4663");
  const head = B(await rpc("eth_blockNumber"));

  // ---- (4) final live nonces: deployer 16/16, tester 8/8; no unexpected pending ----
  const dl = Number(B(await rpc("eth_getTransactionCount", [DEPLOYER, "latest"])));
  const dp = Number(B(await rpc("eth_getTransactionCount", [DEPLOYER, "pending"])));
  const tl = Number(B(await rpc("eth_getTransactionCount", [TESTER, "latest"])));
  const tp = Number(B(await rpc("eth_getTransactionCount", [TESTER, "pending"])));
  need(dl === 16 && dp === 16, `deployer nonce ${dl}/${dp} != 16/16`);
  need(tl === 8 && tp === 8, `tester nonce ${tl}/${tp} != 8/8`);
  // latest == pending == 8 proves nonces 0-7 are mined and NO nonce-8 transaction exists (mined or pending).

  // ---- (3) reconstruct tester nonces 2-7 and verify against the v9 canonical ----
  const results = [];
  let lo = V9_PIN;                                                   // tester nonce was 2 at the v9 pin
  const canonical = packet.immediateTransactions;                    // orig 14..19, nonces 2..7
  const buySpec = auth.buy, sellSpec = auth.sell, lockSpec = auth.lock;
  let buyEv = null, sellEv = null, lockEv = null;
  for (let nonce = 2; nonce <= 7; nonce++) {
    const src = canonical[nonce - 2];
    const label = "orig " + src.originalIndex + " (" + src.label + ")";
    const tx = await findTesterTxByNonce(nonce, lo, head);
    const rc = await rpc("eth_getTransactionReceipt", [tx.hash]);
    need(!!rc && B(rc.status) === 1n, label + ": receipt missing/failed");
    if (tx.chainId !== undefined && tx.chainId !== null) need(Number(B(tx.chainId)) === 4663, label + ": chainId");
    need(A(tx.from) === TESTER && Number(B(tx.nonce)) === nonce, label + ": sender/nonce");
    need(A(tx.to) === A(src.to), label + ": destination");
    need(B(tx.value) === 0n, label + ": value != 0");
    need(tx.input.toLowerCase() === src.dataOrInitCode.toLowerCase(), label + ": calldata != v9 canonical");
    need(keccak256(tx.input).toLowerCase() === src.dataKeccak.toLowerCase(), label + ": dataKeccak");
    // bounded-gas policy compliance of the actually-signed envelope
    const g = src.gasCeilings;
    need(B(tx.gas) <= B(g.gasLimitCeiling) && B(tx.maxFeePerGas) <= B(g.maxFeeCeilingWei) && B(tx.maxPriorityFeePerGas) <= B(g.maxPriorityCeilingWei) && B(tx.gas) * B(tx.maxFeePerGas) <= B(g.maxGasCostCeilingWei), label + ": signed envelope outside accepted ceilings");
    const gasUsed = B(rc.gasUsed), eff = B(rc.effectiveGasPrice);
    const entry = { originalIndex: src.originalIndex, label: src.label, txHash: tx.hash, signer: TESTER, nonce, to: A(src.to), inputKeccak: src.dataKeccak.toLowerCase(), blockNumber: B(rc.blockNumber).toString(), blockHash: rc.blockHash, gasLimit: B(tx.gas).toString(), maxFeePerGas: B(tx.maxFeePerGas).toString(), maxPriorityFeePerGas: B(tx.maxPriorityFeePerGas).toString(), gasUsed: gasUsed.toString(), effectiveGasPriceWei: eff.toString(), actualGasCostWei: (gasUsed * eff).toString(), logs: rc.logs.length };
    // per-step event postconditions
    if (src.postconditionType === "approve" || src.label.includes("approve")) {
      const spender = A("0x" + src.dataOrInitCode.slice(10 + 24, 10 + 64));
      const amount = BigInt("0x" + src.dataOrInitCode.slice(10 + 64, 10 + 128));
      const lg = rc.logs.find(l => l.topics[0].toLowerCase() === EV.approval && A(l.address) === A(src.to));
      need(!!lg && A("0x" + lg.topics[1].slice(26)) === TESTER && A("0x" + lg.topics[2].slice(26)) === spender && B(lg.data) === amount, label + ": Approval(owner,spender,amount)");
      entry.event = { type: "Approval", spender, amount: amount.toString() };
    } else if (src.label === "buyExactWethForBps") {
      const lg = rc.logs.find(l => A(l.address) === ROUTER && l.topics[0].toLowerCase() === EV.officialBuy);
      need(!!lg, label + ": no OfficialBuy"); if (lg) {
        const d = words(lg.data);
        need(BigInt(lg.topics[1]) === B(buySpec.tradeId) && A("0x" + lg.topics[2].slice(26)) === A(buySpec.trader) && A("0x" + lg.topics[3].slice(26)) === A(buySpec.recipient), label + ": buy indexed topics");
        need(d[0] === B(buySpec.grossWethInput) && d[1] === B(buySpec.stockBudget) && d[2] === B(buySpec.burnBudget) && d[3] === B(buySpec.userWethBudget) && d[4] === B(buySpec.userBpsOutput) && d[5] === B(buySpec.bpsBurned), label + ": buy amounts != canonical expectations");
        need(A("0x" + d[6].toString(16).padStart(40, "0")) === A(buySpec.adapter) && A("0x" + d[7].toString(16).padStart(40, "0")) === A(buySpec.stockBudgetRecipient), label + ": buy adapter/budget recipient");
        buyEv = { tradeId: BigInt(lg.topics[1]).toString(), grossWethInput: d[0].toString(), stockBudget: d[1].toString(), burnBudget: d[2].toString(), userWethBudget: d[3].toString(), userBpsOutput: d[4].toString(), bpsBurned: d[5].toString() };
        entry.event = { type: "OfficialBuy", ...buyEv };
      }
    } else if (src.label === "sellExactBpsForWeth") {
      const lg = rc.logs.find(l => A(l.address) === ROUTER && l.topics[0].toLowerCase() === EV.officialSell);
      need(!!lg, label + ": no OfficialSell"); if (lg) {
        const d = words(lg.data);
        need(BigInt(lg.topics[1]) === B(sellSpec.tradeId) && A("0x" + lg.topics[2].slice(26)) === A(sellSpec.trader) && A("0x" + lg.topics[3].slice(26)) === A(sellSpec.recipient), label + ": sell indexed topics");
        need(d[0] === B(sellSpec.grossBpsInput) && d[1] === B(sellSpec.grossWethOutput) && d[2] === B(sellSpec.stockBudget) && d[3] === B(sellSpec.burnBudget) && d[4] === B(sellSpec.userWethOutput) && d[5] === B(sellSpec.bpsBurned), label + ": sell amounts != canonical expectations");
        sellEv = { tradeId: BigInt(lg.topics[1]).toString(), grossBpsInput: d[0].toString(), grossWethOutput: d[1].toString(), stockBudget: d[2].toString(), burnBudget: d[3].toString(), userWethOutput: d[4].toString(), bpsBurned: d[5].toString() };
        entry.event = { type: "OfficialSell", ...sellEv };
      }
    } else if (src.label.startsWith("createLock")) {
      const lg = rc.logs.find(l => A(l.address) === VAULT && l.topics[0].toLowerCase() === EV.lockCreated);
      need(!!lg, label + ": no LockCreated"); if (lg) {
        const d = words(lg.data);
        need(A("0x" + lg.topics[1].slice(26)) === TESTER && BigInt(lg.topics[2]) === B(lockSpec.lockId), label + ": lock account/lockId");
        need(d[0] === B(lockSpec.principal), label + ": lock principal");
        need(Number(d[2]) === lockSpec.duration && d[1] + d[2] === d[3], label + ": lock duration/unlock identity");
        need(Number(d[4]) === lockSpec.multiplierBps && Number(d[5]) === lockSpec.policyVersion, label + ": lock multiplier/policyVersion");
        lockEv = { lockId: BigInt(lg.topics[2]).toString(), principal: d[0].toString(), startTime: d[1].toString(), duration: Number(d[2]), unlockTime: d[3].toString(), multiplierBps: Number(d[4]), policyVersion: Number(d[5]), effectiveWeight: (d[0] * d[4] / 10000n).toString() };
        entry.event = { type: "LockCreated", ...lockEv };
      }
    }
    results.push(entry);
    lo = B(rc.blockNumber);
  }
  need(results.length === 6, "expected 6 tester transactions");

  // ---- (5) full protocol state re-verification ----
  for (const [slot, d] of Object.entries(CC)) { const code = await rpc("eth_getCode", [d.address, "latest"]); need(keccak256(code).toLowerCase() === d.runtimeCodeHash.toLowerCase(), "runtime hash changed: " + slot); }
  const gp = A("0x" + (await call(FACTORY, sel("getPool(address,address,uint24)") + encAddr(auth.lp.token0) + encAddr(auth.lp.token1) + encUint(auth.lp.feeTier))).slice(-40));
  need(gp === POOL, "getPool != pool");
  const slot0 = await call(POOL, sel("slot0()"));
  const poolLiq = B(await call(POOL, sel("liquidity()")));
  const tid = B(auth.positionTokenId);
  const posOwner = A("0x" + (await call(NPM, sel("ownerOf(uint256)") + encUint(tid))).slice(-40));
  const pos = await call(NPM, sel("positions(uint256)") + encUint(tid));
  const posLiq = B("0x" + pos.slice(2 + 7 * 64, 2 + 8 * 64));
  need(posOwner === DEPLOYER, "position owner != deployer");
  need(posLiq.toString() === auth.positionLiquidity, "position liquidity changed");
  need(poolLiq === posLiq, "pool liquidity != position liquidity");
  const balOf = async (token, who) => B(await call(token, sel("balanceOf(address)") + encAddr(who)));
  const allowance = async (token, owner, spender) => B(await call(token, sel("allowance(address,address)") + encAddr(owner) + encAddr(spender)));
  const [dEth, tEth] = [B(await rpc("eth_getBalance", [DEPLOYER, "latest"])), B(await rpc("eth_getBalance", [TESTER, "latest"]))];
  const [dW, tW, dB, tB, svW] = [await balOf(WETH, DEPLOYER), await balOf(WETH, TESTER), await balOf(BPSC, DEPLOYER), await balOf(BPSC, TESTER), await balOf(WETH, STOCKVAULT)];
  const totalSupply = B(await call(BPSC, sel("totalSupply()")));
  const lockedPrincipal = B(await call(VAULT, sel("lockedPrincipal(address)") + encAddr(TESTER)));
  const allowances = {
    "WETH tester->router": (await allowance(WETH, TESTER, ROUTER)).toString(),
    "BPSC tester->router": (await allowance(BPSC, TESTER, ROUTER)).toString(),
    "BPSC tester->lockingVault": (await allowance(BPSC, TESTER, VAULT)).toString(),
    "WETH deployer->NPM": (await allowance(WETH, DEPLOYER, NPM)).toString(),
    "BPSC deployer->NPM": (await allowance(BPSC, DEPLOYER, NPM)).toString(),
  };
  // fee accounting: stock-budget accrual (buy 2% + sell 2%) sits as WETH in the StockAcquisitionVault;
  // burn budgets were burned (total supply reduction).
  const expectedVaultWeth = B(buyEv.stockBudget) + B(sellEv.stockBudget);
  need(svW === expectedVaultWeth, "stockVault WETH != buy+sell stock budgets");
  const totalBurned = B(buyEv.bpsBurned) + B(sellEv.bpsBurned);
  need(totalSupply === 1000000000n * 10n ** 18n - totalBurned, "totalSupply != 1e9e18 - burned");
  need(lockedPrincipal === B(lockEv.principal), "lockedPrincipal != lock event principal");
  need(tB === 0n, "tester BPSC balance != 0 (all locked)");

  // ---- (6) recalculation ----
  const realized13 = B(auth.exposure.realizedGasWei);
  const realized6 = results.reduce((acc, x) => acc + B(x.actualGasCostWei), 0n);
  const realized19 = realized13 + realized6;
  const principalPlanned = B(auth.exposure.remainingPrincipalWei);
  const grossWethIn = B(buyEv.grossWethInput), userWethOut = B(sellEv.userWethOutput);
  const evidence = {
    kind: "BPSC-TEST canary mainnet completion evidence (TASK 10E-1; strictly read-only)",
    generatedAtUtc: new Date().toISOString(), chainId, headAtVerification: head.toString(),
    canaryNotProduction: true, all19Completed: true, delayedWithdrawalExecuted: false, approvalsRevoked: false,
    v9: { zipSha256: "0c958a58b8684878c4dfce4a15cdba3b2fc0e39680d46902430ab6e78a09b74d", recoveryAuthorizationDigest: packet.meta.recoveryAuthorizationDigest, remainingExecutionDigest: packet.meta.remainingExecutionDigest },
    priorAnchors: { v5: auth.v5, v6: auth.v6, v7: auth.v7, v8: auth.v8 },
    finalNonces: { deployer: { latest: dl, pending: dp }, tester: { latest: tl, pending: tp }, testerNonce8Unused: true },
    completedSteps1to13: auth.completedSteps,
    testerTransactions14to19: results,
    contracts: CC, pool: { address: POOL, token0: auth.lp.token0, token1: auth.lp.token1, feeTier: auth.lp.feeTier, sqrtPriceX96: B(slot0.slice(0, 66)).toString(), liquidity: poolLiq.toString() },
    lpPosition: { tokenId: tid.toString(), owner: posOwner, liquidity: posLiq.toString() },
    lock: lockEv,
    trade: { buy: buyEv, sell: sellEv },
    feeAccounting: { stockBudgetWethInVault: svW.toString(), expectedStockBudget: expectedVaultWeth.toString(), bpsBurnedTotal: totalBurned.toString(), bpscTotalSupply: totalSupply.toString() },
    balances: { deployer: { eth: dEth.toString(), weth: dW.toString(), bpsc: dB.toString() }, tester: { eth: tEth.toString(), weth: tW.toString(), bpsc: tB.toString() }, stockVaultWeth: svW.toString() },
    allowancesRemaining: allowances,
    gasAndExposure: {
      realizedGasSteps1to13Wei: realized13.toString(), realizedGasSteps14to19Wei: realized6.toString(), realizedGasAll19Wei: realized19.toString(),
      principalPlannedWei: principalPlanned.toString(),
      buyGrossWethInWei: grossWethIn.toString(), sellUserWethOutWei: userWethOut.toString(),
      testerNetWethTradeDeltaWei: (userWethOut - grossWethIn).toString(),
      plannedAggregateWei: auth.exposure.aggregateWei, plannedAggregateUsd: packet.capArithmetic.aggregateUsd,
      note: "planned aggregate = realized gas(1-13) + full principal + 1.25x max gas(14-19); realized gas(14-19) came in far under ceiling; principal remains deployed as LP + lock (not lost)",
    },
    lifecycleNote: "The full fee -> RWA acquisition -> snapshot -> claim lifecycle has NOT yet been demonstrated; only fee ACCRUAL to the StockAcquisitionVault occurred in the buy/sell cycle.",
  };
  if (fails.length) { console.error("RECONCILIATION FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
  mkdirSync(new URL("../../../docs/audit/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../../../docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.evidence.json", import.meta.url), JSON.stringify(evidence, null, 2));
  console.log("RECONCILIATION OK — evidence manifest written");
  for (const r of results) console.log(`  orig ${r.originalIndex} ${r.label.padEnd(28)} ${r.txHash} block ${r.blockNumber} gas ${r.actualGasCostWei}`);
  console.log("  nonces: deployer", dl + "/" + dp, "tester", tl + "/" + tp);
  console.log("  realized gas 14-19:", realized6.toString(), "| all 19:", realized19.toString());
  console.log("  buy:", JSON.stringify(buyEv)); console.log("  sell:", JSON.stringify(sellEv)); console.log("  lock:", JSON.stringify(lockEv));
  console.log("  balances: deployer ETH", dEth.toString(), "WETH", dW.toString(), "BPSC", dB.toString());
  console.log("            tester   ETH", tEth.toString(), "WETH", tW.toString(), "BPSC", tB.toString(), "| stockVault WETH", svW.toString());
  console.log("  allowances:", JSON.stringify(allowances));
  console.log("  totalSupply:", totalSupply.toString(), "| lockedPrincipal:", lockedPrincipal.toString());
}
main().catch(e => { console.error("RECONCILE ERROR:", e.message); process.exit(1); });
