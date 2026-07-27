// Launch Lab web health checks — pure and dependency-injected so tests never
// need live services. The route wires real deps. Responses contain ONLY
// category strings (never error messages, URLs, or credentials), so nothing
// secret can leak even when a dependency throws secret-laden errors.

import type { LabServerFlags } from "@bps/launch-lab";

export interface HealthDeps {
  /** Resolve the RPC chain id. */
  getChainId: () => Promise<number>;
  /** SELECT 1 against Postgres; undefined when DATABASE_URL is not configured. */
  dbPing?: (() => Promise<void>) | undefined;
  /** Required Pinata env vars present (booleans only, values never read here). */
  pinataConfigured: boolean;
  /** Parsed feature flags; the thrower propagates config failures. */
  readFlags: () => LabServerFlags;
  /** Short, non-secret source commit. */
  commit: string;
  /** Per-dependency timeout in ms. */
  timeoutMs?: number;
}

export interface HealthBody {
  status: "ok" | "unhealthy";
  service: "bps-launch-lab-web";
  chainId: 4663;
  rpc: "ok" | "wrong-chain" | "timeout" | "error";
  database: "ok" | "error" | "timeout" | "not-configured";
  pinataConfigured: boolean;
  accessMode: string;
  broadcastEnabled: boolean;
  killSwitchActive: boolean;
  configOk: boolean;
  commit: string;
  checkedAt: string;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Launch-critical: config parses, RPC responds with chain 4663, Pinata vars
 * present, and (when configured) Postgres answers SELECT 1. The kill switch
 * and broadcast flags are OPERATING STATES, not failures — a fail-closed lab
 * is a healthy lab.
 */
export async function runHealthChecks(
  deps: HealthDeps,
): Promise<{ httpStatus: 200 | 503; body: HealthBody }> {
  const timeoutMs = deps.timeoutMs ?? 5_000;
  const checkedAt = new Date().toISOString();

  let flags: LabServerFlags | null = null;
  try {
    flags = deps.readFlags();
  } catch {
    flags = null;
  }

  let rpc: HealthBody["rpc"] = "error";
  try {
    const id = await withTimeout(deps.getChainId(), timeoutMs);
    rpc = id === 4663 ? "ok" : "wrong-chain";
  } catch (e) {
    rpc = e instanceof Error && e.message === "timeout" ? "timeout" : "error";
  }

  let database: HealthBody["database"] = "not-configured";
  if (deps.dbPing) {
    try {
      await withTimeout(deps.dbPing(), timeoutMs);
      database = "ok";
    } catch (e) {
      database = e instanceof Error && e.message === "timeout" ? "timeout" : "error";
    }
  }

  const configOk = flags !== null && flags.enabled;
  const healthy =
    configOk &&
    rpc === "ok" &&
    deps.pinataConfigured &&
    (database === "ok" || database === "not-configured");

  const body: HealthBody = {
    status: healthy ? "ok" : "unhealthy",
    service: "bps-launch-lab-web",
    chainId: 4663,
    rpc,
    database,
    pinataConfigured: deps.pinataConfigured,
    accessMode: flags?.accessMode ?? "unknown",
    broadcastEnabled: flags?.broadcastEnabled ?? false,
    killSwitchActive: flags?.killSwitchActive ?? true,
    configOk,
    commit: deps.commit,
    checkedAt,
  };
  return { httpStatus: healthy ? 200 : 503, body };
}
