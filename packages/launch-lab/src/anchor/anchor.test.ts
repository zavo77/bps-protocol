import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { resolveAnchor } from "./index";
import { GOOGL_ADDRESS } from "../config/index";

type Reads = { name?: string; symbol?: string; decimals?: number; fail?: boolean };

function mockClient(reads: Reads): PublicClient {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (reads.fail) throw new Error("revert");
      if (functionName === "name") return reads.name ?? "Alphabet Class A • Robinhood Token";
      if (functionName === "symbol") return reads.symbol ?? "GOOGL";
      if (functionName === "decimals") return reads.decimals ?? 18;
      throw new Error(`unexpected read ${functionName}`);
    }),
  } as unknown as PublicClient;
}

function mockApi(opts?: {
  address?: string;
  status?: string;
  multiplier?: string;
  bid?: string;
  ask?: string;
  missing?: boolean;
}) {
  const asset = {
    tokenSymbol: "GOOGL",
    tokenName: "Alphabet Class A • Robinhood Token",
    status: opts?.status ?? "ASSET_STATUS_ACTIVE",
    currentMultiplier: opts?.multiplier ?? "1.000000000000000000",
    deployments: [{ chainId: 4663, contractAddress: opts?.address ?? GOOGL_ADDRESS }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/assets")) {
        return { ok: true, json: async () => (opts?.missing ? [] : [asset]) };
      }
      return {
        ok: true,
        json: async () => ({ quotes: [{ bid: opts?.bid ?? "323.8", ask: opts?.ask ?? "324.0" }] }),
      };
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveAnchor (fail closed)", () => {
  it("verifies the canonical GOOGL and applies the multiplier", async () => {
    mockApi({ multiplier: "2.000000000000000000" });
    const r = await resolveAnchor(mockClient({}), { bypassCache: true });
    expect(r.status).toBe("verified");
    // mid = (323.8+324.0)/2 * 2
    expect(Number(r.midPriceUsd)).toBeCloseTo(647.8, 3);
    expect(r.currentMultiplier).toBe("2.000000000000000000");
  });

  it.each([
    ["wrong on-chain symbol", { client: { symbol: "WRONG" }, api: {} }],
    ["wrong decimals", { client: { decimals: 6 }, api: {} }],
    ["on-chain read failure", { client: { fail: true }, api: {} }],
    [
      "API address mismatch",
      { client: {}, api: { address: "0x0000000000000000000000000000000000000001" } },
    ],
    ["inactive asset", { client: {}, api: { status: "ASSET_STATUS_HALTED" } }],
    ["missing asset", { client: {}, api: { missing: true } }],
    ["invalid multiplier", { client: {}, api: { multiplier: "0" } }],
    ["no price", { client: {}, api: { bid: "0", ask: "0" } }],
  ])("mismatches on %s", async (_label, cfg) => {
    mockApi(cfg.api as never);
    const r = await resolveAnchor(mockClient(cfg.client as Reads), { bypassCache: true });
    expect(r.status).toBe("mismatch");
    expect(r.mismatchReason).toBeTruthy();
  });
});
