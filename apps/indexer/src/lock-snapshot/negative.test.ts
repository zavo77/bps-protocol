// TASK 10G-1 — required negative/boundary coverage (LOCAL_TEST_ONLY fixture data).
// Each test name maps one-to-one to a required condition in the coverage map.
import { describe, expect, it } from "vitest";
import { keccakOfCanonical, viemVerifyRaw } from "@bps/shared";
import { enumerateCandidates } from "./enumeration.js";
import { runSnapshotPipeline, validateRequestShape } from "./pipeline.js";
import { FixtureReader, type FixtureConfig } from "./test-fixture.js";
import { baseConfig, baseRequest } from "./test-scenario.js";

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toThrowError(new RegExp(`^${code}:`));
}

describe("fail-closed negatives (LOCAL_TEST_ONLY)", () => {
  it("wrong chain id -> CHAIN_ID_MISMATCH", async () => {
    await expectCode(
      runSnapshotPipeline(new FixtureReader({ ...baseConfig(), chainId: 1n }), baseRequest()),
      "CHAIN_ID_MISMATCH",
    );
  });

  it("wrong block hash -> BLOCK_HASH_MISMATCH (reorg protection)", async () => {
    await expectCode(
      runSnapshotPipeline(
        new FixtureReader({ ...baseConfig(), blockHash: `0x${"cd".repeat(32)}` }),
        baseRequest(),
      ),
      "BLOCK_HASH_MISMATCH",
    );
  });

  it("nonexistent snapshot block -> BLOCK_NOT_FOUND (and `latest` is unrepresentable)", async () => {
    // The request type has no `latest` concept: snapshotBlock is a required bigint, so an
    // omitted/`latest` pin cannot be expressed. A block the reader does not know fails closed.
    await expectCode(
      runSnapshotPipeline(new FixtureReader(baseConfig()), {
        ...baseRequest(),
        snapshotBlock: 555n,
      }),
      "BLOCK_NOT_FOUND",
    );
  });

  it("snapshot before vault deployment -> VAULT_NOT_DEPLOYED", async () => {
    const cfg = { ...baseConfig(), vaultDeployBlock: 5_000n };
    await expectCode(
      runSnapshotPipeline(new FixtureReader(cfg), baseRequest()),
      "VAULT_NOT_DEPLOYED",
    );
  });

  it("indexer behind the requested block -> INDEXER_BEHIND", async () => {
    await expectCode(
      runSnapshotPipeline(
        new FixtureReader({ ...baseConfig(), syncedThrough: 999n }),
        baseRequest(),
      ),
      "INDEXER_BEHIND",
    );
  });

  it("incomplete indexer history (start after deployment) -> INCOMPLETE_COVERAGE", async () => {
    const cfg = { ...baseConfig(), vaultDeployBlock: 50n }; // vault live before start block 100
    await expectCode(
      runSnapshotPipeline(new FixtureReader(cfg), baseRequest()),
      "INCOMPLETE_COVERAGE",
    );
  });

  it("unsupported locking-vault address (no code at pin) -> VAULT_NOT_DEPLOYED", async () => {
    const cfg = { ...baseConfig(), vaultDeployBlock: 10_000n, snapshotBlock: 1_000n };
    await expectCode(
      runSnapshotPipeline(new FixtureReader(cfg), baseRequest()),
      "VAULT_NOT_DEPLOYED",
    );
  });

  it("malformed address in event history -> MALFORMED_ACCOUNT", () => {
    expect(() =>
      enumerateCandidates(
        [{ account: "0xnot-an-address", lockId: 0n, blockNumber: 1n, logIndex: 0 }],
        10n,
      ),
    ).toThrowError(/MALFORMED_ACCOUNT/);
  });

  it("duplicate participant records cannot create duplicate entitlement", async () => {
    const cfg = baseConfig();
    const dup: FixtureConfig = {
      ...cfg,
      locks: [...cfg.locks, { ...cfg.locks[0]! }], // same account+lock appears twice in history
    };
    const r1 = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    const r2 = await runSnapshotPipeline(new FixtureReader(dup), baseRequest());
    expect(r2.snapshot.entitlementTotal).toBe(r1.snapshot.entitlementTotal);
    expect(r2.snapshot.includedParticipantCount).toBe(r1.snapshot.includedParticipantCount);
  });

  it("zero effective weight is excluded, not entitled", async () => {
    const r = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    expect(r.snapshot.zeroWeightExcludedCount).toBe(1);
    expect(
      r.snapshot.entitlements.some(
        (e) => e.address === "0x0000000000000000000000000000000000000c33",
      ),
    ).toBe(false);
  });

  it("lock created after the snapshot block is excluded from enumeration", async () => {
    const r = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    expect(
      r.snapshot.participants.some(
        (p) => p.address === "0x0000000000000000000000000000000000000d44",
      ),
    ).toBe(false);
  });

  it("withdrawal before the snapshot yields zero weight; withdrawal after keeps weight", async () => {
    // before: account C (withdrawnAtBlock 900 < pin 1000, fixture weight 0) — excluded (asserted
    // above). after: give C a post-pin withdrawal and a live weight — it must be included.
    const cfg = baseConfig();
    const after: FixtureConfig = {
      ...cfg,
      locks: cfg.locks.map((l) =>
        l.account === "0x0000000000000000000000000000000000000c33"
          ? { ...l, weightAtSnapshot: 777_000n, withdrawnAtBlock: 1_200n }
          : l,
      ),
    };
    const r = await runSnapshotPipeline(new FixtureReader(after), baseRequest());
    const c = r.snapshot.participants.find(
      (p) => p.address === "0x0000000000000000000000000000000000000c33",
    );
    expect(c?.effectiveWeight).toBe("777000");
  });

  it("zero distribution amount -> ZERO_DISTRIBUTION", () => {
    expect(() => validateRequestShape({ ...baseRequest(), distributionAmount: 0n })).toThrowError(
      /ZERO_DISTRIBUTION/,
    );
  });

  it("dust-heavy distribution where every entitlement floors to zero -> DUST_ONLY_DISTRIBUTION", async () => {
    await expectCode(
      runSnapshotPipeline(new FixtureReader(baseConfig()), {
        ...baseRequest(),
        distributionAmount: 1n, // < participant count with these weights
      }),
      "DUST_ONLY_DISTRIBUTION",
    );
  });

  it("unsafe-number conversion is rejected by canonical serialization", () => {
    expect(() => keccakOfCanonical({ x: 1.5 })).toThrowError(/integer/);
    expect(() => keccakOfCanonical({ x: 10n as unknown as number })).toThrowError(/bigint/);
  });

  it("wrong cycle / wrong claimant / wrong amount / tampered leaf / foreign proof all fail verification", async () => {
    const r = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    const p0 = r.proofBundle.participants[0]!;
    const base = {
      chainId: 4663n,
      claimManager: r.proofBundle.claimManager,
      cycleId: BigInt(r.proofBundle.cycleId),
      wallet: p0.address,
      asset: r.proofBundle.distributionAsset,
      amount: BigInt(p0.entitlement),
    };
    const root = r.proofBundle.merkleRoot as `0x${string}`;
    const proof = p0.proof as readonly `0x${string}`[];
    expect(viemVerifyRaw(base, proof, root)).toBe(true);
    expect(viemVerifyRaw({ ...base, cycleId: base.cycleId + 1n }, proof, root)).toBe(false);
    expect(
      viemVerifyRaw({ ...base, wallet: "0x00000000000000000000000000000000000000ee" }, proof, root),
    ).toBe(false);
    expect(viemVerifyRaw({ ...base, amount: base.amount + 1n }, proof, root)).toBe(false);
    const foreign = r.proofBundle.participants[1]!.proof as readonly `0x${string}`[];
    expect(viemVerifyRaw(base, foreign, root)).toBe(false);
    expect(viemVerifyRaw(base, proof, `0x${"11".repeat(32)}` as `0x${string}`)).toBe(false);
  });

  it("corrupted artifact digest is detected", async () => {
    const r = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    const recomputed = keccakOfCanonical(r.snapshot as unknown as Record<string, unknown>);
    expect(recomputed).toBe(r.canonicalSnapshotDigest);
    const tampered = { ...r.snapshot, dust: (BigInt(r.snapshot.dust) + 1n).toString() };
    expect(keccakOfCanonical(tampered as unknown as Record<string, unknown>)).not.toBe(
      r.canonicalSnapshotDigest,
    );
  });

  it("placeholder hashes are absent: publication hashes ARE the canonical digests", async () => {
    const r = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    const args = r.unsignedPublication.decodedArguments;
    expect(args.allocationsContentHash).toBe(r.canonicalSnapshotDigest);
    expect(args.manifestEnvelopeHash).toBe(r.proofBundleDigest);
    expect(keccakOfCanonical({ placeholder: "alloc" })).not.toBe(r.canonicalSnapshotDigest);
  });

  it("legally unverified snapshot cannot be classified publishable", async () => {
    const r = await runSnapshotPipeline(new FixtureReader(baseConfig()), baseRequest());
    expect(r.snapshot.classification).toBe(
      "TECHNICAL CANDIDATE SNAPSHOT — LEGAL ELIGIBILITY UNVERIFIED — NOT AUTHORIZED FOR PUBLICATION",
    );
    expect(r.unsignedPublication.classification).toContain("NOT AUTHORIZED FOR PUBLICATION");
    expect(r.unsignedPublication.classification).toContain("UNSIGNED_DO_NOT_BROADCAST");
  });
});
