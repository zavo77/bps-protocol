// TASK 10G-1 — cross-language TypeScript/Solidity encoding parity.
//
// Pins the pipeline's leaf construction to the audited Solidity vector from
// packages/contracts/test/LeafVector.t.sol (frozen DistributionClaimManager._leaf), and proves the
// sorted-pair proof processing matches the on-chain verifier semantics. The live pinned-block
// leafFor equality against the DEPLOYED manager is additionally enforced at runtime inside
// runSnapshotPipeline (LEAF_PARITY_MISMATCH) and exercised by the mainnet CLI run.
import { describe, expect, it } from "vitest";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { LEAF_ABI_TYPES, viemLeafHashRaw, viemProcessProof } from "@bps/shared";

// Audited vector (LeafVector.t.sol — TASK 3 frozen encoding)
const CHAIN_ID = 987654n;
const CLAIM_MANAGER = "0x000000000000000000000000000000000000c1a1";
const CYCLE_ID = 42n;
const CLAIMANT = "0x0000000000000000000000000000000000001001";
const ASSET = "0x000000000000000000000000000000000000a006";
const AMOUNT = 111111111111n;
const EXPECTED_LEAF = "0xac90578a19c27ce2da8491889e35c371cef25ffa7bda44aa7294259a8ce0cb21";
const EXPECTED_ROOT = "0x9b85d4fffa825ad596f5a4062131d90a38eb432dbbe169ee752890170092217d";
const PROOF = [
  "0xa7bff4535f1ae3dd1fb3b42d7bede9934805653d28ff1a4e88821fcd1787c465",
  "0x0e4e4b92a45a86207f1e80cf328f7b6735004a8c794a0e4487f2f17ecc8d14f5",
  "0xf3e75f64697b2d9e076848f13b0090aa93c996ab7cf367aa741a72e524d7bd0c",
  "0x63d791a7a11070ed00565e44dd503515bdc39b212a8035e2c42bca649109d9ab",
] as const;

describe("TypeScript/Solidity canonical-encoding parity", () => {
  it("viem leaf hash reproduces the audited Solidity leaf exactly", () => {
    expect(
      viemLeafHashRaw({
        chainId: CHAIN_ID,
        claimManager: CLAIM_MANAGER,
        cycleId: CYCLE_ID,
        wallet: CLAIMANT,
        asset: ASSET,
        amount: AMOUNT,
      }),
    ).toBe(EXPECTED_LEAF);
  });

  it("StandardMerkleTree leafHash (pipeline path) equals the Solidity leaf", () => {
    const tree = StandardMerkleTree.of(
      [
        [
          CHAIN_ID.toString(10),
          CLAIM_MANAGER,
          CYCLE_ID.toString(10),
          CLAIMANT,
          ASSET,
          AMOUNT.toString(10),
        ],
      ],
      [...LEAF_ABI_TYPES],
    );
    expect(
      tree.leafHash([
        CHAIN_ID.toString(10),
        CLAIM_MANAGER,
        CYCLE_ID.toString(10),
        CLAIMANT,
        ASSET,
        AMOUNT.toString(10),
      ]),
    ).toBe(EXPECTED_LEAF);
  });

  it("sorted-pair proof processing reproduces the audited root (on-chain verifier semantics)", () => {
    expect(viemProcessProof(EXPECTED_LEAF, PROOF)).toBe(EXPECTED_ROOT);
  });

  it("domain fields (chain, manager, cycle) cannot be substituted without changing the leaf", () => {
    const base = {
      chainId: CHAIN_ID,
      claimManager: CLAIM_MANAGER,
      cycleId: CYCLE_ID,
      wallet: CLAIMANT,
      asset: ASSET,
      amount: AMOUNT,
    };
    expect(viemLeafHashRaw({ ...base, chainId: CHAIN_ID + 1n })).not.toBe(EXPECTED_LEAF);
    expect(
      viemLeafHashRaw({ ...base, claimManager: "0x000000000000000000000000000000000000c1a2" }),
    ).not.toBe(EXPECTED_LEAF);
    expect(viemLeafHashRaw({ ...base, cycleId: CYCLE_ID + 1n })).not.toBe(EXPECTED_LEAF);
  });

  it("invalid normalization cannot change identity: canonical casing hashes identically; invalid EIP-55 casing is rejected fail-closed", async () => {
    const { getAddress } = await import("viem");
    // valid EIP-55 checksummed form of the same address -> identical leaf
    const checksummed = viemLeafHashRaw({
      chainId: CHAIN_ID,
      claimManager: getAddress(CLAIM_MANAGER),
      cycleId: CYCLE_ID,
      wallet: getAddress(CLAIMANT),
      asset: getAddress(ASSET),
      amount: AMOUNT,
    });
    expect(checksummed).toBe(EXPECTED_LEAF);
    // invalid mixed-case (bad EIP-55 checksum) is REJECTED, not silently reinterpreted
    expect(() =>
      viemLeafHashRaw({
        chainId: CHAIN_ID,
        claimManager: CLAIM_MANAGER.toUpperCase().replace("0X", "0x"),
        cycleId: CYCLE_ID,
        wallet: CLAIMANT,
        asset: ASSET,
        amount: AMOUNT,
      }),
    ).toThrowError();
  });
});
