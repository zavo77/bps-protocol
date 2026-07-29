// POST { predictedToken, creatorAddress } — stale re-simulation that PRESERVES
// the issued manifest. Loads the immutable provenance_version=2 prepared row
// (creator must match, unconsumed, unexpired) and re-simulates the EXACT
// STORED calldata (eth_call as the creator against the stored target/value,
// then a fresh gas estimate + buffer). It never calls prepareLaunch, never
// mints a new manifest, and never changes calldata — the response carries the
// STORED manifestHash so one immutable manifest covers the whole review.
// Same-origin, access-mode, and per-IP + per-wallet rate limits still apply.
// When the row is missing/consumed/expired the client falls back to a full
// re-prepare (fresh manifest, review re-renders).

import { getAddress, isAddress, type Address, type Hex } from "viem";
import { CHAIN_ID, SIMULATION_MAX_AGE_MS } from "@bps/launch-lab";
import { getFlags, getLabClient } from "../../../../lib/lab/server";
import { getPreparedLaunch, refreshPreparedValidity } from "../../../../lib/lab/store";
import {
  assertSameOrigin,
  clientKey,
  err,
  mapError,
  ok,
  rateLimited,
} from "../../../../lib/lab/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const originProblem = assertSameOrigin(req);
    if (originProblem) return err("BAD_ORIGIN", originProblem, 403);
    if (rateLimited(`simulate:${clientKey(req)}`, 10))
      return err("RATE_LIMITED", "Too many requests.", 429);

    const body = (await req.json()) as { predictedToken?: unknown; creatorAddress?: unknown };
    if (
      typeof body.predictedToken !== "string" ||
      !isAddress(body.predictedToken) ||
      typeof body.creatorAddress !== "string" ||
      !isAddress(body.creatorAddress)
    ) {
      return err("BAD_PAYLOAD", "Invalid re-simulation request.", 400);
    }
    const predictedToken = getAddress(body.predictedToken);
    const wallet = getAddress(body.creatorAddress);

    const flags = getFlags();
    if (flags.accessMode === "disabled")
      return err("AUTH_CREATION_DISABLED", "Market creation is currently disabled.", 403);
    if (
      flags.accessMode === "allowlist" &&
      !flags.creatorAllowlist.some((a) => a.toLowerCase() === wallet.toLowerCase())
    ) {
      return err("AUTH_NOT_ALLOWLISTED", "Request authentication failed.", 401);
    }
    if (rateLimited(`simulate-wallet:${wallet.toLowerCase()}`, 10)) {
      return err("RATE_LIMITED", "Too many requests for this wallet.", 429);
    }

    // Only a v2 row with the FULL stored transaction facts, owned by this
    // creator, unconsumed and inside its validity window can be re-simulated.
    // Everything else (missing, legacy, consumed, expired, wrong creator)
    // yields one uniform code so the client falls back to a full re-prepare.
    const row = await getPreparedLaunch(predictedToken);
    const nowSec = Math.floor(Date.now() / 1000);
    if (
      !row ||
      row.provenanceVersion !== 2 ||
      row.chainId !== CHAIN_ID ||
      row.consumed ||
      row.creator.toLowerCase() !== wallet.toLowerCase() ||
      !row.transactionTarget ||
      !row.transactionData ||
      !row.calldataHash ||
      row.transactionValue === null ||
      row.validUntilEpoch === null ||
      row.validUntilEpoch < nowSec
    ) {
      return err(
        "PREPARED_NOT_FOUND",
        "No re-simulatable preparation exists for this launch. Prepare it again.",
        404,
      );
    }

    const to: Address = getAddress(row.transactionTarget);
    const data = row.transactionData as Hex;
    const value = BigInt(row.transactionValue);
    const client = getLabClient();
    let gasEstimate: bigint;
    try {
      // Re-simulate the EXACT stored calldata as the creator, then refresh gas.
      await client.call({ account: wallet, to, data, value });
      gasEstimate = await client.estimateGas({ account: wallet, to, data, value });
    } catch {
      return err("SIMULATION_FAILED", "Re-simulation of the prepared transaction failed.", 409);
    }
    const block = await client.getBlockNumber();
    await refreshPreparedValidity(predictedToken);

    const manifestHash = row.manifestHash as Hex;
    const calldataHash = row.calldataHash as Hex;
    const simulationTimestamp = Date.now();
    // The STORED, immutable facts + only the freshness fields renewed. The
    // client keeps its manifest/simulation state and merges gas + staleAfter.
    const simulation = {
      status: "ok" as const,
      manifestHash,
      transactionTarget: to,
      calldataHash,
      predictedTokenAddress: predictedToken,
      gasEstimate: gasEstimate.toString(),
      simulationBlock: block.toString(),
      simulationTimestamp,
    };
    const prepared = {
      chainId: CHAIN_ID,
      from: wallet,
      to,
      data,
      value: row.transactionValue,
      gas: ((gasEstimate * 125n) / 100n).toString(),
      manifestHash,
      calldataHash,
      staleAfter: simulationTimestamp + SIMULATION_MAX_AGE_MS,
    };
    return ok({ simulation, prepared, manifestHash });
  } catch (e) {
    return mapError(e);
  }
}
