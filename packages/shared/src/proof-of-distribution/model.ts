// Internal typed model. All numeric values are bigint; all addresses are normalized (lowercase).
// Produced from the raw validated fixture by `validate.ts`.

import type { ExclusionCategory, LockTier } from "./constants.js";

export interface CycleConfig {
  readonly schemaVersion: string;
  readonly cycleId: bigint;
  readonly chainId: bigint;
  readonly bpsTokenAddress: string;
  readonly claimManagerAddress: string;
  readonly economicsVersion: string;
  readonly rewardPolicyVersion: string;
  readonly epochId: bigint;
  readonly epochStart: bigint;
  readonly epochEnd: bigint;
  readonly startBlock: bigint;
  readonly endBlock: bigint;
  readonly snapshotBlock: bigint;
  readonly finalizedBlock: bigint;
  readonly confirmationDepth: bigint;
  readonly claimStart: bigint;
  readonly claimDeadline: bigint;
  readonly termsVersion: string;
  readonly eligibilityPolicyVersion: string;
  readonly restrictedJurisdictionPolicyVersion: string;
}

export interface ConfirmedTransfer {
  readonly chainId: bigint;
  readonly blockNumber: bigint;
  readonly blockHash: string;
  readonly transactionHash: string;
  readonly transactionIndex: bigint;
  readonly logIndex: bigint;
  readonly timestamp: bigint;
  readonly from: string;
  readonly to: string;
  readonly rawAmount: bigint;
}

export interface EpochStartBalance {
  readonly wallet: string;
  readonly rawBalance: bigint;
}

export interface LockRecord {
  readonly wallet: string;
  readonly rawPrincipal: bigint;
  readonly tier: LockTier;
  readonly startTimestamp: bigint;
  readonly unlockTimestamp: bigint;
  readonly withdrawalTimestamp?: bigint;
}

export interface EligibilityRecord {
  readonly wallet: string;
  readonly eligible: boolean;
  readonly policyVersion: string;
  readonly validFrom: bigint;
  readonly expiry?: bigint;
  readonly revoked: boolean;
}

export interface ExcludedAddress {
  readonly address: string;
  readonly category: ExclusionCategory;
  readonly reason: string;
  readonly policyVersion: string;
}

export interface AcquiredAsset {
  readonly ticker: string;
  readonly name: string;
  readonly tokenAddress: string;
  readonly decimals: number;
  readonly acquiredRawAmount: bigint;
}

export interface CycleFixture {
  readonly cycle: CycleConfig;
  readonly excludedAddresses: readonly ExcludedAddress[];
  readonly eligibility: readonly EligibilityRecord[];
  readonly epochStartBalances: readonly EpochStartBalance[];
  readonly transfers: readonly ConfirmedTransfer[];
  readonly locks: readonly LockRecord[];
  readonly assets: readonly AcquiredAsset[];
}

/** A single distribution entitlement (one wallet, one asset, one cycle). */
export interface Entitlement {
  readonly cycleId: bigint;
  readonly wallet: string;
  readonly asset: string;
  readonly amount: bigint;
}
