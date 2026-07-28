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
import {
  getCursor,
  setCursor,
  loadTrackedMarkets,
  setMarketPoolId,
  loadPoolSync,
  registerPoolSync,
  setPoolSyncProgress,
} from "./db.js";
import { SWAP_EVENT, labAddresses, resolvePoolId } from "./chain.js";
import { log, logError, type IndexerEnv } from "./env.js";

export interface MarketSyncStatus {
  tokenAddress: string;
  poolId: string;
  lastIndexedBlock: string;
  state: "backfilling" | "current";
}

export interface IndexerStatus {
  swapsCursor: string | null;
  headBlock: string | null;
  lagBlocks: string | null;
  /** Verified BPS markets tracked (rows in lab_launches, provenance_verified). */
  trackedMarkets: number;
  /** Verified BPS pools with a resolved poolId (indexable). */
  knownPools: number;
  /** Per-market sync state (backfilling pools report their own cursor). */
  markets: MarketSyncStatus[];
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
  markets: [],
  lastPollOkAt: null,
  lastError: null,
  dbOk: false,
};

const knownPoolIds = new Map<string, Address>(); // poolId -> token address
const launchBlockByPool = new Map<string, bigint | null>(); // poolId -> launch block

/** Hard cap on blocks per getLogs request during per-pool backfill. */
const BACKFILL_MAX_CHUNK = 5_000n;

/**
 * Reload the verified BPS market set from Postgres, resolving + persisting any
 * missing poolId. This is the ONLY way a market becomes tracked.
 */
export async function reloadTrackedMarkets(client: PublicClient, pool: pg.Pool): Promise<void> {
  const a = labAddresses();
  const markets = await loadTrackedMarkets(pool);
  status.trackedMarkets = markets.length;
  knownPoolIds.clear();
  launchBlockByPool.clear();
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
    if (poolId) {
      knownPoolIds.set(poolId.toLowerCase(), m.tokenAddress as Address);
      launchBlockByPool.set(poolId.toLowerCase(), m.blockNumber);
    }
  }
  status.knownPools = knownPoolIds.size;
}

async function indexSwapRange(
  client: PublicClient,
  pool: pg.Pool,
  ids: Hex[],
  from: bigint,
  to: bigint,
): Promise<number> {
  if (ids.length === 0) return 0;
  const a = labAddresses();
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
  return logs.length;
}

/**
 * Per-market catch-up. The global swaps cursor may already be PAST a newly
 * verified market's launch block (web registration happens after launch), so
 * the global scan alone would permanently skip that market's earliest swaps.
 * For every known pool without a lab_pool_sync row:
 *   - if the global cursor has not yet passed its launch block, the global
 *     scan covers it entirely → register it as 'current' immediately;
 *   - otherwise register it as 'backfilling' starting at its launch block.
 * Every 'backfilling' pool is then advanced (chunked, ≤5000 blocks/request,
 * progress persisted per chunk so restarts resume with no gaps and inserts
 * stay idempotent) until it reaches `covered` — the highest block the global
 * scan has already consumed — at which point it flips to 'current'.
 */
async function catchUpNewPools(
  client: PublicClient,
  pool: pg.Pool,
  env: IndexerEnv,
  covered: bigint,
): Promise<void> {
  if (knownPoolIds.size === 0) return;
  const existing = new Set((await loadPoolSync(pool)).map((r) => r.poolId));
  for (const [poolId, token] of knownPoolIds) {
    if (existing.has(poolId)) continue;
    const launch = launchBlockByPool.get(poolId) ?? null;
    if (launch === null || covered < launch) {
      // Global scan has not passed the launch block (or launch is unknown):
      // everything from covered+1 onward is covered by the global stream.
      await registerPoolSync(pool, {
        poolId,
        tokenAddress: token.toLowerCase(),
        startBlock: launch ?? covered + 1n,
        lastIndexedBlock: covered,
        state: "current",
      });
    } else {
      await registerPoolSync(pool, {
        poolId,
        tokenAddress: token.toLowerCase(),
        startBlock: launch,
        lastIndexedBlock: launch - 1n,
        state: "backfilling",
      });
      log(
        `market ${token} launched at ${launch} behind global cursor ${covered}; backfilling pool ${poolId.slice(0, 10)}…`,
      );
    }
  }
  const chunk = env.chunkBlocks < BACKFILL_MAX_CHUNK ? env.chunkBlocks : BACKFILL_MAX_CHUNK;
  for (const r of await loadPoolSync(pool)) {
    if (r.state !== "backfilling") continue;
    if (!knownPoolIds.has(r.poolId)) continue; // no longer tracked; leave untouched
    let last = r.lastIndexedBlock;
    let from = last + 1n;
    while (from <= covered) {
      const to = from + chunk - 1n > covered ? covered : from + chunk - 1n;
      const n = await indexSwapRange(client, pool, [r.poolId as Hex], from, to);
      if (n > 0) log(`backfill ${r.tokenAddress}: ${n} swaps in blocks ${from}-${to}`);
      await setPoolSyncProgress(pool, r.poolId, to, "backfilling");
      last = to;
      from = to + 1n;
    }
    // Reached the global cursor: the global scan owns this pool from here on.
    await setPoolSyncProgress(pool, r.poolId, last, "current");
    log(`backfill complete for ${r.tokenAddress}; pool is current at ${last}`);
  }
}

/** Rebuild the per-market /health view from lab_pool_sync. */
async function refreshMarketStatuses(pool: pg.Pool, globalCursor: bigint): Promise<void> {
  const rows = await loadPoolSync(pool);
  status.markets = rows
    .filter((r) => knownPoolIds.has(r.poolId))
    .map((r) => ({
      tokenAddress: r.tokenAddress,
      poolId: r.poolId,
      lastIndexedBlock: (r.state === "current" && globalCursor > r.lastIndexedBlock
        ? globalCursor
        : r.lastIndexedBlock
      ).toString(),
      state: r.state,
    }));
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
  // Highest block the global stream has already scanned; the global scan
  // never revisits blocks <= covered, so new pools must backfill up to it.
  const covered = saved !== null ? saved : env.startBlock - 1n;

  await catchUpNewPools(client, pool, env, covered);

  let from = covered + 1n;
  while (from <= confirmedHead) {
    const to =
      from + env.chunkBlocks - 1n > confirmedHead ? confirmedHead : from + env.chunkBlocks - 1n;
    const ids = [...knownPoolIds.keys()] as Hex[];
    const n = await indexSwapRange(client, pool, ids, from, to);
    if (n > 0) log(`swaps indexed: ${n} in blocks ${from}-${to}`);
    await setCursor(pool, "swaps", to);
    status.swapsCursor = to.toString();
    from = to + 1n;
  }
  const swapsCursor = status.swapsCursor ? BigInt(status.swapsCursor) : confirmedHead;
  status.lagBlocks = (head - swapsCursor).toString();
  await refreshMarketStatuses(pool, status.swapsCursor ? BigInt(status.swapsCursor) : covered);
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
