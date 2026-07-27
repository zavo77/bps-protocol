// Indexed swap history for a lab token. Served from the indexer's Postgres
// table; when that view is unavailable the response says so honestly instead
// of returning fabricated data. Token creation NEVER depends on this route.

import { getAddress, isAddress } from "viem";
import { getAnchorByAddress } from "@bps/launch-lab";
import { getRecentSwaps, getLaunchRecord } from "../../../../../lib/lab/store";
import { err, mapError, ok } from "../../../../../lib/lab/http";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ address: string }> },
): Promise<Response> {
  try {
    const { address } = await ctx.params;
    if (!isAddress(address)) return err("BAD_ADDRESS", "Not a valid address.");
    const token = getAddress(address);
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? "200");
    const swaps = await getRecentSwaps(token, Number.isFinite(limit) ? limit : 200);

    // Resolve this market's anchor so price/volume are denominated correctly.
    const record = await getLaunchRecord(token);
    const anchor = record?.numeraire ? getAnchorByAddress(record.numeraire) : null;
    const anchorMeta = anchor
      ? {
          anchorSymbol: anchor.symbol,
          anchorAddress: anchor.address,
          anchorDecimals: anchor.decimals,
        }
      : {
          anchorSymbol: record?.anchorSymbol ?? null,
          anchorAddress: record?.numeraire ?? null,
          anchorDecimals: 18,
        };

    if (swaps === null) {
      return ok({ available: false, reason: "awaiting-indexed-data", swaps: [], ...anchorMeta });
    }
    return ok({ available: true, swaps, source: "lab-indexer", ...anchorMeta });
  } catch (e) {
    return mapError(e);
  }
}
