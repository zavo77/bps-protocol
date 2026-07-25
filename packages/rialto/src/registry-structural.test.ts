import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  reconcileRegistryTarget,
  deriveStructuralReplay,
  type RegistryFeatureObservation,
} from "./server.js";

// Any accidental network access in this offline suite must fail loudly.
beforeAll(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation((() => {
    throw new Error("NETWORK ACCESS FORBIDDEN IN OFFLINE TEST");
  }) as unknown as typeof fetch);
});
afterAll(() => {
  vi.restoreAllMocks();
});

const ROUTER = "0xc94135b63772b91d79d0a2daab2a8801f32359bd";
const OTHER = "0x00000000000000000000000000000000000000ff";
const ZERO = "0x0000000000000000000000000000000000000000";
const SELECTOR = "0x77963966";

function obs(over: Partial<RegistryFeatureObservation> = {}): RegistryFeatureObservation {
  return {
    registry: "0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E",
    feature: 2,
    currentRouter: ROUTER,
    previousRouter: ZERO,
    nextRouter: ZERO,
    paused: false,
    blockNumber: null,
    observationTimeUtc: null,
    ...over,
  };
}

const ARTIFACT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/audit/BPS_RIALTO_QEX1_QUOTE_EVIDENCE_2026-07-25.evidence.json",
);

describe("QEX-1 evidence artifact", () => {
  const raw = readFileSync(ARTIFACT_PATH, "utf8");
  const artifact = JSON.parse(raw) as Record<string, unknown>;

  it("parses and records QEX-1 as consumed with exactly one quote", () => {
    expect(artifact.qex1Status).toBe("CONSUMED / COMPLETE");
    expect(artifact.quotesAuthorized).toBe(1);
    expect(artifact.quotesExecuted).toBe(1);
    expect(artifact.retryOrAdditionalQuoteAuthorized).toBe(false);
    const original = artifact.originalStructuralResult as Record<string, unknown>;
    expect(original.errorCode).toBe("ROUTER_UNRESOLVED"); // preserved unchanged
    expect(original.passed).toBe(false);
  });

  it("contains no credential, raw quote id, or complete calldata", () => {
    // No key value / bearer token (the boolean flag `apiKeyRemovedAfterExecution` is fine — not a value).
    expect(raw).not.toContain("rialto_live_");
    expect(raw).not.toContain("Bearer ");
    expect(raw).not.toContain("RIALTO_API_KEY");
    // Only the selector (10 chars incl 0x) and byte length are stored — never full calldata.
    const q = artifact.originalQuoteResponse as Record<string, unknown>;
    expect(q.selector).toBe(SELECTOR);
    expect(q.callDataBytes).toBe(804);
    expect(q).not.toHaveProperty("callData");
    expect(q).not.toHaveProperty("quoteId");
    expect(q).not.toHaveProperty("quote_id");
    expect(q.quoteIdSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the stored derived replay matches a fresh offline recomputation", () => {
    const q = artifact.originalQuoteResponse as Record<string, unknown>;
    const reg = artifact.registryObservation as Record<string, unknown>;
    const derived = deriveStructuralReplay({
      chainId: 4663,
      target: q.txTarget as string,
      selector: q.selector as string,
      registry: {
        registry: reg.registry as string,
        feature: reg.feature as number,
        currentRouter: reg.currentRouter as string,
        previousRouter: reg.previousRouter as string,
        nextRouter: reg.nextRouter as string,
        paused: reg.paused as boolean,
        blockNumber: reg.blockNumber as number | null,
        observationTimeUtc: reg.observationTimeUtc as string | null,
      },
      approvedSelectors: [],
    });
    const stored = artifact.derivedOfflineReplayResult as Record<string, unknown>;
    expect(derived.derivedStatus).toBe("SELECTOR_UNAPPROVED");
    expect(derived.derivedStatus).toBe(stored.derivedStatus);
    expect(derived.routerReconciled).toBe(true);
    expect(derived.routerReconciled).toBe(stored.routerReconciled);
    expect(derived.productionStructuralApproved).toBe(false);
    expect(derived.productionStructuralApproved).toBe(stored.productionStructuralApproved);
    expect(derived.selectorApproved).toBe(false);
    expect(derived.snapshotDated).toBe(false);
    expect(derived.d6).toBe("OPEN");
    expect(derived.registryReconciliation.code).toBe("OK");
    expect((stored.registryReconciliation as Record<string, unknown>).code).toBe("OK");
  });
});

describe("reconcileRegistryTarget — fail closed", () => {
  it("reconciles when the target equals the current feature router", () => {
    const r = reconcileRegistryTarget(ROUTER, obs());
    expect(r.code).toBe("OK");
    expect(r.routerReconciled).toBe(true);
    expect(r.matchedCurrent).toBe(true);
    expect(r.snapshotDated).toBe(false); // block/time null => undated
  });

  it("reports a dated snapshot when a block number or timestamp is present", () => {
    expect(reconcileRegistryTarget(ROUTER, obs({ blockNumber: 19223939 })).snapshotDated).toBe(
      true,
    );
    expect(
      reconcileRegistryTarget(ROUTER, obs({ observationTimeUtc: "2026-07-25T00:00:00Z" }))
        .snapshotDated,
    ).toBe(true);
  });

  it("fails closed when the feature is paused", () => {
    const r = reconcileRegistryTarget(ROUTER, obs({ paused: true }));
    expect(r.code).toBe("FEATURE_PAUSED");
    expect(r.routerReconciled).toBe(false);
  });

  it("fails closed when the current router is the zero address", () => {
    expect(reconcileRegistryTarget(ROUTER, obs({ currentRouter: ZERO })).code).toBe(
      "ZERO_CURRENT_ROUTER",
    );
  });

  it("fails closed on a malformed target or router address", () => {
    expect(reconcileRegistryTarget("0xnothex", obs()).code).toBe("MALFORMED_ADDRESS");
    expect(reconcileRegistryTarget(ROUTER, obs({ currentRouter: "0x1234" })).code).toBe(
      "MALFORMED_ADDRESS",
    );
  });

  it("fails closed when the target does not equal the current router", () => {
    expect(reconcileRegistryTarget(OTHER, obs()).code).toBe("TARGET_ROUTER_MISMATCH");
  });

  it("does NOT reconcile when the target matches only the previous or next router", () => {
    const prevMatch = reconcileRegistryTarget(OTHER, obs({ previousRouter: OTHER }));
    expect(prevMatch.code).toBe("TARGET_ROUTER_MISMATCH");
    expect(prevMatch.routerReconciled).toBe(false);
    expect(prevMatch.matchedPreviousOnly).toBe(true);
    const nextMatch = reconcileRegistryTarget(OTHER, obs({ nextRouter: OTHER }));
    expect(nextMatch.code).toBe("TARGET_ROUTER_MISMATCH");
    expect(nextMatch.matchedNextOnly).toBe(true);
  });

  it("fails closed when a required registry field is missing", () => {
    const broken = { ...obs() } as Record<string, unknown>;
    delete broken.currentRouter;
    expect(
      reconcileRegistryTarget(ROUTER, broken as unknown as RegistryFeatureObservation).code,
    ).toBe("MISSING_REGISTRY_FIELD");
  });
});

describe("deriveStructuralReplay — registry assessed separately from selector approval", () => {
  it("router reconciled but selector unapproved => non-production, D-6 open", () => {
    const r = deriveStructuralReplay({
      chainId: 4663,
      target: ROUTER,
      selector: SELECTOR,
      registry: obs(),
      approvedSelectors: [],
    });
    expect(r.derivedStatus).toBe("SELECTOR_UNAPPROVED");
    expect(r.routerReconciled).toBe(true);
    expect(r.selectorApproved).toBe(false);
    expect(r.productionStructuralApproved).toBe(false);
    expect(r.selectorFunctionName).toBeNull();
    expect(r.d6).toBe("OPEN");
  });

  it("a single observed selector cannot close D-6 or self-approve", () => {
    // Even though SELECTOR was the selector observed in the quote, the evaluator never infers approval;
    // approval requires an EXPLICIT allow-list entry.
    const notInferred = deriveStructuralReplay({
      chainId: 4663,
      target: ROUTER,
      selector: SELECTOR,
      registry: obs(),
      approvedSelectors: [], // observing it in a quote does not add it here
    });
    expect(notInferred.selectorApproved).toBe(false);
    expect(notInferred.productionStructuralApproved).toBe(false);
    expect(notInferred.d6).toBe("OPEN");
  });

  it("propagates registry failure as ROUTER_UNRECONCILED (fail closed)", () => {
    const paused = deriveStructuralReplay({
      chainId: 4663,
      target: ROUTER,
      selector: SELECTOR,
      registry: obs({ paused: true }),
      approvedSelectors: [],
    });
    expect(paused.derivedStatus).toBe("ROUTER_UNRECONCILED");
    expect(paused.routerReconciled).toBe(false);
    expect(paused.productionStructuralApproved).toBe(false);
  });

  it("fails closed on a malformed selector", () => {
    const r = deriveStructuralReplay({
      chainId: 4663,
      target: ROUTER,
      selector: "0x1234",
      registry: obs(),
      approvedSelectors: [],
    });
    expect(r.derivedStatus).toBe("MALFORMED_SELECTOR");
    expect(r.productionStructuralApproved).toBe(false);
  });

  it("fails closed on the wrong chain", () => {
    const r = deriveStructuralReplay({
      chainId: 1,
      target: ROUTER,
      selector: SELECTOR,
      registry: obs(),
      approvedSelectors: [],
    });
    expect(r.derivedStatus).toBe("WRONG_CHAIN");
    expect(r.productionStructuralApproved).toBe(false);
  });

  it("does not name the selector without a proving offline ABI", () => {
    expect(
      deriveStructuralReplay({
        chainId: 4663,
        target: ROUTER,
        selector: SELECTOR,
        registry: obs(),
        approvedSelectors: [],
      }).selectorFunctionName,
    ).toBeNull();
  });

  it("makes no network call", () => {
    deriveStructuralReplay({
      chainId: 4663,
      target: ROUTER,
      selector: SELECTOR,
      registry: obs(),
      approvedSelectors: [],
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
