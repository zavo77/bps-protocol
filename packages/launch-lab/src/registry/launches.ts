// Launch registry — direct on-chain reconstruction (always available).
// Source of truth is the Airlock `Create` event stream filtered to markets
// created through THIS lab's configuration (numeraire == canonical GOOGL and
// initializer == DopplerHookInitializer). A Postgres mirror (when configured)
// only accelerates this; the chain remains the fallback and the authority.

import {
  encodeEventTopics,
  erc20Abi,
  getAddress,
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { airlockAbi } from "@whetstone-research/doppler-sdk/evm";
import { EXPLORER_BASE_URL, GOOGL_ADDRESS } from "../config/index";
import type { LaunchRecord } from "../types/index";

const PAGE_LIMIT = 4; // Blockscout pages of 50 logs — bounded work per request

interface BlockscoutLog {
  topics: (string | null)[];
  data: string;
  transaction_hash: string;
  block_number: number;
}

/**
 * List lab launches by scanning Airlock Create logs via the public explorer
 * API (bounded pages), verifying shape via ABI decode, and enriching each
 * asset with on-chain name/symbol. Creator is resolved from the transaction
 * sender via the explorer, best-effort (null when unavailable).
 */
export async function listLaunchesOnChain(
  client: PublicClient,
  cfg: { airlock: Address; initializer: Address; maxRecords?: number },
): Promise<LaunchRecord[]> {
  const createTopic = encodeEventTopics({ abi: airlockAbi, eventName: "Create" })[0];
  const googlTopic = `0x${GOOGL_ADDRESS.slice(2).toLowerCase().padStart(64, "0")}`;
  const records: LaunchRecord[] = [];
  let next = "";
  for (let page = 0; page < PAGE_LIMIT; page++) {
    const url = `${EXPLORER_BASE_URL}/api/v2/addresses/${cfg.airlock}/logs${next}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) break;
    const json = (await res.json()) as {
      items?: BlockscoutLog[];
      next_page_params?: Record<string, unknown> | null;
    };
    for (const item of json.items ?? []) {
      if (!item.topics?.[0] || item.topics[0].toLowerCase() !== createTopic.toLowerCase()) continue;
      if ((item.topics[1] ?? "").toLowerCase() !== googlTopic) continue;
      const decoded = parseEventLogs({
        abi: airlockAbi,
        eventName: "Create",
        logs: [
          {
            address: cfg.airlock,
            topics: item.topics.filter((t): t is `0x${string}` => !!t),
            data: item.data as Hex,
          } as never,
        ],
      })[0];
      if (!decoded) continue;
      const args = decoded.args as {
        asset: Address;
        numeraire: Address;
        initializer: Address;
        poolOrHook: Address;
      };
      if (args.initializer.toLowerCase() !== cfg.initializer.toLowerCase()) continue;
      records.push({
        tokenAddress: getAddress(args.asset),
        tokenName: "",
        tokenSymbol: "",
        creator: null,
        numeraire: getAddress(args.numeraire),
        poolOrHook: getAddress(args.poolOrHook),
        launchTransactionHash: item.transaction_hash as Hex,
        blockNumber: String(item.block_number),
        timestamp: null,
      });
      if (records.length >= (cfg.maxRecords ?? 50)) break;
    }
    if (records.length >= (cfg.maxRecords ?? 50) || !json.next_page_params) break;
    const params = new URLSearchParams(
      Object.entries(json.next_page_params).map(([k, v]) => [k, String(v)]),
    );
    next = `?${params.toString()}`;
  }

  await Promise.allSettled(
    records.map(async (r) => {
      const [name, symbol] = await Promise.all([
        client.readContract({ address: r.tokenAddress, abi: erc20Abi, functionName: "name" }),
        client.readContract({ address: r.tokenAddress, abi: erc20Abi, functionName: "symbol" }),
      ]);
      r.tokenName = name;
      r.tokenSymbol = symbol;
    }),
  );

  await Promise.allSettled(
    records.map(async (r) => {
      const res = await fetch(
        `${EXPLORER_BASE_URL}/api/v2/transactions/${r.launchTransactionHash}`,
        {
          headers: { accept: "application/json" },
        },
      );
      if (!res.ok) return;
      const tx = (await res.json()) as { from?: { hash?: string }; timestamp?: string };
      if (tx.from?.hash) r.creator = getAddress(tx.from.hash);
      if (tx.timestamp) r.timestamp = Math.floor(new Date(tx.timestamp).getTime() / 1000);
    }),
  );

  return records;
}
