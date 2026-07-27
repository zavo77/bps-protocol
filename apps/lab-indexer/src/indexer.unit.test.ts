import { afterEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { readEnv, redact } from "./env.js";
import { MIGRATIONS } from "./db.js";
import { GOOGL_ADDRESS } from "./chain.js";
import { GOOGL_ADDRESS as LIB_GOOGL } from "../../../packages/launch-lab/src/config/index.js";
import { reloadTrackedMarkets, status } from "./indexer.js";
import type { PublicClient } from "viem";
import type pg from "pg";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("env", () => {
  it("throws listing missing required vars", () => {
    delete process.env.DATABASE_URL;
    delete process.env.ROBINHOOD_CHAIN_RPC_URL;
    expect(() => readEnv()).toThrow(/DATABASE_URL, ROBINHOOD_CHAIN_RPC_URL/);
  });
  it("applies defaults and never logs secrets", () => {
    process.env.DATABASE_URL = "postgresql://user:supersecret@dbhost:5432/db";
    process.env.ROBINHOOD_CHAIN_RPC_URL = "https://rpc.example/private-key-path";
    const env = readEnv();
    expect(env.pollMs).toBe(15_000);
    const out = redact(`fail: ${process.env.DATABASE_URL} ${process.env.ROBINHOOD_CHAIN_RPC_URL}`);
    expect(out).not.toContain("supersecret");
    expect(out).not.toContain("private-key-path");
    expect(out).toContain("[DATABASE_URL]");
  });
});

describe("migrations", () => {
  it("every statement is additive and idempotent", () => {
    for (const stmt of MIGRATIONS) {
      expect(/IF NOT EXISTS/i.test(stmt)).toBe(true);
      expect(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i.test(stmt)).toBe(false);
    }
  });
  it("adds the provenance gate columns", () => {
    const joined = MIGRATIONS.join(" ");
    expect(joined).toMatch(/provenance_verified/);
    expect(joined).toMatch(/lab_prepared/);
  });
});

describe("GOOGL constant sync", () => {
  it("matches @bps/launch-lab", () => {
    expect(GOOGL_ADDRESS).toBe(LIB_GOOGL);
  });
});

// The indexer's tracked set = provenance-verified BPS rows ONLY. Chain events
// never add a market. These tests prove external markets are excluded and only
// verified BPS markets (with a resolvable poolId) become known pools.
function mockClient(): PublicClient {
  return {
    getBlockNumber: vi.fn(async () => 100n),
    readContract: vi.fn(async () => [
      "0x0000000000000000000000000000000000000000",
      0n,
      "0x0000000000000000000000000000000000000000",
      "0x",
      2,
      {
        currency0: getAddress("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3"),
        currency1: getAddress("0x1F212fccea9995931f4f2F9CA0C8b641188Ca196"),
        fee: 10000,
        tickSpacing: 200,
        hooks: getAddress("0x9982538F41f2ae29ddb9d3D9307010052984FDbB"),
      },
      0,
    ]),
  } as unknown as PublicClient;
}

function mockPg(
  verifiedRows: {
    token_address: string;
    numeraire: string;
    pool_or_hook: string;
    pool_id: string | null;
  }[],
): pg.Pool {
  return {
    query: vi.fn(async (text: string) => {
      if (/FROM lab_launches WHERE provenance_verified = true/.test(text)) {
        return { rows: verifiedRows };
      }
      return { rows: [] };
    }),
  } as unknown as pg.Pool;
}

describe("provenance-gated tracking", () => {
  it("tracks only verified rows and resolves their poolId", async () => {
    const pg = mockPg([
      {
        token_address: "0x1f212fccea9995931f4f2f9ca0c8b641188ca196",
        numeraire: "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3",
        pool_or_hook: "0x9982538f41f2ae29ddb9d3d9307010052984fdbb",
        pool_id: null,
      },
    ]);
    await reloadTrackedMarkets(mockClient(), pg);
    expect(status.trackedMarkets).toBe(1);
    expect(status.knownPools).toBe(1); // poolId resolved via getState
  });

  it("tracks zero markets when there are no verified rows (external markets excluded)", async () => {
    await reloadTrackedMarkets(mockClient(), mockPg([]));
    expect(status.trackedMarkets).toBe(0);
    expect(status.knownPools).toBe(0);
  });
});
