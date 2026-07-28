// Token metadata for a provenance-verified lab launch, resolved server-side
// from the token's own tokenUri (proven manifest record first, then the
// on-chain tokenURI() read). Unknown/unverified tokens are 404 — this route
// never serves metadata for arbitrary addresses. Resolver failures are an
// honest { available: false }, never an error leak.

import { getAddress, isAddress } from "viem";
import { getLaunchRecord } from "../../../../../../lib/lab/store";
import { err, mapError, ok } from "../../../../../../lib/lab/http";
import { fetchTokenMetadata } from "../../../../../../lib/lab/token-metadata";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string }> },
): Promise<Response> {
  try {
    const { address } = await ctx.params;
    if (!isAddress(address)) return err("BAD_ADDRESS", "Not a valid address.");
    const token = getAddress(address);
    // Gate: only provenance-verified lab launches (same store lookup the
    // other lab routes use).
    const record = await getLaunchRecord(token);
    if (!record) return err("NOT_FOUND", "Unknown lab market.", 404);
    return ok(await fetchTokenMetadata(token));
  } catch (e) {
    return mapError(e);
  }
}
