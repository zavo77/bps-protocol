import { describe, expect, it } from "vitest";
import { TIER_SPECS, type LockTier } from "./constants.js";
import { computeWeights } from "./twab.js";
import { loadCycleFixture } from "./validate.js";
import { A, E0, baseRawFixture } from "./testkit.js";

function w1Weight(balance: string, locks: Array<Record<string, unknown>>) {
  const raw = baseRawFixture();
  raw.epochStartBalances = [{ wallet: A.w1, rawBalance: balance }];
  raw.eligibility = [
    {
      wallet: A.w1,
      eligible: true,
      policyVersion: "elig-1",
      validFrom: "1799990000",
      revoked: false,
    },
  ];
  raw.locks = locks;
  const fx = loadCycleFixture(raw);
  const { weights } = computeWeights(fx.cycle, fx.epochStartBalances, fx.transfers, fx.locks);
  const w = weights.get(A.w1);
  if (w === undefined) throw new Error("missing weight");
  return w;
}

function fullEpochLock(tier: LockTier, principal: string): Record<string, unknown> {
  const start = E0 - 100;
  return {
    wallet: A.w1,
    rawPrincipal: principal,
    tier,
    startTimestamp: String(start),
    unlockTimestamp: String(start + Number(TIER_SPECS[tier].durationSeconds)),
  };
}

describe("veBPS multiplier and effective weight", () => {
  it("produces the canonical weights for 100,000 BPS across all five states (req 14)", () => {
    expect(w1Weight("100000", []).effectiveWeight).toBe(100_000n); // unlocked 1.00x
    expect(w1Weight("100000", [fullEpochLock("LOCK_7D", "100000")]).effectiveWeight).toBe(110_000n);
    expect(w1Weight("100000", [fullEpochLock("LOCK_14D", "100000")]).effectiveWeight).toBe(
      125_000n,
    );
    expect(w1Weight("100000", [fullEpochLock("LOCK_21D", "100000")]).effectiveWeight).toBe(
      150_000n,
    );
    expect(w1Weight("100000", [fullEpochLock("LOCK_30D", "100000")]).effectiveWeight).toBe(
      175_000n,
    );
  });

  it("does not double-count a partially locked balance (req 13)", () => {
    // 100,000 held; 40,000 locked in the 7-day tier for the whole epoch, 60,000 free.
    const w = w1Weight("100000", [fullEpochLock("LOCK_7D", "40000")]);
    expect(w.baseTwab).toBe(100_000n);
    expect(w.unlockedTwab).toBe(60_000n);
    expect(w.lockedTwabByTier.LOCK_7D).toBe(40_000n);
    // 60,000 + floor(40,000 * 11000 / 10000) = 60,000 + 44,000 = 104,000.
    expect(w.effectiveWeight).toBe(104_000n);
  });

  it("applies bonus only while start <= t < unlock, then 1.00x (unlock boundary, req 15)", () => {
    // Lock unlocks exactly halfway; duration still a valid 7-day span.
    const unlock = E0 + 450;
    const start = unlock - Number(TIER_SPECS.LOCK_7D.durationSeconds);
    const w = w1Weight("100000", [
      {
        wallet: A.w1,
        rawPrincipal: "100000",
        tier: "LOCK_7D",
        startTimestamp: String(start),
        unlockTimestamp: String(unlock),
      },
    ]);
    // Bonus for first 450s (locked TWAB 50,000), free for last 450s (unlocked TWAB 50,000).
    expect(w.lockedTwabByTier.LOCK_7D).toBe(50_000n);
    expect(w.unlockedTwab).toBe(50_000n);
    // 50,000 + floor(50,000 * 11000 / 10000) = 50,000 + 55,000 = 105,000.
    expect(w.effectiveWeight).toBe(105_000n);
  });

  it("ends bonus at an early withdrawal without overlapping accounting (withdrawal boundary, req 15)", () => {
    const start = E0 - 100;
    const w = w1Weight("100000", [
      {
        wallet: A.w1,
        rawPrincipal: "100000",
        tier: "LOCK_7D",
        startTimestamp: String(start),
        unlockTimestamp: String(start + Number(TIER_SPECS.LOCK_7D.durationSeconds)),
        withdrawalTimestamp: String(E0 + 450), // early withdrawal ends bonus at the halfway point
      },
    ]);
    expect(w.lockedTwabByTier.LOCK_7D).toBe(50_000n);
    expect(w.unlockedTwab).toBe(50_000n);
    expect(w.effectiveWeight).toBe(105_000n);
  });

  it("grants no bonus before a lock start (start boundary, req 15)", () => {
    const start = E0 + 450; // lock begins halfway through the epoch
    const w = w1Weight("100000", [
      {
        wallet: A.w1,
        rawPrincipal: "100000",
        tier: "LOCK_7D",
        startTimestamp: String(start),
        unlockTimestamp: String(start + Number(TIER_SPECS.LOCK_7D.durationSeconds)),
      },
    ]);
    // Free for first 450s, locked for last 450s.
    expect(w.unlockedTwab).toBe(50_000n);
    expect(w.lockedTwabByTier.LOCK_7D).toBe(50_000n);
    expect(w.effectiveWeight).toBe(105_000n);
  });
});
