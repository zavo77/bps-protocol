// TASK 10H-1 — structural quote-execution validation tests (all offline; no network).
import { describe, expect, it } from "vitest";
import { encodeAbiParameters } from "viem";
import type { RialtoQuoteResult } from "./quote-client.js";
import {
  DEFAULT_FORBIDDEN_SELECTORS,
  validateQuoteExecution,
  type ApprovedSelector,
  type QuoteExecutionContext,
  type QuoteExecutionPolicy,
} from "./quote-structural.js";

const ROUTER = "0xc94135b63772b91d79d0a2daab2a8801f32359bd"; // live-resolved feature-2 router
const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec";
const ADAPTER = "0x00000000000000000000000000000000000000ad";
const AMOUNT = 123_456_789n;

// A HYPOTHETICAL settle-shaped schema used ONLY to test the validation machinery. It is NOT an
// approved production selector: the real venue selector remains unpinned (fail-closed by default).
const TEST_SCHEMA: ApprovedSelector = {
  selector: "0xaabbccdd",
  signature: "testSettle(address,uint256,address) [LOCAL_TEST_ONLY — NOT an approved selector]",
  params: [{ type: "address" }, { type: "uint256" }, { type: "address" }],
  tokenArgIndex: 0,
  amountArgIndex: 1,
  recipientArgIndex: 2,
};

function makeQuote(over: Partial<RialtoQuoteResult> = {}): RialtoQuoteResult {
  const args = encodeAbiParameters(TEST_SCHEMA.params as never, [NVDA, AMOUNT, ADAPTER] as never);
  return {
    target: ROUTER,
    callData: `0xaabbccdd${args.slice(2)}`,
    sellAmountRaw: AMOUNT,
    minBuyAmountRaw: 1n,
    buyToken: NVDA,
    quoteExpiry: 2_000_000_000,
    ...over,
  };
}

function ctx(over: Partial<QuoteExecutionContext> = {}): QuoteExecutionContext {
  return {
    chainId: 4663,
    resolvedRouter: ROUTER,
    expectedBuyToken: NVDA,
    expectedSellAmountRaw: AMOUNT,
    expectedRecipient: ADAPTER,
    nowSec: 1_900_000_000,
    ...over,
  };
}

const POLICY: QuoteExecutionPolicy = { approvedSelectors: [TEST_SCHEMA] };
const EMPTY: QuoteExecutionPolicy = { approvedSelectors: [] };

describe("quote execution structural validation (fail-closed)", () => {
  it("empty selector policy fails closed (SELECTOR_POLICY_MISSING) — the production default", () => {
    expect(() => validateQuoteExecution(makeQuote(), ctx(), EMPTY)).toThrowError(
      /SELECTOR_POLICY_MISSING/,
    );
  });

  it("valid quote against a configured schema decodes, round-trips and binds all roles", () => {
    const v = validateQuoteExecution(makeQuote(), ctx(), POLICY);
    expect(v.selector).toBe("0xaabbccdd");
    expect(v.boundToken?.toLowerCase()).toBe(NVDA);
    expect(v.boundAmount).toBe(AMOUNT.toString());
    expect(v.boundRecipient?.toLowerCase()).toBe(ADAPTER);
  });

  it("wrong chain id fails", () => {
    expect(() => validateQuoteExecution(makeQuote(), ctx({ chainId: 1 }), POLICY)).toThrowError(
      /WRONG_CHAIN/,
    );
  });

  it("unresolved router fails (ROUTER_UNRESOLVED)", () => {
    expect(() =>
      validateQuoteExecution(makeQuote(), ctx({ resolvedRouter: null }), POLICY),
    ).toThrowError(/ROUTER_UNRESOLVED/);
  });

  it("tx.to != currently resolved router fails (router changed after quote)", () => {
    expect(() =>
      validateQuoteExecution(
        makeQuote({ target: "0x00000000000000000000000000000000000000f1" }),
        ctx(),
        POLICY,
      ),
    ).toThrowError(/ROUTER_MISMATCH/);
  });

  it("empty calldata fails", () => {
    expect(() => validateQuoteExecution(makeQuote({ callData: "0x" }), ctx(), POLICY)).toThrowError(
      /EMPTY_CALLDATA/,
    );
  });

  it("short calldata fails", () => {
    expect(() =>
      validateQuoteExecution(makeQuote({ callData: "0xaabbcc" }), ctx(), POLICY),
    ).toThrowError(/SHORT_CALLDATA/);
  });

  it("unknown selector fails", () => {
    const q = makeQuote();
    expect(() =>
      validateQuoteExecution(
        { ...q, callData: `0x11223344${q.callData.slice(10)}` },
        ctx(),
        POLICY,
      ),
    ).toThrowError(/UNKNOWN_SELECTOR/);
  });

  it("opaque multicall selectors are forbidden even if someone tried to approve traffic through them", () => {
    for (const sel of DEFAULT_FORBIDDEN_SELECTORS) {
      const q = makeQuote();
      expect(() =>
        validateQuoteExecution({ ...q, callData: `${sel}00` }, ctx(), POLICY),
      ).toThrowError(/MULTICALL_FORBIDDEN/);
    }
  });

  it("trailing bytes after canonical encoding fail (TRAILING_CALLDATA)", () => {
    const q = makeQuote();
    expect(() =>
      validateQuoteExecution({ ...q, callData: `${q.callData}00` }, ctx(), POLICY),
    ).toThrowError(/TRAILING_CALLDATA|DECODE_FAILED/);
  });

  it("truncated argument region fails to decode", () => {
    const q = makeQuote();
    expect(() =>
      validateQuoteExecution({ ...q, callData: q.callData.slice(0, 70) }, ctx(), POLICY),
    ).toThrowError(/DECODE_FAILED/);
  });

  it("token substitution in decoded args fails", () => {
    const args = encodeAbiParameters(
      TEST_SCHEMA.params as never,
      ["0x00000000000000000000000000000000000000ee", AMOUNT, ADAPTER] as never,
    );
    expect(() =>
      validateQuoteExecution(makeQuote({ callData: `0xaabbccdd${args.slice(2)}` }), ctx(), POLICY),
    ).toThrowError(/ARG_TOKEN_MISMATCH/);
  });

  it("amount substitution fails", () => {
    const args = encodeAbiParameters(
      TEST_SCHEMA.params as never,
      [NVDA, AMOUNT + 1n, ADAPTER] as never,
    );
    expect(() =>
      validateQuoteExecution(makeQuote({ callData: `0xaabbccdd${args.slice(2)}` }), ctx(), POLICY),
    ).toThrowError(/ARG_AMOUNT_MISMATCH/);
  });

  it("recipient substitution fails", () => {
    const args = encodeAbiParameters(
      TEST_SCHEMA.params as never,
      [NVDA, AMOUNT, "0x00000000000000000000000000000000000000ff"] as never,
    );
    expect(() =>
      validateQuoteExecution(makeQuote({ callData: `0xaabbccdd${args.slice(2)}` }), ctx(), POLICY),
    ).toThrowError(/ARG_RECIPIENT_MISMATCH/);
  });

  it("missing expiry fails; expired quote fails; quote cannot be replayed past expiry", () => {
    expect(() =>
      validateQuoteExecution(makeQuote({ quoteExpiry: null }), ctx(), POLICY),
    ).toThrowError(/MISSING_EXPIRY/);
    expect(() =>
      validateQuoteExecution(makeQuote({ quoteExpiry: 1_899_999_999 }), ctx(), POLICY),
    ).toThrowError(/EXPIRED_QUOTE/);
    // replay = revalidation at a later now: the same quote fails once now >= expiry
    const q = makeQuote({ quoteExpiry: 1_900_000_100 });
    expect(validateQuoteExecution(q, ctx({ nowSec: 1_900_000_050 }), POLICY).selector).toBe(
      "0xaabbccdd",
    );
    expect(() => validateQuoteExecution(q, ctx({ nowSec: 1_900_000_100 }), POLICY)).toThrowError(
      /EXPIRED_QUOTE/,
    );
  });

  it("quote bound to another chain/router context cannot pass by substitution", () => {
    // wrong-chain quote: modeled as a context for another chain (client already rejects body chain)
    expect(() => validateQuoteExecution(makeQuote(), ctx({ chainId: 1 }), POLICY)).toThrowError(
      /WRONG_CHAIN/,
    );
    // quote for another router: target fixed to old router while registry resolved a new one
    expect(() =>
      validateQuoteExecution(
        makeQuote(),
        ctx({ resolvedRouter: "0x00000000000000000000000000000000000000f2" }),
        POLICY,
      ),
    ).toThrowError(/ROUTER_MISMATCH/);
  });
});
