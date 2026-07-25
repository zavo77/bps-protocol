// TASK 10H-1 — policy-neutral, fail-closed independent price guard.
//
// A venue-supplied amountOutMinimum is NOT an independent price guard. This module compares the
// quoted/minimum output against an INDEPENDENT reference price, with explicit corporate-action
// multiplier handling. It ships with NO feed address, NO staleness limit, NO deviation limit and NO
// transaction cap: all of those are approved-policy inputs (founder decision pack #10/#12). Absent
// policy or feed data fails closed. Integer arithmetic only — no JavaScript float ever touches an
// amount.

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
  | "NON_POSITIVE_ANSWER"
  | "STALE_ANSWER"
  | "INCOMPLETE_ROUND"
  | "BAD_DECIMALS"
  | "MULTIPLIER_MISSING"
  | "MULTIPLIER_TRANSITION"
  | "ASSET_BINDING_MISMATCH"
  | "TX_CAP_EXCEEDED"
  | "DEVIATION_EXCEEDED"
  | "UNSAFE_NUMBER";

/** Independent reference price observation (e.g. a Chainlink-style round), all explicit. */
export interface ReferencePriceObservation {
  /** Quote asset units of price feed per ONE whole unit of the UNDERLYING (pre-multiplier) share. */
  readonly answer: bigint;
  readonly decimals: number;
  readonly updatedAtSec: bigint;
  readonly roundComplete: boolean;
  /** The pair this observation is FOR — bound explicitly, never assumed. */
  readonly baseAsset: string; // the stock token address this prices
  readonly quoteAsset: string; // the input asset address (e.g. WETH) or a USD sentinel per policy
  readonly observedAtBlock: bigint;
}

/** Corporate-action multiplier state read from the official token contract. */
export interface MultiplierState {
  /** uiMultiplier scaled 1e18 (1e18 = 1.0x). */
  readonly currentE18: bigint;
  /** True when an announced-but-unapplied multiplier change is in effect — fails closed. */
  readonly transitionPending: boolean;
}

/** APPROVED policy values. None exist in-repo today; callers must supply an approved record. */
export interface PriceRiskPolicy {
  readonly maxStalenessSec: bigint;
  readonly maxDeviationBps: bigint; // quoted output may be below reference-expected by at most this
  readonly maxTxInputRaw: bigint; // per-transaction input cap in input-asset base units
}

export interface PriceGuardInput {
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
    readonly feedAnswer: string;
    readonly feedDecimals: number;
    readonly feedUpdatedAtSec: string;
    readonly observedAtBlock: string;
    readonly multiplierE18: string;
  };
}

const BPS = 10_000n;
const E18 = 10n ** 18n;

function pow10(n: number): bigint {
  if (!Number.isInteger(n) || n < 0 || n > 77) {
    throw new PriceGuardError("BAD_DECIMALS", `decimals out of safe range: ${n}`);
  }
  return 10n ** BigInt(n);
}

/**
 * Fail-closed independent price validation. Throws on ANY missing input, stale/incomplete data,
 * multiplier transition, cap breach, or deviation beyond the approved limit.
 *
 * Unit model (explicit, to prevent REST-vs-onchain unit confusion): `answer` prices ONE whole
 * UNDERLYING share in quote-asset units at `decimals`. The token's on-chain balance units represent
 * underlying shares scaled by uiMultiplier/1e18, so:
 *   expectedBuyRaw = sellRaw * 10^buyDec * 10^feedDec * multiplierE18
 *                    / (answer * 10^sellDec * 1e18)
 */
export function validateIndependentPrice(
  io: PriceGuardInput,
  feed: ReferencePriceObservation | null,
  multiplier: MultiplierState | null,
  policy: PriceRiskPolicy | null,
): PriceGuardResult {
  if (policy === null) {
    throw new PriceGuardError(
      "PRICE_POLICY_MISSING",
      "no approved staleness/deviation/cap policy exists — fail closed (founder decision pack #10/#12)",
    );
  }
  if (feed === null) {
    throw new PriceGuardError(
      "PRICE_FEED_MISSING",
      "no approved independent price feed configured",
    );
  }
  if (multiplier === null) {
    throw new PriceGuardError(
      "MULTIPLIER_MISSING",
      "corporate-action multiplier state unavailable",
    );
  }
  if (multiplier.transitionPending) {
    throw new PriceGuardError(
      "MULTIPLIER_TRANSITION",
      "multiplier transition pending — no approved transition rule exists (fail closed)",
    );
  }
  if (multiplier.currentE18 <= 0n) {
    throw new PriceGuardError("MULTIPLIER_MISSING", "multiplier must be positive");
  }
  if (
    feed.baseAsset.toLowerCase() !== io.buyToken.toLowerCase() ||
    feed.quoteAsset.toLowerCase() !== io.sellToken.toLowerCase()
  ) {
    throw new PriceGuardError("ASSET_BINDING_MISMATCH", "feed pair != transaction pair");
  }
  if (feed.answer <= 0n) {
    throw new PriceGuardError("NON_POSITIVE_ANSWER", "reference answer must be positive");
  }
  if (!feed.roundComplete) {
    throw new PriceGuardError("INCOMPLETE_ROUND", "reference round is incomplete");
  }
  if (io.nowSec < feed.updatedAtSec) {
    throw new PriceGuardError("UNSAFE_NUMBER", "feed timestamp is in the future");
  }
  if (io.nowSec - feed.updatedAtSec > policy.maxStalenessSec) {
    throw new PriceGuardError("STALE_ANSWER", "reference answer exceeds approved staleness");
  }
  if (io.sellAmountRaw <= 0n || io.minBuyAmountRaw <= 0n) {
    throw new PriceGuardError("UNSAFE_NUMBER", "amounts must be positive integers");
  }
  if (io.sellAmountRaw > policy.maxTxInputRaw) {
    throw new PriceGuardError("TX_CAP_EXCEEDED", "input exceeds the approved per-transaction cap");
  }

  const num =
    io.sellAmountRaw * pow10(io.buyDecimals) * pow10(feed.decimals) * multiplier.currentE18;
  const den = feed.answer * pow10(io.sellDecimals) * E18;
  const expected = num / den; // floor — integer arithmetic only
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
      feedAnswer: feed.answer.toString(10),
      feedDecimals: feed.decimals,
      feedUpdatedAtSec: feed.updatedAtSec.toString(10),
      observedAtBlock: feed.observedAtBlock.toString(10),
      multiplierE18: multiplier.currentE18.toString(10),
    },
  };
}
