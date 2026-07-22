import { describe, expect, it } from "vitest";
import { SAMPLE_FEED } from "./fixtures";
import { deriveMinStockOut, evaluateFeed, type FeedReading, type SequencerStatus } from "./oracle";

const upSeq: SequencerStatus = { up: true, changedAtSec: 0n, gracePeriodSec: 3600n };
const goodReading: FeedReading = {
  hasCode: true,
  answer: 200_00000000n,
  decimals: 8,
  updatedAtSec: 9000n,
  oraclePaused: false,
};
const NOW = 10_000n;

describe("oracle read model (§H)", () => {
  it("accepts a healthy feed and applies the multiplier", () => {
    const v = evaluateFeed({ ...SAMPLE_FEED, multiplier: 2 }, goodReading, upSeq, NOW);
    expect(v).toEqual({ ok: true, price: 200_00000000n * 2n });
  });

  it("rejects sequencer down and grace period", () => {
    expect(evaluateFeed(SAMPLE_FEED, goodReading, { ...upSeq, up: false }, NOW)).toEqual({
      ok: false,
      reason: "sequencer-down",
    });
    expect(
      evaluateFeed(
        SAMPLE_FEED,
        goodReading,
        { up: true, changedAtSec: 9999n, gracePeriodSec: 3600n },
        NOW,
      ),
    ).toEqual({ ok: false, reason: "sequencer-grace-period" });
  });

  it("rejects no-code, decimals mismatch, paused, non-positive, stale", () => {
    expect(evaluateFeed(SAMPLE_FEED, { ...goodReading, hasCode: false }, upSeq, NOW).ok).toBe(
      false,
    );
    expect(evaluateFeed(SAMPLE_FEED, { ...goodReading, decimals: 6 }, upSeq, NOW)).toEqual({
      ok: false,
      reason: "decimals-mismatch",
    });
    expect(evaluateFeed(SAMPLE_FEED, { ...goodReading, oraclePaused: true }, upSeq, NOW)).toEqual({
      ok: false,
      reason: "oracle-paused",
    });
    expect(evaluateFeed(SAMPLE_FEED, { ...goodReading, answer: 0n }, upSeq, NOW)).toEqual({
      ok: false,
      reason: "non-positive-price",
    });
    expect(evaluateFeed(SAMPLE_FEED, { ...goodReading, updatedAtSec: 100n }, upSeq, NOW)).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("deriveMinStockOut: allows a quote at/above the oracle floor", () => {
    const feedVerdict = evaluateFeed(SAMPLE_FEED, goodReading, upSeq, NOW);
    const r = deriveMinStockOut({
      quoteStockOut: 100n,
      wethIn: 1n,
      oraclePrice: 100n,
      oracleScale: 1n,
      maxDeviationBps: 100, // allow 1% below oracle
      maxAcquisitionWethIn: 10n,
      nowSec: NOW,
      deadlineSec: NOW + 100n,
      feedVerdict,
    });
    expect(r).toEqual({ allowed: true, minStockOut: 99n });
  });

  it("deriveMinStockOut: rejects a quote below the oracle floor (price protection)", () => {
    const feedVerdict = evaluateFeed(SAMPLE_FEED, goodReading, upSeq, NOW);
    const r = deriveMinStockOut({
      quoteStockOut: 90n,
      wethIn: 1n,
      oraclePrice: 100n,
      oracleScale: 1n,
      maxDeviationBps: 100,
      maxAcquisitionWethIn: 10n,
      nowSec: NOW,
      deadlineSec: NOW + 100n,
      feedVerdict,
    });
    expect(r).toEqual({ allowed: false, reason: "quote-below-oracle-floor" });
  });

  it("deriveMinStockOut: rejects on bad feed, expired deadline, and oversize acquisition", () => {
    const badFeed = { ok: false as const, reason: "stale" as const };
    expect(
      deriveMinStockOut({
        quoteStockOut: 1n,
        wethIn: 1n,
        oraclePrice: 1n,
        oracleScale: 1n,
        maxDeviationBps: 0,
        maxAcquisitionWethIn: 10n,
        nowSec: NOW,
        deadlineSec: NOW + 1n,
        feedVerdict: badFeed,
      }).allowed,
    ).toBe(false);
    const feedVerdict = evaluateFeed(SAMPLE_FEED, goodReading, upSeq, NOW);
    expect(
      deriveMinStockOut({
        quoteStockOut: 1n,
        wethIn: 1n,
        oraclePrice: 1n,
        oracleScale: 1n,
        maxDeviationBps: 0,
        maxAcquisitionWethIn: 10n,
        nowSec: NOW,
        deadlineSec: NOW,
        feedVerdict,
      }).allowed,
    ).toBe(false);
    expect(
      deriveMinStockOut({
        quoteStockOut: 100n,
        wethIn: 100n,
        oraclePrice: 1n,
        oracleScale: 1n,
        maxDeviationBps: 0,
        maxAcquisitionWethIn: 10n,
        nowSec: NOW,
        deadlineSec: NOW + 1n,
        feedVerdict,
      }).allowed,
    ).toBe(false);
  });
});
