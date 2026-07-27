// POST /api/lab/quote — embedded bidirectional trading quotes.
// Always computes the mandatory bpsDirectV4 route; adds the optional 0x route
// when configured and valid; selects the better executable output. Read-only:
// no signature required, but origin-bound and rate-limited.

import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { quoteDirectRoute, GOOGL_ADDRESS, type RouteQuote } from "@bps/launch-lab";
import { getLabClient } from "../../../../lib/lab/server";
import { quoteZeroExRoute } from "../../../../lib/lab/zeroex";
import { assertSameOrigin, clientKey, err, mapError, ok, rateLimited } from "../../../../lib/lab/http";

export const dynamic = "force-dynamic";

const quoteInputSchema = z.object({
  tokenAddress: z.string().refine(isAddress, "Invalid token address"),
  side: z.enum(["buy", "sell"]),
  amountInWei: z.string().regex(/^[0-9]{1,36}$/),
  taker: z.string().refine(isAddress, "Invalid taker address"),
  slippageBps: z.number().int().min(1).max(5_000).default(100),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const originProblem = assertSameOrigin(req);
    if (originProblem) return err("BAD_ORIGIN", originProblem, 403);
    if (rateLimited(`quote:${clientKey(req)}`, 30)) return err("RATE_LIMITED", "Too many requests.", 429);

    const input = quoteInputSchema.parse(await req.json());
    const amountIn = BigInt(input.amountInWei);
    if (amountIn <= 0n) return err("AMOUNT_REQUIRED", "Amount must be positive.");
    const token = getAddress(input.tokenAddress);
    const taker = getAddress(input.taker);
    const client = getLabClient();

    // Mandatory direct route (fails closed on non-lab/non-GOOGL pools).
    const { quote: direct } = await quoteDirectRoute(client, token, input.side, amountIn, input.slippageBps);

    // Optional 0x route; its absence is never a market failure.
    const sellToken = input.side === "buy" ? GOOGL_ADDRESS : token;
    const buyToken = input.side === "buy" ? token : GOOGL_ADDRESS;
    const zeroEx = await quoteZeroExRoute({
      sellToken,
      buyToken,
      sellAmountWei: amountIn,
      taker,
      slippageBps: input.slippageBps,
    });

    const routes: RouteQuote[] = zeroEx ? [direct, zeroEx] : [direct];
    const selected =
      zeroEx && BigInt(zeroEx.buyAmount) > BigInt(direct.buyAmount) ? zeroEx.routeId : direct.routeId;

    return ok({ routes, selected, side: input.side, tokenAddress: token, taker });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_A_GOOGL_MARKET" || msg === "TOKEN_NOT_IN_POOL") {
      return err("NOT_A_LAB_MARKET", "That token is not a Launch Lab GOOGL market.", 404);
    }
    if (msg === "AMOUNT_REQUIRED" || msg === "INVALID_SLIPPAGE") return err(msg, "Invalid quote input.");
    return mapError(e);
  }
}
