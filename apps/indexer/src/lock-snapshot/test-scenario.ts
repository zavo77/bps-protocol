// TASK 10G-1 — shared LOCAL_TEST_ONLY scenario used across pipeline/negative/consumer tests.
import type { FixtureConfig } from "./test-fixture.js";
import type { SnapshotRequest } from "./types.js";

export const VAULT = "0x00000000000000000000000000000000000000aa";
export const MANAGER = "0x00000000000000000000000000000000000000bb";
export const ASSET = "0x00000000000000000000000000000000000000cc";
export const A = "0x0000000000000000000000000000000000000a11";
export const B = "0x0000000000000000000000000000000000000b22";
export const C = "0x0000000000000000000000000000000000000c33";
export const D = "0x0000000000000000000000000000000000000d44";
export const HASH = `0x${"ab".repeat(32)}`;

export function baseConfig(): FixtureConfig {
  return {
    chainId: 4663n,
    claimManager: MANAGER,
    blockHash: HASH,
    blockTimestamp: 1_784_960_546n,
    snapshotBlock: 1_000n,
    vaultDeployBlock: 100n,
    syncedThrough: 1_500n,
    locks: [
      // A: two live locks (multiple locks per wallet)
      { account: A, lockId: 0n, createdAtBlock: 200n, weightAtSnapshot: 1_100_000n },
      { account: A, lockId: 1n, createdAtBlock: 300n, weightAtSnapshot: 2_500_000n },
      // B: one live lock; B also appears in a duplicate event record naturally via lock 0
      { account: B, lockId: 0n, createdAtBlock: 250n, weightAtSnapshot: 5_000_000n },
      // C: withdrawn before the snapshot -> zero weight at the pin (zero-weight exclusion)
      {
        account: C,
        lockId: 0n,
        createdAtBlock: 260n,
        weightAtSnapshot: 0n,
        withdrawnAtBlock: 900n,
      },
      // D: lock created AFTER the snapshot block -> excluded from enumeration entirely
      { account: D, lockId: 0n, createdAtBlock: 1_001n, weightAtSnapshot: 9_999_999n },
    ],
  };
}

export function baseRequest(): SnapshotRequest {
  return {
    chainId: 4663n,
    lockingVault: VAULT,
    claimManager: MANAGER,
    snapshotBlock: 1_000n,
    expectedBlockHash: HASH,
    enumerationStartBlock: 100n,
    distributionAsset: ASSET,
    distributionAmount: 1_000_000_000n,
    cycleId: 7n,
    claimStart: 2_000_000_000n,
    claimDeadline: 2_000_000_000n + 90n * 86_400n, // approved 90-day claim window
  };
}
