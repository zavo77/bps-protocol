"use client";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { MarketSnapshot } from "@bps/launch-lab";
import { labFetch } from "./api";

/** GET /api/lab/token/[address], refreshed every 20 s. */
export function useMarket(address: string | undefined): UseQueryResult<MarketSnapshot, Error> {
  return useQuery({
    queryKey: ["lab", "market", address?.toLowerCase() ?? "none"],
    enabled: Boolean(address),
    queryFn: () => labFetch<MarketSnapshot>(`/api/lab/token/${address}`),
    refetchInterval: 20_000,
  });
}
