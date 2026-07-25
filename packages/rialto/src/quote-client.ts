// Server-only Rialto quote boundary for the BPS stock-acquisition adapter.
//
// SECURITY / SCOPE:
// - This module is SERVER-ONLY. It reads the API key from a server-side environment variable
//   (RIALTO_API_KEY) and MUST NEVER be imported into browser/client code. It uses no NEXT_PUBLIC_*
//   variable, never returns the key, and never logs request headers or environment values.
// - It talks ONLY to the official Rialto API origin over HTTPS (see OFFICIAL_RIALTO_ORIGIN); any other
//   protocol/host/credentials/port/path/fragment fails closed (BAD_ORIGIN).
// - It issues a single HTTP GET to `/quote`. There is NO POST path, NO `/gasless/submit`, NO signer,
//   wallet, private key, approval, Permit2 signature, simulation, or broadcast anywhere in this module.
// - `GET /quote` expects `sell_amount` as a HUMAN-DECIMAL token amount (e.g. "0.01"), NOT raw base
//   units. The response amounts are RAW base units; the returned raw sell amount is validated against the
//   requested decimal converted at the sell token's 18 decimals (WETH).
// - It forces chain_id=4663, settlement=allowance, sell_token=WETH, taker=the adapter, and requests NO
//   integrator fee (no swap_fee_bps), NO Permit2, and NO gasless mode. It validates the full response and
//   fails closed on any mismatch, returning sanitized execution fields + sanitized report metadata.
// - The returned quote is NOT trusted authority: the RialtoStockAcquisitionAdapter independently enforces
//   the real state transition on-chain (registry-locked target, exact input, minimum, residuals).

import { createHash } from "node:crypto";

/** Official Rialto trade API origin. The client refuses to talk to any other origin. */
export const OFFICIAL_RIALTO_ORIGIN = "https://rialto-trade-api.rialto.xyz";
const OFFICIAL_RIALTO_HOST = "rialto-trade-api.rialto.xyz";

/** WETH (the only sell token here) has 18 decimals. */
const SELL_TOKEN_DECIMALS = 18;

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
  | "BAD_ORIGIN"
  | "BAD_SELL_AMOUNT"
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
  readonly apiBaseUrl: string; // MUST be the official Rialto origin (validated)
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
  readonly sellAmountDecimal: string; // HUMAN-DECIMAL WETH amount (e.g. "0.01"); NOT raw base units
}

/** One route leg / pool hop, sanitized for reporting. */
export interface RialtoRouteLeg {
  readonly pool: string | null;
  readonly feeTier: number | null;
  readonly tokenIn: string | null;
  readonly tokenOut: string | null;
}

/** Sanitized report metadata — contains NO API key and NO raw quote_id (only a SHA-256 digest). */
export interface RialtoQuoteMeta {
  readonly chainId: number;
  readonly sellToken: string;
  readonly buyToken: string;
  readonly requestedSellAmountDecimal: string;
  readonly returnedSellAmountRaw: string;
  readonly buyAmountRaw: string | null;
  readonly minBuyAmountRaw: string;
  readonly settlementMode: string;
  readonly integratorFeeRequested: false;
  readonly platformFee: Record<string, string | number | boolean> | null;
  readonly networkFeeEstimate: string | null;
  readonly issues: {
    readonly balance: "none" | "present";
    readonly simulationIncomplete: boolean;
    readonly allowanceSpender: string | null;
  };
  readonly routeLegs: readonly RialtoRouteLeg[] | null;
  readonly txTarget: string;
  readonly selector: string;
  readonly callDataBytes: number;
  readonly txValue: string;
  readonly quoteCreatedAtSec: number | null;
  readonly quoteExpirySec: number | null;
  readonly quoteIdSha256: string | null;
}

/** Sanitized result — execution fields BPS needs, plus report metadata. Never contains the API key. */
export interface RialtoQuoteResult {
  readonly target: string; // tx.to (registry-verified on-chain by the adapter)
  readonly callData: string; // unmodified tx.data
  readonly sellAmountRaw: bigint; // returned raw input (validated == requested decimal * 10^18)
  readonly sellAmountDecimal: string; // the requested human-decimal amount
  readonly minBuyAmountRaw: bigint; // min_buy_amount
  readonly buyToken: string;
  readonly quoteExpiry: number | null; // seconds; BPS enforces the on-chain deadline
  readonly meta: RialtoQuoteMeta;
}

/** Injected dependencies so tests never touch the network or real environment. */
export interface RialtoQuoteDeps {
  readonly fetchImpl?: typeof fetch;
  readonly env?: Record<string, string | undefined>;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_RE = /^0x[0-9a-fA-F]*$/;
const DECIMAL_RE = /^[0-9]+(\.[0-9]+)?$/;

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

/** Convert a positive human-decimal string to base units at `decimals`, or null if invalid/non-positive. */
export function decimalToBaseUnits(decimal: string, decimals: number): bigint | null {
  if (typeof decimal !== "string" || !DECIMAL_RE.test(decimal)) return null;
  const [intPart, fracPart = ""] = decimal.split(".");
  if (fracPart.length > decimals) return null; // more precision than the token supports
  const combined = `${intPart}${fracPart.padEnd(decimals, "0")}`;
  const value = BigInt(combined);
  return value > 0n ? value : null;
}

/** Fail closed unless `base` is exactly the official Rialto HTTPS origin (no creds/port/path/fragment). */
export function assertOfficialRialtoOrigin(base: string): void {
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new RialtoQuoteError("BAD_ORIGIN", "apiBaseUrl is not a valid URL");
  }
  if (u.protocol !== "https:") {
    throw new RialtoQuoteError("BAD_ORIGIN", "origin must use https");
  }
  if (u.hostname !== OFFICIAL_RIALTO_HOST) {
    throw new RialtoQuoteError("BAD_ORIGIN", "origin host is not the official Rialto API host");
  }
  if (u.username !== "" || u.password !== "") {
    throw new RialtoQuoteError("BAD_ORIGIN", "origin must not contain credentials");
  }
  if (u.port !== "") {
    throw new RialtoQuoteError("BAD_ORIGIN", "origin must not specify a port");
  }
  if (u.pathname !== "" && u.pathname !== "/") {
    throw new RialtoQuoteError("BAD_ORIGIN", "origin must not contain a path");
  }
  if (u.search !== "" || u.hash !== "") {
    throw new RialtoQuoteError("BAD_ORIGIN", "origin must not contain a query string or fragment");
  }
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function intLikeToString(v: unknown): string | null {
  if (typeof v === "string" && /^[0-9]+$/.test(v)) return v;
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return String(v);
  return null;
}

function intLikeToPositiveNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  if (typeof v === "string" && /^[0-9]+$/.test(v)) {
    const n = Number(v);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  return null;
}

/** Keep only primitive (string/number/boolean) fields — never nested objects, arrays, or unknowns. */
function sanitizePrimitiveMap(v: unknown): Record<string, string | number | boolean> | null {
  if (!isObject(v)) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean")
      out[k] = val;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function firstDefined(...vals: unknown[]): unknown {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return undefined;
}

function extractRouteLegs(body: Record<string, unknown>): RialtoRouteLeg[] | null {
  const route = body.route;
  const candidate = Array.isArray(route)
    ? route
    : isObject(route) && Array.isArray(route.legs)
      ? route.legs
      : Array.isArray(body.legs)
        ? body.legs
        : null;
  if (candidate === null) return null;
  const legs: RialtoRouteLeg[] = [];
  for (const raw of candidate) {
    if (!isObject(raw)) continue;
    legs.push({
      pool: normAddress(firstDefined(raw.pool, raw.pool_address, raw.address)),
      feeTier: intLikeToPositiveNumber(firstDefined(raw.fee, raw.fee_tier, raw.feeTier)),
      tokenIn: normAddress(firstDefined(raw.token_in, raw.tokenIn, raw.from)),
      tokenOut: normAddress(firstDefined(raw.token_out, raw.tokenOut, raw.to)),
    });
  }
  return legs.length > 0 ? legs : null;
}

/**
 * Fetch and fully validate a Rialto allowance-settlement quote: sell `request.sellAmountDecimal` WETH
 * (human-decimal) into `request.buyToken`, taken by the adapter. Returns sanitized execution fields +
 * report metadata, or throws a typed error. Never logs headers/env and never includes the API key.
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

  // Fail closed on any non-official origin BEFORE any network activity.
  assertOfficialRialtoOrigin(config.apiBaseUrl);

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
  // Human-decimal sell amount → validated; the RAW equivalent (18 decimals) is used only for response
  // consistency checks. The REQUEST transmits the decimal string, not raw base units.
  const expectedSellRaw = decimalToBaseUnits(request.sellAmountDecimal, SELL_TOKEN_DECIMALS);
  if (expectedSellRaw === null) {
    throw new RialtoQuoteError(
      "BAD_SELL_AMOUNT",
      "sellAmountDecimal must be a positive decimal with <= 18 fractional digits",
    );
  }

  const url = new URL("/quote", config.apiBaseUrl);
  url.searchParams.set("chain_id", "4663");
  url.searchParams.set("settlement", "allowance");
  url.searchParams.set("sell_token", weth);
  url.searchParams.set("buy_token", buyToken);
  url.searchParams.set("sell_amount", request.sellAmountDecimal); // HUMAN-DECIMAL, not raw
  url.searchParams.set("taker", taker);
  url.searchParams.set("slippage_bps", String(config.slippageBps));
  // Deliberately absent: swap_fee_bps (no integrator fee), permit2 owner, gasless mode.

  const timeoutMs = config.timeoutMs ?? 5000;
  const maxBytes = config.maxResponseBytes ?? 65536;

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), {
      method: "GET", // hard-coded; there is no POST/submit path in this module
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
      // TASK 10H-1 hardening: never follow a redirect — a quote endpoint that redirects is treated
      // as a hard failure (prevents silent hand-off to an unapproved host).
      redirect: "error",
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

  return validateQuote(config, request, weth, taker, buyToken, expectedSellRaw, body);
}

function validateQuote(
  config: RialtoQuoteConfig,
  request: RialtoQuoteRequest,
  weth: string,
  taker: string,
  buyToken: string,
  expectedSellRaw: bigint,
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
  // The response reports RAW base units; it must equal the requested decimal converted at 18 decimals.
  if (!rawEquals(body.sell_amount, expectedSellRaw)) {
    throw new RialtoQuoteError(
      "WRONG_SELL_AMOUNT",
      "returned raw sell_amount does not match the requested decimal amount",
    );
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
  if (minBuy > expectedSellRaw * BigInt(1_000_000)) {
    throw new RialtoQuoteError("INCONSISTENT_MIN_BUY", "min_buy_amount is implausibly large");
  }

  // issues: balance must be null, simulation must be complete, allowance must target tx.to only.
  let allowanceSpender: string | null = null;
  let balancePresent = false;
  let simulationIncomplete = false;
  const issues = body.issues;
  if (isObject(issues)) {
    balancePresent = issues.balance !== null && issues.balance !== undefined;
    if (balancePresent) {
      throw new RialtoQuoteError("BALANCE_ISSUE", "issues.balance must be null");
    }
    if (issues.simulationIncomplete === true) {
      throw new RialtoQuoteError("SIMULATION_INCOMPLETE", "simulation is incomplete");
    }
    simulationIncomplete = issues.simulationIncomplete === true;
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
      allowanceSpender = spender;
    }
  }

  const expiryRaw = body.expiry;
  const quoteExpiry =
    typeof expiryRaw === "number" && Number.isInteger(expiryRaw) && expiryRaw > 0
      ? expiryRaw
      : null;

  const rawQuoteId = firstDefined(body.quote_id, body.quoteId, body.id);
  const meta: RialtoQuoteMeta = {
    chainId: 4663,
    sellToken: weth,
    buyToken,
    requestedSellAmountDecimal: request.sellAmountDecimal,
    returnedSellAmountRaw: expectedSellRaw.toString(),
    buyAmountRaw: intLikeToString(firstDefined(body.buy_amount, body.buyAmount)),
    minBuyAmountRaw: minBuy.toString(),
    settlementMode: "allowance",
    integratorFeeRequested: false,
    platformFee: sanitizePrimitiveMap(firstDefined(body.fees, body.platform_fee, body.fee)),
    networkFeeEstimate: intLikeToString(
      firstDefined(body.network_fee, body.gas_estimate, body.estimated_gas, body.gas),
    ),
    issues: {
      balance: balancePresent ? "present" : "none",
      simulationIncomplete,
      allowanceSpender,
    },
    routeLegs: extractRouteLegs(body),
    txTarget: target,
    selector: callData.slice(0, 10),
    callDataBytes: (callData.length - 2) / 2,
    txValue: "0",
    quoteCreatedAtSec: intLikeToPositiveNumber(
      firstDefined(body.created_at, body.createdAt, body.timestamp, body.created),
    ),
    quoteExpirySec: quoteExpiry,
    quoteIdSha256: rawQuoteId === undefined ? null : sha256Hex(String(rawQuoteId)),
  };

  return {
    target,
    callData,
    sellAmountRaw: expectedSellRaw,
    sellAmountDecimal: request.sellAmountDecimal,
    minBuyAmountRaw: minBuy,
    buyToken,
    quoteExpiry,
    meta,
  };
}
