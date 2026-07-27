// 0x Swap API v2 (allowance-holder) adapter — optional best-route. Server-only:
// ZEROX_API_KEY never reaches the client; quotes are bound to taker + token
// pair; the allowance target comes ONLY from the 0x response and must never be
// the Settler (transaction target). No route from 0x is not a market failure —
// bpsDirectV4 remains mandatory.

import "server-only";
import { getAddress, type Address } from "viem";
import type { RouteQuote } from "@bps/launch-lab";

const ZEROX_BASE = "https://api.0x.org";
const QUOTE_TTL_MS = 30_000;

interface ZeroExQuoteResponse {
  buyAmount?: string;
  sellAmount?: string;
  minBuyAmount?: string;
  transaction?: { to?: string; data?: string; value?: string; gas?: string };
  issues?: { allowance?: { spender?: string } | null };
  allowanceTarget?: string;
  estimatedPriceImpact?: string;
  liquidityAvailable?: boolean;
}

/** Returns null when 0x is unconfigured, has no route, or returns an invalid payload. */
export async function quoteZeroExRoute(params: {
  sellToken: Address;
  buyToken: Address;
  sellAmountWei: bigint;
  taker: Address;
  slippageBps: number;
}): Promise<RouteQuote | null> {
  const key = process.env.ZEROX_API_KEY?.trim();
  if (!key) return null;
  try {
    const qs = new URLSearchParams({
      chainId: "4663",
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmountWei.toString(),
      taker: params.taker,
      slippageBps: String(params.slippageBps),
    });
    const res = await fetch(`${ZEROX_BASE}/swap/allowance-holder/quote?${qs}`, {
      headers: { "0x-api-key": key, "0x-version": "v2" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as ZeroExQuoteResponse;
    if (j.liquidityAvailable === false) return null;
    const tx = j.transaction;
    if (!tx?.to || !tx.data || !j.buyAmount) return null;
    const transactionTarget = getAddress(tx.to);
    // The approval target is EXACTLY the spender 0x returns (the AllowanceHolder
    // in the allowance-holder flow). We approve only this — never the internal
    // Settler. In the allowance-holder API the AllowanceHolder is both the
    // spender and the transaction target, which is correct and expected; native
    // ETH sells return no allowance (no approval needed).
    const spenderRaw = j.issues?.allowance?.spender ?? j.allowanceTarget ?? null;
    const allowanceTarget = spenderRaw ? getAddress(spenderRaw) : null;
    const impact = j.estimatedPriceImpact ? Math.round(Number(j.estimatedPriceImpact) * 100) : null;
    return {
      routeId: "zeroEx",
      routeLabel: "0x Best Route",
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmountWei.toString(),
      buyAmount: j.buyAmount,
      minimumBuyAmount: j.minBuyAmount ?? j.buyAmount,
      estimatedGas: tx.gas ?? "500000",
      priceImpactBps: Number.isFinite(impact) ? impact : null,
      poolFee: null,
      allowanceTarget,
      transactionTarget,
      transactionData: tx.data as `0x${string}`,
      transactionValue: tx.value ?? "0",
      quoteBlock: "0",
      quoteExpiry: Date.now() + QUOTE_TTL_MS,
      warnings: [],
    };
  } catch {
    return null;
  }
}
