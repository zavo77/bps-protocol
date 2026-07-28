// Client-safe market price math — pure bigint fixed-point functions shared by
// client components (PriceChart) and mirrored from the server-side
// lib/lab/market-data.ts implementation (which stays server-only because it
// also touches Postgres). Keep the two in sync: any change to the price
// orientation or scaling rules must land in BOTH files.
//
// PRICE ORIENTATION is derived from the ACTUAL PoolKey — the anchor may be
// currency0 OR currency1. All financial math is bigint fixed-point; Number()
// never touches a raw chain amount inside these helpers.

const X192 = 1n << 192n;
export const WAD = 10n ** 18n;

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
