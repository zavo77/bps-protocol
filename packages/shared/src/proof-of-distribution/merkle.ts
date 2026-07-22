// StandardMerkleTree generation over entitlements, plus a wallet proof index. Uses the pinned
// @openzeppelin/merkle-tree with the exact canonical leaf tuple:
//   [chainId, claimManager, cycleId, wallet, asset, amount]
// encoded as [uint256, address, uint256, address, address, uint256]. OpenZeppelin double-hashes
// each leaf and builds a sorted-pair (commutative) tree, so the root is independent of input order.

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { normalizeAddress } from "./address.js";
import { LEAF_ABI_TYPES } from "./constants.js";
import { fail } from "./errors.js";
import type { CycleConfig, Entitlement } from "./model.js";

const LEAF_ENCODING = [...LEAF_ABI_TYPES];

export interface MerkleLeafEntry {
  readonly entitlement: Entitlement;
  readonly leaf: string;
  readonly proof: readonly string[];
}

export interface MerkleResult {
  readonly root: string;
  readonly leafEncoding: readonly string[];
  /** Entries sorted canonically by (wallet, asset). */
  readonly entries: readonly MerkleLeafEntry[];
  readonly walletIndex: ReadonlyMap<string, readonly MerkleLeafEntry[]>;
}

function toValue(cycle: CycleConfig, e: Entitlement): string[] {
  return [
    cycle.chainId.toString(10),
    cycle.claimManagerAddress,
    cycle.cycleId.toString(10),
    e.wallet,
    e.asset,
    e.amount.toString(10),
  ];
}

function compareEntitlements(a: Entitlement, b: Entitlement): number {
  if (a.wallet !== b.wallet) return a.wallet < b.wallet ? -1 : 1;
  if (a.asset !== b.asset) return a.asset < b.asset ? -1 : 1;
  return 0;
}

/** Build the Merkle tree, per-entitlement proofs, and a wallet -> claims index. */
export function buildMerkle(
  cycle: CycleConfig,
  entitlements: readonly Entitlement[],
): MerkleResult {
  if (entitlements.length === 0) {
    fail("EMPTY_TREE", "cannot build a Merkle tree with no entitlements");
  }

  const sorted = [...entitlements].sort(compareEntitlements);

  const seen = new Set<string>();
  for (const e of sorted) {
    if (e.amount <= 0n) {
      fail("ZERO_LEAF", `entitlement for ${e.wallet}/${e.asset} has a non-positive amount`);
    }
    const key = `${e.cycleId.toString()}|${e.wallet}|${e.asset}`;
    if (seen.has(key)) {
      fail("DUPLICATE_ENTITLEMENT", `duplicate (cycleId, wallet, asset) tuple: ${key}`);
    }
    seen.add(key);
  }

  const values = sorted.map((e) => toValue(cycle, e));
  const tree = StandardMerkleTree.of(values, LEAF_ENCODING);

  const entries: MerkleLeafEntry[] = sorted.map((entitlement) => {
    const value = toValue(cycle, entitlement);
    return {
      entitlement,
      leaf: tree.leafHash(value),
      proof: tree.getProof(value),
    };
  });

  const walletIndex = new Map<string, MerkleLeafEntry[]>();
  for (const entry of entries) {
    const list = walletIndex.get(entry.entitlement.wallet) ?? [];
    list.push(entry);
    walletIndex.set(entry.entitlement.wallet, list);
  }

  return { root: tree.root, leafEncoding: LEAF_ABI_TYPES, entries, walletIndex };
}

/** Look up every claim for a wallet, accepting any address casing; unknown wallets return []. */
export function walletClaims(result: MerkleResult, address: string): readonly MerkleLeafEntry[] {
  return result.walletIndex.get(normalizeAddress(address)) ?? [];
}

/** Independently re-verify a proof against a root using OpenZeppelin's static verifier. */
export function ozVerify(
  root: string,
  cycle: CycleConfig,
  entitlement: Entitlement,
  proof: readonly string[],
): boolean {
  return StandardMerkleTree.verify(root, LEAF_ENCODING, toValue(cycle, entitlement), [...proof]);
}
