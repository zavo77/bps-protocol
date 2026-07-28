// Launch persistence + guardrail accounting.
//
// AUTHORITATIVE SOURCE = provenance-verified BPS rows in Postgres
// (lab_launches WHERE provenance_verified = true), written only after the BPS
// frontend's receipt matches a manifest THIS server issued. The chain is NEVER
// used to classify a market as BPS (an approved anchor + the generic Doppler
// initializer is not a BPS fingerprint). When the DB is unavailable there is no
// authoritative registry, so reads return empty rather than misclassify.

import "server-only";
import { getAddress, type Address } from "viem";
import type { LabServerFlags, LaunchRecord } from "@bps/launch-lab";

const CACHE_TTL_MS = 60_000;
let launchCache: { at: number; records: LaunchRecord[] } | null = null;

export type PgPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};
let pgPool: PgPool | null | undefined;

export async function getPg(): Promise<PgPool | null> {
  if (pgPool !== undefined) return pgPool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    pgPool = null;
    return null;
  }
  try {
    const pg = await import("pg");
    const pool = new pg.Pool({ connectionString: url, max: 3 }) as unknown as PgPool;
    await pool.query(`CREATE TABLE IF NOT EXISTS lab_launches (
      token_address TEXT PRIMARY KEY,
      token_name TEXT NOT NULL DEFAULT '',
      token_symbol TEXT NOT NULL DEFAULT '',
      creator TEXT,
      numeraire TEXT NOT NULL,
      pool_or_hook TEXT NOT NULL,
      launch_tx TEXT NOT NULL,
      block_number TEXT NOT NULL,
      launched_at TIMESTAMPTZ,
      inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await pool.query(`ALTER TABLE lab_launches ADD COLUMN IF NOT EXISTS anchor_symbol TEXT`);
    // Provenance: only BPS-frontend receipt-verified rows are authoritative.
    // Existing (externally-discovered) rows default to provenance_verified=false
    // and are excluded from every public query.
    await pool.query(`ALTER TABLE lab_launches ADD COLUMN IF NOT EXISTS launch_source TEXT`);
    await pool.query(
      `ALTER TABLE lab_launches ADD COLUMN IF NOT EXISTS provenance_verified BOOLEAN NOT NULL DEFAULT false`,
    );
    await pool.query(
      `ALTER TABLE lab_launches ADD COLUMN IF NOT EXISTS provenance_verified_at TIMESTAMPTZ`,
    );
    await pool.query(`ALTER TABLE lab_launches ADD COLUMN IF NOT EXISTS manifest_hash TEXT`);
    await pool.query(`ALTER TABLE lab_launches ADD COLUMN IF NOT EXISTS launch_manifest JSONB`);
    // Issued-manifest ledger: every /api/lab/prepare records its predicted token
    // + creator. A launch is BPS only if its created token matches an issued
    // prediction by the same creator — external Doppler markets never do.
    await pool.query(`CREATE TABLE IF NOT EXISTS lab_prepared (
      predicted_token TEXT PRIMARY KEY,
      creator TEXT NOT NULL,
      manifest_hash TEXT NOT NULL,
      anchor_symbol TEXT,
      numeraire TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await pool.query(`ALTER TABLE lab_prepared ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ`);
    await pool.query(`CREATE TABLE IF NOT EXISTS lab_used_signatures (
      sig_hash TEXT PRIMARY KEY,
      used_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    pgPool = pool;
  } catch {
    pgPool = null; // fail open to chain reconstruction, never to a crash
  }
  return pgPool;
}

/**
 * Authoritative BPS market list = provenance-verified rows only. The chain is
 * NEVER used to CLASSIFY a market as BPS (an approved anchor + the generic
 * Doppler initializer is not a BPS fingerprint); it only ever ENRICHES rows the
 * BPS frontend already verified. When the DB is unavailable there is no
 * authoritative registry, so we return an empty list rather than misclassify.
 */
export async function listLaunches(): Promise<LaunchRecord[]> {
  if (launchCache && Date.now() - launchCache.at < CACHE_TTL_MS) return launchCache.records;
  const pg = await getPg();
  if (!pg) {
    launchCache = { at: Date.now(), records: [] };
    return [];
  }
  let records: LaunchRecord[] = [];
  try {
    const res = await pg.query(
      `SELECT token_address, token_name, token_symbol, creator, numeraire, anchor_symbol,
              pool_or_hook, launch_tx, block_number, EXTRACT(EPOCH FROM launched_at)::bigint AS ts
       FROM lab_launches
       WHERE provenance_verified = true
       ORDER BY launched_at DESC NULLS LAST`,
    );
    records = (res.rows as Record<string, unknown>[]).map((r) => ({
      tokenAddress: getAddress(String(r.token_address)),
      tokenName: String(r.token_name ?? ""),
      tokenSymbol: String(r.token_symbol ?? ""),
      creator: r.creator ? getAddress(String(r.creator)) : null,
      numeraire: getAddress(String(r.numeraire)),
      anchorSymbol: r.anchor_symbol ? String(r.anchor_symbol) : null,
      poolOrHook: getAddress(String(r.pool_or_hook)),
      launchTransactionHash: String(r.launch_tx) as LaunchRecord["launchTransactionHash"],
      blockNumber: String(r.block_number),
      timestamp: r.ts !== null && r.ts !== undefined ? Number(r.ts) : null,
    }));
  } catch {
    records = launchCache?.records ?? [];
  }
  launchCache = { at: Date.now(), records };
  return records;
}

/** Record an issued BPS manifest prediction (called by /api/lab/prepare). */
export async function recordPreparedLaunch(args: {
  predictedToken: string;
  creator: string;
  manifestHash: string;
  anchorSymbol: string;
  numeraire: string;
}): Promise<void> {
  const pg = await getPg();
  if (!pg) return;
  try {
    await pg.query(
      `INSERT INTO lab_prepared (predicted_token, creator, manifest_hash, anchor_symbol, numeraire)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (predicted_token) DO UPDATE SET creator = EXCLUDED.creator, manifest_hash = EXCLUDED.manifest_hash, created_at = now()`,
      [
        args.predictedToken.toLowerCase(),
        args.creator.toLowerCase(),
        args.manifestHash,
        args.anchorSymbol,
        args.numeraire.toLowerCase(),
      ],
    );
  } catch {
    // non-fatal: a missing issued row just means the launch can't be verified
  }
}

export interface VerifiedLaunchInsert {
  tokenAddress: string;
  creator: string;
  numeraire: string;
  anchorSymbol: string | null;
  poolOrHook: string;
  launchTx: string;
  blockNumber: string;
  timestamp: number | null;
  manifestHash: string;
  tokenName?: string;
  tokenSymbol?: string;
  /** Immutable per-launch facts (hash-validated against the issued manifest). */
  launchManifest?: Record<string, unknown> | null;
}

/**
 * Insert a provenance-verified BPS launch (called by /api/lab/launches after
 * the server matched the created token to an issued manifest). Returns true
 * if a row was inserted or already present.
 */
export async function insertVerifiedLaunch(rec: VerifiedLaunchInsert): Promise<boolean> {
  const pg = await getPg();
  if (!pg) return false;
  try {
    await pg.query(
      `INSERT INTO lab_launches
         (token_address, token_name, token_symbol, creator, numeraire, anchor_symbol, pool_or_hook,
          launch_tx, block_number, launched_at, launch_source, provenance_verified, provenance_verified_at, manifest_hash, launch_manifest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10),'bps-web',true,now(),$11,$12::jsonb)
       ON CONFLICT (token_address) DO UPDATE SET
         provenance_verified = true, launch_source = 'bps-web', provenance_verified_at = now(),
         manifest_hash = COALESCE(lab_launches.manifest_hash, EXCLUDED.manifest_hash),
         anchor_symbol = COALESCE(lab_launches.anchor_symbol, EXCLUDED.anchor_symbol),
         launch_manifest = COALESCE(lab_launches.launch_manifest, EXCLUDED.launch_manifest)`,
      [
        rec.tokenAddress.toLowerCase(),
        rec.tokenName ?? "",
        rec.tokenSymbol ?? "",
        rec.creator.toLowerCase(),
        rec.numeraire.toLowerCase(),
        rec.anchorSymbol,
        rec.poolOrHook.toLowerCase(),
        rec.launchTx,
        rec.blockNumber,
        rec.timestamp,
        rec.manifestHash,
        rec.launchManifest ? JSON.stringify(rec.launchManifest) : null,
      ],
    );
    invalidateLaunchCache();
    return true;
  } catch {
    return false;
  }
}

/** True if a token is already a provenance-verified BPS launch (idempotency). */
export async function isTokenVerified(tokenAddress: string): Promise<boolean> {
  const pg = await getPg();
  if (!pg) return false;
  try {
    const res = await pg.query(
      `SELECT 1 FROM lab_launches WHERE token_address = $1 AND provenance_verified = true`,
      [tokenAddress.toLowerCase()],
    );
    return res.rows.length > 0;
  } catch {
    return false;
  }
}

/** Look up an UNCONSUMED issued manifest prediction by created token + creator. */
export async function matchIssuedManifest(
  tokenAddress: string,
  creator: string,
): Promise<{ manifestHash: string; anchorSymbol: string | null; numeraire: string | null } | null> {
  const pg = await getPg();
  if (!pg) return null;
  try {
    const res = await pg.query(
      `SELECT manifest_hash, anchor_symbol, numeraire FROM lab_prepared
       WHERE predicted_token = $1 AND creator = $2 AND consumed_at IS NULL`,
      [tokenAddress.toLowerCase(), creator.toLowerCase()],
    );
    const row = res.rows[0] as
      { manifest_hash?: string; anchor_symbol?: string; numeraire?: string } | undefined;
    if (!row) return null;
    return {
      manifestHash: String(row.manifest_hash),
      anchorSymbol: row.anchor_symbol ? String(row.anchor_symbol) : null,
      numeraire: row.numeraire ? String(row.numeraire) : null,
    };
  } catch {
    return null;
  }
}

/** Mark an issued manifest single-use once its launch is verified. */
export async function consumeIssuedManifest(tokenAddress: string): Promise<void> {
  const pg = await getPg();
  if (!pg) return;
  try {
    await pg.query(
      `UPDATE lab_prepared SET consumed_at = now() WHERE predicted_token = $1 AND consumed_at IS NULL`,
      [tokenAddress.toLowerCase()],
    );
  } catch {
    // non-fatal
  }
}

export function invalidateLaunchCache(): void {
  launchCache = null;
}

/** Uniform guardrails for EVERY wallet — no exceptions, no special paths. */
export async function enforceLaunchGuardrails(
  wallet: Address,
  flags: LabServerFlags,
): Promise<void> {
  const records = await listLaunches();
  const mine = records.filter((r) => r.creator?.toLowerCase() === wallet.toLowerCase());
  if (mine.length >= flags.maxLaunchesPerWallet) throw new Error("LIMIT_WALLET_MAX");
  const now = Math.floor(Date.now() / 1000);
  const newest = mine.reduce<number>((acc, r) => Math.max(acc, r.timestamp ?? 0), 0);
  if (newest > 0 && now - newest < flags.launchCooldownSeconds) throw new Error("LIMIT_COOLDOWN");
  const dayStart = Math.floor(Date.now() / 86_400_000) * 86_400;
  const today = records.filter((r) => (r.timestamp ?? 0) >= dayStart).length;
  if (today >= flags.publicDailyLaunchCap) throw new Error("LIMIT_DAILY_CAP");
}

export async function countLaunchesToday(): Promise<number | null> {
  try {
    const records = await listLaunches();
    const dayStart = Math.floor(Date.now() / 86_400_000) * 86_400;
    return records.filter((r) => (r.timestamp ?? 0) >= dayStart).length;
  } catch {
    return null;
  }
}

// ---- replay protection (memory always; Postgres when configured) ----
const usedSignatures = new Map<string, number>();

export async function assertSignatureUnused(sigHash: string, ttlMs: number): Promise<void> {
  const now = Date.now();
  for (const [k, t] of usedSignatures) if (now - t > ttlMs * 2) usedSignatures.delete(k);
  if (usedSignatures.has(sigHash)) throw new Error("AUTH_REPLAY");
  const pg = await getPg();
  if (pg) {
    try {
      const res = await pg.query(
        `INSERT INTO lab_used_signatures (sig_hash) VALUES ($1) ON CONFLICT DO NOTHING RETURNING sig_hash`,
        [sigHash],
      );
      if (res.rows.length === 0) throw new Error("AUTH_REPLAY");
    } catch (e) {
      if (e instanceof Error && e.message === "AUTH_REPLAY") throw e;
      // DB unavailable → memory-only protection (per-instance) still applies
    }
  }
  usedSignatures.set(sigHash, now);
}

// ---- indexed swap history (read-only view over the indexer's lab_swaps) ----
export interface IndexedSwap {
  id: string;
  poolId: string;
  blockNumber: string;
  txHash: string;
  amount0: string;
  amount1: string;
  sqrtPriceX96: string;
  tick: number;
  fee: number;
  occurredAt: string | null;
}

/** Recent swaps for a token from the indexer's table; null when the DB view is unavailable. */
export async function getRecentSwaps(token: string, limit = 200): Promise<IndexedSwap[] | null> {
  const pg = await getPg();
  if (!pg) return null;
  try {
    const res = await pg.query(
      `SELECT id, pool_id, block_number, tx_hash, amount0, amount1, sqrt_price_x96, tick, fee, occurred_at
       FROM lab_swaps WHERE token_address = $1 ORDER BY block_number DESC, id DESC LIMIT $2`,
      [token.toLowerCase(), Math.min(Math.max(limit, 1), 500)],
    );
    return (res.rows as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      poolId: String(r.pool_id),
      blockNumber: String(r.block_number),
      txHash: String(r.tx_hash),
      amount0: String(r.amount0),
      amount1: String(r.amount1),
      sqrtPriceX96: String(r.sqrt_price_x96),
      tick: Number(r.tick),
      fee: Number(r.fee),
      occurredAt: r.occurred_at ? new Date(r.occurred_at as string).toISOString() : null,
    }));
  } catch {
    return null;
  }
}

/** Single launch record by token address (chain-reconstructed list). */
export async function getLaunchRecord(token: string): Promise<LaunchRecord | null> {
  const records = await listLaunches();
  return records.find((r) => r.tokenAddress.toLowerCase() === token.toLowerCase()) ?? null;
}

/** Markets created by a wallet (creator == launch tx sender). */
export async function getCreatorMarkets(wallet: string): Promise<LaunchRecord[]> {
  const records = await listLaunches();
  return records.filter((r) => r.creator?.toLowerCase() === wallet.toLowerCase());
}

/**
 * Swap counts + gross movement per token from indexed swaps (for the list view).
 * Per-market anchor-denominated volume uses getAnchorVolume with the resolved
 * PoolKey ordering. Returns null when the DB view is unavailable.
 */
export async function getVolumeByToken(
  tokens: string[],
): Promise<Map<string, { swaps: number; gross: bigint }> | null> {
  const pg = await getPg();
  if (!pg) return null;
  if (tokens.length === 0) return new Map();
  try {
    const lowered = tokens.map((t) => t.toLowerCase());
    const res = await pg.query(
      `SELECT token_address, COUNT(*) AS n, COALESCE(SUM(abs(amount0) + abs(amount1)),0) AS gross
       FROM lab_swaps WHERE token_address = ANY($1) GROUP BY token_address`,
      [lowered],
    );
    const map = new Map<string, { swaps: number; gross: bigint }>();
    for (const row of res.rows as { token_address: string; n: string; gross: string }[]) {
      map.set(row.token_address.toLowerCase(), {
        swaps: Number(row.n),
        gross: BigInt(row.gross ?? "0"),
      });
    }
    return map;
  } catch {
    return null;
  }
}

/** Anchor-denominated volume for one token (sum of |anchor-side amount|). */
export async function getAnchorVolume(
  token: string,
  anchorIsCurrency0: boolean,
): Promise<string | null> {
  const pg = await getPg();
  if (!pg) return null;
  try {
    const col = anchorIsCurrency0 ? "amount0" : "amount1";
    const res = await pg.query(
      `SELECT COALESCE(SUM(abs(${col})),0) AS vol FROM lab_swaps WHERE token_address = $1`,
      [token.toLowerCase()],
    );
    return String((res.rows[0] as { vol?: string })?.vol ?? "0");
  } catch {
    return null;
  }
}

/** Health probe: SELECT 1. Throws (sanitized upstream) on any failure. */
export async function pingDatabase(): Promise<void> {
  const pg = await getPg();
  if (!pg) throw new Error("db-unavailable");
  await pg.query("SELECT 1");
}
