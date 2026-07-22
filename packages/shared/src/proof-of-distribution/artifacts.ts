// Canonical output artifact builders. Each builder returns a JSON-safe object (all monetary values
// as base-10 strings) and its canonical serialization with a single terminal LF newline. Nothing
// here reads the clock, randomness, environment, or filesystem paths; all timestamps come from the
// fixture. Repeated runs on the same fixture produce byte-for-byte identical output.

import type { AllocationResult } from "./allocation.js";
import {
  ALLOCATION_ROUNDING_POLICY,
  ECON_VERSION,
  LEAF_ABI_TYPES,
  LEAF_SCHEMA_VERSION,
  MANIFEST_SCHEMA_VERSION,
  RESERVE_POLICY,
} from "./constants.js";
import type { EligibilityResolution } from "./eligibility.js";
import type { MerkleResult } from "./merkle.js";
import type { CycleConfig, CycleFixture } from "./model.js";
import type { Reconciliation } from "./reconciliation.js";
import { canonicalStringify, keccakOfCanonical } from "./serialize.js";

const LEAF_ORDER = ["chainId", "claimManager", "cycleId", "wallet", "asset", "amount"] as const;
const FICTIONAL_NOTICE =
  "All assets, tickers, and addresses in this artifact are fictional. This is a mock " +
  "proof-of-distribution computation.";
const ONCHAIN_NOTICE =
  "No on-chain claim or protocol transaction occurred. Proofs are claim-ready but unclaimed.";

export interface Artifact<T> {
  readonly object: T;
  readonly json: string;
}

function s(value: bigint): string {
  return value.toString(10);
}

function withNewline(value: unknown): string {
  return `${canonicalStringify(value)}\n`;
}

export function buildAllocations(
  cycle: CycleConfig,
  allocation: AllocationResult,
): Artifact<Record<string, unknown>> {
  const object = {
    schemaVersion: "bps.pod.allocations/1",
    cycleId: s(cycle.cycleId),
    chainId: s(cycle.chainId),
    economicsVersion: ECON_VERSION,
    rewardPolicyVersion: cycle.rewardPolicyVersion,
    totalEffectiveWeight: s(allocation.totalEffectiveWeight),
    publishable: allocation.publishable,
    assets: allocation.assets.map((a) => ({
      assetAddress: a.asset.tokenAddress,
      ticker: a.asset.ticker,
      name: a.asset.name,
      decimals: a.asset.decimals,
      acquired: s(a.acquired),
      participantPool: s(a.participantPool),
      strategicReserve: s(a.strategicReserve),
      allocated: s(a.allocated),
      distributionDust: s(a.distributionDust),
      entitlementCount: a.entitlements.length,
      allocations: a.walletAllocations.map((w) => ({ wallet: w.wallet, amount: s(w.amount) })),
    })),
  };
  return { object, json: withNewline(object) };
}

export function buildWalletProofs(
  cycle: CycleConfig,
  merkle: MerkleResult | null,
  allocation: AllocationResult,
): Artifact<Record<string, unknown>> {
  const wallets: Record<string, unknown> = {};
  if (merkle !== null) {
    for (const [wallet, entries] of merkle.walletIndex) {
      const sortedEntries = [...entries].sort((x, y) =>
        x.entitlement.asset < y.entitlement.asset
          ? -1
          : x.entitlement.asset > y.entitlement.asset
            ? 1
            : 0,
      );
      wallets[wallet] = sortedEntries.map((e) => ({
        asset: e.entitlement.asset,
        amount: s(e.entitlement.amount),
        leaf: e.leaf,
        proof: [...e.proof],
      }));
    }
  }
  const object = {
    schemaVersion: "bps.pod.wallet-proofs/1",
    leafSchemaVersion: LEAF_SCHEMA_VERSION,
    cycleId: s(cycle.cycleId),
    chainId: s(cycle.chainId),
    claimManager: cycle.claimManagerAddress,
    economicsVersion: ECON_VERSION,
    publishable: allocation.publishable,
    merkleRoot: merkle?.root ?? null,
    leafEncoding: [...LEAF_ABI_TYPES],
    leafOrder: [...LEAF_ORDER],
    wallets,
  };
  return { object, json: withNewline(object) };
}

export function buildReconciliation(
  cycle: CycleConfig,
  recon: Reconciliation,
  merkle: MerkleResult | null,
): Artifact<Record<string, unknown>> {
  const object = {
    schemaVersion: "bps.pod.reconciliation/1",
    cycleId: s(cycle.cycleId),
    chainId: s(cycle.chainId),
    economicsVersion: ECON_VERSION,
    publishable: recon.publishable,
    merkleRoot: merkle?.root ?? null,
    fictionalDataNotice: FICTIONAL_NOTICE,
    onchainClaimNotice: ONCHAIN_NOTICE,
    assets: recon.assets.map((a) => ({
      assetAddress: a.assetAddress,
      ticker: a.ticker,
      decimals: a.decimals,
      acquired: s(a.acquired),
      participantPool: s(a.participantPool),
      strategicReserve: s(a.strategicReserve),
      allocated: s(a.allocated),
      distributionDust: s(a.distributionDust),
      fundedRequired: s(a.fundedRequired),
      claimable: s(a.claimable),
      claimed: s(a.claimed),
      unclaimed: s(a.unclaimed),
      rollover: s(a.rollover),
      claimExecuted: a.claimExecuted,
    })),
  };
  return { object, json: withNewline(object) };
}

export function buildManifest(
  fixture: CycleFixture,
  eligibility: EligibilityResolution,
  allocation: AllocationResult,
  merkle: MerkleResult | null,
  allocationsContentHash: string,
): Artifact<Record<string, unknown>> {
  const cycle = fixture.cycle;
  const body: Record<string, unknown> = {
    manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    leafSchemaVersion: LEAF_SCHEMA_VERSION,
    cycleId: s(cycle.cycleId),
    chainId: s(cycle.chainId),
    bpsTokenAddress: cycle.bpsTokenAddress,
    claimManagerAddress: cycle.claimManagerAddress,
    economicsVersion: ECON_VERSION,
    rewardPolicyVersion: cycle.rewardPolicyVersion,
    epoch: {
      epochId: s(cycle.epochId),
      epochStart: s(cycle.epochStart),
      epochEnd: s(cycle.epochEnd),
      startBlock: s(cycle.startBlock),
      endBlock: s(cycle.endBlock),
      snapshotBlock: s(cycle.snapshotBlock),
      finalizedBlock: s(cycle.finalizedBlock),
      confirmationDepth: s(cycle.confirmationDepth),
    },
    exclusions: [...fixture.excludedAddresses]
      .sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0))
      .map((e) => ({
        address: e.address,
        category: e.category,
        reason: e.reason,
        policyVersion: e.policyVersion,
      })),
    eligibilityPolicyVersion: cycle.eligibilityPolicyVersion,
    termsVersion: cycle.termsVersion,
    restrictedJurisdictionPolicyVersion: cycle.restrictedJurisdictionPolicyVersion,
    totals: {
      totalEligibleSnapshotBalance: s(eligibility.totalEligibleSnapshotBalance),
      totalBaseTwab: s(eligibility.totalBaseTwab),
      totalEffectiveWeight: s(eligibility.totalEffectiveWeight),
    },
    assets: [...allocation.assets]
      .sort((a, b) =>
        a.asset.tokenAddress < b.asset.tokenAddress
          ? -1
          : a.asset.tokenAddress > b.asset.tokenAddress
            ? 1
            : 0,
      )
      .map((a) => ({
        assetAddress: a.asset.tokenAddress,
        ticker: a.asset.ticker,
        name: a.asset.name,
        decimals: a.asset.decimals,
        acquired: s(a.acquired),
        participantPool: s(a.participantPool),
        strategicReserve: s(a.strategicReserve),
        allocated: s(a.allocated),
        distributionDust: s(a.distributionDust),
        entitlementCount: a.entitlements.length,
      })),
    allocationRoundingPolicy: ALLOCATION_ROUNDING_POLICY,
    reservePolicy: RESERVE_POLICY,
    merkleRoot: merkle?.root ?? null,
    leafEncoding: [...LEAF_ABI_TYPES],
    leafOrder: [...LEAF_ORDER],
    allocationsContentHash,
    claimPeriod: { claimStart: s(cycle.claimStart), claimDeadline: s(cycle.claimDeadline) },
    publishable: allocation.publishable,
    nonPublishableReason: allocation.nonPublishableReason ?? null,
    fictionalDataNotice: FICTIONAL_NOTICE,
    onchainClaimNotice: ONCHAIN_NOTICE,
  };

  // Envelope content hash: keccak256 over the canonical body without its own hash field.
  const envelopeHash = keccakOfCanonical(body);
  const object = { ...body, envelopeHash };
  return { object, json: withNewline(object) };
}
