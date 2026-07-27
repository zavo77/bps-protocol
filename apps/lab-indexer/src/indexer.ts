// Poll loop: two streams with a shared confirmed-head ceiling and per-stream
// Postgres cursors, so a restart resumes exactly where it stopped.
//   launches — Airlock Create logs (numeraire GOOGL + our initializer)
//   swaps    — PoolManager Swap logs for known lab poolIds

import type pg from "pg";
import { getContractEvents } from "viem/actions";
import type { Address, Hex, PublicClient } from "viem";
import { getCursor, setCursor } from "./db.js";
import {
  APPROVED_ANCHOR_ADDRESSES,
  CREATE_EVENT,
  SWAP_EVENT,
  decodeLaunchLog,
  getAnchorByAddress,
  labAddresses,
  resolvePoolId,
} from "./chain.js";
import { log, logError, type IndexerEnv } from "./env.js";

export interface IndexerStatus {
  launchesCursor: string | null;
  swapsCursor: string | null;
  headBlock: string | null;
  lagBlocks: string | null;
  knownPools: number;
  lastPollOkAt: number | null;
  lastError: string | null;
  dbOk: boolean;
}

export const status: IndexerStatus = {
  launchesCursor: null,
  swapsCursor: null,
  headBlock: null,
  lagBlocks: null,
  knownPools: 0,
  lastPollOkAt: null,
  lastError: null,
  dbOk: false,
};

const knownPoolIds = new Map<string, Address>(); // poolId -> token address

export async function loadKnownPools(pool: pg.Pool): Promise<void> {
  const res = await pool.query(
    "SELECT token_address, pool_id FROM lab_launches WHERE pool_id IS NOT NULL",
  );
  for (const row of res.rows as { token_address: string; pool_id: string }[]) {
    knownPoolIds.set(row.pool_id.toLowerCase(), row.token_address as Address);
  }
  status.knownPools = knownPoolIds.size;
}

async function indexLaunchRange(
  client: PublicClient,
  pool: pg.Pool,
  from: bigint,
  to: bigint,
): Promise<void> {
  const a = labAddresses();
  // Discover markets for ANY approved anchor (numeraire is the indexed topic).
  const logs = await getContractEvents(client, {
    address: a.airlock,
    abi: [CREATE_EVENT],
    eventName: "Create",
    args: { numeraire: APPROVED_ANCHOR_ADDRESSES },
    fromBlock: from,
    toBlock: to,
  });
  for (const l of logs) {
    const launch = decodeLaunchLog(l, a.dopplerHookInitializer);
    if (!launch) continue;
    const block = await client.getBlock({ blockNumber: launch.blockNumber });
    const poolId = await resolvePoolId(client, a.dopplerHookInitializer, launch.tokenAddress);
    const anchorSymbol = getAnchorByAddress(launch.numeraire)?.symbol ?? null;
    await pool.query(
      `INSERT INTO lab_launches (token_address, token_name, token_symbol, creator, numeraire, anchor_symbol, pool_or_hook, launch_tx, block_number, launched_at, pool_id)
       VALUES ($1,'','',NULL,$2,$3,$4,$5,$6,to_timestamp($7),$8)
       ON CONFLICT (token_address) DO UPDATE SET pool_id = COALESCE(lab_launches.pool_id, EXCLUDED.pool_id), anchor_symbol = COALESCE(lab_launches.anchor_symbol, EXCLUDED.anchor_symbol)`,
      [
        launch.tokenAddress.toLowerCase(),
        launch.numeraire.toLowerCase(),
        anchorSymbol,
        launch.poolOrHook.toLowerCase(),
        launch.txHash,
        launch.blockNumber.toString(),
        Number(block.timestamp),
        poolId,
      ],
    );
    if (poolId) knownPoolIds.set(poolId.toLowerCase(), launch.tokenAddress);
    log(
      `launch indexed: ${launch.tokenAddress} block ${launch.blockNumber}${poolId ? ` poolId ${poolId.slice(0, 10)}…` : " (poolId pending)"}`,
    );
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

/** One poll iteration: advance both streams toward the confirmed head. */
export async function pollOnce(
  client: PublicClient,
  pool: pg.Pool,
  env: IndexerEnv,
): Promise<void> {
  const head = await client.getBlockNumber();
  const confirmedHead = head - env.confirmations;
  status.headBlock = head.toString();

  for (const stream of ["launches", "swaps"] as const) {
    const saved = await getCursor(pool, stream);
    let from = saved !== null ? saved + 1n : env.startBlock;
    while (from <= confirmedHead) {
      const to =
        from + env.chunkBlocks - 1n > confirmedHead ? confirmedHead : from + env.chunkBlocks - 1n;
      if (stream === "launches") await indexLaunchRange(client, pool, from, to);
      else await indexSwapRange(client, pool, from, to);
      await setCursor(pool, stream, to);
      if (stream === "launches") status.launchesCursor = to.toString();
      else status.swapsCursor = to.toString();
      from = to + 1n;
    }
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
