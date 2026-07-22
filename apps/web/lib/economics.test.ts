import { describe, expect, it } from "vitest";
import { acquiredStockSplit, buyAllocation, sellAllocation } from "./economics";

describe("economics (BPS-ECON-2.0)", () => {
  it("buy: 2% stock + 1% burn + remainder to user, conserving the whole", () => {
    const a = buyAllocation(1000n * 10n ** 18n);
    expect(a.stockBudget).toBe(20n * 10n ** 18n); // 2%
    expect(a.burnBudget).toBe(10n * 10n ** 18n); // 1%
    expect(a.userAmount).toBe(970n * 10n ** 18n); // 97%
    expect(a.stockBudget + a.burnBudget + a.userAmount).toBe(1000n * 10n ** 18n);
    expect(a.totalProtocolBps).toBe(300n);
  });

  it("sell: 2% stock + 2% burn from actual proceeds + remainder to user", () => {
    const a = sellAllocation(200n * 10n ** 18n);
    expect(a.stockBudget).toBe(4n * 10n ** 18n);
    expect(a.burnBudget).toBe(4n * 10n ** 18n);
    expect(a.userAmount).toBe(192n * 10n ** 18n);
    expect(a.totalProtocolBps).toBe(400n);
  });

  it("remainder always favors the user (floored fees)", () => {
    const a = buyAllocation(1000n * 10n ** 18n + 7n);
    expect(a.stockBudget + a.burnBudget + a.userAmount).toBe(1000n * 10n ** 18n + 7n);
    expect(a.userAmount).toBeGreaterThanOrEqual(970n * 10n ** 18n);
  });

  it("80/20 acquired-stock split floors distribution, remainder to reserve", () => {
    const s = acquiredStockSplit(2000n * 10n ** 18n + 3n);
    expect(s.distribution).toBe(1600n * 10n ** 18n + 2n);
    expect(s.reserve).toBe(400n * 10n ** 18n + 1n);
    expect(s.distribution + s.reserve).toBe(2000n * 10n ** 18n + 3n);
  });

  it("rejects negative inputs", () => {
    expect(() => buyAllocation(-1n)).toThrow();
    expect(() => acquiredStockSplit(-1n)).toThrow();
  });
});
