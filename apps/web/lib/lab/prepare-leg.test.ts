import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";

// Route-handler tests for POST /api/lab/trade/prepare-leg: the final
// pre-signature gate. Proves the founder's rejection matrix — wrong leg
// tokens, unknown venue, bad venue value — that NO offchain signature is
// required (the wallet transaction itself authenticates the sender), and
// that the incident sell-pause brake blocks exactly the market-token sells.
// Server/adapters are mocked; the zod schemas, same-origin check, and
// handler logic under test are real.

const TOKEN = getAddress("0x1F212fccea9995931f4f2F9CA0C8b641188Ca196");
const GOOGL = getAddress("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3");
const WETH = getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73");
const WALLET = getAddress("0x1000000000000000000000000000000000000001");
const RIALTO_ROUTER = getAddress("0x3000000000000000000000000000000000000003");

const m = vi.hoisted(() => ({
  sellPaused: false,
  tradingPaused: false,
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
    estimateGas: vi.fn(async () => 400_000n),
    getBlockNumber: vi.fn(async () => 1n),
  },
}));

vi.mock("./server", () => ({
  getLabClient: () => m.client,
  isSellPaused: () => m.sellPaused,
  isTradingPaused: () => m.tradingPaused,
}));
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
function makeRequest(payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  reqNo += 1;
  return new Request("https://lab.test/api/lab/trade/prepare-leg", {
    method: "POST",
    headers: {
      origin: "https://lab.test",
      host: "lab.test",
      "content-type": "application/json",
      // distinct client key per request so the fixed-window limiter never trips
      "x-forwarded-for": `10.0.0.${reqNo}`,
    },
    // NO envelope, NO signature — preparation is signature-free by design.
    body: JSON.stringify({ payload, ...extra }),
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
  m.sellPaused = false;
  m.tradingPaused = false;
  m.quoteRialto.mockResolvedValue(rialtoQuoteOk);
  m.quoteOneInch.mockResolvedValue(null);
  m.quoteZeroExRoute.mockResolvedValue(null);
  m.client.call.mockResolvedValue({});
  m.client.estimateGas.mockResolvedValue(400_000n);
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

  it("requires NO offchain signature and logs a structured lab-trade line with the attemptId", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const res = await POST(
        makeRequest(validRialtoPayload, { attemptId: "attempt-abc123", action: 1 }),
      );
      expect(res.status).toBe(200);
      const line = logSpy.mock.calls
        .map((c) => String(c[0]))
        .find((s) => s.includes('"tag":"lab-trade"'));
      expect(line).toBeDefined();
      const parsed = JSON.parse(line!) as Record<string, unknown>;
      expect(parsed.attemptId).toBe("attempt-abc123");
      expect(parsed.action).toBe(1);
      expect(parsed.venue).toBe("rialto");
      expect(parsed.simulation).toBe("ok");
      // Never any signature/calldata material in the log line.
      expect(line).not.toContain("0xabcd");
      expect(line).not.toContain("signature");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("SELL_PAUSED brake: blocks a leg that SELLS the market token (503)", async () => {
    m.sellPaused = true;
    const res = await POST(
      makeRequest({ ...validRialtoPayload, inputToken: TOKEN, outputToken: WETH }),
    );
    const body = (await res.json()) as { code: string };
    expect(res.status).toBe(503);
    expect(body.code).toBe("SELL_PAUSED");
    expect(m.quoteRialto).not.toHaveBeenCalled();
  });

  it("SELL_PAUSED brake: the anchor→payment RECOVERY leg still prepares", async () => {
    m.sellPaused = true;
    m.quoteRialto.mockResolvedValue({ ...rialtoQuoteOk, sellToken: GOOGL, buyToken: WETH });
    const res = await POST(
      makeRequest({ ...validRialtoPayload, inputToken: GOOGL, outputToken: WETH }),
    );
    const body = (await res.json()) as { ok: boolean };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("gas limit is the simulation estimate with a 25% buffer", async () => {
    const res = await POST(makeRequest(validRialtoPayload));
    const body = (await res.json()) as { data: { transaction: { gas: string } } };
    expect(res.status).toBe(200);
    expect(body.data.transaction.gas).toBe("500000"); // 400000 × 1.25
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

  it("TRADING_PAUSED brake: blocks ALL leg preparation (503) before any venue is quoted", async () => {
    m.tradingPaused = true;
    const res = await POST(makeRequest(validRialtoPayload));
    const body = (await res.json()) as { code: string };
    expect(res.status).toBe(503);
    expect(body.code).toBe("TRADING_PAUSED");
    expect(m.quoteRialto).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// VENUE + SPENDER PINNING — the post-approval re-preparation contract. With
// pinnedVenue set the server quotes ONLY that adapter (never the priority
// chain), and rejects (409 VENUE_CHANGED) any fresh quote whose allowance
// target is neither null (allowance satisfied) nor exactly pinnedSpender.
// ---------------------------------------------------------------------------
describe("POST /api/lab/trade/prepare-leg — venue + spender pinning", () => {
  const ZX_SPENDER = getAddress("0x5000000000000000000000000000000000000005");
  const OTHER_SPENDER = getAddress("0x6000000000000000000000000000000000000006");

  const zeroExQuoteOk = {
    buyAmount: "5000000000000000000",
    minimumBuyAmount: "4950000000000000000",
    allowanceTarget: ZX_SPENDER,
    transactionTarget: ZX_SPENDER,
    transactionData: "0x1234" as const,
    transactionValue: "0",
    quoteExpiry: Date.now() + 30_000,
  };

  it("pinnedVenue quotes ONLY that adapter — Rialto and 1inch are never consulted", async () => {
    m.quoteZeroExRoute.mockResolvedValue(zeroExQuoteOk as never);
    const res = await POST(
      makeRequest({
        ...validRialtoPayload,
        kind: "zeroEx",
        pinnedVenue: "zeroEx",
        pinnedSpender: ZX_SPENDER,
      }),
    );
    const body = (await res.json()) as {
      ok: boolean;
      data: { leg: { kind: string }; approvals: { erc20ApprovalTarget: string | null } };
    };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.leg.kind).toBe("zeroEx");
    expect(body.data.approvals.erc20ApprovalTarget).toBe(ZX_SPENDER);
    expect(m.quoteZeroExRoute).toHaveBeenCalled();
    expect(m.quoteRialto).not.toHaveBeenCalled();
    expect(m.quoteOneInch).not.toHaveBeenCalled();
  });

  it("VENUE_CHANGED (409): a fresh spender that differs from pinnedSpender is rejected before balance, allowance, or simulation", async () => {
    m.quoteRialto.mockResolvedValue({ ...rialtoQuoteOk, allowanceTarget: OTHER_SPENDER });
    const res = await POST(
      makeRequest({
        ...validRialtoPayload,
        pinnedVenue: "rialto",
        pinnedSpender: RIALTO_ROUTER,
      }),
    );
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(res.status).toBe(409);
    expect(body.code).toBe("VENUE_CHANGED");
    // Rejected before any chain read or simulation — no transaction escapes.
    expect(m.client.call).not.toHaveBeenCalled();
    expect(m.client.readContract).not.toHaveBeenCalled();
  });

  it("allowance satisfied (allowanceTarget null) is ACCEPTED under a pin — no false VENUE_CHANGED", async () => {
    m.quoteRialto.mockResolvedValue({ ...rialtoQuoteOk, allowanceTarget: null });
    const res = await POST(
      makeRequest({
        ...validRialtoPayload,
        pinnedVenue: "rialto",
        pinnedSpender: RIALTO_ROUTER,
      }),
    );
    const body = (await res.json()) as {
      ok: boolean;
      data: { leg: { kind: string }; approvals: { erc20ApprovalNeeded: boolean } };
    };
    expect(res.status).toBe(200);
    expect(body.data.leg.kind).toBe("rialto");
    expect(body.data.approvals.erc20ApprovalNeeded).toBe(false);
  });

  it("pinned venue with no route → ROUTE_UNAVAILABLE; the chain NEVER falls back to another venue", async () => {
    m.quoteRialto.mockResolvedValue(null);
    m.quoteOneInch.mockResolvedValue(rialtoQuoteOk as never); // would fill unpinned
    const res = await POST(
      makeRequest({
        ...validRialtoPayload,
        pinnedVenue: "rialto",
        pinnedSpender: RIALTO_ROUTER,
      }),
    );
    const body = (await res.json()) as { code: string };
    expect(res.status).toBe(409);
    expect(body.code).toBe("ROUTE_UNAVAILABLE");
    expect(m.quoteOneInch).not.toHaveBeenCalled();
    expect(m.quoteZeroExRoute).not.toHaveBeenCalled();
  });

  it("recovery resume still prepares an UNPINNED single anchor→payment leg through the priority chain", async () => {
    m.quoteRialto.mockResolvedValue({ ...rialtoQuoteOk, sellToken: GOOGL, buyToken: WETH });
    const res = await POST(
      makeRequest({ ...validRialtoPayload, inputToken: GOOGL, outputToken: WETH }),
    );
    const body = (await res.json()) as { ok: boolean; data: { leg: { kind: string } } };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.leg.kind).toBe("rialto");
  });
});
