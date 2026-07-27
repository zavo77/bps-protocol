// Embedded bidirectional trading for lab markets (direct Doppler/rehype route).
// Quoting goes through the Uniswap V4 Quoter (which exercises the rehype hook's
// beforeSwap, so dynamic fees and locked liquidity are priced natively); swap
// execution is Universal Router V4_SWAP encoded here byte-for-byte per
// docs/launch-lab/REHYPE_TRADING_AND_RESERVE_RESEARCH.md. No server signing —
// the browser wallet signs everything after a client-side simulation.

import {
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { CHAIN_IDS, DopplerSDK, computePoolId, getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { GOOGL_ADDRESS } from "../config/index";

export interface V4PoolKeyStruct {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface LabPoolContext {
  poolKey: V4PoolKeyStruct;
  poolId: Hex;
  /** LockablePoolStatus numeric (2 = Locked). */
  status: number;
  googlIsCurrency0: boolean;
  universalRouter: Address;
  permit2: Address;
}

export interface SwapQuote {
  direction: "buy" | "sell";
  amountInWei: string;
  amountOutWei: string;
  gasEstimate: string;
  zeroForOne: boolean;
  poolKey: V4PoolKeyStruct;
  quotedAt: number;
}

/** Resolve and validate the pool for a lab token; fail closed on non-GOOGL pools. */
export async function getLabPoolContext(client: PublicClient, tokenAddress: Address): Promise<LabPoolContext> {
  const sdk = new DopplerSDK({ publicClient: client, chainId: CHAIN_IDS.ROBINHOOD });
  const pool = await sdk.getMulticurvePool(tokenAddress);
  const state = await pool.getState();
  const poolKey = state.poolKey as unknown as V4PoolKeyStruct;
  const c0 = getAddress(poolKey.currency0);
  const c1 = getAddress(poolKey.currency1);
  const googlIsCurrency0 = c0.toLowerCase() === GOOGL_ADDRESS.toLowerCase();
  const googlIsCurrency1 = c1.toLowerCase() === GOOGL_ADDRESS.toLowerCase();
  if (!googlIsCurrency0 && !googlIsCurrency1) {
    throw new Error("NOT_A_GOOGL_MARKET");
  }
  const tokenInPool =
    c0.toLowerCase() === tokenAddress.toLowerCase() || c1.toLowerCase() === tokenAddress.toLowerCase();
  if (!tokenInPool) throw new Error("TOKEN_NOT_IN_POOL");
  const a = getAddresses(CHAIN_IDS.ROBINHOOD) as unknown as { universalRouter: Address; permit2: Address };
  return {
    poolKey: { currency0: c0, currency1: c1, fee: poolKey.fee, tickSpacing: poolKey.tickSpacing, hooks: getAddress(poolKey.hooks) },
    poolId: computePoolId(state.poolKey),
    status: Number(state.status),
    googlIsCurrency0,
    universalRouter: a.universalRouter,
    permit2: a.permit2,
  };
}

/** buy = GOOGL -> token; sell = token -> GOOGL. */
export function directionToZeroForOne(direction: "buy" | "sell", googlIsCurrency0: boolean): boolean {
  return direction === "buy" ? googlIsCurrency0 : !googlIsCurrency0;
}

/** Exact-input quote through the V4 Quoter (hook-aware). */
export async function quoteLabSwap(
  client: PublicClient,
  ctx: LabPoolContext,
  direction: "buy" | "sell",
  amountInWei: bigint,
): Promise<SwapQuote> {
  if (amountInWei <= 0n) throw new Error("AMOUNT_REQUIRED");
  const sdk = new DopplerSDK({ publicClient: client, chainId: CHAIN_IDS.ROBINHOOD });
  const zeroForOne = directionToZeroForOne(direction, ctx.googlIsCurrency0);
  const res = await sdk.quoter.quoteExactInputV4({
    poolKey: ctx.poolKey,
    zeroForOne,
    exactAmount: amountInWei,
    hookData: "0x",
  });
  return {
    direction,
    amountInWei: amountInWei.toString(),
    amountOutWei: res.amountOut.toString(),
    gasEstimate: (res.gasEstimate ?? 500_000n).toString(),
    zeroForOne,
    poolKey: ctx.poolKey,
    quotedAt: Date.now(),
  };
}

export function minAmountOut(amountOutWei: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 5_000) {
    throw new Error("INVALID_SLIPPAGE");
  }
  return (amountOutWei * BigInt(10_000 - slippageBps)) / 10_000n;
}

// Universal Router: command 0x10 = V4_SWAP; v4 actions per v4-periphery.
const V4_SWAP_COMMAND = "0x10";
const ACTION_SWAP_EXACT_IN_SINGLE = 0x06;
const ACTION_SETTLE_ALL = 0x0c;
const ACTION_TAKE_ALL = 0x0f;

const UNIVERSAL_ROUTER_EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const POOL_KEY_COMPONENTS = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

export interface UnsignedSwapTx {
  to: Address;
  data: Hex;
  value: "0";
  deadline: string;
  amountInWei: string;
  minAmountOutWei: string;
  /** Token the wallet spends (needs Permit2 allowance chain). */
  inputCurrency: Address;
  outputCurrency: Address;
}

/** Encode the Universal Router execute() call for one exact-input v4 swap. */
export function buildSwapTransaction(params: {
  ctx: LabPoolContext;
  quote: SwapQuote;
  slippageBps: number;
  deadlineSeconds?: number;
}): UnsignedSwapTx {
  const { ctx, quote, slippageBps } = params;
  const amountIn = BigInt(quote.amountInWei);
  const minOut = minAmountOut(BigInt(quote.amountOutWei), slippageBps);
  if (amountIn > 2n ** 128n - 1n || minOut > 2n ** 128n - 1n) throw new Error("AMOUNT_OVERFLOW");
  const inputCurrency = quote.zeroForOne ? ctx.poolKey.currency0 : ctx.poolKey.currency1;
  const outputCurrency = quote.zeroForOne ? ctx.poolKey.currency1 : ctx.poolKey.currency0;

  const swapParams = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "poolKey", type: "tuple", components: POOL_KEY_COMPONENTS },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    [
      {
        poolKey: ctx.poolKey,
        zeroForOne: quote.zeroForOne,
        amountIn,
        amountOutMinimum: minOut,
        hookData: "0x",
      },
    ],
  );
  const settleAll = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [inputCurrency, amountIn],
  );
  const takeAll = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [outputCurrency, minOut],
  );
  const actions = encodePacked(
    ["uint8", "uint8", "uint8"],
    [ACTION_SWAP_EXACT_IN_SINGLE, ACTION_SETTLE_ALL, ACTION_TAKE_ALL],
  );
  const v4Input = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [actions, [swapParams, settleAll, takeAll]],
  );
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds ?? 600));
  const data = encodeFunctionData({
    abi: UNIVERSAL_ROUTER_EXECUTE_ABI,
    functionName: "execute",
    args: [V4_SWAP_COMMAND, [v4Input], deadline],
  });
  return {
    to: ctx.universalRouter,
    data,
    value: "0",
    deadline: deadline.toString(),
    amountInWei: amountIn.toString(),
    minAmountOutWei: minOut.toString(),
    inputCurrency,
    outputCurrency,
  };
}

/** Permit2 fragments the client needs for the two-step approval flow. */
export const PERMIT2_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

// ---------------------------------------------------------------------------
// Trading router — common route shape shared by bpsDirectV4 and zeroEx.
// ---------------------------------------------------------------------------

export type RouteId = "bpsDirectV4" | "zeroEx";

export interface RouteQuote {
  routeId: RouteId;
  routeLabel: string;
  sellToken: Address;
  buyToken: Address;
  sellAmount: string;
  buyAmount: string;
  minimumBuyAmount: string;
  estimatedGas: string;
  priceImpactBps: number | null;
  poolFee: number | null;
  /** ERC20 approval target (Permit2 for direct; 0x allowance holder for zeroEx). */
  allowanceTarget: Address | null;
  transactionTarget: Address;
  transactionData: Hex;
  transactionValue: string;
  quoteBlock: string;
  quoteExpiry: number;
  warnings: string[];
}

export const PRICE_IMPACT_WARN_BPS = 300;
export const PRICE_IMPACT_REJECT_BPS = 1_500;

/**
 * Price impact via a small reference quote: unit price at 1/1000 of the size
 * vs unit price at full size. Honest for hook pools (no midprice assumptions);
 * null when the reference amount rounds to zero.
 */
export async function computePriceImpactBps(
  client: PublicClient,
  ctx: LabPoolContext,
  direction: "buy" | "sell",
  amountInWei: bigint,
  fullAmountOutWei: bigint,
): Promise<number | null> {
  const ref = amountInWei / 1000n;
  if (ref === 0n || fullAmountOutWei === 0n) return null;
  try {
    const refQuote = await quoteLabSwap(client, ctx, direction, ref);
    const refOut = BigInt(refQuote.amountOutWei);
    if (refOut === 0n) return null;
    // impact = 1 - (fullOut/fullIn) / (refOut/refIn), in bps
    const num = fullAmountOutWei * ref * 10_000n;
    const den = refOut * amountInWei;
    if (den === 0n) return null;
    const ratioBps = num / den;
    const impact = 10_000n - (ratioBps > 10_000n ? 10_000n : ratioBps);
    return Number(impact);
  } catch {
    return null;
  }
}

/** Assemble the mandatory direct route in the common shape. */
export async function quoteDirectRoute(
  client: PublicClient,
  tokenAddress: Address,
  direction: "buy" | "sell",
  amountInWei: bigint,
  slippageBps: number,
): Promise<{ quote: RouteQuote; ctx: LabPoolContext }> {
  const ctx = await getLabPoolContext(client, tokenAddress);
  const q = await quoteLabSwap(client, ctx, direction, amountInWei);
  const tx = buildSwapTransaction({ ctx, quote: q, slippageBps });
  const impact = await computePriceImpactBps(client, ctx, direction, amountInWei, BigInt(q.amountOutWei));
  const block = await client.getBlockNumber();
  const warnings: string[] = [];
  if (impact !== null && impact >= PRICE_IMPACT_WARN_BPS) warnings.push(`High price impact: ${(impact / 100).toFixed(2)}%`);
  if (ctx.status !== 2) warnings.push(`Pool status ${ctx.status} (expected Locked=2).`);
  return {
    ctx,
    quote: {
      routeId: "bpsDirectV4",
      routeLabel: "BPS Direct",
      sellToken: tx.inputCurrency,
      buyToken: tx.outputCurrency,
      sellAmount: q.amountInWei,
      buyAmount: q.amountOutWei,
      minimumBuyAmount: tx.minAmountOutWei,
      estimatedGas: q.gasEstimate,
      priceImpactBps: impact,
      poolFee: ctx.poolKey.fee,
      allowanceTarget: ctx.permit2,
      transactionTarget: tx.to,
      transactionData: tx.data,
      transactionValue: "0",
      quoteBlock: block.toString(),
      quoteExpiry: Date.now() + 60_000,
      warnings,
    },
  };
}
