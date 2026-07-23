// Real oracle read boundary (Task 8B §J). Reads a Chainlink aggregator (code, decimals, latestRoundData),
// the L2 sequencer uptime feed, and the stock token's oraclePaused() via an injected viem client, then
// hands the raw values to the pure `evaluateFeed` validator from lib/oracle.ts. Feed proxy addresses are
// source-backed CONFIGURATION inputs — never invented or hardcoded here.
import { type Address, type PublicClient } from "viem";
import { ReadFailedError } from "./reads";
import type { FeedConfig, FeedReading, SequencerStatus } from "../oracle";

const aggregatorV3Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

const oraclePausableAbi = [
  {
    type: "function",
    name: "oraclePaused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;

/** Read a Chainlink feed into a `FeedReading` for `evaluateFeed`. `oraclePaused` is read from the token. */
export async function readFeed(
  client: PublicClient,
  config: FeedConfig,
  stockToken: Address,
): Promise<FeedReading> {
  const feed = config.proxy as Address;
  let code: `0x${string}` | undefined;
  try {
    code = await client.getCode({ address: feed });
  } catch (e) {
    throw new ReadFailedError(`feed getCode ${feed}`, e);
  }
  const hasCode = !!code && code !== "0x";
  if (!hasCode) {
    return { hasCode: false, answer: 0n, decimals: 0, updatedAtSec: 0n, oraclePaused: false };
  }
  try {
    const [decimals, round, oraclePaused] = await Promise.all([
      client.readContract({ address: feed, abi: aggregatorV3Abi, functionName: "decimals" }),
      client.readContract({ address: feed, abi: aggregatorV3Abi, functionName: "latestRoundData" }),
      client.readContract({
        address: stockToken,
        abi: oraclePausableAbi,
        functionName: "oraclePaused",
      }),
    ]);
    return {
      hasCode: true,
      answer: round[1], // int256 answer
      decimals: Number(decimals),
      updatedAtSec: round[3], // updatedAt
      oraclePaused,
    };
  } catch (e) {
    throw new ReadFailedError("feed latestRoundData/oraclePaused", e);
  }
}

/** Read the L2 sequencer uptime feed (answer 0 = up, 1 = down) + startedAt into a `SequencerStatus`. */
export async function readSequencer(
  client: PublicClient,
  sequencerFeed: Address,
  gracePeriodSec: bigint,
): Promise<SequencerStatus> {
  try {
    const round = await client.readContract({
      address: sequencerFeed,
      abi: aggregatorV3Abi,
      functionName: "latestRoundData",
    });
    return { up: round[1] === 0n, changedAtSec: round[2], gracePeriodSec };
  } catch (e) {
    throw new ReadFailedError("sequencer latestRoundData", e);
  }
}
