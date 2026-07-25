// TASK 10H-1 — consumer boundary-status tests (all offline).
import { describe, expect, it } from "vitest";
import { classifyBoundary, type BoundaryObservation } from "./boundary-status.js";

function obs(over: Partial<BoundaryObservation> = {}): BoundaryObservation {
  return {
    quoteObserved: false,
    structuralValidationPassed: false,
    priceGuardPassed: false,
    localForkSettlementPassed: false,
    mainnetReceipt: null,
    ...over,
  };
}

describe("Rialto boundary consumer status (never overstated)", () => {
  it("distinguishes every progressive state truthfully", () => {
    expect(classifyBoundary(obs()).status).toBe("QUOTE_NOT_OBSERVED");
    expect(classifyBoundary(obs({ quoteObserved: true })).status).toBe("QUOTE_OBSERVED");
    expect(
      classifyBoundary(obs({ quoteObserved: true, structuralValidationPassed: true })).status,
    ).toBe("QUOTE_STRUCTURALLY_VALID");
    const pg = classifyBoundary(
      obs({ quoteObserved: true, structuralValidationPassed: true, priceGuardPassed: true }),
    );
    expect(pg.status).toBe("PRICE_GUARD_PASSED");
    expect(pg.note).toBe("settlement not executed");
  });

  it("local fork settlement is labeled LOCAL_FORK_ONLY, never mainnet", () => {
    const v = classifyBoundary(
      obs({
        quoteObserved: true,
        structuralValidationPassed: true,
        priceGuardPassed: true,
        localForkSettlementPassed: true,
      }),
    );
    expect(v.status).toBe("SETTLEMENT_EXECUTED_LOCAL_FORK_ONLY");
    expect(v.note).toContain("NOT mainnet");
  });

  it("structural pass alone cannot become a settlement state", () => {
    const v = classifyBoundary(obs({ quoteObserved: true, structuralValidationPassed: true }));
    expect(v.status).toBe("QUOTE_STRUCTURALLY_VALID");
  });

  it("a malformed mainnet receipt proof NEVER upgrades the status (mock cannot be classified live)", () => {
    const v = classifyBoundary(
      obs({
        quoteObserved: true,
        structuralValidationPassed: true,
        priceGuardPassed: true,
        localForkSettlementPassed: true,
        mainnetReceipt: {
          txHash: "0xnot-a-hash",
          blockNumber: 0n,
          blockHash: "0x00",
          acquisitionId: 0n,
          stockReceivedRaw: 0n,
        },
      }),
    );
    expect(v.status).toBe("SETTLEMENT_EXECUTED_LOCAL_FORK_ONLY");
    expect(v.note).toContain("malformed");
  });

  it("legal eligibility is ALWAYS reported unresolved by this boundary", () => {
    for (const o of [obs(), obs({ quoteObserved: true })]) {
      expect(classifyBoundary(o).legalEligibility).toBe(
        "UNRESOLVED — NOT ESTABLISHED BY THIS BOUNDARY",
      );
    }
  });

  it("TASK 10H-1 cannot produce MAINNET_SETTLEMENT_CONFIRMED (no receipt proof exists)", () => {
    // The only path to that state requires a complete receipt proof; this task never constructs
    // one. This test documents that in code: absent proof => never confirmed.
    const v = classifyBoundary(
      obs({
        quoteObserved: true,
        structuralValidationPassed: true,
        priceGuardPassed: true,
        localForkSettlementPassed: true,
        mainnetReceipt: null,
      }),
    );
    expect(v.status).not.toBe("MAINNET_SETTLEMENT_CONFIRMED");
  });
});
