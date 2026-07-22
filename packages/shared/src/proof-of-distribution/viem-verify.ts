// Independent proof verification using viem hashing and sorted-pair (commutative) folding. This is
// deliberately separate from the @openzeppelin/merkle-tree generator so proofs are not only
// self-verified. Leaf hashing reproduces OpenZeppelin's StandardMerkleTree: the leaf is the
// double keccak256 of the ABI-encoded tuple, and internal nodes hash the sorted pair.

import { concatHex, encodeAbiParameters, keccak256, type Hex } from "viem";
import type { CycleConfig, Entitlement } from "./model.js";

const LEAF_ABI_PARAMS = [
  { type: "uint256" },
  { type: "address" },
  { type: "uint256" },
  { type: "address" },
  { type: "address" },
  { type: "uint256" },
] as const;

export interface LeafFields {
  readonly chainId: bigint;
  readonly claimManager: string;
  readonly cycleId: bigint;
  readonly wallet: string;
  readonly asset: string;
  readonly amount: bigint;
}

/** Double-hashed StandardMerkleTree leaf from raw fields, computed independently with viem. */
export function viemLeafHashRaw(f: LeafFields): Hex {
  const encoded = encodeAbiParameters(LEAF_ABI_PARAMS, [
    f.chainId,
    f.claimManager as Hex,
    f.cycleId,
    f.wallet as Hex,
    f.asset as Hex,
    f.amount,
  ]);
  return keccak256(keccak256(encoded));
}

/** Double-hashed StandardMerkleTree leaf for an entitlement, computed independently with viem. */
export function viemLeafHash(cycle: CycleConfig, e: Entitlement): Hex {
  return viemLeafHashRaw({
    chainId: cycle.chainId,
    claimManager: cycle.claimManagerAddress,
    cycleId: cycle.cycleId,
    wallet: e.wallet,
    asset: e.asset,
    amount: e.amount,
  });
}

/** Verify a proof from raw leaf fields, independent of the generator. */
export function viemVerifyRaw(f: LeafFields, proof: readonly Hex[], root: Hex): boolean {
  return viemProcessProof(viemLeafHashRaw(f), proof) === root;
}

function sortedPair(a: Hex, b: Hex): Hex {
  return BigInt(a) < BigInt(b) ? concatHex([a, b]) : concatHex([b, a]);
}

/** Fold a proof over a leaf using commutative sorted-pair hashing, returning the derived root. */
export function viemProcessProof(leaf: Hex, proof: readonly Hex[]): Hex {
  let computed = leaf;
  for (const sibling of proof) {
    computed = keccak256(sortedPair(computed, sibling));
  }
  return computed;
}

/** True iff `proof` binds `e` under `cycle` to `root`, verified independently of the generator. */
export function viemVerify(
  cycle: CycleConfig,
  e: Entitlement,
  proof: readonly Hex[],
  root: Hex,
): boolean {
  return viemProcessProof(viemLeafHash(cycle, e), proof) === root;
}
