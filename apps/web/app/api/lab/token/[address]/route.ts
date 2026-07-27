import { isAddress } from "viem";
import { readMarketSnapshot } from "../../../../../lib/lab/market";
import { err, mapError, ok } from "../../../../../lib/lab/http";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string }> },
): Promise<Response> {
  try {
    const { address } = await ctx.params;
    if (!isAddress(address)) return err("BAD_ADDRESS", "Not a valid address.");
    return ok(await readMarketSnapshot(address));
  } catch (e) {
    return mapError(e);
  }
}
