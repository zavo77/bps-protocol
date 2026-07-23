// Canary operations router (Task 10B-2). The SINGLE source of contract addresses and write-action gating for
// canary mode. Every canary operation (balances, pool/price reads, quotes, approvals, buy/sell prep, cap
// enforcement, locking/withdrawal, budget/burn/transparency reads, cycle reads, claims) must resolve its
// target address through here — which returns addresses ONLY from the resolved canary manifest, and ONLY
// when the canary state is ready AND writes are code-verified AND the provider chain is 4663. It never
// returns a canonical/demo/fixture address and holds no key.
import { ROBINHOOD_CHAIN_ID } from "../chain";
import {
  assertNoCanonicalOverlap,
  canaryWritesAllowed,
  withinIndividualTradeCap,
  withinLpCap,
  type CanaryState,
} from "./manifest";

export type CanaryOpKey =
  "tradeRouter" | "lockingVault" | "claimManager" | "stockVault" | "coordinator" | "canaryToken";

export type CanaryOpResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

/** Provider-derived chain gate: fail closed unless the connected wallet reports chain 4663. */
export function requireCanaryChain(chainId: number | null | undefined): CanaryOpResult<number> {
  if (chainId !== ROBINHOOD_CHAIN_ID)
    return { ok: false, reason: `wrong-chain:${chainId ?? "none"}` };
  return { ok: true, value: ROBINHOOD_CHAIN_ID };
}

/**
 * Select the canary contract address for an operation. FAIL CLOSED: blocks unless the canary state is `ready`
 * AND writes are enabled (code-verified). The only address source is the resolved canary manifest — never a
 * canonical/demo/fixture address.
 */
export function selectCanaryContract(state: CanaryState, key: CanaryOpKey): CanaryOpResult<string> {
  if (state.status === "invalid")
    return { ok: false, reason: `invalid:${state.errors.join("; ")}` };
  if (state.status === "not-approved") return { ok: false, reason: `not-approved:${state.reason}` };
  if (!canaryWritesAllowed(state)) return { ok: false, reason: "writes-disabled" };
  const a = state.addresses[key];
  if (!a) return { ok: false, reason: `no-address:${key}` };
  return { ok: true, value: a };
}

/** Prepare a canary write-action target. Fail closed unless chain 4663 AND ready AND writes-enabled. */
export function prepareCanaryAction(
  state: CanaryState,
  chainId: number | null | undefined,
  key: CanaryOpKey,
): CanaryOpResult<{ readonly target: string }> {
  const chain = requireCanaryChain(chainId);
  if (!chain.ok) return chain;
  const sel = selectCanaryContract(state, key);
  if (!sel.ok) return sel;
  return { ok: true, value: { target: sel.value } };
}

/** BUY cap: enforce the $2 individual-trade cap using the AUTHORITATIVE gross WETH input. Fail closed. */
export function enforceCanaryBuyCap(
  state: CanaryState,
  grossWethInWei: bigint,
): CanaryOpResult<bigint> {
  if (!withinIndividualTradeCap(state, grossWethInWei)) {
    return { ok: false, reason: "exceeds-2usd-cap-or-not-ready" };
  }
  return { ok: true, value: grossWethInWei };
}

/** SELL cap: enforce the $2 individual-trade cap using the AUTHORITATIVE simulated/quoted WETH output. */
export function enforceCanarySellCap(
  state: CanaryState,
  simulatedWethOutWei: bigint,
): CanaryOpResult<bigint> {
  if (!withinIndividualTradeCap(state, simulatedWethOutWei)) {
    return { ok: false, reason: "exceeds-2usd-cap-or-not-ready" };
  }
  return { ok: true, value: simulatedWethOutWei };
}

/** LP cap: enforce the $100 WETH LP cap. Fail closed. */
export function enforceCanaryLpCap(state: CanaryState, lpWethWei: bigint): CanaryOpResult<bigint> {
  if (!withinLpCap(state, lpWethWei))
    return { ok: false, reason: "exceeds-100usd-lp-cap-or-not-ready" };
  return { ok: true, value: lpWethWei };
}

/** Reject any overlap between the canary address set and known canonical BPS production addresses. */
export function assertCanarySeparation(
  state: CanaryState,
  canonicalAddresses: readonly (string | null)[],
): void {
  if (state.status !== "ready") return;
  assertNoCanonicalOverlap(Object.values(state.addresses), canonicalAddresses);
}

/** A single human-readable blocking summary for the canary UI (all gated operations share this). */
export function canaryBlockReason(
  state: CanaryState,
  chainId: number | null | undefined,
): string | null {
  const chain = requireCanaryChain(chainId);
  if (!chain.ok) return chain.reason;
  const sel = selectCanaryContract(state, "tradeRouter");
  return sel.ok ? null : sel.reason;
}
