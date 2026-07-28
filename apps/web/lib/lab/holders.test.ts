import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __clearHolderCache, fetchHolderCount } from "./holders";

const TOKEN = "0x1F212fccea9995931f4f2F9CA0C8b641188Ca196";

beforeEach(() => {
  __clearHolderCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ok(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("fetchHolderCount", () => {
  it("parses a string token_holders_count from the counters endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string) => ok({ token_holders_count: "42" }));
    vi.stubGlobal("fetch", fetchMock);
    const info = await fetchHolderCount(TOKEN);
    expect(info.holderCount).toBe(42);
    expect(info.source).toBe("blockscout");
    expect(info.fetchedAt).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0]?.[0] ?? "";
    expect(url).toContain("robinhoodchain.blockscout.com/api/v2/tokens/");
    expect(url).toContain("/counters");
  });

  it("falls back to the token endpoint's holders field when counters fail", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/counters")) return { ok: false, json: async () => ({}) };
      return ok({ holders: "7" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const info = await fetchHolderCount(TOKEN);
    expect(info.holderCount).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serves a cached count within the TTL (fetch called once)", async () => {
    const fetchMock = vi.fn(async (_url: string) => ok({ token_holders_count: 12 }));
    vi.stubGlobal("fetch", fetchMock);
    const first = await fetchHolderCount(TOKEN);
    const second = await fetchHolderCount(TOKEN.toLowerCase());
    expect(first.holderCount).toBe(12);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves to null holderCount on upstream failure without throwing", async () => {
    const fetchMock = vi.fn(async (_url: string) => {
      throw new Error("upstream exploded: secret-bearing detail");
    });
    vi.stubGlobal("fetch", fetchMock);
    const info = await fetchHolderCount(TOKEN);
    expect(info).toEqual({
      holderCount: null,
      source: "blockscout",
      fetchedAt: expect.any(Number),
    });
    // Both endpoints were tried; the failure was swallowed, not thrown.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures — a later success is picked up", async () => {
    const failing = vi.fn(async (_url: string) => {
      throw new Error("boom");
    });
    vi.stubGlobal("fetch", failing);
    expect((await fetchHolderCount(TOKEN)).holderCount).toBeNull();
    const succeeding = vi.fn(async (_url: string) => ok({ token_holders_count: "3" }));
    vi.stubGlobal("fetch", succeeding);
    expect((await fetchHolderCount(TOKEN)).holderCount).toBe(3);
  });

  it("rejects an invalid address without calling fetch", async () => {
    const fetchMock = vi.fn(async (_url: string) => ok({ token_holders_count: "1" }));
    vi.stubGlobal("fetch", fetchMock);
    const info = await fetchHolderCount("not-an-address");
    expect(info.holderCount).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
