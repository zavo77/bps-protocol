// TASK 10G-1 — read-only Proof-of-Distribution consumer boundary over canonical artifacts.
//
// Demonstrates the data-consumer contract: a participant retrieves exactly their entitlement and
// proof; aggregates come from the canonical artifact; a missing participant gets NO fabricated
// entitlement; legal/publication status is surfaced verbatim, never upgraded.

import { normalizeAddress, viemVerifyRaw } from "@bps/shared";
import type { CanonicalSnapshot, ProofBundle } from "./types.js";

export interface ParticipantView {
  readonly address: string;
  readonly effectiveWeight: string;
  readonly entitlement: string;
  readonly leaf: string;
  readonly proof: readonly string[];
  readonly merkleRoot: string;
  readonly verified: boolean;
  readonly classification: string;
}

export interface AggregateView {
  readonly chainId: string;
  readonly snapshotBlock: string;
  readonly snapshotBlockHash: string;
  readonly merkleRoot: string;
  readonly distributionAsset: string;
  readonly distributionAmount: string;
  readonly entitlementTotal: string;
  readonly dust: string;
  readonly includedParticipantCount: number;
  readonly classification: string;
  readonly publicationStatus: "NOT PUBLISHED — NOT AUTHORIZED";
}

/** Exact-match participant lookup; returns null (never a fabricated value) when absent. */
export function lookupParticipant(bundle: ProofBundle, address: string): ParticipantView | null {
  const normalized = normalizeAddress(address);
  const p = bundle.participants.find((x) => x.address === normalized);
  if (p === undefined) return null;
  const verified = viemVerifyRaw(
    {
      chainId: BigInt(bundle.chainId),
      claimManager: bundle.claimManager,
      cycleId: BigInt(bundle.cycleId),
      wallet: p.address,
      asset: bundle.distributionAsset,
      amount: BigInt(p.entitlement),
    },
    p.proof as readonly `0x${string}`[],
    bundle.merkleRoot as `0x${string}`,
  );
  return {
    address: p.address,
    effectiveWeight: p.effectiveWeight,
    entitlement: p.entitlement,
    leaf: p.leaf,
    proof: p.proof,
    merkleRoot: bundle.merkleRoot,
    verified,
    classification: bundle.classification,
  };
}

/** Aggregate display values sourced ONLY from the canonical snapshot artifact. */
export function aggregateView(snapshot: CanonicalSnapshot): AggregateView {
  return {
    chainId: snapshot.chainId,
    snapshotBlock: snapshot.snapshotBlock,
    snapshotBlockHash: snapshot.snapshotBlockHash,
    merkleRoot: snapshot.merkleRoot,
    distributionAsset: snapshot.distributionAsset,
    distributionAmount: snapshot.distributionAmount,
    entitlementTotal: snapshot.entitlementTotal,
    dust: snapshot.dust,
    includedParticipantCount: snapshot.includedParticipantCount,
    classification: snapshot.classification,
    publicationStatus: "NOT PUBLISHED — NOT AUTHORIZED",
  };
}
