// Rialto Swap API adapter (server-only). Rialto is the PRIMARY payment-token ↔
// Stock-Token execution venue on 4663 — it has RWA-anchor liquidity the other
// aggregators lack. Read-only: we fetch an exact-input quote and return the
// unsigned transaction for the browser wallet to sign after simulation. No
// server signer; the key is server-side only and never leaves this module.
//
// Shapes follow the official Rialto Swap API reference (docs.rialto.xyz +
// github.com/rialto-plds/rialto-api-docs), grounded against the live /tokens
// and /quote responses (2026-07-27). V1 requests settlement=allowance (approve
// the returned router spender, then send tx as-is — no Permit2 witness signing;
// native ETH needs no approval) and adds NO integrator (swap_fee_bps) fee.

import "server-only";
import { formatUnits, getAddress, type Address } from "viem";

const BASE_URL = "https://rialto-trade-api.rialto.xyz";
const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const QUOTE_TTL_MS = 30_000;

export interface RialtoQuote {
  venue: "rialto";
  sellToken: Address;
  buyToken: Address;
  sellAmountWei: string;
  buyAmountWei: string;
  minBuyAmountWei: string;
  /** issues.allowance.spender — the router; null for native ETH sells. */
  allowanceTarget: Address | null;
  transactionTarget: Address;
  transactionData: `0x${string}`;
  transactionValue: string;
  platformFeeBps: number | null;
  settlement: "allowance" | "permit2";
  routeLegCount: number;
  quoteExpiry: number;
}

interface RialtoResponse {
  chain_id?: number;
  settlement?: string;
  buy_amount?: string;
  min_buy_amount?: string;
  platform_fee?: { total_bps?: number };
  route?: { legs?: unknown[] };
  tx?: { to?: string; data?: string; value?: string };
  issues?: {
    balance?: unknown;
    allowance?: { spender?: string } | null;
    simulationIncomplete?: boolean;
  };
}

/**
 * Quote an exact-input swap through Rialto. Returns null when Rialto has no
 * executable route or is unconfigured. `sellAmountWei` + `sellDecimals` are
 * converted to the human-decimal `sell_amount` Rialto expects. Fail closed;
 * never throw secret-bearing errors.
 */
export async function quoteRialto(params: {
  sellToken: Address;
  sellDecimals: number;
  buyToken: Address;
  sellAmountWei: bigint;
  taker: Address;
  slippageBps: number;
}): Promise<RialtoQuote | null> {
  const key = process.env.RIALTO_API_KEY?.trim();
  if (!key) return null;
  const sellIsNative = params.sellToken.toLowerCase() === NATIVE_ETH.toLowerCase();
  try {
    const qs = new URLSearchParams({
      chain_id: "4663",
      sell_token: params.sellToken,
      buy_token: params.buyToken,
      sell_amount: formatUnits(params.sellAmountWei, params.sellDecimals),
      taker: params.taker,
      slippage_bps: String(params.slippageBps),
      settlement: "allowance",
    });
    const res = await fetch(`${BASE_URL}/quote?${qs}`, {
      headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as RialtoResponse;
    // Chain guard: only ever act on a chain-4663 quote.
    if (j.chain_id !== undefined && j.chain_id !== 4663) return null;
    const tx = j.tx;
    if (!tx?.to || !tx.data || !j.buy_amount || !j.min_buy_amount) return null;
    // settlement=allowance must NOT carry a permit2 payload; reject if it drifted.
    if (j.settlement && j.settlement !== "allowance") return null;
    const spenderRaw = j.issues?.allowance?.spender ?? null;
    // Use the returned spender EXACTLY. Native ETH sells return no allowance.
    const allowanceTarget = spenderRaw ? getAddress(spenderRaw) : null;
    // `issues.allowance: null` (field PRESENT, explicitly null) means the
    // taker's existing allowance to Rialto's router already covers this trade
    // — a VALID, approval-free quote (live-verified 2026-07-28: an approved
    // taker gets allowance:null; a fresh taker gets {actual, spender}).
    // Rejecting it silently demoted post-approval sells to other venues,
    // which then demanded a DIFFERENT approval — the live sell-failure chain.
    const allowanceSatisfied =
      j.issues !== undefined && j.issues !== null && j.issues.allowance === null;
    if (!sellIsNative && !allowanceTarget && !allowanceSatisfied) {
      // ERC-20 sell with no spender AND no explicit satisfied marker — fail closed.
      return null;
    }
    return {
      venue: "rialto",
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmountWei: params.sellAmountWei.toString(),
      buyAmountWei: j.buy_amount,
      minBuyAmountWei: j.min_buy_amount,
      allowanceTarget: sellIsNative ? null : allowanceTarget,
      transactionTarget: getAddress(tx.to),
      transactionData: tx.data as `0x${string}`,
      transactionValue: tx.value ?? "0",
      platformFeeBps: j.platform_fee?.total_bps ?? null,
      settlement: "allowance",
      routeLegCount: Array.isArray(j.route?.legs) ? j.route.legs.length : 0,
      quoteExpiry: Date.now() + QUOTE_TTL_MS,
    };
  } catch {
    return null;
  }
}
