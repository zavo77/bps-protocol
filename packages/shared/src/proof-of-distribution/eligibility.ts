// Eligibility and exclusion resolution. Addresses are already normalized. Only wallets with an
// active mock eligibility record under the cycle's eligibility policy, and not excluded, may
// receive allocations. Terms acceptance is not modelled as eligibility.

import type { CycleConfig, EligibilityRecord, ExcludedAddress } from "./model.js";
import type { WalletWeight } from "./twab.js";

export interface EligibilityResolution {
  /** Normalized eligible wallets, ascending by address. */
  readonly eligibleWallets: readonly string[];
  readonly excluded: ReadonlySet<string>;
  /** Reference instant used to evaluate validity windows (epoch end / snapshot moment). */
  readonly referenceTimestamp: bigint;
  readonly totalEligibleSnapshotBalance: bigint;
  readonly totalBaseTwab: bigint;
  readonly totalEffectiveWeight: bigint;
}

const ZERO_WEIGHT = {
  snapshotBalance: 0n,
  baseTwab: 0n,
  effectiveWeight: 0n,
} as const;

export function resolveEligibility(
  cycle: CycleConfig,
  excludedAddresses: readonly ExcludedAddress[],
  eligibility: readonly EligibilityRecord[],
  weights: ReadonlyMap<string, WalletWeight>,
): EligibilityResolution {
  const excluded = new Set<string>(excludedAddresses.map((e) => e.address));
  const referenceTimestamp = cycle.epochEnd;

  const eligibleWallets: string[] = [];
  for (const r of eligibility) {
    if (!r.eligible) continue;
    if (r.revoked) continue;
    if (r.policyVersion !== cycle.eligibilityPolicyVersion) continue;
    if (r.validFrom > referenceTimestamp) continue;
    if (r.expiry !== undefined && referenceTimestamp >= r.expiry) continue;
    if (excluded.has(r.wallet)) continue;
    eligibleWallets.push(r.wallet);
  }
  eligibleWallets.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  let totalEligibleSnapshotBalance = 0n;
  let totalBaseTwab = 0n;
  let totalEffectiveWeight = 0n;
  for (const w of eligibleWallets) {
    const weight = weights.get(w) ?? ZERO_WEIGHT;
    totalEligibleSnapshotBalance += weight.snapshotBalance;
    totalBaseTwab += weight.baseTwab;
    totalEffectiveWeight += weight.effectiveWeight;
  }

  return {
    eligibleWallets,
    excluded,
    referenceTimestamp,
    totalEligibleSnapshotBalance,
    totalBaseTwab,
    totalEffectiveWeight,
  };
}
