// GET /api/lab/profile/[walletAddress] — public creator profile. Real data only:
// created markets (chain-reconstructed), indexed gross swap activity per market
// and in total, and — where the DB view exists — per-market swap counts. Fee
// destination and claimable amounts are surfaced through the fees endpoints
// (contract-backed), never inferred here.

import { getAddress, isAddress } from "viem";
import { getAnchorByAddress } from "@bps/launch-lab";
import { getCreatorMarkets, getVolumeByToken } from "../../../../../lib/lab/store";
import { err, mapError, ok } from "../../../../../lib/lab/http";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ walletAddress: string }> },
): Promise<Response> {
  try {
    const { walletAddress } = await ctx.params;
    if (!isAddress(walletAddress)) return err("BAD_ADDRESS", "Not a valid wallet address.");
    const wallet = getAddress(walletAddress);

    const markets = await getCreatorMarkets(wallet);
    const volume = await getVolumeByToken(markets.map((m) => m.tokenAddress));

    let totalGross = 0n;
    const marketRows = markets.map((m) => {
      const v = volume?.get(m.tokenAddress.toLowerCase());
      if (v) totalGross += v.gross;
      const anchor = getAnchorByAddress(m.numeraire);
      return {
        tokenAddress: m.tokenAddress,
        tokenName: m.tokenName,
        tokenSymbol: m.tokenSymbol,
        anchorSymbol: anchor?.symbol ?? m.anchorSymbol,
        anchorAddress: m.numeraire,
        launchTransactionHash: m.launchTransactionHash,
        blockNumber: m.blockNumber,
        timestamp: m.timestamp,
        indexedSwaps: v ? v.swaps : null,
        grossMovementWei: v ? v.gross.toString() : null,
      };
    });

    return ok({
      creator: wallet,
      marketCount: markets.length,
      totalIndexedGrossWei: volume ? totalGross.toString() : null,
      indexedDataAvailable: volume !== null,
      markets: marketRows,
      // Fee destination + claimable amounts are contract-backed reads via
      // /api/lab/fees/[token]?beneficiary=..., not inferred from this profile.
      feesNote: "Query /api/lab/fees/[token] for contract-backed pending fees.",
    });
  } catch (e) {
    return mapError(e);
  }
}
