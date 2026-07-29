// User-facing trade routing. Users pay/receive ETH/WETH/USDG; the market's RWA
// anchor is INTERNAL. Priority order (founder spec):
//
//   BUY (payment → launched token)
//     1. Rialto direct payment → token          (token not whitelisted → skips)
//     2. 1inch  direct payment → token
//     3. 0x     direct payment → token
//   SELL mirrors: token → payment through the same one-step chain.
//   Advanced: anchor ↔ token directly through the BPS pool (one transaction).
//
// EVERY public quote is exactly ONE wallet transaction (walletActionCount === 1;
// approvals are counted separately in the UI). The old composed 2-transaction
// fallback (payment↔anchor leg + BPS Direct leg executed sequentially) is
// FORBIDDEN as a public quote: when no one-step venue fills payment↔token,
// quoteUserTrade throws NO_ROUTE_FOR_PAYMENT_TOKEN instead. Single recovery
// legs of previously persisted composed trades still prepare via prepare-leg.
// Rialto is the primary RWA venue. All aggregator adapters are server-only, use
// the returned allowance spender exactly, add no integrator fee, and return the
// unsigned tx for the browser wallet to sign after simulation. No server signer.

import "server-only";
import { getAddress, type Address, type PublicClient } from "viem";
import {
  getLabPoolContext,
  quoteDirectRoute,
  getPaymentToken,
  type LegVenue,
  type RouteLeg,
  type UserRouteQuote,
} from "@bps/launch-lab";
import { quoteRialto } from "./rialto";
import { quoteOneInch } from "./oneinch";
import { quoteZeroExRoute } from "./zeroex";

const QUOTE_TTL_MS = 60_000;
const TOKEN_DECIMALS = 18; // DopplerERC20V1

function leg(partial: Omit<RouteLeg, "transactionValue"> & { transactionValue?: string }): RouteLeg {
  return { transactionValue: partial.transactionValue ?? "0", ...partial };
}

interface AggQuote {
  venue: Extract<LegVenue, "rialto" | "oneInch" | "zeroEx">;
  buyAmountWei: string;
  minBuyAmountWei: string;
  allowanceTarget: Address | null;
  transactionTarget: Address;
  transactionData: `0x${string}`;
  transactionValue: string;
  platformFeeBps: number | null;
  quoteExpiry: number;
}

/** Try aggregators in priority order (Rialto → 1inch → 0x); first executable wins.
 *  With `pinnedVenue` set, ONLY that venue's adapter is quoted — no priority
 *  chain, no fallback. Used by prepare-leg to freeze the venue after the user
 *  approved its spender. Exported for the routing-order test. */
export async function quoteAggregatorDirect(args: {
  sellToken: Address;
  sellDecimals: number;
  buyToken: Address;
  sellAmountWei: bigint;
  taker: Address;
  slippageBps: number;
  pinnedVenue?: Extract<LegVenue, "rialto" | "oneInch" | "zeroEx"> | undefined;
}): Promise<AggQuote | null> {
  const pin = args.pinnedVenue;
  const r = pin === undefined || pin === "rialto" ? await quoteRialto(args) : null;
  if (r) {
    return {
      venue: "rialto",
      buyAmountWei: r.buyAmountWei,
      minBuyAmountWei: r.minBuyAmountWei,
      allowanceTarget: r.allowanceTarget,
      transactionTarget: r.transactionTarget,
      transactionData: r.transactionData,
      transactionValue: r.transactionValue,
      platformFeeBps: r.platformFeeBps,
      quoteExpiry: r.quoteExpiry,
    };
  }
  const o = pin === undefined || pin === "oneInch" ? await quoteOneInch(args) : null;
  if (o) {
    return {
      venue: "oneInch",
      buyAmountWei: o.buyAmountWei,
      minBuyAmountWei: o.minBuyAmountWei,
      allowanceTarget: o.allowanceTarget,
      transactionTarget: o.transactionTarget,
      transactionData: o.transactionData,
      transactionValue: o.transactionValue,
      platformFeeBps: null,
      quoteExpiry: o.quoteExpiry,
    };
  }
  const z =
    pin === undefined || pin === "zeroEx"
      ? await quoteZeroExRoute({
          sellToken: args.sellToken,
          buyToken: args.buyToken,
          sellAmountWei: args.sellAmountWei,
          taker: args.taker,
          slippageBps: args.slippageBps,
        })
      : null;
  if (z) {
    return {
      venue: "zeroEx",
      buyAmountWei: z.buyAmount,
      minBuyAmountWei: z.minimumBuyAmount,
      allowanceTarget: z.allowanceTarget,
      transactionTarget: z.transactionTarget,
      transactionData: z.transactionData,
      transactionValue: z.transactionValue,
      platformFeeBps: null,
      quoteExpiry: z.quoteExpiry,
    };
  }
  return null;
}

const VENUE_LABEL: Record<AggQuote["venue"], string> = {
  rialto: "Rialto",
  oneInch: "1inch",
  zeroEx: "0x",
};

export async function quoteUserTrade(
  client: PublicClient,
  args: {
    marketToken: Address;
    side: "buy" | "sell";
    inputToken: Address;
    outputToken: Address;
    exactInputAmountWei: bigint;
    taker: Address;
    slippageBps: number;
  },
): Promise<UserRouteQuote> {
  const ctx = await getLabPoolContext(client, args.marketToken);
  const anchor = ctx.anchorAddress;
  const isBuy = args.side === "buy";
  const userInput = getAddress(args.inputToken);
  const userOutput = getAddress(args.outputToken);
  const expectedUserSide = isBuy ? userInput : userOutput;
  const marketSide = isBuy ? userOutput : userInput;
  if (marketSide.toLowerCase() !== args.marketToken.toLowerCase()) {
    throw new Error("MARKET_TOKEN_MISMATCH");
  }
  const warnings: string[] = [];

  // Advanced path: the user explicitly pays/receives the anchor itself.
  if (expectedUserSide.toLowerCase() === anchor.toLowerCase()) {
    const { quote } = await quoteDirectRoute(client, args.marketToken, args.side, args.exactInputAmountWei, args.slippageBps);
    return {
      marketToken: args.marketToken,
      side: args.side,
      anchorSymbol: ctx.anchorSymbol,
      anchorAddress: anchor,
      userInputToken: userInput,
      userOutputToken: userOutput,
      routeKind: "direct-anchor",
      legs: [
        leg({
          kind: "bpsDirect",
          label: `BPS Direct (${ctx.anchorSymbol} pool)`,
          inputToken: userInput,
          outputToken: userOutput,
          inputAmountWei: quote.sellAmount,
          expectedOutputWei: quote.buyAmount,
          minimumOutputWei: quote.minimumBuyAmount,
          transactionTarget: quote.transactionTarget,
          transactionData: quote.transactionData,
          allowanceTarget: quote.allowanceTarget,
          estimated: false,
        }),
      ],
      expectedFinalOutputWei: quote.buyAmount,
      minimumFinalOutputWei: quote.minimumBuyAmount,
      totalPriceImpactBps: quote.priceImpactBps,
      poolFeeUnits: quote.poolFee,
      zeroExFeeNote: null,
      walletActionCount: 1,
      approvalsRequired: quote.allowanceTarget ? [{ token: userInput, spender: quote.allowanceTarget }] : [],
      quoteExpiry: Date.now() + QUOTE_TTL_MS,
      warnings: quote.warnings,
    };
  }

  const payment = getPaymentToken(expectedUserSide);
  if (!payment) throw new Error("UNSUPPORTED_PAYMENT_TOKEN");

  // (1–3) one-transaction direct route payment ↔ launched token via aggregators.
  const direct = await quoteAggregatorDirect({
    sellToken: isBuy ? payment.address : args.marketToken,
    sellDecimals: isBuy ? payment.decimals : TOKEN_DECIMALS,
    buyToken: isBuy ? args.marketToken : payment.address,
    sellAmountWei: args.exactInputAmountWei,
    taker: args.taker,
    slippageBps: args.slippageBps,
  });
  if (direct) {
    return {
      marketToken: args.marketToken,
      side: args.side,
      anchorSymbol: ctx.anchorSymbol,
      anchorAddress: anchor,
      userInputToken: userInput,
      userOutputToken: userOutput,
      routeKind: "one-step",
      legs: [
        leg({
          kind: direct.venue,
          label: `${VENUE_LABEL[direct.venue]} (one transaction)`,
          inputToken: userInput,
          outputToken: userOutput,
          inputAmountWei: args.exactInputAmountWei.toString(),
          expectedOutputWei: direct.buyAmountWei,
          minimumOutputWei: direct.minBuyAmountWei,
          transactionTarget: direct.transactionTarget,
          transactionData: direct.transactionData,
          transactionValue: direct.transactionValue,
          allowanceTarget: direct.allowanceTarget,
          estimated: false,
        }),
      ],
      expectedFinalOutputWei: direct.buyAmountWei,
      minimumFinalOutputWei: direct.minBuyAmountWei,
      totalPriceImpactBps: null,
      poolFeeUnits: null,
      zeroExFeeNote:
        direct.platformFeeBps !== null ? `${VENUE_LABEL[direct.venue]} fee ${direct.platformFeeBps} bps (in quoted output).` : `${VENUE_LABEL[direct.venue]} fees are included in the quoted output.`,
      walletActionCount: 1,
      // BUY spends the payment token (no approval when native ETH); SELL spends
      // the market token, which is always an ERC-20 needing approval.
      approvalsRequired:
        direct.allowanceTarget && !(isBuy && payment.native)
          ? [
              {
                token: isBuy ? payment.address : args.marketToken,
                spender: direct.allowanceTarget,
              },
            ]
          : [],
      quoteExpiry: Math.min(Date.now() + QUOTE_TTL_MS, direct.quoteExpiry),
      warnings,
    };
  }

  // No one-step venue can fill payment↔token. The composed 2-transaction
  // fallback (payment↔anchor + BPS Direct anchor↔token as sequential wallet
  // actions) is FORBIDDEN as a public quote — fail honestly instead. The
  // /api/lab/quote handler maps this to a 409 with user-facing copy.
  throw new Error("NO_ROUTE_FOR_PAYMENT_TOKEN");
}
