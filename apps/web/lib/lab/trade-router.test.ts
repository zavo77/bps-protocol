import { afterEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";

// Routing tests for the frozen V1 architecture:
//   BUY : payment → [Rialto] → anchor → [BPS Direct] → market token
//   SELL: market token → [BPS Direct] → anchor → [Rialto] → payment
// with one-step aggregator routes attempted first (Rialto → 1inch → 0x) and
// never depended on for brand-new BPS pools.
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

import { APPROVED_ANCHORS, PAYMENT_TOKENS } from "@bps/launch-lab";
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

describe("quoteUserTrade — frozen V1 composed architecture", () => {
  const client = {} as never; // pool context + direct quote are mocked

  it("NORMAL BUY: payment → Rialto → anchor, then BPS Direct anchor → token (2 wallet actions)", async () => {
    process.env.RIALTO_API_KEY = "r";
    delete process.env.ONEINCH_API_KEY;
    delete process.env.ZEROX_API_KEY;
    stubAnchorOnlyRialto();

    const q = await quoteUserTrade(client, {
      marketToken: TOKEN,
      side: "buy",
      inputToken: WETH,
      outputToken: TOKEN,
      exactInputAmountWei: 10n ** 18n,
      taker: TAKER,
      slippageBps: 100,
    });

    expect(q.routeKind).toBe("composed");
    expect(q.walletActionCount).toBe(2);
    expect(q.legs).toHaveLength(2);
    // Leg 1: Rialto payment → anchor, executable now.
    expect(q.legs[0]!.kind).toBe("rialto");
    expect(q.legs[0]!.inputToken).toBe(WETH);
    expect(q.legs[0]!.outputToken).toBe(GOOGL);
    expect(q.legs[0]!.estimated).toBe(false);
    expect(q.legs[0]!.transactionTarget).toBe(R_ROUTER);
    // Leg 2: BPS Direct anchor → token, ESTIMATED (re-prepared from the actual
    // received amount after leg 1 confirms — never a reused stale estimate).
    expect(q.legs[1]!.kind).toBe("bpsDirect");
    expect(q.legs[1]!.inputToken).toBe(GOOGL);
    expect(q.legs[1]!.outputToken).toBe(TOKEN);
    expect(q.legs[1]!.estimated).toBe(true);
    expect(q.legs[1]!.transactionData).toBeNull();
    // Approvals: payment→Rialto spender, anchor→Permit2.
    expect(q.approvalsRequired).toEqual([
      { token: WETH, spender: R_ROUTER },
      { token: GOOGL, spender: PERMIT2 },
    ]);
    expect(q.zeroExFeeNote).toContain("Rialto");
    expect(q.zeroExFeeNote).toContain("5 bps");
    expect(q.warnings.join(" ")).toMatch(/Two steps/);
  });

  it("NORMAL SELL: BPS Direct token → anchor, then Rialto anchor → payment (reverse route)", async () => {
    process.env.RIALTO_API_KEY = "r";
    delete process.env.ONEINCH_API_KEY;
    delete process.env.ZEROX_API_KEY;
    stubAnchorOnlyRialto();

    const q = await quoteUserTrade(client, {
      marketToken: TOKEN,
      side: "sell",
      inputToken: TOKEN,
      outputToken: WETH,
      exactInputAmountWei: 10n ** 18n,
      taker: TAKER,
      slippageBps: 100,
    });

    expect(q.routeKind).toBe("composed");
    expect(q.walletActionCount).toBe(2);
    // Leg 1: BPS Direct token → anchor, executable now.
    expect(q.legs[0]!.kind).toBe("bpsDirect");
    expect(q.legs[0]!.inputToken).toBe(TOKEN);
    expect(q.legs[0]!.outputToken).toBe(GOOGL);
    expect(q.legs[0]!.estimated).toBe(false);
    // Leg 2: Rialto anchor → payment, estimated until leg 1 confirms.
    expect(q.legs[1]!.kind).toBe("rialto");
    expect(q.legs[1]!.inputToken).toBe(GOOGL);
    expect(q.legs[1]!.outputToken).toBe(WETH);
    expect(q.legs[1]!.estimated).toBe(true);
    expect(q.legs[1]!.transactionData).toBeNull();
    // The venue already enforced slippage on leg 2 — the route minimum is the
    // venue-reported minimum, never slippage applied a second time.
    expect(q.minimumFinalOutputWei).toBe("995000000000000000");
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
    expect(q.walletActionCount).toBe(1);
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
