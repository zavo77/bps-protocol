"use client";
// Public creator profile data: GET /api/lab/profile/[walletAddress]. Real data
// only — created markets (chain-reconstructed) and indexed gross swap activity.
// Fee destination and claimable amounts are contract-backed via useFees, never
// inferred here.
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { isAddress, type Address, type Hex } from "viem";
import { labFetch } from "./api";

export interface ProfileMarket {
  tokenAddress: Address;
  tokenName: string;
  tokenSymbol: string;
  anchorSymbol: string | null;
  anchorAddress: Address;
  launchTransactionHash: Hex;
  blockNumber: string;
  timestamp: number | null;
  indexedSwaps: number | null;
  grossMovementWei: string | null;
}

export interface CreatorProfile {
  creator: Address;
  marketCount: number;
  /** Total indexed gross movement (wei); null when the indexer view is absent. */
  totalIndexedGrossWei: string | null;
  indexedDataAvailable: boolean;
  markets: ProfileMarket[];
}

export function useProfile(walletAddress: string): UseQueryResult<CreatorProfile, Error> {
  const valid = isAddress(walletAddress);
  return useQuery({
    queryKey: ["lab", "profile", walletAddress.toLowerCase()],
    queryFn: () => labFetch<CreatorProfile>(`/api/lab/profile/${walletAddress}`),
    enabled: valid,
    refetchInterval: 60_000,
  });
}
