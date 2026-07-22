// Public API of the deterministic Proof-of-Distribution engine. Internal helpers not re-exported
// here are intentionally private.

export {
  ECON_VERSION,
  MANIFEST_SCHEMA_VERSION,
  LEAF_SCHEMA_VERSION,
  EPOCH_SECONDS,
  PARTICIPANT_POOL_BPS,
  BPS_DENOMINATOR,
  LEAF_ABI_TYPES,
  TIER_SPECS,
  UNLOCKED_MULTIPLIER_BPS,
  SUPPORTED_LOCK_TIERS,
  EXCLUSION_CATEGORIES,
  ALLOCATION_ROUNDING_POLICY,
  RESERVE_POLICY,
} from "./constants.js";
export type { LockTier, TierSpec, ExclusionCategory } from "./constants.js";

export { ProofOfDistributionError } from "./errors.js";

export { normalizeAddress, isHexAddress, isZeroAddress, ZERO_ADDRESS } from "./address.js";
export {
  isNonNegativeIntegerString,
  parseNonNegativeInteger,
  toDecimalString,
  mulDivFloor,
} from "./numeric.js";

export { epochIdOf, epochStartOf, epochEndOf, epochBoundsOf } from "./epoch.js";
export type { EpochBounds } from "./epoch.js";

export { parseCycleFixture } from "./schemas.js";
export { loadCycleFixture } from "./validate.js";
export type {
  CycleConfig,
  CycleFixture,
  ConfirmedTransfer,
  EpochStartBalance,
  LockRecord,
  EligibilityRecord,
  ExcludedAddress,
  AcquiredAsset,
  Entitlement,
} from "./model.js";

export { computeWeights, canonicalizeTransfers } from "./twab.js";
export type { WalletWeight, WeightComputation } from "./twab.js";

export { resolveEligibility } from "./eligibility.js";
export type { EligibilityResolution } from "./eligibility.js";

export { allocate, allocateAsset } from "./allocation.js";
export type { AllocationResult, AssetAllocation, WalletAllocation } from "./allocation.js";

export { buildMerkle, walletClaims, ozVerify } from "./merkle.js";
export type { MerkleResult, MerkleLeafEntry } from "./merkle.js";

export {
  viemLeafHash,
  viemLeafHashRaw,
  viemProcessProof,
  viemVerify,
  viemVerifyRaw,
} from "./viem-verify.js";
export type { LeafFields } from "./viem-verify.js";

export { canonicalStringify, keccakOfString, keccakOfCanonical } from "./serialize.js";

export { reconcile, formatReconciliation } from "./reconciliation.js";
export type { Reconciliation, AssetReconciliation } from "./reconciliation.js";

export {
  buildManifest,
  buildAllocations,
  buildWalletProofs,
  buildReconciliation,
} from "./artifacts.js";
export type { Artifact } from "./artifacts.js";

export {
  independentlyVerifyWalletProofs,
  verifyManifestEnvelope,
  verifyAllocationsContentHash,
} from "./independent-verify.js";
export type { IndependentProofResult } from "./independent-verify.js";

export { runProofOfDistribution } from "./pipeline.js";
export type { PipelineResult, ArtifactSet, VerificationSummary } from "./pipeline.js";
