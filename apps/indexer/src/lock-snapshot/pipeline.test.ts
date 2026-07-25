// TASK 10G-1 — pipeline positive-path + determinism tests (LOCAL_TEST_ONLY fixture data).
import { describe, expect, it } from "vitest";
import { canonicalStringify } from "@bps/shared";
import { runSnapshotPipeline } from "./pipeline.js";
import { FixtureReader, type FixtureConfig } from "./test-fixture.js";
import { baseConfig, baseRequest } from "./test-scenario.js";

describe("snapshot pipeline (LOCAL_TEST_ONLY)", () => {
  it("produces exact weights, entitlements, dust, and verified proofs", async () => {
    const result = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    const s = result.snapshot;
    // candidates: A, B, C discovered; D excluded (post-snapshot); C zero-weight-excluded
    expect(s.candidateCount).toBe(3);
    expect(s.zeroWeightExcludedCount).toBe(1);
    expect(s.includedParticipantCount).toBe(2);
    const totalW = 1_100_000n + 2_500_000n + 5_000_000n;
    expect(s.totalEffectiveWeight).toBe(totalW.toString());
    // approved floor rule
    const eA = (1_000_000_000n * 3_600_000n) / totalW;
    const eB = (1_000_000_000n * 5_000_000n) / totalW;
    expect(s.entitlements.map((e) => e.entitlement)).toEqual([eA.toString(), eB.toString()]);
    expect(BigInt(s.entitlementTotal)).toBe(eA + eB);
    expect(BigInt(s.entitlementTotal) + BigInt(s.dust)).toBe(1_000_000_000n);
    expect(BigInt(s.entitlementTotal) <= 1_000_000_000n).toBe(true);
    // every proof self-verified in-pipeline AND fixture leaf parity checked
    expect(result.onchainLeafParity).toEqual({ checked: 2, matched: 2 });
    // unsigned payload safety
    expect(result.unsignedPublication.classification).toContain("UNSIGNED_DO_NOT_BROADCAST");
    expect(result.unsignedPublication.encodedCalldata.startsWith("0x")).toBe(true);
    expect(s.classification).toContain("LEGAL ELIGIBILITY UNVERIFIED");
  });

  it("is byte-identical across reruns with identical inputs (deterministic core)", async () => {
    const r1 = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    const r2 = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    expect(canonicalStringify(r1.snapshot)).toBe(canonicalStringify(r2.snapshot));
    expect(canonicalStringify(r1.proofBundle)).toBe(canonicalStringify(r2.proofBundle));
    expect(r1.canonicalSnapshotDigest).toBe(r2.canonicalSnapshotDigest);
    expect(r1.proofBundleDigest).toBe(r2.proofBundleDigest);
    expect(r1.snapshot.merkleRoot).toBe(r2.snapshot.merkleRoot);
  });

  it("reordered/mixed-case event input produces the same canonical result", async () => {
    const cfg = baseConfig();
    const shuffled: FixtureConfig = {
      ...cfg,
      locks: [...cfg.locks].reverse().map((l) => ({
        ...l,
        account: l.account.toUpperCase().replace("0X", "0x"),
      })),
    };
    const r1 = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    const r2 = await runSnapshotPipeline(new FixtureReader(shuffled), baseRequest());
    expect(r2.snapshot.merkleRoot).toBe(r1.snapshot.merkleRoot);
    expect(r2.snapshot.participants).toEqual(r1.snapshot.participants);
    // NOTE: inputDigests bind the raw record stream, so only the pure-output equality is asserted.
    expect(r2.snapshot.entitlements).toEqual(r1.snapshot.entitlements);
  });

  it("handles overflow-scale integers without unsafe number conversion", async () => {
    const cfg = baseConfig();
    const big = 10n ** 30n;
    const cfg2: FixtureConfig = {
      ...cfg,
      locks: cfg.locks.map((l) =>
        l.weightAtSnapshot > 0n ? { ...l, weightAtSnapshot: l.weightAtSnapshot * big } : l,
      ),
    };
    const req = { ...baseRequest(), distributionAmount: 2n ** 200n };
    const r = await runSnapshotPipeline(new FixtureReader(cfg2), req);
    expect(BigInt(r.snapshot.entitlementTotal) + BigInt(r.snapshot.dust)).toBe(2n ** 200n);
  });
});
