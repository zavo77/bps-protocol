// Proof-artifact provider (Task 8B §H). Defines the artifact shape and a DETERMINISTIC LOCAL provider.
// No production artifact service exists, so only the local provider is implemented; a production entitlement
// is never fabricated. Before a claim is enabled the caller must re-verify the artifact against the
// on-chain cycle (root/stock/cycle/manager/chain), recompute the leaf, verify the Merkle proof, check
// not-already-claimed, and confirm sufficient remaining allocation (see lib/claim.ts + services/reads.ts).
import { concatHex, keccak256, type Address, type Hex } from "viem";
import { computeLeaf } from "../claim";

export interface ProofArtifact {
  readonly artifactVersion: string;
  readonly cycleId: bigint;
  readonly chainId: number;
  readonly claimManager: Address;
  readonly stockToken: Address;
  readonly stockSymbol: string;
  readonly root: Hex;
  readonly account: Address;
  readonly amount: bigint;
  readonly proof: readonly Hex[];
  readonly artifactId: string;
}

export interface ProofArtifactProvider {
  readonly kind: "local" | "production";
  getArtifact(cycleId: bigint, account: Address): Promise<ProofArtifact | null>;
}

function pair(a: Hex, b: Hex): Hex {
  return BigInt(a) < BigInt(b) ? keccak256(concatHex([a, b])) : keccak256(concatHex([b, a]));
}

export interface LocalProofConfig {
  readonly chainId: number;
  readonly claimManager: Address;
  readonly stockToken: Address;
  readonly stockSymbol: string;
  readonly cycleId: bigint;
  readonly account: Address;
  readonly amount: bigint;
  /** A second, unrelated leaf so the proof is non-trivial (a real sibling). */
  readonly siblingAccount: Address;
  readonly siblingAmount: bigint;
}

/**
 * A deterministic local provider that builds a real 2-leaf tree for one eligible account. It returns null
 * for any other account/cycle (never fabricates an entitlement).
 */
export function createLocalProofProvider(cfg: LocalProofConfig): ProofArtifactProvider {
  const leaf = computeLeaf({
    chainId: cfg.chainId,
    claimManager: cfg.claimManager,
    cycleId: cfg.cycleId,
    claimant: cfg.account,
    asset: cfg.stockToken,
    amount: cfg.amount,
  });
  const sibling = computeLeaf({
    chainId: cfg.chainId,
    claimManager: cfg.claimManager,
    cycleId: cfg.cycleId,
    claimant: cfg.siblingAccount,
    asset: cfg.stockToken,
    amount: cfg.siblingAmount,
  });
  const root = pair(leaf, sibling);
  return {
    kind: "local",
    getArtifact: (cycleId: bigint, account: Address) => {
      if (cycleId !== cfg.cycleId || account.toLowerCase() !== cfg.account.toLowerCase()) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        artifactVersion: "bps.pod.artifact/1",
        cycleId: cfg.cycleId,
        chainId: cfg.chainId,
        claimManager: cfg.claimManager,
        stockToken: cfg.stockToken,
        stockSymbol: cfg.stockSymbol,
        root,
        account: cfg.account,
        amount: cfg.amount,
        proof: [sibling],
        artifactId: `local-${cfg.cycleId}-${cfg.account.toLowerCase()}`,
      });
    },
  };
}
