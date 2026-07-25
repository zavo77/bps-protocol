// TASK 10D-8 (v9 refresh; verification logic unchanged from the reviewed v8) — independently RECONSTRUCT AND VERIFY original steps 1-13 on Robinhood Chain mainnet and
// capture the fresh live state for the final six tester transactions (original steps 14-19). Read-only;
// RPC from env only. Steps 3-13 transaction hashes are DISCOVERED on chain by binary-searching each
// deployer-nonce transition block (not taken from any report) and verified against the accepted v7
// canonical transactions. Writes recovery-anchor.json + recovery-snapshot.json. Fails closed.
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, keccak256, getAddress, toHex } from "viem";

const U = (p) => new URL(p, import.meta.url);
const policy = JSON.parse(readFileSync(U("review-policy.json"), "utf8"));
const rehearsal = JSON.parse(readFileSync(U("canary-unsigned-packet.json"), "utf8"));
const v7 = JSON.parse(readFileSync(U("v7-accepted-packet.json"), "utf8"));           // v7 canonical (steps 3-13 calldata source)
const ENV = policy.liveRpcEnvVar || "ROBINHOOD_CHAIN_RPC_URL";
const RPC = process.env[ENV];
if (!RPC) { console.error(`FAIL: ${ENV} not set`); process.exit(1); }
const c = createPublicClient({ transport: http(RPC) });
const rpc = (m, p = []) => c.request({ method: m, params: p });
const B = (x) => BigInt(x);
const A = (x) => getAddress(x);

const DEPLOYER = A(policy.wallets.deployer), TESTER = A(policy.wallets.tester);
const IN = policy.infrastructure;
const ANCHOR1 = "0x36acf3e3752e0cfc2688c280680c4a9a100e3fcb2520bf41ae723f1a05612e2c"; // step 1 (nonce 3)
const ANCHOR2 = "0x4569523ae523090ee7b19644380b4cecb33d34d19db1cd2f52c677a724a2d758"; // step 2 (nonce 4)
const STEP2_BLOCK = 18395614;
const REPORTED_MINT = "0x09ee1c10862f669461bf2596b24ca6d9331db48a84c4c928fc3eb2ad53a3a3f8"; // cross-check only
const V5_ZIP_SHA = "5a6246ca51bd3237e6d925153439d9040b1c3674c0e026e9d8f187e7a5e64b3b";
const V5_RAD = "0x4fdfd36b99d6090fef67f21bd3b2027e8dc7e339861ae94eb0f292da2b6ee248";
const V6_ZIP_SHA = "fd57f5c1bcc4d296250bfb04cab096a4f56299b0deb2edefbf4824f9414fb356";
const V6_RAD = "0xdca841943bc32b76df5a04310d30b70a4a9244dcc4d9445d8d42500fe01ecf57";
const V7_ZIP_SHA = "b8dd4e6d5b141d74092791798780a1f3fc59ae21d8f3a59727e1e169a1e06253";
const V8_ZIP_SHA = "6c92a429affc2bee83290e01129b052f0af1dc9d3481112fe147f5b8367b8aa9";
const V8_RAD = "0x5f92fd120f5a09f4e8feeab811ae2e278ba20f299c8386f32ee121e5fc896662";
const V7_RAD = v7.meta.recoveryAuthorizationDigest;

const fails = [];
const need = (cond, msg) => { if (!cond) fails.push(msg); return !!cond; };
const hexUtf8 = (s) => { let h = "0x"; for (let i = 0; i < s.length; i++) { const cc = s.charCodeAt(i); h += (cc < 16 ? "0" : "") + cc.toString(16); } return h; };
const sig0 = (s) => keccak256(hexUtf8(s)).toLowerCase();
const view = async (to, sg, args = "") => rpc("eth_call", [{ to, data: sig0(sg).slice(0, 10) + args }, "latest"]);
const encAddr = (x) => A(x).toLowerCase().slice(2).padStart(64, "0");
const encUint = (n) => B(n).toString(16).padStart(64, "0");

// find the block where the deployer's nonce transitions k -> k+1 (i.e. the block containing tx nonce k)
async function nonceCount(block) { return Number(B(await rpc("eth_getTransactionCount", [DEPLOYER, toHex(B(block))]))); }
async function findTxByNonce(nonce, lo, hi) {
  // eth_getTransactionCount(addr, B) counts txs BEFORE the end of block B; find smallest B with count >= nonce+1
  let a = lo, b = hi;
  while (a < b) { const mid = (a + b) >> 1n; ((await nonceCount(mid)) >= nonce + 1) ? (b = mid) : (a = mid + 1n); }
  const blk = await rpc("eth_getBlockByNumber", [toHex(a), true]);
  const tx = blk.transactions.find(t => A(t.from) === DEPLOYER && Number(B(t.nonce)) === nonce);
  if (!tx) throw new Error("nonce " + nonce + " tx not found in transition block " + a);
  return tx;
}

async function main() {
  const chainId = Number(B(await rpc("eth_chainId")));
  need(chainId === 4663, `provider chainId ${chainId} != 4663`);
  const head = B(await rpc("eth_blockNumber"));

  // ---- (2) live nonce state: deployer latest=pending=16; tester latest=pending=2 ----
  const dl = Number(B(await rpc("eth_getTransactionCount", [DEPLOYER, "latest"])));
  const dp = Number(B(await rpc("eth_getTransactionCount", [DEPLOYER, "pending"])));
  const tl = Number(B(await rpc("eth_getTransactionCount", [TESTER, "latest"])));
  const tp = Number(B(await rpc("eth_getTransactionCount", [TESTER, "pending"])));
  need(dl === 16 && dp === 16, `deployer nonce ${dl}/${dp} != 16/16`);
  need(tl === 2 && tp === 2, `tester nonce ${tl}/${tp} != 2/2 (the failed accountSelected precheck must not have consumed a tester nonce)`);

  // ---- (1) anchors 1+2 (re-verified as before, against the ORIGINAL rehearsal calldata) ----
  const completed = [];
  async function verifyCreationAnchor(label, txHash, expNonce, srcData, srcKeccak, expRuntimeHash, origIdx) {
    const tx = await rpc("eth_getTransactionByHash", [txHash]);
    const rc = await rpc("eth_getTransactionReceipt", [txHash]);
    need(!!tx && !!rc && B(rc.status) === 1n, label + ": tx/receipt missing or failed");
    if (!tx || !rc) return null;
    if (tx.chainId !== undefined && tx.chainId !== null) need(Number(B(tx.chainId)) === 4663, label + ": chainId");
    need(A(tx.from) === DEPLOYER && Number(B(tx.nonce)) === expNonce && (tx.to === null || tx.to === undefined) && B(tx.value) === 0n, label + ": sender/nonce/creation/value");
    need(tx.input.toLowerCase() === srcData.toLowerCase() && keccak256(tx.input).toLowerCase() === srcKeccak.toLowerCase(), label + ": calldata");
    const code = await rpc("eth_getCode", [rc.contractAddress, "latest"]);
    need(keccak256(code).toLowerCase() === expRuntimeHash.toLowerCase(), label + ": deployed runtime hash");
    const gasUsed = B(rc.gasUsed), eff = B(rc.effectiveGasPrice);
    return { originalIndex: origIdx, label, txHash, signer: DEPLOYER, nonce: expNonce, to: null, createdAddress: A(rc.contractAddress), inputKeccak: srcKeccak.toLowerCase(), blockNumber: B(rc.blockNumber).toString(), blockHash: rc.blockHash, gasUsed: gasUsed.toString(), effectiveGasPriceWei: eff.toString(), actualGasCostWei: (gasUsed * eff).toString(), deployedRuntimeCodeHash: keccak256(code), deployedCodeSize: (code.length - 2) / 2 };
  }
  const a1 = await verifyCreationAnchor("step1", ANCHOR1, 3, rehearsal.immediateTransactions[0].dataOrInitCode, rehearsal.immediateTransactions[0].dataKeccak, rehearsal.deployedRuntimeCodeHashes.canaryToken, 1);
  const a2 = await verifyCreationAnchor("step2", ANCHOR2, 4, rehearsal.immediateTransactions[1].dataOrInitCode, rehearsal.immediateTransactions[1].dataKeccak, rehearsal.deployedRuntimeCodeHashes.lockingVault, 2);
  if (a1) completed.push(a1); if (a2) completed.push(a2);

  // ---- (1) steps 3-13: DISCOVER on chain by nonce binary-search; verify vs the ACCEPTED v7 canonical ----
  const v7ByOrig = new Map(v7.immediateTransactions.map(t => [t.originalIndex, t]));
  const slotByNonce = { 5: "claimManager", 6: "rialtoAdapter", 7: "coordinator", 8: "stockVault", 9: "uniswapAdapter", 10: "tradeRouter" };
  const EV = { approval: sig0("Approval(address,address,uint256)"), poolCreated: sig0("PoolCreated(address,address,uint24,int24,address)"), initialize: sig0("Initialize(uint160,int24)"), incLiq: sig0("IncreaseLiquidity(uint256,uint128,uint256,uint256)"), erc721: sig0("Transfer(address,address,uint256)") };
  const POOL = A(v7.addressGuards.poolAddress), NPM = A(IN.nonfungiblePositionManager), FACTORY = A(IN.uniswapV3Factory);
  let mintTokenId = null, mintRcLogs = null;
  let lo = B(STEP2_BLOCK) + 1n;
  for (let nonce = 5; nonce <= 15; nonce++) {
    const origIdx = nonce - 2;                                     // deployer nonce 5 -> original step 3 ... nonce 15 -> step 13
    const src = v7ByOrig.get(origIdx);
    const tx = await findTxByNonce(nonce, lo, head);
    const rc = await rpc("eth_getTransactionReceipt", [tx.hash]);
    const label = "step" + origIdx + "(" + src.label + ")";
    need(!!rc && B(rc.status) === 1n, label + ": receipt missing/failed");
    if (tx.chainId !== undefined && tx.chainId !== null) need(Number(B(tx.chainId)) === 4663, label + ": chainId");
    need(A(tx.from) === A(src.signer) && Number(B(tx.nonce)) === src.nonce, label + ": sender/nonce vs v7 canonical");
    need(src.to ? A(tx.to) === A(src.to) : (tx.to === null || tx.to === undefined), label + ": destination vs v7 canonical");
    need(B(tx.value) === 0n, label + ": value != 0");
    need(tx.input.toLowerCase() === src.dataOrInitCode.toLowerCase() && keccak256(tx.input).toLowerCase() === src.dataKeccak.toLowerCase(), label + ": calldata vs v7 canonical");
    const anchor = { originalIndex: origIdx, label: src.label, txHash: tx.hash, signer: A(tx.from), nonce, to: src.to ? A(src.to) : null, createdAddress: rc.contractAddress ? A(rc.contractAddress) : null, inputKeccak: src.dataKeccak.toLowerCase(), blockNumber: B(rc.blockNumber).toString(), blockHash: rc.blockHash, gasUsed: B(rc.gasUsed).toString(), effectiveGasPriceWei: B(rc.effectiveGasPrice).toString(), actualGasCostWei: (B(rc.gasUsed) * B(rc.effectiveGasPrice)).toString() };
    // per-type postconditions
    if (slotByNonce[nonce]) {                                       // deploys (steps 3-8)
      const slot = slotByNonce[nonce];
      need(A(rc.contractAddress) === A(src.predictedCreationAddress), label + ": created != predicted");
      const code = await rpc("eth_getCode", [rc.contractAddress, "latest"]);
      need(keccak256(code).toLowerCase() === rehearsal.deployedRuntimeCodeHashes[slot].toLowerCase(), label + ": runtime hash");
      anchor.deployedRuntimeCodeHash = keccak256(code); anchor.deployedCodeSize = (code.length - 2) / 2; anchor.slot = slot;
    } else if (origIdx === 9 || origIdx === 10) {                   // approvals to NPM
      const lg = rc.logs.find(l => l.topics[0].toLowerCase() === EV.approval);
      need(!!lg && A("0x" + lg.topics[1].slice(26)) === DEPLOYER && A("0x" + lg.topics[2].slice(26)) === NPM && B(lg.data) === B(src.decodedArgs.amount), label + ": Approval(owner,spender,amount)");
    } else if (origIdx === 11) {                                    // factory.createPool
      const lg = rc.logs.find(l => A(l.address) === FACTORY && l.topics[0].toLowerCase() === EV.poolCreated);
      need(!!lg && A("0x" + lg.data.slice(2 + 64).slice(24, 64)) === POOL, label + ": PoolCreated -> expected pool");
    } else if (origIdx === 12) {                                    // pool.initialize
      const lg = rc.logs.find(l => A(l.address) === POOL && l.topics[0].toLowerCase() === EV.initialize);
      need(!!lg && B(lg.data.slice(0, 66)) === B(rehearsal.lpUsage.sqrtPriceX96), label + ": Initialize sqrtPriceX96");
    } else if (origIdx === 13) {                                    // NPM.mint
      need(tx.hash.toLowerCase() === REPORTED_MINT.toLowerCase(), label + ": discovered mint hash != reported hash");
      const inc = rc.logs.find(l => A(l.address) === NPM && l.topics[0].toLowerCase() === EV.incLiq);
      need(!!inc && B(inc.data.slice(0, 66)) === B(rehearsal.lpUsage.poolLiquidityAfter), label + ": IncreaseLiquidity liquidity");
      const xf = rc.logs.find(l => A(l.address) === NPM && l.topics.length === 4 && l.topics[0].toLowerCase() === EV.erc721);
      need(!!xf && A("0x" + xf.topics[2].slice(26)) === DEPLOYER, label + ": LP NFT to deployer");
      if (xf) { mintTokenId = B(xf.topics[3]); anchor.positionTokenId = mintTokenId.toString(); }
      mintRcLogs = rc.logs.length;
    }
    completed.push(anchor);
    lo = B(rc.blockNumber);                                          // next nonce is at/after this block
  }
  need(completed.length === 13, "expected 13 completed anchors, got " + completed.length);

  // ---- (1) resulting pool + position + contract state ----
  const gp = await rpc("eth_call", [{ to: FACTORY, data: sig0("getPool(address,address,uint24)").slice(0, 10) + encAddr(rehearsal.lpUsage.token0) + encAddr(rehearsal.lpUsage.token1) + encUint(policy.economics.feeTier) }, "latest"]);
  need(A("0x" + gp.slice(-40)) === POOL, "factory.getPool != expected pool");
  const slot0 = await view(POOL, "slot0()");
  need(B(slot0.slice(0, 66)) === B(rehearsal.lpUsage.poolSqrtAfter), "pool slot0 sqrtPrice != rehearsal post-mint");
  need(mintTokenId !== null, "mint tokenId not recovered");
  const owner = A("0x" + (await rpc("eth_call", [{ to: NPM, data: sig0("ownerOf(uint256)").slice(0, 10) + encUint(mintTokenId) }, "latest"])).slice(-40));
  need(owner === DEPLOYER, "LP NFT owner != deployer");
  const pos = await rpc("eth_call", [{ to: NPM, data: sig0("positions(uint256)").slice(0, 10) + encUint(mintTokenId) }, "latest"]);
  const posLiq = B("0x" + pos.slice(2 + 7 * 64, 2 + 8 * 64));
  need(posLiq === B(rehearsal.lpUsage.poolLiquidityAfter), "position liquidity != expected");
  const completedContracts = {};
  for (const anc of completed) if (anc.createdAddress && (anc.slot || anc.originalIndex <= 2)) completedContracts[anc.slot || (anc.originalIndex === 1 ? "canaryToken" : "lockingVault")] = { address: anc.createdAddress, runtimeCodeHash: anc.deployedRuntimeCodeHash };
  need(Object.keys(completedContracts).length === 8, "expected 8 completed contracts");

  // ---- fresh pinned snapshot ----
  const pinned = head - 3n;
  const blk = await rpc("eth_getBlockByNumber", [toHex(pinned), false]);
  const deps = {};
  for (const [k, addr] of Object.entries({ weth: IN.weth, uniswapV3Factory: IN.uniswapV3Factory, nonfungiblePositionManager: IN.nonfungiblePositionManager, swapRouter02: IN.swapRouter02, rialtoRegistry: IN.rialtoRegistry, nvdaStockToken: IN.nvdaStockToken })) {
    const code = await rpc("eth_getCode", [addr, "latest"]); deps[k] = { address: A(addr), runtimeCodeHash: keccak256(code), codeBytes: (code.length - 2) / 2 };
  }
  const balSel = (who) => sig0("balanceOf(address)").slice(0, 10) + encAddr(who);
  const ethBal = { deployer: (await rpc("eth_getBalance", [DEPLOYER, "latest"]).then(B)).toString(), tester: (await rpc("eth_getBalance", [TESTER, "latest"]).then(B)).toString() };
  const wethBal = { deployer: (await rpc("eth_call", [{ to: IN.weth, data: balSel(DEPLOYER) }, "latest"]).then(B)).toString(), tester: (await rpc("eth_call", [{ to: IN.weth, data: balSel(TESTER) }, "latest"]).then(B)).toString() };
  const realizedGasWei = completed.reduce((acc, x) => acc + B(x.actualGasCostWei), 0n);

  if (fails.length) { console.error("RECOVERY CAPTURE FAILED:\n - " + fails.join("\n - ")); process.exit(1); }

  writeFileSync(U("recovery-anchor.json"), JSON.stringify({
    v5ZipSha256: V5_ZIP_SHA, v5ReviewedAuthorizationDigest: V5_RAD,
    v6ZipSha256: V6_ZIP_SHA, v6RecoveryAuthorizationDigest: V6_RAD,
    v7ZipSha256: V7_ZIP_SHA, v7RecoveryAuthorizationDigest: V7_RAD,
    v8ZipSha256: V8_ZIP_SHA, v8RecoveryAuthorizationDigest: V8_RAD,
    completedSteps: completed, realizedGasWei: realizedGasWei.toString(),
    positionTokenId: mintTokenId.toString(), poolAddress: POOL,
  }, null, 2));
  writeFileSync(U("recovery-snapshot.json"), JSON.stringify({
    kind: "fresh live recovery snapshot (post original steps 1-13); URL read from env, never recorded",
    capturedAtUtc: new Date().toISOString(), chainId, head: head.toString(),
    pinnedBlock: { number: pinned.toString(), hash: blk.hash, parentHash: blk.parentHash, timestamp: B(blk.timestamp).toString(), baseFeePerGasWei: B(blk.baseFeePerGas).toString(), gasLimit: B(blk.gasLimit).toString() },
    wallets: { deployer: DEPLOYER, tester: TESTER },
    nonces: { deployer: dl, tester: tl }, pendingNonces: { deployer: dp, tester: tp },
    expectedNonces: { deployer: 16, tester: 2 },
    completedContracts, poolAddress: POOL, positionTokenId: mintTokenId.toString(), positionLiquidity: posLiq.toString(),
    externalCodeHashes: deps, balances: { eth: ethBal, weth: wethBal },
  }, null, 2));
  console.log("recovery capture OK (v8 — 13 anchors independently reconstructed + verified)");
  for (const x of completed) console.log(`  step ${String(x.originalIndex).padStart(2)} ${x.label.padEnd(30)} ${x.txHash} block ${x.blockNumber} gas ${x.actualGasCostWei}`);
  console.log("  realized gas (steps 1-13):", realizedGasWei.toString(), "wei | position tokenId:", mintTokenId.toString(), "liquidity:", posLiq.toString());
  console.log("  live nonces deployer", dl + "/" + dp, "tester", tl + "/" + tp, "| pinned", pinned.toString(), "baseFee", B(blk.baseFeePerGas).toString());
}
main().catch(e => { console.error("RECOVERY CAPTURE ERROR:", e.message); process.exit(1); });
