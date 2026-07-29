// POST { payload } — full launch preparation: anchor re-verify, module
// verification, exact simulation, manifest + unsigned transaction.
//
// NO signed envelope: the creator is authenticated by the deployment
// transaction itself (registration verifies receipt.from + calldata + manifest
// hash + predicted token + provenance). payload.creatorAddress is a CLAIMED
// wallet used only for access control, launch guardrails, and rate limiting —
// spoofing it gains nothing because the prepared transaction and the issued
// manifest are bound to that address, and only that address can broadcast them.

import { isBroadcastableTokenUri, prepareLaunchSchema } from "@bps/launch-lab";
import { getFlags, prepareLaunch } from "../../../../lib/lab/server";
import { enforceLaunchGuardrails, recordPreparedLaunch } from "../../../../lib/lab/store";
import {
  assertSameOrigin,
  clientKey,
  err,
  mapError,
  ok,
  rateLimited,
} from "../../../../lib/lab/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const originProblem = assertSameOrigin(req);
    if (originProblem) return err("BAD_ORIGIN", originProblem, 403);
    if (rateLimited(`prepare:${clientKey(req)}`, 6))
      return err("RATE_LIMITED", "Too many requests.", 429);

    const body = (await req.json()) as { payload?: unknown };
    const parsed = prepareLaunchSchema.safeParse(body.payload);
    if (!parsed.success) return err("BAD_PAYLOAD", "Invalid launch payload.", 400);
    const payload = parsed.data;
    const wallet = payload.creatorAddress;

    const flags = getFlags();
    // Access modes still bind to the claimed creator wallet: 'disabled'
    // rejects everyone; 'allowlist' requires the claimed creator to be listed.
    if (flags.accessMode === "disabled")
      return err("AUTH_CREATION_DISABLED", "Market creation is currently disabled.", 403);
    if (
      flags.accessMode === "allowlist" &&
      !flags.creatorAllowlist.some((a) => a.toLowerCase() === wallet.toLowerCase())
    ) {
      return err("AUTH_NOT_ALLOWLISTED", "Request authentication failed.", 401);
    }
    if (rateLimited(`prepare-wallet:${wallet.toLowerCase()}`, 6)) {
      return err("RATE_LIMITED", "Too many requests for this wallet.", 429);
    }
    await enforceLaunchGuardrails(wallet, flags);
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

    const commit =
      process.env.BPS_SOURCE_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || "local-dev";
    const bundle = await prepareLaunch(payload, "8h-v1", commit);
    // Record the issued manifest prediction: this is the BPS provenance signal.
    // At registration, the created token must match a prediction by this creator
    // — external Doppler markets never went through /api/lab/prepare.
    await recordPreparedLaunch({
      predictedToken: bundle.simulation.predictedTokenAddress,
      creator: wallet,
      manifestHash: bundle.manifestHash,
      anchorSymbol: bundle.manifest.anchorSymbol,
      numeraire: bundle.manifest.anchorAddress,
    });
    return ok(bundle);
  } catch (e) {
    return mapError(e);
  }
}
