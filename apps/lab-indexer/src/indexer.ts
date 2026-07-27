// Poll loop. The indexer's tracked market set is the AUTHORITATIVE, provenance-
// verified BPS launches in Postgres (lab_launches WHERE provenance_verified =
// true) — written only by the BPS frontend after receipt verification. The
// indexer NEVER classifies a market as BPS from chain events; it only:
//   1. reloads verified BPS markets from Postgres every poll (no restart needed
//      to pick up a new launch),
//   2. resolves + persists each market's poolId (enrichment),
//   3. indexes PoolManager Swap logs for those known poolIds.
// knownPools therefore counts verified BPS pools only.

import type pg from "pg";
import { getContractEvents } from "viem/actions";
import type { Address, Hex, PublicClient } from "viem";
import { getCursor, setCursor, loadTrackedMarkets, setMarketPoolId } from "./db.js";
import { SWAP_EVENT, labAddresses, resolvePoolId } from "./chain.js";
import { log, logError, type IndexerEnv } from "./env.js";

export interface IndexerStatus {
  swapsCursor: string | null;
  headBlock: string | null;
  lagBlocks: string | null;
  /** Verified BPS markets tracked (rows in lab_launches, provenance_verified). */
  trackedMarkets: number;
  /** Verified BPS pools with a resolved poolId (indexable). */
  knownPools: number;
  lastPollOkAt: number | null;
  lastError: string | null;
  dbOk: boolean;
}

export const status: IndexerStatus = {
  swapsCursor: null,
  headBlock: null,
  lagBlocks: null,
  trackedMarkets: 0,
  knownPools: 0,
  lastPollOkAt: null,
  lastError: null,
  dbOk: false,
};

const knownPoolIds = new Map<string, Address>(); // poolId -> token address

/**
 * Reload the verified BPS market set from Postgres, resolving + persisting any
 * missing poolId. This is the ONLY way a market becomes tracked.
 */
export async function reloadTrackedMarkets(client: PublicClient, pool: pg.Pool): Promise<void> {
  const a = labAddresses();
  const markets = await loadTrackedMarkets(pool);
  status.trackedMarkets = markets.length;
  knownPoolIds.clear();
  for (const m of markets) {
    let poolId = m.poolId;
    if (!poolId) {
      const resolved = await resolvePoolId(
        client,
        a.dopplerHookInitializer,
        m.tokenAddress as Address,
      );
      if (resolved) {
        poolId = resolved;
        await setMarketPoolId(pool, m.tokenAddress, resolved);
        log(`resolved poolId for verified market ${m.tokenAddress}: ${resolved.slice(0, 10)}…`);
      }
    }
    if (poolId) knownPoolIds.set(poolId.toLowerCase(), m.tokenAddress as Address);
  }
  status.knownPools = knownPoolIds.size;
}

async function indexSwapRange(
  client: PublicClient,
  pool: pg.Pool,
  from: bigint,
  to: bigint,
): Promise<void> {
  if (knownPoolIds.size === 0) return;
  const a = labAddresses();
  const ids = [...knownPoolIds.keys()] as Hex[];
  const logs = await getContractEvents(client, {
    address: a.poolManager,
    abi: [SWAP_EVENT],
    eventName: "Swap",
    args: { id: ids },
    fromBlock: from,
    toBlock: to,
  });
  const blockTimes = new Map<string, number>();
  for (const l of logs) {
    if (l.blockNumber === null || !l.transactionHash || l.logIndex === null) continue;
    const args = l.args as {
      id: Hex;
      amount0: bigint;
      amount1: bigint;
      sqrtPriceX96: bigint;
      tick: number;
      fee: number;
    };
    const token = knownPoolIds.get(args.id.toLowerCase());
    if (!token) continue;
    const bkey = l.blockNumber.toString();
    if (!blockTimes.has(bkey)) {
      const b = await client.getBlock({ blockNumber: l.blockNumber });
      blockTimes.set(bkey, Number(b.timestamp));
    }
    await pool.query(
      `INSERT INTO lab_swaps (id, pool_id, token_address, block_number, tx_hash, amount0, amount1, sqrt_price_x96, tick, fee, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_timestamp($11))
       ON CONFLICT (id) DO NOTHING`,
      [
        `${l.transactionHash}:${l.logIndex}`,
        args.id.toLowerCase(),
        token.toLowerCase(),
        l.blockNumber.toString(),
        l.transactionHash,
        args.amount0.toString(),
        args.amount1.toString(),
        args.sqrtPriceX96.toString(),
        args.tick,
        args.fee,
        blockTimes.get(bkey),
      ],
    );
  }
  if (logs.length > 0) log(`swaps indexed: ${logs.length} in blocks ${from}-${to}`);
}

/** One poll iteration: reload verified markets, then advance the swap stream. */
export async function pollOnce(
  client: PublicClient,
  pool: pg.Pool,
  env: IndexerEnv,
): Promise<void> {
  await reloadTrackedMarkets(client, pool);

  const head = await client.getBlockNumber();
  const confirmedHead = head - env.confirmations;
  status.headBlock = head.toString();

  const saved = await getCursor(pool, "swaps");
  let from = saved !== null ? saved + 1n : env.startBlock;
  while (from <= confirmedHead) {
    const to =
      from + env.chunkBlocks - 1n > confirmedHead ? confirmedHead : from + env.chunkBlocks - 1n;
    await indexSwapRange(client, pool, from, to);
    await setCursor(pool, "swaps", to);
    status.swapsCursor = to.toString();
    from = to + 1n;
  }
  const swapsCursor = status.swapsCursor ? BigInt(status.swapsCursor) : confirmedHead;
  status.lagBlocks = (head - swapsCursor).toString();
  status.lastPollOkAt = Date.now();
  status.lastError = null;
  status.dbOk = true;
}

export function startLoop(client: PublicClient, pool: pg.Pool, env: IndexerEnv): NodeJS.Timeout {
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await pollOnce(client, pool, env);
    } catch (e) {
      status.lastError =
        e instanceof Error
          ? ((e as { shortMessage?: string }).shortMessage ?? e.message).slice(0, 200)
          : String(e);
      logError("poll failed", e);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(() => void tick(), env.pollMs);
}
