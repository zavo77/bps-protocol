// TASK 10G-1 — deterministic, fail-closed, chain-bound snapshot pipeline.
//
// Inputs are explicit and pinned (chain id, block number, block hash); `latest` is rejected by
// construction because no such input exists. All arithmetic is bigint; no JavaScript float ever
// touches weights, entitlements or amounts. Identical inputs + identical indexed state produce
// byte-identical canonical artifacts (no timestamps inside the canonical envelope).
//
// Entitlement rule (authoritative, cited): @bps/shared allocation policy
// ALLOCATION_ROUNDING_POLICY — "floor(pool * walletEffectiveWeight / totalEffectiveWeight);
// per-wallet floor, remainder retained as distribution dust" (packages/shared/src/
// proof-of-distribution/allocation.ts, BPS-ECON-2.0 reconciliation). Zero-weight wallets receive
// no entitlement and no leaf (no zero leaves — matches shared buildMerkle ZERO_LEAF guard).
//
// Canonical claim encoding (authoritative, cited): DistributionClaimManager._leaf — double
// keccak256 of abi.encode(chainId, claimManager, cycleId, wallet, asset, amount) with sorted-pair
// commutative nodes; reproduced via the pinned @openzeppelin/merkle-tree StandardMerkleTree with
// @bps/shared LEAF_ABI_TYPES, and cross-checked against the ON-CHAIN leafFor at the pinned block.

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { encodeFunctionData, parseAbi } from "viem";
import {
  LEAF_ABI_TYPES,
  keccakOfCanonical,
  mulDivFloor,
  normalizeAddress,
  toDecimalString,
  viemVerifyRaw,
} from "@bps/shared";
import { enumerateCandidates } from "./enumeration.js";
import type {
  CanonicalSnapshot,
  ChainReader,
  ParticipantEntitlement,
  ParticipantWeight,
  ProofBundle,
  SnapshotRequest,
  SnapshotRunResult,
  UnsignedPublication,
} from "./types.js";
import { SnapshotPipelineError } from "./types.js";

const CLASSIFICATION =
  "TECHNICAL CANDIDATE SNAPSHOT — LEGAL ELIGIBILITY UNVERIFIED — NOT AUTHORIZED FOR PUBLICATION" as const;

const PUBLISH_ABI = parseAbi([
  "function publishCycle(uint256 cycleId, bytes32 merkleRoot, bytes32 allocationsContentHash, bytes32 manifestEnvelopeHash, uint64 claimStart, uint64 claimDeadline, address[] assets, uint256[] fundedAmounts)",
]);

function requirePositive(v: bigint, code: string, what: string): void {
  if (v <= 0n) throw new SnapshotPipelineError(code, `${what} must be positive, got ${v}`);
}

/** Fail-closed request validation that does not require chain access. */
export function validateRequestShape(req: SnapshotRequest): void {
  requirePositive(req.chainId, "BAD_CHAIN_ID", "chainId");
  requirePositive(req.snapshotBlock, "BAD_BLOCK", "snapshotBlock");
  requirePositive(req.distributionAmount, "ZERO_DISTRIBUTION", "distributionAmount");
  requirePositive(req.cycleId, "BAD_CYCLE", "cycleId");
  if (!/^0x[0-9a-f]{64}$/i.test(req.expectedBlockHash)) {
    throw new SnapshotPipelineError("BAD_BLOCK_HASH", "expectedBlockHash must be 32-byte hex");
  }
  normalizeAddress(req.lockingVault, "lockingVault");
  normalizeAddress(req.claimManager, "claimManager");
  normalizeAddress(req.distributionAsset, "distributionAsset");
  if (req.enumerationStartBlock < 0n || req.enumerationStartBlock > req.snapshotBlock) {
    throw new SnapshotPipelineError(
      "BAD_START_BLOCK",
      "enumerationStartBlock must be <= snapshotBlock",
    );
  }
  if (req.claimDeadline <= req.claimStart) {
    throw new SnapshotPipelineError("BAD_CLAIM_WINDOW", "claimDeadline must exceed claimStart");
  }
}

export async function runSnapshotPipeline(
  reader: ChainReader,
  req: SnapshotRequest,
): Promise<SnapshotRunResult> {
  validateRequestShape(req);
  const vault = normalizeAddress(req.lockingVault);
  const manager = normalizeAddress(req.claimManager);
  const asset = normalizeAddress(req.distributionAsset);

  // ---- fail-closed chain guards ----
  const chainId = await reader.chainId();
  if (chainId !== req.chainId) {
    throw new SnapshotPipelineError(
      "CHAIN_ID_MISMATCH",
      `reader chain ${chainId} != requested ${req.chainId}`,
    );
  }
  const header = await reader.block(req.snapshotBlock);
  if (header === null) {
    throw new SnapshotPipelineError("BLOCK_NOT_FOUND", `block ${req.snapshotBlock} does not exist`);
  }
  if (header.hash.toLowerCase() !== req.expectedBlockHash.toLowerCase()) {
    throw new SnapshotPipelineError(
      "BLOCK_HASH_MISMATCH",
      `observed ${header.hash} != expected ${req.expectedBlockHash} (possible reorg)`,
    );
  }
  const synced = await reader.syncedThrough();
  if (synced < req.snapshotBlock) {
    throw new SnapshotPipelineError(
      "INDEXER_BEHIND",
      `indexer synchronized through ${synced} < snapshot block ${req.snapshotBlock}`,
    );
  }
  // Coverage guard: enumeration must start at or before vault deployment. If the vault already
  // has code at the requested start block AND that block is not the genesis of our coverage
  // window, history could predate coverage — require code to be ABSENT at the start block unless
  // the start block is explicitly the deployment block (code appears within it).
  const codeAtStart = await reader.vaultHasCodeAt(req.enumerationStartBlock - 1n);
  if (codeAtStart) {
    throw new SnapshotPipelineError(
      "INCOMPLETE_COVERAGE",
      "locking vault already deployed before enumerationStartBlock; earlier LockCreated events could be missed",
    );
  }
  const codeAtPin = await reader.vaultHasCodeAt(req.snapshotBlock);
  if (!codeAtPin) {
    throw new SnapshotPipelineError(
      "VAULT_NOT_DEPLOYED",
      "locking vault has no code at the snapshot block (wrong address or pre-deployment snapshot)",
    );
  }

  // ---- 1. event-derived candidate discovery (indexer) ----
  const created = await reader.lockCreated(req.enumerationStartBlock, req.snapshotBlock);
  const withdrawn = await reader.lockWithdrawn(req.enumerationStartBlock, req.snapshotBlock);
  const enumeration = enumerateCandidates(created, req.snapshotBlock);

  // ---- 2. authoritative block-pinned effective weights ----
  const ts = header.timestamp;
  const participants: ParticipantWeight[] = [];
  let zeroWeight = 0;
  let totalWeight = 0n;
  for (const account of enumeration.candidates) {
    const lockCount = await reader.lockCountAt(account, req.snapshotBlock);
    let weight = 0n;
    for (let lockId = 0n; lockId < lockCount; lockId++) {
      const w = await reader.positionWeightAt(account, lockId, ts, req.snapshotBlock);
      if (w < 0n) throw new SnapshotPipelineError("NEGATIVE_WEIGHT", `${account}#${lockId}`);
      weight += w;
    }
    if (weight === 0n) {
      zeroWeight += 1;
      continue; // technical exclusion: zero effective weight at the pin
    }
    totalWeight += weight;
    participants.push({
      address: account,
      lockCount: toDecimalString(lockCount, "lockCount"),
      effectiveWeight: toDecimalString(weight, "effectiveWeight"),
    });
  }
  if (participants.length === 0 || totalWeight === 0n) {
    throw new SnapshotPipelineError("NO_PARTICIPANTS", "no non-zero-weight participant at the pin");
  }

  // ---- 3. entitlements: approved floor rule; dust retained ----
  const entitled: { address: string; weight: bigint; amount: bigint }[] = [];
  let entitlementTotal = 0n;
  for (const p of participants) {
    const w = BigInt(p.effectiveWeight);
    const amount = mulDivFloor(req.distributionAmount, w, totalWeight);
    if (amount === 0n) continue; // dust-heavy allocations: zero entitlements produce no leaf
    entitled.push({ address: p.address, weight: w, amount });
    entitlementTotal += amount;
  }
  if (entitled.length === 0) {
    throw new SnapshotPipelineError(
      "DUST_ONLY_DISTRIBUTION",
      "distribution too small: every participant floors to zero",
    );
  }
  const dust = req.distributionAmount - entitlementTotal;
  if (entitlementTotal > req.distributionAmount) {
    throw new SnapshotPipelineError("OVER_ALLOCATION", "entitlement total exceeds distribution");
  }

  // ---- 4. canonical leaves + Merkle tree (repo-canonical StandardMerkleTree encoding) ----
  const values = entitled.map((e) => [
    req.chainId.toString(10),
    manager,
    req.cycleId.toString(10),
    e.address,
    asset,
    e.amount.toString(10),
  ]);
  const tree = StandardMerkleTree.of(values, [...LEAF_ABI_TYPES]);
  const root = tree.root as string;
  const withProofs: ParticipantEntitlement[] = entitled.map((e, i) => {
    const leaf = tree.leafHash(values[i] as string[]) as string;
    const proof = tree.getProof(i) as string[];
    const ok = viemVerifyRaw(
      {
        chainId: req.chainId,
        claimManager: manager,
        cycleId: req.cycleId,
        wallet: e.address,
        asset,
        amount: e.amount,
      },
      proof as readonly `0x${string}`[],
      root as `0x${string}`,
    );
    if (!ok) throw new SnapshotPipelineError("PROOF_SELF_VERIFY_FAILED", e.address);
    return {
      address: e.address,
      effectiveWeight: toDecimalString(e.weight, "weight"),
      entitlement: toDecimalString(e.amount, "entitlement"),
      leaf,
      proof,
    };
  });

  // ---- 5. on-chain leaf parity at the pinned block (cross-language proof) ----
  let matched = 0;
  for (const p of withProofs) {
    const onchain = await reader.leafFor(
      req.cycleId,
      p.address,
      asset,
      BigInt(p.entitlement),
      req.snapshotBlock,
    );
    if (onchain.toLowerCase() !== p.leaf.toLowerCase()) {
      throw new SnapshotPipelineError(
        "LEAF_PARITY_MISMATCH",
        `TypeScript leaf != on-chain leafFor for ${p.address}`,
      );
    }
    matched += 1;
  }

  // ---- 6. canonical artifacts (deterministic; digests bind every input) ----
  const inputDigests: Record<string, string> = {
    request: keccakOfCanonical({
      chainId: req.chainId.toString(10),
      lockingVault: vault,
      claimManager: manager,
      snapshotBlock: req.snapshotBlock.toString(10),
      expectedBlockHash: req.expectedBlockHash.toLowerCase(),
      enumerationStartBlock: req.enumerationStartBlock.toString(10),
      distributionAsset: asset,
      distributionAmount: req.distributionAmount.toString(10),
      cycleId: req.cycleId.toString(10),
      claimStart: req.claimStart.toString(10),
      claimDeadline: req.claimDeadline.toString(10),
    }),
    lockCreatedRecords: keccakOfCanonical(
      created.map((r) => ({
        account: normalizeAddress(r.account),
        lockId: r.lockId.toString(10),
        blockNumber: r.blockNumber.toString(10),
        logIndex: r.logIndex,
      })),
    ),
    lockWithdrawnRecords: keccakOfCanonical(
      withdrawn.map((r) => ({
        account: normalizeAddress(r.account),
        lockId: r.lockId.toString(10),
        blockNumber: r.blockNumber.toString(10),
        logIndex: r.logIndex,
      })),
    ),
  };

  const snapshot: CanonicalSnapshot = {
    schemaVersion: "bps.snapshot.chain-bound/1",
    classification: CLASSIFICATION,
    chainId: req.chainId.toString(10),
    snapshotBlock: req.snapshotBlock.toString(10),
    snapshotBlockHash: header.hash.toLowerCase(),
    snapshotBlockTimestamp: ts.toString(10),
    lockingVault: vault,
    claimManager: manager,
    enumerationStartBlock: req.enumerationStartBlock.toString(10),
    // Deterministic coverage height: enumeration is complete exactly through the pinned snapshot
    // block. The run-time observed chain head (which varies between runs) lives ONLY in the
    // evidence envelope so canonical digests stay byte-stable.
    indexerSyncedThrough: req.snapshotBlock.toString(10),
    candidateCount: enumeration.candidates.length,
    zeroWeightExcludedCount: zeroWeight,
    includedParticipantCount: participants.length,
    participants,
    totalEffectiveWeight: toDecimalString(totalWeight, "totalEffectiveWeight"),
    distributionAsset: asset,
    distributionAmount: req.distributionAmount.toString(10),
    cycleId: req.cycleId.toString(10),
    entitlementRule:
      "floor(distributionAmount * participantEffectiveWeight / totalEffectiveWeight); per-wallet floor, remainder retained as distribution dust (@bps/shared ALLOCATION_ROUNDING_POLICY)",
    entitlements: withProofs.map(({ proof: _proof, ...rest }) => rest),
    entitlementTotal: toDecimalString(entitlementTotal, "entitlementTotal"),
    dust: toDecimalString(dust, "dust"),
    leafEncoding: [...LEAF_ABI_TYPES],
    leafOrder: ["chainId", "claimManager", "cycleId", "wallet", "asset", "amount"],
    merkleRoot: root,
    inputDigests,
  };
  const canonicalSnapshotDigest = keccakOfCanonical(snapshot as unknown as Record<string, unknown>);

  const proofBundle: ProofBundle = {
    schemaVersion: "bps.snapshot.proof-bundle/1",
    classification: CLASSIFICATION,
    chainId: snapshot.chainId,
    cycleId: snapshot.cycleId,
    claimManager: manager,
    distributionAsset: asset,
    merkleRoot: root,
    canonicalSnapshotDigest,
    participants: withProofs,
  };
  const proofBundleDigest = keccakOfCanonical(proofBundle as unknown as Record<string, unknown>);

  // ---- 7. unsigned publication payload (cannot sign or send anything) ----
  const calldata = encodeFunctionData({
    abi: PUBLISH_ABI,
    functionName: "publishCycle",
    args: [
      req.cycleId,
      root as `0x${string}`,
      canonicalSnapshotDigest as `0x${string}`,
      proofBundleDigest as `0x${string}`,
      req.claimStart,
      req.claimDeadline,
      [asset as `0x${string}`],
      [req.distributionAmount],
    ],
  });
  const unsignedPublication: UnsignedPublication = {
    schemaVersion: "bps.snapshot.unsigned-publication/1",
    classification:
      "UNSIGNED_DO_NOT_BROADCAST — NOT AUTHORIZED FOR PUBLICATION — LEGAL ELIGIBILITY UNVERIFIED",
    chainId: snapshot.chainId,
    to: manager,
    value: "0",
    functionSignature:
      "publishCycle(uint256,bytes32,bytes32,bytes32,uint64,uint64,address[],uint256[])",
    decodedArguments: {
      cycleId: snapshot.cycleId,
      merkleRoot: root,
      allocationsContentHash: canonicalSnapshotDigest,
      manifestEnvelopeHash: proofBundleDigest,
      claimStart: req.claimStart.toString(10),
      claimDeadline: req.claimDeadline.toString(10),
      assets: [asset],
      fundedAmounts: [req.distributionAmount.toString(10)],
    },
    encodedCalldata: calldata,
    snapshotBlock: snapshot.snapshotBlock,
    snapshotBlockHash: snapshot.snapshotBlockHash,
    merkleRoot: root,
    cycleId: snapshot.cycleId,
    distributionAsset: asset,
    distributionAmount: snapshot.distributionAmount,
    canonicalSnapshotDigest,
    authorityNote:
      "publishCycle is onlyOwner on DistributionClaimManager; the owner is the DistributionFundingCoordinator, whose authorized human path is rootPublisher -> fundRecordedAcquisition bound to a RECORDED acquisition. No such acquisition exists; this payload is evidence of shape only and cannot be executed as-is.",
  };

  return {
    snapshot,
    proofBundle,
    unsignedPublication,
    canonicalSnapshotDigest,
    proofBundleDigest,
    onchainLeafParity: { checked: withProofs.length, matched },
    observedChainHead: synced.toString(10),
  };
}
