import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for POST /api/lab/metadata — the envelope-free upload contract.
// The route must require NO signed envelope (the deployment transaction
// authenticates the creator later); instead it enforces same-origin, MIME
// allowlist, size caps, per-IP + per-claimed-wallet rate limits, and
// content-hash deduplication (identical content returns the SAME CIDs
// without re-uploading to Pinata).

vi.mock("./server", () => ({
  getFlags: () => ({ metadataMaxBytes: 4 * 1024 * 1024 }),
}));

import { POST } from "../../app/api/lab/metadata/route";

const WALLET = "0x1000000000000000000000000000000000000001";

/** Raw multipart body so content-length/content-type are fully controlled. */
function multipartRequest(opts: {
  ip: string;
  wallet?: string;
  fields?: unknown;
  imageBytes?: Uint8Array;
  imageMime?: string;
  origin?: string | null;
}): Request {
  const boundary = "----bpsmetatest";
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const push = (s: string) => parts.push(enc.encode(s));
  if (opts.wallet !== undefined) {
    push(`--${boundary}\r\ncontent-disposition: form-data; name="wallet"\r\n\r\n${opts.wallet}\r\n`);
  }
  if (opts.fields !== undefined) {
    push(
      `--${boundary}\r\ncontent-disposition: form-data; name="fields"\r\n\r\n${JSON.stringify(opts.fields)}\r\n`,
    );
  }
  if (opts.imageBytes) {
    push(
      `--${boundary}\r\ncontent-disposition: form-data; name="image"; filename="t.png"\r\ncontent-type: ${opts.imageMime ?? "image/png"}\r\n\r\n`,
    );
    parts.push(opts.imageBytes);
    push("\r\n");
  }
  push(`--${boundary}--\r\n`);
  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    body.set(p, off);
    off += p.length;
  }
  const headers: Record<string, string> = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(body.length),
    "x-forwarded-for": opts.ip,
  };
  if (opts.origin !== null) headers.origin = opts.origin ?? "https://lab.test";
  return new Request("https://lab.test/api/lab/metadata", { method: "POST", body, headers });
}

const FIELDS = {
  tokenName: "Print Token",
  tokenSymbol: "PRINT",
  tokenDescription: "A community market token.",
};

/** Valid PNG magic + a distinguishing tail so each test has unique content. */
function png(tail: number[]): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...tail]);
}

let pinataUploads = 0;
const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.PINATA_JWT = "test-jwt-value";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("pinFileToIPFS")) {
        pinataUploads += 1;
        return new Response(JSON.stringify({ IpfsHash: `QmImg${pinataUploads}` }), { status: 200 });
      }
      if (url.includes("pinJSONToIPFS")) {
        return new Response(JSON.stringify({ IpfsHash: `QmMeta${pinataUploads}` }), {
          status: 200,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...savedEnv };
});

describe("POST /api/lab/metadata (no signed envelope)", () => {
  it("uploads with only wallet + fields + image — no envelope part, no signature", async () => {
    const res = await POST(
      multipartRequest({ ip: "10.0.0.1", wallet: WALLET, fields: FIELDS, imageBytes: png([1]) }),
    );
    const body = (await res.json()) as {
      ok: boolean;
      data: { imageCid: string; metadataCid: string; tokenUri: string; provider: string };
    };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.provider).toBe("pinata");
    expect(body.data.imageCid).toMatch(/^QmImg/);
    expect(body.data.tokenUri).toBe(`ipfs://${body.data.metadataCid}`);
  });

  it("deduplicates identical content: same CIDs, no second Pinata upload", async () => {
    const bytes = png([2, 2]);
    const first = await POST(
      multipartRequest({ ip: "10.0.1.1", wallet: WALLET, fields: FIELDS, imageBytes: bytes }),
    );
    const firstBody = (await first.json()) as { data: { imageCid: string; metadataCid: string } };
    const uploadsAfterFirst = pinataUploads;

    // Same bytes + fields from a DIFFERENT IP and DIFFERENT claimed wallet —
    // dedup is keyed on content, not requester.
    const second = await POST(
      multipartRequest({
        ip: "10.0.1.2",
        wallet: "0x2000000000000000000000000000000000000002",
        fields: FIELDS,
        imageBytes: bytes,
      }),
    );
    const secondBody = (await second.json()) as { data: { imageCid: string; metadataCid: string } };
    expect(second.status).toBe(200);
    expect(secondBody.data.imageCid).toBe(firstBody.data.imageCid);
    expect(secondBody.data.metadataCid).toBe(firstBody.data.metadataCid);
    expect(pinataUploads).toBe(uploadsAfterFirst); // Pinata NOT called again
  });

  it("different content misses the dedup cache and uploads again", async () => {
    await POST(
      multipartRequest({ ip: "10.0.2.1", wallet: WALLET, fields: FIELDS, imageBytes: png([3, 1]) }),
    );
    const uploadsAfterFirst = pinataUploads;
    const res = await POST(
      multipartRequest({ ip: "10.0.2.2", wallet: WALLET, fields: FIELDS, imageBytes: png([3, 2]) }),
    );
    expect(res.status).toBe(200);
    expect(pinataUploads).toBe(uploadsAfterFirst + 1);
  });

  it("trips the per-claimed-wallet rate limit even across distinct IPs", async () => {
    const wallet = "0x3000000000000000000000000000000000000003";
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await POST(
        multipartRequest({
          ip: `10.0.3.${i + 1}`, // unique IP each time — only the wallet repeats
          wallet,
          fields: FIELDS,
          imageBytes: png([4, i]),
        }),
      );
      codes.push(res.status);
    }
    expect(codes.slice(0, 6)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(codes.slice(6)).toEqual([429, 429]);
    const last = await POST(
      multipartRequest({ ip: "10.0.3.99", wallet, fields: FIELDS, imageBytes: png([4, 99]) }),
    );
    const lastBody = (await last.json()) as { error: string };
    expect(lastBody.error).toMatch(/this wallet/i);
  });

  it("rejects an invalid claimed wallet and a missing wallet part", async () => {
    const bad = await POST(
      multipartRequest({ ip: "10.0.4.1", wallet: "not-an-address", fields: FIELDS, imageBytes: png([5]) }),
    );
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { code: string }).code).toBe("BAD_WALLET");

    const missing = await POST(
      multipartRequest({ ip: "10.0.4.2", fields: FIELDS, imageBytes: png([6]) }),
    );
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { code: string }).code).toBe("BAD_FORM");
  });

  it("keeps the strict MIME allowlist", async () => {
    const res = await POST(
      multipartRequest({
        ip: "10.0.5.1",
        wallet: WALLET,
        fields: FIELDS,
        imageBytes: png([7]),
        imageMime: "image/gif",
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("BAD_IMAGE_TYPE");
  });

  it("keeps the same-origin check", async () => {
    const res = await POST(
      multipartRequest({
        ip: "10.0.6.1",
        wallet: WALLET,
        fields: FIELDS,
        imageBytes: png([8]),
        origin: "https://evil.example",
      }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("BAD_ORIGIN");
  });

  it("still runs full server-side metadata validation (magic bytes)", async () => {
    const res = await POST(
      multipartRequest({
        ip: "10.0.7.1",
        wallet: WALLET,
        fields: FIELDS,
        imageBytes: new Uint8Array([1, 2, 3, 4, 5]), // not PNG magic
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("INVALID_METADATA");
  });
});
