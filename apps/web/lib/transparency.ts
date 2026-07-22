// Proof-of-Distribution transparency read model (Task 8 §F). Derives figures from contract reads,
// emitted events, and published distribution artifacts, and tags every value with its provenance so the
// UI can distinguish on-chain-verified vs derived vs offchain-artifact vs unavailable vs fixture. It
// never claims an acquisition occurred merely because a stock budget accrued, and never describes the
// Rialto quote API as decentralized.
import { acquiredStockSplit } from "./economics";

export type Provenance =
  "onchain-verified" | "derived" | "offchain-artifact" | "unavailable" | "fixture";

export interface Tagged<T> {
  readonly value: T;
  readonly provenance: Provenance;
}

export interface OfficialTradeEvent {
  readonly kind: "buy" | "sell";
  readonly stockBudget: bigint;
  readonly bpsBurned: bigint;
  readonly gross: bigint; // grossWethInput (buy) or grossWethOutput (sell)
}

export interface AcquisitionRecordedEvent {
  readonly acquisitionId: bigint;
  readonly stockToken: string;
  readonly wethSpent: bigint;
  readonly acquiredStock: bigint;
  readonly distributionAmount: bigint;
  readonly reserveAmount: bigint;
}

export interface AcquisitionFundedEvent {
  readonly acquisitionId: bigint;
  readonly cycleId: bigint;
  readonly stockToken: string;
  readonly amount: bigint;
  readonly merkleRoot: string;
}

export interface CycleReads {
  readonly cycleId: bigint;
  readonly asset: string;
  readonly remaining: bigint; // from manager.remaining()
  readonly funded: bigint; // amount funded (from AcquisitionFunded)
}

export interface AcquisitionRow {
  readonly acquisitionId: bigint;
  readonly stockToken: string;
  readonly wethSpent: Tagged<bigint>;
  readonly acquiredStock: Tagged<bigint>;
  readonly distribution80: Tagged<bigint>;
  readonly reserve20: Tagged<bigint>;
  readonly splitReconciles: boolean;
  readonly cycleId: Tagged<bigint | null>;
  readonly released: Tagged<bigint | null>;
  readonly claimed: Tagged<bigint | null>;
  readonly remaining: Tagged<bigint | null>;
  readonly merkleRoot: Tagged<string | null>;
}

export interface TransparencyReport {
  readonly buyVolume: Tagged<bigint>;
  readonly sellVolume: Tagged<bigint>;
  readonly totalBpsBurned: Tagged<bigint>;
  readonly stockAcquisitionBudgetAccrued: Tagged<bigint>;
  readonly stockAcquisitionBudgetSpent: Tagged<bigint>;
  readonly pendingBudgetNotYetAcquired: Tagged<bigint>;
  readonly acquisitions: readonly AcquisitionRow[];
  readonly acquisitionDisclaimer: string;
  readonly rialtoNote: string;
}

export interface TransparencyInputs {
  readonly trades: readonly OfficialTradeEvent[];
  readonly recorded: readonly AcquisitionRecordedEvent[];
  readonly funded: readonly AcquisitionFundedEvent[];
  readonly cycleReads: readonly CycleReads[];
  readonly isFixture: boolean;
}

function tag<T>(value: T, isFixture: boolean, base: Provenance): Tagged<T> {
  return { value, provenance: isFixture ? "fixture" : base };
}

/** Build the transparency report. Budget "accrued" (from buys) is kept distinct from budget "spent"
 *  (from recorded acquisitions): a positive accrual with no matching acquisition is shown as pending. */
export function buildTransparencyReport(input: TransparencyInputs): TransparencyReport {
  const f = input.isFixture;
  const buyVolume = input.trades.filter((t) => t.kind === "buy").reduce((a, t) => a + t.gross, 0n);
  const sellVolume = input.trades
    .filter((t) => t.kind === "sell")
    .reduce((a, t) => a + t.gross, 0n);
  const totalBpsBurned = input.trades.reduce((a, t) => a + t.bpsBurned, 0n);
  const budgetAccrued = input.trades.reduce((a, t) => a + t.stockBudget, 0n);
  const budgetSpent = input.recorded.reduce((a, r) => a + r.wethSpent, 0n);
  const pending = budgetAccrued > budgetSpent ? budgetAccrued - budgetSpent : 0n;

  const fundedById = new Map(input.funded.map((x) => [x.acquisitionId.toString(), x]));
  const cycleById = new Map(input.cycleReads.map((c) => [c.cycleId.toString(), c]));

  const acquisitions: AcquisitionRow[] = input.recorded.map((r) => {
    const split = acquiredStockSplit(r.acquiredStock);
    const splitReconciles =
      split.distribution === r.distributionAmount &&
      split.reserve === r.reserveAmount &&
      r.distributionAmount + r.reserveAmount === r.acquiredStock;
    const fund = fundedById.get(r.acquisitionId.toString()) ?? null;
    const cyc = fund ? (cycleById.get(fund.cycleId.toString()) ?? null) : null;
    const claimed = cyc && fund ? fund.amount - cyc.remaining : null;
    return {
      acquisitionId: r.acquisitionId,
      stockToken: r.stockToken,
      wethSpent: tag(r.wethSpent, f, "onchain-verified"),
      acquiredStock: tag(r.acquiredStock, f, "onchain-verified"),
      distribution80: tag(r.distributionAmount, f, "onchain-verified"),
      reserve20: tag(r.reserveAmount, f, "onchain-verified"),
      splitReconciles,
      cycleId: tag(fund ? fund.cycleId : null, f, fund ? "onchain-verified" : "unavailable"),
      released: tag(fund ? fund.amount : null, f, fund ? "onchain-verified" : "unavailable"),
      claimed: tag(claimed, f, claimed === null ? "unavailable" : "derived"),
      remaining: tag(cyc ? cyc.remaining : null, f, cyc ? "onchain-verified" : "unavailable"),
      merkleRoot: tag(fund ? fund.merkleRoot : null, f, fund ? "offchain-artifact" : "unavailable"),
    };
  });

  return {
    buyVolume: tag(buyVolume, f, "derived"),
    sellVolume: tag(sellVolume, f, "derived"),
    totalBpsBurned: tag(totalBpsBurned, f, "derived"),
    stockAcquisitionBudgetAccrued: tag(budgetAccrued, f, "derived"),
    stockAcquisitionBudgetSpent: tag(budgetSpent, f, "derived"),
    pendingBudgetNotYetAcquired: tag(pending, f, "derived"),
    acquisitions,
    acquisitionDisclaimer:
      "A stock-acquisition budget accruing from official trades does NOT mean an acquisition occurred. " +
      "Only entries with a recorded acquisition id reflect an executed acquisition.",
    rialtoNote:
      "Stock acquisitions are executed via the Rialto quote service — a centralized, permissioned API. " +
      "This path is not decentralized.",
  };
}
