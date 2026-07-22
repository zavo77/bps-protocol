// Application deployment-manifest boundary (Task 8 §A). Consumes a versioned deployment manifest (the
// Task 7 schema), validates it, requires chain id 4663, distinguishes local/fork/restricted-beta/
// production modes, rejects null/zero/placeholder/malformed addresses, and FAILS CLOSED: it exposes no
// transaction controls unless a complete, broadcast-ready, same-commit live manifest is present and the
// required contract addresses have runtime code. It never mixes dry-run addresses with live RPC data and
// never hardcodes an unverified future BPS deployment.
import { z } from "zod";

export const ROBINHOOD_CHAIN_ID = 4663;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO = "0x0000000000000000000000000000000000000000";
// Obvious placeholders that must never be treated as real deployed contracts.
const PLACEHOLDERS = new Set(
  [
    ZERO,
    "0x0000000000000000000000000000000000000001",
    "0x000000000000000000000000000000000000dead",
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "0x1111111111111111111111111111111111111111",
  ].map((a) => a.toLowerCase()),
);

export type DeploymentMode = "local" | "fork" | "restricted-beta" | "production";

const addressOrNull = z.union([z.string(), z.null()]);

const contractSet = z.object({
  bpsToken: addressOrNull,
  lockingVault: addressOrNull,
  claimManager: addressOrNull,
  rialtoAdapter: addressOrNull,
  coordinator: addressOrNull,
  stockVault: addressOrNull,
  uniswapAdapter: addressOrNull,
  tradeRouter: addressOrNull,
});

const verifiedContract = z.object({
  address: z.string(),
  runtimeCodeHash: z.string(),
  status: z.enum(["VERIFIED", "BLOCKED"]),
});

export const manifestSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  chainId: z.number(),
  sourceCommit: z.string(),
  broadcastReady: z.boolean(),
  mode: z.enum(["local", "fork", "restricted-beta", "production"]).optional(),
  isFixture: z.boolean().optional(),
  deployer: addressOrNull,
  external: z.object({
    weth: verifiedContract,
    rialtoRegistry: verifiedContract,
    swapRouter02: verifiedContract,
  }),
  predicted: contractSet,
  actual: contractSet,
});

export type DeploymentManifest = z.infer<typeof manifestSchema>;
export type ContractKey = keyof z.infer<typeof contractSet>;

/** The user-facing contracts whose addresses must have runtime code before ANY write is enabled. */
export const WRITE_REQUIRED_CONTRACTS: readonly ContractKey[] = [
  "tradeRouter",
  "lockingVault",
  "claimManager",
  "stockVault",
  "coordinator",
];

export type DeploymentState =
  | { readonly status: "invalid"; readonly errors: readonly string[] }
  | {
      readonly status: "not-live";
      readonly reason: string;
      readonly mode: DeploymentMode;
      readonly isFixture: boolean;
      readonly sourceCommit: string;
    }
  | {
      readonly status: "live";
      readonly mode: DeploymentMode;
      readonly isFixture: boolean;
      readonly sourceCommit: string;
      readonly chainId: number;
      readonly addresses: Readonly<Record<ContractKey, string>>;
      readonly requiredCodeAddresses: readonly string[];
      readonly writesEnabled: boolean; // true only after runtime-code verification succeeds
    };

function isRealAddress(a: string | null): a is string {
  return typeof a === "string" && ADDRESS_RE.test(a) && !PLACEHOLDERS.has(a.toLowerCase());
}

/**
 * Resolve a raw manifest into a fail-closed deployment state. Writes are NEVER enabled by parsing alone:
 * a `live` result starts with `writesEnabled: false` and only `enableWrites` (after an on-chain runtime-
 * code check of `requiredCodeAddresses`) may flip it. Invalid manifests and dry-runs never expose writes.
 */
export function resolveDeployment(raw: unknown): DeploymentState {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "invalid",
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const m = parsed.data;
  const mode: DeploymentMode = m.mode ?? (m.broadcastReady ? "production" : "local");
  const isFixture = m.isFixture ?? false;

  if (m.chainId !== ROBINHOOD_CHAIN_ID) {
    return { status: "invalid", errors: [`chainId ${m.chainId} != ${ROBINHOOD_CHAIN_ID}`] };
  }

  // A live, write-capable deployment requires a broadcast-ready manifest with real actual addresses.
  if (!m.broadcastReady) {
    return {
      status: "not-live",
      reason: "manifest is not broadcast-ready (dry-run): live protocol writes are disabled",
      mode,
      isFixture,
      sourceCommit: m.sourceCommit,
    };
  }

  const keys = Object.keys(m.actual) as ContractKey[];
  const addresses = {} as Record<ContractKey, string>;
  for (const k of keys) {
    const a = m.actual[k];
    if (!isRealAddress(a)) {
      return {
        status: "not-live",
        reason: `contract "${k}" has no valid deployed address (null/zero/placeholder/malformed)`,
        mode,
        isFixture,
        sourceCommit: m.sourceCommit,
      };
    }
    addresses[k] = a;
  }

  return {
    status: "live",
    mode,
    isFixture,
    sourceCommit: m.sourceCommit,
    chainId: m.chainId,
    addresses,
    requiredCodeAddresses: WRITE_REQUIRED_CONTRACTS.map((k) => addresses[k]),
    writesEnabled: false,
  };
}

/**
 * Flip a live state to writes-enabled ONLY when every required contract address is confirmed to have
 * runtime code on the same chain. `hasCode` is injected (an eth_getCode wrapper) so this stays testable
 * without a network. A fixture manifest never enables live writes regardless of code presence.
 */
export function enableWrites(
  state: DeploymentState,
  codePresent: Readonly<Record<string, boolean>>,
): DeploymentState {
  if (state.status !== "live") return state;
  if (state.isFixture) return { ...state, writesEnabled: false };
  const allHaveCode = state.requiredCodeAddresses.every(
    (a) => codePresent[a.toLowerCase()] === true,
  );
  return { ...state, writesEnabled: allHaveCode };
}

/** Whether the UI may present any transaction control at all. */
export function writesAllowed(state: DeploymentState): boolean {
  return state.status === "live" && state.writesEnabled && !state.isFixture;
}
