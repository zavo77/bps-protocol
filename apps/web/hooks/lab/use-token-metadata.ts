"use client";
// Token-URI metadata for a launched token (GET /api/lab/token/[address]/metadata).
// The server resolves the on-chain tokenURI into { name, description, imageUrl }
// and answers honestly with available:false when there is nothing to show — this
// hook never substitutes another token's artwork or any fabricated value.
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { labFetch } from "./api";

export interface TokenMetadata {
  available: boolean;
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  tokenUri: string | null;
  source: "token-uri" | null;
  fetchedAt: number;
}

/**
 * GET /api/lab/token/[address]/metadata — cached ~5 minutes with a single
 * retry, so a missing/broken tokenURI never turns into a retry storm.
 */
export function useTokenMetadata(
  address: string | undefined,
): UseQueryResult<TokenMetadata, Error> {
  return useQuery({
    queryKey: ["lab", "token-metadata", address?.toLowerCase() ?? "none"],
    enabled: Boolean(address),
    queryFn: () => labFetch<TokenMetadata>(`/api/lab/token/${address}/metadata`),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
