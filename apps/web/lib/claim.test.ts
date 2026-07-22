import { describe, expect, it } from "vitest";
import { concatHex, keccak256, type Address, type Hex } from "viem";
import { LOCAL_DEMO_MANIFEST } from "./fixtures";
import { enableWrites, resolveDeployment } from "./manifest";
import {
  computeLeaf,
  foldProof,
  planClaim,
  verifyClaim,
  type Entitlement,
  type OnchainCycle,
} from "./claim";

const MANAGER = "0x000000000000000000000000000000000000c1a1" as Address;
const ASSET = "0x000000000000000000000000000000000000aab1" as Address;
const ALICE = "0x000000000000000000000000000000000000a11c" as Address;
const BOB = "0x000000000000000000000000000000000000b0b0" as Address;

function pair(a: Hex, b: Hex): Hex {
  return BigInt(a) < BigInt(b) ? keccak256(concatHex([a, b])) : keccak256(concatHex([b, a]));
}

// Build a 2-leaf tree for Alice (1600) and Bob (800) on cycle 42.
const leafA = computeLeaf({
  chainId: 4663,
  claimManager: MANAGER,
  cycleId: 42n,
  claimant: ALICE,
  asset: ASSET,
  amount: 1600n,
});
const leafB = computeLeaf({
  chainId: 4663,
  claimManager: MANAGER,
  cycleId: 42n,
  claimant: BOB,
  asset: ASSET,
  amount: 800n,
});
const ROOT = pair(leafA, leafB);

const aliceEntitlement: Entitlement = {
  cycleId: 42n,
  claimManager: MANAGER,
  asset: ASSET,
  assetSymbol: "AAPL",
  claimant: ALICE,
  amount: 1600n,
  proof: [leafB],
  root: ROOT,
};

const cycle: OnchainCycle = {
  cycleId: 42n,
  root: ROOT,
  asset: ASSET,
  remaining: 1600n,
  claimStartSec: 100n,
  claimDeadlineSec: 1000n,
};

const ctx = { chainId: 4663, nowSec: 500n, alreadyClaimed: false };

describe("claim proof verification (§E)", () => {
  it("valid proof recomputes the on-chain root", () => {
    expect(foldProof(leafA, [leafB])).toBe(ROOT);
    const v = verifyClaim(aliceEntitlement, cycle, ctx);
    expect(v.ok).toBe(true);
  });

  it("rejects an invalid proof (wrong sibling)", () => {
    const bad = { ...aliceEntitlement, proof: [leafA] as Hex[] };
    expect(verifyClaim(bad, cycle, ctx)).toEqual({ ok: false, reason: "proof-invalid" });
  });

  it("rejects cycle / asset / root / amount mismatches", () => {
    expect(verifyClaim({ ...aliceEntitlement, cycleId: 7n }, cycle, ctx).ok).toBe(false);
    expect(verifyClaim({ ...aliceEntitlement, asset: BOB }, cycle, ctx)).toEqual({
      ok: false,
      reason: "asset-mismatch",
    });
    expect(verifyClaim(aliceEntitlement, { ...cycle, root: leafB }, ctx)).toEqual({
      ok: false,
      reason: "root-mismatch",
    });
    expect(verifyClaim(aliceEntitlement, { ...cycle, remaining: 100n }, ctx)).toEqual({
      ok: false,
      reason: "amount-exceeds-remaining",
    });
  });

  it("rejects outside the claim window", () => {
    expect(verifyClaim(aliceEntitlement, cycle, { ...ctx, nowSec: 50n }).ok).toBe(false);
    expect(verifyClaim(aliceEntitlement, cycle, { ...ctx, nowSec: 2000n }).ok).toBe(false);
  });

  it("blocks duplicate claims in the UI (contract also enforces)", () => {
    expect(verifyClaim(aliceEntitlement, cycle, { ...ctx, alreadyClaimed: true })).toEqual({
      ok: false,
      reason: "already-claimed",
    });
  });

  it("planClaim gates canSubmit on writes + eligibility + verdict", () => {
    const s = resolveDeployment({ ...LOCAL_DEMO_MANIFEST, isFixture: false, sourceCommit: "abc" });
    if (s.status !== "live") throw new Error();
    const dep = enableWrites(
      s,
      Object.fromEntries(s.requiredCodeAddresses.map((a) => [a.toLowerCase(), true])),
    );
    if (dep.status !== "live") throw new Error();
    // manager address in the demo manifest differs from MANAGER, so proof recompute uses the manifest
    // chain id but the entitlement's own claimManager — the plan still targets the manifest manager.
    const plan = planClaim(aliceEntitlement, cycle, dep, {
      nowSec: 500n,
      alreadyClaimed: false,
      eligible: true,
    });
    expect(plan.target.toLowerCase()).toBe(dep.addresses.claimManager.toLowerCase());
    expect(plan.canSubmit).toBe(plan.verdict.ok); // eligible + writable, so gated purely on the verdict
    expect(
      planClaim(aliceEntitlement, cycle, dep, {
        nowSec: 500n,
        alreadyClaimed: false,
        eligible: false,
      }).canSubmit,
    ).toBe(false);
  });
});
