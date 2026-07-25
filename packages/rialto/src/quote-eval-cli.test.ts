import { describe, expect, it, vi } from "vitest";
// Exercise the harness through the server entry consumers must use.
import {
  runQuoteEval,
  configFromEnv,
  type RialtoQuoteConfig,
  type RialtoQuoteRequest,
} from "./server.js";

const WETH = "0x1111111111111111111111111111111111111111";
const ADAPTER = "0x2222222222222222222222222222222222222222";
const STOCK = "0x3333333333333333333333333333333333333333";
const ROUTER = "0x71a120cbbf3ce7cd910a3c50ff77afc62735687e";
const PLACEHOLDER_KEY = "test-placeholder-key-not-a-real-credential";

const CONFIG: RialtoQuoteConfig = {
  apiBaseUrl: "https://quote.example.test",
  chainId: 4663,
  wethAddress: WETH,
  adapterAddress: ADAPTER,
  slippageBps: 50,
};

const REQUEST: RialtoQuoteRequest = { buyToken: STOCK, sellAmountRaw: 20_000000000000000000n };

function validBody(): Record<string, unknown> {
  return {
    chain_id: 4663,
    settlement: "allowance",
    sell_token: WETH,
    buy_token: STOCK,
    sell_amount: "20000000000000000000",
    min_buy_amount: "1980000000000000000000",
    taker: ADAPTER,
    expiry: 1893456000,
    tx: { to: ROUTER, data: "0x12345678abcdef", value: "0" },
    issues: { balance: null, simulationIncomplete: false, allowance: { spender: ROUTER } },
  };
}

function mockFetch(body: unknown = validBody(), status = 200): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    }) as unknown as Response) as unknown as typeof fetch;
}

const ENV = { RIALTO_API_KEY: PLACEHOLDER_KEY };

describe("runQuoteEval — isolated non-executing GET /quote harness", () => {
  it("reports sanitized quote fields including the selector and target", async () => {
    const report = await runQuoteEval(
      CONFIG,
      REQUEST,
      { fetchImpl: mockFetch(), env: ENV },
      { resolvedRouter: ROUTER, nowSec: 1_700_000_000 },
    );
    expect(report.ok).toBe(true);
    expect(report.quote).not.toBeNull();
    expect(report.quote?.selector).toBe("0x12345678");
    expect(report.quote?.target).toBe(ROUTER);
    expect(report.quote?.callDataBytes).toBe(7); // "12345678abcdef" = 14 hex chars = 7 bytes
    expect(report.quote?.sellAmountRaw).toBe("20000000000000000000");
    expect(report.quote?.minBuyAmountRaw).toBe("1980000000000000000000");
    expect(report.quote?.buyToken).toBe(STOCK);
    expect(report.quote?.quoteExpiry).toBe(1893456000);
  });

  it("fails the structural stage closed (SELECTOR_POLICY_MISSING) when the router is resolved but no selector is approved", async () => {
    const report = await runQuoteEval(
      CONFIG,
      REQUEST,
      { fetchImpl: mockFetch(), env: ENV },
      { resolvedRouter: ROUTER, nowSec: 1_700_000_000 },
    );
    expect(report.structuralPassed).toBe(false);
    expect(report.structuralErrorCode).toBe("SELECTOR_POLICY_MISSING");
    // Structural failure means settlement is NOT claimed — boundary stops at QUOTE_OBSERVED.
    expect(report.boundaryStatus).toBe("QUOTE_OBSERVED");
  });

  it("fails the structural stage closed (ROUTER_UNRESOLVED) when no live router is supplied", async () => {
    const report = await runQuoteEval(
      CONFIG,
      REQUEST,
      { fetchImpl: mockFetch(), env: ENV },
      { resolvedRouter: null, nowSec: 1_700_000_000 },
    );
    expect(report.structuralPassed).toBe(false);
    expect(report.structuralErrorCode).toBe("ROUTER_UNRESOLVED");
    expect(report.boundaryStatus).toBe("QUOTE_OBSERVED");
  });

  it("never includes the API key anywhere in the serialized report", async () => {
    const report = await runQuoteEval(
      CONFIG,
      REQUEST,
      { fetchImpl: mockFetch(), env: ENV },
      { resolvedRouter: ROUTER, nowSec: 1_700_000_000 },
    );
    expect(JSON.stringify(report)).not.toContain(PLACEHOLDER_KEY);
  });

  it("returns MISSING_API_KEY WITHOUT performing any network request when the key is absent", async () => {
    const fetchSpy = vi.fn(mockFetch());
    const report = await runQuoteEval(
      CONFIG,
      REQUEST,
      { fetchImpl: fetchSpy as unknown as typeof fetch, env: {} },
      { resolvedRouter: ROUTER },
    );
    expect(report.ok).toBe(false);
    expect(report.stage).toBe("fetch");
    expect(report.fetchErrorCode).toBe("MISSING_API_KEY");
    expect(report.boundaryStatus).toBe("QUOTE_NOT_OBSERVED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces a sanitized fetch error code on a non-2xx venue response", async () => {
    const report = await runQuoteEval(
      CONFIG,
      REQUEST,
      { fetchImpl: mockFetch(validBody(), 503), env: ENV },
      { resolvedRouter: ROUTER },
    );
    expect(report.ok).toBe(false);
    expect(report.fetchErrorCode).toBe("HTTP_ERROR");
    expect(report.quote).toBeNull();
  });

  it("marks the report as GET /quote only (non-executing)", async () => {
    const report = await runQuoteEval(CONFIG, REQUEST, { fetchImpl: mockFetch(), env: ENV });
    expect(report.note).toContain("no signing");
    expect(report.note).toContain("submission");
  });
});

describe("configFromEnv — strict env parsing, no secret capture", () => {
  const base = {
    RIALTO_API_KEY: PLACEHOLDER_KEY,
    RIALTO_API_BASE_URL: "https://quote.example.test",
    RIALTO_SELL_TOKEN: WETH,
    RIALTO_BUY_TOKEN: STOCK,
    RIALTO_TAKER: ADAPTER,
    RIALTO_SELL_AMOUNT: "20000000000000000000",
    RIALTO_SLIPPAGE_BPS: "50",
  };

  it("builds a chain-4663 config/request from a complete environment", () => {
    const { config, request, resolvedRouter } = configFromEnv({ ...base });
    expect(config.chainId).toBe(4663);
    expect(config.apiBaseUrl).toBe("https://quote.example.test");
    expect(config.wethAddress).toBe(WETH);
    expect(config.adapterAddress).toBe(ADAPTER);
    expect(config.slippageBps).toBe(50);
    expect(request.buyToken).toBe(STOCK);
    expect(request.sellAmountRaw).toBe(20_000000000000000000n);
    expect(resolvedRouter).toBeNull();
  });

  it("passes through an optional resolved router", () => {
    const { resolvedRouter } = configFromEnv({ ...base, RIALTO_RESOLVED_ROUTER: ROUTER });
    expect(resolvedRouter).toBe(ROUTER);
  });

  it("throws for a missing API key without reading trade params", () => {
    const { RIALTO_API_KEY: _omit, ...noKey } = base;
    expect(() => configFromEnv(noKey)).toThrow(/RIALTO_API_KEY/);
  });

  it("rejects a non-integer sell amount (no float/decimal inputs)", () => {
    expect(() => configFromEnv({ ...base, RIALTO_SELL_AMOUNT: "1.5" })).toThrow(
      /base-unit integer/,
    );
  });

  it("rejects a non-integer slippage", () => {
    expect(() => configFromEnv({ ...base, RIALTO_SLIPPAGE_BPS: "0.5" })).toThrow(/integer/);
  });

  it.each([
    "RIALTO_API_BASE_URL",
    "RIALTO_SELL_TOKEN",
    "RIALTO_BUY_TOKEN",
    "RIALTO_TAKER",
    "RIALTO_SELL_AMOUNT",
    "RIALTO_SLIPPAGE_BPS",
  ])("throws when %s is missing", (key) => {
    const env: Record<string, string | undefined> = { ...base };
    delete env[key];
    expect(() => configFromEnv(env)).toThrow(new RegExp(key));
  });
});
