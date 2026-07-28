// DEX Screener token-pair adapter (server-only, read-only). Fetches the
// best-liquidity trading pair for a token from the official DEX Screener
// latest/dex/tokens endpoint. Display-only telemetry: a token that DEX
// Screener has not indexed yet resolves to null ("DEX Screener indexing…"),
// as do upstream errors and timeouts — never throw, never leak upstream error
// text. The pair link is the `url` DEX Screener returns, used VERBATIM; we
// never construct or guess a pair path. 30-second in-module cache per address.

import "server-only";
import { getAddress } from "viem";

const DEXSCREENER_BASE = "https://api.dexscreener.com";
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

interface RawPair {
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

/**
 * Choose the pair with the highest `liquidity.usd`. Pairs without a usable
 * `url` are skipped entirely — the link must come verbatim from the API.
 * Pairs with an explicit liquidity value (even 0) outrank unknown liquidity.
 */
function pickBestPair(pairs: unknown): RawPair | null {
  if (!Array.isArray(pairs)) return null;
  let best: RawPair | null = null;
  let bestLiquidity = Number.NEGATIVE_INFINITY;
  for (const candidate of pairs) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const raw = candidate as RawPair;
    if (typeof raw.url !== "string" || raw.url === "") continue;
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
 * Fetch the best DEX Screener pair for `tokenAddress`. Returns null when the
 * token is not yet indexed (empty/missing `pairs`), on invalid input, or on
 * any upstream error/timeout — callers render null as "DEX Screener
 * indexing…". Never throws. Successful lookups are cached for 30 seconds
 * (keyed by lowercase address); null results are not cached so indexing is
 * picked up promptly.
 */
export async function fetchDexScreenerPair(tokenAddress: string): Promise<DexScreenerPair | null> {
  let address: string;
  try {
    // Validate + checksum before the address ever reaches a URL.
    address = getAddress(tokenAddress);
  } catch {
    return null;
  }
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.pair;
  try {
    const res = await fetch(`${DEXSCREENER_BASE}/latest/dex/tokens/${address}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { pairs?: unknown } | null;
    const raw = pickBestPair(j?.pairs);
    if (raw === null || typeof raw.url !== "string" || raw.url === "") return null;
    const pair = mapPair(raw, raw.url);
    cache.set(key, { pair, fetchedAt: Date.now() });
    return pair;
  } catch {
    // Swallow upstream/timeout errors — never leak them to callers.
    return null;
  }
}
