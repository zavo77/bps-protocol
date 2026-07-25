// TASK 10G-1 — pure candidate enumeration from locking-vault event history.
//
// Event history is used ONLY for candidate discovery (which wallets could possibly hold weight);
// it is never treated as authoritative for time-dependent effective weight. Authoritative weight
// comes from block-pinned contract reads (BPSLockingVault.positionWeightAt at the snapshot block),
// which the frozen contract makes deterministic for any timestamp. LockCreated is sufficient for
// completeness: the frozen vault has no transfer/merge/extension mechanic, so every wallet with
// any position appears in at least one LockCreated. Withdrawals reduce weight but are reflected in
// the pinned contract reads, not inferred from events.

import { isHexAddress, normalizeAddress } from "@bps/shared";
import type { LockCreatedRecord } from "./types.js";
import { SnapshotPipelineError } from "./types.js";

export interface EnumerationResult {
  /** Sorted (lexicographic, checksummed) unique candidate addresses at or before the pin. */
  readonly candidates: readonly string[];
  /** Records excluded because they occur after the snapshot block. */
  readonly excludedAfterSnapshot: number;
  /** Raw record count consumed (duplicates across events are expected and deduplicated). */
  readonly recordsSeen: number;
}

/**
 * Deduplicate + validate + pin-filter candidate wallets.
 * Fails closed on malformed addresses or corrupt record shapes.
 */
export function enumerateCandidates(
  records: readonly LockCreatedRecord[],
  snapshotBlock: bigint,
): EnumerationResult {
  const unique = new Map<string, true>();
  let excludedAfterSnapshot = 0;
  for (const [i, r] of records.entries()) {
    if (typeof r.account !== "string" || !isHexAddress(r.account)) {
      throw new SnapshotPipelineError(
        "MALFORMED_ACCOUNT",
        `record ${i} has a malformed account: ${String(r.account)}`,
      );
    }
    if (r.blockNumber < 0n || r.lockId < 0n) {
      throw new SnapshotPipelineError("MALFORMED_RECORD", `record ${i} has negative fields`);
    }
    if (r.blockNumber > snapshotBlock) {
      excludedAfterSnapshot += 1;
      continue; // events after the pinned snapshot block must not influence the snapshot
    }
    unique.set(normalizeAddress(r.account), true);
  }
  const candidates = [...unique.keys()].sort((a, b) =>
    a.toLowerCase() < b.toLowerCase() ? -1 : 1,
  );
  return { candidates, excludedAfterSnapshot, recordsSeen: records.length };
}
