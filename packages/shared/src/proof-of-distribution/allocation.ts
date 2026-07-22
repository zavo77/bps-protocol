// 80/20 acquired-asset split, per-wallet floor allocation, dust retention, and entitlement
// generation. Each asset is allocated independently in its own raw units; quantities from
// different token addresses are never combined.

import { BPS_DENOMINATOR, PARTICIPANT_POOL_BPS } from "./constants.js";
import { fail } from "./errors.js";
import type { AcquiredAsset, CycleConfig, Entitlement } from "./model.js";
import { mulDivFloor } from "./numeric.js";
import type { WalletWeight } from "./twab.js";

export interface WalletAllocation {
  readonly wallet: string;
  readonly amount: bigint;
}

export interface AssetAllocation {
  readonly asset: AcquiredAsset;
  readonly acquired: bigint;
  readonly participantPool: bigint;
  readonly strategicReserve: bigint;
  readonly allocated: bigint;
  readonly distributionDust: bigint;
  readonly walletAllocations: readonly WalletAllocation[];
  readonly entitlements: readonly Entitlement[];
}

export interface AllocationResult {
  readonly assets: readonly AssetAllocation[];
  readonly entitlements: readonly Entitlement[];
  readonly totalEffectiveWeight: bigint;
  readonly publishable: boolean;
  readonly nonPublishableReason?: string;
}

const ZERO_WEIGHT = { effectiveWeight: 0n } as const;

/** Split a single asset's acquired inventory 80/20 and floor-allocate the participant pool. */
export function allocateAsset(
  cycle: CycleConfig,
  asset: AcquiredAsset,
  eligibleWallets: readonly string[],
  weights: ReadonlyMap<string, WalletWeight>,
  totalEffectiveWeight: bigint,
): AssetAllocation {
  const acquired = asset.acquiredRawAmount;
  const participantPool = mulDivFloor(acquired, PARTICIPANT_POOL_BPS, BPS_DENOMINATOR);
  const strategicReserve = acquired - participantPool;

  const walletAllocations: WalletAllocation[] = [];
  const entitlements: Entitlement[] = [];
  let allocated = 0n;

  if (totalEffectiveWeight > 0n) {
    for (const wallet of eligibleWallets) {
      const weight = (weights.get(wallet) ?? ZERO_WEIGHT).effectiveWeight;
      if (weight <= 0n) continue;
      const amount = mulDivFloor(participantPool, weight, totalEffectiveWeight);
      if (amount <= 0n) continue;
      allocated += amount;
      walletAllocations.push({ wallet, amount });
      entitlements.push({ cycleId: cycle.cycleId, wallet, asset: asset.tokenAddress, amount });
    }
  }

  const distributionDust = participantPool - allocated;

  // Conservation invariants (must hold by construction; asserted defensively).
  if (participantPool + strategicReserve !== acquired) {
    fail("ALLOC_CONSERVATION", `asset ${asset.tokenAddress}: pool + reserve != acquired`);
  }
  if (allocated + distributionDust !== participantPool) {
    fail("ALLOC_CONSERVATION", `asset ${asset.tokenAddress}: allocated + dust != participantPool`);
  }
  if (allocated > participantPool) {
    fail("ALLOC_OVERFLOW", `asset ${asset.tokenAddress}: allocated exceeds participantPool`);
  }

  return {
    asset,
    acquired,
    participantPool,
    strategicReserve,
    allocated,
    distributionDust,
    walletAllocations,
    entitlements,
  };
}

/** Allocate every asset independently and collect the flat entitlement list. */
export function allocate(
  cycle: CycleConfig,
  assets: readonly AcquiredAsset[],
  eligibleWallets: readonly string[],
  weights: ReadonlyMap<string, WalletWeight>,
  totalEffectiveWeight: bigint,
): AllocationResult {
  const assetAllocations = assets.map((asset) =>
    allocateAsset(cycle, asset, eligibleWallets, weights, totalEffectiveWeight),
  );
  const entitlements = assetAllocations.flatMap((a) => a.entitlements);

  let publishable = true;
  let nonPublishableReason: string | undefined;
  if (totalEffectiveWeight === 0n) {
    publishable = false;
    nonPublishableReason =
      "total effective weight is zero; no entitlements or Merkle root produced";
  } else if (entitlements.length === 0) {
    publishable = false;
    nonPublishableReason = "no non-zero entitlements were produced; nothing to publish";
  }

  return {
    assets: assetAllocations,
    entitlements,
    totalEffectiveWeight,
    publishable,
    ...(nonPublishableReason !== undefined ? { nonPublishableReason } : {}),
  };
}
