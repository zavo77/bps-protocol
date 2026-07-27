// Item #11: prove a synthetic provenance_verified row is picked up by a RUNNING
// indexer without restart, then removed cleanly. Read-only on the RPC; DB writes
// are the single synthetic row + its removal. Values never printed.
/* global console, process, fetch */
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "..",
  "..",
  "..",
);
const env = {};
for (const line of readFileSync(path.join(ROOT, "apps", "web", ".env.local"), "utf8").split(
  /\r?\n/,
)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const HEALTH = process.argv[2] || "http://127.0.0.1:8796/health";
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
// A synthetic token/pool: use a real launched external token's pool so poolId
// resolves, but mark it a SYNTHETIC verified row (removed at the end). We use a
// clearly-fake token address that won't collide.
const SYNTH = "0x00000000000000000000000000000000deadbeef";
const NUM = "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3";
const HOOK = "0x9982538f41f2ae29ddb9d3d9307010052984fdbb";
const getHealth = async () => await (await fetch(HEALTH)).json();
try {
  const before = await getHealth();
  console.log(`before: trackedMarkets=${before.trackedMarkets} knownPools=${before.knownPools}`);
  await pool.query(
    `INSERT INTO lab_launches (token_address, numeraire, anchor_symbol, pool_or_hook, launch_tx, block_number, launched_at, launch_source, provenance_verified, provenance_verified_at, manifest_hash, pool_id)
     VALUES ($1,$2,'GOOGL',$3,$4,'0',now(),'synthetic-test',true,now(),'0xsynthetic','0xabababababababababababababababababababababababababababababababab')
     ON CONFLICT (token_address) DO UPDATE SET provenance_verified=true, pool_id=EXCLUDED.pool_id`,
    [SYNTH, NUM, HOOK, "0x" + "11".repeat(32)],
  );
  console.log("inserted synthetic provenance_verified row (with pool_id set)");
  // Wait up to ~40s for the running indexer to reload markets (poll interval 15s).
  let picked = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const h = await getHealth();
    if (Number(h.trackedMarkets) >= Number(before.trackedMarkets) + 1) {
      console.log(
        `PICKED UP WITHOUT RESTART: trackedMarkets=${h.trackedMarkets} knownPools=${h.knownPools}`,
      );
      picked = true;
      break;
    }
  }
  if (!picked) console.log("NOT picked up within window");
  // Remove cleanly.
  await pool.query(`DELETE FROM lab_swaps WHERE token_address = $1`, [SYNTH]);
  await pool.query(
    `DELETE FROM lab_launches WHERE token_address = $1 AND launch_source = 'synthetic-test'`,
    [SYNTH],
  );
  console.log("removed synthetic row");
  // Confirm it drops back.
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const h = await getHealth();
    if (Number(h.trackedMarkets) === Number(before.trackedMarkets)) {
      console.log(`DROPPED AFTER REMOVAL: trackedMarkets=${h.trackedMarkets}`);
      break;
    }
  }
  console.log(picked ? "SYNTHETIC_TEST_PASS" : "SYNTHETIC_TEST_FAIL");
  process.exit(picked ? 0 : 1);
} catch (e) {
  console.error(
    "synthetic test failed:",
    String(e?.message ?? e)
      .split(env.DATABASE_URL)
      .join("[DB]"),
  );
  process.exit(1);
} finally {
  await pool.end().catch(() => {});
}
