// 1inch Classic Swap (Aggregation) adapter for Robinhood Chain (chainId 4663),
// which 1inch officially supports (Router 0x5A705DE8982235a7fa45bB83dCaCf03a211389C7).
// Server-only; ONEINCH_API_KEY never reaches the client. Returns null when the
// key is unconfigured, so the route stays dormant-but-ready until a key exists —
// never a dead or faked route. Read-only: returns the unsigned tx for the
// browser wallet to sign after simulation. No server signer; no integrator fee.

import "server-only";
import { getAddress, type Address } from "viem";

const BASE = "https://api.1inch.dev/swap/v6.0/4663";
const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ONEINCH_NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"; // 1inch uses the same sentinel
const QUOTE_TTL_MS = 30_000;

export interface OneInchQuote {
  venue: "oneInch";
  sellToken: Address;
  buyToken: Address;
  sellAmountWei: string;
  buyAmountWei: string;
  minBuyAmountWei: string;
  allowanceTarget: Address | null;
  transactionTarget: Address;
  transactionData: `0x${string}`;
  transactionValue: string;
  quoteExpiry: number;
}

interface OneInchSwapResponse {
  dstAmount?: string;
  tx?: { to?: string; data?: string; value?: string };
}

/** Exact-input quote via 1inch /swap (returns an executable tx). Null when
 *  unconfigured or no route. */
export async function quoteOneInch(params: {
  sellToken: Address;
  buyToken: Address;
  sellAmountWei: bigint;
  taker: Address;
  slippageBps: number;
}): Promise<OneInchQuote | null> {
  const key = process.env.ONEINCH_API_KEY?.trim();
  if (!key) return null;
  const sellIsNative = params.sellToken.toLowerCase() === NATIVE_ETH.toLowerCase();
  const src = sellIsNative ? ONEINCH_NATIVE : params.sellToken;
  const dst =
    params.buyToken.toLowerCase() === NATIVE_ETH.toLowerCase() ? ONEINCH_NATIVE : params.buyToken;
  try {
    const qs = new URLSearchParams({
      src,
      dst,
      amount: params.sellAmountWei.toString(),
      from: params.taker,
      // 1inch slippage is a percentage; bps/100.
      slippage: String(params.slippageBps / 100),
      disableEstimate: "true",
    });
    const res = await fetch(`${BASE}/swap?${qs}`, {
      headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as OneInchSwapResponse;
    if (!j.tx?.to || !j.tx.data || !j.dstAmount) return null;
    // Approval spender: ONLY the venue-declared spender from /approve/spender.
    // If the endpoint does not yield an address, FAIL CLOSED (no 1inch route) —
    // never substitute tx.to; approvals must go to exactly the declared spender.
    // Native ETH needs no approval.
    let allowanceTarget: Address | null = null;
    if (!sellIsNative) {
      try {
        const sp = await fetch(`${BASE}/approve/spender`, {
          headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        });
        if (!sp.ok) return null;
        const spj = (await sp.json()) as { address?: string };
        if (!spj.address) return null;
        allowanceTarget = getAddress(spj.address);
      } catch {
        return null; // spender unknown → no executable 1inch route
      }
    }
    const minOut = (BigInt(j.dstAmount) * BigInt(10_000 - params.slippageBps)) / 10_000n;
    return {
      venue: "oneInch",
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmountWei: params.sellAmountWei.toString(),
      buyAmountWei: j.dstAmount,
      minBuyAmountWei: minOut.toString(),
      allowanceTarget,
      transactionTarget: getAddress(j.tx.to),
      transactionData: j.tx.data as `0x${string}`,
      transactionValue: j.tx.value ?? "0",
      quoteExpiry: Date.now() + QUOTE_TTL_MS,
    };
  } catch {
    return null;
  }
}
