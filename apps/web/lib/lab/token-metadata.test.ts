import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readContract, query, pgState } = vi.hoisted(() => ({
  readContract: vi.fn(),
  query: vi.fn(),
  pgState: { available: true },
}));

vi.mock("./server", () => ({ getLabClient: () => ({ readContract }) }));
vi.mock("./store", () => ({ getPg: async () => (pgState.available ? { query } : null) }));

import { __clearTokenMetadataCache, fetchTokenMetadata } from "./token-metadata";

const TOKEN = "0x7382C73b2830e6521a5167aa7347CAF0f39Ad0d5";
const META_CID = "QmbbgZydTF7ySXtEpDszpu9riL8RiSXZQ5yXWRBvkCdSBE";
const IMAGE_CID = "QmZGePsaYD1U7wCTFA5kkfATSpvMdFAQriKX4N6hUmMNds";
const TOKEN_URI = `ipfs://${META_CID}`;
const PINATA = "https://gateway.pinata.cloud/ipfs/";
const IPFS_IO = "https://ipfs.io/ipfs/";

const METADATA = {
  name: "mag8",
  symbol: "MAG8",
  description: "bps test",
  image: `ipfs://${IMAGE_CID}`,
};

function manifestRow(tokenUri: string | null) {
  query.mockResolvedValue({
    rows: tokenUri === null ? [] : [{ launch_manifest: { tokenUri } }],
  });
}

function jsonRes(body: unknown, okFlag = true, contentLength?: number) {
  return {
    ok: okFlag,
    headers: {
      get: (h: string) =>
        h === "content-length" && contentLength !== undefined ? String(contentLength) : null,
    },
    text: async () => JSON.stringify(body),
  };
}

function stubFetch(impl: (url: string) => Promise<unknown>) {
  const fetchMock = vi.fn(async (url: string) => impl(url));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const UNAVAILABLE = {
  available: false,
  name: null,
  description: null,
  imageUrl: null,
  tokenUri: null,
  source: null,
  fetchedAt: expect.any(Number),
};

beforeEach(() => {
  __clearTokenMetadataCache();
  pgState.available = true;
  query.mockReset();
  readContract.mockReset();
  readContract.mockRejectedValue(new Error("execution reverted"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTokenMetadata", () => {
  it("resolves the manifest tokenUri through the Pinata gateway and maps the fields", async () => {
    manifestRow(TOKEN_URI);
    const fetchMock = stubFetch(async () => jsonRes(METADATA));
    const meta = await fetchTokenMetadata(TOKEN);
    expect(meta).toEqual({
      available: true,
      name: "mag8",
      description: "bps test",
      imageUrl: `${PINATA}${IMAGE_CID}`,
      tokenUri: TOKEN_URI,
      source: "token-uri",
      fetchedAt: expect.any(Number),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${PINATA}${META_CID}`);
    // The manifest satisfied the URI — the chain was never consulted.
    expect(readContract).not.toHaveBeenCalled();
  });

  it("falls back to the on-chain tokenURI() when the manifest has no tokenUri", async () => {
    manifestRow(null);
    readContract.mockResolvedValue(TOKEN_URI);
    stubFetch(async () => jsonRes(METADATA));
    const meta = await fetchTokenMetadata(TOKEN);
    expect(meta.available).toBe(true);
    expect(meta.tokenUri).toBe(TOKEN_URI);
    expect(readContract).toHaveBeenCalledTimes(1);
  });

  it("is available:false when neither the manifest nor the chain yields a URI", async () => {
    manifestRow(null);
    const fetchMock = stubFetch(async () => jsonRes(METADATA));
    expect(await fetchTokenMetadata(TOKEN)).toEqual(UNAVAILABLE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("survives an unavailable database by reading the chain", async () => {
    pgState.available = false;
    readContract.mockResolvedValue(TOKEN_URI);
    stubFetch(async () => jsonRes(METADATA));
    expect((await fetchTokenMetadata(TOKEN)).available).toBe(true);
  });

  it("rejects tokenUri schemes other than ipfs:// and https:// without fetching", async () => {
    manifestRow("data:application/json,%7B%22name%22%3A%22evil%22%7D");
    const fetchMock = stubFetch(async () => jsonRes(METADATA));
    expect(await fetchTokenMetadata(TOKEN)).toEqual(UNAVAILABLE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches a plain https tokenUri directly", async () => {
    const httpsUri = "https://example.com/meta/1.json";
    manifestRow(httpsUri);
    const fetchMock = stubFetch(async () => jsonRes(METADATA));
    const meta = await fetchTokenMetadata(TOKEN);
    expect(meta.available).toBe(true);
    expect(meta.tokenUri).toBe(httpsUri);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(httpsUri);
  });

  it("passes https images through and nulls non-ipfs, non-https images", async () => {
    manifestRow(TOKEN_URI);
    stubFetch(async () => jsonRes({ ...METADATA, image: "https://example.com/art.png" }));
    expect((await fetchTokenMetadata(TOKEN)).imageUrl).toBe("https://example.com/art.png");
    __clearTokenMetadataCache();
    stubFetch(async () => jsonRes({ ...METADATA, image: "javascript:alert(1)" }));
    const meta = await fetchTokenMetadata(TOKEN);
    expect(meta.available).toBe(true);
    expect(meta.imageUrl).toBeNull();
  });

  it("falls back to the ipfs.io gateway when the Pinata gateway fails", async () => {
    manifestRow(TOKEN_URI);
    const fetchMock = stubFetch(async (url) => {
      if (url.startsWith(PINATA)) throw new Error("gateway down: secret detail");
      return jsonRes(METADATA);
    });
    const meta = await fetchTokenMetadata(TOKEN);
    expect(meta.available).toBe(true);
    // The image resolves through the gateway that actually served the JSON.
    expect(meta.imageUrl).toBe(`${IPFS_IO}${IMAGE_CID}`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${IPFS_IO}${META_CID}`);
  });

  it("is available:false when every gateway fails, without throwing or leaking", async () => {
    manifestRow(TOKEN_URI);
    stubFetch(async () => {
      throw new Error("upstream exploded: secret-bearing detail");
    });
    expect(await fetchTokenMetadata(TOKEN)).toEqual(UNAVAILABLE);
  });

  it("rejects oversized metadata payloads", async () => {
    manifestRow(TOKEN_URI);
    stubFetch(async () => jsonRes(METADATA, true, 10 * 1024 * 1024));
    expect(await fetchTokenMetadata(TOKEN)).toEqual(UNAVAILABLE);
  });

  it("rejects non-object metadata JSON", async () => {
    manifestRow(TOKEN_URI);
    stubFetch(async () => jsonRes(["not", "an", "object"]));
    expect(await fetchTokenMetadata(TOKEN)).toEqual(UNAVAILABLE);
  });

  it("serves a cached result within the TTL and re-fetches after the cache is cleared", async () => {
    manifestRow(TOKEN_URI);
    const fetchMock = stubFetch(async () => jsonRes(METADATA));
    const first = await fetchTokenMetadata(TOKEN);
    const second = await fetchTokenMetadata(TOKEN.toLowerCase());
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    __clearTokenMetadataCache();
    await fetchTokenMetadata(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures — a later success is picked up", async () => {
    manifestRow(TOKEN_URI);
    stubFetch(async () => {
      throw new Error("boom");
    });
    expect((await fetchTokenMetadata(TOKEN)).available).toBe(false);
    stubFetch(async () => jsonRes(METADATA));
    expect((await fetchTokenMetadata(TOKEN)).available).toBe(true);
  });

  it("returns available:false for an invalid address without any lookups", async () => {
    const fetchMock = stubFetch(async () => jsonRes(METADATA));
    expect(await fetchTokenMetadata("not-an-address")).toEqual(UNAVAILABLE);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(readContract).not.toHaveBeenCalled();
  });
});
