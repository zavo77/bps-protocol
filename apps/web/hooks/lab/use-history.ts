"use client";
// Indexed swap history for a lab market (GET /api/lab/history/[address]).
// The server answers honestly: { available:false, reason:'awaiting-indexed-data',
// swaps:[] } when the indexer view is not ready. This hook never fabricates rows —
// on any error or unavailable response it reports available:false with no swaps.
import { useQuery } from "@tanstack/react-query";
import { labFetch } from "./api";

export interface SwapRecord {
  id: string | number;
  poolId: string;
  blockNumber: string | number;
  txHash: string;
  amount0: string;
  amount1: string;
  sqrtPriceX96: string;
  tick: number;
  fee: number;
  /** Unix seconds, unix ms, or ISO string — normalised by consumers. */
  occurredAt: string | number;
}

interface HistoryResponse {
  available: boolean;
  reason?: string;
  source?: string;
  swaps: SwapRecord[];
}

export interface HistoryState {
  available: boolean;
  swaps: SwapRecord[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** GET /api/lab/history/[address]?limit=200, refreshed every 30 s. */
export function useHistory(address: string | undefined, limit = 200): HistoryState {
  const query = useQuery({
    queryKey: ["lab", "history", address?.toLowerCase() ?? "none", limit],
    enabled: Boolean(address),
    refetchInterval: 30_000,
    queryFn: () => labFetch<HistoryResponse>(`/api/lab/history/${address}?limit=${limit}`),
  });

  const data = query.data;
  return {
    available: data?.available === true,
    swaps: data?.available ? data.swaps : [],
    isLoading: query.isPending && query.fetchStatus !== "idle",
    error: query.error ?? null,
    refetch: () => void query.refetch(),
  };
}
