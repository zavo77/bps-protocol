import { describe, expect, it } from "vitest";
import { epochBoundsOf, epochEndOf, epochIdOf, epochStartOf } from "./epoch.js";

describe("epoch derivation (exact 15-minute UTC epochs)", () => {
  it("derives epochId, start, and end via floor(ts/900)", () => {
    // 1_800_000_450 is 450s into epoch 2_000_000 (start 1_800_000_000).
    const ts = 1_800_000_450n;
    expect(epochIdOf(ts)).toBe(2_000_000n);
    expect(epochStartOf(2_000_000n)).toBe(1_800_000_000n);
    expect(epochEndOf(2_000_000n)).toBe(1_800_000_900n);
    expect(epochBoundsOf(ts)).toEqual({
      epochId: 2_000_000n,
      epochStart: 1_800_000_000n,
      epochEnd: 1_800_000_900n,
    });
  });

  it("maps epoch-start and last-second of an epoch to the same epoch", () => {
    expect(epochIdOf(1_800_000_000n)).toBe(2_000_000n); // exact start
    expect(epochIdOf(1_800_000_899n)).toBe(2_000_000n); // last second
    expect(epochIdOf(1_800_000_900n)).toBe(2_000_001n); // next epoch start
  });
});
