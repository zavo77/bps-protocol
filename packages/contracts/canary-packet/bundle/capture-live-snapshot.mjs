// TASK 10C item 2 — capture fresh live inputs from the PROVIDER RPC (env var only).
// The RPC URL is read from process.env and is NEVER printed, logged or written to any artifact.
import { writeFileSync, readFileSync } from "node:fs";
import { createPublicClient, http, keccak256, getAddress, getContractAddress } from "viem";

const U = (p) => new URL(p, import.meta.url);
const policy = JSON.parse(readFileSync(U("review-policy.json"), "utf8"));
const ENV_VAR = policy.liveRpcEnvVar || "ROBINHOOD_CHAIN_RPC_URL";
const RPC = process.env[ENV_VAR];
if (!RPC) { console.error(`FAIL: ${ENV_VAR} not set`); process.exit(1); }

const CONFIRMATIONS = 3n; // pin below head to avoid reorg at tip
const client = createPublicClient({ transport: http(RPC) });
const rpc = (m, p = []) => client.request({ method: m, params: p });
const B = (x) => BigInt(x);

const { deployer: DEPLOYER, tester: TESTER } = policy.wallets;
const IN = policy.infrastructure;
const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }];

const chainId = B(await rpc("eth_chainId"));
if (chainId !== BigInt(policy.chainId)) { console.error("FAIL: chainId mismatch"); process.exit(1); }

const head = B(await rpc("eth_blockNumber"));
const pinned = head - CONFIRMATIONS;
const hex = "0x" + pinned.toString(16);
const blk = await rpc("eth_getBlockByNumber", [hex, false]);

// live nonces at the pinned block (NEVER hardcoded) — the deployment start nonce
const nonces = {
  deployer: Number(B(await rpc("eth_getTransactionCount", [DEPLOYER, hex]))),
  tester: Number(B(await rpc("eth_getTransactionCount", [TESTER, hex]))),
};
// predicted CREATE addresses recomputed from the CURRENT deployer nonce (must be empty to be executable)
const slots = ["canaryToken", "lockingVault", "claimManager", "rialtoAdapter", "coordinator", "stockVault", "uniswapAdapter", "tradeRouter"];
const predicted = {}; for (let i = 0; i < 8; i++) predicted[slots[i]] = getAddress(getContractAddress({ from: DEPLOYER, nonce: BigInt(nonces.deployer + i) }));
const ethBal = {
  deployer: B(await rpc("eth_getBalance", [DEPLOYER, hex])).toString(),
  tester: B(await rpc("eth_getBalance", [TESTER, hex])).toString(),
};
const wethBal = {
  deployer: (await client.readContract({ address: IN.weth, abi: erc20, functionName: "balanceOf", args: [DEPLOYER], blockNumber: pinned })).toString(),
  tester: (await client.readContract({ address: IN.weth, abi: erc20, functionName: "balanceOf", args: [TESTER], blockNumber: pinned })).toString(),
};
// BPSC-TEST is not deployed yet: prove no code at its predicted address
const bpscCode = await rpc("eth_getCode", [predicted.canaryToken, hex]);
const bpscBal = { deployer: "0", tester: "0", note: "BPSC-TEST not yet deployed at its predicted CREATE address (no code)" };

// external dependency runtime code hashes
const externals = { weth: IN.weth, uniswapV3Factory: IN.uniswapV3Factory, nonfungiblePositionManager: IN.nonfungiblePositionManager, swapRouter02: IN.swapRouter02, rialtoRegistry: IN.rialtoRegistry, nvdaStockToken: IN.nvdaStockToken };
const externalCodeHashes = {};
for (const [k, addr] of Object.entries(externals)) {
  const code = await rpc("eth_getCode", [addr, hex]);
  externalCodeHashes[k] = { address: getAddress(addr), runtimeCodeHash: keccak256(code), codeBytes: (code.length - 2) / 2 };
}
// predicted deployment addresses must be empty
const predictedCode = {};
for (const s of slots) { const c = await rpc("eth_getCode", [predicted[s], hex]); predictedCode[s] = { address: predicted[s], empty: c === "0x" || c === "0x0" }; }

const snap = {
  kind: "fresh live block snapshot captured from the configured provider RPC (URL read from env; never recorded)",
  capturedAtUtc: new Date().toISOString(),
  rpcSource: { envVar: ENV_VAR, note: "URL intentionally not recorded in this or any artifact" },
  chainId: Number(chainId),
  head: head.toString(),
  confirmationDepth: Number(CONFIRMATIONS),
  pinnedBlock: {
    number: pinned.toString(),
    hash: blk.hash,
    parentHash: blk.parentHash,
    timestamp: B(blk.timestamp).toString(),
    baseFeePerGasWei: B(blk.baseFeePerGas).toString(),
    gasLimit: B(blk.gasLimit).toString(),
  },
  wallets: { deployer: getAddress(DEPLOYER), tester: getAddress(TESTER) },
  nonces, startNonces: { deployer: nonces.deployer, tester: nonces.tester },
  balances: { eth: ethBal, weth: wethBal, bpsc: bpscBal },
  bpscPredictedAddressHasCode: !(bpscCode === "0x" || bpscCode === "0x0"),
  externalCodeHashes, predictedDeploymentAddresses: predictedCode,
  allPredictedAddressesEmpty: Object.values(predictedCode).every(p => p.empty),
};
writeFileSync(U("block-snapshot.json"), JSON.stringify(snap, null, 2));
console.log(`captured pinned block ${snap.pinnedBlock.number} (head ${snap.head}, depth ${Number(CONFIRMATIONS)})`);
console.log(`  hash ${snap.pinnedBlock.hash}`);
console.log(`  timestamp ${snap.pinnedBlock.timestamp}  baseFee ${snap.pinnedBlock.baseFeePerGasWei}  chainId ${snap.chainId}`);
console.log(`  nonces deployer=${nonces.deployer} tester=${nonces.tester}`);
console.log(`  ETH deployer=${ethBal.deployer} tester=${ethBal.tester} | WETH deployer=${wethBal.deployer} tester=${wethBal.tester}`);
console.log(`  all 8 predicted addresses empty: ${snap.allPredictedAddressesEmpty}`);
