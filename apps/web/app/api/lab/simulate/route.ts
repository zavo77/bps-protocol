// POST { payload } — identical inputs to /prepare; re-runs the exact simulation
// for freshness checks (180 s rule). NO signed envelope (same contract as
// /prepare): the deployment transaction authenticates the creator, so stale
// re-simulation never requires a wallet interaction. Validation, access-mode
// enforcement, and per-IP + per-claimed-wallet rate limits still apply.

import { prepareLaunchSchema } from "@bps/launch-lab";
import { getFlags, prepareLaunch } from "../../../../lib/lab/server";
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
    if (rateLimited(`simulate:${clientKey(req)}`, 10))
      return err("RATE_LIMITED", "Too many requests.", 429);

    const body = (await req.json()) as { payload?: unknown };
    const parsed = prepareLaunchSchema.safeParse(body.payload);
    if (!parsed.success) return err("BAD_PAYLOAD", "Invalid launch payload.", 400);
    const payload = parsed.data;
    const wallet = payload.creatorAddress;

    const flags = getFlags();
    if (flags.accessMode === "disabled")
      return err("AUTH_CREATION_DISABLED", "Market creation is currently disabled.", 403);
    if (
      flags.accessMode === "allowlist" &&
      !flags.creatorAllowlist.some((a) => a.toLowerCase() === wallet.toLowerCase())
    ) {
      return err("AUTH_NOT_ALLOWLISTED", "Request authentication failed.", 401);
    }
    if (rateLimited(`simulate-wallet:${wallet.toLowerCase()}`, 10)) {
      return err("RATE_LIMITED", "Too many requests for this wallet.", 429);
    }

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
