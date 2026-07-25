// TASK 10G-1 — LOCAL_TEST_ONLY deterministic ChainReader fixture.
//
// Every value here is synthetic test data for unit coverage; nothing represents observed mainnet
// state and nothing here may be mixed into evidence presented as observed mainnet state. Weight
// outputs are fixture-declared: the real time/withdrawal/expiry boundary semantics are proven at
// the contract layer (test/LockingVaultWeight.t.sol) and the production reader takes the
// contract's answer as authoritative via pinned eth_call.

import { viemLeafHashRaw } from "@bps/shared";
import type { ChainReader, LockCreatedRecord, LockWithdrawnRecord } from "./types.js";

export interface FixtureLock {
  readonly account: string;
  readonly lockId: bigint;
  readonly createdAtBlock: bigint;
  /** Fixture-declared effective weight AT the snapshot timestamp (0 = withdrawn/expired-to-zero). */
  readonly weightAtSnapshot: bigint;
  readonly withdrawnAtBlock?: bigint;
}

export interface FixtureConfig {
  chainId: bigint;
  claimManager: string;
  blockHash: string;
  blockTimestamp: bigint;
  snapshotBlock: bigint;
  vaultDeployBlock: bigint;
  syncedThrough: bigint;
  locks: readonly FixtureLock[];
}

export const LOCAL_TEST_ONLY = "LOCAL_TEST_ONLY" as const;

export class FixtureReader implements ChainReader {
  constructor(readonly cfg: FixtureConfig) {}

  chainId(): Promise<bigint> {
    return Promise.resolve(this.cfg.chainId);
  }

  block(blockNumber: bigint): Promise<{ hash: string; timestamp: bigint } | null> {
    if (blockNumber !== this.cfg.snapshotBlock) return Promise.resolve(null);
    return Promise.resolve({ hash: this.cfg.blockHash, timestamp: this.cfg.blockTimestamp });
  }

  vaultHasCodeAt(blockNumber: bigint): Promise<boolean> {
    return Promise.resolve(blockNumber >= this.cfg.vaultDeployBlock);
  }

  lockCreated(from: bigint, to: bigint): Promise<readonly LockCreatedRecord[]> {
    return Promise.resolve(
      this.cfg.locks
        .filter((l) => l.createdAtBlock >= from && l.createdAtBlock <= to)
        .map((l, i) => ({
          account: l.account,
          lockId: l.lockId,
          blockNumber: l.createdAtBlock,
          logIndex: i,
        })),
    );
  }

  lockWithdrawn(from: bigint, to: bigint): Promise<readonly LockWithdrawnRecord[]> {
    return Promise.resolve(
      this.cfg.locks
        .filter(
          (l) =>
            l.withdrawnAtBlock !== undefined &&
            l.withdrawnAtBlock >= from &&
            l.withdrawnAtBlock <= to,
        )
        .map((l, i) => ({
          account: l.account,
          lockId: l.lockId,
          blockNumber: l.withdrawnAtBlock as bigint,
          logIndex: i,
        })),
    );
  }

  lockCountAt(account: string, _blockNumber: bigint): Promise<bigint> {
    const mine = this.cfg.locks.filter(
      (l) =>
        l.account.toLowerCase() === account.toLowerCase() &&
        l.createdAtBlock <= this.cfg.snapshotBlock,
    );
    const max = mine.reduce((m, l) => (l.lockId > m ? l.lockId : m), -1n);
    return Promise.resolve(max + 1n);
  }

  positionWeightAt(
    account: string,
    lockId: bigint,
    _timestamp: bigint,
    _blockNumber: bigint,
  ): Promise<bigint> {
    const lock = this.cfg.locks.find(
      (l) => l.account.toLowerCase() === account.toLowerCase() && l.lockId === lockId,
    );
    if (lock === undefined || lock.createdAtBlock > this.cfg.snapshotBlock) {
      return Promise.resolve(0n);
    }
    return Promise.resolve(lock.weightAtSnapshot);
  }

  leafFor(
    cycleId: bigint,
    claimant: string,
    asset: string,
    amount: bigint,
    _blockNumber: bigint,
  ): Promise<string> {
    // Fixture parity source: the independently implemented viem leaf hash, which is pinned to the
    // Solidity implementation by the audited LeafVector vector (parity.test.ts).
    return Promise.resolve(
      viemLeafHashRaw({
        chainId: this.cfg.chainId,
        claimManager: this.cfg.claimManager,
        cycleId,
        wallet: claimant,
        asset,
        amount,
      }),
    );
  }

  syncedThrough(): Promise<bigint> {
    return Promise.resolve(this.cfg.syncedThrough);
  }
}
