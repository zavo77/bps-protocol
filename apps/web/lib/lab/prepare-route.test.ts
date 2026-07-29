import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for POST /api/lab/prepare and POST /api/lab/simulate.
//
// /prepare: envelope-free contract — the claimed payload.creatorAddress is the
// wallet identity (the deployment transaction authenticates the creator at
// registration). Schema validation, access modes, launch guardrails, and
// per-IP + per-claimed-wallet rate limits must still bind. The prepared
// transaction is recorded as an IMMUTABLE provenance_version=2 row; a
// conflicting prepare for the same predicted token is a 409.
//
// /simulate: stale re-simulation contract — { predictedToken, creatorAddress }.
// The server re-simulates the EXACT stored calldata and returns the STORED
// manifestHash. It must never call prepareLaunch or mint a new manifest.

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
  recordPreparedLaunch: vi.fn<
    () => Promise<
      | { status: "inserted" }
      | { status: "existing"; storedManifest: Record<string, unknown>; storedManifestHash: string }
    >
  >(async () => ({ status: "inserted" })),
  getPreparedLaunch: vi.fn(),
  refreshPreparedValidity: vi.fn(async () => {}),
  labClient: {
    call: vi.fn(async () => ({ data: "0x" })),
    estimateGas: vi.fn(async () => 1_000_000n),
    getBlockNumber: vi.fn(async () => 123n),
  },
}));

vi.mock("./server", () => ({
  getFlags: () => m.flags,
  prepareLaunch: m.prepareLaunch,
  getLabClient: () => m.labClient,
}));
vi.mock("./store", () => ({
  enforceLaunchGuardrails: m.enforceLaunchGuardrails,
  recordPreparedLaunch: m.recordPreparedLaunch,
  getPreparedLaunch: m.getPreparedLaunch,
  refreshPreparedValidity: m.refreshPreparedValidity,
}));

import { POST as preparePost } from "../../app/api/lab/prepare/route";
import { POST as simulatePost } from "../../app/api/lab/simulate/route";

const PREDICTED_TOKEN = "0x4000000000000000000000000000000000000004";
const TX_TARGET = "0x5000000000000000000000000000000000000005";
const MANIFEST_HASH = `0x${"ab".repeat(32)}`;
const CALLDATA_HASH = `0x${"cd".repeat(32)}`;

const BUNDLE = {
  manifest: {
    anchorSymbol: "GOOGL",
    anchorAddress: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
  },
  manifestHash: MANIFEST_HASH,
  simulation: { predictedTokenAddress: PREDICTED_TOKEN },
  prepared: { chainId: 4663, to: TX_TARGET, data: "0xdead", value: "0" },
};

function preparedRow(creator: string, overrides: Record<string, unknown> = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    predictedToken: PREDICTED_TOKEN.toLowerCase(),
    creator: creator.toLowerCase(),
    manifestHash: MANIFEST_HASH,
    anchorSymbol: "GOOGL",
    numeraire: "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3",
    provenanceVersion: 2,
    chainId: 4663,
    transactionTarget: TX_TARGET.toLowerCase(),
    transactionData: "0xdead",
    calldataHash: CALLDATA_HASH,
    transactionValue: "0",
    launchManifest: { anchorAddress: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3" },
    createdAtEpoch: nowSec - 60,
    validUntilEpoch: nowSec + 3_000,
    consumed: false,
    ...overrides,
  };
}

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
  m.recordPreparedLaunch.mockResolvedValue({ status: "inserted" });
  m.getPreparedLaunch.mockResolvedValue(null);
  m.refreshPreparedValidity.mockResolvedValue(undefined);
  m.labClient.call.mockResolvedValue({ data: "0x" });
  m.labClient.estimateGas.mockResolvedValue(1_000_000n);
  m.labClient.getBlockNumber.mockResolvedValue(123n);
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
    // The FULL prepared-transaction facts are recorded for exact verification.
    expect(m.recordPreparedLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        creator,
        predictedToken: BUNDLE.simulation.predictedTokenAddress,
        manifestHash: BUNDLE.manifestHash,
        chainId: 4663,
        transactionTarget: BUNDLE.prepared.to,
        transactionData: BUNDLE.prepared.data,
        transactionValue: BUNDLE.prepared.value,
        launchManifest: BUNDLE.manifest,
      }),
    );
  });

  it("FAIL-CLOSED: a DB-unavailable registry returns 503 with NO manifest or transaction", async () => {
    m.recordPreparedLaunch.mockRejectedValue(new Error("REGISTRY_UNAVAILABLE"));
    const res = await preparePost(
      jsonRequest(
        "/api/lab/prepare",
        { payload: payloadFor("0x1100000000000000000000000000000000000011") },
        "10.1.9.1",
      ),
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(503);
    expect(body.code).toBe("REGISTRY_UNAVAILABLE");
    expect(body.data).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(BUNDLE.manifestHash);
    expect(JSON.stringify(body)).not.toContain(BUNDLE.prepared.data);
  });

  it("FAIL-CLOSED: an insert failure returns 503 with NO manifest or transaction", async () => {
    m.recordPreparedLaunch.mockRejectedValue(new Error("REGISTRY_UNAVAILABLE"));
    const res = await preparePost(
      jsonRequest(
        "/api/lab/prepare",
        { payload: payloadFor("0x1100000000000000000000000000000000000012") },
        "10.1.9.2",
      ),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.data).toBeUndefined();
  });

  it("(2) an identical re-prepare returns the STORED manifest + hash — one immutable identity per review", async () => {
    const storedHash = `0x${"cd".repeat(32)}`;
    const storedManifest = { anchorSymbol: "GOOGL", createdAt: 1_000_000, original: true };
    m.recordPreparedLaunch.mockResolvedValue({
      status: "existing",
      storedManifest,
      storedManifestHash: storedHash,
    });
    const res = await preparePost(
      jsonRequest(
        "/api/lab/prepare",
        { payload: payloadFor("0x1100000000000000000000000000000000000013") },
        "10.1.9.3",
      ),
    );
    const body = (await res.json()) as {
      ok: boolean;
      data: {
        manifest: Record<string, unknown>;
        manifestHash: string;
        simulation: { manifestHash: string };
        prepared: { manifestHash: string; data: string };
      };
    };
    expect(res.status).toBe(200);
    // NOT the freshly minted hash — the stored one, everywhere.
    expect(body.data.manifestHash).toBe(storedHash);
    expect(body.data.manifest).toEqual(storedManifest);
    expect(body.data.simulation.manifestHash).toBe(storedHash);
    expect(body.data.prepared.manifestHash).toBe(storedHash);
    // The transaction itself is still returned (identical calldata).
    expect(body.data.prepared.data).toBe(BUNDLE.prepared.data);
  });

  it("maps a conflicting prepare (same predicted token, different facts) to 409 PREPARED_CONFLICT", async () => {
    const creator = "0x1a00000000000000000000000000000000000a1a";
    m.recordPreparedLaunch.mockRejectedValue(new Error("PREPARED_CONFLICT"));
    const res = await preparePost(
      jsonRequest("/api/lab/prepare", { payload: payloadFor(creator) }, "10.1.0.20"),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("PREPARED_CONFLICT");
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

describe("POST /api/lab/simulate ({ predictedToken, creatorAddress } contract)", () => {
  it("re-simulates the EXACT stored calldata and returns the SAME stored manifestHash — never calls prepareLaunch", async () => {
    const creator = "0x2100000000000000000000000000000000000021";
    m.getPreparedLaunch.mockResolvedValue(preparedRow(creator));
    const res = await simulatePost(
      jsonRequest(
        "/api/lab/simulate",
        { predictedToken: PREDICTED_TOKEN, creatorAddress: creator },
        "10.2.0.1",
      ),
    );
    const body = (await res.json()) as {
      ok: boolean;
      data: {
        simulation: { manifestHash: string; calldataHash: string; gasEstimate: string };
        prepared: { to: string; data: string; value: string; gas: string; staleAfter: number };
        manifestHash: string;
      };
    };
    expect(res.status).toBe(200);
    // The STORED, immutable manifest hash — never a freshly minted one.
    expect(body.data.manifestHash).toBe(MANIFEST_HASH);
    expect(body.data.simulation.manifestHash).toBe(MANIFEST_HASH);
    expect(body.data.simulation.calldataHash).toBe(CALLDATA_HASH);
    // The EXACT stored transaction facts, with only fresh gas + staleness.
    expect(body.data.prepared.to.toLowerCase()).toBe(TX_TARGET.toLowerCase());
    expect(body.data.prepared.data).toBe("0xdead");
    expect(body.data.prepared.value).toBe("0");
    expect(body.data.prepared.gas).toBe("1250000"); // 1_000_000 * 125%
    expect(body.data.prepared.staleAfter).toBeGreaterThan(Date.now());
    // Re-simulation must NEVER re-prepare or mint a new manifest.
    expect(m.prepareLaunch).not.toHaveBeenCalled();
    expect(m.recordPreparedLaunch).not.toHaveBeenCalled();
    // Simulation ran the stored calldata as the creator.
    expect(m.labClient.call).toHaveBeenCalledWith(
      expect.objectContaining({ account: creator, data: "0xdead", value: 0n }),
    );
    expect(m.labClient.estimateGas).toHaveBeenCalledTimes(1);
    // The validity window was refreshed.
    expect(m.refreshPreparedValidity).toHaveBeenCalledWith(PREDICTED_TOKEN);
    // Re-simulation consumes no launch quota.
    expect(m.enforceLaunchGuardrails).not.toHaveBeenCalled();
  });

  it("rejects a malformed request (BAD_PAYLOAD)", async () => {
    const res = await simulatePost(
      jsonRequest(
        "/api/lab/simulate",
        { predictedToken: "not-an-address", creatorAddress: "also-not" },
        "10.2.0.2",
      ),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("BAD_PAYLOAD");
    expect(m.getPreparedLaunch).not.toHaveBeenCalled();
  });

  it("returns PREPARED_NOT_FOUND for missing, legacy, consumed, expired, or foreign rows", async () => {
    const creator = "0x2400000000000000000000000000000000000024";
    const cases = [
      null, // missing row
      preparedRow(creator, { provenanceVersion: null }), // legacy row
      preparedRow(creator, { consumed: true }), // already consumed
      preparedRow(creator, { validUntilEpoch: Math.floor(Date.now() / 1000) - 10 }), // expired
      preparedRow("0x9900000000000000000000000000000000000099"), // different creator
    ];
    for (let i = 0; i < cases.length; i++) {
      m.getPreparedLaunch.mockResolvedValue(cases[i]);
      const res = await simulatePost(
        jsonRequest(
          "/api/lab/simulate",
          { predictedToken: PREDICTED_TOKEN, creatorAddress: creator },
          `10.2.3.${i + 1}`,
        ),
      );
      expect(res.status).toBe(404);
      expect(((await res.json()) as { code: string }).code).toBe("PREPARED_NOT_FOUND");
    }
    expect(m.labClient.call).not.toHaveBeenCalled();
    expect(m.prepareLaunch).not.toHaveBeenCalled();
  });

  it("maps a reverting stored calldata to SIMULATION_FAILED (never re-prepares)", async () => {
    const creator = "0x2500000000000000000000000000000000000025";
    m.getPreparedLaunch.mockResolvedValue(preparedRow(creator));
    m.labClient.call.mockRejectedValue(new Error("execution reverted"));
    const res = await simulatePost(
      jsonRequest(
        "/api/lab/simulate",
        { predictedToken: PREDICTED_TOKEN, creatorAddress: creator },
        "10.2.0.4",
      ),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("SIMULATION_FAILED");
    expect(m.prepareLaunch).not.toHaveBeenCalled();
    expect(m.refreshPreparedValidity).not.toHaveBeenCalled();
  });

  it("trips the per-wallet rate limit across distinct IPs", async () => {
    const creator = "0x2200000000000000000000000000000000000022";
    m.getPreparedLaunch.mockResolvedValue(preparedRow(creator));
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await simulatePost(
        jsonRequest(
          "/api/lab/simulate",
          { predictedToken: PREDICTED_TOKEN, creatorAddress: creator },
          `10.2.1.${i + 1}`,
        ),
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
      jsonRequest(
        "/api/lab/simulate",
        { predictedToken: PREDICTED_TOKEN, creatorAddress: creator },
        "10.2.0.3",
      ),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("AUTH_CREATION_DISABLED");
  });
});
