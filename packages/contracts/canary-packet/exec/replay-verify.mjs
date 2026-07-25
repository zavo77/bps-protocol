// TASK 10B-8 independent REPLAY verifier — starts its OWN clean Anvil fork, replays the recorded
// unsigned sequence, and compares observed receipts/events/deployed-code/state/owners/balances
// directly from replay state. Trusts NO packet boolean/accounting/receiptStatus.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createPublicClient, http, keccak256, toHex, getAddress, getContractAddress, encodeFunctionData, decodeEventLog, encodeAbiParameters } from "viem";
const U = (p) => new URL(p, import.meta.url);
const rj = (p) => JSON.parse(readFileSync(U(p), "utf8"));
const a = rj("canary-unsigned-packet.json"), policy = rj("review-policy.json");
const artOf = (n) => rj(`artifacts/${n}.json`);
const R = []; const ok = (n, c, d = "") => R.push({ n, pass: !!c, d });
const B = (x) => BigInt(x); const lc = (x) => (x || "").toLowerCase();

const AL = policy.anvilLaunch;
const PORT = Number(process.env.REPLAY_PORT || 8547);
const RPC = `http://127.0.0.1:${PORT}`;
const DEPLOYER = policy.wallets.deployer, TESTER = policy.wallets.tester;
const WETH = policy.infrastructure.weth, WHALE = "0xC0Be1cb0f674D9737C72B2A63fC542361185b807";
const imm = a.immediateTransactions, dl = a.delayedWithdrawalSubPacket;
const names = ["BPSCanaryToken", "BPSLockingVault", "DistributionClaimManager", "RialtoStockAcquisitionAdapter", "DistributionFundingCoordinator", "StockAcquisitionVault", "UniswapV3BPSSwapAdapter", "BPSTradeRouter"];
const slots = ["canaryToken", "lockingVault", "claimManager", "rialtoAdapter", "coordinator", "stockVault", "uniswapAdapter", "tradeRouter"];
// deployment/tester START nonces from the packet (never hardcoded)
const DSTART = Math.min(...imm.filter(t => t.phase === "A-deploy").map(t => t.nonce));
const TSTART = Math.min(...imm.filter(t => lc(t.signer) === lc(TESTER)).map(t => t.nonce));
const P = {}; for (let i = 0; i < 8; i++) P[slots[i]] = getAddress(getContractAddress({ from: DEPLOYER, nonce: BigInt(DSTART + i) }));

const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }, { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }, { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }];
let pub, anvil;
const rpc = (m, p = []) => pub.request({ method: m, params: p });
const bal = (t, w) => pub.readContract({ address: t, abi: erc20, functionName: "balanceOf", args: [w] }).then(B);
const ethBal = (w) => rpc("eth_getBalance", [w, "latest"]).then(B);

function maskImmutables(codeHex, immRefs) {
  const bytes = Buffer.from(codeHex.slice(2), "hex");
  for (const id of Object.keys(immRefs || {})) for (const r of immRefs[id]) bytes.fill(0, r.start, r.start + r.length);
  return "0x" + bytes.toString("hex");
}

async function waitAnvil() {
  for (let i = 0; i < 60; i++) { try { const bn = await pub.request({ method: "eth_blockNumber" }); if (bn) return; } catch { } await new Promise(r => setTimeout(r, 500)); }
  throw new Error("anvil did not start");
}

async function main() {
  anvil = spawn(AL.binary, ["--fork-url", process.env[policy.liveRpcEnvVar||"ROBINHOOD_CHAIN_RPC_URL"], "--fork-block-number", String(AL.forkBlockNumber), "--chain-id", String(AL.chainId), "--block-base-fee-per-gas", String(AL.blockBaseFeePerGas), "--port", String(PORT), "--silent"], { stdio: "ignore" });
  pub = createPublicClient({ transport: http(RPC) });
  await waitAnvil();
  const LIVE_RPC=process.env[policy.liveRpcEnvVar||"ROBINHOOD_CHAIN_RPC_URL"]; if(!LIVE_RPC) throw new Error("provider RPC env var not set"); const live = createPublicClient({ transport: http(LIVE_RPC) });

  // ---- snapshot validation on the freshly started fork (latest == pinned) ----
  const latest = await rpc("eth_getBlockByNumber", ["latest", false]);
  ok("replay fork LATEST == pinned block/hash/timestamp/baseFee", B(latest.number) === B(policy.snapshot.forkBlock) && lc(latest.hash) === lc(policy.snapshot.forkHash) && B(latest.timestamp) === B(policy.snapshot.forkTimestamp) && B(latest.baseFeePerGas) === B(policy.snapshot.baseFeePerGasWei));
  const liveBlk = await live.request({ method: "eth_getBlockByNumber", params: [toHex(policy.snapshot.forkBlock), false] });
  ok("live-RPC hash of pinned block == fork latest hash", lc(liveBlk.hash) === lc(latest.hash));
  ok("replay fork nonces == packet start nonces (deployer/tester, from pinned block)", Number(await rpc("eth_getTransactionCount", [DEPLOYER, "latest"])) === DSTART && Number(await rpc("eth_getTransactionCount", [TESTER, "latest"])) === TSTART);
  await rpc("anvil_setBlockTimestampInterval", [1]); // deterministic timestamps (matches generator)

  // ---- provision identically (generous ETH seed, EXACT WETH set directly via storage) ----
  const SEED = 10n ** 18n;
  await rpc("anvil_setBalance", [DEPLOYER, toHex(SEED)]); await rpc("anvil_setBalance", [TESTER, toHex(SEED)]);
  await rpc("anvil_impersonateAccount", [DEPLOYER]); await rpc("anvil_impersonateAccount", [TESTER]);
  const lpWeth = B(a.forkFunding.inbound.deployer.weth), trWeth = B(a.forkFunding.inbound.tester.weth);
  const snapForSlot = rj("block-snapshot.json"); const knownBal = B(snapForSlot.balances.weth.deployer);
  if (knownBal === 0n) throw new Error("cannot discover WETH slot: deployer live WETH balance 0");
  let wethSlotIndex = null;
  for (let idx = 0; idx < 300; idx++) { const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [DEPLOYER, BigInt(idx)])); const raw = await rpc("eth_getStorageAt", [WETH, slot, "latest"]); if (B(raw) === knownBal) { wethSlotIndex = BigInt(idx); break; } }
  if (wethSlotIndex === null) throw new Error("could not discover WETH balanceOf slot");
  const setWeth = async (who, amt) => { const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [who, wethSlotIndex])); await rpc("anvil_setStorageAt", [WETH, slot, toHex(amt, { size: 32 })]); if ((await bal(WETH, who)) !== amt) throw new Error("weth set-exact failed " + who); };
  await setWeth(DEPLOYER, lpWeth); await setWeth(TESTER, trWeth);
  const startEth = { d: await ethBal(DEPLOYER), t: await ethBal(TESTER) };
  ok("replay starting balances match packet (WETH exact, ETH seed)", (await bal(WETH, DEPLOYER)) === lpWeth && (await bal(WETH, TESTER)) === trWeth && startEth.d === B(a.forkFunding.startingBalances.deployer.eth) && startEth.t === B(a.forkFunding.startingBalances.tester.eth));

  // ---- replay every recorded immediate tx by its EXACT calldata; compare observed vs recorded ----
  const canary = P.canaryToken, vault = P.stockVault, router = P.tradeRouter, locking = P.lockingVault;
  const routerAbi = artOf("BPSTradeRouter").abi, lockAbi = artOf("BPSLockingVault").abi;
  let gasOk = true, deployOk = true, codeOk = true, hashOk = true, nonceTypeOk = true; const evByLabel = {}; let postMintPool = null; let mintLogs = null;
  const poolAbi0 = [{ type: "function", name: "slot0", stateMutability: "view", inputs: [], outputs: [{ type: "uint160" }, { type: "int24" }, { type: "uint16" }, { type: "uint16" }, { type: "uint16" }, { type: "uint8" }, { type: "bool" }] }, { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] }];
  const gap = [];
  const PIN = toHex(B(policy.snapshot.baseFeePerGasWei));
  for (const t of imm) {
    await rpc("anvil_setNextBlockBaseFeePerGas", [PIN]); // constant base fee -> deterministic effPrice (matches generator)
    // item 3: send with the RECORDED nonce and explicit type 0x2 (never let Anvil auto-populate)
    const txReq = { from: t.signer, nonce: toHex(B(t.nonce)), type: "0x2", chainId: toHex(B(t.chainId)), gas: toHex(B(t.gasLimit)), maxFeePerGas: toHex(B(t.maxFeePerGas)), maxPriorityFeePerGas: toHex(B(t.maxPriorityFeePerGas)) };
    if (t.to) txReq.to = t.to; txReq.data = t.dataOrInitCode; txReq.value = "0x0";
    const hash = await rpc("eth_sendTransaction", [txReq]);
    const rc = await pub.waitForTransactionReceipt({ hash });
    if (rc.status !== "success") { gasOk = false; gap.push(t.label + ":revert"); }
    if (B(rc.gasUsed) !== B(t.gasUsed)) { gasOk = false; gap.push(`${t.label}:gasUsed ${rc.gasUsed}!=${t.gasUsed}`); }
    if (B(rc.effectiveGasPrice) !== B(t.effectiveGasPrice)) { gasOk = false; gap.push(t.label + ":effPrice"); }
    // item 4: compare replay transaction hash and block hash to recorded
    if (lc(rc.transactionHash) !== lc(t.txHash)) { hashOk = false; gap.push(t.label + ":txHash"); }
    if (lc(rc.blockHash) !== lc(t.blockHash)) { hashOk = false; gap.push(t.label + ":blockHash"); }
    // item 3: on-chain tx must carry the recorded nonce/type/chainId
    const onchainTx = await rpc("eth_getTransactionByHash", [rc.transactionHash]);
    if (Number(B(onchainTx.nonce)) !== t.nonce || Number(B(onchainTx.type)) !== 2) { nonceTypeOk = false; gap.push(t.label + ":nonce/type"); }
    if (t.phase === "A-deploy") {
      if (getAddress(rc.contractAddress) !== getAddress(t.predictedCreationAddress)) deployOk = false;
      const onchain = await pub.getCode({ address: rc.contractAddress });
      const tmpl = artOf(t.label).deployedBytecode;
      if (maskImmutables(onchain, tmpl.immutableReferences) !== maskImmutables(tmpl.object, tmpl.immutableReferences)) { codeOk = false; gap.push(t.label + ":code"); }
    }
    evByLabel[t.label] = rc.logs;
    if (t.label === "NPM.mint") { // capture pool state right AFTER mint (before trades move the price)
      const s0 = await pub.readContract({ address: a.addressGuards.poolAddress, abi: poolAbi0, functionName: "slot0" });
      const lq = await pub.readContract({ address: a.addressGuards.poolAddress, abi: poolAbi0, functionName: "liquidity" });
      postMintPool = { sqrt: B(s0[0]), tick: Number(s0[1]), liq: B(lq) };
      mintLogs = rc.logs;
    }
  }
  ok("replay: every immediate tx receipt=success & gasUsed & effGasPrice EXACTLY match recorded", gasOk, gap.slice(0, 4).join(" | "));
  ok("replay: every transaction hash AND block hash match recorded", hashOk, gap.filter(g => /Hash/.test(g)).slice(0, 3).join(" | "));
  ok("replay: on-chain nonce == recorded nonce and type == 0x2 for every tx", nonceTypeOk);
  ok("replay: all 8 deployed at predicted CREATE addresses", deployOk);
  ok("replay: deployed runtime code matches compiled template (immutables masked)", codeOk);

  // ---- item 5: minted position — tokenId, ownerOf, positions(tokenId) ----
  const NPM_ADDR = policy.infrastructure.nonfungiblePositionManager;
  const ERC721_XFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  let tokenId = null;
  for (const l of (mintLogs || [])) if (lc(l.address) === lc(NPM_ADDR) && l.topics.length === 4 && lc(l.topics[0]) === ERC721_XFER) tokenId = B(l.topics[3]);
  const npmPosAbi = [{ type: "function", name: "positions", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ name: "nonce", type: "uint96" }, { name: "operator", type: "address" }, { name: "token0", type: "address" }, { name: "token1", type: "address" }, { name: "fee", type: "uint24" }, { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" }, { name: "liquidity", type: "uint128" }, { name: "f0", type: "uint256" }, { name: "f1", type: "uint256" }, { name: "o0", type: "uint128" }, { name: "o1", type: "uint128" }] }, { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] }];
  const lpu = a.lpUsage;
  let posOk = false;
  if (tokenId !== null) {
    const owner = await pub.readContract({ address: NPM_ADDR, abi: npmPosAbi, functionName: "ownerOf", args: [tokenId] });
    const pos = await pub.readContract({ address: NPM_ADDR, abi: npmPosAbi, functionName: "positions", args: [tokenId] });
    posOk = tokenId === B(lpu.positionTokenId) && getAddress(owner) === getAddress(DEPLOYER) && getAddress(owner) === getAddress(lpu.positionOwner)
      && Number(pos[4]) === lpu.positionFee && Number(pos[4]) === policy.economics.feeTier
      && Number(pos[5]) === lpu.positionTickLower && Number(pos[5]) === lpu.tickLower
      && Number(pos[6]) === lpu.positionTickUpper && Number(pos[6]) === lpu.tickUpper
      && B(pos[7]) === B(lpu.positionLiquidity) && B(pos[7]) === B(lpu.poolLiquidityAfter)
      && getAddress(pos[2]) === getAddress(lpu.token0) && getAddress(pos[3]) === getAddress(lpu.token1);
  }
  ok("replay minted position: tokenId decoded, ownerOf==deployer, positions() fee/ticks/liquidity match recorded LP", posOk, tokenId === null ? "tokenId not decoded" : `tokenId=${tokenId}`);

  // ---- item 6: ALL critical wiring read DIRECTLY from replay state ----
  const rd = (addr, abi, fn, args = []) => pub.readContract({ address: addr, abi, functionName: fn, args });
  const coordAbi = artOf("DistributionFundingCoordinator").abi, vaultAbi = artOf("StockAcquisitionVault").abi;
  const rialtoAbi = artOf("RialtoStockAcquisitionAdapter").abi, uniAbi = artOf("UniswapV3BPSSwapAdapter").abi;
  const claimAbi = artOf("DistributionClaimManager").abi;
  const A = getAddress;
  const [rOwner, rBps, rWeth, rAdapter, rStockRecip] = await Promise.all([rd(router, routerAbi, "owner"), rd(router, routerAbi, "bpsToken"), rd(router, routerAbi, "weth"), rd(router, routerAbi, "swapAdapter"), rd(router, routerAbi, "stockBudgetRecipient")]);
  const [lOwner, lBps] = await Promise.all([rd(locking, lockAbi, "owner"), rd(locking, lockAbi, "bpsToken")]);
  const [cOwner, cRecovery] = await Promise.all([rd(P.claimManager, claimAbi, "owner"), rd(P.claimManager, claimAbi, "recoveryRecipient")]);
  const [coVault, coMgr, coOperator, coPublisher] = await Promise.all([rd(P.coordinator, coordAbi, "stockAcquisitionVault"), rd(P.coordinator, coordAbi, "distributionClaimManager"), rd(P.coordinator, coordAbi, "acquisitionOperator"), rd(P.coordinator, coordAbi, "rootPublisher")]);
  const [vWeth, vAdapter, vExecutor, vReserve, vCoord, vNvda] = await Promise.all([rd(vault, vaultAbi, "weth"), rd(vault, vaultAbi, "acquisitionAdapter"), rd(vault, vaultAbi, "acquisitionExecutor"), rd(vault, vaultAbi, "reserveRecipient"), rd(vault, vaultAbi, "distributionFundingCoordinator"), rd(vault, vaultAbi, "isApprovedStockToken", [policy.infrastructure.nvdaStockToken])]);
  const [raVault, raWeth, raRegistry] = await Promise.all([rd(P.rialtoAdapter, rialtoAbi, "stockAcquisitionVault"), rd(P.rialtoAdapter, rialtoAbi, "weth"), rd(P.rialtoAdapter, rialtoAbi, "routerRegistry")]);
  const [uaRouter, uaBps, uaWeth, uaSwap, uaFee] = await Promise.all([rd(P.uniswapAdapter, uniAbi, "bpsTradeRouter"), rd(P.uniswapAdapter, uniAbi, "bps"), rd(P.uniswapAdapter, uniAbi, "weth"), rd(P.uniswapAdapter, uniAbi, "swapRouter02"), rd(P.uniswapAdapter, uniAbi, "poolFee")]);
  const IN = policy.infrastructure;
  const wiring = {
    routerOwner: A(rOwner) === A(DEPLOYER), routerBps: A(rBps) === P.canaryToken, routerWeth: A(rWeth) === A(IN.weth),
    routerAdapter: A(rAdapter) === P.uniswapAdapter, routerStockRecipient: A(rStockRecip) === P.stockVault,
    lockingOwner: A(lOwner) === A(DEPLOYER), lockingBps: A(lBps) === P.canaryToken,
    claimOwner: A(cOwner) === P.coordinator, claimRecovery: A(cRecovery) === A(DEPLOYER),
    coordVault: A(coVault) === P.stockVault, coordManager: A(coMgr) === P.claimManager,
    coordOperator: A(coOperator) === A(DEPLOYER), coordPublisher: A(coPublisher) === A(DEPLOYER),
    vaultWeth: A(vWeth) === A(IN.weth), vaultAdapter: A(vAdapter) === P.rialtoAdapter, vaultExecutor: A(vExecutor) === P.coordinator,
    vaultReserve: A(vReserve) === A(DEPLOYER), vaultCoordinator: A(vCoord) === P.coordinator, vaultNvdaApproved: vNvda === true,
    rialtoVault: A(raVault) === P.stockVault, rialtoWeth: A(raWeth) === A(IN.weth), rialtoRegistry: A(raRegistry) === A(IN.rialtoRegistry),
    uniRouter: A(uaRouter) === P.tradeRouter, uniBps: A(uaBps) === P.canaryToken, uniWeth: A(uaWeth) === A(IN.weth),
    uniSwapRouter: A(uaSwap) === A(IN.swapRouter02), uniPoolFee: Number(uaFee) === policy.economics.feeTier,
  };
  const badWiring = Object.entries(wiring).filter(([, v]) => !v).map(([k]) => k);
  ok("replay wiring from state: router/locking/claim owners, coordinator operator+publisher, vault executor/reserve/coordinator, both adapters' immutables, NVDA approved", badWiring.length === 0, badWiring.join(","));

  // ---- LP: pool state + consumption from replay ----
  ok("replay pool state right after mint == recorded poolSqrtAfter/poolTickAfter/poolLiquidityAfter", postMintPool && postMintPool.sqrt === B(a.lpUsage.poolSqrtAfter) && postMintPool.tick === a.lpUsage.poolTickAfter && postMintPool.liq === B(a.lpUsage.poolLiquidityAfter));

  // ---- buy/sell events decoded from replay logs, compared to accounting ----
  const findEv = (logs, abi, name) => { for (const l of logs) { try { const d = decodeEventLog({ abi, data: l.data, topics: l.topics }); if (d.eventName === name) return d.args; } catch { } } };
  const buyEv = findEv(evByLabel["buyExactWethForBps"], routerAbi, "OfficialBuy");
  ok("replay OfficialBuy event == recorded buy accounting (gross/stock/burn/user/bought/burned)", buyEv && B(buyEv.grossWethInput) === B(a.buyAccounting.grossWethInput) && B(buyEv.stockBudget) === B(a.buyAccounting.stockBudget2pct) && B(buyEv.burnBudget) === B(a.buyAccounting.burnBudget1pct) && B(buyEv.userBpsOutput) === B(a.buyAccounting.userBpsOutput) && B(buyEv.bpsBurned) === B(a.buyAccounting.bpsBurned));
  const sellEv = findEv(evByLabel["sellExactBpsForWeth"], routerAbi, "OfficialSell");
  ok("replay OfficialSell event == recorded sell accounting (gross/stock/burn/user/burned)", sellEv && B(sellEv.grossWethOutput) === B(a.sellAccounting.grossWethOutput) && B(sellEv.stockBudget) === B(a.sellAccounting.stockAcquisition2pct) && B(sellEv.burnBudget) === B(a.sellAccounting.retirementBurn2pct) && B(sellEv.userWethOutput) === B(a.sellAccounting.userWethOutput96pct) && B(sellEv.bpsBurned) === B(a.sellAccounting.bpsBurned));
  const lockEv = findEv(evByLabel["createLock(amount,7d)"], lockAbi, "LockCreated");
  ok("replay LockCreated event == recorded lock (principal, unlockTime, lockId)", lockEv && B(lockEv.principal) === B(a.lockAndWithdraw.principal) && B(lockEv.unlockTime) === B(a.lockAndWithdraw.unlockTime) && B(lockEv.lockId) === B(a.lockAndWithdraw.lockId));

  // ---- final immediate balances read from replay, compared to packet ----
  const eb = a.forkFunding.endingBalancesImmediate;
  ok("replay ending balances (ETH/WETH/BPSC) match packet endingBalancesImmediate", (await ethBal(DEPLOYER)) === B(eb.deployer.eth) && (await ethBal(TESTER)) === B(eb.tester.eth) && (await bal(WETH, DEPLOYER)) === B(eb.deployer.weth) && (await bal(WETH, TESTER)) === B(eb.tester.weth) && (await bal(canary, DEPLOYER)) === B(eb.deployer.bpsc) && (await bal(canary, TESTER)) === B(eb.tester.bpsc));
  ok("replay canary token symbol == BPSC-TEST", (await pub.readContract({ address: canary, abi: erc20, functionName: "symbol" })) === "BPSC-TEST");

  // ---- delayed withdrawal: warp + replay recorded withdraw calldata ----
  const snap = await rpc("evm_snapshot", []);
  await rpc("evm_setNextBlockTimestamp", [Number(B(a.lockAndWithdraw.unlockTime)) + 1]); await rpc("anvil_setNextBlockBaseFeePerGas", [PIN]); await rpc("evm_mine", []);
  const tBpsBefore = await bal(canary, TESTER);
  await rpc("anvil_setNextBlockBaseFeePerGas", [PIN]);
  const wHash = await rpc("eth_sendTransaction", [{ from: dl.signer, nonce: toHex(B(dl.nonce)), type: "0x2", chainId: toHex(B(dl.chainId)), to: dl.to, data: dl.dataOrInitCode, gas: toHex(B(dl.gasLimit)), maxFeePerGas: toHex(B(dl.maxFeePerGas)), maxPriorityFeePerGas: toHex(B(dl.maxPriorityFeePerGas)) }]);
  const wRc = await pub.waitForTransactionReceipt({ hash: wHash });
  const returned = (await bal(canary, TESTER)) - tBpsBefore;
  const wEv = findEv(wRc.logs, lockAbi, "LockWithdrawn");
  const wTx = await rpc("eth_getTransactionByHash", [wRc.transactionHash]);
  ok("replay delayed withdraw: success, returned==principal, gasUsed matches, LockWithdrawn(principal) & not emergency", wRc.status === "success" && returned === B(a.lockAndWithdraw.principal) && B(wRc.gasUsed) === B(dl.gasUsed) && wEv && B(wEv.principal) === B(a.lockAndWithdraw.principal) && wEv.emergency === false);
  ok("replay delayed withdraw: tx hash + block hash match recorded; nonce/type/chainId as recorded", lc(wRc.transactionHash) === lc(dl.txHash) && lc(wRc.blockHash) === lc(dl.blockHash) && Number(B(wTx.nonce)) === dl.nonce && Number(B(wTx.type)) === 2 && dl.chainId === 4663);
  await rpc("evm_revert", [snap]);

  console.log("\n[replay] CHECKLIST:");
  for (const r of R) console.log(` [${r.pass ? "PASS" : "FAIL"}] ${r.n}${r.d ? "  (" + r.d + ")" : ""}`);
  const passed = R.filter(r => r.pass).length;
  console.log(`\n[replay] ${passed}/${R.length} checks passed`);
  return R.every(r => r.pass);
}

let code = 1;
try { code = (await main()) ? 0 : 1; }
catch (e) { console.error("[replay] ERROR:", e.message); code = 1; }
finally { if (anvil) try { anvil.kill("SIGKILL"); } catch { } }
if (process.argv.includes("--exit")) process.exit(code);
export default { code };
