// TASK 10G-1 — production snapshot enumeration types.
//
// The pipeline separates, by construction:
//   1. Event-derived CANDIDATE discovery (indexer scan of LockCreated).
//   2. AUTHORITATIVE effective weight (block-pinned contract reads at the snapshot block).
//   3. TECHNICAL claim eligibility (non-zero effective weight at the snapshot block).
//   4. LEGAL/KYC eligibility — NOT modeled here; every artifact is labeled
//      "TECHNICAL CANDIDATE SNAPSHOT — LEGAL ELIGIBILITY UNVERIFIED — NOT AUTHORIZED FOR PUBLICATION".
//   5. Entitlement calculation (approved floor rule from @bps/shared allocation policy).
//   6. Root-publication authority — NOT exercised; the optional payload is UNSIGNED_DO_NOT_BROADCAST.

/** A decoded LockCreated occurrence (candidate-discovery input). */
export interface LockCreatedRecord {
  readonly account: string;
  readonly lockId: bigint;
  readonly blockNumber: bigint;
  readonly logIndex: number;
}

/** A decoded LockWithdrawn occurrence (lifecycle completeness; weight remains contract-read). */
export interface LockWithdrawnRecord {
  readonly account: string;
  readonly lockId: bigint;
  readonly blockNumber: bigint;
  readonly logIndex: number;
}

/** Explicit, pinned snapshot request. `latest` is not accepted anywhere. */
export interface SnapshotRequest {
  readonly chainId: bigint;
  readonly lockingVault: string;
  readonly claimManager: string;
  readonly snapshotBlock: bigint;
  readonly expectedBlockHash: string;
  readonly enumerationStartBlock: bigint; // must be <= locking-vault deployment block
  readonly distributionAsset: string;
  readonly distributionAmount: bigint; // exact base units of the already-split distribution
  readonly cycleId: bigint;
  readonly claimStart: bigint; // unix seconds; required for the unsigned publication payload
  readonly claimDeadline: bigint; // unix seconds (approved 90-day window relative to claimStart)
}

/**
 * Read-only chain access used by the pipeline. The production implementation performs pinned
 * eth_call / eth_getLogs only; tests inject deterministic LOCAL_TEST_ONLY fixtures.
 * NOTHING in this interface can sign, send, or mutate.
 */
export interface ChainReader {
  chainId(): Promise<bigint>;
  /** Block header for an explicit number; null if the block does not exist. */
  block(blockNumber: bigint): Promise<{ hash: string; timestamp: bigint } | null>;
  /** First block at which the locking vault has code (deployment guard), or null if unknown. */
  vaultHasCodeAt(blockNumber: bigint): Promise<boolean>;
  /** All LockCreated records in [from, to], ascending (block, logIndex). */
  lockCreated(from: bigint, to: bigint): Promise<readonly LockCreatedRecord[]>;
  /** All LockWithdrawn records in [from, to], ascending (block, logIndex). */
  lockWithdrawn(from: bigint, to: bigint): Promise<readonly LockWithdrawnRecord[]>;
  /** lockCount(account) read AT the pinned snapshot block. */
  lockCountAt(account: string, blockNumber: bigint): Promise<bigint>;
  /** positionWeightAt(account, lockId, timestamp) read AT the pinned snapshot block. */
  positionWeightAt(
    account: string,
    lockId: bigint,
    timestamp: bigint,
    blockNumber: bigint,
  ): Promise<bigint>;
  /** DistributionClaimManager.leafFor read AT the pinned block (cross-language parity input). */
  leafFor(
    cycleId: bigint,
    claimant: string,
    asset: string,
    amount: bigint,
    blockNumber: bigint,
  ): Promise<string>;
  /** Highest block the reader has fully scanned/synchronized (fail-closed guard input). */
  syncedThrough(): Promise<bigint>;
}

export interface ParticipantWeight {
  readonly address: string; // checksummed
  readonly lockCount: string; // base-10
  readonly effectiveWeight: string; // base-10, exact at the snapshot block/timestamp
}

export interface ParticipantEntitlement {
  readonly address: string; // checksummed
  readonly effectiveWeight: string;
  readonly entitlement: string; // base-10 base units
  readonly leaf: string; // canonical double-hashed leaf (matches Solidity leafFor)
  readonly proof: readonly string[];
}

export interface CanonicalSnapshot {
  readonly schemaVersion: "bps.snapshot.chain-bound/1";
  readonly classification: "TECHNICAL CANDIDATE SNAPSHOT — LEGAL ELIGIBILITY UNVERIFIED — NOT AUTHORIZED FOR PUBLICATION";
  readonly chainId: string;
  readonly snapshotBlock: string;
  readonly snapshotBlockHash: string;
  readonly snapshotBlockTimestamp: string;
  readonly lockingVault: string;
  readonly claimManager: string;
  readonly enumerationStartBlock: string;
  readonly indexerSyncedThrough: string;
  readonly candidateCount: number;
  readonly zeroWeightExcludedCount: number;
  readonly includedParticipantCount: number;
  readonly participants: readonly ParticipantWeight[];
  readonly totalEffectiveWeight: string;
  readonly distributionAsset: string;
  readonly distributionAmount: string;
  readonly cycleId: string;
  readonly entitlementRule: string;
  readonly entitlements: readonly Omit<ParticipantEntitlement, "proof">[];
  readonly entitlementTotal: string;
  readonly dust: string;
  readonly leafEncoding: readonly string[];
  readonly leafOrder: readonly string[];
  readonly merkleRoot: string;
  readonly inputDigests: Readonly<Record<string, string>>;
}

export interface ProofBundle {
  readonly schemaVersion: "bps.snapshot.proof-bundle/1";
  readonly classification: CanonicalSnapshot["classification"];
  readonly chainId: string;
  readonly cycleId: string;
  readonly claimManager: string;
  readonly distributionAsset: string;
  readonly merkleRoot: string;
  readonly canonicalSnapshotDigest: string;
  readonly participants: readonly ParticipantEntitlement[];
}

export interface UnsignedPublication {
  readonly schemaVersion: "bps.snapshot.unsigned-publication/1";
  readonly classification: "UNSIGNED_DO_NOT_BROADCAST — NOT AUTHORIZED FOR PUBLICATION — LEGAL ELIGIBILITY UNVERIFIED";
  readonly chainId: string;
  readonly to: string; // DistributionClaimManager (owner-only publishCycle; owner = coordinator)
  readonly value: "0";
  readonly functionSignature: string;
  readonly decodedArguments: Readonly<Record<string, unknown>>;
  readonly encodedCalldata: string;
  readonly snapshotBlock: string;
  readonly snapshotBlockHash: string;
  readonly merkleRoot: string;
  readonly cycleId: string;
  readonly distributionAsset: string;
  readonly distributionAmount: string;
  readonly canonicalSnapshotDigest: string;
  readonly authorityNote: string;
}

export interface SnapshotRunResult {
  readonly snapshot: CanonicalSnapshot;
  readonly proofBundle: ProofBundle;
  readonly unsignedPublication: UnsignedPublication;
  readonly canonicalSnapshotDigest: string;
  readonly proofBundleDigest: string;
  readonly onchainLeafParity: { readonly checked: number; readonly matched: number };
  /** Run-time observed chain head (varies between runs; envelope-only, never canonical). */
  readonly observedChainHead: string;
}

export class SnapshotPipelineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "SnapshotPipelineError";
  }
}
