// BPSLockingVault presentation model (Task 8 §D). Locking establishes eligibility for distributions; it
// does NOT guarantee an allocation and pays NO yield/APY/interest. This module never invents rewards.
import { encodeFunctionData, type Address, type Hex } from "viem";
import { bpsLockingVaultAbi } from "./abis";
import { writesAllowed, type DeploymentState } from "./manifest";

// Frozen vebps-1 tier table (seconds -> multiplier bps). Mirrors BPSLockingVault.policyMultiplierBps.
export const LOCK_TIERS = [
  { label: "7 days", durationSec: 604_800, multiplierBps: 11_000 },
  { label: "14 days", durationSec: 1_209_600, multiplierBps: 12_500 },
  { label: "21 days", durationSec: 1_814_400, multiplierBps: 15_000 },
  { label: "30 days", durationSec: 2_592_000, multiplierBps: 17_500 },
] as const;

export type LockDurationSec = (typeof LOCK_TIERS)[number]["durationSec"];

export interface LockView {
  readonly walletBpsBalance: bigint;
  readonly lockedPrincipal: bigint;
  readonly tiers: typeof LOCK_TIERS;
  // Governance/eligibility snapshot context is display-only; never fabricated.
  readonly snapshotNote: string;
}

export function buildLockView(walletBpsBalance: bigint, lockedPrincipal: bigint): LockView {
  if (walletBpsBalance < 0n || lockedPrincipal < 0n) throw new Error("negative balance");
  return {
    walletBpsBalance,
    lockedPrincipal,
    tiers: LOCK_TIERS,
    snapshotNote:
      "Locking establishes eligibility for future distributions under the frozen vebps-1 policy. " +
      "It does not guarantee an allocation and pays no yield or interest.",
  };
}

/** Effective weight = floor(principal * multiplierBps / 10000); matches the on-chain rule (display). */
export function previewLockWeight(principal: bigint, durationSec: number): bigint {
  const tier = LOCK_TIERS.find((t) => t.durationSec === durationSec);
  if (!tier) throw new Error("unsupported lock duration");
  return (principal * BigInt(tier.multiplierBps)) / 10_000n;
}

export interface LockActionPlan {
  readonly target: Address;
  readonly allowanceToken: "BPS";
  readonly allowanceAmount: bigint; // exact principal; never unlimited
  readonly calldata: Hex;
  readonly canSubmit: boolean;
}

export function planCreateLock(
  amount: bigint,
  durationSec: number,
  deployment: DeploymentState,
  eligible: boolean,
): LockActionPlan {
  if (deployment.status !== "live") throw new Error("no live deployment");
  if (amount <= 0n) throw new Error("zero amount");
  if (!LOCK_TIERS.some((t) => t.durationSec === durationSec))
    throw new Error("unsupported duration");
  const calldata = encodeFunctionData({
    abi: bpsLockingVaultAbi,
    functionName: "createLock",
    args: [amount, durationSec],
  });
  return {
    target: deployment.addresses.lockingVault as Address,
    allowanceToken: "BPS",
    allowanceAmount: amount, // exact
    calldata,
    canSubmit: writesAllowed(deployment) && eligible,
  };
}

export function planWithdraw(
  lockId: bigint,
  deployment: DeploymentState,
  eligible: boolean,
): { readonly target: Address; readonly calldata: Hex; readonly canSubmit: boolean } {
  if (deployment.status !== "live") throw new Error("no live deployment");
  const calldata = encodeFunctionData({
    abi: bpsLockingVaultAbi,
    functionName: "withdraw",
    args: [lockId],
  });
  return {
    target: deployment.addresses.lockingVault as Address,
    calldata,
    canSubmit: writesAllowed(deployment) && eligible,
  };
}
