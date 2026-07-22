// DistributionClaimManager claim model (Task 8 §E). Entitlement is NEVER inferred from wallet holdings:
// it comes from a published Proof-of-Distribution artifact and is verified against the on-chain cycle
// (root/stock/amount) and a locally recomputed Merkle proof before any claim is enabled. Duplicate
// attempts are blocked in the UI, and the contract independently enforces single-claim. Nothing here
// fabricates a proof when the proof service is unavailable.
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { distributionClaimManagerAbi } from "./abis";
import { ROBINHOOD_CHAIN_ID, writesAllowed, type DeploymentState } from "./manifest";

/** Compute the frozen claim leaf: keccak256(bytes.concat(keccak256(abi.encode(...)))) — a double hash. */
export function computeLeaf(params: {
  readonly chainId: number;
  readonly claimManager: Address;
  readonly cycleId: bigint;
  readonly claimant: Address;
  readonly asset: Address;
  readonly amount: bigint;
}): Hex {
  const inner = keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
      ],
      [
        BigInt(params.chainId),
        params.claimManager,
        params.cycleId,
        params.claimant,
        params.asset,
        params.amount,
      ],
    ),
  );
  return keccak256(inner);
}

/** OpenZeppelin StandardMerkleTree sorted-pair fold. Returns the recomputed root. */
export function foldProof(leaf: Hex, proof: readonly Hex[]): Hex {
  let node = leaf;
  for (const sibling of proof) {
    node =
      BigInt(node) < BigInt(sibling)
        ? keccak256(concatHex([node, sibling]))
        : keccak256(concatHex([sibling, node]));
  }
  return node;
}

export interface Entitlement {
  readonly cycleId: bigint;
  readonly claimManager: Address;
  readonly asset: Address;
  readonly assetSymbol: string;
  readonly claimant: Address;
  readonly amount: bigint;
  readonly proof: readonly Hex[];
  readonly root: Hex; // from the published artifact
}

export interface OnchainCycle {
  readonly cycleId: bigint;
  readonly root: Hex;
  readonly asset: Address;
  readonly remaining: bigint;
  readonly claimStartSec: bigint;
  readonly claimDeadlineSec: bigint;
}

export type ClaimVerdict =
  | { readonly ok: true; readonly recomputedRoot: Hex }
  | { readonly ok: false; readonly reason: ClaimRejection };

export type ClaimRejection =
  | "cycle-mismatch"
  | "asset-mismatch"
  | "root-mismatch"
  | "proof-invalid"
  | "amount-exceeds-remaining"
  | "outside-claim-window"
  | "already-claimed";

/**
 * Verify an entitlement against the on-chain cycle and locally recomputed proof. All of: cycle id, asset,
 * artifact-root vs on-chain-root, proof validity, remaining funds, and claim window must agree.
 */
export function verifyClaim(
  entitlement: Entitlement,
  cycle: OnchainCycle,
  ctx: { readonly chainId: number; readonly nowSec: bigint; readonly alreadyClaimed: boolean },
): ClaimVerdict {
  if (ctx.alreadyClaimed) return { ok: false, reason: "already-claimed" };
  if (entitlement.cycleId !== cycle.cycleId) return { ok: false, reason: "cycle-mismatch" };
  if (entitlement.asset.toLowerCase() !== cycle.asset.toLowerCase()) {
    return { ok: false, reason: "asset-mismatch" };
  }
  if (entitlement.root.toLowerCase() !== cycle.root.toLowerCase()) {
    return { ok: false, reason: "root-mismatch" };
  }
  if (ctx.nowSec < cycle.claimStartSec || ctx.nowSec > cycle.claimDeadlineSec) {
    return { ok: false, reason: "outside-claim-window" };
  }
  if (entitlement.amount > cycle.remaining)
    return { ok: false, reason: "amount-exceeds-remaining" };

  const leaf = computeLeaf({
    chainId: ctx.chainId,
    claimManager: entitlement.claimManager,
    cycleId: entitlement.cycleId,
    claimant: entitlement.claimant,
    asset: entitlement.asset,
    amount: entitlement.amount,
  });
  const recomputedRoot = foldProof(leaf, entitlement.proof);
  if (recomputedRoot.toLowerCase() !== cycle.root.toLowerCase()) {
    return { ok: false, reason: "proof-invalid" };
  }
  return { ok: true, recomputedRoot };
}

export interface ClaimPlan {
  readonly target: Address;
  readonly calldata: Hex;
  readonly canSubmit: boolean;
  readonly verdict: ClaimVerdict;
}

/** Build a claim plan; `canSubmit` requires live writes, a passing verdict, and eligibility. */
export function planClaim(
  entitlement: Entitlement,
  cycle: OnchainCycle,
  deployment: DeploymentState,
  ctx: { readonly nowSec: bigint; readonly alreadyClaimed: boolean; readonly eligible: boolean },
): ClaimPlan {
  if (deployment.status !== "live") throw new Error("no live deployment");
  const verdict = verifyClaim(entitlement, cycle, {
    chainId: deployment.chainId ?? ROBINHOOD_CHAIN_ID,
    nowSec: ctx.nowSec,
    alreadyClaimed: ctx.alreadyClaimed,
  });
  const calldata = encodeFunctionData({
    abi: distributionClaimManagerAbi,
    functionName: "claim",
    args: [entitlement.cycleId, entitlement.asset, entitlement.amount, [...entitlement.proof]],
  });
  return {
    target: deployment.addresses.claimManager as Address,
    calldata,
    canSubmit: writesAllowed(deployment) && ctx.eligible && verdict.ok,
    verdict,
  };
}
