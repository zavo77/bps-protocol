// TASK 10I-2 — corrected price-guard tests (policy-pinned feed identity + semantics, roundId).
// TASK 10I-1 — corrected price-guard tests. Expected values independently derived by hand from
//   expected = floor(sellRaw * inAnswer * 10^outFeedDec * 10^outDec * perTokenDen
//                    / (10^sellDec * 10^inFeedDec * perTokenNum))
// All values LOCAL_TEST_ONLY; no production feed, threshold, cap or sequencer value is approved.
import { describe, expect, it } from "vitest";
import {
  validateAcquisitionPrice,
  type AcquisitionPriceInput,
  type PriceRiskPolicy,
  type SequencerObservation,
  type StockTokenState,
  type UsdPriceObservation,
} from "./price-guard.js";

const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec";
const SEQ_ID = "local-test-sequencer-feed";
const IN_ID = "local-test-weth-usd-feed";
const OUT_ID = "local-test-nvda-token-feed";
const E18 = 10n ** 18n;
const NOW = 1_000_100n;

const POLICY: PriceRiskPolicy = {
  maxStalenessSec: 300n,
  maxDeviationBps: 100n,
  maxTxInputRaw: 10n ** 21n,
  sequencerFeedIdentity: SEQ_ID,
  sequencerGraceSec: 600n,
  inputFeedIdentity: IN_ID,
  outputFeedIdentity: OUT_ID,
  outputSemantics: "PER_TOKEN_CHAINLINK",
  allowRawUnderlyingForEvidence: false,
};

function seq(over: Partial<SequencerObservation> = {}): SequencerObservation {
  return {
    feedIdentity: SEQ_ID,
    answer: 0n,
    startedAtSec: NOW - 10_000n,
    updatedAtSec: NOW - 5n,
    ...over,
  };
}

function inFeed(over: Partial<UsdPriceObservation> = {}): UsdPriceObservation {
  // WETH at $2,000, 8-decimals feed
  return {
    semantics: "PER_TOKEN_CHAINLINK",
    feedIdentity: IN_ID,
    asset: WETH,
    answer: 2_000n * 10n ** 8n,
    decimals: 8,
    roundId: 100n,
    updatedAtSec: NOW - 60n,
    roundComplete: true,
    observedAtBlock: 19_000_000n,
    ...over,
  };
}

function outFeed(over: Partial<UsdPriceObservation> = {}): UsdPriceObservation {
  // NVDA Stock Token at $200 PER TOKEN (multiplier already included), 8-decimals feed
  return {
    semantics: "PER_TOKEN_CHAINLINK",
    feedIdentity: OUT_ID,
    asset: NVDA,
    answer: 200n * 10n ** 8n,
    decimals: 8,
    roundId: 100n,
    updatedAtSec: NOW - 60n,
    roundComplete: true,
    observedAtBlock: 19_000_000n,
    ...over,
  };
}

const STATE: StockTokenState = {
  multiplierE18: E18,
  transitionPending: false,
  oraclePaused: false,
};

function io(over: Partial<AcquisitionPriceInput> = {}): AcquisitionPriceInput {
  // 1 WETH ($2000) -> expect 10 NVDA tokens ($200 each) = 10e18 raw
  return {
    sellToken: WETH,
    sellAmountRaw: E18,
    sellDecimals: 18,
    buyToken: NVDA,
    minBuyAmountRaw: 10n * E18,
    buyDecimals: 18,
    nowSec: NOW,
    ...over,
  };
}

const run = (
  o: Partial<AcquisitionPriceInput> = {},
  inO: Partial<UsdPriceObservation> = {},
  outO: Partial<UsdPriceObservation> = {},
  state: StockTokenState = STATE,
  s: SequencerObservation | null = seq(),
  policy: PriceRiskPolicy | null = POLICY,
) => validateAcquisitionPrice(io(o), inFeed(inO), outFeed(outO), state, s, policy);

describe("corrected acquisition price guard (two-feed, typed semantics)", () => {
  it("1. equal token/feed decimals: exact expected output", () => {
    // hand-derived: 1e18*2000e8*1e8*1e18 / (1e18*1e8*200e8) = 10e18
    const r = run();
    expect(r.expectedBuyAmountRaw).toBe(10n * E18);
    expect(r.deviationBpsObserved).toBe(0n);
    expect(r.justification.multiplierApplied).toBe(false);
  });

  it("2. different input/output TOKEN decimals (6-dec output token)", () => {
    // 1e18 WETH -> 10 tokens at 6 decimals = 10_000_000
    const r = run({ buyDecimals: 6, minBuyAmountRaw: 10_000_000n });
    expect(r.expectedBuyAmountRaw).toBe(10_000_000n);
  });

  it("3. different input/output FEED decimals (18-dec input feed, 8-dec output feed)", () => {
    // hand-derived: 1e18*2000e18*1e8*1e18 / (1e18*1e18*200e8) = 10e18
    const r = run({}, { answer: 2_000n * E18, decimals: 18 });
    expect(r.expectedBuyAmountRaw).toBe(10n * E18);
  });

  it("4. 2^200-scale integers never traverse JS number", () => {
    const big = 2n ** 200n;
    const r = run({ sellAmountRaw: big, minBuyAmountRaw: big * 10n }, {}, {}, STATE, seq(), {
      ...POLICY,
      maxTxInputRaw: big,
    });
    // hand-derived: big * 2000e8 * 1e8 * 1e18 / (1e18 * 1e8 * 200e8) = 10*big
    expect(r.expectedBuyAmountRaw).toBe(10n * big);
  });

  it("5. conservative floor boundary (repeating division floors DOWN)", () => {
    // $2000 into $300/token: floor(1e18 * 2000/300) = 6_666_666_666_666_666_666
    const expected = 6_666_666_666_666_666_666n;
    const r = run({ minBuyAmountRaw: expected }, {}, { answer: 300n * 10n ** 8n });
    expect(r.expectedBuyAmountRaw).toBe(expected);
  });

  it("6. zero and negative feed values fail", () => {
    expect(() => run({}, { answer: 0n })).toThrowError(/NON_POSITIVE_ANSWER/);
    expect(() => run({}, {}, { answer: -5n })).toThrowError(/NON_POSITIVE_ANSWER/);
  });

  it("7. stale and incomplete rounds fail (both feeds)", () => {
    expect(() => run({}, { updatedAtSec: NOW - 301n })).toThrowError(/STALE_ANSWER/);
    expect(() => run({}, {}, { updatedAtSec: NOW - 301n })).toThrowError(/STALE_ANSWER/);
    expect(() => run({}, { roundComplete: false })).toThrowError(/INCOMPLETE_ROUND/);
    expect(() => run({}, {}, { roundComplete: false })).toThrowError(/INCOMPLETE_ROUND/);
  });

  it("8. PER_TOKEN mode with multiplier 1x: feed used directly", () => {
    const r = run();
    expect(r.justification.outputFeed.semantics).toBe("PER_TOKEN_CHAINLINK");
    expect(r.justification.multiplierApplied).toBe(false);
  });

  it("9. PER_TOKEN mode with multiplier 10x: adjusted feed used directly, NOT re-multiplied", () => {
    // Post-10x-split feed reports $20/token. $2000 input => 100 tokens. Re-multiplying by 10x
    // (the 10H-1 defect against a per-token feed) would claim 1000 tokens — must not happen.
    const r = run(
      { minBuyAmountRaw: 100n * E18 },
      {},
      { answer: 20n * 10n ** 8n },
      { ...STATE, multiplierE18: 10n * E18 },
    );
    expect(r.expectedBuyAmountRaw).toBe(100n * E18);
    expect(r.justification.multiplierApplied).toBe(false);
  });

  it("10. PER_TOKEN mode with multiplier 0.5x: feed remains the sole price input", () => {
    // Reverse split: feed reports $400/token; $2000 => 5 tokens regardless of multiplier field.
    const r = run(
      { minBuyAmountRaw: 5n * E18 },
      {},
      { answer: 400n * 10n ** 8n },
      { ...STATE, multiplierE18: E18 / 2n },
    );
    expect(r.expectedBuyAmountRaw).toBe(5n * E18);
  });

  it("11. RAW_UNDERLYING (evidence mode) applies the multiplier EXACTLY once — only when approved", () => {
    // underlying $20/share, multiplier 10x => per-token $200 => $2000 buys 10 tokens.
    const rawOut: Partial<UsdPriceObservation> = {
      semantics: "RAW_UNDERLYING",
      answer: 20n * 10n ** 8n,
    };
    expect(() =>
      run(
        { minBuyAmountRaw: 10n * E18 },
        {},
        rawOut,
        { ...STATE, multiplierE18: 10n * E18 },
        seq(),
        {
          ...POLICY,
          outputSemantics: "RAW_UNDERLYING",
        },
      ),
    ).toThrowError(/RAW_UNDERLYING_NOT_APPROVED/);
    const r = run(
      { minBuyAmountRaw: 10n * E18 },
      {},
      rawOut,
      { ...STATE, multiplierE18: 10n * E18 },
      seq(),
      { ...POLICY, allowRawUnderlyingForEvidence: true, outputSemantics: "RAW_UNDERLYING" },
    );
    expect(r.expectedBuyAmountRaw).toBe(10n * E18);
    expect(r.justification.multiplierApplied).toBe(true);
  });

  it("12. split continuity: token-unit value continuous across the corporate action", () => {
    // Before: underlying $200, mult 1x, token feed $200 -> 10 tokens.
    const before = run();
    // After: underlying $20, mult 10x, token feed STILL $200 -> 10 tokens (docs continuity).
    const after = run({}, {}, { answer: 200n * 10n ** 8n }, { ...STATE, multiplierE18: 10n * E18 });
    expect(after.expectedBuyAmountRaw).toBe(before.expectedBuyAmountRaw);
  });

  it("13. pending multiplier transition fails closed", () => {
    expect(() => run({}, {}, {}, { ...STATE, transitionPending: true })).toThrowError(
      /MULTIPLIER_TRANSITION/,
    );
  });

  it("14. oraclePaused == true makes the price unavailable", () => {
    expect(() => run({}, {}, {}, { ...STATE, oraclePaused: true })).toThrowError(/ORACLE_PAUSED/);
  });

  it("15. feed/token semantic + asset binding mismatches fail", () => {
    expect(() => run({}, { asset: NVDA })).toThrowError(/ASSET_BINDING_MISMATCH/);
    expect(() => run({}, {}, { asset: WETH })).toThrowError(/ASSET_BINDING_MISMATCH/);
    expect(() => run({}, { semantics: "RAW_UNDERLYING" })).toThrowError(/SEMANTICS_MISMATCH/);
  });

  it("16. double-multiplier application is unrepresentable in PER_TOKEN mode", () => {
    const at1x = run();
    const at10x = run({}, {}, {}, { ...STATE, multiplierE18: 10n * E18 });
    expect(at10x.expectedBuyAmountRaw).toBe(at1x.expectedBuyAmountRaw);
    expect(at10x.justification.multiplierApplied).toBe(false);
  });

  it("17. missing input feed fails closed", () => {
    expect(() =>
      validateAcquisitionPrice(io(), null, outFeed(), STATE, seq(), POLICY),
    ).toThrowError(/PRICE_FEED_MISSING/);
  });

  it("18. missing output feed fails closed", () => {
    expect(() => validateAcquisitionPrice(io(), inFeed(), null, STATE, seq(), POLICY)).toThrowError(
      /PRICE_FEED_MISSING/,
    );
  });

  it("19. missing risk policy fails closed", () => {
    expect(() =>
      validateAcquisitionPrice(io(), inFeed(), outFeed(), STATE, seq(), null),
    ).toThrowError(/PRICE_POLICY_MISSING/);
  });

  it("20. quote minimum below the independent-price floor fails; at the band edge passes", () => {
    // minAllowed = 10e18 * (10000-100)/10000 = 9.9e18
    expect(run({ minBuyAmountRaw: 99n * 10n ** 17n }).deviationBpsObserved).toBe(100n);
    expect(() => run({ minBuyAmountRaw: 99n * 10n ** 17n - 1n })).toThrowError(
      /DEVIATION_EXCEEDED/,
    );
  });

  it("cap + zero-amount + future-timestamp guards retained", () => {
    expect(() => run({ sellAmountRaw: POLICY.maxTxInputRaw + 1n })).toThrowError(/TX_CAP_EXCEEDED/);
    expect(() => run({ sellAmountRaw: 0n })).toThrowError(/UNSAFE_NUMBER/);
    // isolate the FEED future-timestamp guard (sequencer round kept valid for the shifted clock)
    expect(() =>
      run(
        { nowSec: NOW - 200_000n },
        {},
        {},
        STATE,
        seq({ startedAtSec: NOW - 300_000n, updatedAtSec: NOW - 300_000n }),
      ),
    ).toThrowError(/UNSAFE_NUMBER/);
  });

  it("absurd decimals rejected (no unbounded exponentiation)", () => {
    expect(() => run({}, { decimals: 99 })).toThrowError(/BAD_DECIMALS/);
  });
});

describe("L2 sequencer machinery (policy-neutral, fail-closed)", () => {
  it("missing sequencer observation or unconfigured identity fails closed", () => {
    expect(() =>
      validateAcquisitionPrice(io(), inFeed(), outFeed(), STATE, null, POLICY),
    ).toThrowError(/SEQUENCER_POLICY_MISSING/);
    expect(() =>
      validateAcquisitionPrice(io(), inFeed(), outFeed(), STATE, seq(), {
        ...POLICY,
        sequencerFeedIdentity: "",
      }),
    ).toThrowError(/SEQUENCER_POLICY_MISSING/);
  });

  it("substituted feed identity is rejected", () => {
    expect(() => run({}, {}, {}, STATE, seq({ feedIdentity: "attacker-feed" }))).toThrowError(
      /SEQUENCER_POLICY_MISSING/,
    );
  });

  it("sequencer down (answer != 0) fails", () => {
    expect(() => run({}, {}, {}, STATE, seq({ answer: 1n }))).toThrowError(/SEQUENCER_DOWN/);
  });

  it("within the recovery grace period fails", () => {
    expect(() => run({}, {}, {}, STATE, seq({ startedAtSec: NOW - 599n }))).toThrowError(
      /SEQUENCER_GRACE_PERIOD/,
    );
  });

  it("invalid round/timestamp data fails", () => {
    expect(() => run({}, {}, {}, STATE, seq({ startedAtSec: 0n }))).toThrowError(
      /SEQUENCER_BAD_ROUND/,
    );
  });
});

// TASK 10I-2 additions: adversarial relabeling, policy-pinned identity, roundId, uint256 domain.
describe("10I-2 structural guarantees (policy-pinned semantics + identity)", () => {
  it("raw-underlying data relabeled as PER_TOKEN cannot pass under a PER_TOKEN policy (feed identity + semantics pinned by policy)", () => {
    // Attacker supplies raw-underlying numbers but stamps semantics PER_TOKEN + the real out identity.
    // With multiplier 10x and per-token feed answer left at $200 the relabel would (if accepted)
    // undervalue the token 10x and loosen the floor. The output-semantics pin still matches
    // (attacker set PER_TOKEN), so the DEEPER protection is: the guard NEVER multiplies in
    // PER_TOKEN mode, so relabeled raw data is simply used as the (wrong) per-token price and the
    // deviation floor rejects an inconsistent minimum. Here we prove the inverse: RAW data that
    // needs the multiplier can ONLY be honored via the explicitly approved RAW_UNDERLYING policy.
    const rawNumbers = { answer: 20n * 10n ** 8n }; // $20 underlying; per-token would be $200 at 10x
    // Under a PER_TOKEN policy, $20 "per token" => $2000 buys 100 tokens; asking for 10 (the real
    // per-token amount) is far below floor -> rejected. The relabel cannot yield the 10x windfall.
    expect(() =>
      run({ minBuyAmountRaw: 10n * E18 }, {}, rawNumbers, { ...STATE, multiplierE18: 10n * E18 }),
    ).toThrowError(/DEVIATION_EXCEEDED/);
  });

  it("output semantics mismatch vs policy fails closed (SEMANTICS_MISMATCH)", () => {
    // observation labeled RAW_UNDERLYING but policy declares PER_TOKEN
    expect(() => run({}, {}, { semantics: "RAW_UNDERLYING" })).toThrowError(/SEMANTICS_MISMATCH/);
  });

  it("wrong feed identity is rejected even with correct asset (no relabeling by string)", () => {
    expect(() => run({}, { feedIdentity: "attacker-in-feed" })).toThrowError(
      /FEED_IDENTITY_MISMATCH/,
    );
    expect(() => run({}, {}, { feedIdentity: "attacker-out-feed" })).toThrowError(
      /FEED_IDENTITY_MISMATCH/,
    );
  });

  it("unpinned feed identity in policy fails closed (FEED_BINDING_MISSING)", () => {
    expect(() => run({}, {}, {}, STATE, seq(), { ...POLICY, outputFeedIdentity: "" })).toThrowError(
      /FEED_BINDING_MISSING/,
    );
    expect(() => run({}, {}, {}, STATE, seq(), { ...POLICY, inputFeedIdentity: "" })).toThrowError(
      /FEED_BINDING_MISSING/,
    );
  });

  it("zero roundId is rejected on either feed", () => {
    expect(() => run({}, { roundId: 0n })).toThrowError(/ZERO_ROUND/);
    expect(() => run({}, {}, { roundId: 0n })).toThrowError(/ZERO_ROUND/);
  });

  it("zero updatedAt is rejected (INCOMPLETE_ROUND)", () => {
    expect(() => run({}, { updatedAtSec: 0n })).toThrowError(/INCOMPLETE_ROUND/);
  });

  it("changing uiMultiplier with the per-token feed answer unchanged CANNOT change expected output", () => {
    const base = run().expectedBuyAmountRaw;
    for (const m of [1n, 2n, 5n, 10n, 100n, 1000n]) {
      const r = run({}, {}, {}, { ...STATE, multiplierE18: m * E18 });
      expect(r.expectedBuyAmountRaw).toBe(base);
      expect(r.justification.multiplierApplied).toBe(false);
    }
  });

  it("oversized bigint input beyond uint256 is rejected before exponentiation (AMOUNT_OUT_OF_DOMAIN)", () => {
    const over = 2n ** 256n;
    expect(() =>
      run({ sellAmountRaw: over, minBuyAmountRaw: 1n }, {}, {}, STATE, seq(), {
        ...POLICY,
        maxTxInputRaw: over + 1n,
      }),
    ).toThrowError(/AMOUNT_OUT_OF_DOMAIN/);
  });

  it("feed answer beyond uint256 is rejected (AMOUNT_OUT_OF_DOMAIN)", () => {
    expect(() => run({}, { answer: 2n ** 256n })).toThrowError(/AMOUNT_OUT_OF_DOMAIN/);
  });

  it("large values (2^250, expected within uint256) handled exactly without JS number", () => {
    const near = 2n ** 250n; // near*10 stays < uint256 max
    const r = run({ sellAmountRaw: near, minBuyAmountRaw: near * 10n }, {}, {}, STATE, seq(), {
      ...POLICY,
      maxTxInputRaw: 2n ** 256n - 1n,
    });
    // expected = near * 2000e8 * 1e8 * 1e18 / (1e18 * 1e8 * 200e8) = near * 10
    expect(r.expectedBuyAmountRaw).toBe(near * 10n);
    expect(r.deviationBpsObserved).toBe(0n);
  });
});
