// POST { envelope, payload } — full launch preparation: anchor re-verify,
// module verification, exact simulation, manifest + unsigned transaction.

import { keccak256, stringToHex } from "viem";
import { isBroadcastableTokenUri, prepareLaunchSchema, signedRequestSchema } from "@bps/launch-lab";
import {
  getFlags,
  payloadHashOf,
  prepareLaunch,
  verifySignedRequest,
} from "../../../../lib/lab/server";
import { assertSignatureUnused, enforceLaunchGuardrails } from "../../../../lib/lab/store";
import {
  assertSameOrigin,
  clientKey,
  err,
  mapError,
  ok,
  rateLimited,
  requestHost,
} from "../../../../lib/lab/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const originProblem = assertSameOrigin(req);
    if (originProblem) return err("BAD_ORIGIN", originProblem, 403);
    if (rateLimited(`prepare:${clientKey(req)}`, 6))
      return err("RATE_LIMITED", "Too many requests.", 429);

    const body = (await req.json()) as { envelope?: unknown; payload?: unknown };
    const envelope = signedRequestSchema.parse(body.envelope);
    const payload = prepareLaunchSchema.parse(body.payload);

    const wallet = await verifySignedRequest(envelope, {
      action: "prepare-launch",
      payloadHash: payloadHashOf(payload),
      host: requestHost(req),
    });
    if (wallet.toLowerCase() !== payload.creatorAddress.toLowerCase()) {
      return err("CREATOR_MISMATCH", "Signer must be the creator wallet.", 403);
    }
    const flags = getFlags();
    await assertSignatureUnused(
      keccak256(stringToHex(envelope.signature)),
      flags.requestTtlSeconds * 1000,
    );
    await enforceLaunchGuardrails(wallet, flags);
    if (rateLimited(`prepare-wallet:${wallet.toLowerCase()}`, 6)) {
      return err("RATE_LIMITED", "Too many requests for this wallet.", 429);
    }
    if (
      !isBroadcastableTokenUri({
        imageCid: payload.imageCid,
        metadataCid: payload.metadataCid,
        tokenUri: payload.tokenUri,
        provider: payload.metadataProvider,
      })
    ) {
      return err("METADATA_NOT_BROADCASTABLE", "Token metadata is not a production IPFS upload.");
    }

    const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "local-dev";
    const bundle = await prepareLaunch(payload, "8h-v1", commit);
    return ok(bundle);
  } catch (e) {
    return mapError(e);
  }
}
