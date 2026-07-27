// Service entrypoint: optional Sentry, migrations (idempotent belt-and-braces
// on top of the pre-deploy command), health server, poll loop.

import { createPool, runMigrations } from "./db.js";
import { makeClient } from "./chain.js";
import { loadKnownPools, startLoop, status } from "./indexer.js";
import { startHealthServer } from "./health.js";
import { log, logError, readEnv, redact } from "./env.js";

const env = readEnv();

if (env.sentryDsn) {
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: env.sentryDsn,
      environment: env.sentryEnvironment,
      beforeSend(event) {
        // Redact secrets from anything Sentry would transmit.
        if (event.message) event.message = redact(event.message);
        for (const ex of event.exception?.values ?? []) {
          if (ex.value) ex.value = redact(ex.value);
        }
        return event;
      },
    });
    log("sentry enabled");
  } catch (e) {
    logError("sentry init failed (continuing without it)", e);
  }
}

const pool = createPool(env.databaseUrl);
await runMigrations(pool);
status.dbOk = true;
await loadKnownPools(pool);
log(`resume state: knownPools=${status.knownPools}`);

const client = makeClient(env.rpcUrl);
startHealthServer(env.port);
log(`health server listening on 0.0.0.0:${env.port} (/health)`);

const timer = startLoop(client, pool, env);

const shutdown = async (signal: string): Promise<void> => {
  log(`${signal} received; shutting down`);
  clearInterval(timer);
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
