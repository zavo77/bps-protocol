// User-facing trade routing. Users pay/receive ETH/WETH/USDG; the market's RWA
// anchor is INTERNAL. Priority order (founder spec):
//
//   BUY (payment → launched token)
//     1. Rialto direct payment → token          (token not whitelisted → skips)
//     2. 1inch  direct payment → token
//     3. 0x     direct payment → token
//     4. Rialto payment → anchor, then BPS Direct anchor → token   (workhorse)
//     5. Anchor-direct BPS trade                (advanced fallback)
//   SELL mirrors: BPS Direct token → anchor, then Rialto anchor → payment.
//
// Composed routes are explicit SEQUENTIAL wallet actions — never claimed atomic.
// Rialto is the primary RWA venue (it has payment↔anchor liquidity the other
// aggregators lack on 4663). All aggregator adapters are server-only, use the
// returned allowance spender exactly, add no integrator fee, and return the
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
const ANCHOR_DECIMALS = 18; // all approved anchors are 18dp
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
 *  Exported for the routing-order test. */
export async function quoteAggregatorDirect(args: {
  sellToken: Address;
  sellDecimals: number;
  buyToken: Address;
  sellAmountWei: bigint;
  taker: Address;
  slippageBps: number;
}): Promise<AggQuote | null> {
  const r = await quoteRialto(args);
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
  const o = await quoteOneInch(args);
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
  const z = await quoteZeroExRoute({
    sellToken: args.sellToken,
    buyToken: args.buyToken,
    sellAmountWei: args.sellAmountWei,
    taker: args.taker,
    slippageBps: args.slippageBps,
  });
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

  // (4) composed: aggregator payment↔anchor (Rialto primary) + BPS Direct anchor↔token.
  if (isBuy) {
    const legA = await quoteAggregatorDirect({
      sellToken: payment.address,
      sellDecimals: payment.decimals,
      buyToken: anchor,
      sellAmountWei: args.exactInputAmountWei,
      taker: args.taker,
      slippageBps: args.slippageBps,
    });
    if (!legA) throw new Error("NO_ROUTE_FOR_PAYMENT_TOKEN");
    const anchorIn = BigInt(legA.minBuyAmountWei);
    const { quote: legB } = await quoteDirectRoute(client, args.marketToken, "buy", anchorIn, args.slippageBps);
    warnings.push(
      `Two steps: ${payment.symbol} → ${ctx.anchorSymbol} (${VENUE_LABEL[legA.venue]}), then ${ctx.anchorSymbol} → token (BPS pool). Two wallet actions — not one-click; step 2 re-quotes from the actual amount received.`,
    );
    return {
      marketToken: args.marketToken,
      side: args.side,
      anchorSymbol: ctx.anchorSymbol,
      anchorAddress: anchor,
      userInputToken: userInput,
      userOutputToken: userOutput,
      routeKind: "composed",
      legs: [
        leg({
          kind: legA.venue,
          label: `Step 1 · ${payment.symbol} → ${ctx.anchorSymbol} (${VENUE_LABEL[legA.venue]})`,
          inputToken: payment.address,
          outputToken: anchor,
          inputAmountWei: args.exactInputAmountWei.toString(),
          expectedOutputWei: legA.buyAmountWei,
          minimumOutputWei: legA.minBuyAmountWei,
          transactionTarget: legA.transactionTarget,
          transactionData: legA.transactionData,
          transactionValue: legA.transactionValue,
          allowanceTarget: legA.allowanceTarget,
          estimated: false,
        }),
        leg({
          kind: "bpsDirect",
          label: `Step 2 · ${ctx.anchorSymbol} → token (BPS pool)`,
          inputToken: anchor,
          outputToken: args.marketToken,
          inputAmountWei: anchorIn.toString(),
          expectedOutputWei: legB.buyAmount,
          minimumOutputWei: legB.minimumBuyAmount,
          transactionTarget: null,
          transactionData: null,
          allowanceTarget: legB.allowanceTarget,
          estimated: true,
        }),
      ],
      expectedFinalOutputWei: legB.buyAmount,
      minimumFinalOutputWei: legB.minimumBuyAmount,
      totalPriceImpactBps: legB.priceImpactBps,
      poolFeeUnits: legB.poolFee,
      zeroExFeeNote: legA.platformFeeBps !== null ? `${VENUE_LABEL[legA.venue]} leg fee ${legA.platformFeeBps} bps.` : null,
      walletActionCount: 2,
      approvalsRequired: [
        ...(legA.allowanceTarget && !payment.native ? [{ token: payment.address, spender: legA.allowanceTarget }] : []),
        ...(legB.allowanceTarget ? [{ token: anchor, spender: legB.allowanceTarget }] : []),
      ],
      quoteExpiry: Math.min(Date.now() + QUOTE_TTL_MS, legA.quoteExpiry),
      warnings,
    };
  }

  // SELL composed: BPS Direct token → anchor, then aggregator anchor → payment.
  const { quote: legA } = await quoteDirectRoute(client, args.marketToken, "sell", args.exactInputAmountWei, args.slippageBps);
  const anchorOut = BigInt(legA.minimumBuyAmount);
  const legB = await quoteAggregatorDirect({
    sellToken: anchor,
    sellDecimals: ANCHOR_DECIMALS,
    buyToken: payment.address,
    sellAmountWei: anchorOut,
    taker: args.taker,
    slippageBps: args.slippageBps,
  });
  if (!legB) throw new Error("NO_ROUTE_FOR_PAYMENT_TOKEN");
  warnings.push(
    `Two steps: token → ${ctx.anchorSymbol} (BPS pool), then ${ctx.anchorSymbol} → ${payment.symbol} (${VENUE_LABEL[legB.venue]}). Two wallet actions — not one-click; step 2 re-quotes from the actual amount received.`,
  );
  return {
    marketToken: args.marketToken,
    side: args.side,
    anchorSymbol: ctx.anchorSymbol,
    anchorAddress: anchor,
    userInputToken: userInput,
    userOutputToken: userOutput,
    routeKind: "composed",
    legs: [
      leg({
        kind: "bpsDirect",
        label: `Step 1 · token → ${ctx.anchorSymbol} (BPS pool)`,
        inputToken: args.marketToken,
        outputToken: anchor,
        inputAmountWei: legA.sellAmount,
        expectedOutputWei: legA.buyAmount,
        minimumOutputWei: legA.minimumBuyAmount,
        transactionTarget: legA.transactionTarget,
        transactionData: legA.transactionData,
        allowanceTarget: legA.allowanceTarget,
        estimated: false,
      }),
      leg({
        kind: legB.venue,
        label: `Step 2 · ${ctx.anchorSymbol} → ${payment.symbol} (${VENUE_LABEL[legB.venue]})`,
        inputToken: anchor,
        outputToken: payment.address,
        inputAmountWei: anchorOut.toString(),
        expectedOutputWei: legB.buyAmountWei,
        minimumOutputWei: legB.minBuyAmountWei,
        transactionTarget: null,
        transactionData: null,
        allowanceTarget: legB.allowanceTarget,
        estimated: true,
      }),
    ],
    expectedFinalOutputWei: legB.buyAmountWei,
    // The venue already enforced slippage on this leg — never re-apply it.
    minimumFinalOutputWei: legB.minBuyAmountWei,
    totalPriceImpactBps: legA.priceImpactBps,
    poolFeeUnits: legA.poolFee,
    zeroExFeeNote: legB.platformFeeBps !== null ? `${VENUE_LABEL[legB.venue]} leg fee ${legB.platformFeeBps} bps.` : null,
    walletActionCount: 2,
    approvalsRequired: [
      ...(legA.allowanceTarget ? [{ token: args.marketToken, spender: legA.allowanceTarget }] : []),
      ...(legB.allowanceTarget ? [{ token: anchor, spender: legB.allowanceTarget }] : []),
    ],
    quoteExpiry: Math.min(Date.now() + QUOTE_TTL_MS, legB.quoteExpiry),
    warnings,
  };
}
