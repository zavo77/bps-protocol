// POST /api/lab/quote — user-facing trade quotes. Users pay/receive
// ETH / WETH / USDG (the market's RWA anchor is internal routing detail;
// it remains available as an advanced input/output). Priority: one-transaction
// 0x route end-to-end, else the composed fallback (0x payment leg + verified
// BPS Direct rehype-pool leg) as explicit sequential wallet actions.

import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { getLabClient, isSellPaused } from "../../../../lib/lab/server";
import { quoteUserTrade } from "../../../../lib/lab/trade-router";
import {
  assertSameOrigin,
  clientKey,
  err,
  mapError,
  ok,
  rateLimited,
} from "../../../../lib/lab/http";

export const dynamic = "force-dynamic";

const quoteInputSchema = z.object({
  marketToken: z.string().refine(isAddress, "Invalid market token"),
  side: z.enum(["buy", "sell"]),
  inputToken: z.string().refine(isAddress, "Invalid input token"),
  outputToken: z.string().refine(isAddress, "Invalid output token"),
  exactInputAmount: z.string().regex(/^[0-9]{1,36}$/),
  taker: z.string().refine(isAddress, "Invalid taker address"),
  slippageBps: z.number().int().min(1).max(5_000).default(100),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const originProblem = assertSameOrigin(req);
    if (originProblem) return err("BAD_ORIGIN", originProblem, 403);
    if (rateLimited(`quote:${clientKey(req)}`, 30))
      return err("RATE_LIMITED", "Too many requests.", 429);

    const input = quoteInputSchema.parse(await req.json());
    const amountIn = BigInt(input.exactInputAmount);
    if (amountIn <= 0n) return err("AMOUNT_REQUIRED", "Amount must be positive.");
    // Incident brake: block NEW market-token sells (input = the market token).
    // Recovery conversions (anchor → payment) are unaffected by design.
    if (
      isSellPaused() &&
      input.side === "sell" &&
      input.inputToken.toLowerCase() === input.marketToken.toLowerCase()
    ) {
      return err(
        "SELL_PAUSED",
        "Selling this market is temporarily paused while an issue is investigated. Your tokens are safe in your wallet.",
        503,
      );
    }

    const quote = await quoteUserTrade(getLabClient(), {
      marketToken: getAddress(input.marketToken),
      side: input.side,
      inputToken: getAddress(input.inputToken),
      outputToken: getAddress(input.outputToken),
      exactInputAmountWei: amountIn,
      taker: getAddress(input.taker),
      slippageBps: input.slippageBps,
    });
    return ok(quote);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_A_GOOGL_MARKET" || msg === "TOKEN_NOT_IN_POOL") {
      return err("NOT_A_LAB_MARKET", "That token is not a Launch Lab market.", 404);
    }
    if (msg === "MARKET_TOKEN_MISMATCH")
      return err(msg, "The trade must buy or sell the market token.");
    if (msg === "UNSUPPORTED_PAYMENT_TOKEN") {
      return err(
        msg,
        "Pay or receive with ETH, WETH, or USDG (or the market anchor as an advanced option).",
      );
    }
    if (msg === "NO_ROUTE_FOR_PAYMENT_TOKEN") {
      return err(
        msg,
        "No executable conversion route is currently available for that payment token.",
        409,
      );
    }
    if (msg === "NO_POOL_LIQUIDITY") {
      return err(
        msg,
        "The market pool does not hold enough liquidity for this side of the trade yet — a brand-new market gains sell-side liquidity after its first buys.",
        409,
      );
    }
    if (msg === "QUOTER_REVERTED") {
      return err(msg, "The pool rejected this quote; try a different amount.", 409);
    }
    if (msg === "AMOUNT_REQUIRED" || msg === "INVALID_SLIPPAGE")
      return err(msg, "Invalid quote input.");
    return mapError(e);
  }
}
