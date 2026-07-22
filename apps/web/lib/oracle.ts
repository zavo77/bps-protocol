// Oracle & slippage READ model (Task 8 §H). Robinhood's official docs state every Stock Token has a
// Chainlink price feed. This is a read-only verification + policy boundary: it validates a feed reading
// (code, decimals, positive price, freshness, sequencer status, oraclePaused, per-token multiplier) and
// documents how the trusted acquisitionOperator must derive `minStockOut` in the restricted beta. Feed
// PROXY ADDRESSES are configuration injected from a source-backed config — never hardcoded here. No
// frozen contract is modified to add an on-chain oracle in this task.
//
// Classification:
// - Restricted beta: min-price is operationally enforceable via the trusted operator + validated Rialto
//   quote + the on-chain `minStockOut` the vault already checks.
// - Future permissionless acquisition: still requires a SEPARATELY REVIEWED on-chain oracle/slippage
//   architecture (not built here).

export interface FeedConfig {
  readonly stockSymbol: string;
  readonly proxy: string; // source-backed configuration; not hardcoded in this module
  readonly decimals: number;
  readonly heartbeatSec: number;
  readonly multiplier: number; // per-token multiplier (e.g. fractional-share scaling); 1 if none
  readonly sourceUrl: string;
}

export interface FeedReading {
  readonly hasCode: boolean;
  readonly answer: bigint; // latestRoundData answer in feed decimals
  readonly decimals: number;
  readonly updatedAtSec: bigint;
  readonly oraclePaused: boolean;
}

export interface SequencerStatus {
  readonly up: boolean;
  readonly changedAtSec: bigint; // L2 sequencer uptime feed startedAt
  readonly gracePeriodSec: bigint;
}

export type OracleVerdict =
  | { readonly ok: true; readonly price: bigint }
  | { readonly ok: false; readonly reason: OracleRejection };

export type OracleRejection =
  | "feed-no-code"
  | "decimals-mismatch"
  | "non-positive-price"
  | "stale"
  | "oracle-paused"
  | "sequencer-down"
  | "sequencer-grace-period";

/** Validate a feed reading against its config, the sequencer status, and current time. Read-only. */
export function evaluateFeed(
  config: FeedConfig,
  reading: FeedReading,
  sequencer: SequencerStatus,
  nowSec: bigint,
): OracleVerdict {
  if (!sequencer.up) return { ok: false, reason: "sequencer-down" };
  if (nowSec - sequencer.changedAtSec <= sequencer.gracePeriodSec) {
    return { ok: false, reason: "sequencer-grace-period" };
  }
  if (!reading.hasCode) return { ok: false, reason: "feed-no-code" };
  if (reading.decimals !== config.decimals) return { ok: false, reason: "decimals-mismatch" };
  if (reading.oraclePaused) return { ok: false, reason: "oracle-paused" };
  if (reading.answer <= 0n) return { ok: false, reason: "non-positive-price" };
  if (nowSec - reading.updatedAtSec > BigInt(config.heartbeatSec)) {
    return { ok: false, reason: "stale" };
  }
  // Multiplier-aware price (integer scaling; multiplier is a small positive integer factor here).
  return { ok: true, price: reading.answer * BigInt(config.multiplier) };
}

export interface MinStockOutPolicyInput {
  readonly quoteStockOut: bigint; // validated Rialto quote output (stock units)
  readonly wethIn: bigint;
  readonly oraclePrice: bigint; // stock per WETH reference from the feed (already multiplier-applied)
  readonly oracleScale: bigint; // scaling denominator for oraclePrice (e.g. 10**feedDecimals)
  readonly maxDeviationBps: number; // configured max deviation of quote below oracle-implied value
  readonly maxAcquisitionWethIn: bigint;
  readonly nowSec: bigint;
  readonly deadlineSec: bigint;
  readonly feedVerdict: OracleVerdict;
}

export type MinStockOutResult =
  | { readonly allowed: true; readonly minStockOut: bigint }
  | { readonly allowed: false; readonly reason: string };

/**
 * Restricted-beta operator policy for deriving `minStockOut`. It requires a valid feed, an unexpired
 * deadline, and an acquisition within the configured size cap, then floors the quote output at
 * (1 - maxDeviationBps) of the oracle-implied output. This is OPERATIONAL guidance for the trusted
 * operator + the on-chain `minStockOut` the vault enforces — NOT a permissionless on-chain oracle.
 */
export function deriveMinStockOut(p: MinStockOutPolicyInput): MinStockOutResult {
  if (!p.feedVerdict.ok) return { allowed: false, reason: `feed:${p.feedVerdict.reason}` };
  if (p.nowSec >= p.deadlineSec) return { allowed: false, reason: "deadline-expired" };
  if (p.wethIn <= 0n) return { allowed: false, reason: "zero-input" };
  if (p.wethIn > p.maxAcquisitionWethIn)
    return { allowed: false, reason: "exceeds-max-acquisition" };
  if (p.maxDeviationBps < 0 || p.maxDeviationBps > 10_000) {
    return { allowed: false, reason: "bad-deviation-config" };
  }
  // Oracle-implied stock out for wethIn, then floor by the allowed deviation.
  const oracleImplied = (p.wethIn * p.oraclePrice) / p.oracleScale;
  const oracleFloor = (oracleImplied * BigInt(10_000 - p.maxDeviationBps)) / 10_000n;
  // The enforced minimum is the stricter of the quote and the oracle floor, and must be positive.
  const minStockOut = p.quoteStockOut < oracleFloor ? p.quoteStockOut : oracleFloor;
  if (minStockOut <= 0n) return { allowed: false, reason: "non-positive-min" };
  // Reject a quote that is worse than the oracle floor (price protection).
  if (p.quoteStockOut < oracleFloor) return { allowed: false, reason: "quote-below-oracle-floor" };
  return { allowed: true, minStockOut };
}
