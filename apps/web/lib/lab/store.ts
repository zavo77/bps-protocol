// Launch persistence + guardrail accounting.
//
// AUTHORITATIVE SOURCE = provenance-verified BPS rows in Postgres
// (lab_launches WHERE provenance_verified = true), written only after the BPS
// frontend's receipt matches a manifest THIS server issued. The chain is NEVER
// used to classify a market as BPS (an approved anchor + the generic Doppler
// initializer is not a BPS fingerprint). When the DB is unavailable there is no
// authoritative registry, so reads return empty rather than misclassify.

import "server-only";
import { getAddress, keccak256, type Address, type Hex } from "viem";
import type { LabServerFlags, LaunchRecord } from "@bps/launch-lab";

const CACHE_TTL_MS = 60_000;
let launchCache: { at: number; records: LaunchRecord[] } | null = null;

export type PgPoolClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  release: () => void;
};
export type PgPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  /** Present on real pg pools; required by the atomic registration path. */
  connect?: () => Promise<PgPoolClient>;
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
    // P0.2 exact-provenance columns (all additive). provenance_version=2 rows
    // carry the FULL prepared-transaction facts (target, raw calldata + its
    // server-computed hash, value, canonical manifest, validity window).
    // Legacy rows (provenance_version NULL or != 2) can NEVER verify a launch.
    await pool.query(`ALTER TABLE lab_prepared ADD COLUMN IF NOT EXISTS provenance_version INT`);
    await pool.query(`ALTER TABLE lab_prepared ADD COLUMN IF NOT EXISTS chain_id INT`);
    await pool.query(`ALTER TABLE lab_prepared ADD COLUMN IF NOT EXISTS transaction_target TEXT`);
    await pool.query(`ALTER TABLE lab_prepared ADD COLUMN IF NOT EXISTS transaction_data TEXT`);
    await pool.query(`ALTER TABLE lab_prepared ADD COLUMN IF NOT EXISTS calldata_hash TEXT`);
    await pool.query(`ALTER TABLE lab_prepared ADD COLUMN IF NOT EXISTS transaction_value TEXT`);
    await pool.query(`ALTER TABLE lab_prepared ADD COLUMN IF NOT EXISTS launch_manifest JSONB`);
    await pool.query(`ALTER TABLE lab_prepared ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE lab_prepared ADD COLUMN IF NOT EXISTS consumed_by_tx TEXT`);
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

/**
 * Record an issued BPS launch preparation (called by /api/lab/prepare) as an
 * IMMUTABLE provenance_version=2 row: prepared transaction target, raw
 * calldata, SERVER-computed keccak256 calldata hash, value, the FULL canonical
 * manifest (JSONB) and a 60-minute validity window. Provenance fields are
 * never updated on conflict: an identical re-prepare is an idempotent no-op
 * (only the validity window refreshes); any difference throws
 * "PREPARED_CONFLICT" (mapped to 409 by the prepare route).
 */
export type RecordPreparedResult =
  | { status: "inserted" }
  | {
      /** An identical preparation already exists (parallel duplicate, retry,
       *  reload). The caller MUST return this STORED manifest + hash so the
       *  same review keeps one immutable manifest identity. */
      status: "existing";
      storedManifest: Record<string, unknown>;
      storedManifestHash: string;
    };

export async function recordPreparedLaunch(args: {
  predictedToken: string;
  creator: string;
  manifestHash: string;
  anchorSymbol: string;
  numeraire: string;
  chainId: number;
  transactionTarget: string;
  /** Raw prepared calldata (hex). Its keccak256 becomes calldata_hash. */
  transactionData: string;
  /** Decimal string of the prepared transaction value. */
  transactionValue: string;
  /** FULL canonical manifest — the only source of launch facts at registration. */
  launchManifest: Record<string, unknown>;
}): Promise<RecordPreparedResult> {
  const pg = await getPg();
  // FAIL CLOSED: without a durable provenance record the preparation must not
  // be handed to a wallet — the launch could never be verified.
  if (!pg) throw new Error("REGISTRY_UNAVAILABLE");
  const token = args.predictedToken.toLowerCase();
  const calldataHash = keccak256(args.transactionData as Hex);
  try {
    const inserted = await pg.query(
      `INSERT INTO lab_prepared
         (predicted_token, creator, manifest_hash, anchor_symbol, numeraire,
          provenance_version, chain_id, transaction_target, transaction_data,
          calldata_hash, transaction_value, launch_manifest, valid_until)
       VALUES ($1,$2,$3,$4,$5,2,$6,$7,$8,$9,$10,$11::jsonb, now() + interval '60 minutes')
       ON CONFLICT (predicted_token) DO NOTHING
       RETURNING predicted_token`,
      [
        token,
        args.creator.toLowerCase(),
        args.manifestHash,
        args.anchorSymbol,
        args.numeraire.toLowerCase(),
        args.chainId,
        args.transactionTarget.toLowerCase(),
        args.transactionData,
        calldataHash,
        args.transactionValue,
        JSON.stringify(args.launchManifest),
      ],
    );
    if (inserted.rows.length > 0) return { status: "inserted" }; // fresh immutable row written
    // Conflict (parallel duplicate / retry / reload of the SAME review — the
    // calldata builder is deterministic, so predicted_token IS the canonical
    // preparation identity). Idempotent ONLY when every EXECUTION fact matches
    // exactly; the caller must then return the STORED manifest so the same
    // review keeps ONE immutable manifest hash (original createdAt preserved).
    const existing = await pg.query(
      `SELECT creator, manifest_hash, transaction_target, calldata_hash,
              transaction_value, chain_id, consumed_at, launch_manifest
       FROM lab_prepared WHERE predicted_token = $1`,
      [token],
    );
    const row = existing.rows[0] as
      | {
          creator?: string;
          manifest_hash?: string;
          transaction_target?: string;
          calldata_hash?: string;
          transaction_value?: string;
          chain_id?: number | string;
          consumed_at?: unknown;
          launch_manifest?: unknown;
        }
      | undefined;
    if (!row) throw new Error("REGISTRY_UNAVAILABLE"); // conflict yet no row readable
    const identical =
      String(row.creator ?? "").toLowerCase() === args.creator.toLowerCase() &&
      String(row.transaction_target ?? "").toLowerCase() ===
        args.transactionTarget.toLowerCase() &&
      String(row.calldata_hash ?? "").toLowerCase() === calldataHash.toLowerCase() &&
      String(row.transaction_value ?? "") === args.transactionValue &&
      Number(row.chain_id ?? Number.NaN) === args.chainId;
    if (!identical) throw new Error("PREPARED_CONFLICT");
    // A consumed identity already registered a launch — it can never be reused.
    if (row.consumed_at !== null && row.consumed_at !== undefined) {
      throw new Error("PREPARED_CONFLICT");
    }
    const storedManifest =
      row.launch_manifest && typeof row.launch_manifest === "object"
        ? (row.launch_manifest as Record<string, unknown>)
        : null;
    const storedManifestHash = String(row.manifest_hash ?? "");
    if (!storedManifest || !storedManifestHash) throw new Error("REGISTRY_UNAVAILABLE");
    // Identical re-prepare: only the validity window refreshes.
    await pg.query(
      `UPDATE lab_prepared SET valid_until = now() + interval '60 minutes'
       WHERE predicted_token = $1 AND consumed_at IS NULL`,
      [token],
    );
    return { status: "existing", storedManifest, storedManifestHash };
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === "PREPARED_CONFLICT" || e.message === "REGISTRY_UNAVAILABLE")
    ) {
      throw e;
    }
    // ANY other persistence error fails closed — never hand out a
    // transaction whose provenance record is not durable.
    throw new Error("REGISTRY_UNAVAILABLE");
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
}

export interface PreparedLaunchRow {
  predictedToken: string;
  creator: string;
  manifestHash: string;
  anchorSymbol: string | null;
  numeraire: string | null;
  provenanceVersion: number | null;
  chainId: number | null;
  transactionTarget: string | null;
  transactionData: string | null;
  calldataHash: string | null;
  transactionValue: string | null;
  launchManifest: Record<string, unknown> | null;
  /** Unix seconds; null when unavailable. */
  createdAtEpoch: number | null;
  /** Unix seconds; null on legacy rows. */
  validUntilEpoch: number | null;
  consumed: boolean;
}

/** Load the full issued-preparation row for a predicted token (any version). */
export async function getPreparedLaunch(predictedToken: string): Promise<PreparedLaunchRow | null> {
  const pg = await getPg();
  if (!pg) return null;
  try {
    const res = await pg.query(
      `SELECT predicted_token, creator, manifest_hash, anchor_symbol, numeraire,
              provenance_version, chain_id, transaction_target, transaction_data,
              calldata_hash, transaction_value, launch_manifest,
              EXTRACT(EPOCH FROM created_at)::bigint AS created_epoch,
              EXTRACT(EPOCH FROM valid_until)::bigint AS valid_until_epoch,
              consumed_at
       FROM lab_prepared WHERE predicted_token = $1`,
      [predictedToken.toLowerCase()],
    );
    const r = res.rows[0];
    if (!r) return null;
    const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
    return {
      predictedToken: String(r.predicted_token),
      creator: String(r.creator),
      manifestHash: String(r.manifest_hash),
      anchorSymbol: r.anchor_symbol ? String(r.anchor_symbol) : null,
      numeraire: r.numeraire ? String(r.numeraire) : null,
      provenanceVersion: num(r.provenance_version),
      chainId: num(r.chain_id),
      transactionTarget: r.transaction_target ? String(r.transaction_target) : null,
      transactionData: r.transaction_data ? String(r.transaction_data) : null,
      calldataHash: r.calldata_hash ? String(r.calldata_hash) : null,
      transactionValue:
        r.transaction_value === null || r.transaction_value === undefined
          ? null
          : String(r.transaction_value),
      launchManifest:
        r.launch_manifest && typeof r.launch_manifest === "object"
          ? (r.launch_manifest as Record<string, unknown>)
          : null,
      createdAtEpoch: num(r.created_epoch),
      validUntilEpoch: num(r.valid_until_epoch),
      consumed: r.consumed_at !== null && r.consumed_at !== undefined,
    };
  } catch {
    return null;
  }
}

/** Extend an unconsumed preparation's validity window (stale re-simulation). */
export async function refreshPreparedValidity(predictedToken: string): Promise<void> {
  const pg = await getPg();
  if (!pg) return;
  try {
    await pg.query(
      `UPDATE lab_prepared SET valid_until = now() + interval '60 minutes'
       WHERE predicted_token = $1 AND consumed_at IS NULL`,
      [predictedToken.toLowerCase()],
    );
  } catch {
    // non-fatal: staleness simply is not extended
  }
}

export type AtomicRegistrationResult =
  | { status: "registered" }
  | { status: "already-registered" }
  | {
      status: "failed";
      code:
        | "DB_UNAVAILABLE"
        | "PREPARED_NOT_FOUND"
        | "PREPARED_CONSUMED"
        | "UNVERIFIED_PROVENANCE"
        | "PREPARED_EXPIRED"
        | "PROVENANCE_MISMATCH"
        | "LAUNCH_ROW_CONFLICT"
        | "REGISTRATION_FAILED";
    };

/** Decoded on-chain facts re-checked INSIDE the registration transaction
 *  against the locked prepared row — the authoritative comparison. */
export interface ExpectedLaunchFacts {
  creator: string;
  transactionTarget: string;
  calldataHash: string;
  transactionValue: string;
  chainId: number;
  /** The Airlock Create event's numeraire — must equal the STORED manifest's anchorAddress. */
  eventNumeraire: string;
  /** Launch block timestamp (unix seconds). */
  blockTimestamp: number;
}

/** Immutable launch facts built EXCLUSIVELY from the manifest read under the
 *  registration row lock — the client can never influence them. */
function factsFromLockedManifest(
  m: Record<string, unknown>,
  manifestHash: string,
): Record<string, unknown> {
  return {
    source: "registration",
    manifestHash,
    startingFdvUsd: m.startingFdvUsdFixed,
    feePreset: m.feePreset,
    exactPoolFeeUnits: m.exactPoolFeeUnits,
    creatorFeeAddress:
      typeof m.creatorFeeAddress === "string" ? m.creatorFeeAddress.toLowerCase() : null,
    beneficiaries: m.beneficiaries,
    tokenUri: m.tokenUri,
    anchorSymbol: m.anchorSymbol,
    initialSupplyWei: m.initialSupply,
    saleInventoryWei: m.saleInventory,
  };
}

/**
 * ONE atomic DB operation for registration: lock the prepared row FOR UPDATE,
 * re-verify it inside the transaction (unconsumed, provenance_version=2, block
 * timestamp inside the validity window), insert the provenance-verified
 * lab_launches row, and consume the preparation (consumed_at + consumed_by_tx)
 * — all in a single BEGIN/COMMIT. ANY failure rolls back BOTH effects: a
 * failed insert can never consume the preparation. A concurrent second caller
 * serializes on the row lock, finds consumed_at set, and receives the
 * idempotent already-registered result when the token is verified.
 */
export async function registerVerifiedLaunchAtomic(
  rec: VerifiedLaunchInsert,
  expected: ExpectedLaunchFacts,
  launchTx: string,
): Promise<AtomicRegistrationResult> {
  const pg = await getPg();
  if (!pg || typeof pg.connect !== "function") {
    return { status: "failed", code: "DB_UNAVAILABLE" };
  }
  const token = rec.tokenAddress.toLowerCase();
  let client: PgPoolClient;
  try {
    client = await pg.connect();
  } catch {
    return { status: "failed", code: "DB_UNAVAILABLE" };
  }
  const rollback = async (): Promise<void> => {
    try {
      await client.query("ROLLBACK");
    } catch {
      // connection-level failure — nothing was committed
    }
  };
  try {
    await client.query("BEGIN");
    // Lock and read EVERY v2 fact — the in-transaction comparison below is the
    // authoritative check; anything the route verified earlier is re-verified
    // here against the locked row.
    const res = await client.query(
      `SELECT creator, manifest_hash, provenance_version, chain_id,
              transaction_target, calldata_hash, transaction_value, launch_manifest,
              EXTRACT(EPOCH FROM created_at)::bigint AS created_epoch,
              EXTRACT(EPOCH FROM valid_until)::bigint AS valid_until_epoch,
              consumed_at, consumed_by_tx
       FROM lab_prepared WHERE predicted_token = $1 FOR UPDATE`,
      [token],
    );
    const row = res.rows[0] as
      | {
          creator?: string | null;
          manifest_hash?: string | null;
          provenance_version?: number | string | null;
          chain_id?: number | string | null;
          transaction_target?: string | null;
          calldata_hash?: string | null;
          transaction_value?: string | null;
          launch_manifest?: unknown;
          created_epoch?: number | string | null;
          valid_until_epoch?: number | string | null;
          consumed_at?: unknown;
          consumed_by_tx?: string | null;
        }
      | undefined;
    if (!row) {
      await rollback();
      return { status: "failed", code: "PREPARED_NOT_FOUND" };
    }
    if (row.consumed_at !== null && row.consumed_at !== undefined) {
      // Concurrent/second registration: the preparation is already consumed.
      // Idempotent success ONLY when the token really is provenance-verified.
      const verified = await client.query(
        `SELECT 1 FROM lab_launches WHERE token_address = $1 AND provenance_verified = true`,
        [token],
      );
      await rollback(); // nothing to change either way
      return verified.rows.length > 0
        ? { status: "already-registered" }
        : { status: "failed", code: "PREPARED_CONSUMED" };
    }
    if (Number(row.provenance_version) !== 2) {
      await rollback();
      return { status: "failed", code: "UNVERIFIED_PROVENANCE" };
    }
    // EXACT fact comparison under the lock: sender, target, calldata hash,
    // value, chain, manifest hash, and the Create event's numeraire vs the
    // STORED manifest anchor. Any mismatch rolls back.
    const storedManifest =
      row.launch_manifest && typeof row.launch_manifest === "object"
        ? (row.launch_manifest as Record<string, unknown>)
        : null;
    const storedAnchor =
      storedManifest && typeof storedManifest.anchorAddress === "string"
        ? storedManifest.anchorAddress.toLowerCase()
        : null;
    const factsMatch =
      String(row.creator ?? "").toLowerCase() === expected.creator.toLowerCase() &&
      String(row.manifest_hash ?? "") === rec.manifestHash &&
      Number(row.chain_id ?? Number.NaN) === expected.chainId &&
      String(row.transaction_target ?? "").toLowerCase() ===
        expected.transactionTarget.toLowerCase() &&
      String(row.calldata_hash ?? "").toLowerCase() === expected.calldataHash.toLowerCase() &&
      String(row.transaction_value ?? "") === expected.transactionValue &&
      storedManifest !== null &&
      storedAnchor !== null &&
      storedAnchor === expected.eventNumeraire.toLowerCase();
    if (!factsMatch) {
      await rollback();
      return { status: "failed", code: "PROVENANCE_MISMATCH" };
    }
    const ts = expected.blockTimestamp;
    const validUntil =
      row.valid_until_epoch === null || row.valid_until_epoch === undefined
        ? null
        : Number(row.valid_until_epoch);
    const createdAt =
      row.created_epoch === null || row.created_epoch === undefined
        ? null
        : Number(row.created_epoch);
    if (validUntil === null || ts > validUntil || (createdAt !== null && ts < createdAt)) {
      await rollback();
      return { status: "failed", code: "PREPARED_EXPIRED" };
    }
    // Launch facts come from the manifest READ UNDER THIS LOCK.
    const facts = factsFromLockedManifest(storedManifest, String(row.manifest_hash));
    // SAFE conflict handling: never blind-promote an existing lab_launches row.
    const insertRes = await client.query(
      `INSERT INTO lab_launches
         (token_address, token_name, token_symbol, creator, numeraire, anchor_symbol, pool_or_hook,
          launch_tx, block_number, launched_at, launch_source, provenance_verified, provenance_verified_at, manifest_hash, launch_manifest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10),'bps-web',true,now(),$11,$12::jsonb)
       ON CONFLICT (token_address) DO NOTHING
       RETURNING token_address`,
      [
        token,
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
        JSON.stringify(facts),
      ],
    );
    if (insertRes.rows.length === 0) {
      // A row already exists for this token. It may only be adopted when every
      // immutable fact matches EXACTLY — provenance_verified can never flip to
      // true on a conflicting row.
      const existing = await client.query(
        `SELECT creator, numeraire, pool_or_hook, launch_tx, provenance_verified
         FROM lab_launches WHERE token_address = $1 FOR UPDATE`,
        [token],
      );
      const ex = existing.rows[0] as
        | {
            creator?: string | null;
            numeraire?: string | null;
            pool_or_hook?: string | null;
            launch_tx?: string | null;
            provenance_verified?: boolean | null;
          }
        | undefined;
      const sameLaunch =
        ex !== undefined &&
        String(ex.launch_tx ?? "").toLowerCase() === rec.launchTx.toLowerCase() &&
        String(ex.creator ?? "").toLowerCase() === rec.creator.toLowerCase() &&
        String(ex.numeraire ?? "").toLowerCase() === rec.numeraire.toLowerCase() &&
        String(ex.pool_or_hook ?? "").toLowerCase() === rec.poolOrHook.toLowerCase();
      if (!sameLaunch) {
        await rollback();
        return { status: "failed", code: "LAUNCH_ROW_CONFLICT" };
      }
      await client.query(
        `UPDATE lab_launches SET
           provenance_verified = true, launch_source = 'bps-web', provenance_verified_at = now(),
           manifest_hash = COALESCE(manifest_hash, $2),
           anchor_symbol = COALESCE(anchor_symbol, $3),
           launch_manifest = COALESCE(launch_manifest, $4::jsonb)
         WHERE token_address = $1`,
        [token, rec.manifestHash, rec.anchorSymbol, JSON.stringify(facts)],
      );
    }
    await client.query(
      `UPDATE lab_prepared SET consumed_at = now(), consumed_by_tx = $2 WHERE predicted_token = $1`,
      [token, launchTx],
    );
    await client.query("COMMIT");
    invalidateLaunchCache();
    return { status: "registered" };
  } catch {
    await rollback();
    return { status: "failed", code: "REGISTRATION_FAILED" };
  } finally {
    client.release();
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
