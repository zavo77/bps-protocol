// User-facing payment/output assets. The market's RWA anchor is INTERNAL
// routing detail — ordinary users pay and receive ETH / WETH / USDG; the
// selected anchor remains available only as an advanced option. Addresses
// verified live on 4663 (2026-07-27): WETH matches the Doppler SDK registry;
// USDG "Global Dollar" resolved on-chain with 6 decimals.

import { getAddress, type Address } from "viem";

/** 0x-style native ETH sentinel. */
export const NATIVE_ETH: Address = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export interface PaymentToken {
  symbol: "ETH" | "WETH" | "USDG";
  name: string;
  address: Address;
  decimals: number;
  native: boolean;
}

export const PAYMENT_TOKENS: readonly PaymentToken[] = [
  { symbol: "ETH", name: "Ether (native)", address: NATIVE_ETH, decimals: 18, native: true },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"),
    decimals: 18,
    native: false,
  },
  {
    symbol: "USDG",
    name: "Global Dollar",
    address: getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
    decimals: 6,
    native: false,
  },
] as const;

export function getPaymentToken(symbolOrAddress: string): PaymentToken | null {
  const s = symbolOrAddress.toLowerCase();
  return (
    PAYMENT_TOKENS.find((t) => t.symbol.toLowerCase() === s || t.address.toLowerCase() === s) ??
    null
  );
}

/** A single leg of a user trade route. */
export interface RouteLeg {
  kind: "zeroEx" | "bpsDirect";
  label: string;
  inputToken: Address;
  outputToken: Address;
  inputAmountWei: string;
  expectedOutputWei: string;
  minimumOutputWei: string;
  /** Unsigned transaction for this leg (leg 2 of a composed route is re-built
   *  after leg 1 confirms, from the actual received amount). */
  transactionTarget: Address | null;
  transactionData: string | null;
  transactionValue: string;
  allowanceTarget: Address | null;
  /** True when amounts are estimates pending the previous leg's execution. */
  estimated: boolean;
}

/** The full user-facing quote: one-step (0x end-to-end) or composed. */
export interface UserRouteQuote {
  marketToken: Address;
  side: "buy" | "sell";
  anchorSymbol: string;
  anchorAddress: Address;
  userInputToken: Address;
  userOutputToken: Address;
  routeKind: "one-step" | "composed" | "direct-anchor";
  legs: RouteLeg[];
  expectedFinalOutputWei: string;
  minimumFinalOutputWei: string;
  totalPriceImpactBps: number | null;
  poolFeeUnits: number | null;
  zeroExFeeNote: string | null;
  walletActionCount: number;
  approvalsRequired: { token: Address; spender: Address }[];
  quoteExpiry: number;
  warnings: string[];
}
