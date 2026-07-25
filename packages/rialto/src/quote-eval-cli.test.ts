import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
// Exercise the harness through the server entry consumers must use.
import {
  runQuoteEval,
  configFromEnv,
  OFFICIAL_RIALTO_ORIGIN,
  OFFICIAL_RIALTO_ROUTER_REGISTRY,
  type RialtoQuoteConfig,
  type RialtoQuoteRequest,
} from "./server.js";

const WETH = "0x1111111111111111111111111111111111111111";
const ADAPTER = "0x2222222222222222222222222222222222222222";
const STOCK = "0x3333333333333333333333333333333333333333";
const POOL = "0x4444444444444444444444444444444444444444";
const ROUTER = "0x71a120cbbf3ce7cd910a3c50ff77afc62735687e";
const PLACEHOLDER_KEY = "test-placeholder-key-not-a-real-credential";
const RAW_QUOTE_ID = "qid-secret-do-not-emit-123";

const CONFIG: RialtoQuoteConfig = {
  apiBaseUrl: OFFICIAL_RIALTO_ORIGIN,
  chainId: 4663,
  wethAddress: WETH,
  adapterAddress: ADAPTER,
  slippageBps: 50,
};

// 0.01 WETH → 10000000000000000 raw base units.
const REQUEST: RialtoQuoteRequest = { buyToken: STOCK, sellAmountDecimal: "0.01" };

function validBody(): Record<string, unknown> {
  return {
    chain_id: 4663,
    settlement: "allowance",
    sell_token: WETH,
    buy_token: STOCK,
    sell_amount: "10000000000000000", // RAW echo of 0.01 WETH
    buy_amount: "2500000000000000000",
    min_buy_amount: "2475000000000000000",
    taker: ADAPTER,
    expiry: 1893456000,
    created_at: 1785000000,
    quote_id: RAW_QUOTE_ID,
    fees: { platform_bps: 20, platform_fee_amount: "5000000000000" },
    network_fee: "210000",
    route: [{ pool: POOL, fee: 3000, token_in: WETH, token_out: STOCK }],
    tx: { to: ROUTER, data: "0x12345678abcdef", value: "0" },
    issues: { balance: null, simulationIncomplete: false, allowance: { spender: ROUTER } },
  };
}

/** Mock fetch that records the request URL + init, returning `body` with `status`. */
function recordingFetch(
  sink: { url: string; method: string },
  body: unknown = validBody(),
  status = 200,
) {
  return (async (url: string, init: RequestInit) => {
    sink.url = url;
    sink.method = String(init?.method ?? "");
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const ENV = { RIALTO_API_KEY: PLACEHOLDER_KEY };

describe("runQuoteEval — isolated non-executing GET /quote harness", () => {
  it("reports the full sanitized quote metadata", async () => {
    const sink = { url: "", method: "" };
    const report = await runQuoteEval(
      CONFIG,
      REQUEST,
      { fetchImpl: recordingFetch(sink), env: ENV },
      { resolvedRouter: ROUTER, nowSec: 1_700_000_000 },
    );
    expect(report.ok).toBe(true);
    expect(report.request.chainId).toBe(4663);
    expect(report.request.sellAmountDecimal).toBe("0.01");
    expect(report.request.integratorFeeRequested).toBe(false);
    expect(report.request.settlementModeRequested).toBe("allowance");
    const q = report.quote;
    expect(q).not.toBeNull();
    expect(q?.selector).toBe("0x12345678");
    expect(q?.callDataBytes).toBe(7);
    expect(q?.requestedSellAmountDecimal).toBe("0.01");
    expect(q?.returnedSellAmountRaw).toBe("10000000000000000");
    expect(q?.buyAmountRaw).toBe("2500000000000000000");
    expect(q?.minBuyAmountRaw).toBe("2475000000000000000");
    expect(q?.settlementMode).toBe("allowance");
    expect(q?.integratorFeeRequested).toBe(false);
    expect(q?.platformFee).toMatchObject({ platform_bps: 20 });
    expect(q?.networkFeeEstimate).toBe("210000");
    expect(q?.issues).toEqual({
      balance: "none",
      simulationIncomplete: false,
      allowanceSpender: ROUTER,
    });
    expect(q?.routeLegs).toEqual([{ pool: POOL, feeTier: 3000, tokenIn: WETH, tokenOut: STOCK }]);
    expect(q?.txTarget).toBe(ROUTER);
    expect(q?.txValue).toBe("0");
    expect(q?.quoteExpirySec).toBe(1893456000);
    expect(q?.quoteCreatedAtSec).toBe(1785000000);
    expect(q?.quoteIdSha256).toBe(createHash("sha256").update(RAW_QUOTE_ID, "utf8").digest("hex"));
  });

  it("transmits sell_amount as 0.01, NOT converted to raw base units", async () => {
    const sink = { url: "", method: "" };
    await runQuoteEval(CONFIG, REQUEST, { fetchImpl: recordingFetch(sink), env: ENV });
    expect(sink.url).toContain("sell_amount=0.01");
    expect(sink.url).not.toContain("10000000000000000");
  });

  it("uses only HTTP GET on the /quote path", async () => {
    const sink = { url: "", method: "" };
    await runQuoteEval(CONFIG, REQUEST, { fetchImpl: recordingFetch(sink), env: ENV });
    expect(sink.method).toBe("GET");
    expect(new URL(sink.url).pathname).toBe("/quote");
  });

  it("performs NO network request when the decimal amount is invalid", async () => {
    const spy = vi.fn((async () => {
      throw new Error("network must not be called");
    }) as unknown as typeof fetch);
    const report = await runQuoteEval(
      CONFIG,
      { buyToken: STOCK, sellAmountDecimal: "not-a-number" },
      { fetchImpl: spy, env: ENV },
    );
    expect(report.ok).toBe(false);
    expect(report.fetchErrorCode).toBe("BAD_SELL_AMOUNT");
    expect(spy).not.toHaveBeenCalled();
  });

  it("performs NO network request for a non-official origin", async () => {
    const spy = vi.fn((async () => {
      throw new Error("network must not be called");
    }) as unknown as typeof fetch);
    const report = await runQuoteEval(
      { ...CONFIG, apiBaseUrl: "https://evil.example.com" },
      REQUEST,
      { fetchImpl: spy, env: ENV },
    );
    expect(report.ok).toBe(false);
    expect(report.fetchErrorCode).toBe("BAD_ORIGIN");
    expect(spy).not.toHaveBeenCalled();
  });

  it("performs NO network request when the key is absent", async () => {
    const spy = vi.fn(recordingFetch({ url: "", method: "" }));
    const report = await runQuoteEval(CONFIG, REQUEST, {
      fetchImpl: spy as unknown as typeof fetch,
      env: {},
    });
    expect(report.ok).toBe(false);
    expect(report.fetchErrorCode).toBe("MISSING_API_KEY");
    expect(report.boundaryStatus).toBe("QUOTE_NOT_OBSERVED");
    expect(spy).not.toHaveBeenCalled();
  });

  it("never emits the API key, the raw quote_id, or the full calldata (report or error)", async () => {
    const report = await runQuoteEval(
      CONFIG,
      REQUEST,
      { fetchImpl: recordingFetch({ url: "", method: "" }), env: ENV },
      { resolvedRouter: ROUTER },
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(PLACEHOLDER_KEY);
    expect(serialized).not.toContain(RAW_QUOTE_ID);
    expect(serialized).not.toContain("abcdef"); // the non-selector tail of the calldata
    expect(report.quote?.quoteIdSha256).toBeTruthy();
    expect(report.quote?.selector).toBe("0x12345678");
  });

  it("records the router target as a candidate that must be reconciled against the official registry", async () => {
    const report = await runQuoteEval(
      CONFIG,
      REQUEST,
      { fetchImpl: recordingFetch({ url: "", method: "" }), env: ENV },
      { resolvedRouter: null },
    );
    expect(report.routerReconciliation?.authoritative).toBe(false);
    expect(report.routerReconciliation?.officialRegistry).toBe(OFFICIAL_RIALTO_ROUTER_REGISTRY);
    expect(report.routerReconciliation?.observedTarget).toBe(ROUTER);
  });

  it("cannot mark D-5 or D-6 as closed", async () => {
    const report = await runQuoteEval(
      CONFIG,
      REQUEST,
      { fetchImpl: recordingFetch({ url: "", method: "" }), env: ENV },
      { resolvedRouter: ROUTER },
    );
    expect(report.governance.d5).toContain("OPEN");
    expect(report.governance.d6).toContain("OPEN");
    expect(report.governance.d24).toContain("STANDS");
    const s = JSON.stringify(report.governance).toLowerCase();
    expect(s).not.toContain("closed");
    expect(s).not.toContain("pinned; approved");
  });

  it("fails the structural stage closed (ROUTER_UNRESOLVED / SELECTOR_POLICY_MISSING)", async () => {
    const unresolved = await runQuoteEval(
      CONFIG,
      REQUEST,
      { fetchImpl: recordingFetch({ url: "", method: "" }), env: ENV },
      { resolvedRouter: null, nowSec: 1_700_000_000 },
    );
    expect(unresolved.structural.passed).toBe(false);
    expect(unresolved.structural.errorCode).toBe("ROUTER_UNRESOLVED");
    expect(unresolved.boundaryStatus).toBe("QUOTE_OBSERVED");

    const resolved = await runQuoteEval(
      CONFIG,
      REQUEST,
      { fetchImpl: recordingFetch({ url: "", method: "" }), env: ENV },
      { resolvedRouter: ROUTER, nowSec: 1_700_000_000 },
    );
    expect(resolved.structural.errorCode).toBe("SELECTOR_POLICY_MISSING");
  });
});

describe("module import safety", () => {
  it("importing the CLI module triggers no network request or process exit", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((async () => {
      throw new Error("import must not fetch");
    }) as unknown as typeof fetch);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((): never => {
      throw new Error("import must not exit");
    }) as never);
    try {
      const mod = await import("./quote-eval-cli.js");
      expect(typeof mod.runQuoteEval).toBe("function");
      expect(typeof mod.configFromEnv).toBe("function");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });
});

describe("configFromEnv — strict env parsing, no secret capture", () => {
  const base = {
    RIALTO_API_KEY: PLACEHOLDER_KEY,
    RIALTO_SELL_TOKEN: WETH,
    RIALTO_BUY_TOKEN: STOCK,
    RIALTO_TAKER: ADAPTER,
    RIALTO_SELL_AMOUNT_DECIMAL: "0.01",
    RIALTO_SLIPPAGE_BPS: "50",
  };

  it("defaults to the official origin and builds a chain-4663 config/request", () => {
    const { config, request, resolvedRouter } = configFromEnv({ ...base });
    expect(config.apiBaseUrl).toBe(OFFICIAL_RIALTO_ORIGIN);
    expect(config.chainId).toBe(4663);
    expect(config.wethAddress).toBe(WETH);
    expect(config.adapterAddress).toBe(ADAPTER);
    expect(config.slippageBps).toBe(50);
    expect(request.buyToken).toBe(STOCK);
    expect(request.sellAmountDecimal).toBe("0.01");
    expect(resolvedRouter).toBeNull();
  });

  it("passes through an origin override and an optional resolved router", () => {
    const { config, resolvedRouter } = configFromEnv({
      ...base,
      RIALTO_API_BASE_URL: "https://rialto-trade-api.rialto.xyz",
      RIALTO_RESOLVED_ROUTER: ROUTER,
    });
    expect(config.apiBaseUrl).toBe("https://rialto-trade-api.rialto.xyz");
    expect(resolvedRouter).toBe(ROUTER);
  });

  it("throws for a missing API key", () => {
    const { RIALTO_API_KEY: _omit, ...noKey } = base;
    expect(() => configFromEnv(noKey)).toThrow(/RIALTO_API_KEY/);
  });

  it("rejects a non-decimal / non-positive sell amount", () => {
    expect(() =>
      configFromEnv({ ...base, RIALTO_SELL_AMOUNT_DECIMAL: "10000000000000000x" }),
    ).toThrow(/positive decimal/);
    expect(() => configFromEnv({ ...base, RIALTO_SELL_AMOUNT_DECIMAL: "0" })).toThrow(
      /positive decimal/,
    );
  });

  it("rejects a non-integer slippage", () => {
    expect(() => configFromEnv({ ...base, RIALTO_SLIPPAGE_BPS: "0.5" })).toThrow(/integer/);
  });

  it.each([
    "RIALTO_SELL_TOKEN",
    "RIALTO_BUY_TOKEN",
    "RIALTO_TAKER",
    "RIALTO_SELL_AMOUNT_DECIMAL",
    "RIALTO_SLIPPAGE_BPS",
  ])("throws when %s is missing", (key) => {
    const env: Record<string, string | undefined> = { ...base };
    delete env[key];
    expect(() => configFromEnv(env)).toThrow(new RegExp(key));
  });
});
