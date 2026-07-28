// Blockscout holder-count adapter (server-only, read-only). Fetches the ERC-20
// holder count for a token on Robinhood Chain (4663) from the official
// Blockscout v2 API. Display-only telemetry: a missing count is NOT a failure —
// we fail gracefully to `holderCount: null` and never surface upstream error
// text to callers. Responses are cached in-module for 30 seconds per address.

import "server-only";
import { getAddress } from "viem";

const BLOCKSCOUT_BASE = "https://robinhoodchain.blockscout.com";
const CACHE_TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 6_000;

export interface HolderInfo {
  holderCount: number | null;
  source: "blockscout";
  fetchedAt: number;
}

const cache = new Map<string, HolderInfo>();

/** Test hook: drop all cached holder counts. */
export function __clearHolderCache(): void {
  cache.clear();
}

/** Read one field off an unknown JSON payload without asserting its shape. */
function pick(obj: unknown, field: string): unknown {
  if (typeof obj !== "object" || obj === null) return undefined;
  return (obj as Record<string, unknown>)[field];
}

/** Blockscout returns counters as strings ("42") or numbers; accept both. */
function parseCount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

/** GET a Blockscout JSON payload; null on any error, timeout, or non-2xx. */
async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    // Swallow upstream/timeout errors — never leak them to callers.
    return null;
  }
}

async function readHolderCount(address: string): Promise<number | null> {
  // Primary: official token counters endpoint (token_holders_count).
  const counters = await fetchJson(`${BLOCKSCOUT_BASE}/api/v2/tokens/${address}/counters`);
  const fromCounters = parseCount(pick(counters, "token_holders_count"));
  if (fromCounters !== null) return fromCounters;
  // Fallback: token detail endpoint exposes a `holders` field.
  const token = await fetchJson(`${BLOCKSCOUT_BASE}/api/v2/tokens/${address}`);
  return parseCount(pick(token, "holders"));
}

/**
 * Fetch the holder count for `tokenAddress` from Blockscout. Never throws:
 * invalid input, upstream errors, and timeouts all resolve to
 * `{ holderCount: null }`. Successful lookups are cached for 30 seconds
 * (keyed by lowercase address); failures are not cached so recovery is fast.
 */
export async function fetchHolderCount(tokenAddress: string): Promise<HolderInfo> {
  let address: string;
  try {
    // Validate + checksum before the address ever reaches a URL.
    address = getAddress(tokenAddress);
  } catch {
    return { holderCount: null, source: "blockscout", fetchedAt: Date.now() };
  }
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;
  const holderCount = await readHolderCount(address);
  const info: HolderInfo = { holderCount, source: "blockscout", fetchedAt: Date.now() };
  if (holderCount !== null) cache.set(key, info);
  return info;
}
