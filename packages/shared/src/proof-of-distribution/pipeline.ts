// End-to-end deterministic Proof-of-Distribution pipeline: validated fixture in, canonical
// artifacts out. Pure and side-effect free (no filesystem, network, clock, or randomness). The
// CLI layer is responsible for reading the fixture and writing the returned artifact strings.

import { allocate, type AllocationResult } from "./allocation.js";
import {
  buildAllocations,
  buildManifest,
  buildReconciliation,
  buildWalletProofs,
  type Artifact,
} from "./artifacts.js";
import { resolveEligibility, type EligibilityResolution } from "./eligibility.js";
import { fail } from "./errors.js";
import { buildMerkle, ozVerify, type MerkleResult } from "./merkle.js";
import type { CycleFixture } from "./model.js";
import { reconcile, type Reconciliation } from "./reconciliation.js";
import { keccakOfCanonical } from "./serialize.js";
import { computeWeights, type WalletWeight } from "./twab.js";
import { loadCycleFixture } from "./validate.js";
import { viemVerify } from "./viem-verify.js";
import type { Hex } from "viem";

export interface ArtifactSet {
  readonly manifest: Artifact<Record<string, unknown>>;
  readonly allocations: Artifact<Record<string, unknown>>;
  readonly walletProofs: Artifact<Record<string, unknown>>;
  readonly reconciliation: Artifact<Record<string, unknown>>;
}

export interface VerificationSummary {
  readonly proofCount: number;
  readonly ozVerified: number;
  readonly viemVerified: number;
  readonly allVerified: boolean;
}

export interface PipelineResult {
  readonly fixture: CycleFixture;
  readonly weights: ReadonlyMap<string, WalletWeight>;
  readonly eligibility: EligibilityResolution;
  readonly allocation: AllocationResult;
  readonly merkle: MerkleResult | null;
  readonly reconciliation: Reconciliation;
  readonly verification: VerificationSummary;
  readonly artifacts: ArtifactSet;
}

function verifyProofs(fixture: CycleFixture, merkle: MerkleResult | null): VerificationSummary {
  if (merkle === null) {
    return { proofCount: 0, ozVerified: 0, viemVerified: 0, allVerified: true };
  }
  const root = merkle.root as Hex;
  let ozVerified = 0;
  let viemVerified = 0;
  for (const entry of merkle.entries) {
    if (ozVerify(merkle.root, fixture.cycle, entry.entitlement, entry.proof)) ozVerified += 1;
    if (viemVerify(fixture.cycle, entry.entitlement, entry.proof as Hex[], root)) viemVerified += 1;
  }
  const proofCount = merkle.entries.length;
  const allVerified = ozVerified === proofCount && viemVerified === proofCount;
  if (!allVerified) {
    fail("PROOF_VERIFICATION", "not every generated proof verified under both OZ and viem");
  }
  return { proofCount, ozVerified, viemVerified, allVerified };
}

/** Run the full pipeline against an unknown (unvalidated) cycle-fixture input. */
export function runProofOfDistribution(input: unknown): PipelineResult {
  const fixture = loadCycleFixture(input);
  const { weights } = computeWeights(
    fixture.cycle,
    fixture.epochStartBalances,
    fixture.transfers,
    fixture.locks,
  );
  const eligibility = resolveEligibility(
    fixture.cycle,
    fixture.excludedAddresses,
    fixture.eligibility,
    weights,
  );
  const allocation = allocate(
    fixture.cycle,
    fixture.assets,
    eligibility.eligibleWallets,
    weights,
    eligibility.totalEffectiveWeight,
  );
  const merkle = allocation.publishable
    ? buildMerkle(fixture.cycle, allocation.entitlements)
    : null;
  const verification = verifyProofs(fixture, merkle);
  const reconciliation = reconcile(fixture.cycle, allocation);

  const allocations = buildAllocations(fixture.cycle, allocation);
  const allocationsContentHash = keccakOfCanonical(allocations.object);
  const walletProofs = buildWalletProofs(fixture.cycle, merkle, allocation);
  const reconciliationArtifact = buildReconciliation(fixture.cycle, reconciliation, merkle);
  const manifest = buildManifest(fixture, eligibility, allocation, merkle, allocationsContentHash);

  return {
    fixture,
    weights,
    eligibility,
    allocation,
    merkle,
    reconciliation,
    verification,
    artifacts: {
      manifest,
      allocations,
      walletProofs,
      reconciliation: reconciliationArtifact,
    },
  };
}
