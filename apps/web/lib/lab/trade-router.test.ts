import { afterEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";

// Routing tests. Every PUBLIC quote is exactly ONE wallet transaction via the
// one-step aggregator chain (Rialto → 1inch → 0x) or the advanced
// direct-anchor BPS route. When no one-step venue fills payment↔token,
// quoteUserTrade throws NO_ROUTE_FOR_PAYMENT_TOKEN — the composed
// 2-transaction fallback is FORBIDDEN and must never be offered.
//
// The three aggregator adapters hit distinct hosts, so the fetch mock branches
// on hostname (and on buy/sell token for Rialto, to separate the direct
// payment↔token attempt from the payment↔anchor leg). The Doppler pool context
// and BPS Direct quote are mocked at the @bps/launch-lab boundary.

const GOOGL = getAddress("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3");
const TOKEN = getAddress("0x1F212fccea9995931f4f2F9CA0C8b641188Ca196");
const WETH = getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73");
const TAKER = getAddress("0x1000000000000000000000000000000000000001");
const R_ROUTER = getAddress("0xc94135b6f9c4e3a3c0d0f3d3f3d3f3d3f3d3f359");
const ONEINCH_ROUTER = getAddress("0x5A705DE8982235a7fa45bB83dCaCf03a211389C7");
const ZEROX_HOLDER = getAddress("0x0000000000001fF3684f28c67538d4D072C22734");
const PERMIT2 = getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3");
const UR = getAddress("0x4000000000000000000000000000000000000004");

const BPS_DIRECT_QUOTE = {
  routeId: "bpsDirectV4",
  routeLabel: "BPS Direct",
  sellToken: GOOGL,
  buyToken: TOKEN,
  sellAmount: "995000000000000000",
  buyAmount: "5000000000000000000",
  minimumBuyAmount: "4950000000000000000",
  estimatedGas: "500000",
  priceImpactBps: 50,
  poolFee: 10_000,
  allowanceTarget: PERMIT2,
  transactionTarget: UR,
  transactionData: "0x1234",
  transactionValue: "0",
  quoteBlock: "1",
  quoteExpiry: Date.now() + 60_000,
  warnings: [],
};

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
      universalRouter: UR,
      permit2: PERMIT2,
      poolKey: {},
    })),
    quoteDirectRoute: vi.fn(async (_c, _t, direction: "buy" | "sell") => ({
      quote:
        direction === "buy"
          ? BPS_DIRECT_QUOTE
          : {
              ...BPS_DIRECT_QUOTE,
              sellToken: TOKEN,
              buyToken: GOOGL,
              sellAmount: "1000000000000000000",
              buyAmount: "2000000000000000000",
              minimumBuyAmount: "1980000000000000000",
            },
    })),
  };
});

import { APPROVED_ANCHORS, NATIVE_ETH, PAYMENT_TOKENS, quoteDirectRoute } from "@bps/launch-lab";
import { quoteAggregatorDirect, quoteUserTrade } from "./trade-router";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

const rialtoBody = {
  chain_id: 4663,
  settlement: "allowance",
  buy_amount: "1000000000000000000",
  min_buy_amount: "995000000000000000",
  platform_fee: { total_bps: 5 },
  route: { legs: [{}] },
  tx: { to: R_ROUTER, data: "0xaa", value: "0" },
  issues: { allowance: { spender: R_ROUTER } },
};
const oneInchSwap = {
  dstAmount: "900000000000000000",
  tx: { to: ONEINCH_ROUTER, data: "0xbb", value: "0" },
};
const zeroExBody = {
  buyAmount: "800000000000000000",
  minBuyAmount: "790000000000000000",
  transaction: { to: ZEROX_HOLDER, data: "0xcc", value: "0" },
  issues: { allowance: { spender: ZEROX_HOLDER } },
  liquidityAvailable: true,
};

/** available: which venues have a route this run. */
function stub(available: { rialto?: boolean; oneInch?: boolean; zeroEx?: boolean }) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("rialto")) {
        return { ok: !!available.rialto, json: async () => rialtoBody };
      }
      if (url.includes("1inch.dev")) {
        if (url.includes("/approve/spender"))
          return { ok: true, json: async () => ({ address: ONEINCH_ROUTER }) };
        return { ok: !!available.oneInch, json: async () => oneInchSwap };
      }
      if (url.includes("0x.org")) {
        return { ok: !!available.zeroEx, json: async () => zeroExBody };
      }
      return { ok: false, json: async () => ({}) };
    }),
  );
  return urls;
}

/** Rialto answers ONLY payment↔anchor pairs (a brand-new BPS token is never
 *  whitelisted) — the exact live production condition. */
function stubAnchorOnlyRialto() {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("rialto")) {
        const anchorLeg =
          url.toLowerCase().includes(`buy_token=${GOOGL.toLowerCase()}`) ||
          url.toLowerCase().includes(`sell_token=${GOOGL.toLowerCase()}`);
        return { ok: anchorLeg, json: async () => rialtoBody };
      }
      return { ok: false, json: async () => ({}) };
    }),
  );
  return urls;
}

const args = {
  sellToken: WETH,
  sellDecimals: 18,
  buyToken: GOOGL,
  sellAmountWei: 10n ** 18n,
  taker: TAKER,
  slippageBps: 100,
};

function allKeys() {
  process.env.RIALTO_API_KEY = "r";
  process.env.ONEINCH_API_KEY = "o";
  process.env.ZEROX_API_KEY = "z";
}

describe("quoteAggregatorDirect — routing priority", () => {
  it("prefers Rialto when all three venues have a route", async () => {
    allKeys();
    stub({ rialto: true, oneInch: true, zeroEx: true });
    const q = await quoteAggregatorDirect(args);
    expect(q?.venue).toBe("rialto");
    expect(q?.buyAmountWei).toBe("1000000000000000000");
  });

  it("falls through to 1inch when Rialto has no route", async () => {
    allKeys();
    stub({ rialto: false, oneInch: true, zeroEx: true });
    const q = await quoteAggregatorDirect(args);
    expect(q?.venue).toBe("oneInch");
  });

  it("falls through to 0x when Rialto and 1inch have no route", async () => {
    allKeys();
    stub({ rialto: false, oneInch: false, zeroEx: true });
    const q = await quoteAggregatorDirect(args);
    expect(q?.venue).toBe("zeroEx");
  });

  it("returns null when no venue has a route", async () => {
    allKeys();
    stub({ rialto: false, oneInch: false, zeroEx: false });
    expect(await quoteAggregatorDirect(args)).toBeNull();
  });

  it("skips unconfigured venues without error (1inch dormant, Rialto down → 0x)", async () => {
    process.env.RIALTO_API_KEY = "r";
    delete process.env.ONEINCH_API_KEY; // dormant-but-ready
    process.env.ZEROX_API_KEY = "z";
    stub({ rialto: false, oneInch: true, zeroEx: true }); // oneInch would win but key is absent
    const q = await quoteAggregatorDirect(args);
    expect(q?.venue).toBe("zeroEx"); // 1inch skipped (no key), so 0x
  });

  it("pinnedVenue quotes ONLY that adapter — the priority chain never runs", async () => {
    allKeys();
    const urls = stub({ rialto: true, oneInch: true, zeroEx: true }); // Rialto would win unpinned
    const q = await quoteAggregatorDirect({ ...args, pinnedVenue: "zeroEx" });
    expect(q?.venue).toBe("zeroEx");
    expect(urls.some((u) => u.includes("rialto"))).toBe(false);
    expect(urls.some((u) => u.includes("1inch.dev"))).toBe(false);
  });

  it("pinnedVenue NEVER falls back: pinned venue down → null even when others could fill", async () => {
    allKeys();
    const urls = stub({ rialto: false, oneInch: true, zeroEx: true });
    const q = await quoteAggregatorDirect({ ...args, pinnedVenue: "rialto" });
    expect(q).toBeNull();
    expect(urls.some((u) => u.includes("1inch.dev"))).toBe(false);
    expect(urls.some((u) => u.includes("0x.org"))).toBe(false);
  });
});

describe("quoteAggregatorDirect — all five anchors × ETH/WETH/USDG, both directions", () => {
  const anchors = APPROVED_ANCHORS.map((a) => ({ symbol: a.symbol, address: a.address }));

  it("covers the full approved matrix", () => {
    expect(anchors.map((a) => a.symbol).sort()).toEqual([
      "AAPL",
      "GOOGL",
      "NVDA",
      "SPCX",
      "TSLA",
    ]);
    expect(PAYMENT_TOKENS.map((p) => p.symbol)).toEqual(["ETH", "WETH", "USDG"]);
  });

  for (const anchor of APPROVED_ANCHORS) {
    for (const payment of PAYMENT_TOKENS) {
      it(`buy leg ${payment.symbol} → ${anchor.symbol} routes via Rialto with the exact tokens`, async () => {
        allKeys();
        const urls = stub({ rialto: true });
        const q = await quoteAggregatorDirect({
          sellToken: payment.address,
          sellDecimals: payment.decimals,
          buyToken: anchor.address,
          sellAmountWei: 10n ** BigInt(payment.decimals),
          taker: TAKER,
          slippageBps: 100,
        });
        expect(q?.venue).toBe("rialto");
        expect(urls[0]).toContain(`sell_token=${encodeURIComponent(payment.address)}`);
        expect(urls[0]).toContain(`buy_token=${encodeURIComponent(anchor.address)}`);
        // Native ETH needs no approval; ERC-20 approves exactly the returned spender.
        if (payment.native) expect(q?.allowanceTarget).toBeNull();
        else expect(q?.allowanceTarget).toBe(R_ROUTER);
      });

      it(`sell leg ${anchor.symbol} → ${payment.symbol} routes via Rialto (reverse direction)`, async () => {
        allKeys();
        const urls = stub({ rialto: true });
        const q = await quoteAggregatorDirect({
          sellToken: anchor.address,
          sellDecimals: 18,
          buyToken: payment.address,
          sellAmountWei: 10n ** 18n,
          taker: TAKER,
          slippageBps: 100,
        });
        expect(q?.venue).toBe("rialto");
        expect(urls[0]).toContain(`sell_token=${encodeURIComponent(anchor.address)}`);
        expect(urls[0]).toContain(`buy_token=${encodeURIComponent(payment.address)}`);
        expect(q?.allowanceTarget).toBe(R_ROUTER); // anchors are ERC-20s
      });
    }
  }
});

describe("quoteUserTrade — public quotes are ONE transaction only (no composed fallback)", () => {
  const client = {} as never; // pool context + direct quote are mocked

  /** Invariant every PUBLIC quote must satisfy: exactly one executable wallet
   *  transaction. Approvals are counted separately in the UI. */
  function expectOneTransaction(q: {
    walletActionCount: number;
    legs: { transactionData: string | null; estimated: boolean }[];
  }) {
    expect(q.walletActionCount).toBe(1);
    expect(q.legs).toHaveLength(1);
    expect(q.legs[0]!.transactionData).not.toBeNull();
    expect(q.legs[0]!.estimated).toBe(false);
  }

  it("anchor-only Rialto liquidity (the live new-market condition): BUY throws NO_ROUTE_FOR_PAYMENT_TOKEN — the composed 2-transaction fallback is NEVER offered", async () => {
    process.env.RIALTO_API_KEY = "r";
    delete process.env.ONEINCH_API_KEY;
    delete process.env.ZEROX_API_KEY;
    stubAnchorOnlyRialto();
    vi.mocked(quoteDirectRoute).mockClear();

    await expect(
      quoteUserTrade(client, {
        marketToken: TOKEN,
        side: "buy",
        inputToken: WETH,
        outputToken: TOKEN,
        exactInputAmountWei: 10n ** 18n,
        taker: TAKER,
        slippageBps: 100,
      }),
    ).rejects.toThrow("NO_ROUTE_FOR_PAYMENT_TOKEN");
    // No composed leg was ever built: the BPS Direct quoter never ran.
    expect(vi.mocked(quoteDirectRoute)).not.toHaveBeenCalled();
  });

  it("anchor-only Rialto liquidity: SELL throws NO_ROUTE_FOR_PAYMENT_TOKEN — no BPS Direct leg is quoted", async () => {
    process.env.RIALTO_API_KEY = "r";
    delete process.env.ONEINCH_API_KEY;
    delete process.env.ZEROX_API_KEY;
    stubAnchorOnlyRialto();
    vi.mocked(quoteDirectRoute).mockClear();

    await expect(
      quoteUserTrade(client, {
        marketToken: TOKEN,
        side: "sell",
        inputToken: TOKEN,
        outputToken: WETH,
        exactInputAmountWei: 10n ** 18n,
        taker: TAKER,
        slippageBps: 100,
      }),
    ).rejects.toThrow("NO_ROUTE_FOR_PAYMENT_TOKEN");
    expect(vi.mocked(quoteDirectRoute)).not.toHaveBeenCalled();
  });

  for (const side of ["buy", "sell"] as const) {
    it(`ALL one-step venues down: ${side} throws NO_ROUTE_FOR_PAYMENT_TOKEN (mapped to the honest 409 by /api/lab/quote)`, async () => {
      allKeys();
      stub({ rialto: false, oneInch: false, zeroEx: false });
      vi.mocked(quoteDirectRoute).mockClear();
      await expect(
        quoteUserTrade(client, {
          marketToken: TOKEN,
          side,
          inputToken: side === "buy" ? WETH : TOKEN,
          outputToken: side === "buy" ? TOKEN : WETH,
          exactInputAmountWei: 10n ** 18n,
          taker: TAKER,
          slippageBps: 100,
        }),
      ).rejects.toThrow("NO_ROUTE_FOR_PAYMENT_TOKEN");
      expect(vi.mocked(quoteDirectRoute)).not.toHaveBeenCalled();
    });
  }

  it("native ETH one-step BUY is exactly ONE transaction with NO approval", async () => {
    allKeys();
    stub({ rialto: true });
    const q = await quoteUserTrade(client, {
      marketToken: TOKEN,
      side: "buy",
      inputToken: NATIVE_ETH,
      outputToken: TOKEN,
      exactInputAmountWei: 10n ** 18n,
      taker: TAKER,
      slippageBps: 100,
    });
    expect(q.routeKind).toBe("one-step");
    expectOneTransaction(q);
    // Native ETH needs no ERC-20 approval — the swap is the only wallet action.
    expect(q.approvalsRequired).toEqual([]);
  });

  it("advanced direct-anchor BUY (anchor → token) stays exactly ONE transaction", async () => {
    allKeys();
    stub({}); // aggregators are never consulted for the anchor-direct path
    const q = await quoteUserTrade(client, {
      marketToken: TOKEN,
      side: "buy",
      inputToken: GOOGL,
      outputToken: TOKEN,
      exactInputAmountWei: 10n ** 18n,
      taker: TAKER,
      slippageBps: 100,
    });
    expect(q.routeKind).toBe("direct-anchor");
    expectOneTransaction(q);
  });

  it("advanced direct-anchor SELL (token → anchor) stays exactly ONE transaction", async () => {
    allKeys();
    stub({});
    const q = await quoteUserTrade(client, {
      marketToken: TOKEN,
      side: "sell",
      inputToken: TOKEN,
      outputToken: GOOGL,
      exactInputAmountWei: 10n ** 18n,
      taker: TAKER,
      slippageBps: 100,
    });
    expect(q.routeKind).toBe("direct-anchor");
    expectOneTransaction(q);
  });

  it("one-step SELL requires approval of the MARKET token (never the payment token)", async () => {
    allKeys();
    stub({ rialto: true });
    const q = await quoteUserTrade(client, {
      marketToken: TOKEN,
      side: "sell",
      inputToken: TOKEN,
      outputToken: WETH,
      exactInputAmountWei: 10n ** 18n,
      taker: TAKER,
      slippageBps: 100,
    });
    expect(q.routeKind).toBe("one-step");
    expectOneTransaction(q);
    // SELL spends the market token — an ERC-20 that always needs approval.
    expect(q.approvalsRequired).toEqual([{ token: TOKEN, spender: R_ROUTER }]);
  });

  it("a one-step direct route wins when an aggregator can fill payment ↔ token directly", async () => {
    allKeys();
    stub({ rialto: true }); // Rialto fills even the direct pair in this scenario
    const q = await quoteUserTrade(client, {
      marketToken: TOKEN,
      side: "buy",
      inputToken: WETH,
      outputToken: TOKEN,
      exactInputAmountWei: 10n ** 18n,
      taker: TAKER,
      slippageBps: 100,
    });
    expect(q.routeKind).toBe("one-step");
    expectOneTransaction(q);
    expect(q.legs[0]!.kind).toBe("rialto");
  });

  it("rejects an unsupported payment token", async () => {
    process.env.RIALTO_API_KEY = "r";
    stubAnchorOnlyRialto();
    await expect(
      quoteUserTrade(client, {
        marketToken: TOKEN,
        side: "buy",
        inputToken: getAddress("0x9999999999999999999999999999999999999999"),
        outputToken: TOKEN,
        exactInputAmountWei: 10n ** 18n,
        taker: TAKER,
        slippageBps: 100,
      }),
    ).rejects.toThrow("UNSUPPORTED_PAYMENT_TOKEN");
  });
});
