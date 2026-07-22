// Canonical constants for the Proof-of-Distribution engine.
//
// Economics version BPS-ECON-2.0 ONLY. Superseded models (any "2% total protocol fee",
// "150/50 BPS split", "3%/5% fee model", "Protocol Stewardship Treasury fee", "2.98%
// all-in", or "hardcoded 1% LP-tier") must NOT appear in this engine, its fixtures, or its
// outputs. This module implements distribution of already-acquired fictional inventory only;
// it does not implement the trade-fee router or buy-and-burn.

/** Canonical economics policy version. */
export const ECON_VERSION = "BPS-ECON-2.0" as const;

/** Manifest and leaf schema identifiers embedded in artifacts. */
export const MANIFEST_SCHEMA_VERSION = "bps.pod.manifest/1" as const;
export const LEAF_SCHEMA_VERSION = "bps.pod.leaf/1" as const;

/** Exact 15-minute UTC epoch length, in seconds. */
export const EPOCH_SECONDS = 900n;

/** 80/20 acquired-asset split, in basis points (participant share). */
export const PARTICIPANT_POOL_BPS = 8_000n;
export const BPS_DENOMINATOR = 10_000n;

/**
 * StandardMerkleTree leaf tuple ABI types, in the exact canonical order:
 * [chainId, claimManager, cycleId, wallet, asset, amount].
 */
export const LEAF_ABI_TYPES = [
  "uint256",
  "address",
  "uint256",
  "address",
  "address",
  "uint256",
] as const;

/** Supported veBPS lock tiers. Unlocked (1.00x) is the implicit state of holding without a lock. */
export type LockTier = "LOCK_7D" | "LOCK_14D" | "LOCK_21D" | "LOCK_30D";

export interface TierSpec {
  readonly tier: LockTier;
  readonly multiplierBps: bigint;
  readonly durationSeconds: bigint;
}

const DAY = 86_400n;

/** Tier table. Multipliers in basis points; durations define the exact lock length. */
export const TIER_SPECS: Readonly<Record<LockTier, TierSpec>> = {
  LOCK_7D: { tier: "LOCK_7D", multiplierBps: 11_000n, durationSeconds: 7n * DAY },
  LOCK_14D: { tier: "LOCK_14D", multiplierBps: 12_500n, durationSeconds: 14n * DAY },
  LOCK_21D: { tier: "LOCK_21D", multiplierBps: 15_000n, durationSeconds: 21n * DAY },
  LOCK_30D: { tier: "LOCK_30D", multiplierBps: 17_500n, durationSeconds: 30n * DAY },
};

/** Multiplier of the implicit unlocked component, in basis points. */
export const UNLOCKED_MULTIPLIER_BPS = 10_000n;

export const SUPPORTED_LOCK_TIERS: readonly LockTier[] = [
  "LOCK_7D",
  "LOCK_14D",
  "LOCK_21D",
  "LOCK_30D",
];

/** Categories of addresses excluded from entitlement. The fixture must cover every one. */
export type ExclusionCategory =
  | "UNISWAP_POOL"
  | "NONFUNGIBLE_POSITION_MANAGER"
  | "ZERO_BURN_DEAD"
  | "OFFICIAL_ROUTER"
  | "ACQUISITION_VAULT"
  | "DISTRIBUTION_VAULT"
  | "STRATEGIC_ASSET_RESERVE"
  | "LOCKING_VAULT"
  | "PROTOCOL_TREASURY"
  | "TEAM_VESTING"
  | "BRIDGE"
  | "CONTRACT_INELIGIBLE"
  | "EXPLICIT_MANIFEST";

export const EXCLUSION_CATEGORIES: readonly ExclusionCategory[] = [
  "UNISWAP_POOL",
  "NONFUNGIBLE_POSITION_MANAGER",
  "ZERO_BURN_DEAD",
  "OFFICIAL_ROUTER",
  "ACQUISITION_VAULT",
  "DISTRIBUTION_VAULT",
  "STRATEGIC_ASSET_RESERVE",
  "LOCKING_VAULT",
  "PROTOCOL_TREASURY",
  "TEAM_VESTING",
  "BRIDGE",
  "CONTRACT_INELIGIBLE",
  "EXPLICIT_MANIFEST",
];

/** The canonical allocation rounding policy string recorded in the manifest. */
export const ALLOCATION_ROUNDING_POLICY =
  "floor(participantPool * walletEffectiveWeight / totalEffectiveWeight); " +
  "per-wallet floor, remainder retained as distribution dust in the vault";

/** The canonical 80/20 reserve policy string recorded in the manifest. */
export const RESERVE_POLICY =
  "participantPool = floor(acquired * 8000 / 10000); strategicReserve = acquired - participantPool";
