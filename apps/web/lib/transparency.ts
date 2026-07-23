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

/** Provenance reference for an emitted event: which transaction/block, and the emitting contract. */
export interface EventRef {
  readonly txHash: string;
  readonly blockNumber: bigint;
  readonly emitter: string;
}

export interface OfficialTradeEvent {
  readonly kind: "buy" | "sell";
  readonly stockBudget: bigint;
  readonly bpsBurned: bigint;
  readonly gross: bigint; // grossWethInput (buy) or grossWethOutput (sell)
  readonly ref?: EventRef;
}

export interface AcquisitionRecordedEvent {
  readonly acquisitionId: bigint;
  readonly stockToken: string;
  readonly wethSpent: bigint;
  readonly acquiredStock: bigint;
  readonly distributionAmount: bigint;
  readonly reserveAmount: bigint;
  readonly ref?: EventRef;
}

export interface AcquisitionFundedEvent {
  readonly acquisitionId: bigint;
  readonly cycleId: bigint;
  readonly stockToken: string;
  readonly amount: bigint;
  readonly merkleRoot: string;
  readonly ref?: EventRef;
}

/** BpsRepurchasedAndBurned: protocol-executed buyback and burn (distinct from per-trade bpsBurned). */
export interface RepurchaseBurnEvent {
  readonly tradeId: bigint;
  readonly wethSpent: bigint;
  readonly bpsBurned: bigint;
  readonly ref?: EventRef;
}

/** StockBudgetDelivered: stock-budget amount actually delivered to a recipient for a trade. */
export interface BudgetDeliveryEvent {
  readonly tradeId: bigint;
  readonly recipient: string;
  readonly amount: bigint;
  readonly ref?: EventRef;
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
  readonly ref: EventRef | null; // tx hash / block / emitting contract of the AcquisitionRecorded event
}

export interface TransparencyReport {
  readonly buyVolume: Tagged<bigint>;
  readonly sellVolume: Tagged<bigint>;
  readonly totalBpsBurned: Tagged<bigint>;
  readonly stockAcquisitionBudgetAccrued: Tagged<bigint>;
  readonly stockAcquisitionBudgetSpent: Tagged<bigint>;
  readonly pendingBudgetNotYetAcquired: Tagged<bigint>;
  // Dedicated protocol repurchase/burn events (BpsRepurchasedAndBurned), distinct from per-trade burns.
  readonly repurchaseWethSpent: Tagged<bigint>;
  readonly repurchaseBpsBurned: Tagged<bigint>;
  // Stock budget actually delivered to recipients (StockBudgetDelivered).
  readonly stockBudgetDelivered: Tagged<bigint>;
  readonly acquisitions: readonly AcquisitionRow[];
  readonly acquisitionDisclaimer: string;
  readonly rialtoNote: string;
}

export interface TransparencyInputs {
  readonly trades: readonly OfficialTradeEvent[];
  readonly recorded: readonly AcquisitionRecordedEvent[];
  readonly funded: readonly AcquisitionFundedEvent[];
  readonly cycleReads: readonly CycleReads[];
  readonly repurchases?: readonly RepurchaseBurnEvent[];
  readonly budgetDeliveries?: readonly BudgetDeliveryEvent[];
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
  const repurchases = input.repurchases ?? [];
  const budgetDeliveries = input.budgetDeliveries ?? [];
  const repurchaseWethSpent = repurchases.reduce((a, r) => a + r.wethSpent, 0n);
  const repurchaseBpsBurned = repurchases.reduce((a, r) => a + r.bpsBurned, 0n);
  const stockBudgetDelivered = budgetDeliveries.reduce((a, d) => a + d.amount, 0n);

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
      ref: r.ref ?? null,
    };
  });

  return {
    buyVolume: tag(buyVolume, f, "derived"),
    sellVolume: tag(sellVolume, f, "derived"),
    totalBpsBurned: tag(totalBpsBurned, f, "derived"),
    stockAcquisitionBudgetAccrued: tag(budgetAccrued, f, "derived"),
    stockAcquisitionBudgetSpent: tag(budgetSpent, f, "derived"),
    pendingBudgetNotYetAcquired: tag(pending, f, "derived"),
    repurchaseWethSpent: tag(repurchaseWethSpent, f, "onchain-verified"),
    repurchaseBpsBurned: tag(repurchaseBpsBurned, f, "onchain-verified"),
    stockBudgetDelivered: tag(stockBudgetDelivered, f, "onchain-verified"),
    acquisitions,
    acquisitionDisclaimer:
      "A stock-acquisition budget accruing from official trades does NOT mean an acquisition occurred. " +
      "Only entries with a recorded acquisition id reflect an executed acquisition.",
    rialtoNote:
      "Stock acquisitions are executed via the Rialto quote service — a centralized, permissioned API. " +
      "This path is not decentralized.",
  };
}
