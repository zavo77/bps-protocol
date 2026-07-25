// TASK 10H-1 — policy-neutral, fail-closed structural validation of a Rialto quote EXECUTION shape.
//
// Second stage after fetchRialtoAllowanceQuote: binds the sanitized quote to the CURRENTLY RESOLVED
// registry router and an EXPLICITLY APPROVED selector schema. Ships with NO approved selectors and
// NO default policy: until the real venue selector semantics are pinned from an authorized quote and
// recorded as an approved policy, every validation fails closed (SELECTOR_POLICY_MISSING). This is
// enforcement machinery only — it invents no selector, no lifetime, no limit, no authority.

import { decodeAbiParameters, encodeAbiParameters, type AbiParameter } from "viem";
import type { RialtoQuoteResult } from "./quote-client.js";

export class QuoteExecutionError extends Error {
  constructor(
    readonly code: QuoteExecutionErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "QuoteExecutionError";
  }
}

export type QuoteExecutionErrorCode =
  | "SELECTOR_POLICY_MISSING"
  | "ROUTER_UNRESOLVED"
  | "ROUTER_MISMATCH"
  | "WRONG_CHAIN"
  | "EMPTY_CALLDATA"
  | "SHORT_CALLDATA"
  | "UNKNOWN_SELECTOR"
  | "MULTICALL_FORBIDDEN"
  | "DECODE_FAILED"
  | "TRAILING_CALLDATA"
  | "ARG_TOKEN_MISMATCH"
  | "ARG_AMOUNT_MISMATCH"
  | "ARG_RECIPIENT_MISMATCH"
  | "EXPIRED_QUOTE"
  | "MISSING_EXPIRY"
  | "NONZERO_VALUE";

/**
 * An explicitly approved selector schema. `params` is the exact ABI of the selector's arguments;
 * role indices declare which argument must equal the bound token/amount/recipient (null = the
 * selector has no such argument and the binding is enforced elsewhere on-chain).
 */
export interface ApprovedSelector {
  readonly selector: string; // 0x + 8 hex chars
  readonly signature: string; // human-readable, for evidence
  readonly params: readonly AbiParameter[];
  readonly tokenArgIndex: number | null;
  readonly amountArgIndex: number | null;
  readonly recipientArgIndex: number | null;
}

export interface QuoteExecutionPolicy {
  /** EMPTY by default — fail closed until the real venue selector is pinned and approved. */
  readonly approvedSelectors: readonly ApprovedSelector[];
  /** Selectors that are NEVER approvable at top level (opaque batching defeats per-call review). */
  readonly forbiddenSelectors?: readonly string[];
}

/** Known opaque-batching selectors rejected outright unless each inner call can be constrained. */
export const DEFAULT_FORBIDDEN_SELECTORS: readonly string[] = [
  "0xac9650d8", // multicall(bytes[])
  "0x5ae401dc", // multicall(uint256,bytes[])
  "0x1f0464d1", // multicall(bytes32,bytes[])
];

export interface QuoteExecutionContext {
  readonly chainId: number; // must be 4663
  readonly resolvedRouter: string | null; // from live registry ownerOf(feature) at validation time
  readonly expectedBuyToken: string;
  readonly expectedSellAmountRaw: bigint;
  readonly expectedRecipient: string; // adapter (allowance-settlement taker)
  readonly nowSec: number;
}

export interface QuoteExecutionValidation {
  readonly selector: string;
  readonly signature: string;
  readonly decodedArgs: readonly unknown[];
  readonly boundToken: string | null;
  readonly boundAmount: string | null;
  readonly boundRecipient: string | null;
}

const lower = (s: string): string => s.toLowerCase();

/**
 * Fail-closed structural validation of the quote's execution payload against the approved selector
 * policy and the live-resolved router. Throws QuoteExecutionError on ANY deviation.
 */
export function validateQuoteExecution(
  quote: RialtoQuoteResult,
  ctx: QuoteExecutionContext,
  policy: QuoteExecutionPolicy,
): QuoteExecutionValidation {
  if (ctx.chainId !== 4663) {
    throw new QuoteExecutionError("WRONG_CHAIN", `context chain ${ctx.chainId} != 4663`);
  }
  if (ctx.resolvedRouter === null || ctx.resolvedRouter === "") {
    throw new QuoteExecutionError("ROUTER_UNRESOLVED", "live registry router not resolved");
  }
  if (lower(quote.target) !== lower(ctx.resolvedRouter)) {
    throw new QuoteExecutionError(
      "ROUTER_MISMATCH",
      "tx.to does not equal the currently resolved feature router",
    );
  }
  const data = quote.callData;
  if (data === "0x" || data.length === 0) {
    throw new QuoteExecutionError("EMPTY_CALLDATA", "calldata is empty");
  }
  if (data.length < 10) {
    throw new QuoteExecutionError("SHORT_CALLDATA", "calldata shorter than a 4-byte selector");
  }
  const selector = lower(data.slice(0, 10));
  const forbidden = (policy.forbiddenSelectors ?? DEFAULT_FORBIDDEN_SELECTORS).map(lower);
  if (forbidden.includes(selector)) {
    throw new QuoteExecutionError(
      "MULTICALL_FORBIDDEN",
      "opaque batching selector cannot be approved at top level",
    );
  }
  if (policy.approvedSelectors.length === 0) {
    throw new QuoteExecutionError(
      "SELECTOR_POLICY_MISSING",
      "no approved selector policy is configured — the venue selector is not yet pinned (fail closed)",
    );
  }
  const approved = policy.approvedSelectors.find((a) => lower(a.selector) === selector);
  if (approved === undefined) {
    throw new QuoteExecutionError("UNKNOWN_SELECTOR", `selector ${selector} is not approved`);
  }

  let decoded: readonly unknown[];
  try {
    decoded = decodeAbiParameters(approved.params, `0x${data.slice(10)}` as `0x${string}`);
  } catch {
    throw new QuoteExecutionError("DECODE_FAILED", "calldata does not decode as the approved ABI");
  }
  // Exact round-trip: re-encode and require byte equality — rejects trailing/ambiguous data.
  const reencoded = encodeAbiParameters(approved.params, decoded as never);
  if (lower(`0x${data.slice(10)}`) !== lower(reencoded)) {
    throw new QuoteExecutionError(
      "TRAILING_CALLDATA",
      "calldata is not the exact canonical encoding of its decoded arguments",
    );
  }

  const argAt = (i: number | null): unknown => (i === null ? null : decoded[i]);
  const boundToken = argAt(approved.tokenArgIndex);
  if (
    approved.tokenArgIndex !== null &&
    (typeof boundToken !== "string" || lower(boundToken) !== lower(ctx.expectedBuyToken))
  ) {
    throw new QuoteExecutionError("ARG_TOKEN_MISMATCH", "decoded token != canonical stock token");
  }
  const boundAmount = argAt(approved.amountArgIndex);
  if (approved.amountArgIndex !== null && boundAmount !== ctx.expectedSellAmountRaw) {
    throw new QuoteExecutionError("ARG_AMOUNT_MISMATCH", "decoded amount != authorized input");
  }
  const boundRecipient = argAt(approved.recipientArgIndex);
  if (
    approved.recipientArgIndex !== null &&
    (typeof boundRecipient !== "string" || lower(boundRecipient) !== lower(ctx.expectedRecipient))
  ) {
    throw new QuoteExecutionError("ARG_RECIPIENT_MISMATCH", "decoded recipient != adapter");
  }

  if (quote.quoteExpiry === null) {
    throw new QuoteExecutionError("MISSING_EXPIRY", "quote carries no expiry/deadline");
  }
  if (quote.quoteExpiry <= ctx.nowSec) {
    throw new QuoteExecutionError("EXPIRED_QUOTE", "quote expiry is in the past");
  }

  return {
    selector,
    signature: approved.signature,
    decodedArgs: decoded,
    boundToken: approved.tokenArgIndex === null ? null : String(boundToken),
    boundAmount: approved.amountArgIndex === null ? null : String(boundAmount),
    boundRecipient: approved.recipientArgIndex === null ? null : String(boundRecipient),
  };
}
