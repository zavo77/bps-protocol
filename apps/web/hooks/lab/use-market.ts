"use client";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
// Type-only import: erased at compile time, so the server-only module (and its
// "server-only" guard) never enters the client bundle.
import type { EnrichedMarketSnapshot } from "../../lib/lab/market";
import { labFetch } from "./api";

/**
 * GET /api/lab/token/[address], refreshed every 20 s. The response is the
 * EnrichedMarketSnapshot: the legacy MarketSnapshot fields plus launch
 * identity, ledger-derived stats, recent trades, holder count, DEX Screener
 * telemetry, and the explorer token URL.
 */
export function useMarket(
  address: string | undefined,
): UseQueryResult<EnrichedMarketSnapshot, Error> {
  return useQuery({
    queryKey: ["lab", "market", address?.toLowerCase() ?? "none"],
    enabled: Boolean(address),
    queryFn: () => labFetch<EnrichedMarketSnapshot>(`/api/lab/token/${address}`),
    refetchInterval: 20_000,
  });
}
