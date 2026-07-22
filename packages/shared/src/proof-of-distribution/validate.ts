// Normalize a raw validated fixture into the internal bigint/normalized-address model and enforce
// cross-field invariants that the structural schema cannot express.

import { normalizeAddress } from "./address.js";
import { EPOCH_SECONDS, TIER_SPECS } from "./constants.js";
import type { LockTier } from "./constants.js";
import { fail } from "./errors.js";
import type {
  AcquiredAsset,
  ConfirmedTransfer,
  CycleConfig,
  CycleFixture,
  EligibilityRecord,
  EpochStartBalance,
  ExcludedAddress,
  LockRecord,
} from "./model.js";
import { parseCycleFixture, type RawCycleFixture } from "./schemas.js";

function b(value: string): bigint {
  return BigInt(value);
}

function normalizeCycle(raw: RawCycleFixture["cycle"]): CycleConfig {
  const cycle: CycleConfig = {
    schemaVersion: raw.schemaVersion,
    cycleId: b(raw.cycleId),
    chainId: b(raw.chainId),
    bpsTokenAddress: normalizeAddress(raw.bpsTokenAddress, "cycle.bpsTokenAddress"),
    claimManagerAddress: normalizeAddress(raw.claimManagerAddress, "cycle.claimManagerAddress"),
    economicsVersion: raw.economicsVersion,
    rewardPolicyVersion: raw.rewardPolicyVersion,
    epochId: b(raw.epochId),
    epochStart: b(raw.epochStart),
    epochEnd: b(raw.epochEnd),
    startBlock: b(raw.startBlock),
    endBlock: b(raw.endBlock),
    snapshotBlock: b(raw.snapshotBlock),
    finalizedBlock: b(raw.finalizedBlock),
    confirmationDepth: b(raw.confirmationDepth),
    claimStart: b(raw.claimStart),
    claimDeadline: b(raw.claimDeadline),
    termsVersion: raw.termsVersion,
    eligibilityPolicyVersion: raw.eligibilityPolicyVersion,
    restrictedJurisdictionPolicyVersion: raw.restrictedJurisdictionPolicyVersion,
  };

  // Epoch boundary consistency: exact 15-minute UTC epoch aligned to epochId.
  if (cycle.epochStart !== cycle.epochId * EPOCH_SECONDS) {
    fail("EPOCH_BOUNDARY", "cycle.epochStart must equal epochId * 900");
  }
  if (cycle.epochEnd !== cycle.epochStart + EPOCH_SECONDS) {
    fail("EPOCH_BOUNDARY", "cycle.epochEnd must equal epochStart + 900");
  }

  // Block ordering. Snapshot must not be later than finalized.
  if (cycle.startBlock > cycle.endBlock) {
    fail("BLOCK_ORDER", "cycle.startBlock must be <= endBlock");
  }
  if (cycle.snapshotBlock < cycle.startBlock || cycle.snapshotBlock > cycle.endBlock) {
    fail("BLOCK_ORDER", "cycle.snapshotBlock must be within [startBlock, endBlock]");
  }
  if (cycle.snapshotBlock > cycle.finalizedBlock) {
    fail("SNAPSHOT_AFTER_FINALIZED", "cycle.snapshotBlock must be <= finalizedBlock");
  }
  if (cycle.endBlock > cycle.finalizedBlock) {
    fail("BLOCK_ORDER", "cycle.endBlock must be <= finalizedBlock");
  }
  if (cycle.claimStart > cycle.claimDeadline) {
    fail("CLAIM_PERIOD", "cycle.claimStart must be <= claimDeadline");
  }
  return cycle;
}

function normalizeExclusions(raw: RawCycleFixture["excludedAddresses"]): ExcludedAddress[] {
  const seen = new Set<string>();
  return raw.map((e) => {
    const address = normalizeAddress(e.address, "excludedAddress.address");
    if (seen.has(address)) {
      fail("DUPLICATE_EXCLUSION", `excluded address appears more than once: ${address}`);
    }
    seen.add(address);
    return {
      address,
      category: e.category as ExcludedAddress["category"],
      reason: e.reason,
      policyVersion: e.policyVersion,
    };
  });
}

function normalizeEligibility(raw: RawCycleFixture["eligibility"]): EligibilityRecord[] {
  const seen = new Set<string>();
  return raw.map((r) => {
    const wallet = normalizeAddress(r.wallet, "eligibility.wallet");
    if (seen.has(wallet)) {
      fail("DUPLICATE_HOLDER", `duplicate normalized eligibility row for wallet ${wallet}`);
    }
    seen.add(wallet);
    const record: EligibilityRecord = {
      wallet,
      eligible: r.eligible,
      policyVersion: r.policyVersion,
      validFrom: b(r.validFrom),
      revoked: r.revoked,
      ...(r.expiry !== undefined ? { expiry: b(r.expiry) } : {}),
    };
    return record;
  });
}

function normalizeBalances(raw: RawCycleFixture["epochStartBalances"]): EpochStartBalance[] {
  const seen = new Set<string>();
  return raw.map((r) => {
    const wallet = normalizeAddress(r.wallet, "epochStartBalance.wallet");
    if (seen.has(wallet)) {
      fail("DUPLICATE_HOLDER", `duplicate epoch-start balance for wallet ${wallet}`);
    }
    seen.add(wallet);
    return { wallet, rawBalance: b(r.rawBalance) };
  });
}

function normalizeTransfers(
  raw: RawCycleFixture["transfers"],
  cycle: CycleConfig,
): ConfirmedTransfer[] {
  return raw.map((t) => {
    if (b(t.chainId) !== cycle.chainId) {
      fail("CHAIN_MISMATCH", `transfer chainId ${t.chainId} does not match cycle chainId`);
    }
    const timestamp = b(t.timestamp);
    if (timestamp < cycle.epochStart || timestamp > cycle.epochEnd) {
      fail(
        "TRANSFER_OUT_OF_EPOCH",
        `transfer timestamp ${t.timestamp} is outside [epochStart, epochEnd]`,
      );
    }
    return {
      chainId: b(t.chainId),
      blockNumber: b(t.blockNumber),
      blockHash: t.blockHash.toLowerCase(),
      transactionHash: t.transactionHash.toLowerCase(),
      transactionIndex: b(t.transactionIndex),
      logIndex: b(t.logIndex),
      timestamp,
      from: normalizeAddress(t.from, "transfer.from"),
      to: normalizeAddress(t.to, "transfer.to"),
      rawAmount: b(t.rawAmount),
    };
  });
}

function normalizeLocks(raw: RawCycleFixture["locks"]): LockRecord[] {
  return raw.map((l) => {
    const tier = l.tier as LockTier;
    const spec = TIER_SPECS[tier];
    if (spec === undefined) {
      fail("UNSUPPORTED_TIER", `unsupported lock tier: ${l.tier}`);
    }
    const startTimestamp = b(l.startTimestamp);
    const unlockTimestamp = b(l.unlockTimestamp);
    if (unlockTimestamp - startTimestamp !== spec.durationSeconds) {
      fail(
        "UNSUPPORTED_DURATION",
        `lock ${tier} for ${l.wallet}: (unlock - start) must equal ${spec.durationSeconds.toString()}s`,
      );
    }
    const withdrawal = l.withdrawalTimestamp !== undefined ? b(l.withdrawalTimestamp) : undefined;
    if (withdrawal !== undefined && withdrawal < startTimestamp) {
      fail("BAD_WITHDRAWAL", `lock withdrawal precedes start for ${l.wallet}`);
    }
    const record: LockRecord = {
      wallet: normalizeAddress(l.wallet, "lock.wallet"),
      rawPrincipal: b(l.rawPrincipal),
      tier,
      startTimestamp,
      unlockTimestamp,
      ...(withdrawal !== undefined ? { withdrawalTimestamp: withdrawal } : {}),
    };
    return record;
  });
}

function normalizeAssets(raw: RawCycleFixture["assets"]): AcquiredAsset[] {
  const seen = new Set<string>();
  return raw.map((a) => {
    const tokenAddress = normalizeAddress(a.tokenAddress, "asset.tokenAddress");
    if (seen.has(tokenAddress)) {
      fail("DUPLICATE_ASSET", `asset token address appears more than once: ${tokenAddress}`);
    }
    seen.add(tokenAddress);
    return {
      ticker: a.ticker,
      name: a.name,
      tokenAddress,
      decimals: a.decimals,
      acquiredRawAmount: b(a.acquiredRawAmount),
    };
  });
}

/** Structurally validate, then normalize and cross-check a cycle fixture from unknown input. */
export function loadCycleFixture(input: unknown): CycleFixture {
  const raw = parseCycleFixture(input);
  const cycle = normalizeCycle(raw.cycle);
  return {
    cycle,
    excludedAddresses: normalizeExclusions(raw.excludedAddresses),
    eligibility: normalizeEligibility(raw.eligibility),
    epochStartBalances: normalizeBalances(raw.epochStartBalances),
    transfers: normalizeTransfers(raw.transfers, cycle),
    locks: normalizeLocks(raw.locks),
    assets: normalizeAssets(raw.assets),
  };
}
