// TASK 10C item 3 — MANDATORY execution-time preflight.
// Run immediately before any signing/broadcast. ANY failed gate stops execution (non-zero exit).
// The provider RPC URL is read from the environment ONLY and is never printed or stored.
import { readFileSync } from "node:fs";
import { createPublicClient, http, keccak256, getAddress, getContractAddress } from "viem";

const U = (p) => new URL(p, import.meta.url);
const rj = (p) => JSON.parse(readFileSync(U(p), "utf8"));
const a = rj("canary-unsigned-packet.json"), policy = rj("review-policy.json"), snap = rj("block-snapshot.json");
const ENV_VAR = policy.liveRpcEnvVar || "ROBINHOOD_CHAIN_RPC_URL";
const RPC = process.env[ENV_VAR];
if (!RPC) { console.error(`PREFLIGHT ABORT: ${ENV_VAR} not set`); process.exit(1); }

const client = createPublicClient({ transport: http(RPC) });
const rpc = (m, p = []) => client.request({ method: m, params: p });
const B = (x) => BigInt(x); const lc = (x) => (x || "").toLowerCase();
const G = []; const gate = (n, ok, d = "") => G.push({ n, ok: !!ok, d });

const DEPLOYER = policy.wallets.deployer, TESTER = policy.wallets.tester;
const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }];
const slots = ["canaryToken", "lockingVault", "claimManager", "rialtoAdapter", "coordinator", "stockVault", "uniswapAdapter", "tradeRouter"];

// ---- gate 1: packet has not expired ----
const nowMs = Date.now();
const expiresMs = Date.parse(a.meta.expiresAtUtc);
gate("1. packet has NOT expired", nowMs <= expiresMs,
  `now=${new Date(nowMs).toISOString()} expires=${a.meta.expiresAtUtc} remaining=${Math.floor((expiresMs - nowMs) / 1000)}s`);

// ---- gate 2: signer nonces still equal the packet nonces ----
const liveDeployerNonce = Number(B(await rpc("eth_getTransactionCount", [DEPLOYER, "latest"])));
const liveTesterNonce = Number(B(await rpc("eth_getTransactionCount", [TESTER, "latest"])));
const imm = a.immediateTransactions;
const firstDeployerNonce = Math.min(...imm.filter(t => lc(t.signer) === lc(DEPLOYER)).map(t => t.nonce));
const firstTesterNonce = Math.min(...imm.filter(t => lc(t.signer) === lc(TESTER)).map(t => t.nonce));
gate("2. signer nonces still equal packet nonces", liveDeployerNonce === firstDeployerNonce && liveTesterNonce === firstTesterNonce,
  `live deployer=${liveDeployerNonce} (packet ${firstDeployerNonce}), tester=${liveTesterNonce} (packet ${firstTesterNonce})`);

// ---- gate 3: required balances sufficient ----
const inb = a.forkFunding.inbound;
const needEthD = B(inb.deployer.eth), needEthT = B(inb.tester.ethImmediate), needWethD = B(inb.deployer.weth), needWethT = B(inb.tester.weth);
const [ethD, ethT] = [B(await rpc("eth_getBalance", [DEPLOYER, "latest"])), B(await rpc("eth_getBalance", [TESTER, "latest"]))];
const wethD = await client.readContract({ address: policy.infrastructure.weth, abi: erc20, functionName: "balanceOf", args: [DEPLOYER] });
const wethT = await client.readContract({ address: policy.infrastructure.weth, abi: erc20, functionName: "balanceOf", args: [TESTER] });
const balOk = ethD >= needEthD && ethT >= needEthT && B(wethD) >= needWethD && B(wethT) >= needWethT;
gate("3. required ETH + WETH balances are sufficient", balOk,
  balOk ? "funded" : `NOT FUNDED — need ETH d=${needEthD}/t=${needEthT}, WETH d=${needWethD}/t=${needWethT}; have ETH d=${ethD}/t=${ethT}, WETH d=${wethD}/t=${wethT}`);

// ---- gate 4: external dependency code hashes unchanged ----
let extOk = true; const extBad = [];
for (const [k, rec] of Object.entries(snap.externalCodeHashes)) {
  const code = await rpc("eth_getCode", [rec.address, "latest"]);
  if (keccak256(code) !== rec.runtimeCodeHash) { extOk = false; extBad.push(k); }
}
gate("4. external dependency code hashes unchanged", extOk, extOk ? `${Object.keys(snap.externalCodeHashes).length} dependencies verified` : "CHANGED: " + extBad.join(","));

// ---- gate 5: no expected deployment address already contains code ----
let emptyOk = true; const occupied = [];
for (let i = 0; i < 8; i++) {
  const addr = getAddress(getContractAddress({ from: DEPLOYER, nonce: BigInt(firstDeployerNonce + i) }));
  const code = await rpc("eth_getCode", [addr, "latest"]);
  if (!(code === "0x" || code === "0x0")) { emptyOk = false; occupied.push(`${slots[i]}@${addr}`); }
}
gate("5. no expected deployment address already contains code", emptyOk, emptyOk ? "all 8 empty" : "OCCUPIED: " + occupied.join(","));

// ---- gate 6: current base fee within the packet's fee bounds ----
const head = await rpc("eth_getBlockByNumber", ["latest", false]);
const baseFee = B(head.baseFeePerGas);
const maxFee = B(a.meta.feeBounds.maxFeePerGasWei), maxPrio = B(a.meta.feeBounds.maxPriorityFeePerGasWei);
const feeOk = baseFee + maxPrio <= maxFee;
gate("6. current base fee within packet fee bounds", feeOk, `baseFee=${baseFee} + maxPriority=${maxPrio} <= maxFee=${maxFee} : ${feeOk}`);

// ---- gate 7: aggregate exposure still within $130 ----
const ca = a.capArithmetic;
const capMicro = B(policy.caps.aggregateUsd) * 1_000_000n;
const aggMicro = B(ca.allInclusiveExposureMicroUsd);
gate("7. aggregate exposure within $130", aggMicro <= capMicro, `$${(Number(aggMicro) / 1e6).toFixed(6)} <= $${policy.caps.aggregateUsd}`);

// ---- gate 8: authorization flags consistent with the packet's mode ----
// execution mode: all four flags must be TRUE (authorized) + scope recorded + canary/production correct;
// preparation mode: all four must be FALSE. The operator additionally re-checks all gates per transaction.
const f = a.safetyFlags;
const EXEC = policy.authorizationMode === "execution";
gate(EXEC ? "8. execution authorized: all four flags true + canary/production/scope" : "8. all four authorization flags still false",
  EXEC
    ? (f.broadcastReady === true && f.liveWritesApproved === true && f.executionAuthorized === true && f.fundingAuthorized === true &&
       a.meta.authorization && a.meta.authorization.canary === true && a.meta.authorization.production === false &&
       Number(a.meta.authorization.maxAllInclusiveExposureUsd) === 130 && !!a.meta.authorization.scope)
    : (f.broadcastReady === false && f.liveWritesApproved === false && f.executionAuthorized === false && f.fundingAuthorized === false),
  EXEC ? "execution-enabled canary; canonical BPS production excluded" : "");

console.log("EXECUTION-TIME PREFLIGHT");
for (const g of G) console.log(` [${g.ok ? "PASS" : "FAIL"}] ${g.n}${g.d ? "  (" + g.d + ")" : ""}`);
const allOk = G.every(g => g.ok);
console.log(allOk ? (EXEC ? "\nPREFLIGHT: PASS — gates satisfied. Execution authorized for BPSC-TEST canary; signing occurs only via per-tx Rabby approval." : "\nPREFLIGHT: PASS — gates satisfied (still NOT an authorization to execute)")
  : "\nPREFLIGHT: FAIL — EXECUTION MUST STOP");
process.exit(allOk ? 0 : 1);
