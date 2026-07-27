// POST — identical inputs to /prepare; re-runs the exact simulation for
// freshness checks (180 s rule). Same authentication requirements.

import { keccak256, stringToHex } from "viem";
import { prepareLaunchSchema, signedRequestSchema } from "@bps/launch-lab";
import {
  getFlags,
  payloadHashOf,
  prepareLaunch,
  verifySignedRequest,
} from "../../../../lib/lab/server";
import { assertSignatureUnused } from "../../../../lib/lab/store";
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
    if (rateLimited(`simulate:${clientKey(req)}`, 10))
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
    await assertSignatureUnused(
      keccak256(stringToHex(envelope.signature)),
      getFlags().requestTtlSeconds * 1000,
    );
    const commit =
      process.env.BPS_SOURCE_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || "local-dev";
    const bundle = await prepareLaunch(payload, "8h-v1", commit);
    return ok({
      simulation: bundle.simulation,
      prepared: bundle.prepared,
      manifestHash: bundle.manifestHash,
    });
  } catch (e) {
    return mapError(e);
  }
}
