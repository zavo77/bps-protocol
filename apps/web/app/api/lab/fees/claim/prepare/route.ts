// POST /api/lab/fees/claim/prepare — build the unsigned collectFees(poolId)
// claim transaction for a beneficiary. Beneficiary AUTHORITY is verified by a
// contract read (pending fees > 0) before returning any transaction; the
// connected beneficiary wallet signs. No server signer. Signed-envelope gated.

import { getAddress, isAddress, keccak256, stringToHex } from "viem";
import { z } from "zod";
import { buildCollectFeesTx, readPendingFees, signedRequestSchema } from "@bps/launch-lab";
import {
  getFlags,
  getLabClient,
  payloadHashOf,
  verifySignedRequest,
} from "../../../../../../lib/lab/server";
import { assertSignatureUnused } from "../../../../../../lib/lab/store";
import {
  assertSameOrigin,
  clientKey,
  err,
  mapError,
  ok,
  rateLimited,
  requestHost,
} from "../../../../../../lib/lab/http";

export const dynamic = "force-dynamic";

const claimSchema = z.object({
  tokenAddress: z.string().refine(isAddress),
  beneficiary: z.string().refine(isAddress),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const originProblem = assertSameOrigin(req);
    if (originProblem) return err("BAD_ORIGIN", originProblem, 403);
    if (rateLimited(`claim:${clientKey(req)}`, 12))
      return err("RATE_LIMITED", "Too many requests.", 429);

    const body = (await req.json()) as { envelope?: unknown; payload?: unknown };
    const envelope = signedRequestSchema.parse(body.envelope);
    const payload = claimSchema.parse(body.payload);
    const wallet = await verifySignedRequest(envelope, {
      action: "prepare-trade",
      payloadHash: payloadHashOf(payload),
      host: requestHost(req),
    });
    if (wallet.toLowerCase() !== payload.beneficiary.toLowerCase()) {
      return err("BENEFICIARY_MISMATCH", "Signer must be the beneficiary wallet.", 403);
    }
    await assertSignatureUnused(
      keccak256(stringToHex(envelope.signature)),
      getFlags().requestTtlSeconds * 1000,
    );

    const client = getLabClient();
    const token = getAddress(payload.tokenAddress);
    const beneficiary = getAddress(payload.beneficiary);

    // Beneficiary authority + claimability = a real contract read.
    const pending = await readPendingFees(client, token, beneficiary);
    if (pending === null)
      return err("NOT_A_LAB_MARKET", "Fees are not readable for that market.", 404);
    if (!pending.hasClaimable) {
      return err("NOTHING_CLAIMABLE", "This wallet has no claimable fees on that market.", 409);
    }

    const tx = buildCollectFeesTx(pending.poolId);
    return ok({
      pending,
      transaction: {
        chainId: 4663,
        from: beneficiary,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_A_GOOGL_MARKET" || msg === "TOKEN_NOT_IN_POOL") {
      return err("NOT_A_LAB_MARKET", "That token is not a Launch Lab market.", 404);
    }
    return mapError(e);
  }
}
