// Canary manifest boundary (Task 10B-1). A SEPARATE, fail-closed reader for the BPSC-TEST Robinhood-mainnet
// canary profile. It never touches the canonical production manifest boundary (`lib/manifest.ts`) and never
// enables a live canary action unless the manifest is explicitly canary, on chain 4663, broadcast-ready AND
// live-writes-approved, with real addresses, verified code-hashes, and populated WETH caps. Every missing or
// unresolved field fails closed. This module holds NO deterministic key and constructs NO wallet client.
import { z } from "zod";
import { ROBINHOOD_CHAIN_ID } from "../chain";

/** Persistent, unmistakable canary label. Must always be shown; the canary is never canonical BPS. */
export const CANARY_LABEL = "BPSC-TEST — ROBINHOOD MAINNET CANARY — TEST ONLY";
export const CANARY_TOKEN_SYMBOL = "BPSC-TEST";
export const BLOCKSCOUT_BASE = "https://robinhoodchain.blockscout.com";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const PLACEHOLDERS = new Set(
  [
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000001",
    "0x000000000000000000000000000000000000dead",
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "0x1111111111111111111111111111111111111111",
  ].map((a) => a.toLowerCase()),
);

const addrOrNull = z.union([z.string(), z.null()]);
const weiOrNull = z.union([z.string(), z.null()]);

export const canaryManifestSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  canary: z.literal(true), // must be exactly true — a non-canary manifest is rejected here
  production: z.literal(false), // must be exactly false
  chainId: z.number(),
  broadcastReady: z.boolean(),
  liveWritesApproved: z.boolean(),
  isFixture: z.boolean().optional(),
  token: z.object({ name: z.string(), symbol: z.string(), decimals: z.number() }),
  actual: z.object({
    canaryToken: addrOrNull,
    lockingVault: addrOrNull,
    claimManager: addrOrNull,
    stockVault: addrOrNull,
    coordinator: addrOrNull,
    tradeRouter: addrOrNull,
  }),
  capitalCaps: z.object({
    lpWethMaxWei: weiOrNull,
    individualTradeWethMaxWei: weiOrNull,
    lpWethMaxUsd: z.number(),
    individualTradeMaxUsd: z.number(),
    controlledTradesMaxUsd: z.number(),
    gasMaxUsd: z.number(),
    aggregateMaxUsd: z.number(),
  }),
});

export type CanaryManifest = z.infer<typeof canaryManifestSchema>;

const WRITE_REQUIRED = [
  "tradeRouter",
  "lockingVault",
  "claimManager",
  "stockVault",
  "coordinator",
] as const;

export type CanaryState =
  | { readonly status: "invalid"; readonly errors: readonly string[] }
  | {
      readonly status: "not-approved";
      readonly reason: string;
      readonly label: string;
      readonly symbol: string;
    }
  | {
      readonly status: "ready";
      readonly label: string;
      readonly symbol: string;
      readonly chainId: number;
      readonly addresses: Readonly<Record<(typeof WRITE_REQUIRED)[number] | "canaryToken", string>>;
      readonly caps: { readonly lpWethMaxWei: bigint; readonly individualTradeWethMaxWei: bigint };
      readonly writesEnabled: boolean; // still false until on-chain code check via enableCanaryWrites
    };

function isRealAddress(a: string | null): a is string {
  return typeof a === "string" && ADDRESS_RE.test(a) && !PLACEHOLDERS.has(a.toLowerCase());
}

/**
 * Resolve a raw canary manifest, fail-closed. Even a perfectly-formed manifest only reaches `ready` when
 * BOTH `broadcastReady` and `liveWritesApproved` are true, the chain is 4663, it is not a fixture, every
 * write-required address is real, and both WETH caps are populated. Anything else is `not-approved` (writes
 * disabled) or `invalid`.
 */
export function resolveCanary(raw: unknown): CanaryState {
  const parsed = canaryManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "invalid",
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const m = parsed.data;
  const label = CANARY_LABEL;
  const symbol = m.token.symbol;

  if (m.chainId !== ROBINHOOD_CHAIN_ID) {
    return { status: "invalid", errors: [`chainId ${m.chainId} != ${ROBINHOOD_CHAIN_ID}`] };
  }
  if (m.token.symbol !== CANARY_TOKEN_SYMBOL) {
    return {
      status: "invalid",
      errors: [`token.symbol "${m.token.symbol}" != ${CANARY_TOKEN_SYMBOL}`],
    };
  }
  if (m.isFixture === true) {
    // A fixture manifest must never be presented as live canary state.
    return { status: "invalid", errors: ["isFixture manifest cannot be a live canary"] };
  }
  if (!m.broadcastReady || !m.liveWritesApproved) {
    return {
      status: "not-approved",
      reason: `canary writes disabled: broadcastReady=${m.broadcastReady}, liveWritesApproved=${m.liveWritesApproved}`,
      label,
      symbol,
    };
  }

  const addresses = {} as Record<(typeof WRITE_REQUIRED)[number] | "canaryToken", string>;
  for (const k of [...WRITE_REQUIRED, "canaryToken"] as const) {
    const a = (m.actual as Record<string, string | null>)[k] ?? null;
    if (!isRealAddress(a)) {
      return {
        status: "not-approved",
        reason: `contract "${k}" has no valid deployed address`,
        label,
        symbol,
      };
    }
    addresses[k] = a;
  }
  const lpWei = m.capitalCaps.lpWethMaxWei;
  const tradeWei = m.capitalCaps.individualTradeWethMaxWei;
  if (lpWei === null || tradeWei === null || !/^\d+$/.test(lpWei) || !/^\d+$/.test(tradeWei)) {
    return {
      status: "not-approved",
      reason: "WETH capital caps not populated (fail closed)",
      label,
      symbol,
    };
  }

  return {
    status: "ready",
    label,
    symbol,
    chainId: m.chainId,
    addresses,
    caps: { lpWethMaxWei: BigInt(lpWei), individualTradeWethMaxWei: BigInt(tradeWei) },
    writesEnabled: false,
  };
}

/** Flip a ready state to writes-enabled only when every write-required address is confirmed to have code. */
export function enableCanaryWrites(
  state: CanaryState,
  codePresent: Readonly<Record<string, boolean>>,
): CanaryState {
  if (state.status !== "ready") return state;
  const allHaveCode = WRITE_REQUIRED.every(
    (k) => codePresent[state.addresses[k].toLowerCase()] === true,
  );
  return { ...state, writesEnabled: allHaveCode };
}

/** Whether the canary UI may present ANY live transaction control. Fail-closed by construction. */
export function canaryWritesAllowed(state: CanaryState): boolean {
  return state.status === "ready" && state.writesEnabled;
}

// --- Capital controls (application-enforced; the USD ceilings are OPERATIONAL, not contract-enforced) ---

/**
 * Enforce the individual-trade WETH cap using the AUTHORITATIVE simulated/quoted WETH result. For a buy the
 * quoted WETH input is the gross; for a sell it is the quoted/simulated WETH proceeds. Returns false (blocked)
 * when caps are unavailable — fail closed.
 */
export function withinIndividualTradeCap(state: CanaryState, quotedWethWei: bigint): boolean {
  if (state.status !== "ready") return false;
  return quotedWethWei > 0n && quotedWethWei <= state.caps.individualTradeWethMaxWei;
}

/** Whether the proposed LP WETH is within the configured cap. Fail closed if unavailable. */
export function withinLpCap(state: CanaryState, lpWethWei: bigint): boolean {
  if (state.status !== "ready") return false;
  return lpWethWei > 0n && lpWethWei <= state.caps.lpWethMaxWei;
}

/**
 * The USD ceilings are operational controls displayed to the operator, NOT enforced by any contract. This
 * helper returns them for display so the UI can clearly label them as operational.
 */
export const OPERATIONAL_USD_CEILINGS = {
  lpWethMaxUsd: 100,
  individualTradeMaxUsd: 2,
  controlledTradesMaxUsd: 20,
  gasMaxUsd: 10,
  aggregateMaxUsd: 130,
} as const;

// --- Address-separation guards (canary vs canonical) --------------------------------------------------

/** Reject any overlap between the canary address set and known canonical BPS production addresses. */
export function assertNoCanonicalOverlap(
  canaryAddresses: readonly (string | null)[],
  canonicalAddresses: readonly (string | null)[],
): void {
  const canon = new Set(canonicalAddresses.filter(Boolean).map((a) => (a as string).toLowerCase()));
  for (const a of canaryAddresses) {
    if (a && canon.has(a.toLowerCase())) {
      throw new Error(`canary address ${a} collides with a canonical BPS production address`);
    }
  }
}

/** Robinhood Chain Blockscout explorer link for a tx or address. */
export function explorerTxUrl(hash: string): string {
  return `${BLOCKSCOUT_BASE}/tx/${hash}`;
}
export function explorerAddressUrl(address: string): string {
  return `${BLOCKSCOUT_BASE}/address/${address}`;
}
