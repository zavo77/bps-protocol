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

export async function setCursor(pool: pg.Pool, stream: string, block: bigint): Promise<void> {
  await pool.query(
    `INSERT INTO lab_indexer_cursor (stream, last_block, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (stream) DO UPDATE SET last_block = EXCLUDED.last_block, updated_at = now()`,
    [stream, block.toString()],
  );
}
