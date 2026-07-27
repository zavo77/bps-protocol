// Market snapshot service — only real or explicitly-unavailable data.

import "server-only";
import { erc20Abi, getAddress, type Address } from "viem";
import {
  GENESIS_MARKET,
  resolveAnchor,
  type MarketDatum,
  type MarketSnapshot,
} from "@bps/launch-lab";
import { getLabClient } from "./server";

const unavailable = <T>(): MarketDatum<T> => ({
  available: false,
  reason: "awaiting-indexed-data",
});
const of = <T>(value: T): MarketDatum<T> => ({ available: true, value });

export async function readMarketSnapshot(tokenAddressRaw: string): Promise<MarketSnapshot> {
  const tokenAddress = getAddress(tokenAddressRaw);
  const client = getLabClient();
  // Resolve THIS market's actual anchor from its pool; fall back to the default
  // anchor verification if the pool can't be resolved (e.g. not yet indexed).
  let anchorSymbol: string | undefined;
  try {
    const { getLabPoolContext } = await import("@bps/launch-lab");
    const ctx = await getLabPoolContext(client, tokenAddress);
    anchorSymbol = ctx.anchorSymbol;
  } catch {
    anchorSymbol = undefined;
  }
  const anchor = await resolveAnchor(client, anchorSymbol ? { symbol: anchorSymbol } : undefined);

  let name = "";
  let symbol = "";
  let totalSupply: MarketDatum<string> = unavailable();
  let tokenUri: MarketDatum<string> = unavailable();
  const [nameR, symbolR, supplyR, uriR] = await Promise.allSettled([
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "name" }),
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "totalSupply" }),
    client.readContract({
      address: tokenAddress,
      abi: [
        {
          type: "function",
          name: "tokenURI",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "string" }],
        },
      ] as const,
      functionName: "tokenURI",
    }),
  ]);
  if (nameR.status === "fulfilled") name = nameR.value as string;
  if (symbolR.status === "fulfilled") symbol = symbolR.value as string;
  if (supplyR.status === "fulfilled") totalSupply = of((supplyR.value as bigint).toString());
  if (uriR.status === "fulfilled") tokenUri = of(uriR.value as string);

  const isGenesis =
    GENESIS_MARKET.launched &&
    GENESIS_MARKET.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase();

  return {
    tokenAddress,
    tokenName: name,
    tokenSymbol: symbol,
    tokenUri,
    creator: unavailable<Address>(),
    totalSupply,
    anchor,
    poolId: isGenesis && GENESIS_MARKET.poolId ? of(GENESIS_MARKET.poolId) : unavailable(),
    poolStatus: unavailable(),
    anchorReserve: unavailable(),
    remainingTokenInventory: unavailable(),
    currentPriceUsd: unavailable(),
    startingPriceUsd: unavailable(),
    currentFdvUsd: unavailable(),
    feePreset: unavailable(),
    exactPoolFeeUnits: unavailable(),
    beneficiaries: unavailable(),
    launchTransactionHash:
      isGenesis && GENESIS_MARKET.launchTransactionHash
        ? of(GENESIS_MARKET.launchTransactionHash)
        : unavailable(),
    fetchedAt: Date.now(),
  };
}
