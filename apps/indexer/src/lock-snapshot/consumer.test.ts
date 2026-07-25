// TASK 10G-1 — Proof-of-Distribution consumer-boundary tests (LOCAL_TEST_ONLY fixture data).
import { describe, expect, it } from "vitest";
import { aggregateView, lookupParticipant } from "./consumer.js";
import { runSnapshotPipeline } from "./pipeline.js";
import { FixtureReader } from "./test-fixture.js";
import { baseConfig, baseRequest } from "./test-scenario.js";

describe("PoD consumer boundary (LOCAL_TEST_ONLY)", () => {
  it("an included participant retrieves exactly their entitlement and a verifying proof", async () => {
    const r = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    const view = lookupParticipant(
      r.proofBundle,
      "0x0000000000000000000000000000000000000A11", // mixed case on purpose
    );
    expect(view).not.toBeNull();
    expect(view!.entitlement).toBe(r.snapshot.entitlements[0]!.entitlement);
    expect(view!.verified).toBe(true);
    expect(view!.merkleRoot).toBe(r.snapshot.merkleRoot);
    expect(view!.classification).toContain("LEGAL ELIGIBILITY UNVERIFIED");
  });

  it("a missing participant gets null — never a fabricated entitlement", async () => {
    const r = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    expect(
      lookupParticipant(r.proofBundle, "0x00000000000000000000000000000000000000ff"),
    ).toBeNull();
    // the zero-weight-excluded account is also absent
    expect(
      lookupParticipant(r.proofBundle, "0x0000000000000000000000000000000000000c33"),
    ).toBeNull();
  });

  it("aggregates come from the canonical artifact and match it exactly", async () => {
    const r = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    const agg = aggregateView(r.snapshot);
    expect(agg.merkleRoot).toBe(r.snapshot.merkleRoot);
    expect(agg.snapshotBlock).toBe(r.snapshot.snapshotBlock);
    expect(agg.distributionAmount).toBe(r.snapshot.distributionAmount);
    expect(agg.entitlementTotal).toBe(r.snapshot.entitlementTotal);
    expect(agg.dust).toBe(r.snapshot.dust);
    expect(BigInt(agg.entitlementTotal) + BigInt(agg.dust)).toBe(BigInt(agg.distributionAmount));
  });

  it("legal-eligibility and publication status are never overstated", async () => {
    const r = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    const agg = aggregateView(r.snapshot);
    expect(agg.classification).toBe(
      "TECHNICAL CANDIDATE SNAPSHOT — LEGAL ELIGIBILITY UNVERIFIED — NOT AUTHORIZED FOR PUBLICATION",
    );
    expect(agg.publicationStatus).toBe("NOT PUBLISHED — NOT AUTHORIZED");
  });
});
