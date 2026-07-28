// Server-side token metadata resolver (server-only, read-only). Resolves a
// lab token's metadata JSON from its tokenUri: (1) the immutable proven
// launch_manifest.tokenUri on the provenance-verified launch row, else (2)
// the on-chain tokenURI() read. ipfs:// URIs resolve through public HTTPS
// gateways; plain https:// URIs are fetched directly; every other scheme is
// rejected. Display-only telemetry: every failure resolves to
// { available:false } with nulls — never throw to the client, never leak
// upstream error text, and NEVER serve artwork belonging to a different
// token (there is no shared/default artwork fallback here). Successful
// lookups are cached in-module for ~10 minutes per token.

import "server-only";
import { getAddress } from "viem";
import { getLabClient } from "./server";
import { getPg } from "./store";

const CACHE_TTL_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 6_000;
const MAX_METADATA_BYTES = 512 * 1024;
// No reusable read-gateway constant exists in the repo (Pinata is only used
// for authenticated uploads), so resolve through public gateways: Pinata's
// public gateway first, ipfs.io as fallback.
const IPFS_GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/"] as const;

export interface TokenMetadata {
  available: boolean;
  name: string | null;
  description: string | null;
  /** https URL on an allowed IPFS gateway or the metadata's own https host. */
  imageUrl: string | null;
  tokenUri: string | null;
  source: "token-uri" | null;
  fetchedAt: number;
}

const cache = new Map<string, TokenMetadata>();

/** Test hook: drop all cached metadata. */
export function __clearTokenMetadataCache(): void {
  cache.clear();
}

function unavailable(): TokenMetadata {
  return {
    available: false,
    name: null,
    description: null,
    imageUrl: null,
    tokenUri: null,
    source: null,
    fetchedAt: Date.now(),
  };
}

/** CID[/path] from an ipfs:// URI, or null when malformed/unsafe. */
function ipfsPath(uri: string): string | null {
  if (!uri.startsWith("ipfs://")) return null;
  const rest = uri.slice("ipfs://".length).replace(/^ipfs\//, "");
  return /^[A-Za-z0-9]{10,}(\/[A-Za-z0-9._-]+)*$/.test(rest) ? rest : null;
}

/**
 * Candidate HTTPS URLs for a tokenUri. ipfs:// fans out across the allowed
 * gateways; https:// passes through verbatim; any other scheme yields none.
 * Each candidate remembers its gateway base so the image resolves through
 * the SAME gateway that served the metadata.
 */
function candidateUrls(uri: string): { url: string; gatewayBase: string }[] {
  const path = ipfsPath(uri);
  if (path !== null) return IPFS_GATEWAYS.map((g) => ({ url: g + path, gatewayBase: g }));
  if (uri.startsWith("https://")) return [{ url: uri, gatewayBase: IPFS_GATEWAYS[0] }];
  return [];
}

/** ipfs:// → gateway URL; https:// passes; anything else → null. */
function resolveImageUrl(image: unknown, gatewayBase: string): string | null {
  if (typeof image !== "string" || image === "") return null;
  if (image.startsWith("https://")) return image;
  const path = ipfsPath(image);
  return path !== null ? gatewayBase + path : null;
}

function toStringOrNull(raw: unknown): string | null {
  return typeof raw === "string" && raw !== "" ? raw : null;
}

/**
 * tokenUri source order: (1) the provenance-verified launch row's immutable
 * launch_manifest.tokenUri, (2) the on-chain tokenURI() read. Null when
 * neither yields a URI. Never throws.
 */
async function resolveTokenUri(tokenLc: string): Promise<string | null> {
  try {
    const pg = await getPg();
    if (pg) {
      const res = await pg.query(
        `SELECT launch_manifest FROM lab_launches
         WHERE lower(token_address) = $1 AND provenance_verified = true`,
        [tokenLc],
      );
      const manifest = (res.rows[0] as { launch_manifest?: unknown } | undefined)?.launch_manifest;
      if (typeof manifest === "object" && manifest !== null) {
        const uri = (manifest as Record<string, unknown>).tokenUri;
        if (typeof uri === "string" && uri !== "") return uri;
      }
    }
  } catch {
    // DB unavailable — fall through to the chain read.
  }
  try {
    const uri = await getLabClient().readContract({
      address: getAddress(tokenLc),
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
    });
    return typeof uri === "string" && uri !== "" ? uri : null;
  } catch {
    // The token does not expose tokenURI() (or the read failed).
    return null;
  }
}

/** GET the metadata JSON with a timeout and size cap; null on any failure. */
async function fetchMetadataJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const declared = Number(res.headers?.get?.("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_METADATA_BYTES) return null;
    const text = await res.text();
    if (text.length > MAX_METADATA_BYTES) return null;
    return JSON.parse(text) as unknown;
  } catch {
    // Swallow upstream/timeout/parse errors — never leak them to callers.
    return null;
  }
}

/**
 * Resolve the metadata (name/description/image) for a lab token from its own
 * tokenUri. Never throws: invalid input, a missing URI, a rejected scheme,
 * and every upstream failure all resolve to { available:false } with nulls.
 * Successful results are cached ~10 minutes per token (failures are not
 * cached so recovery is fast).
 */
export async function fetchTokenMetadata(tokenAddressRaw: string): Promise<TokenMetadata> {
  let address: string;
  try {
    address = getAddress(tokenAddressRaw);
  } catch {
    return unavailable();
  }
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;
  try {
    const tokenUri = await resolveTokenUri(key);
    if (tokenUri === null) return unavailable();
    for (const candidate of candidateUrls(tokenUri)) {
      const json = await fetchMetadataJson(candidate.url);
      if (typeof json !== "object" || json === null || Array.isArray(json)) continue;
      const meta = json as Record<string, unknown>;
      const result: TokenMetadata = {
        available: true,
        name: toStringOrNull(meta.name),
        description: toStringOrNull(meta.description),
        imageUrl: resolveImageUrl(meta.image, candidate.gatewayBase),
        tokenUri,
        source: "token-uri",
        fetchedAt: Date.now(),
      };
      cache.set(key, result);
      return result;
    }
    return unavailable();
  } catch {
    // Defense in depth: nothing above should throw, but never let it out.
    return unavailable();
  }
}
