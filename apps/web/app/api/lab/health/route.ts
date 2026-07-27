// Production health endpoint for uptime monitoring (Better Stack).
// 200 = launch-critical dependencies healthy; 503 = sanitized failure state.
// Kill-switch-active / broadcast-disabled are healthy operating states.

import { NextResponse } from "next/server";
import { runHealthChecks } from "../../../../lib/lab/health";
import { getLabClient, getFlags } from "../../../../lib/lab/server";
import { pingDatabase } from "../../../../lib/lab/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  const { httpStatus, body } = await runHealthChecks({
    getChainId: () => getLabClient().getChainId(),
    dbPing: process.env.DATABASE_URL ? () => pingDatabase() : undefined,
    pinataConfigured: Boolean(process.env.PINATA_JWT?.trim() && process.env.PINATA_GATEWAY?.trim()),
    readFlags: getFlags,
    commit: (
      process.env.BPS_SOURCE_COMMIT ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "local-dev"
    ).slice(0, 12),
    timeoutMs: 5_000,
  });
  return NextResponse.json(body, {
    status: httpStatus,
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
