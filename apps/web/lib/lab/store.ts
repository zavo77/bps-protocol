// Launch persistence + guardrail accounting.
//
// Authority: the chain (listLaunchesOnChain). When DATABASE_URL is configured
// a Postgres mirror accelerates reads and strengthens replay/duplicate
// protection across serverless instances; when it is absent everything still
// works from on-chain reconstruction (per founder rule: Postgres is a mirror,
// chain reconstruction is the fallback and the authority).

import "server-only";
import { CHAIN_IDS, getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { listLaunchesOnChain, type LabServerFlags, type LaunchRecord } from "@bps/launch-lab";
import type { Address } from "viem";
import { getLabClient } from "./server";

const CACHE_TTL_MS = 60_000;
let launchCache: { at: number; records: LaunchRecord[] } | null = null;

type PgPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};
let pgPool: PgPool | null | undefined;

async function getPg(): Promise<PgPool | null> {
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

export async function listLaunches(): Promise<LaunchRecord[]> {
  if (launchCache && Date.now() - launchCache.at < CACHE_TTL_MS) return launchCache.records;
  const a = getAddresses(CHAIN_IDS.ROBINHOOD) as unknown as {
    airlock: Address;
    dopplerHookInitializer: Address;
  };
  let records: LaunchRecord[] = [];
  try {
    records = await listLaunchesOnChain(getLabClient(), {
      airlock: a.airlock,
      initializer: a.dopplerHookInitializer,
      maxRecords: 100,
    });
  } catch {
    records = launchCache?.records ?? [];
  }
  const pg = await getPg();
  if (pg) {
    try {
      for (const r of records) {
        await pg.query(
          `INSERT INTO lab_launches (token_address, token_name, token_symbol, creator, numeraire, pool_or_hook, launch_tx, block_number, launched_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9))
           ON CONFLICT (token_address) DO NOTHING`,
          [
            r.tokenAddress.toLowerCase(),
            r.tokenName,
            r.tokenSymbol,
            r.creator?.toLowerCase() ?? null,
            r.numeraire.toLowerCase(),
            r.poolOrHook.toLowerCase(),
            r.launchTransactionHash,
            r.blockNumber,
            r.timestamp,
          ],
        );
      }
    } catch {
      // mirror failure is non-fatal
    }
  }
  launchCache = { at: Date.now(), records };
  return records;
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

/** Health probe: SELECT 1. Throws (sanitized upstream) on any failure. */
export async function pingDatabase(): Promise<void> {
  const pg = await getPg();
  if (!pg) throw new Error("db-unavailable");
  await pg.query("SELECT 1");
}
