import { describe, expect, it } from "vitest";
import { allocate, allocateAsset } from "./allocation.js";
import type { AcquiredAsset } from "./model.js";
import type { WalletWeight } from "./twab.js";
import { loadCycleFixture } from "./validate.js";
import { A, baseRawFixture } from "./testkit.js";

const cycle = loadCycleFixture(baseRawFixture()).cycle;

function asset(tokenAddress: string, decimals: number, acquired: bigint): AcquiredAsset {
  return { ticker: "TKN", name: "Fictional", tokenAddress, decimals, acquiredRawAmount: acquired };
}

function weight(wallet: string, effectiveWeight: bigint): WalletWeight {
  return {
    wallet,
    snapshotBalance: 0n,
    baseTwab: 0n,
    unlockedTwab: effectiveWeight,
    lockedTwabByTier: { LOCK_7D: 0n, LOCK_14D: 0n, LOCK_21D: 0n, LOCK_30D: 0n },
    effectiveWeight,
  };
}

function weightMap(entries: Array<[string, bigint]>): Map<string, WalletWeight> {
  return new Map(entries.map(([w, e]) => [w, weight(w, e)]));
}

describe("allocation and rounding", () => {
  it("splits acquired inventory exactly 80/20 (req 17)", () => {
    const a = allocateAsset(cycle, asset(A.asset18, 18, 1000n), [], new Map(), 0n);
    expect(a.participantPool).toBe(800n);
    expect(a.strategicReserve).toBe(200n);
  });

  it("assigns the split remainder to the reserve (req 18)", () => {
    // 5_000_000_001 * 8000 / 10000 = 4_000_000_000.8 -> floor 4_000_000_000; remainder to reserve.
    const a = allocateAsset(cycle, asset(A.asset8, 8, 5_000_000_001n), [], new Map(), 0n);
    expect(a.participantPool).toBe(4_000_000_000n);
    expect(a.strategicReserve).toBe(1_000_000_001n);
    expect(a.participantPool + a.strategicReserve).toBe(5_000_000_001n);
  });

  it("floor-allocates per wallet by effective weight (req 19)", () => {
    const weights = weightMap([
      [A.w1, 100n],
      [A.w2, 300n],
    ]);
    const a = allocateAsset(cycle, asset(A.asset18, 18, 1000n), [A.w1, A.w2], weights, 400n);
    // pool 800: w1 = floor(800*100/400)=200, w2 = floor(800*300/400)=600.
    expect(a.walletAllocations).toEqual([
      { wallet: A.w1, amount: 200n },
      { wallet: A.w2, amount: 600n },
    ]);
    expect(a.allocated).toBe(800n);
    expect(a.distributionDust).toBe(0n);
  });

  it("retains rounding dust outside entitlements (req 20)", () => {
    const weights = weightMap([
      [A.w1, 1n],
      [A.w2, 1n],
      [A.w3, 1n],
    ]);
    const a = allocateAsset(cycle, asset(A.asset18, 18, 1000n), [A.w1, A.w2, A.w3], weights, 3n);
    // pool 800: each floor(800/3)=266, allocated 798, dust 2 retained (not an entitlement).
    expect(a.allocated).toBe(798n);
    expect(a.distributionDust).toBe(2n);
    expect(a.entitlements.every((e) => e.amount > 0n)).toBe(true);
    expect(a.entitlements).toHaveLength(3);
  });

  it("never emits a zero-amount entitlement (req 24)", () => {
    const weights = weightMap([
      [A.w1, 1n],
      [A.w2, 1_000_000n],
    ]);
    // pool 8: w1 = floor(8*1/1000001)=0 (dropped), w2 = floor(8*1000000/1000001)=7.
    const a = allocateAsset(cycle, asset(A.asset18, 18, 10n), [A.w1, A.w2], weights, 1_000_001n);
    expect(a.entitlements.map((e) => e.wallet)).toEqual([A.w2]);
    expect(a.entitlements.every((e) => e.amount > 0n)).toBe(true);
  });

  it("keeps mixed-decimal assets independent, each in its own raw units (req 21)", () => {
    const weights = weightMap([
      [A.w1, 100n],
      [A.w2, 300n],
    ]);
    const result = allocate(
      cycle,
      [
        asset(A.asset6, 6, 1_000_000n),
        asset(A.asset8, 8, 5_000_000_001n),
        asset(A.asset18, 18, 1000n),
      ],
      [A.w1, A.w2],
      weights,
      400n,
    );
    const pools = result.assets.map((x) => x.participantPool);
    expect(pools).toEqual([800_000n, 4_000_000_000n, 800n]);
    // Different-decimal amounts are never combined; each pool derives only from its own acquired.
    for (const x of result.assets) {
      expect(x.participantPool + x.strategicReserve).toBe(x.acquired);
    }
  });

  it("conserves inventory per asset (req 22)", () => {
    const weights = weightMap([
      [A.w1, 100n],
      [A.w2, 300n],
    ]);
    const a = allocateAsset(cycle, asset(A.asset8, 8, 5_000_000_001n), [A.w1, A.w2], weights, 400n);
    expect(a.strategicReserve + a.allocated + a.distributionDust).toBe(a.acquired);
    expect(a.allocated + a.distributionDust).toBe(a.participantPool);
    expect(a.allocated <= a.participantPool).toBe(true);
  });

  it("refuses publication when total effective weight is zero (req 23)", () => {
    const result = allocate(cycle, [asset(A.asset18, 18, 1000n)], [], new Map(), 0n);
    expect(result.publishable).toBe(false);
    expect(result.nonPublishableReason).toMatch(/zero/);
    expect(result.entitlements).toHaveLength(0);
    // Participant inventory is classified for rollover (dust == pool).
    const a = result.assets[0]!;
    expect(a.allocated).toBe(0n);
    expect(a.distributionDust).toBe(a.participantPool);
    expect(a.strategicReserve + a.distributionDust).toBe(a.acquired);
  });
});
