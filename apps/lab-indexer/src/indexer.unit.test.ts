import { afterEach, describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { readEnv, redact } from "./env.js";
import { MIGRATIONS } from "./db.js";
import { decodeLaunchLog, GOOGL_ADDRESS } from "./chain.js";
import { GOOGL_ADDRESS as LIB_GOOGL } from "../../../packages/launch-lab/src/config/index.js";

const INIT = getAddress("0x4e3468951D49f2EEa976eD0D6e75fFCb44a9a544");
const TOKEN = getAddress("0x1F212fccea9995931f4f2F9CA0C8b641188Ca196");
const HOOK = getAddress("0x9982538F41f2ae29ddb9d3D9307010052984FDbB");

function fakeLog(args: Record<string, unknown>, block = 1n): never {
  return { args, blockNumber: block, transactionHash: `0x${"ab".repeat(32)}` } as never;
}

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
  it("applies defaults for missing/empty knobs and never logs secrets", () => {
    process.env.DATABASE_URL = "postgresql://user:supersecret@dbhost:5432/db";
    process.env.ROBINHOOD_CHAIN_RPC_URL = "https://rpc.example/private-key-path";
    process.env.BPS_LAB_INDEXER_POLL_MS = "";
    const env = readEnv();
    expect(env.pollMs).toBe(15_000);
    expect(env.chunkBlocks).toBe(2000n);
    expect(env.confirmations).toBe(3n);
    const leaked = `failed: ${process.env.DATABASE_URL} and ${process.env.ROBINHOOD_CHAIN_RPC_URL}`;
    const out = redact(leaked);
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
});

describe("launch decoding", () => {
  const base = {
    asset: TOKEN,
    numeraire: GOOGL_ADDRESS,
    initializer: INIT,
    poolOrHook: HOOK,
  };
  it("GOOGL constant matches @bps/launch-lab", () => {
    expect(GOOGL_ADDRESS).toBe(LIB_GOOGL);
  });
  it("accepts a lab launch", () => {
    const d = decodeLaunchLog(fakeLog(base), INIT);
    expect(d?.tokenAddress).toBe(TOKEN);
    expect(d?.poolOrHook).toBe(HOOK);
  });
  it("rejects wrong numeraire and wrong initializer", () => {
    expect(decodeLaunchLog(fakeLog({ ...base, numeraire: TOKEN }), INIT)).toBeNull();
    expect(decodeLaunchLog(fakeLog({ ...base, initializer: HOOK }), INIT)).toBeNull();
  });
});
