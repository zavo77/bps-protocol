// Reconciliation. For every asset, prove: acquired == strategicReserve + allocated + distributionDust
// (because participantPool == allocated + distributionDust). Before an on-chain claim manager
// exists, fundedRequired == claimable == unclaimed == allocated, claimed is zero/not executed, and
// reserve and dust remain separately visible. Totals are never mixed across different token
// addresses.

import { fail } from "./errors.js";
import type { AllocationResult } from "./allocation.js";
import type { CycleConfig } from "./model.js";

export interface AssetReconciliation {
  readonly assetAddress: string;
  readonly ticker: string;
  readonly decimals: number;
  readonly acquired: bigint;
  readonly participantPool: bigint;
  readonly strategicReserve: bigint;
  readonly allocated: bigint;
  readonly distributionDust: bigint;
  readonly fundedRequired: bigint;
  readonly claimable: bigint;
  readonly claimed: bigint;
  readonly unclaimed: bigint;
  readonly rollover: bigint;
  readonly claimExecuted: false;
}

export interface Reconciliation {
  readonly publishable: boolean;
  readonly assets: readonly AssetReconciliation[];
}

export function reconcile(cycle: CycleConfig, allocation: AllocationResult): Reconciliation {
  void cycle;
  const assets = allocation.assets.map((a): AssetReconciliation => {
    // Conservation: acquired must equal reserve + allocated + dust exactly.
    if (a.acquired !== a.strategicReserve + a.allocated + a.distributionDust) {
      fail(
        "RECON_CONSERVATION",
        `asset ${a.asset.tokenAddress}: acquired != reserve + allocated + dust`,
      );
    }
    return {
      assetAddress: a.asset.tokenAddress,
      ticker: a.asset.ticker,
      decimals: a.asset.decimals,
      acquired: a.acquired,
      participantPool: a.participantPool,
      strategicReserve: a.strategicReserve,
      allocated: a.allocated,
      distributionDust: a.distributionDust,
      // No on-chain claim manager exists yet: funded/claimable/unclaimed mirror allocated,
      // claimed is zero and explicitly not executed. Dust rolls over in the distribution vault.
      fundedRequired: a.allocated,
      claimable: a.allocated,
      claimed: 0n,
      unclaimed: a.allocated,
      rollover: a.distributionDust,
      claimExecuted: false,
    };
  });
  return { publishable: allocation.publishable, assets };
}

/** Human-readable, deterministic reconciliation lines (for CLI stdout). */
export function formatReconciliation(recon: Reconciliation): string[] {
  const lines: string[] = [];
  lines.push(`publishable: ${recon.publishable ? "yes" : "no"}`);
  for (const a of recon.assets) {
    lines.push(
      `asset ${a.ticker} (${a.assetAddress}) decimals=${a.decimals}: ` +
        `acquired=${a.acquired.toString()} reserve=${a.strategicReserve.toString()} ` +
        `pool=${a.participantPool.toString()} allocated=${a.allocated.toString()} ` +
        `dust=${a.distributionDust.toString()} claimed=${a.claimed.toString()} ` +
        `unclaimed=${a.unclaimed.toString()} (claim not executed)`,
    );
  }
  return lines;
}
