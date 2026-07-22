import { describe, expect, it } from "vitest";
// Import through the public server entry ("@bps/rialto/server" maps to ./server.js) to exercise the
// same boundary consumers must use — never the client-reachable main barrel.
import {
  fetchRialtoAllowanceQuote,
  RialtoQuoteError,
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

/** A fully valid allowance quote response body. */
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
    tx: {
      to: ROUTER,
      data: "0x12345678abcdef",
      value: "0",
    },
    issues: { balance: null, simulationIncomplete: false, allowance: { spender: ROUTER } },
  };
}

interface FetchOptions {
  status?: number;
  body?: unknown;
  bodyText?: string;
  throwName?: string;
}

function mockFetch(opts: FetchOptions): typeof fetch {
  return (async () => {
    if (opts.throwName) {
      const e = new Error("boom");
      e.name = opts.throwName;
      throw e;
    }
    const text = opts.bodyText ?? JSON.stringify(opts.body ?? validBody());
    return {
      ok: (opts.status ?? 200) >= 200 && (opts.status ?? 200) < 300,
      status: opts.status ?? 200,
      text: async () => text,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const ENV = { RIALTO_API_KEY: PLACEHOLDER_KEY };

async function run(opts: FetchOptions, cfg: RialtoQuoteConfig = CONFIG, req = REQUEST) {
  return fetchRialtoAllowanceQuote(cfg, req, { fetchImpl: mockFetch(opts), env: ENV });
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<RialtoQuoteError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(RialtoQuoteError);
    expect((e as RialtoQuoteError).code).toBe(code);
    return e as RialtoQuoteError;
  }
  throw new Error(`expected RialtoQuoteError(${code}) but promise resolved`);
}

describe("fetchRialtoAllowanceQuote", () => {
  it("returns sanitized execution fields for an honest allowance quote", async () => {
    const result = await run({});
    expect(result.target).toBe(ROUTER);
    expect(result.callData).toBe("0x12345678abcdef");
    expect(result.sellAmountRaw).toBe(20_000000000000000000n);
    expect(result.minBuyAmountRaw).toBe(1_980_000000000000000000n);
    expect(result.buyToken).toBe(STOCK);
    expect(result.quoteExpiry).toBe(1893456000);
  });

  it("forces the required query parameters and bearer auth", async () => {
    let seenUrl = "";
    let seenAuth = "";
    const spy: typeof fetch = (async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenAuth = (init.headers as Record<string, string>).Authorization ?? "";
      return { ok: true, status: 200, text: async () => JSON.stringify(validBody()) } as Response;
    }) as unknown as typeof fetch;
    await fetchRialtoAllowanceQuote(CONFIG, REQUEST, { fetchImpl: spy, env: ENV });
    expect(seenUrl).toContain("chain_id=4663");
    expect(seenUrl).toContain("settlement=allowance");
    expect(seenUrl).toContain(`sell_token=${WETH.toLowerCase()}`);
    expect(seenUrl).toContain(`buy_token=${STOCK.toLowerCase()}`);
    expect(seenUrl).toContain("sell_amount=20000000000000000000");
    expect(seenUrl).toContain(`taker=${ADAPTER.toLowerCase()}`);
    expect(seenUrl).not.toContain("swap_fee_bps"); // no integrator fee
    expect(seenUrl).not.toContain("permit2");
    expect(seenUrl).not.toContain("gasless");
    expect(seenAuth).toContain("Bearer ");
  });

  it("rejects a missing API key", async () => {
    await expectCode(
      fetchRialtoAllowanceQuote(CONFIG, REQUEST, { fetchImpl: mockFetch({}), env: {} }),
      "MISSING_API_KEY",
    );
  });

  it("rejects a misconfigured chain id", async () => {
    await expectCode(run({}, { ...CONFIG, chainId: 1 }), "BAD_CONFIG");
  });

  it("maps a timeout to TIMEOUT", async () => {
    await expectCode(run({ throwName: "TimeoutError" }), "TIMEOUT");
  });

  it("maps other fetch failures to HTTP_ERROR", async () => {
    await expectCode(run({ throwName: "TypeError" }), "HTTP_ERROR");
  });

  it("rejects a non-2xx status", async () => {
    await expectCode(run({ status: 500 }), "HTTP_ERROR");
  });

  it("rejects invalid JSON", async () => {
    await expectCode(run({ bodyText: "<<not json>>" }), "INVALID_JSON");
  });

  it("rejects an oversized response", async () => {
    const huge = "x".repeat(70000);
    await expectCode(run({ bodyText: huge }), "OVERSIZE_RESPONSE");
  });

  it("rejects a wrong chain in the response", async () => {
    await expectCode(run({ body: { ...validBody(), chain_id: 1 } }), "WRONG_CHAIN");
  });

  it("rejects a non-allowance settlement", async () => {
    await expectCode(run({ body: { ...validBody(), settlement: "gasless" } }), "WRONG_SETTLEMENT");
  });

  it("rejects a Permit2 response", async () => {
    await expectCode(
      run({ body: { ...validBody(), permit2: { owner: ADAPTER } } }),
      "PERMIT2_PRESENT",
    );
  });

  it("rejects a tx.signature_offset (gasless/permit2 marker)", async () => {
    const b = validBody();
    (b.tx as Record<string, unknown>).signature_offset = 4;
    await expectCode(run({ body: b }), "PERMIT2_PRESENT");
  });

  it("rejects a gasless response", async () => {
    await expectCode(run({ body: { ...validBody(), gasless: true } }), "GASLESS_PRESENT");
  });

  it("rejects a wrong sell token", async () => {
    await expectCode(run({ body: { ...validBody(), sell_token: STOCK } }), "WRONG_SELL_TOKEN");
  });

  it("rejects a wrong buy token", async () => {
    await expectCode(run({ body: { ...validBody(), buy_token: WETH } }), "WRONG_BUY_TOKEN");
  });

  it("rejects a wrong sell amount", async () => {
    await expectCode(run({ body: { ...validBody(), sell_amount: "1" } }), "WRONG_SELL_AMOUNT");
  });

  it("rejects a wrong taker", async () => {
    await expectCode(run({ body: { ...validBody(), taker: ROUTER } }), "WRONG_TAKER");
  });

  it("rejects a nonzero tx.value", async () => {
    const b = validBody();
    (b.tx as Record<string, unknown>).value = "1";
    await expectCode(run({ body: b }), "NONZERO_VALUE");
  });

  it("rejects malformed calldata", async () => {
    const b = validBody();
    (b.tx as Record<string, unknown>).data = "0xzz";
    await expectCode(run({ body: b }), "MALFORMED_CALLDATA");
  });

  it("rejects empty calldata", async () => {
    const b = validBody();
    (b.tx as Record<string, unknown>).data = "0x";
    await expectCode(run({ body: b }), "MALFORMED_CALLDATA");
  });

  it("rejects a zero minimum buy amount", async () => {
    await expectCode(run({ body: { ...validBody(), min_buy_amount: "0" } }), "ZERO_MIN_BUY");
  });

  it("rejects a wrong allowance spender", async () => {
    await expectCode(
      run({
        body: {
          ...validBody(),
          issues: { balance: null, simulationIncomplete: false, allowance: { spender: ADAPTER } },
        },
      }),
      "WRONG_ALLOWANCE_SPENDER",
    );
  });

  it("rejects a balance issue", async () => {
    await expectCode(
      run({
        body: { ...validBody(), issues: { balance: { token: WETH }, simulationIncomplete: false } },
      }),
      "BALANCE_ISSUE",
    );
  });

  it("rejects an incomplete simulation", async () => {
    await expectCode(
      run({ body: { ...validBody(), issues: { balance: null, simulationIncomplete: true } } }),
      "SIMULATION_INCOMPLETE",
    );
  });

  it("never discloses the API key in a result or error", async () => {
    const result = await run({});
    const serialized = JSON.stringify(result, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    expect(serialized).not.toContain(PLACEHOLDER_KEY);
    const err = await expectCode(run({ status: 401 }), "HTTP_ERROR");
    expect(err.message).not.toContain(PLACEHOLDER_KEY);
    expect(err.stack ?? "").not.toContain(PLACEHOLDER_KEY);
  });

  it("does not consult a NEXT_PUBLIC client variable for the key", async () => {
    await expectCode(
      fetchRialtoAllowanceQuote(CONFIG, REQUEST, {
        fetchImpl: mockFetch({}),
        env: { NEXT_PUBLIC_RIALTO_API_KEY: PLACEHOLDER_KEY },
      }),
      "MISSING_API_KEY",
    );
  });
});
