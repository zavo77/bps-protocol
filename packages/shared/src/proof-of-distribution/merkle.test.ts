import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { buildMerkle, ozVerify, walletClaims } from "./merkle.js";
import type { Entitlement } from "./model.js";
import { loadCycleFixture } from "./validate.js";
import { viemVerify, viemVerifyRaw } from "./viem-verify.js";
import { A, baseRawFixture } from "./testkit.js";

const cycle = loadCycleFixture(baseRawFixture()).cycle;

function ent(wallet: string, assetAddr: string, amount: bigint): Entitlement {
  return { cycleId: cycle.cycleId, wallet, asset: assetAddr, amount };
}

const entitlements: Entitlement[] = [
  ent(A.w1, A.asset6, 100n),
  ent(A.w1, A.asset18, 200n),
  ent(A.w2, A.asset6, 300n),
  ent(A.w2, A.asset8, 50n),
];

describe("Merkle generation and verification", () => {
  it("rejects duplicate (cycleId, wallet, asset) tuples (req 25)", () => {
    const dup = [...entitlements, ent(A.w1, A.asset6, 999n)];
    expect(() => buildMerkle(cycle, dup)).toThrow(/DUPLICATE_ENTITLEMENT/);
  });

  it("produces a deterministic root across repeated runs (req 26)", () => {
    expect(buildMerkle(cycle, entitlements).root).toBe(buildMerkle(cycle, entitlements).root);
  });

  it("produces an identical root and proofs under shuffled input (req 27)", () => {
    const forward = buildMerkle(cycle, entitlements);
    const reversed = buildMerkle(cycle, [...entitlements].reverse());
    expect(reversed.root).toBe(forward.root);
    const fw = walletClaims(forward, A.w1).map((e) => [e.entitlement.asset, e.proof]);
    const rv = walletClaims(reversed, A.w1).map((e) => [e.entitlement.asset, e.proof]);
    expect(rv).toEqual(fw); // identical bytes, independent of input order
  });

  it("verifies every generated proof under both OpenZeppelin and viem (req 28)", () => {
    const result = buildMerkle(cycle, entitlements);
    const root = result.root as Hex;
    expect(result.entries).toHaveLength(4);
    for (const e of result.entries) {
      expect(ozVerify(result.root, cycle, e.entitlement, e.proof)).toBe(true);
      expect(viemVerify(cycle, e.entitlement, e.proof as Hex[], root)).toBe(true);
    }
  });

  it("rejects tampering with any bound leaf field (req 29)", () => {
    const result = buildMerkle(cycle, entitlements);
    const root = result.root as Hex;
    const target = walletClaims(result, A.w1)[0]!;
    const proof = target.proof as Hex[];
    const base = {
      chainId: cycle.chainId,
      claimManager: cycle.claimManagerAddress,
      cycleId: cycle.cycleId,
      wallet: target.entitlement.wallet,
      asset: target.entitlement.asset,
      amount: target.entitlement.amount,
    };
    // Sanity: the untampered leaf verifies.
    expect(viemVerifyRaw(base, proof, root)).toBe(true);
    // Every bound field, when changed, must invalidate the proof.
    expect(viemVerifyRaw({ ...base, chainId: base.chainId + 1n }, proof, root)).toBe(false);
    expect(viemVerifyRaw({ ...base, claimManager: A.excluded }, proof, root)).toBe(false);
    expect(viemVerifyRaw({ ...base, cycleId: base.cycleId + 1n }, proof, root)).toBe(false);
    expect(viemVerifyRaw({ ...base, wallet: A.w3 }, proof, root)).toBe(false);
    expect(viemVerifyRaw({ ...base, asset: A.asset8 }, proof, root)).toBe(false);
    expect(viemVerifyRaw({ ...base, amount: base.amount + 1n }, proof, root)).toBe(false);
  });

  it("returns an empty result for an unknown wallet (req 30)", () => {
    const result = buildMerkle(cycle, entitlements);
    expect(walletClaims(result, A.w3)).toEqual([]);
    // A known wallet, in any casing, returns its claims in deterministic asset order.
    const claims = walletClaims(result, A.w1.toUpperCase().replace("0X", "0x"));
    expect(claims.map((c) => c.entitlement.asset)).toEqual([A.asset6, A.asset18].sort());
  });

  it("refuses to build a tree with no entitlements", () => {
    expect(() => buildMerkle(cycle, [])).toThrow(/EMPTY_TREE/);
  });
});
