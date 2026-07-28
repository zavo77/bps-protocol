// GET: list confirmed lab launches (chain-reconstructed; DB-mirrored when
// configured). POST: idempotently register a just-confirmed launch by tx hash —
// the server verifies everything from the chain; the client is never trusted.

import { parseEventLogs, getAddress, type Address, type Hex } from "viem";
import { airlockAbi, CHAIN_IDS, getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { getAnchorByAddress } from "@bps/launch-lab";
import { extractLaunchFacts } from "../../../../lib/lab/launch-facts";
import { getLabClient } from "../../../../lib/lab/server";
import {
  invalidateLaunchCache,
  listLaunches,
  getVolumeByToken,
  matchIssuedManifest,
  insertVerifiedLaunch,
  isTokenVerified,
  consumeIssuedManifest,
} from "../../../../lib/lab/store";
import { clientKey, err, mapError, ok, rateLimited } from "../../../../lib/lab/http";

export const dynamic = "force-dynamic";

/**
 * List markets for /lab/tokens. Enriched with indexed swap activity and the
 * resolved anchor; supports sort=newest|volume (default newest). Search/filter
 * by symbol/name/anchor is applied client-side over this real data.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const launches = await listLaunches();
    const volume = await getVolumeByToken(launches.map((l) => l.tokenAddress));
    const enriched = launches.map((l) => {
      const anchor = getAnchorByAddress(l.numeraire);
      const v = volume?.get(l.tokenAddress.toLowerCase());
      return {
        ...l,
        anchorSymbol: anchor?.symbol ?? l.anchorSymbol,
        indexedSwaps: v ? v.swaps : null,
        grossMovementWei: v ? v.gross.toString() : null,
      };
    });
    const sort = new URL(req.url).searchParams.get("sort") ?? "newest";
    enriched.sort((a, b) => {
      if (sort === "volume") {
        return BigInt(b.grossMovementWei ?? "0") > BigInt(a.grossMovementWei ?? "0") ? 1 : -1;
      }
      return Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0);
    });
    return ok({ launches: enriched, indexedDataAvailable: volume !== null, sort });
  } catch (e) {
    return mapError(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    if (rateLimited(`launchreg:${clientKey(req)}`, 10))
      return err("RATE_LIMITED", "Too many requests.", 429);
    const body = (await req.json()) as { transactionHash?: string; manifest?: unknown };
    const hash = body.transactionHash;
    if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash))
      return err("BAD_TX_HASH", "Invalid transaction hash.");

    const client = getLabClient();
    const receipt = await client.getTransactionReceipt({ hash: hash as Hex });
    if (receipt.status !== "success") return err("TX_NOT_SUCCESS", "Transaction did not succeed.");
    const a = getAddresses(CHAIN_IDS.ROBINHOOD) as unknown as {
      airlock: Address;
      dopplerHookInitializer: Address;
    };
    const created = parseEventLogs({
      abi: airlockAbi,
      logs: receipt.logs,
      eventName: "Create",
    }).find((l) => l.address.toLowerCase() === a.airlock.toLowerCase());
    if (!created) return err("NO_CREATE_EVENT", "No Airlock Create event in that transaction.");
    const args = created.args as {
      asset: Address;
      numeraire: Address;
      initializer: Address;
      poolOrHook: Address;
    };
    if (!getAnchorByAddress(args.numeraire)) {
      return err("WRONG_NUMERAIRE", "Launch is not paired with an approved Stock Token.");
    }
    if (args.initializer.toLowerCase() !== a.dopplerHookInitializer.toLowerCase()) {
      return err("WRONG_INITIALIZER", "Launch did not use the lab initializer.");
    }
    const asset = getAddress(args.asset);
    const creator = getAddress(receipt.from);

    // Idempotent: an already-verified token re-registers cleanly.
    if (await isTokenVerified(asset)) {
      invalidateLaunchCache();
      return ok({ registered: true, provenanceVerified: true, tokenAddress: asset });
    }

    // BPS PROVENANCE GATE: the created token must match an UNCONSUMED manifest
    // THIS server issued to this creator via /api/lab/prepare. That manifest was
    // built server-side with the exact creator, anchor, BPS fee recipient,
    // 85/10/5 shares, rehype initializer, no-op migration/governance and pool
    // configuration — so a match transitively proves all of those. An approved
    // anchor + the generic Doppler initializer is NOT sufficient; external
    // Doppler markets never went through /api/lab/prepare and are rejected here.
    const issued = await matchIssuedManifest(asset, creator);
    if (!issued) {
      return err(
        "UNVERIFIED_PROVENANCE",
        "This market was not created through the BPS Launch Lab (no matching unconsumed manifest).",
        409,
      );
    }

    // IMMUTABLE LAUNCH FACTS: persist the manifest's per-launch configuration so
    // this market's historical display never changes when server defaults change.
    // Hash-gated against the manifest THIS server issued at prepare time;
    // registration itself never depends on it.
    const launchManifest = extractLaunchFacts(body.manifest, issued.manifestHash);

    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const anchor = getAnchorByAddress(args.numeraire);
    const inserted = await insertVerifiedLaunch({
      tokenAddress: asset,
      creator,
      numeraire: args.numeraire,
      anchorSymbol: anchor?.symbol ?? issued.anchorSymbol,
      poolOrHook: args.poolOrHook,
      launchTx: hash,
      blockNumber: receipt.blockNumber.toString(),
      timestamp: Number(block.timestamp),
      manifestHash: issued.manifestHash,
      launchManifest,
    });
    // Single-use: the matched manifest cannot verify another market.
    await consumeIssuedManifest(asset);
    invalidateLaunchCache();
    return ok({ registered: inserted, provenanceVerified: true, tokenAddress: asset });
  } catch (e) {
    return mapError(e);
  }
}
