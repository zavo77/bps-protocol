import { describe, expect, it } from "vitest";
import {
  computeStats,
  formatScaled,
  isBuy,
  orientedPricesX18,
  parseDecimalScaled,
  toTradeRecords,
  usdPerLaunchedX8,
  WAD,
  type SwapRow,
} from "./market-data";

// LIVE fixture — the real first buy of the launched market
// 0x7382C73b2830e6521a5167aa7347CAF0f39Ad0d5 (PRINT/GOOGL, anchor=currency0):
// tx 0xdc37b4921884ba1a256e694f9c2a718af815adf7a9535b6c11b3d993883ea9ba
const LIVE_SQRT = 315496595509454968698113418325478n;
const LIVE_AMOUNT0 = -57442260344809n; // anchor (GOOGL) — trader paid in
const LIVE_AMOUNT1 = 901785111775038994801n; // launched token — trader received
const GOOGL_MID = "326.425000";

const liveRow: SwapRow = {
  id: "0xdc37…:8",
  txHash: "0xdc37b4921884ba1a256e694f9c2a718af815adf7a9535b6c11b3d993883ea9ba",
  blockNumber: "21552602",
  amount0: LIVE_AMOUNT0,
  amount1: LIVE_AMOUNT1,
  sqrtPriceX96: LIVE_SQRT,
  fee: 10000,
  occurredAt: new Date().toISOString(),
};

describe("price orientation (anchor = currency0 — the live market)", () => {
  const p = orientedPricesX18({
    sqrtPriceX96: LIVE_SQRT,
    anchorIsCurrency0: true,
    anchorDecimals: 18,
    tokenDecimals: 18,
  });

  it("launched-per-anchor lands in the sane live range (~15.86M PRINT per GOOGL)", () => {
    expect(p.launchedPerAnchorX18 / WAD).toBeGreaterThan(15_000_000n);
    expect(p.launchedPerAnchorX18 / WAD).toBeLessThan(17_000_000n);
  });

  it("the two orientations are exact inverses (product ≈ 1e36)", () => {
    const product = p.launchedPerAnchorX18 * p.anchorPerLaunchedX18;
    const one = WAD * WAD;
    const drift = product > one ? product - one : one - product;
    expect(drift < one / 1_000_000n).toBe(true);
  });

  it("USD price from the verified GOOGL midpoint ≈ the $0.0000205 starting price", () => {
    const usdX8 = usdPerLaunchedX8(p.anchorPerLaunchedX18, GOOGL_MID);
    expect(usdX8).toBeGreaterThan(1_900n); // > $0.000019 (×1e8)
    expect(usdX8).toBeLessThan(2_200n); // < $0.000022
  });
});

describe("price orientation (anchor = currency1 — flipped pool)", () => {
  it("flipping the orientation swaps the two prices exactly", () => {
    const a0 = orientedPricesX18({
      sqrtPriceX96: LIVE_SQRT,
      anchorIsCurrency0: true,
      anchorDecimals: 18,
      tokenDecimals: 18,
    });
    const a1 = orientedPricesX18({
      sqrtPriceX96: LIVE_SQRT,
      anchorIsCurrency0: false,
      anchorDecimals: 18,
      tokenDecimals: 18,
    });
    // With anchor as currency1, token1-per-token0 raw becomes anchor-per-launched.
    expect(a1.anchorPerLaunchedX18).toBe(a0.launchedPerAnchorX18);
    expect(a1.launchedPerAnchorX18).toBe(a0.anchorPerLaunchedX18);
  });

  it("adjusts for asymmetric decimals (6-decimal anchor)", () => {
    const p18 = orientedPricesX18({
      sqrtPriceX96: LIVE_SQRT,
      anchorIsCurrency0: true,
      anchorDecimals: 18,
      tokenDecimals: 18,
    });
    const p6 = orientedPricesX18({
      sqrtPriceX96: LIVE_SQRT,
      anchorIsCurrency0: true,
      anchorDecimals: 6,
      tokenDecimals: 18,
    });
    // Fewer anchor decimals → each anchor UNIT is 1e12× smaller in wei terms.
    const ratio = p18.launchedPerAnchorX18 / (p6.launchedPerAnchorX18 === 0n ? 1n : p6.launchedPerAnchorX18);
    expect(ratio).toBe(10n ** 12n);
  });
});

describe("buy/sell classification + trade records (live calibration)", () => {
  it("the live first buy classifies as a BUY (anchor amount negative)", () => {
    expect(isBuy(LIVE_AMOUNT0)).toBe(true);
    const trades = toTradeRecords({
      ledger: [liveRow],
      anchorIsCurrency0: true,
      anchorDecimals: 18,
      tokenDecimals: 18,
      anchorMidUsd: GOOGL_MID,
    });
    expect(trades).toHaveLength(1);
    expect(trades[0]!.side).toBe("buy");
    expect(trades[0]!.tokenAmountWei).toBe(LIVE_AMOUNT1.toString());
    expect(trades[0]!.anchorAmountWei).toBe((-LIVE_AMOUNT0).toString());
    // ~0.0000574 GOOGL × $326.425 ≈ $0.0187
    expect(Number(trades[0]!.usdValue)).toBeGreaterThan(0.017);
    expect(Number(trades[0]!.usdValue)).toBeLessThan(0.021);
  });
});

describe("computeStats — honest metric definitions", () => {
  const supply = 1_000_000_000n * WAD;
  const stats = computeStats({
    ledger: [liveRow],
    anchorIsCurrency0: true,
    anchorDecimals: 18,
    tokenDecimals: 18,
    anchorMidUsd: GOOGL_MID,
    totalSupplyWei: supply,
    startingFdvUsd: "20500",
    poolId: "0x1ffc403eaf47aeefece21df47b4fdc4bc5fc6af269a5a21b2c14f5ab15ac4509",
  });

  it("circulating = tokens swapped out; inventory = supply − circulating", () => {
    expect(stats.circulatingSupplyWei).toBe(LIVE_AMOUNT1.toString());
    expect(BigInt(stats.remainingInventoryWei)).toBe(supply - LIVE_AMOUNT1);
  });

  it("anchor reserve equals the anchor paid in", () => {
    expect(stats.anchorReserveWei).toBe((-LIVE_AMOUNT0).toString());
  });

  it("FDV ≈ price × 1e9 supply (~$20.5k) and market cap uses circulating", () => {
    expect(Number(stats.fdvUsd)).toBeGreaterThan(19_000);
    expect(Number(stats.fdvUsd)).toBeLessThan(23_000);
    // 901.78 tokens × ~$0.0000206 ≈ $0.0186
    expect(Number(stats.marketCapUsd)).toBeGreaterThan(0.015);
    expect(Number(stats.marketCapUsd)).toBeLessThan(0.025);
  });

  it("starting price = starting FDV / supply", () => {
    expect(Number(stats.startingPriceUsd)).toBeCloseTo(0.0000205, 7);
  });

  it("volume windows sum the anchor side in USD and count buys/sells separately", () => {
    expect(stats.windows["24h"].buys).toBe(1);
    expect(stats.windows["24h"].sells).toBe(0);
    expect(Number(stats.windows["24h"].volumeUsd)).toBeGreaterThan(0.017);
    expect(stats.windows.all.buys).toBe(1);
  });

  it("liquidity is pool-attributable (reserve + inventory value), non-null", () => {
    expect(stats.liquidityUsd).not.toBeNull();
    expect(Number(stats.liquidityUsd)).toBeGreaterThan(0);
  });
});

describe("fixed-point helpers", () => {
  it("parseDecimalScaled/formatScaled round-trip without float drift", () => {
    expect(parseDecimalScaled("326.425000", 8)).toBe(32642500000n);
    expect(formatScaled(32642500000n, 8, 6)).toBe("326.425");
    expect(formatScaled(-1234n, 4, 4)).toBe("-0.1234");
  });
});
