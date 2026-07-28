// P0 regression: the single global swaps cursor can be PAST a newly launched
// market's first swaps before that market becomes tracked (web registration
// writes the verified row after launch). Per-market catch-up must backfill
// from the launch block to the global cursor — exactly once, restart-safe.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import type pg from "pg";
import type { IndexerEnv } from "./env.js";
import { pollOnce, status } from "./indexer.js";

interface FakeSwapLog {
  blockNumber: bigint;
  transactionHash: string;
  logIndex: number;
  args: {
    id: string;
    amount0: bigint;
    amount1: bigint;
    sqrtPriceX96: bigint;
    tick: number;
    fee: number;
  };
}

const mocks = vi.hoisted(() => ({
  chainSwaps: [] as {
    blockNumber: bigint;
    transactionHash: string;
    logIndex: number;
    args: {
      id: string;
      amount0: bigint;
      amount1: bigint;
      sqrtPriceX96: bigint;
      tick: number;
      fee: number;
    };
  }[],
  calls: [] as { fromBlock: bigint; toBlock: bigint; ids: string[] }[],
}));

vi.mock("viem/actions", () => ({
  getContractEvents: vi.fn(
    async (_client: unknown, p: { fromBlock: bigint; toBlock: bigint; args: { id: string[] } }) => {
      const ids = p.args.id.map((x) => x.toLowerCase());
      mocks.calls.push({ fromBlock: p.fromBlock, toBlock: p.toBlock, ids });
      return mocks.chainSwaps.filter(
        (s) =>
          s.blockNumber >= p.fromBlock &&
          s.blockNumber <= p.toBlock &&
          ids.includes(s.args.id.toLowerCase()),
      );
    },
  ),
}));

const POOL_ID = `0x${"ab".repeat(32)}`;
const TOKEN = "0x1f212fccea9995931f4f2f9ca0c8b641188ca196";
const NUMERAIRE = "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3";
const HOOK = "0x9982538f41f2ae29ddb9d3d9307010052984fdbb";
const TX = `0x${"11".repeat(32)}`;

function swapAt(block: bigint, logIndex = 7): FakeSwapLog {
  return {
    blockNumber: block,
    transactionHash: TX,
    logIndex,
    args: { id: POOL_ID, amount0: -5n, amount1: 10n, sqrtPriceX96: 1n, tick: 100, fee: 3000 },
  };
}

function makeEnv(overrides: Partial<IndexerEnv> = {}): IndexerEnv {
  return {
    databaseUrl: "postgresql://unused",
    rpcUrl: "https://unused.invalid",
    port: 0,
    startBlock: 90n,
    pollMs: 15_000,
    chunkBlocks: 2_000n,
    confirmations: 3n,
    sentryDsn: null,
    sentryEnvironment: "test",
    ...overrides,
  };
}

function mockClient(head: bigint): PublicClient {
  return {
    getBlockNumber: vi.fn(async () => head),
    getBlock: vi.fn(async () => ({ timestamp: 1_753_000_000n })),
  } as unknown as PublicClient;
}

interface FakeDb {
  pool: pg.Pool;
  swaps: Map<string, unknown[]>;
  swapInsertAttempts: string[];
  poolSync: Map<
    string,
    { token: string; start: bigint; last: bigint; state: "backfilling" | "current" }
  >;
  cursor: () => bigint | null;
}

/** Stateful in-memory pg mock matching the SQL the indexer issues. */
function fakeDb(opts: {
  launches: Record<string, string | null>[];
  cursor: bigint | null;
  poolSync?: [string, { token: string; start: bigint; last: bigint; state: "backfilling" | "current" }][];
}): FakeDb {
  const swaps = new Map<string, unknown[]>();
  const swapInsertAttempts: string[] = [];
  const poolSync = new Map(opts.poolSync ?? []);
  let cursor = opts.cursor;
  const pool = {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      if (/FROM lab_launches WHERE provenance_verified = true/.test(text)) {
        return { rows: opts.launches };
      }
      if (/SELECT last_block FROM lab_indexer_cursor/.test(text)) {
        return { rows: cursor === null ? [] : [{ last_block: cursor.toString() }] };
      }
      if (/INSERT INTO lab_indexer_cursor/.test(text)) {
        cursor = BigInt(String(params![1]));
        return { rows: [] };
      }
      if (/FROM lab_pool_sync/.test(text)) {
        return {
          rows: [...poolSync.entries()].map(([id, r]) => ({
            pool_id: id,
            token_address: r.token,
            start_block: r.start.toString(),
            last_indexed_block: r.last.toString(),
            state: r.state,
          })),
        };
      }
      if (/INSERT INTO lab_pool_sync/.test(text)) {
        const id = String(params![0]);
        if (!poolSync.has(id)) {
          // ON CONFLICT (pool_id) DO NOTHING
          poolSync.set(id, {
            token: String(params![1]),
            start: BigInt(String(params![2])),
            last: BigInt(String(params![3])),
            state: params![4] as "backfilling" | "current",
          });
        }
        return { rows: [] };
      }
      if (/UPDATE lab_pool_sync/.test(text)) {
        const r = poolSync.get(String(params![0]));
        if (r) {
          r.last = BigInt(String(params![1]));
          r.state = params![2] as "backfilling" | "current";
        }
        return { rows: [] };
      }
      if (/INSERT INTO lab_swaps/.test(text)) {
        const id = String(params![0]);
        swapInsertAttempts.push(id);
        if (!swaps.has(id)) swaps.set(id, params!); // ON CONFLICT (id) DO NOTHING
        return { rows: [] };
      }
      return { rows: [] };
    }),
  } as unknown as pg.Pool;
  return { pool, swaps, swapInsertAttempts, poolSync, cursor: () => cursor };
}

const VERIFIED_LAUNCH_AT_100: Record<string, string | null> = {
  token_address: TOKEN,
  numeraire: NUMERAIRE,
  pool_or_hook: HOOK,
  pool_id: POOL_ID,
  block_number: "100",
};

beforeEach(() => {
  mocks.chainSwaps.length = 0;
  mocks.calls.length = 0;
  status.swapsCursor = null;
  status.markets = [];
});

describe("per-market catch-up (P0: cursor past launch block)", () => {
  it("backfills a market discovered after the global cursor passed its launch — swap at N+1 captured exactly once across two polls", async () => {
    // Market launched at N=100, swap at N+1=101. Global cursor already at
    // N+5=105 when the verified row first appears; poll sees confirmed head
    // N+6=106 (head 109, 3 confirmations).
    mocks.chainSwaps.push(swapAt(101n));
    const db = fakeDb({ launches: [VERIFIED_LAUNCH_AT_100], cursor: 105n });
    const client = mockClient(109n);
    const env = makeEnv();

    await pollOnce(client, db.pool, env);
    await pollOnce(client, db.pool, env); // idempotency: second poll must not re-insert

    // The N+1 swap exists exactly once, and only ONE insert was ever attempted.
    expect(db.swaps.size).toBe(1);
    expect(db.swaps.has(`${TX}:7`)).toBe(true);
    expect(db.swapInsertAttempts).toEqual([`${TX}:7`]);

    // Backfill scanned exactly launch..coveredCursor for this pool only.
    const backfill = mocks.calls[0];
    expect(backfill.fromBlock).toBe(100n);
    expect(backfill.toBlock).toBe(105n);
    expect(backfill.ids).toEqual([POOL_ID.toLowerCase()]);

    // Pool flipped to 'current' and the global cursor advanced to 106.
    expect(db.poolSync.get(POOL_ID.toLowerCase())?.state).toBe("current");
    expect(db.cursor()).toBe(106n);

    // /health per-market view reports the market as current at the global cursor.
    expect(status.markets).toEqual([
      {
        tokenAddress: TOKEN,
        poolId: POOL_ID.toLowerCase(),
        lastIndexedBlock: "106",
        state: "current",
      },
    ]);
  });

  it("restart-resume: a pool left in 'backfilling' resumes from last_indexed_block (no gap, no re-scan)", async () => {
    // Crash left the pool mid-backfill at last_indexed_block=102 (swap at 101
    // already indexed). A swap at 104 is still missing. Global cursor is 105.
    mocks.chainSwaps.push(swapAt(101n, 7), swapAt(104n, 9));
    const db = fakeDb({
      launches: [VERIFIED_LAUNCH_AT_100],
      cursor: 105n,
      poolSync: [
        [POOL_ID.toLowerCase(), { token: TOKEN, start: 100n, last: 102n, state: "backfilling" }],
      ],
    });
    db.swaps.set(`${TX}:7`, []); // block-101 swap persisted before the crash

    await pollOnce(mockClient(109n), db.pool, makeEnv());

    // Resumed at 103 (not 100): the already-indexed block-101 swap is never re-fetched.
    expect(mocks.calls[0].fromBlock).toBe(103n);
    expect(mocks.calls[0].toBlock).toBe(105n);
    expect(db.swapInsertAttempts).toEqual([`${TX}:9`]);
    expect(db.swaps.has(`${TX}:9`)).toBe(true);

    // Backfill completed: state 'current' at the covered cursor.
    const row = db.poolSync.get(POOL_ID.toLowerCase());
    expect(row?.state).toBe("current");
    expect(row?.last).toBe(105n);
  });

  it("chunks backfill getLogs requests to at most 5000 blocks", async () => {
    // Launch at 100, cursor far ahead at 12105, oversized env chunk (10000).
    const db = fakeDb({ launches: [VERIFIED_LAUNCH_AT_100], cursor: 12_105n });
    await pollOnce(mockClient(12_108n), db.pool, makeEnv({ chunkBlocks: 10_000n }));

    const backfillCalls = mocks.calls.filter((c) => c.ids.length === 1);
    expect(backfillCalls.map((c) => [c.fromBlock, c.toBlock])).toEqual([
      [100n, 5_099n],
      [5_100n, 10_099n],
      [10_100n, 12_105n],
    ]);
    for (const c of backfillCalls) {
      expect(c.toBlock - c.fromBlock + 1n <= 5_000n).toBe(true);
    }
    expect(db.poolSync.get(POOL_ID.toLowerCase())?.state).toBe("current");
  });

  it("registers a market as 'current' immediately when the global cursor has not reached its launch block", async () => {
    // Launch at 100 but the global cursor is only at 95: the global scan will
    // cover the launch blocks itself — no backfill request must be issued.
    mocks.chainSwaps.push(swapAt(101n));
    const db = fakeDb({ launches: [VERIFIED_LAUNCH_AT_100], cursor: 95n });

    await pollOnce(mockClient(109n), db.pool, makeEnv());

    expect(db.poolSync.get(POOL_ID.toLowerCase())?.state).toBe("current");
    // Only the global scan ran (96..106), and it captured the swap once.
    expect(mocks.calls).toHaveLength(1);
    expect(mocks.calls[0].fromBlock).toBe(96n);
    expect(mocks.calls[0].toBlock).toBe(106n);
    expect(db.swapInsertAttempts).toEqual([`${TX}:7`]);
  });
});
