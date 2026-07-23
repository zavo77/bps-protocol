import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  bpsTradeRouterAbi,
  distributionClaimManagerAbi,
  distributionFundingCoordinatorAbi,
} from "../abis";
import { createPublicClient } from "viem";
import { robinhoodChain } from "../chain";
import { makeDemoState } from "../testing/local-env";
import { mockTransport } from "../testing/mock-rpc";
import { aggregate, decodeLogs, encodeEventLog, fetchTransparency } from "./transparency-reads";

const ROUTER = "0x0000000000000000000000000000000000000001" as Address;
const COORD = "0x0000000000000000000000000000000000000002" as Address;
const MGR = "0x0000000000000000000000000000000000000003" as Address;
const ME = "0x00000000000000000000000000000000000000aa" as Address;
const STOCK = "0x00000000000000000000000000000000000000bb" as Address;
const ROOT = "0x1234000000000000000000000000000000000000000000000000000000000000" as const;

function buy(logIndex: number) {
  return encodeEventLog(
    bpsTradeRouterAbi as never,
    "OfficialBuy",
    {
      tradeId: 1n,
      trader: ME,
      recipient: ME,
      grossWethInput: 1000n * 10n ** 18n,
      stockBudget: 20n * 10n ** 18n,
      burnBudget: 10n * 10n ** 18n,
      userWethBudget: 970n * 10n ** 18n,
      userBpsOutput: 500n * 10n ** 18n,
      bpsBurned: 10_000n * 10n ** 18n,
      adapter: ROUTER,
      stockBudgetRecipient: STOCK,
    },
    { address: ROUTER, blockNumber: 10n, transactionHash: `0x${"a".repeat(64)}`, logIndex },
  );
}

function sell(logIndex: number) {
  return encodeEventLog(
    bpsTradeRouterAbi as never,
    "OfficialSell",
    {
      tradeId: 2n,
      trader: ME,
      recipient: ME,
      grossBpsInput: 300n * 10n ** 18n,
      grossWethOutput: 200n * 10n ** 18n,
      stockBudget: 4n * 10n ** 18n,
      burnBudget: 2n * 10n ** 18n,
      userWethOutput: 194n * 10n ** 18n,
      bpsBurned: 4n * 10n ** 18n,
      adapter: ROUTER,
      stockBudgetRecipient: STOCK,
    },
    { address: ROUTER, blockNumber: 13n, transactionHash: `0x${"e".repeat(64)}`, logIndex },
  );
}

const repurchaseBurn = encodeEventLog(
  bpsTradeRouterAbi as never,
  "BpsRepurchasedAndBurned",
  { tradeId: 2n, wethSpent: 2n * 10n ** 18n, bpsBurned: 5n * 10n ** 18n },
  { address: ROUTER, blockNumber: 13n, transactionHash: `0x${"e".repeat(64)}`, logIndex: 1 },
);

const budgetDelivered = encodeEventLog(
  bpsTradeRouterAbi as never,
  "StockBudgetDelivered",
  { tradeId: 1n, recipient: STOCK, amount: 20n * 10n ** 18n },
  { address: ROUTER, blockNumber: 10n, transactionHash: `0x${"a".repeat(64)}`, logIndex: 5 },
);

const recorded = encodeEventLog(
  distributionFundingCoordinatorAbi as never,
  "AcquisitionRecorded",
  {
    acquisitionId: 1n,
    stockToken: STOCK,
    operator: ME,
    wethSpent: 20n * 10n ** 18n,
    acquiredStock: 2000n * 10n ** 18n,
    distributionAmount: 1600n * 10n ** 18n,
    reserveAmount: 400n * 10n ** 18n,
  },
  { address: COORD, blockNumber: 11n, transactionHash: `0x${"b".repeat(64)}`, logIndex: 0 },
);
const funded = encodeEventLog(
  distributionFundingCoordinatorAbi as never,
  "AcquisitionFunded",
  {
    acquisitionId: 1n,
    cycleId: 42n,
    stockToken: STOCK,
    amount: 1600n * 10n ** 18n,
    merkleRoot: ROOT,
    claimStart: 0n,
    claimDeadline: 9n,
  },
  { address: COORD, blockNumber: 12n, transactionHash: `0x${"c".repeat(64)}`, logIndex: 0 },
);
const claimed = encodeEventLog(
  distributionClaimManagerAbi as never,
  "Claimed",
  { cycleId: 42n, claimant: ME, asset: STOCK, amount: 600n * 10n ** 18n },
  { address: MGR, blockNumber: 20n, transactionHash: `0x${"d".repeat(64)}`, logIndex: 0 },
);

describe("event-backed transparency (§E)", () => {
  it("decodes real frozen-ABI logs and aggregates volumes, split, and cycle linkage", () => {
    const decoded = decodeLogs([buy(0), recorded, funded, claimed] as never);
    expect(decoded.map((d) => d.eventName).sort()).toEqual([
      "AcquisitionFunded",
      "AcquisitionRecorded",
      "Claimed",
      "OfficialBuy",
    ]);
    const report = aggregate(decoded, false);
    expect(report.buyVolume.value).toBe(1000n * 10n ** 18n);
    expect(report.totalBpsBurned.value).toBe(10_000n * 10n ** 18n);
    expect(report.stockAcquisitionBudgetSpent.value).toBe(20n * 10n ** 18n);
    const row = report.acquisitions[0]!;
    expect(row.distribution80.value).toBe(1600n * 10n ** 18n);
    expect(row.reserve20.value).toBe(400n * 10n ** 18n);
    expect(row.cycleId.value).toBe(42n);
    expect(row.remaining.value).toBe(1000n * 10n ** 18n); // funded 1600 - claimed 600
    expect(row.claimed.value).toBe(600n * 10n ** 18n);
    expect(report.buyVolume.provenance).toBe("derived");
  });

  it("deduplicates identical (block, tx, logIndex) logs", () => {
    const decoded = decodeLogs([buy(0), buy(0)] as never);
    expect(decoded).toHaveLength(1);
  });

  it("skips malformed / inconsistent logs", () => {
    const malformed = {
      address: ROUTER,
      topics: [],
      data: undefined,
      blockNumber: 1n,
      transactionHash: null,
      logIndex: null,
    };
    const bogusTopic = { ...buy(0), topics: ["0x" + "9".repeat(64)] };
    const decoded = decodeLogs([malformed, bogusTopic, buy(1)] as never);
    expect(decoded).toHaveLength(1); // only the valid buy survives
  });

  it("accrued budget stays distinct from a completed acquisition (budget without a record)", () => {
    const report = aggregate(decodeLogs([buy(0)] as never), false);
    expect(report.stockAcquisitionBudgetAccrued.value).toBe(20n * 10n ** 18n);
    expect(report.stockAcquisitionBudgetSpent.value).toBe(0n);
    expect(report.pendingBudgetNotYetAcquired.value).toBe(20n * 10n ** 18n);
    expect(report.acquisitions).toHaveLength(0);
  });

  it("decodes OfficialSell and derives sell volume separate from buy volume", () => {
    const decoded = decodeLogs([buy(0), sell(0)] as never);
    expect(decoded.map((d) => d.eventName).sort()).toEqual(["OfficialBuy", "OfficialSell"]);
    const report = aggregate(decoded, false);
    expect(report.buyVolume.value).toBe(1000n * 10n ** 18n);
    expect(report.sellVolume.value).toBe(200n * 10n ** 18n);
    // per-trade burn sums both trades' bpsBurned (10000 buy + 4 sell)
    expect(report.totalBpsBurned.value).toBe(10_004n * 10n ** 18n);
  });

  it("decodes BpsRepurchasedAndBurned as a dedicated repurchase/burn figure (distinct from per-trade)", () => {
    const report = aggregate(decodeLogs([sell(0), repurchaseBurn] as never), false);
    expect(report.repurchaseBpsBurned.value).toBe(5n * 10n ** 18n);
    expect(report.repurchaseWethSpent.value).toBe(2n * 10n ** 18n);
    // The per-trade burn (from OfficialSell) is NOT conflated with the repurchase burn.
    expect(report.totalBpsBurned.value).toBe(4n * 10n ** 18n);
    expect(report.repurchaseBpsBurned.provenance).toBe("onchain-verified");
  });

  it("decodes StockBudgetDelivered as delivered stock budget", () => {
    const report = aggregate(decodeLogs([budgetDelivered] as never), false);
    expect(report.stockBudgetDelivered.value).toBe(20n * 10n ** 18n);
  });

  it("tags each decoded event with tx hash, block number, and emitting contract", () => {
    const report = aggregate(decodeLogs([recorded, funded] as never), false);
    const row = report.acquisitions[0]!;
    expect(row.ref?.txHash).toBe(`0x${"b".repeat(64)}`);
    expect(row.ref?.blockNumber).toBe(11n);
    expect(row.ref?.emitter.toLowerCase()).toBe(COORD.toLowerCase());
  });

  it("dedupes across overlapping ranges (same log fetched twice)", () => {
    // Two overlapping windows both return the recorded+funded logs.
    const window1 = [buy(0), recorded, funded];
    const window2 = [recorded, funded, claimed];
    const decoded = decodeLogs([...window1, ...window2] as never);
    // recorded and funded appear once each despite the overlap.
    const names = decoded.map((d) => d.eventName).sort();
    expect(names).toEqual(["AcquisitionFunded", "AcquisitionRecorded", "Claimed", "OfficialBuy"]);
  });

  it("a missing historical range (no funded event) leaves cycle linkage unavailable", () => {
    // recorded present but AcquisitionFunded range never fetched → no cycle linkage.
    const report = aggregate(decodeLogs([recorded] as never), false);
    const row = report.acquisitions[0]!;
    expect(row.cycleId.value).toBeNull();
    expect(row.cycleId.provenance).toBe("unavailable");
    expect(row.remaining.value).toBeNull();
  });

  it("inconsistent linkage (funded id with no matching recorded acquisition) yields no row", () => {
    // Funded references acquisitionId 1 but there is no AcquisitionRecorded → no acquisition row.
    const report = aggregate(decodeLogs([funded] as never), false);
    expect(report.acquisitions).toHaveLength(0);
  });

  it("excludes logs within the confirmation depth end-to-end (fetchTransparency)", async () => {
    // A buy confirmed at a safe block (10) and a buy still inside the confirmation window (block 99).
    const safeBuy = buy(0); // block 10
    const recentBuy = encodeEventLog(
      bpsTradeRouterAbi as never,
      "OfficialBuy",
      {
        tradeId: 3n,
        trader: ME,
        recipient: ME,
        grossWethInput: 7n * 10n ** 18n,
        stockBudget: 1n,
        burnBudget: 1n,
        userWethBudget: 1n,
        userBpsOutput: 1n,
        bpsBurned: 1n,
        adapter: ROUTER,
        stockBudgetRecipient: STOCK,
      },
      { address: ROUTER, blockNumber: 99n, transactionHash: `0x${"f".repeat(64)}`, logIndex: 0 },
    );
    const state = makeDemoState({ blockNumber: 100n, logs: [safeBuy, recentBuy] });
    const pub = createPublicClient({ chain: robinhoodChain, transport: mockTransport(state) });
    const report = await fetchTransparency(pub, {
      addresses: [ROUTER as never],
      fromBlock: 0n,
      headBlock: 100n,
      confirmations: 5n, // safe head = 95 → block 99 excluded, block 10 included
      chunkSize: 50n,
      isFixture: false,
    });
    // Only the safe buy's gross (1000) is counted; the recent buy (7) is excluded.
    expect(report.buyVolume.value).toBe(1000n * 10n ** 18n);
  });
});
