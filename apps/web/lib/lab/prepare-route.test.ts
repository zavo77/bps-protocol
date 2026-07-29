import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for POST /api/lab/prepare and POST /api/lab/simulate — the
// envelope-free contract. Neither route requires (or verifies) a signed
// envelope any more: the claimed payload.creatorAddress is the wallet identity
// (the deployment transaction authenticates the creator at registration).
// Schema validation, access modes, launch guardrails, and per-IP +
// per-claimed-wallet rate limits must still bind.

const m = vi.hoisted(() => ({
  flags: {
    accessMode: "public" as string,
    creatorAllowlist: [] as string[],
    maxLaunchesPerWallet: 2,
    launchCooldownSeconds: 3_600,
    publicDailyLaunchCap: 25,
  },
  prepareLaunch: vi.fn(),
  enforceLaunchGuardrails: vi.fn(async () => {}),
  recordPreparedLaunch: vi.fn(async () => {}),
}));

vi.mock("./server", () => ({
  getFlags: () => m.flags,
  prepareLaunch: m.prepareLaunch,
}));
vi.mock("./store", () => ({
  enforceLaunchGuardrails: m.enforceLaunchGuardrails,
  recordPreparedLaunch: m.recordPreparedLaunch,
}));

import { POST as preparePost } from "../../app/api/lab/prepare/route";
import { POST as simulatePost } from "../../app/api/lab/simulate/route";

const BUNDLE = {
  manifest: {
    anchorSymbol: "GOOGL",
    anchorAddress: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
  },
  manifestHash: `0x${"ab".repeat(32)}`,
  simulation: { predictedTokenAddress: "0x4000000000000000000000000000000000000004" },
  prepared: { to: "0x5000000000000000000000000000000000000005", data: "0xdead" },
};

function payloadFor(creator: string, overrides: Record<string, unknown> = {}) {
  return {
    tokenName: "Print Token",
    tokenSymbol: "PRINT",
    tokenDescription: "A community market token.",
    tokenUri: "ipfs://bafyMetadataCidExample123",
    imageCid: "bafyImageCidExample123",
    metadataCid: "bafyMetadataCidExample123",
    metadataProvider: "pinata",
    startingFdvUsd: 20_500,
    feePreset: "BALANCED_1",
    creatorAddress: creator,
    creatorFeeAddress: creator,
    anchorSymbol: "GOOGL",
    termsAccepted: true,
    ...overrides,
  };
}

function jsonRequest(path: string, body: unknown, ip: string, origin = "https://lab.test"): Request {
  return new Request(`https://lab.test${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip, origin },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.flags.accessMode = "public";
  m.flags.creatorAllowlist = [];
  m.prepareLaunch.mockResolvedValue(BUNDLE);
  m.enforceLaunchGuardrails.mockResolvedValue(undefined);
  m.recordPreparedLaunch.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/lab/prepare (no signed envelope)", () => {
  it("prepares from { payload } alone — no envelope, no signature verification", async () => {
    const creator = "0x1100000000000000000000000000000000000011";
    const res = await preparePost(
      jsonRequest("/api/lab/prepare", { payload: payloadFor(creator) }, "10.1.0.1"),
    );
    const body = (await res.json()) as { ok: boolean; data: typeof BUNDLE };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.manifestHash).toBe(BUNDLE.manifestHash);
    // Guardrails + provenance record still bind to the CLAIMED creator wallet.
    expect(m.enforceLaunchGuardrails).toHaveBeenCalledWith(creator, m.flags);
    expect(m.recordPreparedLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        creator,
        predictedToken: BUNDLE.simulation.predictedTokenAddress,
        manifestHash: BUNDLE.manifestHash,
      }),
    );
  });

  it("ignores a stray envelope key entirely (no signature checks remain)", async () => {
    const creator = "0x1200000000000000000000000000000000000012";
    const res = await preparePost(
      jsonRequest(
        "/api/lab/prepare",
        { envelope: { message: "garbage", signature: "0x00" }, payload: payloadFor(creator) },
        "10.1.0.2",
      ),
    );
    expect(res.status).toBe(200);
  });

  it("still enforces schema validation (BAD_PAYLOAD, not an auth error)", async () => {
    const creator = "0x1300000000000000000000000000000000000013";
    const res = await preparePost(
      jsonRequest(
        "/api/lab/prepare",
        { payload: payloadFor(creator, { termsAccepted: false }) },
        "10.1.0.3",
      ),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("BAD_PAYLOAD");
    expect(m.prepareLaunch).not.toHaveBeenCalled();
  });

  it("trips the per-claimed-wallet rate limit across distinct IPs", async () => {
    const creator = "0x1400000000000000000000000000000000000014";
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await preparePost(
        jsonRequest("/api/lab/prepare", { payload: payloadFor(creator) }, `10.1.1.${i + 1}`),
      );
      codes.push(res.status);
    }
    expect(codes.slice(0, 6)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(codes.slice(6)).toEqual([429, 429]);
  });

  it("still enforces launch guardrails for the claimed wallet", async () => {
    const creator = "0x1500000000000000000000000000000000000015";
    m.enforceLaunchGuardrails.mockRejectedValue(new Error("LIMIT_WALLET_MAX"));
    const res = await preparePost(
      jsonRequest("/api/lab/prepare", { payload: payloadFor(creator) }, "10.1.0.5"),
    );
    expect(res.status).toBe(429);
    expect(((await res.json()) as { code: string }).code).toBe("LIMIT_WALLET_MAX");
  });

  it("still enforces access modes against the claimed creator", async () => {
    const creator = "0x1600000000000000000000000000000000000016";
    m.flags.accessMode = "disabled";
    const disabled = await preparePost(
      jsonRequest("/api/lab/prepare", { payload: payloadFor(creator) }, "10.1.0.6"),
    );
    expect(disabled.status).toBe(403);
    expect(((await disabled.json()) as { code: string }).code).toBe("AUTH_CREATION_DISABLED");

    m.flags.accessMode = "allowlist";
    m.flags.creatorAllowlist = ["0x9900000000000000000000000000000000000099"];
    const notListed = await preparePost(
      jsonRequest("/api/lab/prepare", { payload: payloadFor(creator) }, "10.1.0.7"),
    );
    expect(notListed.status).toBe(401);
    expect(((await notListed.json()) as { code: string }).code).toBe("AUTH_NOT_ALLOWLISTED");

    m.flags.creatorAllowlist = [creator];
    const listed = await preparePost(
      jsonRequest("/api/lab/prepare", { payload: payloadFor(creator) }, "10.1.0.8"),
    );
    expect(listed.status).toBe(200);
  });

  it("still refuses non-broadcastable metadata", async () => {
    const creator = "0x1700000000000000000000000000000000000017";
    const res = await preparePost(
      jsonRequest(
        "/api/lab/prepare",
        // 10-char metadataCid passes the schema but fails the broadcast gate.
        { payload: payloadFor(creator, { metadataCid: "0123456789" }) },
        "10.1.0.9",
      ),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("METADATA_NOT_BROADCASTABLE");
  });

  it("keeps the same-origin check", async () => {
    const creator = "0x1800000000000000000000000000000000000018";
    const res = await preparePost(
      jsonRequest("/api/lab/prepare", { payload: payloadFor(creator) }, "10.1.0.10", "https://evil.example"),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/lab/simulate (no signed envelope)", () => {
  it("re-simulates from { payload } alone with zero signature requirements", async () => {
    const creator = "0x2100000000000000000000000000000000000021";
    const res = await simulatePost(
      jsonRequest("/api/lab/simulate", { payload: payloadFor(creator) }, "10.2.0.1"),
    );
    const body = (await res.json()) as {
      ok: boolean;
      data: { simulation: unknown; prepared: unknown; manifestHash: string };
    };
    expect(res.status).toBe(200);
    expect(body.data.manifestHash).toBe(BUNDLE.manifestHash);
    expect(body.data.simulation).toEqual(BUNDLE.simulation);
    expect(body.data.prepared).toEqual(BUNDLE.prepared);
    // Re-simulation consumes no launch quota (same as before).
    expect(m.enforceLaunchGuardrails).not.toHaveBeenCalled();
  });

  it("still enforces schema validation", async () => {
    const res = await simulatePost(
      jsonRequest("/api/lab/simulate", { payload: { nonsense: true } }, "10.2.0.2"),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("BAD_PAYLOAD");
  });

  it("trips the per-claimed-wallet rate limit across distinct IPs", async () => {
    const creator = "0x2200000000000000000000000000000000000022";
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await simulatePost(
        jsonRequest("/api/lab/simulate", { payload: payloadFor(creator) }, `10.2.1.${i + 1}`),
      );
      codes.push(res.status);
    }
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
  });

  it("still enforces the disabled access mode", async () => {
    const creator = "0x2300000000000000000000000000000000000023";
    m.flags.accessMode = "disabled";
    const res = await simulatePost(
      jsonRequest("/api/lab/simulate", { payload: payloadFor(creator) }, "10.2.0.3"),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("AUTH_CREATION_DISABLED");
  });
});
