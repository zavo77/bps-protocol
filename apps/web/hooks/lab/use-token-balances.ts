"use client";
// Connected-wallet balances for one lab market: the launch token and the GOOGL
// anchor. Reads balanceOf + decimals through the wagmi public client. Nothing is
// read (and no value is fabricated) while the wallet is disconnected — the query
// simply stays idle and both balances are null.
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { erc20Abi, isAddress, type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { GOOGL_ADDRESS } from "@bps/launch-lab";

export interface TokenBalance {
  balance: bigint;
  decimals: number;
}

export interface TokenBalances {
  /** GOOGL anchor balance for the connected wallet. */
  googl: TokenBalance | null;
  /** Launch-token balance for the connected wallet. */
  token: TokenBalance | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

async function readBalance(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  token: Address,
  owner: Address,
): Promise<TokenBalance> {
  const [balance, decimals] = await Promise.all([
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    }) as Promise<bigint>,
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    }) as Promise<number>,
  ]);
  return { balance, decimals: Number(decimals) };
}

export function useTokenBalances(tokenAddress: string | undefined): TokenBalances {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const tokenOk = typeof tokenAddress === "string" && isAddress(tokenAddress);

  const query: UseQueryResult<{ googl: TokenBalance; token: TokenBalance }, Error> = useQuery({
    queryKey: [
      "lab",
      "balances",
      tokenAddress?.toLowerCase() ?? "none",
      address?.toLowerCase() ?? "none",
    ],
    enabled: Boolean(address) && Boolean(publicClient) && tokenOk,
    refetchInterval: 30_000,
    queryFn: async () => {
      const owner = address as Address;
      const client = publicClient!;
      const [googl, token] = await Promise.all([
        readBalance(client, GOOGL_ADDRESS, owner),
        readBalance(client, tokenAddress as Address, owner),
      ]);
      return { googl, token };
    },
  });

  return {
    googl: query.data?.googl ?? null,
    token: query.data?.token ?? null,
    isLoading: query.isPending && query.fetchStatus !== "idle",
    error: query.error ?? null,
    refetch: () => void query.refetch(),
  };
}
