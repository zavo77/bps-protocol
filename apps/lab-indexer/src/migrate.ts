// Pre-deploy entrypoint: run the additive/idempotent migrations and exit.

import { createPool, runMigrations } from "./db.js";
import { log, logError, readEnv } from "./env.js";

const env = readEnv();
const pool = createPool(env.databaseUrl);
try {
  await runMigrations(pool);
  log("migrations complete (additive/idempotent)");
  process.exit(0);
} catch (e) {
  logError("migration failed", e);
  process.exit(1);
} finally {
  await pool.end().catch(() => {});
}
