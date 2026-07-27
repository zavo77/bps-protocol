"use client";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { LaunchRecord } from "@bps/launch-lab";
import { labFetch } from "./api";

/** GET /api/lab/launches (chain-reconstructed confirmed launches), refreshed every 60 s. */
export function useLaunches(): UseQueryResult<LaunchRecord[], Error> {
  return useQuery({
    queryKey: ["lab", "launches"],
    queryFn: async () =>
      (await labFetch<{ launches: LaunchRecord[] }>("/api/lab/launches")).launches,
    refetchInterval: 60_000,
  });
}
