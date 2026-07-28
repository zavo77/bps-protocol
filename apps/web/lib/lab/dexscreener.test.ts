import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __clearDexCache, fetchDexScreenerPair } from "./dexscreener";

const TOKEN = "0x1F212fccea9995931f4f2F9CA0C8b641188Ca196";
const PAIR_URL = "https://dexscreener.com/robinhoodchain/0xpairaddressfromapi";

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

const fullPair = {
  url: PAIR_URL,
  dexId: "rialto",
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
  it("returns null when the token is not yet indexed (empty or null pairs)", async () => {
    stub({ pairs: [] });
    expect(await fetchDexScreenerPair(TOKEN)).toBeNull();
    stub({ pairs: null });
    expect(await fetchDexScreenerPair(TOKEN)).toBeNull();
  });

  it("maps all fields and passes the API's pair url through verbatim", async () => {
    const fetchMock = stub({ pairs: [fullPair] });
    const pair = await fetchDexScreenerPair(TOKEN);
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
      dexId: "rialto",
    });
    const url = fetchMock.mock.calls[0]?.[0] ?? "";
    expect(url).toContain("api.dexscreener.com/latest/dex/tokens/");
  });

  it("maps missing optional fields to null", async () => {
    stub({ pairs: [{ url: PAIR_URL, txns: { h24: { buys: 5 } } }] });
    const pair = await fetchDexScreenerPair(TOKEN);
    expect(pair).toEqual({
      url: PAIR_URL,
      priceUsd: null,
      priceNative: null,
      liquidityUsd: null,
      fdv: null,
      marketCap: null,
      volume24h: null,
      // buys without sells is incomplete — collapse to null, not NaN.
      txns24h: null,
      priceChange24h: null,
      pairCreatedAt: null,
      dexId: null,
    });
  });

  it("picks the pair with the highest liquidity.usd", async () => {
    stub({
      pairs: [
        { url: "https://dexscreener.com/low", liquidity: { usd: 100 } },
        { url: "https://dexscreener.com/high", liquidity: { usd: 50_000 } },
        { url: "https://dexscreener.com/mid", liquidity: { usd: 9_000 } },
      ],
    });
    const pair = await fetchDexScreenerPair(TOKEN);
    expect(pair?.url).toBe("https://dexscreener.com/high");
    expect(pair?.liquidityUsd).toBe(50_000);
  });

  it("skips pairs without a url — the link is never constructed locally", async () => {
    stub({
      pairs: [
        { liquidity: { usd: 999_999 } },
        { url: "https://dexscreener.com/only-linked", liquidity: { usd: 1 } },
      ],
    });
    const pair = await fetchDexScreenerPair(TOKEN);
    expect(pair?.url).toBe("https://dexscreener.com/only-linked");
  });

  it("returns null on upstream failure without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string) => {
        throw new Error("upstream exploded: secret-bearing detail");
      }),
    );
    expect(await fetchDexScreenerPair(TOKEN)).toBeNull();
    stub({}, false);
    expect(await fetchDexScreenerPair(TOKEN)).toBeNull();
  });

  it("serves a cached pair within the TTL (fetch called once)", async () => {
    const fetchMock = stub({ pairs: [fullPair] });
    const first = await fetchDexScreenerPair(TOKEN);
    const second = await fetchDexScreenerPair(TOKEN.toLowerCase());
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null for an invalid address without calling fetch", async () => {
    const fetchMock = stub({ pairs: [fullPair] });
    expect(await fetchDexScreenerPair("not-an-address")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
