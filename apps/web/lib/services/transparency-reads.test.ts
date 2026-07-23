import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  bpsTradeRouterAbi,
  distributionClaimManagerAbi,
  distributionFundingCoordinatorAbi,
} from "../abis";
import { aggregate, decodeLogs, encodeEventLog } from "./transparency-reads";

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
});
