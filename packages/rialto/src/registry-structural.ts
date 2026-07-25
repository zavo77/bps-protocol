// TASK 10K-2 — PURE OFFLINE structural evaluation of a Rialto router-registry observation.
//
// SCOPE / SAFETY:
// - This module is PURE and OFFLINE. It imports NO network client (no fetch/Axios/RPC), reads NO
//   environment variable, holds NO credential, and has NO signing/simulation/broadcast path.
// - It assesses a registry observation SEPARATELY from selector approval. A registry observation is
//   conversation/fixture-supplied and may be UNDATED — it is NOT permanent authority. Reconciling a
//   quote target against an undated snapshot never approves a selector and never closes D-6.
// - Selector approval is an EXPLICIT policy input (an allow-list). Approval is NEVER inferred from a
//   single observed quote. Overall production structural approval requires an approved selector and
//   therefore remains false while the allow-list is empty (fail closed).

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SELECTOR_RE = /^0x[0-9a-fA-F]{8}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function isAddress(v: unknown): v is string {
  return typeof v === "string" && ADDRESS_RE.test(v);
}
function lower(v: string): string {
  return v.toLowerCase();
}

/** A read-only, possibly-undated observation of one registry feature. Conversation/fixture-supplied. */
export interface RegistryFeatureObservation {
  readonly registry: string;
  readonly feature: number;
  readonly currentRouter: string;
  readonly previousRouter: string;
  readonly nextRouter: string;
  readonly paused: boolean;
  readonly blockNumber: number | null;
  readonly observationTimeUtc: string | null;
}

export type RegistryReconcileCode =
  | "OK"
  | "MISSING_REGISTRY_FIELD"
  | "MALFORMED_ADDRESS"
  | "ZERO_CURRENT_ROUTER"
  | "FEATURE_PAUSED"
  | "TARGET_ROUTER_MISMATCH";

export interface RegistryReconciliation {
  readonly code: RegistryReconcileCode;
  readonly routerReconciled: boolean;
  readonly matchedCurrent: boolean;
  readonly matchedPreviousOnly: boolean;
  readonly matchedNextOnly: boolean;
  /** True only when the observation carries a block number or timestamp. An undated snapshot is false. */
  readonly snapshotDated: boolean;
  readonly note: string;
}

/**
 * Reconcile a quote `target` against a registry feature observation. Fails closed on malformed/missing
 * fields, a zero current router, a paused feature, or any target that is not EXACTLY the current router
 * (a match against only the previous/next router does NOT reconcile).
 */
export function reconcileRegistryTarget(
  target: unknown,
  obs: RegistryFeatureObservation,
): RegistryReconciliation {
  const fail = (
    code: RegistryReconcileCode,
    note: string,
    extra: Partial<RegistryReconciliation> = {},
  ): RegistryReconciliation => ({
    code,
    routerReconciled: false,
    matchedCurrent: false,
    matchedPreviousOnly: false,
    matchedNextOnly: false,
    snapshotDated: obs?.blockNumber != null || obs?.observationTimeUtc != null,
    note,
    ...extra,
  });

  // Missing required fields (undefined) fail closed. Note: null block/time is allowed (undated).
  if (
    obs === null ||
    obs === undefined ||
    obs.registry === undefined ||
    obs.feature === undefined ||
    obs.currentRouter === undefined ||
    obs.previousRouter === undefined ||
    obs.nextRouter === undefined ||
    obs.paused === undefined
  ) {
    return fail("MISSING_REGISTRY_FIELD", "a required registry field is missing");
  }
  if (
    !isAddress(target) ||
    !isAddress(obs.registry) ||
    !isAddress(obs.currentRouter) ||
    !isAddress(obs.previousRouter) ||
    !isAddress(obs.nextRouter)
  ) {
    return fail("MALFORMED_ADDRESS", "target or a registry address is malformed");
  }
  if (lower(obs.currentRouter) === ZERO_ADDRESS) {
    return fail("ZERO_CURRENT_ROUTER", "current feature router is the zero address");
  }
  if (obs.paused === true) {
    return fail("FEATURE_PAUSED", "registry feature is paused");
  }

  const t = lower(target);
  const cur = lower(obs.currentRouter);
  const prev = lower(obs.previousRouter);
  const next = lower(obs.nextRouter);
  if (t !== cur) {
    // A previous/next-only match must NOT reconcile.
    return fail("TARGET_ROUTER_MISMATCH", "target does not equal the current feature router", {
      matchedPreviousOnly: t === prev && prev !== ZERO_ADDRESS,
      matchedNextOnly: t === next && next !== ZERO_ADDRESS,
    });
  }

  return {
    code: "OK",
    routerReconciled: true,
    matchedCurrent: true,
    matchedPreviousOnly: false,
    matchedNextOnly: false,
    snapshotDated: obs.blockNumber != null || obs.observationTimeUtc != null,
    note: "target equals the current feature router for this (possibly undated) snapshot only",
  };
}

export type DerivedStructuralStatus =
  | "SELECTOR_UNAPPROVED"
  | "STRUCTURALLY_APPROVED"
  | "ROUTER_UNRECONCILED"
  | "MALFORMED_SELECTOR"
  | "WRONG_CHAIN";

export interface DerivedReplayInput {
  readonly chainId: number;
  readonly target: string;
  readonly selector: string;
  readonly registry: RegistryFeatureObservation;
  /** Explicit selector allow-list. EMPTY = nothing approved. Approval is never inferred from a quote. */
  readonly approvedSelectors: readonly string[];
  /** Optional repository-owned/vendored ABI selector map to name the selector; unknown otherwise. */
  readonly selectorAbi?: Readonly<Record<string, string>>;
}

export interface DerivedReplayResult {
  readonly derivedStatus: DerivedStructuralStatus;
  readonly routerReconciled: boolean;
  readonly registryPaused: boolean;
  readonly snapshotDated: boolean;
  readonly selector: string;
  readonly selectorApproved: boolean;
  /** Function name ONLY if an offline repo/vendored ABI proves it; otherwise null (unknown). */
  readonly selectorFunctionName: string | null;
  readonly productionStructuralApproved: boolean;
  readonly registryReconciliation: RegistryReconciliation;
  readonly d6: "OPEN";
  readonly notes: readonly string[];
}

/** Resolve a selector's function name only from a supplied offline ABI map. Never guesses. */
function resolveSelectorName(
  selector: string,
  abi: Readonly<Record<string, string>> | undefined,
): string | null {
  if (!abi) return null;
  const hit = abi[lower(selector)] ?? abi[selector];
  return typeof hit === "string" && hit.length > 0 ? hit : null;
}

/**
 * Derive an offline structural replay result from a quote target + selector and a SEPARATE registry
 * observation. Router reconciliation and selector approval are assessed independently. Production
 * structural approval requires BOTH a reconciled router and an explicitly approved selector; with an
 * empty allow-list it is always false (fail closed). D-6 remains OPEN regardless.
 */
export function deriveStructuralReplay(input: DerivedReplayInput): DerivedReplayResult {
  const registryReconciliation = reconcileRegistryTarget(input.target, input.registry);
  const notes: string[] = [];
  const base = {
    routerReconciled: registryReconciliation.routerReconciled,
    registryPaused: input.registry?.paused === true,
    snapshotDated: registryReconciliation.snapshotDated,
    selector: input.selector,
    selectorApproved: false,
    selectorFunctionName: resolveSelectorName(input.selector, input.selectorAbi),
    productionStructuralApproved: false,
    registryReconciliation,
    d6: "OPEN" as const,
  };

  if (input.chainId !== 4663) {
    return { ...base, derivedStatus: "WRONG_CHAIN", notes: ["chain id is not 4663"] };
  }
  if (!SELECTOR_RE.test(input.selector)) {
    return { ...base, derivedStatus: "MALFORMED_SELECTOR", notes: ["selector is malformed"] };
  }
  if (!registryReconciliation.routerReconciled) {
    return {
      ...base,
      derivedStatus: "ROUTER_UNRECONCILED",
      notes: [`registry reconciliation failed: ${registryReconciliation.code}`],
    };
  }

  // Router reconciled. Selector approval is a SEPARATE, explicit decision — never inferred here.
  const approved = input.approvedSelectors.map(lower).includes(lower(input.selector));
  notes.push("router reconciled against an undated snapshot only — not permanent authority");
  notes.push("selector is evidence-only; a single observed quote cannot approve it or close D-6");
  return {
    ...base,
    selectorApproved: approved,
    // Approval requires BOTH reconciliation and an explicit selector approval. Empty allow-list => false.
    productionStructuralApproved: registryReconciliation.routerReconciled && approved,
    derivedStatus: approved ? "STRUCTURALLY_APPROVED" : "SELECTOR_UNAPPROVED",
    notes,
  };
}
