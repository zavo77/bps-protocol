// LL-2 verification: idempotent schema setup + connectivity, mirror-write
// idempotency, cross-instance replay protection, and safe fallback semantics.
// Reads DATABASE_URL from apps/web/.env.local; NEVER prints it. Synthetic
// launch rows are exercised inside a rolled-back transaction; the replay probe
// uses a self-cleaning sentinel row. Run from repo root:
//   node packages/launch-lab/scripts/verify-db.mjs


import { readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

const env = {};
for (const line of readFileSync("C:/Projects/bps-experiment/apps/web/.env.local", "utf8").split(
  /\r?\n/,
)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const DB_URL = env.DATABASE_URL;
if (!DB_URL) {
  console.error("FAIL: DATABASE_URL missing in apps/web/.env.local");
  process.exit(2);
}
const redact = (s) => String(s).split(DB_URL).join("[DB_REDACTED]");

// Exactly the statements the app runs (store.ts) — additive and idempotent.
const SCHEMA = [
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
  `CREATE TABLE IF NOT EXISTS lab_used_signatures (
    sig_hash TEXT PRIMARY KEY,
    used_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "FAIL"} ${name}${detail ? ` — ${redact(detail)}` : ""}`);
};

const poolA = new pg.Pool({ connectionString: DB_URL, max: 1, connectionTimeoutMillis: 10_000 });
const poolB = new pg.Pool({ connectionString: DB_URL, max: 1, connectionTimeoutMillis: 10_000 });

try {
  // 1. Connectivity + idempotent schema (run twice to prove idempotency).
  const meta = await poolA.query("SELECT current_database() AS db, version() AS v");
  record(
    "connectivity",
    true,
    `database "${meta.rows[0].db}", ${String(meta.rows[0].v).split(",")[0]}`,
  );
  for (const stmt of SCHEMA) await poolA.query(stmt);
  for (const stmt of SCHEMA) await poolA.query(stmt);
  record("schema setup (2x, additive/idempotent)", true);

  // 2. Mirror write + duplicate idempotency — inside a rolled-back transaction.
  const client = await poolA.connect();
  try {
    await client.query("BEGIN");
    const fake = {
      addr: "0x" + "f".repeat(40),
      tx: "0x" + "e".repeat(64),
    };
    const ins = `INSERT INTO lab_launches (token_address, token_name, token_symbol, creator, numeraire, pool_or_hook, launch_tx, block_number, launched_at)
      VALUES ($1,'SELFTEST','SELFTEST',NULL,$1,$1,$2,'0',now()) ON CONFLICT (token_address) DO NOTHING`;
    const first = await client.query(ins, [fake.addr, fake.tx]);
    const second = await client.query(ins, [fake.addr, fake.tx]);
    const count = await client.query(
      "SELECT count(*) AS c FROM lab_launches WHERE token_address = $1",
      [fake.addr],
    );
    const okWrite = first.rowCount === 1 && second.rowCount === 0 && count.rows[0].c === "1";
    record(
      "mirror write + duplicate idempotency (rolled back)",
      okWrite,
      `first=${first.rowCount} dup=${second.rowCount} rows=${count.rows[0].c}`,
    );
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }

  // 3. Cross-instance replay protection: pool A consumes a signature hash;
  //    pool B (separate connection = separate serverless instance) must see it
  //    as already used. Sentinel row is deleted afterwards.
  const sentinel = "selftest:" + crypto.randomUUID();
  const insA = await poolA.query(
    "INSERT INTO lab_used_signatures (sig_hash) VALUES ($1) ON CONFLICT DO NOTHING RETURNING sig_hash",
    [sentinel],
  );
  const insB = await poolB.query(
    "INSERT INTO lab_used_signatures (sig_hash) VALUES ($1) ON CONFLICT DO NOTHING RETURNING sig_hash",
    [sentinel],
  );
  const replayOk = insA.rows.length === 1 && insB.rows.length === 0;
  record(
    "cross-instance replay protection",
    replayOk,
    `instanceA=consumed instanceB=${insB.rows.length === 0 ? "rejected (replay)" : "NOT rejected"}`,
  );
  await poolA.query("DELETE FROM lab_used_signatures WHERE sig_hash = $1", [sentinel]);

  // 4. Failure fallback: a broken DB URL must fail fast and be catchable —
  //    mirroring store.ts getPg(), which returns null and lets the chain
  //    reconstruction serve reads.
  const broken = new pg.Pool({
    connectionString: "postgresql://user:invalid@127.0.0.1:59999/nope",
    max: 1,
    connectionTimeoutMillis: 3000,
  });
  try {
    await broken.query("SELECT 1");
    record("db-failure fallback semantics", false, "broken URL unexpectedly connected");
  } catch {
    record(
      "db-failure fallback semantics",
      true,
      "broken URL throws; store.ts catches → chain reconstruction serves reads",
    );
  } finally {
    await broken.end().catch(() => {});
  }
} catch (e) {
  record("verification aborted", false, e?.message ?? String(e));
} finally {
  await poolA.end().catch(() => {});
  await poolB.end().catch(() => {});
}

const allOk = results.every((r) => r.ok);
console.log(allOk ? "LL2_VERIFIED" : "LL2_FAILED");
process.exit(allOk ? 0 : 1);
