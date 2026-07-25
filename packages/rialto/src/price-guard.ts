// TASK 10I-1 — corrected, policy-neutral, fail-closed independent price guard.
//
// AUTHORITATIVE SEMANTICS (verified 2026-07-25 against docs.chain.link tokenized-equity-feeds/
// robinhood and docs.robinhood.com/chain/oracles-and-price-feeds/):
//   - A Robinhood Stock Token Chainlink feed returns the USD price of ONE STOCK TOKEN with the
//     corporate-action multiplier ALREADY included ("Token Price = Underlying Equity Market Price x
//     Multiplier"; "you don't apply the multiplier yourself").
//   - Robinhood REST /prices returns the RAW underlying-equity price (NOT multiplier-adjusted) and
//     is NOT the settlement guard.
//   - Feeds pause and hold their last value during corporate actions; they have NO heartbeat during
//     off-hours; staleness must be checked via updatedAt.
//
// The 10H-1 implementation multiplied the answer by uiMultiplier — correct ONLY for a raw
// underlying price. Against the production Chainlink per-token feed that would DOUBLE-APPLY the
// multiplier. This rewrite makes price semantics an explicit type so the two sources can never be
// confused, and computes expected output from TWO independently bound token-unit USD prices:
//
//   expectedOutRaw = floor( sellRaw * inAnswer * 10^outFeedDec * 10^outDec
//                           / (10^sellDec * 10^inFeedDec * perTokenOutAnswer) )
//
// where perTokenOutAnswer is the feed answer directly for PER_TOKEN_CHAINLINK, and
// underlyingAnswer * multiplierE18 / 1e18 (applied EXACTLY once) for the explicitly gated
// RAW_UNDERLYING evidence/test mode. No JavaScript float or Number ever touches an amount; a single
// final floor keeps the estimate conservative.
//
// This module still ships with NO approved feed identity, staleness, deviation, cap, sequencer or
// grace values (founder decision pack). Missing policy fails closed.

export class PriceGuardError extends Error {
  constructor(
    readonly code: PriceGuardErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "PriceGuardError";
  }
}

export type PriceGuardErrorCode =
  | "PRICE_POLICY_MISSING"
  | "PRICE_FEED_MISSING"
  | "SEMANTICS_MISMATCH"
  | "RAW_UNDERLYING_NOT_APPROVED"
  | "NON_POSITIVE_ANSWER"
  | "STALE_ANSWER"
  | "INCOMPLETE_ROUND"
  | "BAD_DECIMALS"
  | "ORACLE_PAUSED"
  | "MULTIPLIER_MISSING"
  | "MULTIPLIER_TRANSITION"
  | "ASSET_BINDING_MISMATCH"
  | "FEED_IDENTITY_MISMATCH"
  | "FEED_BINDING_MISSING"
  | "ZERO_ROUND"
  | "AMOUNT_OUT_OF_DOMAIN"
  | "SEQUENCER_POLICY_MISSING"
  | "SEQUENCER_DOWN"
  | "SEQUENCER_GRACE_PERIOD"
  | "SEQUENCER_BAD_ROUND"
  | "TX_CAP_EXCEEDED"
  | "DEVIATION_EXCEEDED"
  | "UNSAFE_NUMBER";

/** Explicit price semantics — a caller cannot relabel one source as the other. */
export type PriceSemantics = "PER_TOKEN_CHAINLINK" | "RAW_UNDERLYING";

/** One independently bound token-unit USD price observation. */
export interface UsdPriceObservation {
  readonly semantics: PriceSemantics;
  readonly feedIdentity: string; // the specific feed this came from — pinned by policy, never relabeled
  readonly asset: string; // the token this observation prices — bound, never assumed
  readonly answer: bigint;
  readonly decimals: number;
  readonly roundId: bigint; // Chainlink roundId — must be > 0
  readonly updatedAtSec: bigint;
  readonly roundComplete: boolean;
  readonly observedAtBlock: bigint;
}

/** Availability/consistency state read from the official Stock Token contract. */
export interface StockTokenState {
  /** uiMultiplier scaled 1e18. CONSISTENCY/AVAILABILITY GUARD ONLY for PER_TOKEN_CHAINLINK. */
  readonly multiplierE18: bigint;
  /** newUIMultiplier()/effectiveAt() announced but not applied — fails closed. */
  readonly transitionPending: boolean;
  /** oraclePaused() — price must be unavailable while true. */
  readonly oraclePaused: boolean;
}

/** Chainlink-style L2 sequencer uptime observation (answer 0 = up, nonzero = down). */
export interface SequencerObservation {
  readonly feedIdentity: string; // configured identity — bound, never caller-substituted
  readonly answer: bigint;
  readonly startedAtSec: bigint;
  readonly updatedAtSec: bigint;
}

/** APPROVED policy values. None exist in-repo; every field must come from an approved record. */
export interface PriceRiskPolicy {
  readonly maxStalenessSec: bigint;
  readonly maxDeviationBps: bigint;
  readonly maxTxInputRaw: bigint;
  /** Configured sequencer feed identity + post-recovery grace (L2 guard). */
  readonly sequencerFeedIdentity: string;
  readonly sequencerGraceSec: bigint;
  /**
   * POLICY-PINNED feed bindings. The observation supplied at runtime MUST match all three, so a
   * caller cannot relabel raw-underlying data as a production Chainlink source by changing a field:
   * the policy — not the caller — declares which feed identity carries which semantics.
   */
  readonly inputFeedIdentity: string;
  readonly outputFeedIdentity: string;
  readonly outputSemantics: PriceSemantics;
  /** RAW_UNDERLYING is evidence/testing-only unless separately approved. Default MUST be false. */
  readonly allowRawUnderlyingForEvidence: boolean;
}

export interface AcquisitionPriceInput {
  readonly sellToken: string;
  readonly sellAmountRaw: bigint;
  readonly sellDecimals: number;
  readonly buyToken: string;
  readonly minBuyAmountRaw: bigint;
  readonly buyDecimals: number;
  readonly nowSec: bigint;
}

export interface PriceGuardResult {
  readonly expectedBuyAmountRaw: bigint;
  readonly minAllowedBuyAmountRaw: bigint;
  readonly deviationBpsObserved: bigint;
  readonly justification: {
    readonly inputFeed: { answer: string; decimals: number; updatedAtSec: string; block: string };
    readonly outputFeed: {
      answer: string;
      decimals: number;
      updatedAtSec: string;
      block: string;
      semantics: PriceSemantics;
    };
    readonly multiplierE18: string;
    readonly multiplierApplied: boolean;
  };
}

const BPS = 10_000n;
const E18 = 10n ** 18n;
const MAX_UINT256 = 2n ** 256n - 1n;

function pow10(n: number): bigint {
  if (!Number.isInteger(n) || n < 0 || n > 77) {
    throw new PriceGuardError("BAD_DECIMALS", `decimals out of safe range: ${n}`);
  }
  return 10n ** BigInt(n);
}

function checkFeed(
  feed: UsdPriceObservation | null,
  expectedAsset: string,
  expectedIdentity: string,
  expectedSemantics: PriceSemantics,
  which: string,
  nowSec: bigint,
  maxStalenessSec: bigint,
): UsdPriceObservation {
  if (feed === null) {
    throw new PriceGuardError("PRICE_FEED_MISSING", `${which} feed is not configured`);
  }
  if (expectedIdentity === "") {
    throw new PriceGuardError(
      "FEED_BINDING_MISSING",
      `${which} feed identity is not pinned by policy`,
    );
  }
  if (feed.feedIdentity !== expectedIdentity) {
    throw new PriceGuardError(
      "FEED_IDENTITY_MISMATCH",
      `${which} observation is not from the policy-pinned feed identity (no relabeling)`,
    );
  }
  if (feed.semantics !== expectedSemantics) {
    throw new PriceGuardError(
      "SEMANTICS_MISMATCH",
      `${which} feed semantics ${feed.semantics} != policy-declared ${expectedSemantics}`,
    );
  }
  if (feed.asset.toLowerCase() !== expectedAsset.toLowerCase()) {
    throw new PriceGuardError(
      "ASSET_BINDING_MISMATCH",
      `${which} feed prices ${feed.asset}, not ${expectedAsset}`,
    );
  }
  if (feed.answer <= 0n) {
    throw new PriceGuardError("NON_POSITIVE_ANSWER", `${which} answer must be positive`);
  }
  if (feed.answer > MAX_UINT256) {
    throw new PriceGuardError("AMOUNT_OUT_OF_DOMAIN", `${which} answer exceeds the uint256 domain`);
  }
  if (feed.roundId <= 0n) {
    throw new PriceGuardError("ZERO_ROUND", `${which} roundId must be positive`);
  }
  if (!feed.roundComplete) {
    throw new PriceGuardError("INCOMPLETE_ROUND", `${which} round is incomplete`);
  }
  if (feed.updatedAtSec <= 0n) {
    throw new PriceGuardError("INCOMPLETE_ROUND", `${which} updatedAt must be positive`);
  }
  if (nowSec < feed.updatedAtSec) {
    throw new PriceGuardError("UNSAFE_NUMBER", `${which} feed timestamp is in the future`);
  }
  if (nowSec - feed.updatedAtSec > maxStalenessSec) {
    throw new PriceGuardError(
      "STALE_ANSWER",
      `${which} answer exceeds the approved staleness (tokenized-equity feeds hold values off-hours; the published freshness limit governs)`,
    );
  }
  return feed;
}

function checkSequencer(
  seq: SequencerObservation | null,
  policy: PriceRiskPolicy,
  nowSec: bigint,
): void {
  if (policy.sequencerFeedIdentity === "" || policy.sequencerGraceSec < 0n) {
    throw new PriceGuardError(
      "SEQUENCER_POLICY_MISSING",
      "no approved sequencer feed identity / grace period is configured (fail closed)",
    );
  }
  if (seq === null) {
    throw new PriceGuardError("SEQUENCER_POLICY_MISSING", "sequencer observation unavailable");
  }
  if (seq.feedIdentity.toLowerCase() !== policy.sequencerFeedIdentity.toLowerCase()) {
    throw new PriceGuardError(
      "SEQUENCER_POLICY_MISSING",
      "sequencer observation is not from the configured feed identity (no substitution)",
    );
  }
  if (seq.startedAtSec <= 0n || seq.updatedAtSec <= 0n || nowSec < seq.startedAtSec) {
    throw new PriceGuardError("SEQUENCER_BAD_ROUND", "sequencer round data invalid");
  }
  if (seq.answer !== 0n) {
    throw new PriceGuardError("SEQUENCER_DOWN", "sequencer is not up");
  }
  if (nowSec - seq.startedAtSec < policy.sequencerGraceSec) {
    throw new PriceGuardError(
      "SEQUENCER_GRACE_PERIOD",
      "sequencer recovered too recently — configured grace period has not elapsed",
    );
  }
}

/**
 * Corrected independent acquisition-price validation over TWO bound USD feeds.
 * Throws on any missing input, semantic mismatch, availability failure, cap or deviation breach.
 */
export function validateAcquisitionPrice(
  io: AcquisitionPriceInput,
  inputFeed: UsdPriceObservation | null,
  outputFeed: UsdPriceObservation | null,
  tokenState: StockTokenState | null,
  sequencer: SequencerObservation | null,
  policy: PriceRiskPolicy | null,
): PriceGuardResult {
  if (policy === null) {
    throw new PriceGuardError(
      "PRICE_POLICY_MISSING",
      "no approved staleness/deviation/cap/sequencer policy exists — fail closed (decision pack)",
    );
  }
  checkSequencer(sequencer, policy, io.nowSec);
  // The input (WETH/ETH-USD) side never carries a corporate-action multiplier: its semantics are
  // ALWAYS PER_TOKEN_CHAINLINK, pinned here (not caller-declared). The output semantics are
  // policy-declared so raw-underlying data can never be relabeled as a production Chainlink source.
  const inF = checkFeed(
    inputFeed,
    io.sellToken,
    policy.inputFeedIdentity,
    "PER_TOKEN_CHAINLINK",
    "input",
    io.nowSec,
    policy.maxStalenessSec,
  );
  const outF = checkFeed(
    outputFeed,
    io.buyToken,
    policy.outputFeedIdentity,
    policy.outputSemantics,
    "output",
    io.nowSec,
    policy.maxStalenessSec,
  );
  if (tokenState === null) {
    throw new PriceGuardError("MULTIPLIER_MISSING", "stock token state unavailable");
  }
  if (tokenState.oraclePaused) {
    throw new PriceGuardError(
      "ORACLE_PAUSED",
      "oraclePaused() is true — price is unavailable during a corporate action",
    );
  }
  if (tokenState.transitionPending) {
    throw new PriceGuardError(
      "MULTIPLIER_TRANSITION",
      "pending multiplier transition — no approved transition rule exists (fail closed)",
    );
  }
  if (tokenState.multiplierE18 <= 0n) {
    throw new PriceGuardError("MULTIPLIER_MISSING", "multiplier must be positive");
  }
  if (io.sellAmountRaw <= 0n || io.minBuyAmountRaw <= 0n) {
    throw new PriceGuardError("UNSAFE_NUMBER", "amounts must be positive integers");
  }
  // Reject oversized bigint inputs at the server boundary (attacker-supplied huge values) before
  // any exponentiation. On-chain amounts live in the uint256 domain.
  if (io.sellAmountRaw > MAX_UINT256 || io.minBuyAmountRaw > MAX_UINT256) {
    throw new PriceGuardError("AMOUNT_OUT_OF_DOMAIN", "amount exceeds the uint256 domain");
  }
  if (io.sellAmountRaw > policy.maxTxInputRaw) {
    throw new PriceGuardError("TX_CAP_EXCEEDED", "input exceeds the approved per-transaction cap");
  }

  // Per-token USD price of the OUTPUT asset, in outF.decimals units.
  let perTokenNum: bigint; // numerator of per-token price
  let perTokenDen: bigint; // denominator of per-token price
  let multiplierApplied = false;
  if (outF.semantics === "PER_TOKEN_CHAINLINK") {
    // Feed already includes the multiplier — used DIRECTLY; multiplier is a guard only.
    perTokenNum = outF.answer;
    perTokenDen = 1n;
  } else {
    // RAW_UNDERLYING: evidence/testing only; multiplier applied EXACTLY once; must be approved.
    if (!policy.allowRawUnderlyingForEvidence) {
      throw new PriceGuardError(
        "RAW_UNDERLYING_NOT_APPROVED",
        "raw-underlying pricing is not approved for this configuration (fail closed)",
      );
    }
    perTokenNum = outF.answer * tokenState.multiplierE18;
    perTokenDen = E18;
    multiplierApplied = true;
  }

  // expected = sellRaw * inAnswer * 10^outFeedDec * 10^outDec * perTokenDen
  //            / (10^sellDec * 10^inFeedDec * perTokenNum)         — single conservative floor
  const numerator =
    io.sellAmountRaw * inF.answer * pow10(outF.decimals) * pow10(io.buyDecimals) * perTokenDen;
  const denominator = pow10(io.sellDecimals) * pow10(inF.decimals) * perTokenNum;
  const expected = numerator / denominator;
  if (expected <= 0n) {
    throw new PriceGuardError("DEVIATION_EXCEEDED", "expected output floors to zero");
  }
  const minAllowed = (expected * (BPS - policy.maxDeviationBps)) / BPS;
  if (io.minBuyAmountRaw < minAllowed) {
    throw new PriceGuardError(
      "DEVIATION_EXCEEDED",
      "quoted minimum output is below the approved deviation band vs the independent reference",
    );
  }
  const deviationBpsObserved =
    io.minBuyAmountRaw >= expected ? 0n : ((expected - io.minBuyAmountRaw) * BPS) / expected;

  return {
    expectedBuyAmountRaw: expected,
    minAllowedBuyAmountRaw: minAllowed,
    deviationBpsObserved,
    justification: {
      inputFeed: {
        answer: inF.answer.toString(10),
        decimals: inF.decimals,
        updatedAtSec: inF.updatedAtSec.toString(10),
        block: inF.observedAtBlock.toString(10),
      },
      outputFeed: {
        answer: outF.answer.toString(10),
        decimals: outF.decimals,
        updatedAtSec: outF.updatedAtSec.toString(10),
        block: outF.observedAtBlock.toString(10),
        semantics: outF.semantics,
      },
      multiplierE18: tokenState.multiplierE18.toString(10),
      multiplierApplied,
    },
  };
}
