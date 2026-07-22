import { describe, expect, it } from "vitest";
import { SAMPLE_TRANSPARENCY } from "./fixtures";
import { buildTransparencyReport, type TransparencyInputs } from "./transparency";

describe("transparency read model (§F)", () => {
  it("derives volumes, burn, and separates accrued vs spent budget", () => {
    const r = buildTransparencyReport(SAMPLE_TRANSPARENCY);
    expect(r.buyVolume.value).toBe(1000n * 10n ** 18n);
    expect(r.sellVolume.value).toBe(200n * 10n ** 18n);
    expect(r.totalBpsBurned.value).toBe(10_004n * 10n ** 18n);
    expect(r.stockAcquisitionBudgetAccrued.value).toBe(24n * 10n ** 18n);
    expect(r.stockAcquisitionBudgetSpent.value).toBe(20n * 10n ** 18n);
    expect(r.pendingBudgetNotYetAcquired.value).toBe(4n * 10n ** 18n);
  });

  it("acquisition row reconciles 80/20 and links to its cycle with derived claimed", () => {
    const r = buildTransparencyReport(SAMPLE_TRANSPARENCY);
    const row = r.acquisitions[0]!;
    expect(row.splitReconciles).toBe(true);
    expect(row.distribution80.value).toBe(1600n * 10n ** 18n);
    expect(row.reserve20.value).toBe(400n * 10n ** 18n);
    expect(row.cycleId.value).toBe(42n);
    expect(row.released.value).toBe(1600n * 10n ** 18n);
    expect(row.remaining.value).toBe(600n * 10n ** 18n);
    expect(row.claimed.value).toBe(1000n * 10n ** 18n); // funded - remaining
    expect(row.claimed.provenance).toBe("fixture"); // whole report is fixture-tagged
  });

  it("fixture inputs tag everything as fixture provenance", () => {
    const r = buildTransparencyReport(SAMPLE_TRANSPARENCY);
    expect(r.buyVolume.provenance).toBe("fixture");
    expect(r.acquisitions[0]!.wethSpent.provenance).toBe("fixture");
  });

  it("non-fixture inputs use real provenance and a budget without acquisition stays pending", () => {
    const input: TransparencyInputs = {
      isFixture: false,
      trades: [{ kind: "buy", stockBudget: 5n, bpsBurned: 1n, gross: 100n }],
      recorded: [], // budget accrued but NO acquisition recorded
      funded: [],
      cycleReads: [],
    };
    const r = buildTransparencyReport(input);
    expect(r.stockAcquisitionBudgetAccrued.value).toBe(5n);
    expect(r.stockAcquisitionBudgetSpent.value).toBe(0n);
    expect(r.pendingBudgetNotYetAcquired.value).toBe(5n);
    expect(r.buyVolume.provenance).toBe("derived");
    expect(r.acquisitions.length).toBe(0); // no acquisition claimed from a mere budget
    expect(r.acquisitionDisclaimer.toLowerCase()).toContain("does not mean an acquisition");
    expect(r.rialtoNote.toLowerCase()).toContain("not decentralized");
  });

  it("a recorded acquisition with no funding shows unavailable cycle/claim fields", () => {
    const input: TransparencyInputs = {
      isFixture: false,
      trades: [],
      recorded: [
        {
          acquisitionId: 9n,
          stockToken: "NVDA",
          wethSpent: 10n,
          acquiredStock: 100n,
          distributionAmount: 80n,
          reserveAmount: 20n,
        },
      ],
      funded: [],
      cycleReads: [],
    };
    const row = buildTransparencyReport(input).acquisitions[0]!;
    expect(row.cycleId.value).toBeNull();
    expect(row.cycleId.provenance).toBe("unavailable");
    expect(row.released.value).toBeNull();
  });
});
