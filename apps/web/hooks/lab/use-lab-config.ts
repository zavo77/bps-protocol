"use client";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { LabPublicConfig } from "@bps/launch-lab";
import { labFetch } from "./api";

/** GET /api/lab/config, refreshed every 30 s. */
export function useLabConfig(): UseQueryResult<LabPublicConfig, Error> {
  return useQuery({
    queryKey: ["lab", "config"],
    queryFn: () => labFetch<LabPublicConfig>("/api/lab/config"),
    refetchInterval: 30_000,
  });
}
