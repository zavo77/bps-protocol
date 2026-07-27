"use client";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ProofRecord } from "@bps/launch-lab";
import { labFetch } from "./api";

/** GET /api/lab/proof, refreshed every 30 s. */
export function useProof(): UseQueryResult<ProofRecord, Error> {
  return useQuery({
    queryKey: ["lab", "proof"],
    queryFn: () => labFetch<ProofRecord>("/api/lab/proof"),
    refetchInterval: 30_000,
  });
}
