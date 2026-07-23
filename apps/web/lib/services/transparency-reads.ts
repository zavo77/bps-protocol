// Event-backed transparency service (Task 8C §E). Retrieves bounded, chunked, confirmation-filtered logs
// and DECODES them with the real frozen event ABIs (OfficialBuy/OfficialSell, BpsRepurchasedAndBurned,
// AcquisitionRecorded/AcquisitionFunded, Claimed), deduplicates by (block, tx, logIndex), rejects
// malformed/inconsistent logs, then aggregates into the provenance-tagged transparency model. The UI
// consumes THIS decoded result — never a preconstructed summary.
import {
  decodeEventLog,
  encodeAbiParameters,
  encodeEventTopics,
  numberToHex,
  type Abi,
  type Address,
} from "viem";
import {
  bpsTradeRouterAbi,
  distributionClaimManagerAbi,
  distributionFundingCoordinatorAbi,
} from "../abis";
import {
  buildTransparencyReport,
  type AcquisitionFundedEvent,
  type AcquisitionRecordedEvent,
  type CycleReads,
  type OfficialTradeEvent,
  type TransparencyReport,
} from "../transparency";
import { getLogsChunked, type RawLog } from "./reads";
import type { PublicClient } from "viem";

const EVENT_ABI = [
  ...bpsTradeRouterAbi.filter((x) => x.type === "event"),
  ...distributionFundingCoordinatorAbi.filter((x) => x.type === "event"),
  ...distributionClaimManagerAbi.filter((x) => x.type === "event"),
] as unknown as Abi;

/** RPC wire-format log (hex fields) so viem's getLogs formatter can parse it. */
export interface EncodedLog {
  readonly address: Address;
  readonly topics: readonly `0x${string}`[];
  readonly data: `0x${string}`;
  readonly blockNumber: `0x${string}`;
  readonly blockHash: `0x${string}`;
  readonly transactionHash: `0x${string}`;
  readonly transactionIndex: `0x${string}`;
  readonly logIndex: `0x${string}`;
  readonly removed: boolean;
}

/** Encode a single RPC-format log from a frozen event ABI + args (seeds the deterministic transport). */
export function encodeEventLog(
  abi: Abi,
  eventName: string,
  args: Record<string, unknown>,
  meta: { address: Address; blockNumber: bigint; transactionHash: `0x${string}`; logIndex: number },
): EncodedLog {
  const ev = (
    abi as readonly {
      type: string;
      name?: string;
      inputs?: { name: string; indexed?: boolean }[];
    }[]
  ).find((x) => x.type === "event" && x.name === eventName);
  if (!ev?.inputs) throw new Error(`unknown event ${eventName}`);
  const indexed = ev.inputs.filter((i) => i.indexed);
  const nonIndexed = ev.inputs.filter((i) => !i.indexed);
  const topics = encodeEventTopics({
    abi,
    eventName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: Object.fromEntries(indexed.map((i) => [i.name, args[i.name]])) as any,
  }) as `0x${string}`[];
  const data = encodeAbiParameters(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nonIndexed as any,
    nonIndexed.map((i) => args[i.name]),
  );
  return {
    address: meta.address,
    topics,
    data,
    blockNumber: numberToHex(meta.blockNumber),
    blockHash: `0x${"1".repeat(64)}`,
    transactionHash: meta.transactionHash,
    transactionIndex: numberToHex(0),
    logIndex: numberToHex(meta.logIndex),
    removed: false,
  };
}

interface DecodedEvent {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
  address: Address;
}

interface FormattedLog {
  address: Address;
  topics?: readonly `0x${string}`[];
  data?: `0x${string}`;
  blockNumber: bigint | null;
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
}

/** Decode viem-formatted logs, skipping malformed/inconsistent ones; dedupe by (block, tx, logIndex). */
export function decodeLogs(logs: readonly RawLog[]): DecodedEvent[] {
  const out: DecodedEvent[] = [];
  const seen = new Set<string>();
  for (const l of logs as unknown as FormattedLog[]) {
    if (
      !l.topics ||
      l.topics.length === 0 ||
      l.data == null ||
      l.transactionHash == null ||
      l.logIndex == null
    ) {
      continue; // malformed / inconsistent
    }
    const key = `${l.blockNumber}:${l.transactionHash.toLowerCase()}:${l.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const dec = decodeEventLog({
        abi: EVENT_ABI,
        topics: l.topics as [`0x${string}`, ...`0x${string}`[]],
        data: l.data,
      });
      out.push({
        eventName: String(dec.eventName),
        args: dec.args as unknown as Record<string, unknown>,
        blockNumber: l.blockNumber ?? 0n,
        transactionHash: l.transactionHash,
        logIndex: l.logIndex,
        address: l.address,
      });
    } catch {
      // malformed / non-matching topic0 → excluded
    }
  }
  return out;
}

/** Aggregate decoded events into the provenance-tagged transparency report. */
export function aggregate(
  decoded: readonly DecodedEvent[],
  isFixture: boolean,
): TransparencyReport {
  const trades: OfficialTradeEvent[] = [];
  const recorded: AcquisitionRecordedEvent[] = [];
  const funded: AcquisitionFundedEvent[] = [];
  const cycleReads: CycleReads[] = [];
  const claimedByCycleAsset = new Map<string, bigint>();

  for (const d of decoded) {
    const a = d.args;
    if (d.eventName === "OfficialBuy") {
      trades.push({
        kind: "buy",
        stockBudget: a.stockBudget as bigint,
        bpsBurned: a.bpsBurned as bigint,
        gross: a.grossWethInput as bigint,
      });
    } else if (d.eventName === "OfficialSell") {
      trades.push({
        kind: "sell",
        stockBudget: a.stockBudget as bigint,
        bpsBurned: a.bpsBurned as bigint,
        gross: a.grossWethOutput as bigint,
      });
    } else if (d.eventName === "AcquisitionRecorded") {
      recorded.push({
        acquisitionId: a.acquisitionId as bigint,
        stockToken: String(a.stockToken),
        wethSpent: a.wethSpent as bigint,
        acquiredStock: a.acquiredStock as bigint,
        distributionAmount: a.distributionAmount as bigint,
        reserveAmount: a.reserveAmount as bigint,
      });
    } else if (d.eventName === "AcquisitionFunded") {
      funded.push({
        acquisitionId: a.acquisitionId as bigint,
        cycleId: a.cycleId as bigint,
        stockToken: String(a.stockToken),
        amount: a.amount as bigint,
        merkleRoot: String(a.merkleRoot),
      });
    } else if (d.eventName === "Claimed") {
      const key = `${a.cycleId}:${String(a.asset).toLowerCase()}`;
      claimedByCycleAsset.set(key, (claimedByCycleAsset.get(key) ?? 0n) + (a.amount as bigint));
    }
  }

  // Derive cycle remaining = funded - claimed (from decoded events).
  for (const f of funded) {
    const key = `${f.cycleId}:${String(f.stockToken).toLowerCase()}`;
    const claimed = claimedByCycleAsset.get(key) ?? 0n;
    cycleReads.push({
      cycleId: f.cycleId,
      asset: f.stockToken,
      remaining: f.amount - claimed,
      funded: f.amount,
    });
  }

  return buildTransparencyReport({ trades, recorded, funded, cycleReads, isFixture });
}

/** Full event-backed transparency fetch: chunked logs from the deployment block → decode → aggregate. */
export async function fetchTransparency(
  client: PublicClient,
  params: {
    readonly addresses: readonly Address[];
    readonly fromBlock: bigint;
    readonly headBlock: bigint;
    readonly confirmations: bigint;
    readonly chunkSize: bigint;
    readonly isFixture: boolean;
  },
): Promise<TransparencyReport> {
  const all: RawLog[] = [];
  for (const address of params.addresses) {
    const logs = await getLogsChunked(client, {
      address,
      events: EVENT_ABI,
      fromBlock: params.fromBlock,
      headBlock: params.headBlock,
      confirmations: params.confirmations,
      chunkSize: params.chunkSize,
    });
    all.push(...logs);
  }
  return aggregate(decodeLogs(all), params.isFixture);
}
