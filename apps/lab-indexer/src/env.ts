// Environment access + redaction. Secrets are never logged; every log line
// passes through redact().

const SECRET_NAMES = ["DATABASE_URL", "ROBINHOOD_CHAIN_RPC_URL", "SENTRY_DSN"] as const;

export interface IndexerEnv {
  databaseUrl: string;
  rpcUrl: string;
  port: number;
  startBlock: bigint;
  pollMs: number;
  chunkBlocks: bigint;
  confirmations: bigint;
  sentryDsn: string | null;
  sentryEnvironment: string;
}

export function readEnv(): IndexerEnv {
  const missing: string[] = [];
  const need = (n: string): string => {
    const v = process.env[n];
    if (!v || v.trim() === "") {
      missing.push(n);
      return "";
    }
    return v.trim();
  };
  const databaseUrl = need("DATABASE_URL");
  const rpcUrl = need("ROBINHOOD_CHAIN_RPC_URL");
  if (missing.length > 0)
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  const int = (n: string, d: number): number => {
    const raw = process.env[n];
    if (!raw || raw.trim() === "") return d;
    const v = Number(raw);
    return Number.isInteger(v) && v >= 0 ? v : d;
  };
  return {
    databaseUrl,
    rpcUrl,
    port: int("PORT", 8080),
    startBlock: BigInt(int("BPS_LAB_INDEXER_START_BLOCK", 20_150_000)),
    pollMs: int("BPS_LAB_INDEXER_POLL_MS", 15_000),
    chunkBlocks: BigInt(int("BPS_LAB_INDEXER_CHUNK_BLOCKS", 2_000)),
    confirmations: BigInt(int("BPS_LAB_INDEXER_CONFIRMATIONS", 3)),
    sentryDsn: process.env.SENTRY_DSN?.trim() || null,
    sentryEnvironment: process.env.SENTRY_ENVIRONMENT?.trim() || "production",
  };
}

/** Strip every secret value from a string before it reaches a log or Sentry. */
export function redact(input: unknown): string {
  let s = String(input);
  for (const name of SECRET_NAMES) {
    const v = process.env[name];
    if (v && v.trim() !== "") s = s.split(v.trim()).join(`[${name}]`);
  }
  return s.replace(/https?:\/\/[^\s"']+/g, "[url]");
}

export function log(msg: string): void {
  console.log(`${new Date().toISOString()} ${redact(msg)}`);
}

export function logError(msg: string, e?: unknown): void {
  const detail =
    e instanceof Error
      ? ((e as { shortMessage?: string }).shortMessage ?? e.message)
      : String(e ?? "");
  console.error(
    `${new Date().toISOString()} ERROR ${redact(msg)}${detail ? ` — ${redact(detail).slice(0, 300)}` : ""}`,
  );
}
