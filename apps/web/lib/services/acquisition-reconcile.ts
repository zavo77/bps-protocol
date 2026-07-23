// Authoritative acquisition ↔ cycle reconciliation (Task 9A §B). Events provide HISTORY; the CURRENT
// authoritative linkage comes from contract reads: `cycleUsed(cycleId)`, `cycleAcquisitionId(cycleId)` and
// `acquisitions(id)` on the frozen DistributionFundingCoordinator. This service reads those, compares them
// against the event-derived expectation, and fails closed on any inconsistency or read error so the caller
// can mark the affected transparency/acquisition result INVALID rather than trust stale event data.
import type { Address, PublicClient } from "viem";
import {
  ReadFailedError,
  readAcquisition,
  readCycleAcquisitionId,
  readCycleUsed,
  type AcquisitionRecord,
} from "./reads";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const STATUS_FUNDED = 2; // AcquisitionStatus.FUNDED

export type AcquisitionLinkageStatus =
  | "authoritative-confirmed" // reads present and consistent with events
  | "cycle-unused" // authoritative: this cycle consumed no acquisition (a valid state)
  | "cycle-acquisition-mismatch" // cycleAcquisitionId() disagrees with the event acquisition id
  | "acquisition-missing" // cycle used but no bound/initialised acquisition record
  | "acquisition-cycle-mismatch" // acquisitions(id).cycleId disagrees with the queried cycle
  | "funding-record-mismatch" // authoritative funding amounts disagree with the event record
  | "read-failed"; // RPC failure or malformed read

export interface EventAcquisitionExpectation {
  readonly acquisitionId: bigint;
  readonly wethSpent?: bigint;
  readonly distributionAmount?: bigint;
  readonly reserveAmount?: bigint;
  readonly acquiredStock?: bigint;
}

export interface AcquisitionReconciliation {
  readonly cycleId: bigint;
  readonly expectedAcquisitionId: bigint | null;
  readonly onchainAcquisitionId: bigint | null;
  readonly record: AcquisitionRecord | null; // authoritative acquisitions()
  readonly status: AcquisitionLinkageStatus;
  readonly ok: boolean; // true only when authoritative reads confirm the linkage (or cleanly unused)
  readonly detail?: string;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isEmptyRecord(r: AcquisitionRecord): boolean {
  return (
    r.stockToken.toLowerCase() === ZERO_ADDR &&
    r.cycleId === 0n &&
    r.distributionAmount === 0n &&
    r.acquiredStock === 0n
  );
}

/**
 * Reconcile a cycle's acquisition linkage against authoritative contract reads. `expected` is the
 * event-derived expectation (the acquisition id events attribute to this cycle, plus optional funding
 * amounts). Returns `ok: true` only when the authoritative reads confirm the linkage — a cleanly unused
 * cycle is `ok` only when events do not also claim an acquisition for it.
 */
export async function reconcileCycleAcquisition(
  client: PublicClient,
  coordinator: Address,
  cycleId: bigint,
  expected?: EventAcquisitionExpectation,
): Promise<AcquisitionReconciliation> {
  const base = {
    cycleId,
    expectedAcquisitionId: expected?.acquisitionId ?? null,
    onchainAcquisitionId: null as bigint | null,
    record: null as AcquisitionRecord | null,
  };

  let used: boolean;
  try {
    used = await readCycleUsed(client, coordinator, cycleId);
  } catch (e) {
    return { ...base, status: "read-failed", ok: false, detail: `cycleUsed: ${msg(e)}` };
  }

  if (!used) {
    // Authoritative: no acquisition for this cycle. If events reference one, that is an inconsistency.
    if (expected) {
      return {
        ...base,
        status: "cycle-acquisition-mismatch",
        ok: false,
        detail: `events reference acquisition ${expected.acquisitionId} but the cycle is unused on-chain`,
      };
    }
    return { ...base, status: "cycle-unused", ok: true };
  }

  let onchainId: bigint;
  try {
    onchainId = await readCycleAcquisitionId(client, coordinator, cycleId);
  } catch (e) {
    return { ...base, status: "read-failed", ok: false, detail: `cycleAcquisitionId: ${msg(e)}` };
  }
  const withId = { ...base, onchainAcquisitionId: onchainId };

  if (onchainId === 0n) {
    return {
      ...withId,
      status: "acquisition-missing",
      ok: false,
      detail: "cycle used but no acquisition id bound",
    };
  }
  if (expected && expected.acquisitionId !== onchainId) {
    return {
      ...withId,
      status: "cycle-acquisition-mismatch",
      ok: false,
      detail: `events=${expected.acquisitionId} chain=${onchainId}`,
    };
  }

  let record: AcquisitionRecord;
  try {
    record = await readAcquisition(client, coordinator, onchainId);
  } catch (e) {
    return { ...withId, status: "read-failed", ok: false, detail: `acquisitions: ${msg(e)}` };
  }
  const withRecord = { ...withId, record };

  if (isEmptyRecord(record) || record.status !== STATUS_FUNDED) {
    return {
      ...withRecord,
      status: "acquisition-missing",
      ok: false,
      detail: `acquisition ${onchainId} not funded (status ${record.status})`,
    };
  }
  if (record.cycleId !== cycleId) {
    return {
      ...withRecord,
      status: "acquisition-cycle-mismatch",
      ok: false,
      detail: `acquisitions(${onchainId}).cycleId=${record.cycleId} != ${cycleId}`,
    };
  }
  if (expected) {
    const disagree =
      (expected.wethSpent !== undefined && expected.wethSpent !== record.wethSpent) ||
      (expected.distributionAmount !== undefined &&
        expected.distributionAmount !== record.distributionAmount) ||
      (expected.reserveAmount !== undefined && expected.reserveAmount !== record.reserveAmount) ||
      (expected.acquiredStock !== undefined && expected.acquiredStock !== record.acquiredStock);
    if (disagree) {
      return {
        ...withRecord,
        status: "funding-record-mismatch",
        ok: false,
        detail: "authoritative funding amounts disagree with the event-derived record",
      };
    }
  }

  return { ...withRecord, status: "authoritative-confirmed", ok: true };
}

export { ReadFailedError };
