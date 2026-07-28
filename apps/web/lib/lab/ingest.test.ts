import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, parseAbiParameters } from "viem";

// POST /api/lab/trade/ingest — server-verified immediate swap ingestion.
// The live poolId/log shapes mirror the real first market
// (0x7382…d0d5, pool 0x1ffc403e…4509, buy tx 0xdc37b492…).

const POOL_ID = "0x1ffc403eaf47aeefece21df47b4fdc4bc5fc6af269a5a21b2c14f5ab15ac4509";
const TOKEN = "0x7382C73b2830e6521a5167aa7347CAF0f39Ad0d5";
const TX = `0x${"dc".repeat(32)}`;
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
// keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)")
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const m = vi.hoisted(() => ({
  client: {
    getTransactionReceipt: vi.fn(),
    getBlock: vi.fn(async () => ({ timestamp: 1_785_240_000n })),
  },
  pg: { query: vi.fn() },
}));

vi.mock("../../lib/lab/server", () => ({ getLabClient: () => m.client }));
vi.mock("../../lib/lab/store", () => ({ getPg: async () => m.pg }));

import { POST } from "../../app/api/lab/trade/ingest/route";

function swapLogData() {
  return encodeAbiParameters(parseAbiParameters("int128, int128, uint160, uint128, int24, uint24"), [
    -57442260344809n,
    901785111775038994801n,
    315496595509454968698113418325478n,
    1n,
    165799,
    10000,
  ]);
}

function makeReq(body: Record<string, unknown>) {
  return new Request("https://lab.test/api/lab/trade/ingest", {
    method: "POST",
    headers: {
      origin: "https://lab.test",
      host: "lab.test",
      "content-type": "application/json",
      "x-forwarded-for": `10.9.0.${Math.floor(Math.random() * 250)}`,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.pg.query.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT pool_id")) return { rows: [{ pool_id: POOL_ID }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  m.client.getBlock.mockResolvedValue({ timestamp: 1_785_240_000n });
  m.client.getTransactionReceipt.mockResolvedValue({
    status: "success",
    blockNumber: 21552602n,
    from: "0x78B256A742FA2c0F84EbdAf570fcdC16EE206024",
    logs: [
      {
        address: POOL_MANAGER,
        data: swapLogData(),
        topics: [SWAP_TOPIC, POOL_ID, `0x${"00".repeat(12)}${"aa61254627B7392B0bC922097b10eB0587db2Be7".toLowerCase()}`],
        logIndex: 8,
      },
    ],
  });
});

describe("POST /api/lab/trade/ingest", () => {
  it("verifies the receipt server-side and ingests the market's Swap idempotently", async () => {
    const res = await POST(makeReq({ txHash: TX, marketToken: TOKEN }));
    const body = (await res.json()) as { ok: boolean; data: { ingested: number; swaps: { amount0: string }[] } };
    expect(res.status).toBe(200);
    expect(body.data.ingested).toBe(1);
    expect(body.data.swaps[0]!.amount0).toBe("-57442260344809");
    // Idempotent: on conflict only the trader-identity columns are filled
    // (COALESCE keeps existing values) — amounts are never overwritten.
    const insert = m.pg.query.mock.calls.find((c) => String(c[0]).includes("INSERT INTO lab_swaps"));
    const sql = String(insert![0]);
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(sql).toContain("event_sender = COALESCE(lab_swaps.event_sender, EXCLUDED.event_sender)");
    expect(sql).toContain(
      "transaction_from = COALESCE(lab_swaps.transaction_from, EXCLUDED.transaction_from)",
    );
    expect(sql).not.toMatch(/DO UPDATE SET[\s\S]*amount0/);
    // Trader identity: decoded event sender + receipt.from, both lowercased.
    const params = insert![1] as unknown[];
    expect(params).toContain("0xaa61254627b7392b0bc922097b10eb0587db2be7");
    expect(params).toContain("0x78b256a742fa2c0f84ebdaf570fcdc16ee206024");
  });

  it("rejects unverified markets (404) without touching the chain", async () => {
    m.pg.query.mockImplementation(async (sql: string) =>
      sql.includes("SELECT pool_id") ? { rows: [], rowCount: 0 } : { rows: [], rowCount: 0 },
    );
    const res = await POST(makeReq({ txHash: TX, marketToken: TOKEN }));
    expect(res.status).toBe(404);
    expect(m.client.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("rejects failed transactions (409)", async () => {
    m.client.getTransactionReceipt.mockResolvedValue({ status: "reverted", blockNumber: 1n, logs: [] });
    const res = await POST(makeReq({ txHash: TX, marketToken: TOKEN }));
    expect(res.status).toBe(409);
  });

  it("ignores swaps on other poolIds (404 NO_MARKET_SWAP)", async () => {
    m.client.getTransactionReceipt.mockResolvedValue({
      status: "success",
      blockNumber: 1n,
      logs: [
        {
          address: POOL_MANAGER,
          data: swapLogData(),
          topics: [SWAP_TOPIC, `0x${"ab".repeat(32)}`, `0x${"00".repeat(32)}`],
          logIndex: 1,
        },
      ],
    });
    const res = await POST(makeReq({ txHash: TX, marketToken: TOKEN }));
    expect(res.status).toBe(404);
    const insert = m.pg.query.mock.calls.find((c) => String(c[0]).includes("INSERT INTO lab_swaps"));
    expect(insert).toBeUndefined();
  });
});
