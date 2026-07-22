// Server-only Rialto quote boundary for the BPS stock-acquisition adapter.
//
// SECURITY / SCOPE:
// - This module is SERVER-ONLY. It reads the API key from a server-side environment variable
//   (RIALTO_API_KEY) and MUST NEVER be imported into browser/client code. It uses no NEXT_PUBLIC_*
//   variable, never returns the key, and never logs request headers or environment values.
// - It forces chain_id=4663, settlement=allowance, sell_token=WETH, taker=the adapter, and requests
//   NO integrator fee, NO Permit2, and NO gasless mode. It validates the full response and fails
//   closed on any mismatch, returning only the sanitized fields BPS needs to build the on-chain call.
// - It performs NO live request in this task, NO transaction signing, and NO RPC broadcast. The
//   returned quote is NOT trusted authority: the RialtoStockAcquisitionAdapter independently enforces
//   the real state transition on-chain (registry-locked target, exact input, minimum, residuals).

/** Deterministic typed error. `code` is safe to log; `message` never contains secrets or headers. */
export class RialtoQuoteError extends Error {
  constructor(
    readonly code: RialtoQuoteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RialtoQuoteError";
  }
}

export type RialtoQuoteErrorCode =
  | "MISSING_API_KEY"
  | "BAD_CONFIG"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "OVERSIZE_RESPONSE"
  | "INVALID_JSON"
  | "WRONG_CHAIN"
  | "WRONG_SETTLEMENT"
  | "PERMIT2_PRESENT"
  | "GASLESS_PRESENT"
  | "WRONG_SELL_TOKEN"
  | "WRONG_BUY_TOKEN"
  | "WRONG_SELL_AMOUNT"
  | "WRONG_TAKER"
  | "MISSING_TX_TO"
  | "MALFORMED_CALLDATA"
  | "NONZERO_VALUE"
  | "ZERO_MIN_BUY"
  | "INCONSISTENT_MIN_BUY"
  | "BALANCE_ISSUE"
  | "SIMULATION_INCOMPLETE"
  | "INVALID_ALLOWANCE"
  | "WRONG_ALLOWANCE_SPENDER";

/** Static configuration. Addresses are configured (verified) values — unresolved for deployment. */
export interface RialtoQuoteConfig {
  readonly apiBaseUrl: string;
  readonly chainId: number; // must be 4663
  readonly wethAddress: string; // configured verified WETH (sell token)
  readonly adapterAddress: string; // the RialtoStockAcquisitionAdapter (taker + settlement spender)
  readonly slippageBps: number; // bounded integrator slippage
  readonly timeoutMs?: number; // default 5000
  readonly maxResponseBytes?: number; // default 65536
  readonly maxCallDataBytes?: number; // default 8192 (16384 hex chars)
}

export interface RialtoQuoteRequest {
  readonly buyToken: string; // selected frozen-basket stock token
  readonly sellAmountRaw: bigint; // exact WETH input, no float
}

/** Sanitized result — only what BPS needs to construct the coordinator/vault transaction. */
export interface RialtoQuoteResult {
  readonly target: string; // tx.to (registry-verified on-chain by the adapter)
  readonly callData: string; // unmodified tx.data
  readonly sellAmountRaw: bigint; // exact input
  readonly minBuyAmountRaw: bigint; // min_buy_amount
  readonly buyToken: string;
  readonly quoteExpiry: number | null; // seconds; BPS enforces the on-chain deadline
}

/** Injected dependencies so tests never touch the network or real environment. */
export interface RialtoQuoteDeps {
  readonly fetchImpl?: typeof fetch;
  readonly env?: Record<string, string | undefined>;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_RE = /^0x[0-9a-fA-F]*$/;

function normAddress(value: unknown): string | null {
  return typeof value === "string" && ADDRESS_RE.test(value) ? value.toLowerCase() : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rawEquals(value: unknown, expected: bigint): boolean {
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return BigInt(value) === expected;
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value) === expected;
  return false;
}

function parsePositiveBigInt(value: unknown): bigint | null {
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const n = BigInt(value);
    return n > 0n ? n : null;
  }
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return BigInt(value);
  return null;
}

/**
 * Fetch and fully validate a Rialto allowance-settlement quote for `request.sellAmountRaw` WETH into
 * `request.buyToken`, taken by the adapter. Returns only sanitized execution fields, or throws a typed
 * error. Never logs headers/env and never includes the API key in any output.
 */
export async function fetchRialtoAllowanceQuote(
  config: RialtoQuoteConfig,
  request: RialtoQuoteRequest,
  deps: RialtoQuoteDeps = {},
): Promise<RialtoQuoteResult> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = env.RIALTO_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    throw new RialtoQuoteError("MISSING_API_KEY", "RIALTO_API_KEY is not configured");
  }

  const weth = normAddress(config.wethAddress);
  const taker = normAddress(config.adapterAddress);
  const buyToken = normAddress(request.buyToken);
  if (config.chainId !== 4663 || weth === null || taker === null || buyToken === null) {
    throw new RialtoQuoteError("BAD_CONFIG", "invalid chain id or address configuration");
  }
  if (
    !Number.isInteger(config.slippageBps) ||
    config.slippageBps < 0 ||
    config.slippageBps > 10_000
  ) {
    throw new RialtoQuoteError("BAD_CONFIG", "slippageBps out of range");
  }
  if (request.sellAmountRaw <= 0n) {
    throw new RialtoQuoteError("BAD_CONFIG", "sellAmountRaw must be positive");
  }

  const url = new URL("/quote", config.apiBaseUrl);
  url.searchParams.set("chain_id", "4663");
  url.searchParams.set("settlement", "allowance");
  url.searchParams.set("sell_token", weth);
  url.searchParams.set("buy_token", buyToken);
  url.searchParams.set("sell_amount", request.sellAmountRaw.toString()); // raw integer, no float
  url.searchParams.set("taker", taker);
  url.searchParams.set("slippage_bps", String(config.slippageBps));
  // Deliberately absent: swap_fee_bps (no integrator fee), permit2 owner, gasless mode.

  const timeoutMs = config.timeoutMs ?? 5000;
  const maxBytes = config.maxResponseBytes ?? 65536;

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    // Never surface the error body/headers (may echo the request). Timeout vs other = sanitized code.
    const aborted = isObject(err) && (err as { name?: string }).name === "TimeoutError";
    throw new RialtoQuoteError(aborted ? "TIMEOUT" : "HTTP_ERROR", "quote request failed");
  }

  if (!res.ok) {
    throw new RialtoQuoteError("HTTP_ERROR", `quote responded with status ${res.status}`);
  }

  const text = await res.text();
  if (text.length > maxBytes) {
    throw new RialtoQuoteError("OVERSIZE_RESPONSE", "quote response exceeded size bound");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new RialtoQuoteError("INVALID_JSON", "quote response was not valid JSON");
  }

  return validateQuote(config, request, weth, taker, buyToken, body);
}

function validateQuote(
  config: RialtoQuoteConfig,
  request: RialtoQuoteRequest,
  weth: string,
  taker: string,
  buyToken: string,
  body: unknown,
): RialtoQuoteResult {
  if (!isObject(body)) throw new RialtoQuoteError("INVALID_JSON", "quote body was not an object");

  if (body.chain_id !== 4663) throw new RialtoQuoteError("WRONG_CHAIN", "chain_id mismatch");
  if (body.settlement !== "allowance") {
    throw new RialtoQuoteError("WRONG_SETTLEMENT", "settlement is not allowance");
  }
  // Allowance settlement must NOT carry Permit2 or a gasless signature offset.
  if (body.permit2 !== undefined && body.permit2 !== null) {
    throw new RialtoQuoteError(
      "PERMIT2_PRESENT",
      "permit2 must be absent for allowance settlement",
    );
  }
  if (body.gasless === true || (isObject(body.gasless) && Object.keys(body.gasless).length > 0)) {
    throw new RialtoQuoteError("GASLESS_PRESENT", "gasless mode must be absent");
  }

  if (normAddress(body.sell_token) !== weth) {
    throw new RialtoQuoteError("WRONG_SELL_TOKEN", "sell_token is not the configured WETH");
  }
  if (normAddress(body.buy_token) !== buyToken) {
    throw new RialtoQuoteError("WRONG_BUY_TOKEN", "buy_token is not the requested stock");
  }
  if (!rawEquals(body.sell_amount, request.sellAmountRaw)) {
    throw new RialtoQuoteError("WRONG_SELL_AMOUNT", "sell_amount does not match the request");
  }
  if (normAddress(body.taker) !== taker) {
    throw new RialtoQuoteError("WRONG_TAKER", "taker is not the configured adapter");
  }

  const tx = body.tx;
  if (!isObject(tx)) throw new RialtoQuoteError("MISSING_TX_TO", "tx is missing");
  if (tx.signature_offset !== undefined && tx.signature_offset !== null) {
    throw new RialtoQuoteError("PERMIT2_PRESENT", "tx.signature_offset must be absent");
  }
  const target = normAddress(tx.to);
  if (target === null || target === "0x0000000000000000000000000000000000000000") {
    throw new RialtoQuoteError("MISSING_TX_TO", "tx.to is missing or zero");
  }
  const callData = tx.data;
  const maxCallDataBytes = config.maxCallDataBytes ?? 8192;
  if (
    typeof callData !== "string" ||
    !HEX_RE.test(callData) ||
    callData.length < 10 || // 0x + at least a 4-byte selector
    callData.length % 2 !== 0 ||
    (callData.length - 2) / 2 > maxCallDataBytes
  ) {
    throw new RialtoQuoteError("MALFORMED_CALLDATA", "tx.data is not valid bounded hex calldata");
  }
  // WETH acquisition: tx.value must be exactly zero.
  if (!rawEquals(tx.value, 0n)) {
    throw new RialtoQuoteError("NONZERO_VALUE", "tx.value must be exactly zero");
  }

  const minBuy = parsePositiveBigInt(body.min_buy_amount);
  if (minBuy === null) throw new RialtoQuoteError("ZERO_MIN_BUY", "min_buy_amount must be > 0");
  // Consistency with the requested policy: min_buy must not exceed the (impossible) 1:1 ceiling of the
  // input (a floor sanity bound without an oracle) — a real price/oracle bound is a deployment blocker.
  if (minBuy > request.sellAmountRaw * BigInt(1_000_000)) {
    throw new RialtoQuoteError("INCONSISTENT_MIN_BUY", "min_buy_amount is implausibly large");
  }

  // issues: balance must be null, simulation must be complete, allowance must target tx.to only.
  const issues = body.issues;
  if (isObject(issues)) {
    if (issues.balance !== null && issues.balance !== undefined) {
      throw new RialtoQuoteError("BALANCE_ISSUE", "issues.balance must be null");
    }
    if (issues.simulationIncomplete === true) {
      throw new RialtoQuoteError("SIMULATION_INCOMPLETE", "simulation is incomplete");
    }
    const allowance = issues.allowance;
    if (allowance !== null && allowance !== undefined) {
      if (!isObject(allowance)) {
        throw new RialtoQuoteError("INVALID_ALLOWANCE", "issues.allowance is malformed");
      }
      const spender = normAddress(allowance.spender);
      // The adapter approves exactly tx.to for exactly the input; reject rather than widen the surface.
      if (spender === null || spender !== target) {
        throw new RialtoQuoteError("WRONG_ALLOWANCE_SPENDER", "allowance spender must equal tx.to");
      }
    }
  }

  const expiryRaw = body.expiry;
  const quoteExpiry =
    typeof expiryRaw === "number" && Number.isInteger(expiryRaw) && expiryRaw > 0
      ? expiryRaw
      : null;

  return {
    target,
    callData,
    sellAmountRaw: request.sellAmountRaw,
    minBuyAmountRaw: minBuy,
    buyToken,
    quoteExpiry,
  };
}
