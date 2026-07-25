// TASK 10H-1 — read-only consumer status classification for the Rialto boundary.
//
// A consumer must be able to distinguish the exact progress of the acquisition boundary without any
// state being overstated. MAINNET_SETTLEMENT_CONFIRMED is constructible ONLY from a full on-chain
// receipt proof — which nothing in TASK 10H-1 can produce — and even then carries no legal claim.

export type RialtoBoundaryStatus =
  | "QUOTE_NOT_OBSERVED"
  | "QUOTE_OBSERVED"
  | "QUOTE_STRUCTURALLY_VALID"
  | "PRICE_GUARD_PASSED"
  | "SETTLEMENT_NOT_EXECUTED"
  | "SETTLEMENT_EXECUTED_LOCAL_FORK_ONLY"
  | "MAINNET_SETTLEMENT_CONFIRMED";

export interface SettlementReceiptProof {
  readonly txHash: string;
  readonly blockNumber: bigint;
  readonly blockHash: string;
  readonly acquisitionId: bigint;
  readonly stockReceivedRaw: bigint;
}

export interface BoundaryObservation {
  readonly quoteObserved: boolean;
  readonly structuralValidationPassed: boolean;
  readonly priceGuardPassed: boolean;
  readonly localForkSettlementPassed: boolean;
  /** ONLY a full receipt proof can support the mainnet-confirmed state. */
  readonly mainnetReceipt: SettlementReceiptProof | null;
}

export interface BoundaryStatusView {
  readonly status: RialtoBoundaryStatus;
  readonly legalEligibility: "UNRESOLVED — NOT ESTABLISHED BY THIS BOUNDARY";
  readonly note: string;
}

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/** Derive the most advanced TRUTHFUL status; never overstates, always fails toward the lesser state. */
export function classifyBoundary(obs: BoundaryObservation): BoundaryStatusView {
  let status: RialtoBoundaryStatus = "QUOTE_NOT_OBSERVED";
  if (obs.quoteObserved) status = "QUOTE_OBSERVED";
  if (obs.quoteObserved && obs.structuralValidationPassed) status = "QUOTE_STRUCTURALLY_VALID";
  if (obs.quoteObserved && obs.structuralValidationPassed && obs.priceGuardPassed) {
    status = "PRICE_GUARD_PASSED";
  }
  // Settlement states require their own evidence; a passed price guard alone means NOT executed.
  if (status === "PRICE_GUARD_PASSED" || status === "QUOTE_STRUCTURALLY_VALID") {
    status = obs.localForkSettlementPassed ? "SETTLEMENT_EXECUTED_LOCAL_FORK_ONLY" : status;
  }
  if (obs.mainnetReceipt !== null) {
    const p = obs.mainnetReceipt;
    const valid =
      HASH_RE.test(p.txHash) &&
      HASH_RE.test(p.blockHash) &&
      p.blockNumber > 0n &&
      p.acquisitionId > 0n &&
      p.stockReceivedRaw > 0n;
    if (!valid) {
      // An incomplete proof NEVER upgrades the status.
      return {
        status,
        legalEligibility: "UNRESOLVED — NOT ESTABLISHED BY THIS BOUNDARY",
        note: "mainnet receipt proof was malformed and was ignored (fail toward lesser state)",
      };
    }
    status = "MAINNET_SETTLEMENT_CONFIRMED";
  }
  const notExecuted =
    status !== "SETTLEMENT_EXECUTED_LOCAL_FORK_ONLY" && status !== "MAINNET_SETTLEMENT_CONFIRMED";
  return {
    status,
    legalEligibility: "UNRESOLVED — NOT ESTABLISHED BY THIS BOUNDARY",
    note: notExecuted
      ? "settlement not executed"
      : status === "SETTLEMENT_EXECUTED_LOCAL_FORK_ONLY"
        ? "settlement demonstrated on a local fork only — NOT mainnet"
        : "mainnet settlement receipt proof supplied by caller; technical status only, no legal claim",
  };
}
