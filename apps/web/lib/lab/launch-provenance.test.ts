import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { airlockAbi, CHAIN_IDS, getAddresses } from "@whetstone-research/doppler-sdk/evm";

// POST /api/lab/launches — exact provenance verification (founder P0.2).
// Registration must verify the RAW broadcast transaction against the immutable
// provenance_version=2 preparation this server recorded: sender, target,
// calldata hash, value, chain, and the validity window. Launch facts come from
// the SERVER-STORED manifest; any client-supplied manifest is discarded.

const m = vi.hoisted(() => ({
  labClient: {
    getTransactionReceipt: vi.fn(),
    getTransaction: vi.fn(),
    getBlock: vi.fn(),
  },
  isTokenVerified: vi.fn(async () => false),
  getPreparedLaunch: vi.fn(),
  registerVerifiedLaunchAtomic: vi.fn(),
  invalidateLaunchCache: vi.fn(),
  listLaunches: vi.fn(async () => []),
  getVolumeByToken: vi.fn(async () => null),
}));

vi.mock("./server", () => ({
  getLabClient: () => m.labClient,
}));
vi.mock("./store", () => ({
  isTokenVerified: m.isTokenVerified,
  getPreparedLaunch: m.getPreparedLaunch,
  registerVerifiedLaunchAtomic: m.registerVerifiedLaunchAtomic,
  invalidateLaunchCache: m.invalidateLaunchCache,
  listLaunches: m.listLaunches,
  getVolumeByToken: m.getVolumeByToken,
}));

import { POST as launchesPost } from "../../app/api/lab/launches/route";

const a = getAddresses(CHAIN_IDS.ROBINHOOD) as unknown as {
  airlock: Address;
  dopplerHookInitializer: Address;
};
const GOOGL = "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3" as Address;
const TOKEN = "0x4000000000000000000000000000000000000004" as Address;
const WALLET = "0x1000000000000000000000000000000000000001" as Address;
const POOL = "0x1111111111111111111111111111111111111111" as Address;
const TX = `0x${"11".repeat(32)}` as Hex;
const CALLDATA = "0xdeadbeef" as Hex;
const MANIFEST_HASH = `0x${"ab".repeat(32)}`;

const STORED_MANIFEST = {
  anchorAddress: GOOGL,
  anchorSymbol: "GOOGL",
  startingFdvUsdFixed: "20500",
  feePreset: "BALANCED_1",
  exactPoolFeeUnits: 10_000,
  creatorFeeAddress: WALLET,
  beneficiaries: [{ beneficiary: WALLET, shares: "850000000000000000" }],
  tokenUri: "ipfs://bafyStoredManifest",
  initialSupply: "1000000000000000000000000000",
  saleInventory: "900000000000000000000000000",
};

function createLog(numeraire: Address = GOOGL, asset: Address = TOKEN, initializer?: Address) {
  const topics = encodeEventTopics({ abi: airlockAbi, eventName: "Create", args: { numeraire } });
  const data = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }],
    [asset, initializer ?? a.dopplerHookInitializer, POOL],
  );
  return {
    address: a.airlock,
    topics,
    data,
    blockNumber: 123n,
    logIndex: 0,
    transactionHash: TX,
    removed: false,
  };
}

function preparedRow(overrides: Record<string, unknown> = {}) {
  return {
    predictedToken: TOKEN.toLowerCase(),
    creator: WALLET.toLowerCase(),
    manifestHash: MANIFEST_HASH,
    anchorSymbol: "GOOGL",
    numeraire: GOOGL.toLowerCase(),
    provenanceVersion: 2,
    chainId: 4663,
    transactionTarget: a.airlock.toLowerCase(),
    transactionData: CALLDATA,
    calldataHash: keccak256(CALLDATA),
    transactionValue: "0",
    launchManifest: STORED_MANIFEST,
    createdAtEpoch: 1_000,
    validUntilEpoch: 5_000,
    consumed: false,
    ...overrides,
  };
}

function txFixture(overrides: Record<string, unknown> = {}) {
  return {
    from: WALLET.toLowerCase(),
    to: a.airlock,
    input: CALLDATA,
    value: 0n,
    chainId: 4663,
    ...overrides,
  };
}

let ipCounter = 0;
function post(body: unknown): Request {
  ipCounter += 1;
  return new Request("https://lab.test/api/lab/launches", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.9.${Math.floor(ipCounter / 200)}.${(ipCounter % 200) + 1}`,
    },
  });
}

async function codeOf(
  res: Response,
): Promise<{ status: number; code: string | undefined; data: unknown }> {
  const body = (await res.json()) as { code?: string; data?: unknown };
  return { status: res.status, code: body.code, data: body.data };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.labClient.getTransactionReceipt.mockResolvedValue({
    status: "success",
    from: WALLET.toLowerCase(),
    blockNumber: 123n,
    logs: [createLog()],
  });
  m.labClient.getTransaction.mockResolvedValue(txFixture());
  m.labClient.getBlock.mockResolvedValue({ timestamp: 2_000n });
  m.isTokenVerified.mockResolvedValue(false);
  m.getPreparedLaunch.mockResolvedValue(preparedRow());
  m.registerVerifiedLaunchAtomic.mockResolvedValue({ status: "registered" });
});

describe("POST /api/lab/launches — exact provenance verification", () => {
  it("registers a transaction that matches the prepared row byte-for-byte", async () => {
    const res = await launchesPost(post({ transactionHash: TX }));
    const out = await codeOf(res);
    expect(out.status).toBe(200);
    expect(out.data).toMatchObject({ registered: true, provenanceVerified: true });
    expect(m.registerVerifiedLaunchAtomic).toHaveBeenCalledTimes(1);
    const [rec, expected, launchTx] = m.registerVerifiedLaunchAtomic.mock.calls[0]!;
    expect(launchTx).toBe(TX);
    expect(rec).toMatchObject({
      tokenAddress: TOKEN,
      manifestHash: MANIFEST_HASH,
      launchTx: TX,
      timestamp: 2_000,
    });
    // The decoded on-chain facts are handed to the atomic operation for the
    // authoritative in-transaction comparison under SELECT FOR UPDATE.
    expect(expected).toMatchObject({
      creator: WALLET,
      chainId: 4663,
      blockTimestamp: 2_000,
    });
    expect(String(expected.transactionTarget).toLowerCase()).toBe(a.airlock.toLowerCase());
    expect(String(expected.calldataHash).toLowerCase()).toBe(keccak256(CALLDATA).toLowerCase());
  });

  it("(1) rejects a wrong transaction target", async () => {
    m.labClient.getTransaction.mockResolvedValue(
      txFixture({ to: "0x9999999999999999999999999999999999999999" }),
    );
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out).toMatchObject({ status: 409, code: "WRONG_TARGET" });
    expect(m.registerVerifiedLaunchAtomic).not.toHaveBeenCalled();
  });

  it("(2) rejects wrong calldata (keccak256 mismatch)", async () => {
    m.labClient.getTransaction.mockResolvedValue(txFixture({ input: "0x12345678" }));
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out).toMatchObject({ status: 409, code: "WRONG_CALLDATA" });
    expect(m.registerVerifiedLaunchAtomic).not.toHaveBeenCalled();
  });

  it("(3) rejects a wrong transaction value", async () => {
    m.labClient.getTransaction.mockResolvedValue(txFixture({ value: 5n }));
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out).toMatchObject({ status: 409, code: "WRONG_VALUE" });
    expect(m.registerVerifiedLaunchAtomic).not.toHaveBeenCalled();
  });

  it("(4) rejects a wrong sender", async () => {
    m.labClient.getTransaction.mockResolvedValue(
      txFixture({ from: "0x2000000000000000000000000000000000000002" }),
    );
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out).toMatchObject({ status: 409, code: "WRONG_SENDER" });
    expect(m.registerVerifiedLaunchAtomic).not.toHaveBeenCalled();
  });

  it("(5) rejects a wrong chain", async () => {
    m.labClient.getTransaction.mockResolvedValue(txFixture({ chainId: 1 }));
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out).toMatchObject({ status: 409, code: "WRONG_CHAIN" });
    expect(m.registerVerifiedLaunchAtomic).not.toHaveBeenCalled();
  });

  it("(6) rejects an expired preparation (block timestamp > valid_until)", async () => {
    m.labClient.getBlock.mockResolvedValue({ timestamp: 9_999n });
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out).toMatchObject({ status: 409, code: "PREPARED_EXPIRED" });
    expect(m.registerVerifiedLaunchAtomic).not.toHaveBeenCalled();
  });

  it("rejects a block timestamp BEFORE the preparation was created", async () => {
    m.labClient.getBlock.mockResolvedValue({ timestamp: 500n });
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out).toMatchObject({ status: 409, code: "PREPARED_EXPIRED" });
    expect(m.registerVerifiedLaunchAtomic).not.toHaveBeenCalled();
  });

  it("(7) rejects a legacy prepared row (provenance_version NULL)", async () => {
    m.getPreparedLaunch.mockResolvedValue(
      preparedRow({
        provenanceVersion: null,
        chainId: null,
        transactionTarget: null,
        transactionData: null,
        calldataHash: null,
        transactionValue: null,
        launchManifest: null,
        validUntilEpoch: null,
      }),
    );
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out).toMatchObject({ status: 409, code: "UNVERIFIED_PROVENANCE" });
    expect(m.registerVerifiedLaunchAtomic).not.toHaveBeenCalled();
  });

  it("rejects when no preparation exists at all", async () => {
    m.getPreparedLaunch.mockResolvedValue(null);
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out).toMatchObject({ status: 409, code: "UNVERIFIED_PROVENANCE" });
  });

  it("rejects an already-consumed preparation for an unverified token", async () => {
    m.getPreparedLaunch.mockResolvedValue(preparedRow({ consumed: true }));
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out).toMatchObject({ status: 409, code: "PREPARED_CONSUMED" });
    expect(m.registerVerifiedLaunchAtomic).not.toHaveBeenCalled();
  });

  it("rejects when the Create event numeraire differs from the STORED manifest anchor", async () => {
    m.getPreparedLaunch.mockResolvedValue(
      preparedRow({
        launchManifest: {
          ...STORED_MANIFEST,
          anchorAddress: "0x8888888888888888888888888888888888888888",
        },
      }),
    );
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out).toMatchObject({ status: 409, code: "WRONG_NUMERAIRE" });
    expect(m.registerVerifiedLaunchAtomic).not.toHaveBeenCalled();
  });

  it("(13) registration retry after success is idempotent (verified token short-circuits)", async () => {
    m.isTokenVerified.mockResolvedValue(true);
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out.status).toBe(200);
    expect(out.data).toMatchObject({ registered: true, provenanceVerified: true });
    expect(m.getPreparedLaunch).not.toHaveBeenCalled();
    expect(m.registerVerifiedLaunchAtomic).not.toHaveBeenCalled();
  });

  it("maps the atomic already-registered result (concurrent second caller) to idempotent success", async () => {
    m.registerVerifiedLaunchAtomic.mockResolvedValue({ status: "already-registered" });
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out.status).toBe(200);
    expect(out.data).toMatchObject({ registered: true, provenanceVerified: true });
  });

  it("maps an atomic registration failure honestly (nothing consumed, retry allowed)", async () => {
    m.registerVerifiedLaunchAtomic.mockResolvedValue({
      status: "failed",
      code: "REGISTRATION_FAILED",
    });
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out).toMatchObject({ status: 500, code: "REGISTRATION_FAILED" });
  });

  it("maps an unavailable registry to 503 without claiming registration", async () => {
    m.registerVerifiedLaunchAtomic.mockResolvedValue({
      status: "failed",
      code: "DB_UNAVAILABLE",
    });
    const out = await codeOf(await launchesPost(post({ transactionHash: TX })));
    expect(out).toMatchObject({ status: 503, code: "REGISTRY_UNAVAILABLE" });
  });

  it("(14) a client-supplied manifest can NEVER alter the stored facts", async () => {
    const res = await launchesPost(
      post({
        transactionHash: TX,
        manifest: {
          ...STORED_MANIFEST,
          startingFdvUsdFixed: "999999999",
          creatorFeeAddress: "0x9999999999999999999999999999999999999999",
          tokenUri: "ipfs://attacker",
        },
      }),
    );
    expect(res.status).toBe(200);
    // The route passes NO manifest-derived facts at all — the atomic operation
    // builds them from the manifest read UNDER ITS OWN ROW LOCK, so nothing
    // the client submitted can reach the stored facts.
    const call = m.registerVerifiedLaunchAtomic.mock.calls[0]!;
    const serialized = JSON.stringify(call);
    expect(Object.keys(call[0] as Record<string, unknown>)).not.toContain("launchManifest");
    expect(serialized).not.toContain("999999999");
    expect(serialized).not.toContain("ipfs://attacker");
    expect(serialized).not.toContain("0x9999999999999999999999999999999999999999");
  });
});
