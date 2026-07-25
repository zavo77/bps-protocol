// TASK 10K-1 — isolated, NON-EXECUTING Rialto GET /quote evaluation harness.
//
// AUTHORIZATION (founder Quote-Evaluation Exception, 2026-07-25):
//   "D-2 is superseded by the confirmed venue constraint. A mandatory bundled Rialto key may be used
//    solely in an isolated, non-executing quote-evaluation environment with no signing key, funded
//    wallet, allowance, Permit2 signature or swap-submission route. This exception authorizes
//    GET /quote testing only. It does not authorize acquisition or execution under D-24."
//
// SCOPE / SAFETY:
// - This harness issues ONLY GET /quote (via fetchRialtoAllowanceQuote) and then runs pure, in-memory
//   validation (validateQuoteExecution, classifyBoundary). It holds NO private key, creates NO wallet,
//   grants NO on-chain allowance, produces NO Permit2 signature, and has NO transaction-submission
//   path. It CANNOT execute, fund, approve, sign, or broadcast anything.
// - `settlement=allowance` is a QUOTE PRICING MODE requested from the venue (matches the frozen
//   adapter / decision D-5). It does NOT create any on-chain allowance and requires no signature.
// - The API key is read from RIALTO_API_KEY server-side. It is NEVER printed, logged, returned, or
//   included in the report. Addresses and amounts below are CANDIDATE / test inputs — NOT APPROVED
//   and NOT CONFIGURED for production. This harness authorizes no acquisition (D-24 stands).

import { pathToFileURL } from "node:url";
import {
  fetchRialtoAllowanceQuote,
  RialtoQuoteError,
  type RialtoQuoteConfig,
  type RialtoQuoteRequest,
  type RialtoQuoteDeps,
} from "./quote-client.js";
import {
  validateQuoteExecution,
  QuoteExecutionError,
  type QuoteExecutionPolicy,
} from "./quote-structural.js";
import { classifyBoundary } from "./boundary-status.js";

/** Sanitized, secret-free evaluation report. Contains NO API key and NO Authorization header. */
export interface QuoteEvalReport {
  readonly ok: boolean;
  readonly stage: "fetch" | "structural" | "done";
  /** Sanitized quote fields (not secret). `selector` is calldata[0:10] for later venue pinning. */
  readonly quote: {
    readonly target: string;
    readonly selector: string;
    readonly callDataBytes: number;
    readonly sellAmountRaw: string;
    readonly minBuyAmountRaw: string;
    readonly buyToken: string;
    readonly quoteExpiry: number | null;
  } | null;
  /** Structural validator outcome. Expected to fail closed (e.g. SELECTOR_POLICY_MISSING) until the
   *  real venue selector is pinned and approved; a non-null code is NOT an error of this harness. */
  readonly structuralErrorCode: string | null;
  readonly structuralPassed: boolean;
  /** RialtoQuoteError.code if the GET /quote fetch/validation failed; otherwise null. */
  readonly fetchErrorCode: string | null;
  readonly boundaryStatus: string;
  readonly note: string;
}

const NON_EXECUTING_NOTE =
  "GET /quote evaluation only — no signing, funding, allowance, Permit2 signature, or submission performed";

/**
 * Run one isolated GET /quote evaluation: fetch + validate + classify. Never throws for a venue-side
 * or fail-closed condition; those are reported as codes. `deps` lets tests inject fetch/env so no
 * network or real environment is touched.
 */
export async function runQuoteEval(
  config: RialtoQuoteConfig,
  request: RialtoQuoteRequest,
  deps: RialtoQuoteDeps = {},
  opts: { readonly resolvedRouter?: string | null; readonly nowSec?: number } = {},
): Promise<QuoteEvalReport> {
  let quote;
  try {
    quote = await fetchRialtoAllowanceQuote(config, request, deps);
  } catch (err) {
    const fetchErrorCode = err instanceof RialtoQuoteError ? err.code : "UNKNOWN_ERROR";
    return {
      ok: false,
      stage: "fetch",
      quote: null,
      structuralErrorCode: null,
      structuralPassed: false,
      fetchErrorCode,
      boundaryStatus: classifyBoundary({
        quoteObserved: false,
        structuralValidationPassed: false,
        priceGuardPassed: false,
        localForkSettlementPassed: false,
        mainnetReceipt: null,
      }).status,
      note: NON_EXECUTING_NOTE,
    };
  }

  const sanitized = {
    target: quote.target,
    selector: quote.callData.slice(0, 10),
    callDataBytes: (quote.callData.length - 2) / 2,
    sellAmountRaw: quote.sellAmountRaw.toString(),
    minBuyAmountRaw: quote.minBuyAmountRaw.toString(),
    buyToken: quote.buyToken,
    quoteExpiry: quote.quoteExpiry,
  };

  // Structural validation ships with NO approved selectors and fails closed until the venue selector
  // is pinned. Capture the code for evidence rather than throwing.
  const emptyPolicy: QuoteExecutionPolicy = { approvedSelectors: [] };
  let structuralErrorCode: string | null = null;
  let structuralPassed = false;
  try {
    validateQuoteExecution(
      quote,
      {
        chainId: config.chainId,
        resolvedRouter: opts.resolvedRouter ?? null,
        expectedBuyToken: request.buyToken,
        expectedSellAmountRaw: request.sellAmountRaw,
        expectedRecipient: config.adapterAddress,
        nowSec: opts.nowSec ?? Math.floor(Date.now() / 1000),
      },
      emptyPolicy,
    );
    structuralPassed = true;
  } catch (err) {
    structuralErrorCode = err instanceof QuoteExecutionError ? err.code : "UNKNOWN_ERROR";
  }

  const boundaryStatus = classifyBoundary({
    quoteObserved: true,
    structuralValidationPassed: structuralPassed,
    priceGuardPassed: false,
    localForkSettlementPassed: false,
    mainnetReceipt: null,
  }).status;

  return {
    ok: true,
    stage: structuralPassed ? "done" : "structural",
    quote: sanitized,
    structuralErrorCode,
    structuralPassed,
    fetchErrorCode: null,
    boundaryStatus,
    note: NON_EXECUTING_NOTE,
  };
}

class UsageError extends Error {}

function requireEnv(env: Record<string, string | undefined>, name: string): string {
  const v = env[name];
  if (typeof v !== "string" || v.length === 0) {
    throw new UsageError(`missing required environment variable: ${name}`);
  }
  return v;
}

/**
 * Build config/request from environment variables. Reads only variable NAMES here; the API key itself
 * is consumed inside the client and is never handled or echoed by this function.
 */
export function configFromEnv(env: Record<string, string | undefined>): {
  config: RialtoQuoteConfig;
  request: RialtoQuoteRequest;
  resolvedRouter: string | null;
} {
  // Presence-check the key without capturing its value (the client reads it from env directly).
  if (typeof env.RIALTO_API_KEY !== "string" || env.RIALTO_API_KEY.length === 0) {
    throw new UsageError("missing required environment variable: RIALTO_API_KEY");
  }
  const sellAmountStr = requireEnv(env, "RIALTO_SELL_AMOUNT");
  if (!/^[0-9]+$/.test(sellAmountStr)) {
    throw new UsageError("RIALTO_SELL_AMOUNT must be a positive base-unit integer (no decimals)");
  }
  const slippageStr = requireEnv(env, "RIALTO_SLIPPAGE_BPS");
  if (!/^[0-9]+$/.test(slippageStr)) {
    throw new UsageError("RIALTO_SLIPPAGE_BPS must be a non-negative integer");
  }
  const config: RialtoQuoteConfig = {
    apiBaseUrl: requireEnv(env, "RIALTO_API_BASE_URL"),
    chainId: 4663,
    wethAddress: requireEnv(env, "RIALTO_SELL_TOKEN"),
    adapterAddress: requireEnv(env, "RIALTO_TAKER"),
    slippageBps: Number(slippageStr),
  };
  const request: RialtoQuoteRequest = {
    buyToken: requireEnv(env, "RIALTO_BUY_TOKEN"),
    sellAmountRaw: BigInt(sellAmountStr),
  };
  const rr = env.RIALTO_RESOLVED_ROUTER;
  return { config, request, resolvedRouter: typeof rr === "string" && rr.length > 0 ? rr : null };
}

const USAGE = [
  "Rialto GET /quote evaluation harness (isolated, non-executing).",
  "Required environment variables:",
  "  RIALTO_API_BASE_URL   Rialto REST API origin (e.g. https://api.<venue-host>)",
  "  RIALTO_API_KEY        API key (read server-side; never printed)",
  "  RIALTO_SELL_TOKEN     WETH address (sell token)",
  "  RIALTO_BUY_TOKEN      stock token address (buy token)",
  "  RIALTO_TAKER          taker/recipient address (unfunded validation/canary adapter)",
  "  RIALTO_SELL_AMOUNT    exact WETH input in base units (integer, no decimals)",
  "  RIALTO_SLIPPAGE_BPS   integrator slippage in bps (integer)",
  "Optional:",
  "  RIALTO_RESOLVED_ROUTER  live registry-resolved feature router for the structural router check",
  "This harness performs GET /quote ONLY. It never signs, funds, approves, or broadcasts.",
].join("\n");

async function main(): Promise<void> {
  let built;
  try {
    built = configFromEnv(process.env);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : "invalid configuration"}\n\n`);
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 2;
    return;
  }
  const report = await runQuoteEval(
    built.config,
    built.request,
    {},
    {
      resolvedRouter: built.resolvedRouter,
    },
  );
  // Emit ONLY the sanitized report. No key, no headers, no environment values are ever written.
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

// Direct-run guard: main() executes only when this file is run as a script, never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
