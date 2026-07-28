// Market snapshot service — the DYNAMIC market identity comes from the
// provenance-verified Postgres launch row (never the static GENESIS_MARKET
// registry), enriched from chain reads, the complete per-market swap ledger,
// and the external adapters. Values readable from the verified launch record
// or chain are ALWAYS populated — "awaiting indexed data" is reserved for
// truly indexer-dependent values that do not exist yet.

import "server-only";
import { erc20Abi, getAddress, type Address, type Hex } from "viem";
import {
  getLabPoolContext,
  resolveAnchor,
  type MarketDatum,
  type MarketSnapshot,
} from "@bps/launch-lab";
import { getLabClient } from "./server";
import { getPg } from "./store";
import {
  computeStats,
  loadSwapLedger,
  toTradeRecords,
  type MarketStats,
  type TradeRecord,
} from "./market-data";
import { fetchHolderCount } from "./holders";
import { fetchDexScreenerPair, type DexScreenerPair } from "./dexscreener";

const unavailable = <T>(): MarketDatum<T> => ({
  available: false,
  reason: "awaiting-indexed-data",
});
const of = <T>(value: T): MarketDatum<T> => ({ available: true, value });

export interface EnrichedMarketSnapshot extends MarketSnapshot {
  /** Dynamic identity from the provenance-verified launch row. */
  launchBlock: string | null;
  launchedAt: string | null;
  provenanceVerified: boolean;
  stats: MarketStats | null;
  trades: TradeRecord[];
  holderCount: number | null;
  dexScreener: DexScreenerPair | null;
  explorerTokenUrl: string;
}

/** Immutable per-launch facts, persisted at registration (or proven backfill).
 *  Historical markets must NEVER change when server defaults change — any
 *  value absent here stays honestly unavailable. */
export interface LaunchManifestFacts {
  startingFdvUsd?: string;
  feePreset?: string;
  exactPoolFeeUnits?: number;
  creatorFeeAddress?: string;
  beneficiaries?: { beneficiary: string; sharesWad: string; label?: string; percent?: string }[];
  tokenUri?: string;
  anchorSymbol?: string;
  initialSupplyWei?: string;
  saleInventoryWei?: string;
  manifestHash?: string;
  /** How these facts were established: 'registration' | 'proven-backfill'. */
  source?: string;
}

interface LaunchRow {
  creator: string | null;
  launch_tx: string;
  block_number: string;
  launched_at: string | null;
  anchor_symbol: string | null;
  pool_id: string | null;
  pool_or_hook: string | null;
  provenance_verified: boolean;
  launch_manifest: LaunchManifestFacts | null;
}

async function loadLaunchRow(token: string): Promise<LaunchRow | null> {
  const pg = await getPg();
  if (!pg) return null;
  const res = await pg.query(
    `SELECT creator, launch_tx, block_number, launched_at, anchor_symbol, pool_id, pool_or_hook, provenance_verified, launch_manifest
     FROM lab_launches WHERE lower(token_address) = $1 AND provenance_verified = true`,
    [token.toLowerCase()],
  );
  return (res.rows[0] as unknown as LaunchRow) ?? null;
}

export async function readMarketSnapshot(tokenAddressRaw: string): Promise<EnrichedMarketSnapshot> {
  const tokenAddress = getAddress(tokenAddressRaw);
  const client = getLabClient();

  // Dynamic identity + pool context + ledger + externals, gathered concurrently.
  const [rowR, ctxR, ledgerR, holdersR] = await Promise.allSettled([
    loadLaunchRow(tokenAddress),
    getLabPoolContext(client, tokenAddress),
    loadSwapLedger(tokenAddress),
    fetchHolderCount(tokenAddress),
  ]);
  const row = rowR.status === "fulfilled" ? rowR.value : null;
  const ctx = ctxR.status === "fulfilled" ? ctxR.value : null;
  const ledger = ledgerR.status === "fulfilled" ? ledgerR.value : [];
  const holderCount = holdersR.status === "fulfilled" ? holdersR.value.holderCount : null;

  const anchorSymbol = ctx?.anchorSymbol ?? row?.anchor_symbol ?? undefined;
  const anchor = await resolveAnchor(client, anchorSymbol ? { symbol: anchorSymbol } : undefined);

  let name = "";
  let symbol = "";
  let totalSupply: MarketDatum<string> = unavailable();
  let tokenUri: MarketDatum<string> = unavailable();
  let supplyWei = 0n;
  const [nameR, symbolR, supplyR, uriR] = await Promise.allSettled([
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "name" }),
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "totalSupply" }),
    client.readContract({
      address: tokenAddress,
      abi: [
        { type: "function", name: "tokenURI", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
      ] as const,
      functionName: "tokenURI",
    }),
  ]);
  if (nameR.status === "fulfilled") name = nameR.value as string;
  if (symbolR.status === "fulfilled") symbol = symbolR.value as string;
  if (supplyR.status === "fulfilled") {
    supplyWei = supplyR.value as bigint;
    totalSupply = of(supplyWei.toString());
  }
  if (uriR.status === "fulfilled") tokenUri = of(uriR.value as string);

  const poolId = (row?.pool_id ?? ctx?.poolId ?? null) as Hex | null;
  const anchorIsCurrency0 = ctx?.anchorIsCurrency0 ?? true;
  const anchorMid = anchor.status === "verified" ? anchor.midPriceUsd : null;

  // DEX Screener lookup runs AFTER identity resolution so it is bound to THIS
  // market: the quote must be the anchor and, when known, the pair identity
  // must match our v4 poolId / pool_or_hook. The adapter never throws.
  const dexScreener = await fetchDexScreenerPair(tokenAddress, {
    anchorAddress: ctx?.anchorAddress ?? anchor.address,
    poolId,
    poolOrHook: row?.pool_or_hook ?? null,
  });

  const facts = row?.launch_manifest ?? null;

  let stats: MarketStats | null = null;
  let trades: TradeRecord[] = [];
  if (supplyWei > 0n && anchorMid) {
    stats = computeStats({
      ledger,
      anchorIsCurrency0,
      anchorDecimals: anchor.decimals ?? 18,
      tokenDecimals: 18,
      anchorMidUsd: anchorMid,
      totalSupplyWei: supplyWei,
      // ONLY the immutable per-launch record — NEVER today's server defaults.
      // Absent for markets whose starting FDV was not provably retained.
      startingFdvUsd: facts?.startingFdvUsd ?? null,
      poolId,
    });
    trades = toTradeRecords({
      ledger,
      anchorIsCurrency0,
      anchorDecimals: anchor.decimals ?? 18,
      tokenDecimals: 18,
      anchorMidUsd: anchorMid,
      limit: 50,
    });
  }

  return {
    tokenAddress,
    tokenName: name,
    tokenSymbol: symbol,
    tokenUri,
    creator: row?.creator ? of(getAddress(row.creator)) : unavailable<Address>(),
    totalSupply,
    anchor,
    poolId: poolId ? of(poolId) : unavailable(),
    poolStatus: ctx ? of(ctx.status) : unavailable(),
    anchorReserve: stats ? of(stats.anchorReserveWei) : unavailable(),
    remainingTokenInventory: stats ? of(stats.remainingInventoryWei) : unavailable(),
    currentPriceUsd: stats?.priceUsd ? of(stats.priceUsd) : unavailable(),
    startingPriceUsd: stats?.startingPriceUsd ? of(stats.startingPriceUsd) : unavailable(),
    currentFdvUsd: stats?.fdvUsd ? of(stats.fdvUsd) : unavailable(),
    feePreset: facts?.feePreset ? of(facts.feePreset as never) : unavailable(),
    // Immutable launch record first; else the real charged fee from swap
    // events (poolKey.fee is the dynamic-fee SENTINEL 0x800000 on rehype).
    exactPoolFeeUnits: facts?.exactPoolFeeUnits
      ? of(facts.exactPoolFeeUnits)
      : ledger.length > 0
        ? of(ledger[ledger.length - 1]!.fee)
        : unavailable(),
    beneficiaries: facts?.beneficiaries ? of(facts.beneficiaries as never) : unavailable(),
    launchTransactionHash: row ? of(row.launch_tx as Hex) : unavailable(),
    launchBlock: row?.block_number ?? null,
    launchedAt: row?.launched_at ? new Date(row.launched_at).toISOString() : null,
    provenanceVerified: row?.provenance_verified === true,
    stats,
    trades,
    holderCount,
    dexScreener,
    explorerTokenUrl: `https://robinhoodchain.blockscout.com/token/${tokenAddress}`,
    fetchedAt: Date.now(),
  };
}
