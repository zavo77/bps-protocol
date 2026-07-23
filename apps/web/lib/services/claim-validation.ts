// Authoritative claim-readiness validation (Task 8D §E). Before a claim is enabled, EVERY material field
// is checked against the CURRENT claim-manager state read directly on-chain — never an event-derived root
// or a cached summary. This is what guarantees that a stale event (e.g. an old AcquisitionFunded carrying
// a superseded merkle root) can never authorize a claim once the current cycle state has changed.
import type { Address, Hex, PublicClient } from "viem";
import { readAssetFunding, readClaimRemaining, readClaimUsed, readCycle, readErc20 } from "./reads";

export interface ClaimReadinessInput {
  readonly manager: Address;
  readonly cycleId: bigint;
  readonly asset: Address;
  readonly claimant: Address;
  readonly amount: bigint;
  readonly artifactRoot: Hex; // root from the published proof artifact — must equal the CURRENT on-chain root
}

export type ClaimReadinessReason =
  | "cycle-not-published"
  | "root-mismatch"
  | "exceeds-published-allocation"
  | "already-claimed"
  | "manager-balance-insufficient";

export interface ClaimReadinessResult {
  readonly ok: boolean;
  readonly reason?: ClaimReadinessReason;
  readonly onchainRoot?: Hex;
  readonly remaining?: bigint;
}

/**
 * Read and compare the authoritative claim-manager state for (cycle, asset, claimant, amount). Returns
 * the first material mismatch, or ok=true with the current on-chain root and remaining allocation.
 * The root comparison uses cycles() — the CURRENT on-chain root — so an old event root cannot override it.
 */
export async function validateClaimReadiness(
  client: PublicClient,
  input: ClaimReadinessInput,
): Promise<ClaimReadinessResult> {
  const cyc = await readCycle(client, input.manager, input.cycleId);
  if (!cyc.published) return { ok: false, reason: "cycle-not-published" };
  if (cyc.merkleRoot.toLowerCase() !== input.artifactRoot.toLowerCase()) {
    return { ok: false, reason: "root-mismatch", onchainRoot: cyc.merkleRoot };
  }
  const af = await readAssetFunding(client, input.manager, input.cycleId, input.asset);
  if (!af.registered || input.amount > af.funded) {
    return { ok: false, reason: "exceeds-published-allocation", onchainRoot: cyc.merkleRoot };
  }
  const used = await readClaimUsed(
    client,
    input.manager,
    input.cycleId,
    input.claimant,
    input.asset,
  );
  if (used) return { ok: false, reason: "already-claimed", onchainRoot: cyc.merkleRoot };
  const managerBal = (await readErc20(client, input.asset, input.manager, input.manager)).balance;
  if (managerBal < input.amount) {
    return { ok: false, reason: "manager-balance-insufficient", onchainRoot: cyc.merkleRoot };
  }
  const remaining = await readClaimRemaining(client, input.manager, input.cycleId, input.asset);
  return { ok: true, onchainRoot: cyc.merkleRoot, remaining };
}
