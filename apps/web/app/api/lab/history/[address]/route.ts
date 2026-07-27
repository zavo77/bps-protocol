// Indexed swap history for a lab token. Served from the indexer's Postgres
// table; when that view is unavailable the response says so honestly instead
// of returning fabricated data. Token creation NEVER depends on this route.

import { isAddress } from "viem";
import { getRecentSwaps } from "../../../../../lib/lab/store";
import { err, mapError, ok } from "../../../../../lib/lab/http";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ address: string }> },
): Promise<Response> {
  try {
    const { address } = await ctx.params;
    if (!isAddress(address)) return err("BAD_ADDRESS", "Not a valid address.");
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? "200");
    const swaps = await getRecentSwaps(address, Number.isFinite(limit) ? limit : 200);
    if (swaps === null) {
      return ok({ available: false, reason: "awaiting-indexed-data", swaps: [] });
    }
    return ok({ available: true, swaps, source: "lab-indexer" });
  } catch (e) {
    return mapError(e);
  }
}
