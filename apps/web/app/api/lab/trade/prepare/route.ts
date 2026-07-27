// POST /api/lab/trade/prepare — final pre-signature validation for a trade.
// Revalidates the market, refreshes the quote server-side, verifies the signed
// envelope, checks balance + allowance, simulates the exact calldata against
// the taker, and returns the unsigned wallet transaction. The browser wallet
// signs; there is no server-side signer.

import { erc20Abi, getAddress, isAddress, keccak256, stringToHex, type Address, type Hex } from "viem";
import { z } from "zod";
import {
  PERMIT2_ABI,
  quoteDirectRoute,
  signedRequestSchema,
  type RouteQuote,
} from "@bps/launch-lab";
import { getFlags, getLabClient, payloadHashOf, verifySignedRequest } from "../../../../../lib/lab/server";
import { assertSignatureUnused } from "../../../../../lib/lab/store";
import { quoteZeroExRoute } from "../../../../../lib/lab/zeroex";
import { assertSameOrigin, clientKey, err, mapError, ok, rateLimited, requestHost } from "../../../../../lib/lab/http";

export const dynamic = "force-dynamic";

const prepareTradeSchema = z.object({
  tokenAddress: z.string().refine(isAddress),
  side: z.enum(["buy", "sell"]),
  amountInWei: z.string().regex(/^[0-9]{1,36}$/),
  slippageBps: z.number().int().min(1).max(5_000),
  routeId: z.enum(["bpsDirectV4", "zeroEx"]),
  taker: z.string().refine(isAddress),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const originProblem = assertSameOrigin(req);
    if (originProblem) return err("BAD_ORIGIN", originProblem, 403);
    if (rateLimited(`trade:${clientKey(req)}`, 12)) return err("RATE_LIMITED", "Too many requests.", 429);

    const body = (await req.json()) as { envelope?: unknown; payload?: unknown };
    const envelope = signedRequestSchema.parse(body.envelope);
    const payload = prepareTradeSchema.parse(body.payload);
    const wallet = await verifySignedRequest(envelope, {
      action: "prepare-trade",
      payloadHash: payloadHashOf(payload),
      host: requestHost(req),
    });
    if (wallet.toLowerCase() !== payload.taker.toLowerCase()) {
      return err("TAKER_MISMATCH", "Signer must be the taker wallet.", 403);
    }
    const flags = getFlags();
    await assertSignatureUnused(keccak256(stringToHex(envelope.signature)), flags.requestTtlSeconds * 1000);

    const client = getLabClient();
    const token = getAddress(payload.tokenAddress);
    const taker = getAddress(payload.taker);
    const amountIn = BigInt(payload.amountInWei);
    if (amountIn <= 0n) return err("AMOUNT_REQUIRED", "Amount must be positive.");

    // Fresh server-side quote for the requested route — client payloads are
    // never trusted for calldata.
    let route: RouteQuote;
    let permit2: Address | null = null;
    if (payload.routeId === "bpsDirectV4") {
      const { quote, ctx } = await quoteDirectRoute(client, token, payload.side, amountIn, payload.slippageBps);
      route = quote;
      permit2 = ctx.permit2;
    } else {
      const { GOOGL_ADDRESS } = await import("@bps/launch-lab");
      const sellToken = payload.side === "buy" ? GOOGL_ADDRESS : token;
      const buyToken = payload.side === "buy" ? token : GOOGL_ADDRESS;
      const z = await quoteZeroExRoute({ sellToken, buyToken, sellAmountWei: amountIn, taker, slippageBps: payload.slippageBps });
      if (!z) return err("ROUTE_UNAVAILABLE", "0x has no executable route; use BPS Direct.", 409);
      route = z;
    }
    if (route.priceImpactBps !== null && route.priceImpactBps >= 1_500) {
      return err("EXCESSIVE_PRICE_IMPACT", "Price impact exceeds the safety ceiling.", 409);
    }

    // Balance check (sell token side).
    const balance = (await client.readContract({
      address: route.sellToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [taker],
    })) as bigint;
    if (balance < amountIn) return err("INSUFFICIENT_BALANCE", "Wallet balance is below the trade amount.", 409);

    // Allowance requirements (reported; approvals happen in the wallet).
    let approvalNeeded = false;
    let approvalTarget: Address | null = route.allowanceTarget;
    let permit2ApprovalNeeded = false;
    if (route.routeId === "bpsDirectV4" && permit2) {
      const erc20Allowance = (await client.readContract({
        address: route.sellToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [taker, permit2],
      })) as bigint;
      approvalNeeded = erc20Allowance < amountIn;
      const [p2Amount, p2Expiration] = (await client.readContract({
        address: permit2,
        abi: PERMIT2_ABI,
        functionName: "allowance",
        args: [taker, route.sellToken, route.transactionTarget],
      })) as readonly [bigint, number, number];
      permit2ApprovalNeeded = p2Amount < amountIn || p2Expiration <= Math.floor(Date.now() / 1000);
    } else if (route.allowanceTarget) {
      const allowance = (await client.readContract({
        address: route.sellToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [taker, route.allowanceTarget],
      })) as bigint;
      approvalNeeded = allowance < amountIn;
    }

    // Simulate the exact calldata against the taker; approval gaps are
    // expected pre-approval failures, so simulation only hard-blocks when the
    // allowance chain is already satisfied.
    let simulation: "ok" | "reverted" | "skipped-pending-approval" = "skipped-pending-approval";
    if (!approvalNeeded && !permit2ApprovalNeeded) {
      try {
        await client.call({
          account: taker,
          to: route.transactionTarget,
          data: route.transactionData as Hex,
          value: BigInt(route.transactionValue),
        });
        simulation = "ok";
      } catch {
        simulation = "reverted";
      }
      if (simulation === "reverted") {
        return err("SIMULATION_FAILED", "The exact trade transaction reverts; not returning it for signature.", 409);
      }
    }

    return ok({
      route,
      simulation,
      approvals: {
        erc20ApprovalNeeded: approvalNeeded,
        erc20ApprovalTarget: approvalTarget,
        permit2ApprovalNeeded,
        permit2SpenderTarget: route.routeId === "bpsDirectV4" ? route.transactionTarget : null,
      },
      transaction: {
        chainId: 4663,
        from: taker,
        to: route.transactionTarget,
        data: route.transactionData,
        value: route.transactionValue,
        gas: route.estimatedGas,
      },
      staleAfter: route.quoteExpiry,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_A_GOOGL_MARKET" || msg === "TOKEN_NOT_IN_POOL") {
      return err("NOT_A_LAB_MARKET", "That token is not a Launch Lab GOOGL market.", 404);
    }
    return mapError(e);
  }
}
