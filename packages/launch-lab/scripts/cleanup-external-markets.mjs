// TARGETED cleanup of externally-created (non-BPS) rows misclassified before the
// provenance hotfix. FOUNDER-APPROVAL GATED and DRY-RUN by default. Never uses
// broad DELETE/TRUNCATE/table resets — it deletes ONLY specific token addresses
// that are provably external (provenance_verified = false / null AND no matching
// issued manifest). RPC/DB values never printed.
//
//   node packages/launch-lab/scripts/cleanup-external-markets.mjs            # dry run
//   node packages/launch-lab/scripts/cleanup-external-markets.mjs --apply    # after founder approval
/* global console, process */

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
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
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
try {
  // External = not provenance-verified AND no issued manifest for that token.
  const external = await pool.query(
    `SELECT l.token_address
     FROM lab_launches l
     LEFT JOIN lab_prepared p ON p.predicted_token = l.token_address
     WHERE COALESCE(l.provenance_verified, false) = false AND p.predicted_token IS NULL`,
  );
  const verified = await pool.query(
    `SELECT COUNT(*) AS n FROM lab_launches WHERE provenance_verified = true`,
  );
  console.log(`verified BPS rows (kept): ${verified.rows[0].n}`);
  console.log(`external rows to remove: ${external.rows.length}`);
  for (const r of external.rows) console.log(`  - ${r.token_address}`);

  if (!APPLY) {
    console.log("DRY RUN — no rows deleted. Re-run with --apply after founder approval.");
  } else {
    let removed = 0;
    for (const r of external.rows) {
      // Delete swaps for the row first (FK-free but keep the DB tidy), then the
      // row itself — one explicit token address at a time. No broad statements.
      await pool.query(`DELETE FROM lab_swaps WHERE token_address = $1`, [r.token_address]);
      const res = await pool.query(
        `DELETE FROM lab_launches WHERE token_address = $1 AND COALESCE(provenance_verified,false) = false`,
        [r.token_address],
      );
      removed += res.rowCount ?? 0;
    }
    console.log(`APPLIED — removed ${removed} external rows (verified BPS rows untouched).`);
  }
} catch (e) {
  console.error(
    "cleanup failed:",
    String(e?.message ?? e)
      .split(env.DATABASE_URL)
      .join("[DB]"),
  );
  process.exit(1);
} finally {
  await pool.end().catch(() => {});
}
