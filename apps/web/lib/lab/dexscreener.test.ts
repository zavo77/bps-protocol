import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __clearDexCache, fetchDexScreenerPair, type DexPairBinding } from "./dexscreener";

const TOKEN = "0x7382C73b2830e6521a5167aa7347CAF0f39Ad0d5";
const ANCHOR = "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3";
const POOL_ID = "0x1ffc403eaf47aeefece21df47b4fdc4bc5fc6af269a5a21b2c14f5ab15ac4509";
const POOL_OR_HOOK = "0x9b0bA129d78F60433b3c9E42be9BB89F32d33144";
const PAIR_URL = `https://dexscreener.com/robinhood/${POOL_ID}`;

const BINDING: DexPairBinding = { anchorAddress: ANCHOR, poolId: POOL_ID, poolOrHook: POOL_OR_HOOK };

beforeEach(() => {
  __clearDexCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stub(body: unknown, okFlag = true) {
  const fetchMock = vi.fn(async (_url: string) => ({ ok: okFlag, json: async () => body }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Shape observed live from token-pairs/v1/robinhood/{MAG8}: a bare JSON array
// whose pairAddress is the v4 poolId bytes32.
const fullPair = {
  chainId: "robinhood",
  pairAddress: POOL_ID,
  baseToken: { address: TOKEN, symbol: "MAG8" },
  quoteToken: { address: ANCHOR, symbol: "GOOGL" },
  url: PAIR_URL,
  dexId: "uniswap",
  priceUsd: "1.23",
  priceNative: "0.00045",
  liquidity: { usd: 12345.67 },
  fdv: 1_000_000,
  marketCap: 900_000,
  volume: { h24: 4321.5 },
  txns: { h24: { buys: 10, sells: 4 } },
  priceChange: { h24: -3.21 },
  pairCreatedAt: 1_753_000_000_000,
};

describe("fetchDexScreenerPair", () => {
  it("returns null when the token is not yet indexed (empty or non-array body)", async () => {
    stub([]);
    expect(await fetchDexScreenerPair(TOKEN, BINDING)).toBeNull();
    stub(null);
    expect(await fetchDexScreenerPair(TOKEN, BINDING)).toBeNull();
    stub({ pairs: [fullPair] }); // legacy envelope is NOT the v1 contract
    expect(await fetchDexScreenerPair(TOKEN, BINDING)).toBeNull();
  });

  it("calls the chain-scoped token-pairs endpoint and maps all fields verbatim", async () => {
    const fetchMock = stub([fullPair]);
    const pair = await fetchDexScreenerPair(TOKEN, BINDING);
    expect(pair).toEqual({
      url: PAIR_URL,
      priceUsd: "1.23",
      priceNative: "0.00045",
      liquidityUsd: 12345.67,
      fdv: 1_000_000,
      marketCap: 900_000,
      volume24h: 4321.5,
      txns24h: { buys: 10, sells: 4 },
      priceChange24h: -3.21,
      pairCreatedAt: 1_753_000_000_000,
      dexId: "uniswap",
    });
    const url = fetchMock.mock.calls[0]?.[0] ?? "";
    expect(url).toContain("api.dexscreener.com/token-pairs/v1/robinhood/");
  });

  it("maps missing optional fields to null", async () => {
    stub([
      {
        ...fullPair,
        priceUsd: undefined,
        priceNative: undefined,
        liquidity: undefined,
        fdv: undefined,
        marketCap: undefined,
        volume: undefined,
        // buys without sells is incomplete — collapse to null, not NaN.
        txns: { h24: { buys: 5 } },
        priceChange: undefined,
        pairCreatedAt: undefined,
        dexId: undefined,
      },
    ]);
    const pair = await fetchDexScreenerPair(TOKEN, BINDING);
    expect(pair).toEqual({
      url: PAIR_URL,
      priceUsd: null,
      priceNative: null,
      liquidityUsd: null,
      fdv: null,
      marketCap: null,
      volume24h: null,
      txns24h: null,
      priceChange24h: null,
      pairCreatedAt: null,
      dexId: null,
    });
  });

  it("rejects a pair on the wrong chain slug", async () => {
    stub([{ ...fullPair, chainId: "ethereum" }]);
    expect(await fetchDexScreenerPair(TOKEN, BINDING)).toBeNull();
  });

  it("rejects a pair whose base token is not the lab token", async () => {
    stub([{ ...fullPair, baseToken: { address: POOL_OR_HOOK } }]);
    expect(await fetchDexScreenerPair(TOKEN, BINDING)).toBeNull();
  });

  it("rejects a pair whose quote token is not the market's anchor", async () => {
    stub([{ ...fullPair, quoteToken: { address: "0x000000000000000000000000000000000000dEaD" } }]);
    expect(await fetchDexScreenerPair(TOKEN, BINDING)).toBeNull();
  });

  it("rejects a pairAddress that matches neither poolId nor poolOrHook when binding is provided", async () => {
    stub([{ ...fullPair, pairAddress: "0x" + "ab".repeat(32) }]);
    expect(await fetchDexScreenerPair(TOKEN, BINDING)).toBeNull();
  });

  it("accepts pairAddress equal to the v4 poolId or the pool_or_hook, case-insensitively", async () => {
    stub([{ ...fullPair, pairAddress: POOL_ID.toUpperCase().replace("0X", "0x") }]);
    expect((await fetchDexScreenerPair(TOKEN, BINDING))?.url).toBe(PAIR_URL);
    __clearDexCache();
    stub([{ ...fullPair, pairAddress: POOL_OR_HOOK.toLowerCase() }]);
    expect((await fetchDexScreenerPair(TOKEN, BINDING))?.url).toBe(PAIR_URL);
  });

  it("skips the pairAddress check when no pool binding is provided (chain+base+quote still required)", async () => {
    stub([{ ...fullPair, pairAddress: "0xsomethingelse" }]);
    const pair = await fetchDexScreenerPair(TOKEN, { anchorAddress: ANCHOR });
    expect(pair?.url).toBe(PAIR_URL);
  });

  it("rejects a pair whose url is not a dexscreener.com link", async () => {
    stub([{ ...fullPair, url: "https://evil.example/robinhood/pair" }]);
    expect(await fetchDexScreenerPair(TOKEN, BINDING)).toBeNull();
    stub([{ ...fullPair, url: undefined }]);
    expect(await fetchDexScreenerPair(TOKEN, BINDING)).toBeNull();
  });

  it("picks the highest-liquidity pair among fully matching candidates", async () => {
    stub([
      { ...fullPair, url: "https://dexscreener.com/robinhood/low", liquidity: { usd: 100 } },
      { ...fullPair, url: "https://dexscreener.com/robinhood/high", liquidity: { usd: 50_000 } },
      { ...fullPair, url: "https://dexscreener.com/robinhood/mid", liquidity: { usd: 9_000 } },
    ]);
    const pair = await fetchDexScreenerPair(TOKEN, BINDING);
    expect(pair?.url).toBe("https://dexscreener.com/robinhood/high");
    expect(pair?.liquidityUsd).toBe(50_000);
  });

  it("returns null without fetching when the anchor address is missing or invalid", async () => {
    const fetchMock = stub([fullPair]);
    expect(await fetchDexScreenerPair(TOKEN, { anchorAddress: null })).toBeNull();
    expect(await fetchDexScreenerPair(TOKEN, { anchorAddress: "not-an-address" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null on upstream failure without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string) => {
        throw new Error("upstream exploded: secret-bearing detail");
      }),
    );
    expect(await fetchDexScreenerPair(TOKEN, BINDING)).toBeNull();
    stub([], false);
    expect(await fetchDexScreenerPair(TOKEN, BINDING)).toBeNull();
  });

  it("serves a cached pair within the TTL (fetch called once)", async () => {
    const fetchMock = stub([fullPair]);
    const first = await fetchDexScreenerPair(TOKEN, BINDING);
    const second = await fetchDexScreenerPair(TOKEN.toLowerCase(), {
      anchorAddress: ANCHOR.toLowerCase(),
      poolId: POOL_ID.toUpperCase().replace("0X", "0x"),
      poolOrHook: POOL_OR_HOOK.toLowerCase(),
    });
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not share cache entries across different bindings", async () => {
    const fetchMock = stub([fullPair]);
    await fetchDexScreenerPair(TOKEN, BINDING);
    await fetchDexScreenerPair(TOKEN, { anchorAddress: ANCHOR });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null for an invalid token address without calling fetch", async () => {
    const fetchMock = stub([fullPair]);
    expect(await fetchDexScreenerPair("not-an-address", BINDING)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
