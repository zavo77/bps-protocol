// TASK 10K-1 / 10K-1A — isolated, NON-EXECUTING Rialto GET /quote evaluation harness.
//
// AUTHORIZATION (founder exception QEX-1 — Isolated Rialto Quote-Evaluation Exception, 2026-07-25):
//   "D-2 is superseded by the confirmed venue constraint. A mandatory bundled Rialto key may be used
//    solely in an isolated, non-executing quote-evaluation environment with no signing key, funded
//    wallet, allowance, Permit2 signature or swap-submission route. This exception authorizes
//    GET /quote testing only. It does not authorize acquisition or execution under D-24."
// D-2 (a `quote:read`-only key) remains the founder's preferred policy but is currently UNAVAILABLE via
// Rialto's dashboard (every key bundles quote:read + swap:create + swap:integrator). QEX-1 is a separate
// bounded exception, not an erasure of D-2. D-3 remains counsel-pending for production possession/use.
//
// SCOPE / SAFETY:
// - Issues ONLY GET /quote (via fetchRialtoAllowanceQuote, official origin enforced) and then runs pure,
//   in-memory validation. NO private key, wallet, on-chain allowance, Permit2 signature, or submission
//   path. It CANNOT execute, fund, approve, sign, or broadcast. There is no POST and no /gasless/submit.
// - `sell_amount` is transmitted as a HUMAN-DECIMAL amount (RIALTO_SELL_AMOUNT_DECIMAL), not raw units.
// - `settlement=allowance` is a quote-evaluation input only; it is NOT D-5 production approval and this
//   harness does NOT close D-5, D-6, or any other open decision.
// - The API key is read from RIALTO_API_KEY server-side and is NEVER printed, logged, returned, or
//   included in the report. The raw quote_id is never emitted (only a SHA-256 digest); full calldata is
//   never emitted (only the 4-byte selector and byte length). tx.to and the selector are CANDIDATES only.

import { pathToFileURL } from "node:url";
import {
  fetchRialtoAllowanceQuote,
  RialtoQuoteError,
  OFFICIAL_RIALTO_ORIGIN,
  decimalToBaseUnits,
  type RialtoQuoteConfig,
  type RialtoQuoteRequest,
  type RialtoQuoteDeps,
  type RialtoQuoteMeta,
} from "./quote-client.js";
import {
  validateQuoteExecution,
  QuoteExecutionError,
  type QuoteExecutionPolicy,
} from "./quote-structural.js";
import { classifyBoundary } from "./boundary-status.js";

/** Official Rialto Robinhood Chain Router Registry — the authority tx.to must later be reconciled to. */
export const OFFICIAL_RIALTO_ROUTER_REGISTRY = "0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E";

/** Governance snapshot printed with every report. This harness closes NOTHING. */
const GOVERNANCE = {
  qex1: "Isolated Rialto Quote-Evaluation Exception — GET /quote testing only; not acquisition/execution",
  d2: "Founder read-only-key preference PRESERVED; currently unavailable via Rialto dashboard (QEX-1 is a bounded exception, not an erasure)",
  d3: "COUNSEL-PENDING — production possession/use of the bundled (execution-capable) credential",
  d5: "OPEN — settlement mode is a quote-evaluation input only; NOT settled by this CLI",
  d6: "OPEN — quote taker and the observed router/selector are CANDIDATES only; NOT pinned",
  d8: "OPEN — slippage deferred (operator-supplied test value only)",
  d21: "OPEN — allowance-mode replay / obligation-on-retrieval unresolved",
  d22b: "OPEN — price-guard trust model / guarded executor not implemented",
  d23: "OPEN — legal eligibility counsel-pending",
  d24: "STANDS — no acquisition, funding, allowance, simulation, deployment, or execution authorized",
} as const;

/** Sanitized, secret-free evaluation report. Contains NO API key, NO raw quote_id, NO full calldata. */
export interface QuoteEvalReport {
  readonly ok: boolean;
  readonly stage: "fetch" | "structural" | "done";
  readonly request: {
    readonly chainId: 4663;
    readonly origin: string;
    readonly sellToken: string;
    readonly buyToken: string;
    readonly taker: string;
    readonly sellAmountDecimal: string;
    readonly slippageBps: number;
    readonly settlementModeRequested: "allowance";
    readonly integratorFeeRequested: false;
  };
  /** Full sanitized quote metadata (see RialtoQuoteMeta) — selector + byte length only, no full calldata. */
  readonly quote: RialtoQuoteMeta | null;
  readonly structural: {
    readonly passed: boolean;
    /** Expected to fail closed (e.g. SELECTOR_POLICY_MISSING / ROUTER_UNRESOLVED) — NOT a harness error. */
    readonly errorCode: string | null;
    readonly note: string;
  };
  readonly routerReconciliation: {
    readonly observedTarget: string;
    readonly operatorSuppliedRouter: string | null;
    readonly officialRegistry: string;
    readonly feature2: string;
    readonly feature3: string;
    readonly authoritative: false;
    readonly note: string;
  } | null;
  readonly governance: typeof GOVERNANCE;
  readonly boundaryStatus: string;
  readonly fetchErrorCode: string | null;
  readonly note: string;
}

const NON_EXECUTING_NOTE =
  "GET /quote evaluation only — no signing, funding, allowance, Permit2 signature, or submission performed";

function requestView(
  config: RialtoQuoteConfig,
  request: RialtoQuoteRequest,
): QuoteEvalReport["request"] {
  return {
    chainId: 4663,
    origin: config.apiBaseUrl,
    sellToken: config.wethAddress,
    buyToken: request.buyToken,
    taker: config.adapterAddress,
    sellAmountDecimal: request.sellAmountDecimal,
    slippageBps: config.slippageBps,
    settlementModeRequested: "allowance",
    integratorFeeRequested: false,
  };
}

/**
 * Run one isolated GET /quote evaluation: fetch + validate + classify. Never throws for a venue-side or
 * fail-closed condition; those are reported as codes. `deps` lets tests inject fetch/env so no network or
 * real environment is touched.
 */
export async function runQuoteEval(
  config: RialtoQuoteConfig,
  request: RialtoQuoteRequest,
  deps: RialtoQuoteDeps = {},
  opts: { readonly resolvedRouter?: string | null; readonly nowSec?: number } = {},
): Promise<QuoteEvalReport> {
  const request_ = requestView(config, request);
  let quote;
  try {
    quote = await fetchRialtoAllowanceQuote(config, request, deps);
  } catch (err) {
    const fetchErrorCode = err instanceof RialtoQuoteError ? err.code : "UNKNOWN_ERROR";
    return {
      ok: false,
      stage: "fetch",
      request: request_,
      quote: null,
      structural: { passed: false, errorCode: null, note: "quote fetch failed before validation" },
      routerReconciliation: null,
      governance: GOVERNANCE,
      boundaryStatus: classifyBoundary({
        quoteObserved: false,
        structuralValidationPassed: false,
        priceGuardPassed: false,
        localForkSettlementPassed: false,
        mainnetReceipt: null,
      }).status,
      fetchErrorCode,
      note: NON_EXECUTING_NOTE,
    };
  }

  // Structural validation ships with NO approved selectors and fails closed until the venue selector is
  // pinned. The expected on-chain calldata amount is RAW base units (quote.sellAmountRaw).
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
        expectedSellAmountRaw: quote.sellAmountRaw,
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
    request: request_,
    quote: quote.meta,
    structural: {
      passed: structuralPassed,
      errorCode: structuralErrorCode,
      note: structuralPassed
        ? "structural shape validated against a supplied policy"
        : "fail-closed: venue selector not yet pinned and/or router unresolved (expected)",
    },
    routerReconciliation: {
      observedTarget: quote.target,
      operatorSuppliedRouter: opts.resolvedRouter ?? null,
      officialRegistry: OFFICIAL_RIALTO_ROUTER_REGISTRY,
      feature2: "taker-submitted route",
      feature3: "gasless route",
      authoritative: false,
      note: "tx.to is a CANDIDATE only; reconcile on-chain against the official registry ownerOf(feature) before any D-6 pinning. RIALTO_RESOLVED_ROUTER is operator-supplied and NOT final authority.",
    },
    governance: GOVERNANCE,
    boundaryStatus,
    fetchErrorCode: null,
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
 * Build config/request from environment variables. Reads only variable NAMES here; the API key itself is
 * consumed inside the client and is never handled or echoed by this function. The API origin defaults to
 * the official Rialto origin; any override is validated at the fetch boundary and fails closed.
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
  // D-7 does NOT record an exact usable quantity ("minimum venue-accepted amount" only), so NO default is
  // invented here — the operator MUST supply a human-decimal amount at runtime.
  const sellDecimal = requireEnv(env, "RIALTO_SELL_AMOUNT_DECIMAL");
  if (decimalToBaseUnits(sellDecimal, 18) === null) {
    throw new UsageError(
      "RIALTO_SELL_AMOUNT_DECIMAL must be a positive decimal token amount (<= 18 fractional digits), e.g. 0.01",
    );
  }
  const slippageStr = requireEnv(env, "RIALTO_SLIPPAGE_BPS");
  if (!/^[0-9]+$/.test(slippageStr)) {
    throw new UsageError("RIALTO_SLIPPAGE_BPS must be a non-negative integer");
  }
  const override = env.RIALTO_API_BASE_URL;
  const config: RialtoQuoteConfig = {
    apiBaseUrl:
      typeof override === "string" && override.length > 0 ? override : OFFICIAL_RIALTO_ORIGIN,
    chainId: 4663,
    wethAddress: requireEnv(env, "RIALTO_SELL_TOKEN"),
    adapterAddress: requireEnv(env, "RIALTO_TAKER"),
    slippageBps: Number(slippageStr),
  };
  const request: RialtoQuoteRequest = {
    buyToken: requireEnv(env, "RIALTO_BUY_TOKEN"),
    sellAmountDecimal: sellDecimal,
  };
  const rr = env.RIALTO_RESOLVED_ROUTER;
  return { config, request, resolvedRouter: typeof rr === "string" && rr.length > 0 ? rr : null };
}

const USAGE = [
  "Rialto GET /quote evaluation harness (isolated, non-executing).",
  `Official origin (default): ${OFFICIAL_RIALTO_ORIGIN}`,
  "Required environment variables:",
  "  RIALTO_API_KEY              API key (read server-side; never printed)",
  "  RIALTO_SELL_TOKEN           WETH address (sell token)",
  "  RIALTO_BUY_TOKEN            stock token address (buy token)",
  "  RIALTO_TAKER                taker/recipient address (unfunded validation/canary adapter)",
  "  RIALTO_SELL_AMOUNT_DECIMAL  human-decimal WETH amount, e.g. 0.01 (NOT raw base units)",
  "  RIALTO_SLIPPAGE_BPS         integrator slippage in bps (integer)",
  "Optional:",
  "  RIALTO_API_BASE_URL         override origin (must still be the official HTTPS origin)",
  "  RIALTO_RESOLVED_ROUTER      live registry-resolved feature router (candidate; not authoritative)",
  "This harness performs GET /quote ONLY. It never signs, funds, approves, or broadcasts.",
].join("\n");

// ---------------------------------------------------------------------------------------------------
// QEX-1 CONSUMED GUARD (TASK 10K-2).
// QEX-1 authorized EXACTLY ONE authenticated GET /quote, which succeeded on 2026-07-25 and is COMPLETE.
// The live CLI is now RETIRED: it must fail with `QEX1_CONSUMED` BEFORE reading any environment variable
// or invoking any network code. This is a hard-coded SOURCE constant — no environment variable can
// re-enable it. Any future live quote requires a separately reviewed source change AND a new founder
// authorization (and, per D-24, that still authorizes no acquisition/execution). The reviewed quote
// client (quote-client.ts) and the offline harness function (runQuoteEval) are intentionally NOT deleted.
// ---------------------------------------------------------------------------------------------------
export const QEX1_CONSUMED: boolean = true;
export const QEX1_CONSUMED_STATUS = "QEX1_CONSUMED";

export function evaluateLiveCliAuthorization(): {
  readonly allowed: boolean;
  readonly status: string;
} {
  if (QEX1_CONSUMED) return { allowed: false, status: QEX1_CONSUMED_STATUS };
  return { allowed: true, status: "OK" };
}

/**
 * Live CLI entry (testable). Checks the QEX-1 consumed guard FIRST — before any environment read or any
 * network activity — and refuses when consumed. `env` and `deps` are only touched on the (currently
 * unreachable) allowed path, so an accidental rerun never reads a credential or reaches the network.
 */
export async function runLiveQex1Cli(
  env: Record<string, string | undefined>,
  deps: RialtoQuoteDeps,
  out: (s: string) => void,
  errOut: (s: string) => void,
): Promise<{ readonly status: string; readonly exitCode: number }> {
  const auth = evaluateLiveCliAuthorization();
  if (!auth.allowed) {
    errOut(
      `${auth.status}: QEX-1 is consumed (exactly one GET /quote succeeded on 2026-07-25). ` +
        "A new live quote requires a separately reviewed source change and a new founder authorization. " +
        "No environment variable can bypass this guard.\n",
    );
    return { status: auth.status, exitCode: 3 };
  }
  // NOTE: unreachable while QEX1_CONSUMED is true. Retained (not deleted) as the reviewed harness path.
  let built;
  try {
    built = configFromEnv(env);
  } catch (err) {
    errOut(`${err instanceof Error ? err.message : "invalid configuration"}\n\n${USAGE}\n`);
    return { status: "BAD_CONFIG", exitCode: 2 };
  }
  const report = await runQuoteEval(built.config, built.request, deps, {
    resolvedRouter: built.resolvedRouter,
  });
  out(`${JSON.stringify(report, null, 2)}\n`);
  return {
    status: report.ok ? "OK" : (report.fetchErrorCode ?? "ERROR"),
    exitCode: report.ok ? 0 : 1,
  };
}

async function main(): Promise<void> {
  const result = await runLiveQex1Cli(
    process.env,
    {},
    (s) => process.stdout.write(s),
    (s) => process.stderr.write(s),
  );
  process.exitCode = result.exitCode;
}

// Direct-run guard: main() executes only when this file is run as a script, never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
