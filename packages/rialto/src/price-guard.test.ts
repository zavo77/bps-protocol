// TASK 10H-1 — independent price-guard tests (all offline; integer-only).
import { describe, expect, it } from "vitest";
import {
  validateIndependentPrice,
  type MultiplierState,
  type PriceGuardInput,
  type PriceRiskPolicy,
  type ReferencePriceObservation,
} from "./price-guard.js";

const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec";
const E18 = 10n ** 18n;

// LOCAL_TEST_ONLY policy values — the repository has NO approved policy (decision pack #10/#12);
// these exist purely to exercise the machinery and are never defaults.
const POLICY: PriceRiskPolicy = {
  maxStalenessSec: 300n,
  maxDeviationBps: 100n,
  maxTxInputRaw: 10n ** 18n,
};

function feed(over: Partial<ReferencePriceObservation> = {}): ReferencePriceObservation {
  return {
    // 0.1 WETH per whole underlying share, 18-decimals feed
    answer: E18 / 10n,
    decimals: 18,
    updatedAtSec: 1_000_000n,
    roundComplete: true,
    baseAsset: NVDA,
    quoteAsset: WETH,
    observedAtBlock: 19_000_000n,
    ...over,
  };
}

const MULT: MultiplierState = { currentE18: E18, transitionPending: false };

function io(over: Partial<PriceGuardInput> = {}): PriceGuardInput {
  return {
    sellToken: WETH,
    sellAmountRaw: E18 / 100n, // 0.01 WETH
    sellDecimals: 18,
    buyToken: NVDA,
    // 0.01 WETH at 0.1 WETH/share => 0.1 share = 1e17 raw at 1e18 multiplier
    minBuyAmountRaw: 10n ** 17n,
    buyDecimals: 18,
    nowSec: 1_000_100n,
    ...over,
  };
}

describe("independent price guard (fail-closed)", () => {
  it("missing policy fails closed (the production default)", () => {
    expect(() => validateIndependentPrice(io(), feed(), MULT, null)).toThrowError(
      /PRICE_POLICY_MISSING/,
    );
  });

  it("missing feed fails closed", () => {
    expect(() => validateIndependentPrice(io(), null, MULT, POLICY)).toThrowError(
      /PRICE_FEED_MISSING/,
    );
  });

  it("missing multiplier state fails closed", () => {
    expect(() => validateIndependentPrice(io(), feed(), null, POLICY)).toThrowError(
      /MULTIPLIER_MISSING/,
    );
  });

  it("exact-price quote passes and records justification", () => {
    const r = validateIndependentPrice(io(), feed(), MULT, POLICY);
    expect(r.expectedBuyAmountRaw).toBe(10n ** 17n);
    expect(r.deviationBpsObserved).toBe(0n);
    expect(r.justification.observedAtBlock).toBe("19000000");
  });

  it("multiplier is applied correctly (2x split doubles expected raw output)", () => {
    const r = validateIndependentPrice(
      io({ minBuyAmountRaw: 2n * 10n ** 17n }),
      feed(),
      { currentE18: 2n * E18, transitionPending: false },
      POLICY,
    );
    expect(r.expectedBuyAmountRaw).toBe(2n * 10n ** 17n);
  });

  it("wrong multiplier (quote priced pre-split) is caught by deviation", () => {
    // multiplier now 2x, but quote min-output still 1e17 (pre-split units) => 50% deviation
    expect(() =>
      validateIndependentPrice(
        io(),
        feed(),
        { currentE18: 2n * E18, transitionPending: false },
        POLICY,
      ),
    ).toThrowError(/DEVIATION_EXCEEDED/);
  });

  it("pending multiplier transition fails closed (no approved transition rule)", () => {
    expect(() =>
      validateIndependentPrice(io(), feed(), { currentE18: E18, transitionPending: true }, POLICY),
    ).toThrowError(/MULTIPLIER_TRANSITION/);
  });

  it("zero and negative answers fail", () => {
    expect(() => validateIndependentPrice(io(), feed({ answer: 0n }), MULT, POLICY)).toThrowError(
      /NON_POSITIVE_ANSWER/,
    );
    expect(() => validateIndependentPrice(io(), feed({ answer: -1n }), MULT, POLICY)).toThrowError(
      /NON_POSITIVE_ANSWER/,
    );
  });

  it("stale answer fails per configured policy", () => {
    expect(() =>
      validateIndependentPrice(io({ nowSec: 1_000_000n + 301n }), feed(), MULT, POLICY),
    ).toThrowError(/STALE_ANSWER/);
  });

  it("incomplete round fails", () => {
    expect(() =>
      validateIndependentPrice(io(), feed({ roundComplete: false }), MULT, POLICY),
    ).toThrowError(/INCOMPLETE_ROUND/);
  });

  it("decimal mismatch is normalized exactly (8-decimals feed)", () => {
    const r = validateIndependentPrice(
      io(),
      feed({ answer: 10_000_000n, decimals: 8 }), // 0.1 in 8 decimals
      MULT,
      POLICY,
    );
    expect(r.expectedBuyAmountRaw).toBe(10n ** 17n);
  });

  it("absurd decimals are rejected (unsafe-number prevention)", () => {
    expect(() => validateIndependentPrice(io(), feed({ decimals: 99 }), MULT, POLICY)).toThrowError(
      /BAD_DECIMALS/,
    );
  });

  it("future-dated feed timestamp is rejected", () => {
    expect(() =>
      validateIndependentPrice(io({ nowSec: 999_999n }), feed(), MULT, POLICY),
    ).toThrowError(/UNSAFE_NUMBER/);
  });

  it("asset-binding mismatch fails (feed for another pair)", () => {
    expect(() =>
      validateIndependentPrice(
        io(),
        feed({ baseAsset: "0x00000000000000000000000000000000000000ee" }),
        MULT,
        POLICY,
      ),
    ).toThrowError(/ASSET_BINDING_MISMATCH/);
  });

  it("transaction cap is enforced", () => {
    expect(() =>
      validateIndependentPrice(io({ sellAmountRaw: 2n * 10n ** 18n }), feed(), MULT, POLICY),
    ).toThrowError(/TX_CAP_EXCEEDED/);
  });

  it("quote outside the approved deviation band fails; inside passes", () => {
    // minAllowed = expected * (1 - 1%) = 0.99e17
    expect(
      validateIndependentPrice(io({ minBuyAmountRaw: 99n * 10n ** 15n }), feed(), MULT, POLICY)
        .deviationBpsObserved,
    ).toBe(100n);
    expect(() =>
      validateIndependentPrice(
        io({ minBuyAmountRaw: 99n * 10n ** 15n - 1n }),
        feed(),
        MULT,
        POLICY,
      ),
    ).toThrowError(/DEVIATION_EXCEEDED/);
  });

  it("zero amounts fail", () => {
    expect(() =>
      validateIndependentPrice(io({ sellAmountRaw: 0n }), feed(), MULT, POLICY),
    ).toThrowError(/UNSAFE_NUMBER/);
    expect(() =>
      validateIndependentPrice(io({ minBuyAmountRaw: 0n }), feed(), MULT, POLICY),
    ).toThrowError(/UNSAFE_NUMBER/);
  });
});

// TASK 10H-2 review addition: explicit arithmetic matrix across differing token/feed decimals and
// multiplier states, with independently derived expected values (all LOCAL_TEST_ONLY).
describe("price-guard arithmetic matrix (decimals x multiplier)", () => {
  interface Case {
    name: string;
    sellDec: number;
    buyDec: number;
    feedDec: number;
    answer: bigint; // price of one whole underlying share in quote units at feedDec
    multE18: bigint;
    sellRaw: bigint;
    expected: bigint; // independently derived: sellRaw*10^buyDec*10^feedDec*mult / (answer*10^sellDec*1e18)
  }
  const cases: Case[] = [
    {
      name: "18/18/18 mult 1x",
      sellDec: 18,
      buyDec: 18,
      feedDec: 18,
      answer: 10n ** 17n, // 0.1
      multE18: E18,
      sellRaw: 10n ** 16n, // 0.01
      expected: 10n ** 17n, // 0.1 share
    },
    {
      name: "18-dec sell, 6-dec buy, 8-dec feed, mult 1x",
      sellDec: 18,
      buyDec: 6,
      feedDec: 8,
      answer: 5n * 10n ** 7n, // 0.5 in 8 decimals
      multE18: E18,
      sellRaw: 10n ** 18n, // 1.0 sell unit
      expected: 2_000_000n, // 2.0 shares at 6 decimals
    },
    {
      name: "6-dec sell, 18-dec buy, 8-dec feed, mult 1x",
      sellDec: 6,
      buyDec: 18,
      feedDec: 8,
      answer: 25n * 10n ** 6n, // 0.25
      multE18: E18,
      sellRaw: 500_000n, // 0.5 sell units
      expected: 2n * 10n ** 18n, // 2.0 shares
    },
    {
      name: "10x split (mult 10e18) multiplies raw output",
      sellDec: 18,
      buyDec: 18,
      feedDec: 18,
      answer: 10n ** 18n, // 1.0
      multE18: 10n * E18,
      sellRaw: 3n * 10n ** 18n,
      expected: 30n * 10n ** 18n,
    },
    {
      name: "1/2 reverse-split (mult 0.5e18) halves raw output (floor)",
      sellDec: 18,
      buyDec: 18,
      feedDec: 18,
      answer: 10n ** 18n,
      multE18: E18 / 2n,
      sellRaw: 3n * 10n ** 18n,
      expected: (3n * 10n ** 18n) / 2n,
    },
    {
      name: "large-magnitude inputs never traverse JS number (256-bit-scale)",
      sellDec: 18,
      buyDec: 18,
      feedDec: 18,
      answer: 10n ** 18n,
      multE18: E18,
      sellRaw: 2n ** 200n,
      expected: 2n ** 200n,
    },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const r = validateIndependentPrice(
        io({
          sellDecimals: c.sellDec,
          buyDecimals: c.buyDec,
          sellAmountRaw: c.sellRaw,
          minBuyAmountRaw: c.expected, // exact => passes with 0 observed deviation
        }),
        feed({ answer: c.answer, decimals: c.feedDec }),
        { currentE18: c.multE18, transitionPending: false },
        { ...POLICY, maxTxInputRaw: c.sellRaw }, // cap set to the case input (policy still explicit)
      );
      expect(r.expectedBuyAmountRaw).toBe(c.expected);
      expect(r.deviationBpsObserved).toBe(0n);
    });
  }

  it("floor rounds DOWN (conservative: never overstates expected output)", () => {
    // answer 3.0, sell 1.0 => exact 1/3 share = repeating; floor must truncate
    const r = validateIndependentPrice(
      io({ sellAmountRaw: 10n ** 18n, minBuyAmountRaw: 333333333333333333n }),
      feed({ answer: 3n * 10n ** 18n }),
      MULT,
      { ...POLICY, maxTxInputRaw: 10n ** 18n },
    );
    expect(r.expectedBuyAmountRaw).toBe(333333333333333333n); // floor(1e18/3)
  });
});
