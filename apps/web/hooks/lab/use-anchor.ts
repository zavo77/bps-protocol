"use client";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { AnchorVerification } from "@bps/launch-lab";
import { labFetch } from "./api";

/** GET /api/lab/anchor/googl (fail-closed server verification), refreshed every 30 s. */
export function useAnchor(): UseQueryResult<AnchorVerification, Error> {
  return useQuery({
    queryKey: ["lab", "anchor", "googl"],
    queryFn: () => labFetch<AnchorVerification>("/api/lab/anchor/googl"),
    refetchInterval: 30_000,
  });
}
