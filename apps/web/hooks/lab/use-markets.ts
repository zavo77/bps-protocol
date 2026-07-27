"use client";
// Public markets browser data: GET /api/lab/launches?sort=newest|volume. Real
// chain-reconstructed launches enriched with indexed swap activity when the
// indexer view exists (else the counts are null and the UI says so). Refreshed
// every 60 s; the sort is server-applied and part of the query key.
import { useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { labFetch } from "./api";

export type MarketsSort = "newest" | "volume";

/** One row of the public markets list (a LaunchRecord + indexed activity). */
export interface MarketListItem {
  tokenAddress: Address;
  tokenName: string;
  tokenSymbol: string;
  creator: Address | null;
  numeraire: Address;
  anchorSymbol: string | null;
  poolOrHook: Address;
  launchTransactionHash: Hex;
  blockNumber: string;
  timestamp: number | null;
  /** Indexed swap count; null when the indexer view is unavailable. */
  indexedSwaps: number | null;
  /** Gross cross-token movement (wei, decimal string); null when unavailable. */
  grossMovementWei: string | null;
}

interface LaunchesResponse {
  launches: MarketListItem[];
  indexedDataAvailable: boolean;
  sort: string;
}

export interface UseMarkets {
  markets: MarketListItem[];
  indexedDataAvailable: boolean;
  sort: MarketsSort;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  setSort: (sort: MarketsSort) => void;
  refetch: () => void;
}

export function useMarkets(initialSort: MarketsSort = "newest"): UseMarkets {
  const [sort, setSort] = useState<MarketsSort>(initialSort);
  const query: UseQueryResult<LaunchesResponse, Error> = useQuery({
    queryKey: ["lab", "markets", sort],
    queryFn: () => labFetch<LaunchesResponse>(`/api/lab/launches?sort=${sort}`),
    refetchInterval: 60_000,
  });
  return {
    markets: query.data?.launches ?? [],
    indexedDataAvailable: query.data?.indexedDataAvailable ?? false,
    sort,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error ?? null,
    setSort,
    refetch: () => void query.refetch(),
  };
}
