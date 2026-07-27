// User-facing trade routing: ETH/WETH/USDG in and out; the market's RWA anchor
// is INTERNAL. Priority: (A) one-transaction 0x route end-to-end; (B) composed
// fallback — payment leg via 0x + the verified BPS Direct rehype-pool leg —
// presented as explicit sequential wallet actions (never claimed atomic unless
// the exact combined transaction simulated, which composed routes are not).
// The anchor itself remains available as an advanced direct route.

import "server-only";
import { getAddress, type Address, type PublicClient } from "viem";
import {
  getLabPoolContext,
  quoteDirectRoute,
  getPaymentToken,
  minAmountOut,
  type RouteLeg,
  type UserRouteQuote,
} from "@bps/launch-lab";
import { quoteZeroExRoute } from "./zeroex";

const QUOTE_TTL_MS = 60_000;

function leg(
  partial: Omit<RouteLeg, "transactionValue"> & { transactionValue?: string },
): RouteLeg {
  return { transactionValue: partial.transactionValue ?? "0", ...partial };
}

/**
 * Quote a user trade. inputToken/outputToken are payment-token addresses (or
 * the NATIVE_ETH sentinel), or the market's anchor for the advanced path.
 */
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
  const warnings: string[] = [];
  const anchor = ctx.anchorAddress;
  const isBuy = args.side === "buy";
  const userInput = getAddress(args.inputToken);
  const userOutput = getAddress(args.outputToken);
  const expectedUserSide = isBuy ? userInput : userOutput;
  const marketSide = isBuy ? userOutput : userInput;
  if (marketSide.toLowerCase() !== args.marketToken.toLowerCase()) {
    throw new Error("MARKET_TOKEN_MISMATCH");
  }

  // Advanced path: the user explicitly pays/receives the anchor itself.
  if (expectedUserSide.toLowerCase() === anchor.toLowerCase()) {
    const { quote } = await quoteDirectRoute(
      client,
      args.marketToken,
      args.side,
      args.exactInputAmountWei,
      args.slippageBps,
    );
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
      approvalsRequired: quote.allowanceTarget
        ? [{ token: userInput, spender: quote.allowanceTarget }]
        : [],
      quoteExpiry: Date.now() + QUOTE_TTL_MS,
      warnings: quote.warnings,
    };
  }

  const payment = getPaymentToken(expectedUserSide);
  if (!payment) throw new Error("UNSUPPORTED_PAYMENT_TOKEN");

  // (A) one-transaction 0x route end-to-end.
  const oneStep = await quoteZeroExRoute({
    sellToken: isBuy ? payment.address : args.marketToken,
    buyToken: isBuy ? args.marketToken : payment.address,
    sellAmountWei: args.exactInputAmountWei,
    taker: args.taker,
    slippageBps: args.slippageBps,
  });
  if (oneStep) {
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
          kind: "zeroEx",
          label: "0x best route (one transaction)",
          inputToken: userInput,
          outputToken: userOutput,
          inputAmountWei: oneStep.sellAmount,
          expectedOutputWei: oneStep.buyAmount,
          minimumOutputWei: oneStep.minimumBuyAmount,
          transactionTarget: oneStep.transactionTarget,
          transactionData: oneStep.transactionData,
          transactionValue: oneStep.transactionValue,
          allowanceTarget: oneStep.allowanceTarget,
          estimated: false,
        }),
      ],
      expectedFinalOutputWei: oneStep.buyAmount,
      minimumFinalOutputWei: oneStep.minimumBuyAmount,
      totalPriceImpactBps: oneStep.priceImpactBps,
      poolFeeUnits: null,
      zeroExFeeNote: "0x route fees are included in the quoted output.",
      walletActionCount: 1,
      approvalsRequired:
        oneStep.allowanceTarget && !payment.native
          ? [{ token: payment.address, spender: oneStep.allowanceTarget }]
          : [],
      quoteExpiry: Math.min(Date.now() + QUOTE_TTL_MS, oneStep.quoteExpiry),
      warnings,
    };
  }

  // (B) composed fallback: payment <-> anchor via 0x, anchor <-> token via
  // the verified BPS Direct rehype pool. Two sequential wallet actions.
  if (isBuy) {
    const legA = await quoteZeroExRoute({
      sellToken: payment.address,
      buyToken: anchor,
      sellAmountWei: args.exactInputAmountWei,
      taker: args.taker,
      slippageBps: args.slippageBps,
    });
    if (!legA) throw new Error("NO_ROUTE_FOR_PAYMENT_TOKEN");
    const anchorIn = BigInt(legA.minimumBuyAmount);
    const { quote: legB } = await quoteDirectRoute(
      client,
      args.marketToken,
      "buy",
      anchorIn,
      args.slippageBps,
    );
    warnings.push(
      `Composed route: ${payment.symbol} → ${ctx.anchorSymbol} (0x), then ${ctx.anchorSymbol} → token (BPS pool). Two wallet actions; the second leg re-quotes from the actual received amount.`,
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
          kind: "zeroEx",
          label: `Step 1 · ${payment.symbol} → ${ctx.anchorSymbol} (0x)`,
          inputToken: payment.address,
          outputToken: anchor,
          inputAmountWei: legA.sellAmount,
          expectedOutputWei: legA.buyAmount,
          minimumOutputWei: legA.minimumBuyAmount,
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
      zeroExFeeNote: "0x leg fees are included in its quoted output.",
      walletActionCount: 2,
      approvalsRequired: [
        ...(legA.allowanceTarget && !payment.native
          ? [{ token: payment.address, spender: legA.allowanceTarget }]
          : []),
        ...(legB.allowanceTarget ? [{ token: anchor, spender: legB.allowanceTarget }] : []),
      ],
      quoteExpiry: Math.min(Date.now() + QUOTE_TTL_MS, legA.quoteExpiry),
      warnings,
    };
  }

  // Sell: token → anchor (BPS pool), then anchor → payment (0x).
  const { quote: legA } = await quoteDirectRoute(
    client,
    args.marketToken,
    "sell",
    args.exactInputAmountWei,
    args.slippageBps,
  );
  const anchorOut = BigInt(legA.minimumBuyAmount);
  const legB = await quoteZeroExRoute({
    sellToken: anchor,
    buyToken: payment.address,
    sellAmountWei: anchorOut,
    taker: args.taker,
    slippageBps: args.slippageBps,
  });
  if (!legB) throw new Error("NO_ROUTE_FOR_PAYMENT_TOKEN");
  warnings.push(
    `Composed route: token → ${ctx.anchorSymbol} (BPS pool), then ${ctx.anchorSymbol} → ${payment.symbol} (0x). Two wallet actions; the second leg re-quotes from the actual received amount.`,
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
        kind: "zeroEx",
        label: `Step 2 · ${ctx.anchorSymbol} → ${payment.symbol} (0x)`,
        inputToken: anchor,
        outputToken: payment.address,
        inputAmountWei: anchorOut.toString(),
        expectedOutputWei: legB.buyAmount,
        minimumOutputWei: legB.minimumBuyAmount,
        transactionTarget: null,
        transactionData: null,
        allowanceTarget: legB.allowanceTarget,
        estimated: true,
      }),
    ],
    expectedFinalOutputWei: legB.buyAmount,
    minimumFinalOutputWei: minAmountOut(BigInt(legB.buyAmount), args.slippageBps).toString(),
    totalPriceImpactBps: legA.priceImpactBps,
    poolFeeUnits: legA.poolFee,
    zeroExFeeNote: "0x leg fees are included in its quoted output.",
    walletActionCount: 2,
    approvalsRequired: [
      ...(legA.allowanceTarget ? [{ token: args.marketToken, spender: legA.allowanceTarget }] : []),
      ...(legB.allowanceTarget ? [{ token: anchor, spender: legB.allowanceTarget }] : []),
    ],
    quoteExpiry: Math.min(Date.now() + QUOTE_TTL_MS, legB.quoteExpiry),
    warnings,
  };
}
