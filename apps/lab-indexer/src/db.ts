// Postgres access + additive, idempotent migrations. Shares lab_launches with
// the web app's mirror (identical DDL) and owns the indexer-specific tables.

import pg from "pg";

/** Every statement is CREATE/ALTER IF NOT EXISTS — safe to run repeatedly. */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS lab_launches (
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
  )`,
  `ALTER TABLE lab_launches ADD COLUMN IF NOT EXISTS pool_id TEXT`,
  `ALTER TABLE lab_launches ADD COLUMN IF NOT EXISTS anchor_symbol TEXT`,
  // Provenance: only BPS-frontend receipt-verified rows are indexed.
  `ALTER TABLE lab_launches ADD COLUMN IF NOT EXISTS launch_source TEXT`,
  `ALTER TABLE lab_launches ADD COLUMN IF NOT EXISTS provenance_verified BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE lab_launches ADD COLUMN IF NOT EXISTS provenance_verified_at TIMESTAMPTZ`,
  `ALTER TABLE lab_launches ADD COLUMN IF NOT EXISTS launch_manifest JSONB`,
  `ALTER TABLE lab_launches ADD COLUMN IF NOT EXISTS manifest_hash TEXT`,
  `CREATE TABLE IF NOT EXISTS lab_prepared (
    predicted_token TEXT PRIMARY KEY,
    creator TEXT NOT NULL,
    manifest_hash TEXT NOT NULL,
    anchor_symbol TEXT,
    numeraire TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE lab_prepared ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ`,
  `CREATE TABLE IF NOT EXISTS lab_used_signatures (
    sig_hash TEXT PRIMARY KEY,
    used_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS lab_indexer_cursor (
    stream TEXT PRIMARY KEY,
    last_block BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS lab_swaps (
    id TEXT PRIMARY KEY,
    pool_id TEXT NOT NULL,
    token_address TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    tx_hash TEXT NOT NULL,
    amount0 NUMERIC NOT NULL,
    amount1 NUMERIC NOT NULL,
    sqrt_price_x96 NUMERIC NOT NULL,
    tick INTEGER NOT NULL,
    fee INTEGER NOT NULL,
    occurred_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS lab_swaps_pool_block ON lab_swaps (pool_id, block_number)`,
  `CREATE INDEX IF NOT EXISTS lab_swaps_token_block ON lab_swaps (token_address, block_number)`,
  `ALTER TABLE lab_swaps ADD COLUMN IF NOT EXISTS event_sender TEXT`,
  `ALTER TABLE lab_swaps ADD COLUMN IF NOT EXISTS transaction_from TEXT`,
  // Per-pool sync state: a newly verified market backfills its own swap history
  // from its launch block up to the global cursor before the global scan owns it.
  `CREATE TABLE IF NOT EXISTS lab_pool_sync (
    pool_id TEXT PRIMARY KEY,
    token_address TEXT NOT NULL,
    start_block BIGINT NOT NULL,
    last_indexed_block BIGINT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('backfilling','current')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
] as const;

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 15_000 });
}

export async function runMigrations(pool: pg.Pool): Promise<void> {
  for (const stmt of MIGRATIONS) await pool.query(stmt);
}

export async function getCursor(pool: pg.Pool, stream: string): Promise<bigint | null> {
  const res = await pool.query("SELECT last_block FROM lab_indexer_cursor WHERE stream = $1", [
    stream,
  ]);
  const row = res.rows[0] as { last_block?: string | number } | undefined;
  return row?.last_block !== undefined ? BigInt(row.last_block) : null;
}

export interface TrackedMarket {
  tokenAddress: string;
  numeraire: string;
  poolOrHook: string;
  poolId: string | null;
  /** Launch block from lab_launches.block_number (null if unparsable). */
  blockNumber: bigint | null;
}

/** Load provenance-verified BPS markets — the ONLY markets the indexer tracks. */
export async function loadTrackedMarkets(pool: pg.Pool): Promise<TrackedMarket[]> {
  const res = await pool.query(
    `SELECT token_address, numeraire, pool_or_hook, pool_id, block_number
     FROM lab_launches WHERE provenance_verified = true`,
  );
  return (res.rows as Record<string, string | null>[]).map((r) => {
    let blockNumber: bigint | null = null;
    if (r.block_number !== null && r.block_number !== undefined) {
      try {
        blockNumber = BigInt(String(r.block_number));
      } catch {
        blockNumber = null;
      }
    }
    return {
      tokenAddress: String(r.token_address),
      numeraire: String(r.numeraire),
      poolOrHook: String(r.pool_or_hook),
      poolId: r.pool_id ? String(r.pool_id) : null,
      blockNumber,
    };
  });
}

/** Enrich a verified market with its resolved poolId (never classifies). */
export async function setMarketPoolId(
  pool: pg.Pool,
  tokenAddress: string,
  poolId: string,
): Promise<void> {
  await pool.query(
    `UPDATE lab_launches SET pool_id = $2 WHERE token_address = $1 AND pool_id IS NULL`,
    [tokenAddress.toLowerCase(), poolId],
  );
}

export async function setCursor(pool: pg.Pool, stream: string, block: bigint): Promise<void> {
  await pool.query(
    `INSERT INTO lab_indexer_cursor (stream, last_block, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (stream) DO UPDATE SET last_block = EXCLUDED.last_block, updated_at = now()`,
    [stream, block.toString()],
  );
}

export interface PoolSyncRow {
  poolId: string;
  tokenAddress: string;
  startBlock: bigint;
  lastIndexedBlock: bigint;
  state: "backfilling" | "current";
}

/** All per-pool sync rows (restart-safe backfill bookkeeping). */
export async function loadPoolSync(pool: pg.Pool): Promise<PoolSyncRow[]> {
  const res = await pool.query(
    `SELECT pool_id, token_address, start_block, last_indexed_block, state FROM lab_pool_sync`,
  );
  return (res.rows as Record<string, string | number>[]).map((r) => ({
    poolId: String(r.pool_id),
    tokenAddress: String(r.token_address),
    startBlock: BigInt(String(r.start_block)),
    lastIndexedBlock: BigInt(String(r.last_indexed_block)),
    state: String(r.state) === "current" ? "current" : "backfilling",
  }));
}

/** Register a pool's sync row once; never overwrites existing progress. */
export async function registerPoolSync(pool: pg.Pool, row: PoolSyncRow): Promise<void> {
  await pool.query(
    `INSERT INTO lab_pool_sync (pool_id, token_address, start_block, last_indexed_block, state, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (pool_id) DO NOTHING`,
    [
      row.poolId,
      row.tokenAddress.toLowerCase(),
      row.startBlock.toString(),
      row.lastIndexedBlock.toString(),
      row.state,
    ],
  );
}

/** Persist backfill progress / state transition for a pool. */
export async function setPoolSyncProgress(
  pool: pg.Pool,
  poolId: string,
  lastIndexedBlock: bigint,
  state: "backfilling" | "current",
): Promise<void> {
  await pool.query(
    `UPDATE lab_pool_sync SET last_indexed_block = $2, state = $3, updated_at = now()
     WHERE pool_id = $1`,
    [poolId, lastIndexedBlock.toString(), state],
  );
}
