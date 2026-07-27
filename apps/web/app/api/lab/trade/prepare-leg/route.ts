// POST /api/lab/trade/prepare-leg — final pre-signature validation for ONE leg
// of a user trade (one-step 0x, composed leg, or advanced direct-anchor).
// Same protections as /trade/prepare: signed envelope, replay protection,
// server-side re-quote (client calldata never trusted), balance + allowance
// checks, exact-calldata simulation against the taker. No server signer.

import {
  erc20Abi,
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";
import {
  PERMIT2_ABI,
  quoteDirectRoute,
  signedRequestSchema,
  getPaymentToken,
  getLabPoolContext,
  NATIVE_ETH,
} from "@bps/launch-lab";
import {
  getFlags,
  getLabClient,
  payloadHashOf,
  verifySignedRequest,
} from "../../../../../lib/lab/server";
import { assertSignatureUnused } from "../../../../../lib/lab/store";
import { quoteAggregatorDirect } from "../../../../../lib/lab/trade-router";
import {
  assertSameOrigin,
  clientKey,
  err,
  mapError,
  ok,
  rateLimited,
  requestHost,
} from "../../../../../lib/lab/http";

export const dynamic = "force-dynamic";

const prepareLegSchema = z.object({
  kind: z.enum(["rialto", "oneInch", "zeroEx", "bpsDirect"]),
  marketToken: z.string().refine(isAddress),
  inputToken: z.string().refine(isAddress),
  outputToken: z.string().refine(isAddress),
  exactInputAmount: z.string().regex(/^[0-9]{1,36}$/),
  slippageBps: z.number().int().min(1).max(5_000),
  taker: z.string().refine(isAddress),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const originProblem = assertSameOrigin(req);
    if (originProblem) return err("BAD_ORIGIN", originProblem, 403);
    if (rateLimited(`tradeleg:${clientKey(req)}`, 20))
      return err("RATE_LIMITED", "Too many requests.", 429);

    const body = (await req.json()) as { envelope?: unknown; payload?: unknown };
    const envelope = signedRequestSchema.parse(body.envelope);
    const payload = prepareLegSchema.parse(body.payload);
    const wallet = await verifySignedRequest(envelope, {
      action: "prepare-trade",
      payloadHash: payloadHashOf(payload),
      host: requestHost(req),
    });
    if (wallet.toLowerCase() !== payload.taker.toLowerCase()) {
      return err("TAKER_MISMATCH", "Signer must be the taker wallet.", 403);
    }
    const flags = getFlags();
    await assertSignatureUnused(
      keccak256(stringToHex(envelope.signature)),
      flags.requestTtlSeconds * 1000,
    );

    const client = getLabClient();
    const taker = getAddress(payload.taker);
    const marketToken = getAddress(payload.marketToken);
    const inputToken = getAddress(payload.inputToken);
    const outputToken = getAddress(payload.outputToken);
    const amountIn = BigInt(payload.exactInputAmount);
    if (amountIn <= 0n) return err("AMOUNT_REQUIRED", "Amount must be positive.");

    const ctx = await getLabPoolContext(client, marketToken);
    const anchor = ctx.anchorAddress;

    // Fresh server-side quote for this exact leg.
    let to: Address;
    let data: Hex;
    let value = 0n;
    let gas = "500000";
    let allowanceTarget: Address | null = null;
    let permit2Spender: Address | null = null;
    let expectedOutputWei = "0";
    let minimumOutputWei = "0";
    // The venue that actually filled the leg (aggregator legs always run the
    // frozen priority chain server-side, so this can differ from the hint).
    let actualKind: "rialto" | "oneInch" | "zeroEx" | "bpsDirect" = payload.kind;

    if (payload.kind === "bpsDirect") {
      // Leg must be anchor<->marketToken through the verified rehype pool.
      const isBuyLeg = outputToken.toLowerCase() === marketToken.toLowerCase();
      const legOk = isBuyLeg
        ? inputToken.toLowerCase() === anchor.toLowerCase()
        : inputToken.toLowerCase() === marketToken.toLowerCase() &&
          outputToken.toLowerCase() === anchor.toLowerCase();
      if (!legOk) return err("BAD_LEG", "Direct legs run between the market token and its anchor.");
      const { quote } = await quoteDirectRoute(
        client,
        marketToken,
        isBuyLeg ? "buy" : "sell",
        amountIn,
        payload.slippageBps,
      );
      if (quote.priceImpactBps !== null && quote.priceImpactBps >= 1_500) {
        return err("EXCESSIVE_PRICE_IMPACT", "Price impact exceeds the safety ceiling.", 409);
      }
      to = quote.transactionTarget;
      data = quote.transactionData as Hex;
      gas = quote.estimatedGas;
      allowanceTarget = quote.allowanceTarget;
      permit2Spender = quote.transactionTarget;
      expectedOutputWei = quote.buyAmount;
      minimumOutputWei = quote.minimumBuyAmount;
    } else {
      // Aggregator leg. The server ALWAYS runs the frozen priority chain
      // (Rialto → 1inch → 0x) regardless of the client's kind hint, and the
      // response reports the venue actually used. Token binding: one side must
      // be a supported payment token and the counter-side must be EXACTLY this
      // market's token (one-step) or its anchor (composed). payment→payment and
      // payment→arbitrary-token legs are rejected outright.
      const inPay = getPaymentToken(inputToken);
      const outPay = getPaymentToken(outputToken);
      if ((inPay && outPay) || (!inPay && !outPay)) {
        return err(
          "BAD_LEG",
          "Aggregator legs run between a payment token and the market token or its anchor.",
        );
      }
      const counterToken = inPay ? outputToken : inputToken;
      if (
        counterToken.toLowerCase() !== marketToken.toLowerCase() &&
        counterToken.toLowerCase() !== anchor.toLowerCase()
      ) {
        return err(
          "BAD_LEG",
          "Aggregator legs run between a payment token and the market token or its anchor.",
        );
      }
      const agg = await quoteAggregatorDirect({
        sellToken: inputToken,
        // Anchor and market token are both 18dp; payment decimals from the registry.
        sellDecimals: inPay ? inPay.decimals : 18,
        buyToken: outputToken,
        sellAmountWei: amountIn,
        taker,
        slippageBps: payload.slippageBps,
      });
      if (!agg)
        return err("ROUTE_UNAVAILABLE", "No executable aggregator route for this leg.", 409);
      actualKind = agg.venue;
      to = agg.transactionTarget;
      data = agg.transactionData as Hex;
      value = BigInt(agg.transactionValue);
      allowanceTarget = agg.allowanceTarget;
      expectedOutputWei = agg.buyAmountWei;
      minimumOutputWei = agg.minBuyAmountWei;
      // Value binding: a native-ETH input leg must attach EXACTLY the trade
      // amount; an ERC-20 input leg must attach zero. Venue-returned values are
      // never trusted past this check.
      const nativeIn = inputToken.toLowerCase() === NATIVE_ETH.toLowerCase();
      if (nativeIn ? value !== amountIn : value !== 0n) {
        return err("BAD_VALUE", "Venue transaction value does not match the trade amount.", 409);
      }
    }

    // Balance check. For native ETH the tx `value` carries the amount, so the
    // requirement is `value` (== amountIn); for ERC-20 it is amountIn (value 0).
    const isNativeInput = inputToken.toLowerCase() === NATIVE_ETH.toLowerCase();
    const required = isNativeInput ? value : amountIn;
    const balance = isNativeInput
      ? await client.getBalance({ address: taker })
      : ((await client.readContract({
          address: inputToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [taker],
        })) as bigint);
    if (balance < required) {
      return err("INSUFFICIENT_BALANCE", "Wallet balance is below the trade amount.", 409);
    }

    // Allowance requirements.
    let erc20ApprovalNeeded = false;
    let permit2ApprovalNeeded = false;
    if (!isNativeInput && allowanceTarget) {
      const allowance = (await client.readContract({
        address: inputToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [taker, allowanceTarget],
      })) as bigint;
      erc20ApprovalNeeded = allowance < amountIn;
      if (payload.kind === "bpsDirect" && permit2Spender) {
        const [p2Amount, p2Expiration] = (await client.readContract({
          address: allowanceTarget,
          abi: PERMIT2_ABI,
          functionName: "allowance",
          args: [taker, inputToken, permit2Spender],
        })) as readonly [bigint, number, number];
        permit2ApprovalNeeded =
          p2Amount < amountIn || p2Expiration <= Math.floor(Date.now() / 1000);
      }
    }

    // Simulate the exact calldata when the allowance chain is satisfied.
    let simulation: "ok" | "reverted" | "skipped-pending-approval" = "skipped-pending-approval";
    if (!erc20ApprovalNeeded && !permit2ApprovalNeeded) {
      try {
        await client.call({ account: taker, to, data, value });
        simulation = "ok";
      } catch {
        return err(
          "SIMULATION_FAILED",
          "The exact leg transaction reverts; not returning it for signature.",
          409,
        );
      }
    }

    return ok({
      leg: {
        kind: actualKind,
        inputToken,
        outputToken,
        exactInputAmount: amountIn.toString(),
        expectedOutputWei,
        minimumOutputWei,
      },
      simulation,
      approvals: {
        erc20ApprovalNeeded,
        erc20ApprovalTarget: allowanceTarget,
        permit2ApprovalNeeded,
        permit2SpenderTarget: permit2Spender,
      },
      transaction: {
        chainId: 4663,
        from: taker,
        to,
        data,
        value: value.toString(),
        gas,
      },
      staleAfter: Date.now() + 60_000,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_A_GOOGL_MARKET" || msg === "TOKEN_NOT_IN_POOL") {
      return err("NOT_A_LAB_MARKET", "That token is not a Launch Lab market.", 404);
    }
    return mapError(e);
  }
}
