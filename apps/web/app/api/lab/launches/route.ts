// GET: list confirmed lab launches (chain-reconstructed; DB-mirrored when
// configured). POST: idempotently register a just-confirmed launch by tx hash.
// The server verifies EVERYTHING from the chain against the immutable
// provenance_version=2 preparation this server recorded at /api/lab/prepare —
// the client is never trusted (any client-supplied manifest is discarded).

import { parseEventLogs, getAddress, keccak256, type Address, type Hex } from "viem";
import { airlockAbi, CHAIN_IDS, getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { CHAIN_ID, getAnchorByAddress } from "@bps/launch-lab";
import { getLabClient } from "../../../../lib/lab/server";
import {
  invalidateLaunchCache,
  listLaunches,
  getVolumeByToken,
  getPreparedLaunch,
  isTokenVerified,
  registerVerifiedLaunchAtomic,
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
    // NOTE: body.manifest is accepted for back-compat and DISCARDED entirely —
    // launch facts come exclusively from the server-stored prepared manifest.
    const body = (await req.json()) as { transactionHash?: string; manifest?: unknown };
    const hash = body.transactionHash;
    if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash))
      return err("BAD_TX_HASH", "Invalid transaction hash.");

    const client = getLabClient();
    const [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: hash as Hex }),
      client.getTransaction({ hash: hash as Hex }),
    ]);
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
    const creator = getAddress(tx.from);

    // Idempotent: an already-verified token re-registers cleanly.
    if (await isTokenVerified(asset)) {
      invalidateLaunchCache();
      return ok({ registered: true, provenanceVerified: true, tokenAddress: asset });
    }

    // BPS PROVENANCE GATE (exact): the created token must match an immutable
    // provenance_version=2 preparation THIS server issued, and the broadcast
    // transaction must be byte-for-byte the one this server prepared — same
    // sender, target, calldata (by keccak256), value, and chain, confirmed
    // inside the preparation's validity window. Legacy rows (version NULL/!=2)
    // and rows missing any v2 fact can NEVER verify a launch.
    const prepared = await getPreparedLaunch(asset);
    if (
      !prepared ||
      prepared.provenanceVersion !== 2 ||
      prepared.chainId !== CHAIN_ID ||
      !prepared.transactionTarget ||
      !prepared.calldataHash ||
      prepared.transactionValue === null ||
      !prepared.launchManifest ||
      prepared.validUntilEpoch === null
    ) {
      return err(
        "UNVERIFIED_PROVENANCE",
        "This market was not created through the BPS Launch Lab (no verifiable preparation).",
        409,
      );
    }
    if (prepared.consumed) {
      return err(
        "PREPARED_CONSUMED",
        "This preparation was already used to register a launch.",
        409,
      );
    }
    if (creator.toLowerCase() !== prepared.creator.toLowerCase()) {
      return err("WRONG_SENDER", "The transaction sender does not match the prepared creator.", 409);
    }
    if (!tx.to || tx.to.toLowerCase() !== prepared.transactionTarget.toLowerCase()) {
      return err("WRONG_TARGET", "The transaction target does not match the prepared transaction.", 409);
    }
    if (keccak256(tx.input).toLowerCase() !== prepared.calldataHash.toLowerCase()) {
      return err("WRONG_CALLDATA", "The transaction calldata does not match the prepared transaction.", 409);
    }
    let valueMatches = false;
    try {
      valueMatches = BigInt(tx.value) === BigInt(prepared.transactionValue);
    } catch {
      valueMatches = false;
    }
    if (!valueMatches) {
      return err("WRONG_VALUE", "The transaction value does not match the prepared transaction.", 409);
    }
    if (tx.chainId !== undefined && tx.chainId !== null && Number(tx.chainId) !== CHAIN_ID) {
      return err("WRONG_CHAIN", "The transaction was not sent on Robinhood Chain.", 409);
    }

    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const blockTimestamp = Number(block.timestamp);
    if (
      blockTimestamp > prepared.validUntilEpoch ||
      (prepared.createdAtEpoch !== null && blockTimestamp < prepared.createdAtEpoch)
    ) {
      return err(
        "PREPARED_EXPIRED",
        "The preparation validity window does not cover this transaction.",
        409,
      );
    }
    const storedManifest = prepared.launchManifest;
    const manifestAnchor =
      typeof storedManifest.anchorAddress === "string" ? storedManifest.anchorAddress : "";
    if (manifestAnchor.toLowerCase() !== args.numeraire.toLowerCase()) {
      return err("WRONG_NUMERAIRE", "Launch numeraire does not match the prepared manifest.", 409);
    }

    const anchor = getAnchorByAddress(args.numeraire);
    // The atomic operation re-checks EVERY fact under SELECT FOR UPDATE and
    // builds the launch facts from the manifest read under that lock — the
    // route-level checks above are defense in depth, not the authority.
    const result = await registerVerifiedLaunchAtomic(
      {
        tokenAddress: asset,
        creator,
        numeraire: args.numeraire,
        anchorSymbol: anchor?.symbol ?? prepared.anchorSymbol,
        poolOrHook: args.poolOrHook,
        launchTx: hash,
        blockNumber: receipt.blockNumber.toString(),
        timestamp: blockTimestamp,
        manifestHash: prepared.manifestHash,
      },
      {
        creator,
        transactionTarget: tx.to ?? "",
        calldataHash: keccak256(tx.input),
        transactionValue: tx.value.toString(),
        chainId: CHAIN_ID,
        eventNumeraire: args.numeraire,
        blockTimestamp,
      },
      hash,
    );
    if (result.status === "registered" || result.status === "already-registered") {
      invalidateLaunchCache();
      return ok({ registered: true, provenanceVerified: true, tokenAddress: asset });
    }
    // Honest failure mapping: registration NEVER consumes on failure (the
    // atomic operation rolled back), so a retry is safe.
    switch (result.code) {
      case "DB_UNAVAILABLE":
        return err(
          "REGISTRY_UNAVAILABLE",
          "The launch registry is unavailable; nothing was recorded. Retry shortly.",
          503,
        );
      case "PREPARED_NOT_FOUND":
      case "UNVERIFIED_PROVENANCE":
        return err(
          "UNVERIFIED_PROVENANCE",
          "This market was not created through the BPS Launch Lab (no verifiable preparation).",
          409,
        );
      case "PREPARED_CONSUMED":
        return err(
          "PREPARED_CONSUMED",
          "This preparation was already used to register a launch.",
          409,
        );
      case "PREPARED_EXPIRED":
        return err(
          "PREPARED_EXPIRED",
          "The preparation validity window does not cover this transaction.",
          409,
        );
      case "PROVENANCE_MISMATCH":
        return err(
          "PROVENANCE_MISMATCH",
          "The transaction does not match the recorded preparation; nothing was registered.",
          409,
        );
      case "LAUNCH_ROW_CONFLICT":
        return err(
          "LAUNCH_ROW_CONFLICT",
          "A different record already exists for this market; nothing was registered.",
          409,
        );
      default:
        return err(
          "REGISTRATION_FAILED",
          "Registration could not be recorded; nothing was consumed. Retry shortly.",
          500,
        );
    }
  } catch (e) {
    return mapError(e);
  }
}
