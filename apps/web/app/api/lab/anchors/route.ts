// GET /api/lab/anchors — the approved Stock Token anchors a market may pair
// with. Static registry (each verified on-chain + simulation-proven); live
// price/multiplier is layered in best-effort so the UI can show current values.

import { APPROVED_ANCHORS, resolveAnchor } from "@bps/launch-lab";
import { getLabClient } from "../../../../lib/lab/server";
import { mapError, ok } from "../../../../lib/lab/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const client = getLabClient();
    const anchors = await Promise.all(
      APPROVED_ANCHORS.map(async (a) => {
        let midPriceUsd: string | null = null;
        let live = false;
        try {
          const v = await resolveAnchor(client, { symbol: a.symbol });
          if (v.status === "verified") {
            midPriceUsd = v.midPriceUsd;
            live = true;
          }
        } catch {
          // static record still returned; price simply unavailable
        }
        return {
          symbol: a.symbol,
          name: a.name,
          logo: a.logo,
          address: a.address,
          decimals: a.decimals,
          currentMultiplier: a.currentMultiplier,
          status: a.status,
          chainId: a.chainId,
          verifiedAt: a.verifiedAt,
          midPriceUsd,
          live,
        };
      }),
    );
    return ok({ anchors });
  } catch (e) {
    return mapError(e);
  }
}
