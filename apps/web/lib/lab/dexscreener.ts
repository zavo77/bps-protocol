// DEX Screener pair adapter (server-only, read-only). Resolves OUR market's
// trading pair from the chain-scoped endpoint
// GET token-pairs/v1/{chainSlug}/{tokenAddress} and only accepts a pair that
// provably belongs to this market: chain slug, base token, anchor quote token,
// and — when a pool binding is provided — the pair identity must ALL match.
// Display-only telemetry: an unindexed token, a non-matching pair, and
// upstream errors/timeouts all resolve to null ("DEX Screener indexing…") —
// never throw, never leak upstream error text. The pair link is the `url`
// DEX Screener returns, used VERBATIM (and must be a dexscreener.com link);
// we never construct or guess a pair path. 30-second in-module cache.

import "server-only";
import { getAddress } from "viem";

const DEXSCREENER_BASE = "https://api.dexscreener.com";
// Discovered empirically (2026-07-28) from the live API: DEX Screener indexes
// Robinhood Chain (4663) under the chain slug "robinhood". Both
// latest/dex/tokens/{MAG8} and token-pairs/v1/robinhood/{MAG8} report
// chainId "robinhood" for the canary market. For Uniswap v4 pools on this
// chain the observed `pairAddress` is the v4 poolId bytes32 itself (e.g. the
// MAG8/GOOGL pair reports pairAddress
// 0x1ffc403eaf47aeefece21df47b4fdc4bc5fc6af269a5a21b2c14f5ab15ac4509, which
// is exactly the pool's v4 poolId), so the poolId binding matches directly.
const ROBINHOOD_CHAIN_SLUG = "robinhood";
const CACHE_TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 6_000;

export interface DexScreenerPair {
  url: string;
  priceUsd: string | null;
  priceNative: string | null;
  liquidityUsd: number | null;
  fdv: number | null;
  marketCap: number | null;
  volume24h: number | null;
  txns24h: { buys: number; sells: number } | null;
  priceChange24h: number | null;
  pairCreatedAt: number | null;
  dexId: string | null;
}

/** Identity of the pool the pair MUST belong to. */
export interface DexPairBinding {
  /** The market's anchor (quote) token address. Without it a pair cannot be
   *  proven to belong to this market, so the lookup resolves null. */
  anchorAddress: string | null;
  /** Uniswap v4 poolId (bytes32). On this chain DEX Screener's `pairAddress`
   *  for v4 pools IS the poolId, so this binds the exact pool. */
  poolId?: string | null;
  /** The launch row's pool_or_hook address, accepted as an alternate id. */
  poolOrHook?: string | null;
}

interface RawPair {
  chainId?: unknown;
  pairAddress?: unknown;
  baseToken?: { address?: unknown } | null;
  quoteToken?: { address?: unknown } | null;
  url?: unknown;
  dexId?: unknown;
  priceUsd?: unknown;
  priceNative?: unknown;
  liquidity?: { usd?: unknown } | null;
  fdv?: unknown;
  marketCap?: unknown;
  volume?: { h24?: unknown } | null;
  txns?: { h24?: { buys?: unknown; sells?: unknown } | null } | null;
  priceChange?: { h24?: unknown } | null;
  pairCreatedAt?: unknown;
}

const cache = new Map<string, { pair: DexScreenerPair; fetchedAt: number }>();

/** Test hook: drop all cached pairs. */
export function __clearDexCache(): void {
  cache.clear();
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toStringOrNull(raw: unknown): string | null {
  if (typeof raw === "string" && raw !== "") return raw;
  // DEX Screener documents prices as strings but be tolerant of numbers.
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

function lowerAddressOrNull(raw: unknown): string | null {
  return typeof raw === "string" && raw !== "" ? raw.toLowerCase() : null;
}

/**
 * From the token-pairs/v1 response (a bare JSON array), keep ONLY pairs that
 * provably identify OUR pool — every rule below is required:
 *  - `url` present, verbatim, and starting with https://dexscreener.com/;
 *  - `chainId` equal to the Robinhood chain slug;
 *  - `baseToken.address` equal to the lab token (case-insensitive);
 *  - `quoteToken.address` equal to the market's anchor (case-insensitive);
 *  - when a pool binding exists, `pairAddress` case-insensitively equal to
 *    the v4 poolId or the pool_or_hook address.
 * If several pairs survive (only possible without a pool binding), the one
 * with the highest known `liquidity.usd` wins.
 */
function pickBoundPair(
  body: unknown,
  tokenLc: string,
  anchorLc: string,
  pairIdsLc: string[],
): RawPair | null {
  if (!Array.isArray(body)) return null;
  let best: RawPair | null = null;
  let bestLiquidity = Number.NEGATIVE_INFINITY;
  for (const candidate of body) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const raw = candidate as RawPair;
    if (typeof raw.url !== "string" || !raw.url.startsWith("https://dexscreener.com/")) continue;
    if (raw.chainId !== ROBINHOOD_CHAIN_SLUG) continue;
    if (lowerAddressOrNull(raw.baseToken?.address) !== tokenLc) continue;
    if (lowerAddressOrNull(raw.quoteToken?.address) !== anchorLc) continue;
    if (pairIdsLc.length > 0) {
      const pairAddress = lowerAddressOrNull(raw.pairAddress);
      if (pairAddress === null || !pairIdsLc.includes(pairAddress)) continue;
    }
    const liquidity = toNumber(raw.liquidity?.usd) ?? -1;
    if (best === null || liquidity > bestLiquidity) {
      best = raw;
      bestLiquidity = liquidity;
    }
  }
  return best;
}

function mapPair(raw: RawPair, url: string): DexScreenerPair {
  const buys = toNumber(raw.txns?.h24?.buys);
  const sells = toNumber(raw.txns?.h24?.sells);
  return {
    url,
    priceUsd: toStringOrNull(raw.priceUsd),
    priceNative: toStringOrNull(raw.priceNative),
    liquidityUsd: toNumber(raw.liquidity?.usd),
    fdv: toNumber(raw.fdv),
    marketCap: toNumber(raw.marketCap),
    volume24h: toNumber(raw.volume?.h24),
    txns24h: buys !== null && sells !== null ? { buys, sells } : null,
    priceChange24h: toNumber(raw.priceChange?.h24),
    pairCreatedAt: toNumber(raw.pairCreatedAt),
    dexId: toStringOrNull(raw.dexId),
  };
}

/**
 * Fetch OUR market's DEX Screener pair for `tokenAddress`, bound to the
 * market identity in `binding`. Returns null when the token is not yet
 * indexed, when no pair passes every binding rule (an unrelated pool is
 * NEVER selected), on invalid input, or on any upstream error/timeout —
 * callers render null as "DEX Screener indexing…". Never throws. Successful
 * lookups are cached for 30 seconds (keyed by token + binding); null results
 * are not cached so indexing is picked up promptly.
 */
export async function fetchDexScreenerPair(
  tokenAddress: string,
  binding: DexPairBinding,
): Promise<DexScreenerPair | null> {
  let address: string;
  try {
    // Validate + checksum before the address ever reaches a URL.
    address = getAddress(tokenAddress);
  } catch {
    return null;
  }
  // The anchor quote is what proves the pair is OUR market — required.
  let anchor: string;
  try {
    if (!binding.anchorAddress) return null;
    anchor = getAddress(binding.anchorAddress);
  } catch {
    return null;
  }
  const pairIdsLc = [binding.poolId, binding.poolOrHook]
    .filter((v): v is string => typeof v === "string" && v !== "")
    .map((v) => v.toLowerCase());
  const key = [address.toLowerCase(), anchor.toLowerCase(), ...pairIdsLc].join("|");
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.pair;
  try {
    const res = await fetch(
      `${DEXSCREENER_BASE}/token-pairs/v1/${ROBINHOOD_CHAIN_SLUG}/${address}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    const raw = pickBoundPair(body, address.toLowerCase(), anchor.toLowerCase(), pairIdsLc);
    if (raw === null || typeof raw.url !== "string") return null;
    const pair = mapPair(raw, raw.url);
    cache.set(key, { pair, fetchedAt: Date.now() });
    return pair;
  } catch {
    // Swallow upstream/timeout errors — never leak them to callers.
    return null;
  }
}
