// Deterministic time-weighted average balance (TWAB) and veBPS effective-weight computation over a
// single 15-minute epoch, from confirmed transfer fixtures and mock lock records.
//
// Model (all integer arithmetic, epoch interval half-open [E0, E1), E1 = E0 + 900):
//  - Seed balances from epoch-start balances.
//  - Apply deduped transfers in canonical (block, txIndex, logIndex) order; a transfer at time t
//    is effective for [t, ...). Transfers at exactly E1 belong to the next epoch (excluded here).
//  - A lock grants its tier multiplier while start <= t < bonusEnd, where
//    bonusEnd = (withdrawal defined and withdrawal < unlock) ? withdrawal : unlock.
//  - freeBalance(t) = balance(t) - activeBonusLocked(t); it must never be negative (a wallet
//    cannot have more active-locked than it holds).
//  - unlockedTwab      = floor(sum(freeBalance * dt) / 900)
//    lockedTwabByTier  = floor(sum(activeLockedByTier * dt) / 900)
//    baseTwab          = floor(sum(balance * dt) / 900)
//    effectiveWeight   = unlockedTwab + sum_tier floor(lockedTwabByTier * multiplierBps / 10000)

import { ZERO_ADDRESS } from "./address.js";
import { EPOCH_SECONDS, SUPPORTED_LOCK_TIERS, TIER_SPECS } from "./constants.js";
import type { LockTier } from "./constants.js";
import { fail } from "./errors.js";
import type { ConfirmedTransfer, CycleConfig, EpochStartBalance, LockRecord } from "./model.js";
import { mulDivFloor } from "./numeric.js";

export interface WalletWeight {
  readonly wallet: string;
  readonly snapshotBalance: bigint;
  readonly baseTwab: bigint;
  readonly unlockedTwab: bigint;
  readonly lockedTwabByTier: Readonly<Record<LockTier, bigint>>;
  readonly effectiveWeight: bigint;
}

function zeroTierRecord(): Record<LockTier, bigint> {
  return { LOCK_7D: 0n, LOCK_14D: 0n, LOCK_21D: 0n, LOCK_30D: 0n };
}

function identity(t: ConfirmedTransfer): string {
  return `${t.chainId.toString()}|${t.transactionHash}|${t.logIndex.toString()}`;
}

function sameTransfer(a: ConfirmedTransfer, b: ConfirmedTransfer): boolean {
  return (
    a.blockNumber === b.blockNumber &&
    a.blockHash === b.blockHash &&
    a.transactionIndex === b.transactionIndex &&
    a.timestamp === b.timestamp &&
    a.from === b.from &&
    a.to === b.to &&
    a.rawAmount === b.rawAmount
  );
}

function compareCanonical(a: ConfirmedTransfer, b: ConfirmedTransfer): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  if (a.transactionIndex !== b.transactionIndex)
    return a.transactionIndex < b.transactionIndex ? -1 : 1;
  if (a.logIndex !== b.logIndex) return a.logIndex < b.logIndex ? -1 : 1;
  return 0;
}

/** Deduplicate identical logs and reject conflicting logs sharing an identity; return canonical order. */
export function canonicalizeTransfers(
  transfers: readonly ConfirmedTransfer[],
): ConfirmedTransfer[] {
  const byIdentity = new Map<string, ConfirmedTransfer>();
  for (const t of transfers) {
    const id = identity(t);
    const existing = byIdentity.get(id);
    if (existing !== undefined) {
      if (!sameTransfer(existing, t)) {
        fail("CONFLICTING_LOG", `two different logs share identity ${id}`);
      }
      continue; // identical duplicate: idempotent
    }
    byIdentity.set(id, t);
  }
  const deduped = [...byIdentity.values()].sort(compareCanonical);
  for (let i = 1; i < deduped.length; i += 1) {
    const prev = deduped[i - 1]!;
    const cur = deduped[i]!;
    if (compareCanonical(prev, cur) === 0) {
      fail("AMBIGUOUS_ORDER", "two distinct logs share the same (block, txIndex, logIndex)");
    }
    if (cur.timestamp < prev.timestamp) {
      fail("NONMONOTONIC_TIMESTAMP", "canonical transfer order has a decreasing timestamp");
    }
  }
  return deduped;
}

function activeLockedByTier(locks: readonly LockRecord[], t: bigint): Record<LockTier, bigint> {
  const out = zeroTierRecord();
  for (const l of locks) {
    const withdrawal = l.withdrawalTimestamp;
    const bonusEnd =
      withdrawal !== undefined && withdrawal < l.unlockTimestamp ? withdrawal : l.unlockTimestamp;
    if (l.startTimestamp <= t && t < bonusEnd) {
      out[l.tier] += l.rawPrincipal;
    }
  }
  return out;
}

export interface WeightComputation {
  readonly weights: ReadonlyMap<string, WalletWeight>;
  /** Deduped canonical transfers actually applied within the epoch. */
  readonly appliedTransfers: readonly ConfirmedTransfer[];
}

export function computeWeights(
  cycle: CycleConfig,
  epochStartBalances: readonly EpochStartBalance[],
  transfers: readonly ConfirmedTransfer[],
  locks: readonly LockRecord[],
): WeightComputation {
  const E0 = cycle.epochStart;
  const E1 = cycle.epochEnd;

  const deduped = canonicalizeTransfers(transfers);
  const inEpoch = deduped.filter((t) => t.timestamp < E1); // [E0, E1)

  const balances = new Map<string, bigint>();
  const relevant = new Set<string>();
  for (const b of epochStartBalances) {
    balances.set(b.wallet, b.rawBalance);
    relevant.add(b.wallet);
  }
  for (const t of inEpoch) {
    if (t.from !== ZERO_ADDRESS) relevant.add(t.from);
    if (t.to !== ZERO_ADDRESS) relevant.add(t.to);
  }
  const locksByWallet = new Map<string, LockRecord[]>();
  for (const l of locks) {
    relevant.add(l.wallet);
    const list = locksByWallet.get(l.wallet) ?? [];
    list.push(l);
    locksByWallet.set(l.wallet, list);
  }

  // Breakpoints where the integrand can change: E0, in-epoch transfer times, and lock boundaries.
  const times = new Set<bigint>();
  times.add(E0);
  for (const t of inEpoch) times.add(t.timestamp);
  for (const l of locks) {
    const withdrawal = l.withdrawalTimestamp;
    const bonusEnd =
      withdrawal !== undefined && withdrawal < l.unlockTimestamp ? withdrawal : l.unlockTimestamp;
    for (const tt of [l.startTimestamp, l.unlockTimestamp, bonusEnd]) {
      if (tt > E0 && tt < E1) times.add(tt);
    }
    if (withdrawal !== undefined && withdrawal > E0 && withdrawal < E1) times.add(withdrawal);
  }
  const sortedTimes = [...times].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  sortedTimes.push(E1); // terminal boundary

  const baseSeconds = new Map<string, bigint>();
  const unlockedSeconds = new Map<string, bigint>();
  const lockedSeconds = new Map<string, Record<LockTier, bigint>>();
  const bump = (m: Map<string, bigint>, w: string, v: bigint): void => {
    if (v !== 0n) m.set(w, (m.get(w) ?? 0n) + v);
  };

  const applyTransfer = (tr: ConfirmedTransfer): void => {
    if (tr.from !== ZERO_ADDRESS) {
      const cur = balances.get(tr.from) ?? 0n;
      const next = cur - tr.rawAmount;
      if (next < 0n) {
        fail("NEGATIVE_BALANCE", `transfer would drive ${tr.from} negative (log ${identity(tr)})`);
      }
      balances.set(tr.from, next);
    }
    if (tr.to !== ZERO_ADDRESS) {
      balances.set(tr.to, (balances.get(tr.to) ?? 0n) + tr.rawAmount);
    }
  };

  let cursor = 0;
  for (let k = 0; k < sortedTimes.length - 1; k += 1) {
    const tCur = sortedTimes[k]!;
    const tNext = sortedTimes[k + 1]!;
    while (cursor < inEpoch.length && inEpoch[cursor]!.timestamp === tCur) {
      applyTransfer(inEpoch[cursor]!);
      cursor += 1;
    }
    const dur = tNext - tCur;
    if (dur <= 0n) continue;
    for (const w of relevant) {
      const bal = balances.get(w) ?? 0n;
      const active = activeLockedByTier(locksByWallet.get(w) ?? [], tCur);
      let activeTotal = 0n;
      for (const tier of SUPPORTED_LOCK_TIERS) activeTotal += active[tier];
      const free = bal - activeTotal;
      if (free < 0n) {
        fail("LOCK_EXCEEDS_BALANCE", `wallet ${w} has more active-locked than its balance`);
      }
      bump(baseSeconds, w, bal * dur);
      bump(unlockedSeconds, w, free * dur);
      for (const tier of SUPPORTED_LOCK_TIERS) {
        if (active[tier] !== 0n) {
          const rec = lockedSeconds.get(w) ?? zeroTierRecord();
          rec[tier] += active[tier] * dur;
          lockedSeconds.set(w, rec);
        }
      }
    }
  }

  const weights = new Map<string, WalletWeight>();
  for (const w of relevant) {
    const lockedSec = lockedSeconds.get(w) ?? zeroTierRecord();
    const lockedTwabByTier = zeroTierRecord();
    let effectiveWeight = unlockedSeconds.has(w) ? unlockedSeconds.get(w)! / EPOCH_SECONDS : 0n;
    const unlockedTwab = effectiveWeight;
    for (const tier of SUPPORTED_LOCK_TIERS) {
      const twab = lockedSec[tier] / EPOCH_SECONDS;
      lockedTwabByTier[tier] = twab;
      effectiveWeight += mulDivFloor(twab, TIER_SPECS[tier].multiplierBps, 10_000n);
    }
    weights.set(w, {
      wallet: w,
      snapshotBalance: balances.get(w) ?? 0n,
      baseTwab: (baseSeconds.get(w) ?? 0n) / EPOCH_SECONDS,
      unlockedTwab,
      lockedTwabByTier,
      effectiveWeight,
    });
  }

  return { weights, appliedTransfers: inEpoch };
}
