// GET /api/lab/fees/[token]?beneficiary=0x... — contract-backed pending
// (claimable) creator fees for a beneficiary on a lab market. Amounts come
// straight from MulticurvePool.getPendingFees; claimability is NEVER inferred
// from volume. Returns { hasClaimable:false } when nothing is claimable.

import { getAddress, isAddress } from "viem";
import { readPendingFees } from "@bps/launch-lab";
import { getLabClient } from "../../../../../lib/lab/server";
import { err, mapError, ok } from "../../../../../lib/lab/http";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    const { token } = await ctx.params;
    if (!isAddress(token)) return err("BAD_ADDRESS", "Not a valid token address.");
    const beneficiaryRaw = new URL(req.url).searchParams.get("beneficiary");
    if (!beneficiaryRaw || !isAddress(beneficiaryRaw)) {
      return err("BAD_BENEFICIARY", "A valid beneficiary address is required.");
    }
    const pending = await readPendingFees(
      getLabClient(),
      getAddress(token),
      getAddress(beneficiaryRaw),
    );
    if (pending === null) {
      return err(
        "NOT_A_LAB_MARKET",
        "That token is not a Launch Lab market, or fees are unreadable.",
        404,
      );
    }
    return ok(pending);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_A_GOOGL_MARKET" || msg === "TOKEN_NOT_IN_POOL") {
      return err("NOT_A_LAB_MARKET", "That token is not a Launch Lab market.", 404);
    }
    return mapError(e);
  }
}
