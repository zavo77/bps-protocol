import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";

// Route-handler tests for POST /api/lab/trade/prepare-leg: the final
// pre-signature gate. Proves the founder's rejection matrix — wrong taker,
// wrong chain, wrong leg tokens, unknown venue — and that a valid Rialto leg
// returns the simulated transaction. Server/store/adapters are mocked; the
// zod schemas, same-origin check, and handler logic under test are real.

const TOKEN = getAddress("0x1F212fccea9995931f4f2F9CA0C8b641188Ca196");
const GOOGL = getAddress("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3");
const WETH = getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73");
const WALLET = getAddress("0x1000000000000000000000000000000000000001");
const OTHER = getAddress("0x2000000000000000000000000000000000000002");
const RIALTO_ROUTER = getAddress("0x3000000000000000000000000000000000000003");

const m = vi.hoisted(() => ({
  verifySignedRequest: vi.fn(async () => WALLET),
  quoteRialto: vi.fn(),
  quoteOneInch: vi.fn(async () => null),
  quoteZeroExRoute: vi.fn(async () => null),
  client: {
    getBalance: vi.fn(async () => 10n ** 24n),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "balanceOf") return 10n ** 24n;
      if (functionName === "allowance") return 10n ** 30n;
      return 0n;
    }),
    call: vi.fn(async () => ({})),
    getBlockNumber: vi.fn(async () => 1n),
  },
}));

vi.mock("./server", () => ({
  getFlags: () => ({ requestTtlSeconds: 300 }),
  getLabClient: () => m.client,
  payloadHashOf: () => `0x${"a".repeat(64)}`,
  verifySignedRequest: m.verifySignedRequest,
}));
vi.mock("./store", () => ({ assertSignatureUnused: vi.fn(async () => undefined) }));
vi.mock("./rialto", () => ({ quoteRialto: m.quoteRialto }));
vi.mock("./oneinch", () => ({ quoteOneInch: m.quoteOneInch }));
vi.mock("./zeroex", () => ({ quoteZeroExRoute: m.quoteZeroExRoute }));
vi.mock("@bps/launch-lab", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getLabPoolContext: vi.fn(async () => ({
      anchorSymbol: "GOOGL",
      anchorAddress: GOOGL,
      poolId: `0x${"1".repeat(64)}`,
      status: 2,
      anchorIsCurrency0: true,
      universalRouter: RIALTO_ROUTER,
      permit2: RIALTO_ROUTER,
      poolKey: {},
    })),
    quoteDirectRoute: vi.fn(async () => ({
      quote: {
        routeId: "bpsDirectV4",
        routeLabel: "BPS Direct",
        sellToken: GOOGL,
        buyToken: TOKEN,
        sellAmount: "1000000000000000000",
        buyAmount: "5000000000000000000",
        minimumBuyAmount: "4950000000000000000",
        estimatedGas: "500000",
        priceImpactBps: 50,
        poolFee: 10_000,
        allowanceTarget: RIALTO_ROUTER,
        transactionTarget: RIALTO_ROUTER,
        transactionData: "0x1234",
        transactionValue: "0",
        quoteBlock: "1",
        quoteExpiry: Date.now() + 60_000,
        warnings: [],
      },
    })),
  };
});

import { POST } from "../../app/api/lab/trade/prepare-leg/route";

const rialtoQuoteOk = {
  venue: "rialto" as const,
  sellToken: WETH,
  buyToken: TOKEN,
  sellAmountWei: "1000000000000000000",
  buyAmountWei: "5000000000000000000",
  minBuyAmountWei: "4950000000000000000",
  allowanceTarget: RIALTO_ROUTER,
  transactionTarget: RIALTO_ROUTER,
  transactionData: "0xabcd" as const,
  transactionValue: "0",
  platformFeeBps: 5,
  settlement: "allowance" as const,
  routeLegCount: 1,
  quoteExpiry: Date.now() + 30_000,
};

let reqNo = 0;
function makeRequest(payload: Record<string, unknown>, envelopePatch: Record<string, unknown> = {}) {
  reqNo += 1;
  const envelope = {
    message: {
      action: "prepare-trade",
      wallet: WALLET,
      chainId: 4663,
      payloadHash: `0x${"a".repeat(64)}`,
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      host: "lab.test",
      ...envelopePatch,
    },
    signature: `0x${"ab".repeat(65)}`,
  };
  return new Request("https://lab.test/api/lab/trade/prepare-leg", {
    method: "POST",
    headers: {
      origin: "https://lab.test",
      host: "lab.test",
      "content-type": "application/json",
      // distinct client key per request so the fixed-window limiter never trips
      "x-forwarded-for": `10.0.0.${reqNo}`,
    },
    body: JSON.stringify({ envelope, payload }),
  });
}

const validRialtoPayload = {
  kind: "rialto",
  marketToken: TOKEN,
  inputToken: WETH,
  outputToken: TOKEN,
  exactInputAmount: "1000000000000000000",
  slippageBps: 100,
  taker: WALLET,
};

beforeEach(() => {
  vi.clearAllMocks(); // call counts must not leak between tests
  m.verifySignedRequest.mockResolvedValue(WALLET);
  m.quoteRialto.mockResolvedValue(rialtoQuoteOk);
  m.quoteOneInch.mockResolvedValue(null);
  m.quoteZeroExRoute.mockResolvedValue(null);
  m.client.call.mockResolvedValue({});
});

describe("POST /api/lab/trade/prepare-leg — rejection matrix + Rialto leg", () => {
  it("accepts a valid Rialto leg: re-quotes server-side, simulates, returns the tx", async () => {
    const res = await POST(makeRequest(validRialtoPayload));
    const body = (await res.json()) as {
      ok: boolean;
      data: {
        leg: { kind: string };
        simulation: string;
        transaction: { to: string; data: string; chainId: number };
        approvals: { erc20ApprovalTarget: string | null };
      };
    };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.leg.kind).toBe("rialto");
    expect(body.data.simulation).toBe("ok");
    expect(body.data.transaction.chainId).toBe(4663);
    expect(body.data.transaction.to).toBe(RIALTO_ROUTER);
    // The approval target is EXACTLY the spender Rialto returned.
    expect(body.data.approvals.erc20ApprovalTarget).toBe(RIALTO_ROUTER);
  });

  it("rejects a taker that is not the envelope signer (403 TAKER_MISMATCH)", async () => {
    const res = await POST(makeRequest({ ...validRialtoPayload, taker: OTHER }));
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(res.status).toBe(403);
    expect(body.code).toBe("TAKER_MISMATCH");
    // Never reaches an adapter or simulation.
    expect(m.quoteRialto).not.toHaveBeenCalled();
  });

  it("rejects an envelope on the wrong chain (schema binds chainId 4663)", async () => {
    const res = await POST(makeRequest(validRialtoPayload, { chainId: 1 }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(m.quoteRialto).not.toHaveBeenCalled();
  });

  it("rejects an aggregator leg whose tokens involve no supported payment asset (BAD_LEG)", async () => {
    // anchor → market token is a BPS Direct leg; submitting it as 'rialto' is invalid.
    const res = await POST(
      makeRequest({ ...validRialtoPayload, inputToken: GOOGL, outputToken: TOKEN }),
    );
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(res.status).toBe(400);
    expect(body.code).toBe("BAD_LEG");
    expect(m.quoteRialto).not.toHaveBeenCalled();
  });

  it("rejects an unknown venue kind", async () => {
    const res = await POST(makeRequest({ ...validRialtoPayload, kind: "bogus" }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(m.quoteRialto).not.toHaveBeenCalled();
  });

  it("rejects a payment→payment leg (BAD_LEG) — the product never offers it", async () => {
    const USDG = getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
    const res = await POST(
      makeRequest({ ...validRialtoPayload, inputToken: WETH, outputToken: USDG }),
    );
    const body = (await res.json()) as { code: string };
    expect(res.status).toBe(400);
    expect(body.code).toBe("BAD_LEG");
    expect(m.quoteRialto).not.toHaveBeenCalled();
  });

  it("rejects a payment→arbitrary-token leg: counter-token must be the market token or its anchor", async () => {
    const ARBITRARY = getAddress("0x9999999999999999999999999999999999999999");
    const res = await POST(
      makeRequest({ ...validRialtoPayload, inputToken: WETH, outputToken: ARBITRARY }),
    );
    const body = (await res.json()) as { code: string };
    expect(res.status).toBe(400);
    expect(body.code).toBe("BAD_LEG");
    expect(m.quoteRialto).not.toHaveBeenCalled();
  });

  it("rejects a venue value that does not bind to the trade amount (BAD_VALUE)", async () => {
    // ERC-20 input leg must attach zero ETH; a nonzero venue value is refused.
    m.quoteRialto.mockResolvedValue({ ...rialtoQuoteOk, transactionValue: "1" });
    const res = await POST(makeRequest(validRialtoPayload));
    const body = (await res.json()) as { code: string };
    expect(res.status).toBe(409);
    expect(body.code).toBe("BAD_VALUE");
  });

  it("always runs the frozen priority chain: a zeroEx hint still fills via Rialto", async () => {
    const res = await POST(makeRequest({ ...validRialtoPayload, kind: "zeroEx" }));
    const body = (await res.json()) as { ok: boolean; data: { leg: { kind: string } } };
    expect(res.status).toBe(200);
    expect(body.data.leg.kind).toBe("rialto"); // venue actually used, not the hint
    expect(m.quoteRialto).toHaveBeenCalled();
    expect(m.quoteZeroExRoute).not.toHaveBeenCalled(); // Rialto filled first
  });

  it("refuses to return a transaction whose exact calldata simulation reverts", async () => {
    m.client.call.mockRejectedValueOnce(new Error("execution reverted"));
    const res = await POST(makeRequest(validRialtoPayload));
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(res.status).toBe(409);
    expect(body.code).toBe("SIMULATION_FAILED");
  });
});
