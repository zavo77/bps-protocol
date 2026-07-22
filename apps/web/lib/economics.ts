// Frozen BPS economics (BPS-ECON-2.0), mirrored from the on-chain BPSTradeRouter/StockAcquisitionVault
// constants. These values are ACCEPTED and must not be changed here. This module is pure, deterministic,
// and dependency-free; it never touches the network, a wallet, or a private key.
//
// Buy  (3% total): 2% stock-acquisition funding + 1% BPS repurchase-and-burn -> 97% to the user.
// Sell (4% total): 2% stock-acquisition funding + 2% BPS repurchase-and-burn -> 96% to the user.
// Acquired-stock split: 80% distribution (floored) + remainder (>=20%) to the strategic reserve.

export const BPS_DENOMINATOR = 10_000n;
export const BUY_STOCK_BPS = 200n; // 2%
export const BUY_BURN_BPS = 100n; // 1%
export const SELL_STOCK_BPS = 200n; // 2%
export const SELL_BURN_BPS = 200n; // 2%
export const DISTRIBUTION_PERCENT = 80n;
export const SPLIT_DENOMINATOR = 100n;

export const ECON_VERSION = "BPS-ECON-2.0" as const;

export interface TradeAllocation {
  readonly gross: bigint;
  readonly stockBudget: bigint;
  readonly burnBudget: bigint;
  readonly userAmount: bigint;
  readonly totalProtocolBps: bigint; // 300 (buy) or 400 (sell)
}

function floorBps(amount: bigint, bps: bigint): bigint {
  return (amount * bps) / BPS_DENOMINATOR;
}

/**
 * Buy allocation from a gross WETH input, matching BPSTradeRouter.buyExactWethForBps exactly:
 * stock = floor(g*200/10000), burn = floor(g*100/10000), user = g - stock - burn (remainder to user).
 */
export function buyAllocation(grossWeth: bigint): TradeAllocation {
  if (grossWeth < 0n) throw new Error("negative input");
  const stockBudget = floorBps(grossWeth, BUY_STOCK_BPS);
  const burnBudget = floorBps(grossWeth, BUY_BURN_BPS);
  const userAmount = grossWeth - stockBudget - burnBudget;
  return { gross: grossWeth, stockBudget, burnBudget, userAmount, totalProtocolBps: 300n };
}

/**
 * Sell allocation from the ACTUAL WETH proceeds (not the BPS input), matching
 * BPSTradeRouter.sellExactBpsForWeth: stock = floor(w*200/10000), burn = floor(w*200/10000),
 * user = w - stock - burn (remainder to user). The seller's BPS input is swapped for this WETH `w`.
 */
export function sellAllocation(actualWethProceeds: bigint): TradeAllocation {
  if (actualWethProceeds < 0n) throw new Error("negative proceeds");
  const stockBudget = floorBps(actualWethProceeds, SELL_STOCK_BPS);
  const burnBudget = floorBps(actualWethProceeds, SELL_BURN_BPS);
  const userAmount = actualWethProceeds - stockBudget - burnBudget;
  return {
    gross: actualWethProceeds,
    stockBudget,
    burnBudget,
    userAmount,
    totalProtocolBps: 400n,
  };
}

/** Acquired-stock 80/20 split, matching StockAcquisitionVault: distribution floored, remainder reserve. */
export function acquiredStockSplit(acquired: bigint): {
  readonly distribution: bigint;
  readonly reserve: bigint;
} {
  if (acquired < 0n) throw new Error("negative acquired");
  const distribution = (acquired * DISTRIBUTION_PERCENT) / SPLIT_DENOMINATOR;
  return { distribution, reserve: acquired - distribution };
}

/** Human-readable percentage labels for the accepted economics (display only). */
export const ECON_DISCLOSURE = {
  buy: {
    stockAcquisition: "2% Stock Token acquisition funding",
    burn: "1% BPS repurchase and burn",
    total: "3% total BPS protocol allocation",
  },
  sell: {
    stockAcquisition: "2% Stock Token acquisition funding",
    burn: "2% direct BPS burn",
    total: "4% total BPS protocol allocation",
  },
  split: "Acquired stock: 80% distribution, remainder (>=20%) strategic reserve",
} as const;
