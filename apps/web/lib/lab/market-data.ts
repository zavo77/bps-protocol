// Market data core: precision-safe price math + honest metrics assembled from
// (a) the provenance-verified Postgres launch row (dynamic market identity),
// (b) chain reads, and (c) the complete per-market swap ledger (the indexer's
// per-market backfill guarantees completeness from the launch block).
//
// PRICE ORIENTATION is derived from the ACTUAL PoolKey — the anchor may be
// currency0 OR currency1. All financial math is bigint fixed-point; Number()
// never touches a raw chain amount.
//
// PUBLISHED METRIC DEFINITIONS (founder-approved wording):
// - FDV            = current token USD price × total supply.
// - Circulating    = cumulative net launched tokens transferred OUT of the pool
//                    to traders (from the complete indexed swap ledger). The
//                    unsold pool inventory (= total supply − circulating) and
//                    burned/zero-address balances are excluded.
// - Market cap     = current token USD price × circulating supply.
// - Liquidity      = pool-attributable reserves valued at the current price:
//                    the anchor reserve accumulated by THIS pool from swaps
//                    plus the remaining token inventory × current price. Never
//                    global PoolManager balances.
// - Volume         = Σ |anchor-side amount| of swaps, converted to USD at the
//                    verified anchor midpoint. NEVER amount0+amount1.
// - Buy vs sell    = a swap is a BUY when the anchor-side amount is negative
//                    (the trader paid anchor into the pool) — calibrated
//                    against the live receipt
//                    0xdc37b4921884ba1a256e694f9c2a718af815adf7a9535b6c11b3d993883ea9ba
//                    (anchor=currency0, amount0=-57442260344809 → buy).

import "server-only";
import type { Hex } from "viem";
import { getPg } from "./store";

const X192 = 1n << 192n;
export const WAD = 10n ** 18n;

export interface SwapRow {
  id: string;
  txHash: string;
  blockNumber: string;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  fee: number;
  occurredAt: string | null;
  sender?: string | null;
}

/** token1-per-token0 price scaled 1e18, raw wei terms. */
export function price1Per0X18(sqrtPriceX96: bigint): bigint {
  return (sqrtPriceX96 * sqrtPriceX96 * WAD) / X192;
}

/**
 * Orientation-aware prices, decimals-adjusted, scaled 1e18:
 * launchedPerAnchorX18 = launched-token units per 1 anchor unit;
 * anchorPerLaunchedX18 = anchor units per 1 launched-token unit.
 */
export function orientedPricesX18(args: {
  sqrtPriceX96: bigint;
  anchorIsCurrency0: boolean;
  anchorDecimals: number;
  tokenDecimals: number;
}): { launchedPerAnchorX18: bigint; anchorPerLaunchedX18: bigint } {
  const raw1per0 = price1Per0X18(args.sqrtPriceX96);
  if (raw1per0 === 0n) return { launchedPerAnchorX18: 0n, anchorPerLaunchedX18: 0n };
  // decimal adjustment: units1-per-unit0 = raw × 10^(dec0 − dec1)
  const [dec0, dec1] = args.anchorIsCurrency0
    ? [args.anchorDecimals, args.tokenDecimals]
    : [args.tokenDecimals, args.anchorDecimals];
  let adj = raw1per0;
  if (dec0 > dec1) adj = adj * 10n ** BigInt(dec0 - dec1);
  else if (dec1 > dec0) adj = adj / 10n ** BigInt(dec1 - dec0);
  if (adj === 0n) return { launchedPerAnchorX18: 0n, anchorPerLaunchedX18: 0n };
  if (args.anchorIsCurrency0) {
    // token1 = launched → adj IS launched-per-anchor.
    return { launchedPerAnchorX18: adj, anchorPerLaunchedX18: (WAD * WAD) / adj };
  }
  // token1 = anchor → adj is anchor-per-launched.
  return { launchedPerAnchorX18: (WAD * WAD) / adj, anchorPerLaunchedX18: adj };
}

/** Parse a decimal string (e.g. "326.425000") into a bigint scaled 10^scale. */
export function parseDecimalScaled(value: string, scale: number): bigint {
  const m = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) return 0n;
  const whole = BigInt(m[1]!);
  const fracRaw = (m[2] ?? "").slice(0, scale).padEnd(scale, "0");
  return whole * 10n ** BigInt(scale) + BigInt(fracRaw === "" ? 0 : fracRaw);
}

/** Format a scaled bigint as a decimal string with up to `digits` fraction digits. */
export function formatScaled(value: bigint, scale: number, digits = 12): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(scale);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(scale, "0").slice(0, digits);
  frac = frac.replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? `.${frac}` : ""}`;
}

/** USD price (scaled 1e8) of one launched token, from anchorPerLaunchedX18 × anchor USD mid. */
export function usdPerLaunchedX8(anchorPerLaunchedX18: bigint, anchorMidUsd: string): bigint {
  const midX8 = parseDecimalScaled(anchorMidUsd, 8);
  return (anchorPerLaunchedX18 * midX8) / WAD;
}

/** BUY when the anchor-side amount is negative (trader paid anchor in). */
export function isBuy(anchorAmount: bigint): boolean {
  return anchorAmount < 0n;
}

export function anchorSideAmount(row: { amount0: bigint; amount1: bigint }, anchorIsCurrency0: boolean): bigint {
  return anchorIsCurrency0 ? row.amount0 : row.amount1;
}
export function tokenSideAmount(row: { amount0: bigint; amount1: bigint }, anchorIsCurrency0: boolean): bigint {
  return anchorIsCurrency0 ? row.amount1 : row.amount0;
}

export interface WindowStats {
  volumeUsd: string;
  buys: number;
  sells: number;
  priceChangePct: string | null;
}

export interface MarketStats {
  anchorIsCurrency0: boolean;
  poolId: Hex | null;
  lastSqrtPriceX96: string | null;
  priceAnchorPerToken: string | null; // decimal string, anchor units
  priceTokenPerAnchor: string | null;
  priceUsd: string | null;
  startingPriceUsd: string | null;
  fdvUsd: string | null;
  circulatingSupplyWei: string;
  marketCapUsd: string | null;
  anchorReserveWei: string;
  remainingInventoryWei: string;
  liquidityUsd: string | null;
  windows: Record<"5m" | "1h" | "6h" | "24h" | "all", WindowStats>;
  lastTradeAt: string | null;
  swapCount: number;
}

export interface TradeRecord {
  txHash: string;
  blockNumber: string;
  occurredAt: string | null;
  side: "buy" | "sell";
  tokenAmountWei: string;
  anchorAmountWei: string;
  usdValue: string | null;
  priceUsdAtTrade: string | null;
  trader: string | null;
}

const WINDOWS_MS: Record<"5m" | "1h" | "6h" | "24h", number> = {
  "5m": 5 * 60_000,
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "24h": 24 * 3_600_000,
};

export async function loadSwapLedger(tokenAddress: string): Promise<SwapRow[]> {
  const pg = await getPg();
  if (!pg) return [];
  const res = await pg.query(
    `SELECT id, tx_hash, block_number, amount0, amount1, sqrt_price_x96, fee, occurred_at
     FROM lab_swaps WHERE lower(token_address) = $1 ORDER BY block_number ASC, id ASC`,
    [tokenAddress.toLowerCase()],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    txHash: String(r.tx_hash),
    blockNumber: String(r.block_number),
    amount0: BigInt(String(r.amount0)),
    amount1: BigInt(String(r.amount1)),
    sqrtPriceX96: BigInt(String(r.sqrt_price_x96)),
    fee: Number(r.fee ?? 0),
    occurredAt: r.occurred_at ? new Date(String(r.occurred_at)).toISOString() : null,
  }));
}

/** Assemble every ledger-derived metric with bigint math only. */
export function computeStats(args: {
  ledger: SwapRow[];
  anchorIsCurrency0: boolean;
  anchorDecimals: number;
  tokenDecimals: number;
  anchorMidUsd: string; // verified midpoint, decimal string
  totalSupplyWei: bigint;
  startingFdvUsd: string | null; // from the manifest/launch config when known
  poolId: Hex | null;
  now?: number;
}): MarketStats {
  const { ledger, anchorIsCurrency0 } = args;
  const now = args.now ?? Date.now();

  // Reserves from the complete ledger (anchor-side: negative = paid IN).
  let anchorReserve = 0n;
  let tokensOut = 0n;
  for (const s of ledger) {
    const a = anchorSideAmount(s, anchorIsCurrency0);
    const t = tokenSideAmount(s, anchorIsCurrency0);
    anchorReserve += -a; // anchor paid in is negative from the trader's side
    tokensOut += t; // tokens received by traders are positive
  }
  if (anchorReserve < 0n) anchorReserve = 0n;
  const circulating = tokensOut > 0n ? tokensOut : 0n;
  const remainingInventory =
    args.totalSupplyWei > circulating ? args.totalSupplyWei - circulating : 0n;

  const last = ledger.length > 0 ? ledger[ledger.length - 1]! : null;
  let priceUsd: string | null = null;
  let priceAnchorPerToken: string | null = null;
  let priceTokenPerAnchor: string | null = null;
  let fdvUsd: string | null = null;
  let marketCapUsd: string | null = null;
  let liquidityUsd: string | null = null;
  let usdX8: bigint | null = null;

  if (last) {
    const oriented = orientedPricesX18({
      sqrtPriceX96: last.sqrtPriceX96,
      anchorIsCurrency0,
      anchorDecimals: args.anchorDecimals,
      tokenDecimals: args.tokenDecimals,
    });
    priceAnchorPerToken = formatScaled(oriented.anchorPerLaunchedX18, 18, 12);
    priceTokenPerAnchor = formatScaled(oriented.launchedPerAnchorX18, 18, 6);
    usdX8 = usdPerLaunchedX8(oriented.anchorPerLaunchedX18, args.anchorMidUsd);
    priceUsd = formatScaled(usdX8, 8, 10);
    // FDV = price × total supply; both bigint (supply in wei → /1e18).
    const fdvX8 = (usdX8 * args.totalSupplyWei) / WAD;
    fdvUsd = formatScaled(fdvX8, 8, 2);
    const mcX8 = (usdX8 * circulating) / WAD;
    marketCapUsd = formatScaled(mcX8, 8, 6);
    // Liquidity = anchor reserve (USD) + remaining inventory × price (USD).
    const midX8 = parseDecimalScaled(args.anchorMidUsd, 8);
    const anchorScale = 10n ** BigInt(args.anchorDecimals);
    const reserveUsdX8 = (anchorReserve * midX8) / anchorScale;
    const inventoryUsdX8 = (remainingInventory * usdX8) / WAD;
    liquidityUsd = formatScaled(reserveUsdX8 + inventoryUsdX8, 8, 6);
  }

  const startingPriceUsd = args.startingFdvUsd
    ? formatScaled(
        (parseDecimalScaled(args.startingFdvUsd, 8) * WAD) / args.totalSupplyWei || 0n,
        8,
        12,
      )
    : null;

  const midX8 = parseDecimalScaled(args.anchorMidUsd, 8);
  const anchorScale = 10n ** BigInt(args.anchorDecimals);
  const windowStats = (cutoffMs: number | null): WindowStats => {
    let vol = 0n;
    let buys = 0;
    let sells = 0;
    let first: SwapRow | null = null;
    let lastIn: SwapRow | null = null;
    for (const s of ledger) {
      const t = s.occurredAt ? Date.parse(s.occurredAt) : null;
      if (cutoffMs !== null && (t === null || t < now - cutoffMs)) continue;
      const a = anchorSideAmount(s, anchorIsCurrency0);
      vol += a < 0n ? -a : a;
      if (isBuy(a)) buys++;
      else sells++;
      if (!first) first = s;
      lastIn = s;
    }
    let change: string | null = null;
    if (first && lastIn && first.id !== lastIn.id) {
      // Orientation-corrected: change in the ANCHOR price of the launched
      // token (matches the displayed USD price direction).
      const o = (s: SwapRow) =>
        orientedPricesX18({
          sqrtPriceX96: s.sqrtPriceX96,
          anchorIsCurrency0,
          anchorDecimals: args.anchorDecimals,
          tokenDecimals: args.tokenDecimals,
        }).anchorPerLaunchedX18;
      const p0 = o(first);
      const p1 = o(lastIn);
      if (p0 > 0n) {
        const deltaX4 = ((p1 - p0) * 1_000_000n) / p0; // pct × 1e4
        change = formatScaled(deltaX4, 4, 2);
      }
    } else if (first && lastIn && cutoffMs === null && ledger.length === 1) {
      change = "0";
    }
    return {
      volumeUsd: formatScaled((vol * midX8) / anchorScale, 8, 6),
      buys,
      sells,
      priceChangePct: change,
    };
  };

  return {
    anchorIsCurrency0,
    poolId: args.poolId,
    lastSqrtPriceX96: last ? last.sqrtPriceX96.toString() : null,
    priceAnchorPerToken,
    priceTokenPerAnchor,
    priceUsd,
    startingPriceUsd,
    fdvUsd,
    circulatingSupplyWei: circulating.toString(),
    marketCapUsd,
    anchorReserveWei: anchorReserve.toString(),
    remainingInventoryWei: remainingInventory.toString(),
    liquidityUsd,
    windows: {
      "5m": windowStats(WINDOWS_MS["5m"]),
      "1h": windowStats(WINDOWS_MS["1h"]),
      "6h": windowStats(WINDOWS_MS["6h"]),
      "24h": windowStats(WINDOWS_MS["24h"]),
      all: windowStats(null),
    },
    lastTradeAt: last?.occurredAt ?? null,
    swapCount: ledger.length,
  };
}

/** Newest-first normalized trades for the Recent trades table. */
export function toTradeRecords(args: {
  ledger: SwapRow[];
  anchorIsCurrency0: boolean;
  anchorDecimals: number;
  tokenDecimals: number;
  anchorMidUsd: string;
  limit?: number;
}): TradeRecord[] {
  const midX8 = parseDecimalScaled(args.anchorMidUsd, 8);
  const anchorScale = 10n ** BigInt(args.anchorDecimals);
  const out: TradeRecord[] = [];
  for (const s of [...args.ledger].reverse().slice(0, args.limit ?? 50)) {
    const a = anchorSideAmount(s, args.anchorIsCurrency0);
    const t = tokenSideAmount(s, args.anchorIsCurrency0);
    const absA = a < 0n ? -a : a;
    const absT = t < 0n ? -t : t;
    const oriented = orientedPricesX18({
      sqrtPriceX96: s.sqrtPriceX96,
      anchorIsCurrency0: args.anchorIsCurrency0,
      anchorDecimals: args.anchorDecimals,
      tokenDecimals: args.tokenDecimals,
    });
    const usdX8 = usdPerLaunchedX8(oriented.anchorPerLaunchedX18, args.anchorMidUsd);
    out.push({
      txHash: s.txHash,
      blockNumber: s.blockNumber,
      occurredAt: s.occurredAt,
      side: isBuy(a) ? "buy" : "sell",
      tokenAmountWei: absT.toString(),
      anchorAmountWei: absA.toString(),
      usdValue: formatScaled((absA * midX8) / anchorScale, 8, 4),
      priceUsdAtTrade: formatScaled(usdX8, 8, 10),
      trader: s.sender ?? null,
    });
  }
  return out;
}
