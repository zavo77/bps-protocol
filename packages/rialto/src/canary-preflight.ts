// TASK 10K-6 — Canary preflight core for the BPS guarded-settlement stack (Robinhood Chain, chain 4663).
//
// SCOPE / SAFETY:
// - PURE + DEPENDENCY-INJECTED. This module performs NO network, filesystem, environment, or clock access
//   of its own. Every read goes through the injected `ChainReader` (read-only: chainId / getCode / call),
//   and "now" is passed in. There is NO signing, funding, approval, encoding-for-broadcast, or submission
//   client here. It cannot move assets or deploy anything.
// - It answers ONE question: is the canary BUILD ready while EXECUTION stays locked? It emits exactly
//   `CANARY_BUILD_READY_EXECUTION_LOCKED` or `CANARY_NOT_READY`. Any failed check => NOT ready.
// - It NEVER prints secrets, RPC credentials, calldata, or quote IDs. Only public addresses, decoded
//   view values, and pass/fail flags appear in the report.
// - D-24 stands: a passing report authorizes no deployment, funding, approval, acquisition, or execution.

import { decodeFunctionResult, encodeFunctionData, keccak256, type Abi } from "viem";
import {
  DEAD_ADDRESS,
  NVDA,
  OFFICIAL_REGISTRY,
  OPAQUE_SETTLEMENT_SELECTOR,
  WETH,
  ZERO_ADDRESS,
} from "./guarded-settlement.js";

export const ROBINHOOD_CHAIN_ID = 4663;
export const FEATURE_ID = 2n;

// Verified official Chainlink Robinhood-mainnet feed proxies (reference-data directory, 2026-07-26).
export const ETH_USD_FEED = "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9";
export const NVDA_USD_FEED = "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15";
export const ETH_USD_FEED_DESCRIPTION = "ETH / USD";
export const NVDA_USD_FEED_DESCRIPTION = "RHNVDA / USD";
export const EXPECTED_FEED_DECIMALS = 8;
export const EXPECTED_TOKEN_DECIMALS = 18;

// Pinned feature-2 router runtime code hash (TASK 10K-5 investigation) — MUST equal keccak256(getCode(router)).
export const ROUTER_CODE_HASH =
  "0xa7041268d6f20802f420b5c71e84a991dc797f27cb474265598b89e43ef27611";
export const EXPECTED_SETTLEMENT_SELECTOR = "0x77963966";

export const CANARY_MAX_SELL_WETH = 1_000_000_000_000_000n; // 0.001 WETH
export const MAX_FEED_AGE_CEILING_SEC = 900; // 15 minutes

export type Hex = `0x${string}`;

/** Read-only chain access. Intentionally has NO write/sign/send surface. */
export interface ChainReader {
  getChainId(): Promise<number>;
  /** Runtime code at `address`, or "0x" when there is none. */
  getCode(address: Hex): Promise<Hex>;
  /** eth_call to `to` with `data`; returns raw return data. */
  call(to: Hex, data: Hex): Promise<Hex>;
}

export interface CanaryPreflightConfig {
  /** Final deployed-contract controller/Safe that will own the executor. */
  controller: Hex;
  /** Executor address, or null when it is not yet deployed (build-ready, execution not yet possible). */
  executor: Hex | null;
  /** Optional sequencer uptime feed; ZERO_ADDRESS when none is officially published. */
  sequencerFeed: Hex;
  maxWethFeedAgeSec: number;
  maxNvdaFeedAgeSec: number;
  canaryCapWei: bigint;
  /** Current unix time (seconds), injected. */
  nowSec: number;
  /** QEX-1 live-run flag: MUST be true (retired/consumed). Injected from quote-eval-cli. */
  qex1Consumed: boolean;
  /**
   * Expected feature-2 router runtime code hash. Defaults to the pinned {@link ROUTER_CODE_HASH}. The CLI
   * never overrides this (the pin is authoritative); it exists ONLY so unit tests can assert the code-hash
   * comparison against a fake router whose real bytecode is not the production router's.
   */
  expectedRouterCodeHash?: Hex;
}

export interface CheckResult {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
}

export type CanaryStatus = "CANARY_BUILD_READY_EXECUTION_LOCKED" | "CANARY_NOT_READY";

export interface CanaryReadinessReport {
  readonly status: CanaryStatus;
  readonly executionLocked: boolean;
  readonly chainId: number | null;
  readonly checks: readonly CheckResult[];
  readonly failed: readonly string[];
}

const AGGREGATOR_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "description",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const satisfies Abi;

const REGISTRY_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const satisfies Abi;

const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const satisfies Abi;

const STOCK_ABI = [
  {
    type: "function",
    name: "oraclePaused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const satisfies Abi;

const PAUSABLE_ABI = [
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const satisfies Abi;

function eqAddr(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function isZeroOrDead(a: string): boolean {
  return eqAddr(a, ZERO_ADDRESS) || eqAddr(a, DEAD_ADDRESS);
}

async function readView<TAbi extends Abi, TName extends string>(
  reader: ChainReader,
  to: Hex,
  abi: TAbi,
  functionName: TName,
  args: readonly unknown[],
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = encodeFunctionData({ abi, functionName, args } as any);
  const ret = await reader.call(to, data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return decodeFunctionResult({ abi, functionName, data: ret } as any);
}

/**
 * Evaluate canary build readiness against live (read-only) chain state. Never throws for a failed check;
 * every failure is captured as an `ok: false` CheckResult and forces `CANARY_NOT_READY`.
 */
export async function evaluateCanaryReadiness(
  reader: ChainReader,
  config: CanaryPreflightConfig,
): Promise<CanaryReadinessReport> {
  const checks: CheckResult[] = [];
  const add = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });

  // 1. Chain identity.
  let chainId: number | null = null;
  try {
    chainId = await reader.getChainId();
    add(
      "chain-id",
      chainId === ROBINHOOD_CHAIN_ID,
      `chainId=${chainId} (expected ${ROBINHOOD_CHAIN_ID})`,
    );
  } catch (e) {
    add("chain-id", false, `chainId read failed: ${short(e)}`);
  }

  // 2. Build-level selector pin (no chain read).
  add(
    "settlement-selector",
    eqAddr(OPAQUE_SETTLEMENT_SELECTOR, EXPECTED_SETTLEMENT_SELECTOR),
    `selector=${OPAQUE_SETTLEMENT_SELECTOR} (expected ${EXPECTED_SETTLEMENT_SELECTOR})`,
  );

  // 3. Registry has code.
  await codeCheck(reader, add, "registry-code", OFFICIAL_REGISTRY as Hex);

  // 4. Router identity: registry.ownerOf(2) -> code present -> code hash matches pin.
  try {
    const router = (await readView(reader, OFFICIAL_REGISTRY as Hex, REGISTRY_ABI, "ownerOf", [
      FEATURE_ID,
    ])) as Hex;
    if (isZeroOrDead(router)) {
      add("router-owner", false, `ownerOf(2) returned zero/dead router`);
    } else {
      add("router-owner", true, `router=${router}`);
      const code = await reader.getCode(router);
      if (!code || code === "0x") {
        add("router-code-hash", false, `router ${router} has no code`);
      } else {
        const expected = config.expectedRouterCodeHash ?? ROUTER_CODE_HASH;
        const hash = keccak256(code);
        add(
          "router-code-hash",
          eqAddr(hash, expected),
          `router codeHash ${eqAddr(hash, expected) ? "matches pin" : "MISMATCH"}`,
        );
      }
    }
  } catch (e) {
    add("router-owner", false, `ownerOf(2) failed: ${short(e)}`);
  }

  // 5-6. Tokens: code present + decimals == 18.
  await tokenCheck(reader, add, "weth", WETH as Hex);
  await tokenCheck(reader, add, "nvda", NVDA as Hex);

  // 7-8. Feeds: code + decimals + description + round integrity + freshness.
  await feedCheck(
    reader,
    add,
    config,
    "eth-usd",
    ETH_USD_FEED as Hex,
    ETH_USD_FEED_DESCRIPTION,
    config.maxWethFeedAgeSec,
  );
  await feedCheck(
    reader,
    add,
    config,
    "nvda-usd",
    NVDA_USD_FEED as Hex,
    NVDA_USD_FEED_DESCRIPTION,
    config.maxNvdaFeedAgeSec,
  );

  // 9. NVDA stock oracle not globally paused.
  try {
    const paused = (await readView(reader, NVDA as Hex, STOCK_ABI, "oraclePaused", [])) as boolean;
    add("nvda-oracle-not-paused", paused === false, `oraclePaused=${paused}`);
  } catch (e) {
    add("nvda-oracle-not-paused", false, `oraclePaused read failed: ${short(e)}`);
  }

  // 10. Sequencer policy: none published => must be ZERO. If nonzero, it must at least have code.
  if (eqAddr(config.sequencerFeed, ZERO_ADDRESS)) {
    add(
      "sequencer-policy",
      true,
      "no sequencer feed configured (none officially published); dual-feed freshness enforced",
    );
  } else {
    const code = await reader.getCode(config.sequencerFeed);
    add(
      "sequencer-policy",
      !!code && code !== "0x",
      `sequencer feed ${config.sequencerFeed} code present=${!!code && code !== "0x"}`,
    );
  }

  // 11. Controller is a real deployed contract (not EOA/zero/dead).
  if (isZeroOrDead(config.controller)) {
    add("controller", false, "controller is zero/dead");
  } else {
    const code = await reader.getCode(config.controller);
    add(
      "controller",
      !!code && code !== "0x",
      `controller code present=${!!code && code !== "0x"}`,
    );
  }

  // 12. Cap bounds.
  add(
    "canary-cap",
    config.canaryCapWei > 0n && config.canaryCapWei <= CANARY_MAX_SELL_WETH,
    `cap=${config.canaryCapWei} wei (must be 0<cap<=${CANARY_MAX_SELL_WETH})`,
  );

  // 13. Feed-age policy bounds.
  add(
    "feed-age-policy",
    ageOk(config.maxWethFeedAgeSec) && ageOk(config.maxNvdaFeedAgeSec),
    `maxWethAge=${config.maxWethFeedAgeSec}s maxNvdaAge=${config.maxNvdaFeedAgeSec}s (must be 0<age<=${MAX_FEED_AGE_CEILING_SEC})`,
  );

  // 14. Execution lock: executor undeployed (nothing to execute) OR deployed-and-paused.
  let executionLocked = true;
  if (config.executor === null) {
    add("execution-locked", true, "executor not yet deployed (execution not possible)");
  } else {
    try {
      const code = await reader.getCode(config.executor);
      if (!code || code === "0x") {
        add("execution-locked", true, "executor address has no code yet (execution not possible)");
      } else {
        const paused = (await readView(
          reader,
          config.executor,
          PAUSABLE_ABI,
          "paused",
          [],
        )) as boolean;
        executionLocked = paused === true;
        add("execution-locked", executionLocked, `executor paused=${paused}`);
      }
    } catch (e) {
      executionLocked = false;
      add("execution-locked", false, `executor paused() read failed: ${short(e)}`);
    }
  }

  // 15. QEX-1 retired/consumed.
  add("qex1-consumed", config.qex1Consumed === true, `QEX1_CONSUMED=${config.qex1Consumed}`);

  const failed = checks.filter((c) => !c.ok).map((c) => c.id);
  const status: CanaryStatus =
    failed.length === 0 && executionLocked
      ? "CANARY_BUILD_READY_EXECUTION_LOCKED"
      : "CANARY_NOT_READY";
  return { status, executionLocked, chainId, checks, failed };
}

async function codeCheck(
  reader: ChainReader,
  add: (id: string, ok: boolean, detail: string) => void,
  id: string,
  addr: Hex,
): Promise<void> {
  try {
    const code = await reader.getCode(addr);
    add(id, !!code && code !== "0x", `${addr} code present=${!!code && code !== "0x"}`);
  } catch (e) {
    add(id, false, `${addr} getCode failed: ${short(e)}`);
  }
}

async function tokenCheck(
  reader: ChainReader,
  add: (id: string, ok: boolean, detail: string) => void,
  id: string,
  addr: Hex,
): Promise<void> {
  try {
    const code = await reader.getCode(addr);
    if (!code || code === "0x") {
      add(`${id}-token`, false, `${addr} has no code`);
      return;
    }
    const dec = Number((await readView(reader, addr, ERC20_ABI, "decimals", [])) as number);
    add(
      `${id}-token`,
      dec === EXPECTED_TOKEN_DECIMALS,
      `${addr} decimals=${dec} (expected ${EXPECTED_TOKEN_DECIMALS})`,
    );
  } catch (e) {
    add(`${id}-token`, false, `${addr} token check failed: ${short(e)}`);
  }
}

async function feedCheck(
  reader: ChainReader,
  add: (id: string, ok: boolean, detail: string) => void,
  config: CanaryPreflightConfig,
  id: string,
  addr: Hex,
  expectedDescription: string,
  maxAgeSec: number,
): Promise<void> {
  try {
    const code = await reader.getCode(addr);
    if (!code || code === "0x") {
      add(`${id}-feed`, false, `${addr} has no code`);
      return;
    }
    const dec = Number((await readView(reader, addr, AGGREGATOR_ABI, "decimals", [])) as number);
    add(
      `${id}-feed-decimals`,
      dec === EXPECTED_FEED_DECIMALS,
      `decimals=${dec} (expected ${EXPECTED_FEED_DECIMALS})`,
    );
    const desc = (await readView(reader, addr, AGGREGATOR_ABI, "description", [])) as string;
    add(
      `${id}-feed-description`,
      desc === expectedDescription,
      `description=${JSON.stringify(desc)}`,
    );

    const rd = (await readView(reader, addr, AGGREGATOR_ABI, "latestRoundData", [])) as readonly [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
    ];
    const [roundId, answer, , updatedAt, answeredInRound] = rd;
    const positive = answer > 0n;
    const completeRound = roundId !== 0n && answeredInRound >= roundId;
    const ts = Number(updatedAt);
    const fresh = ts > 0 && ts <= config.nowSec && config.nowSec - ts <= maxAgeSec;
    add(`${id}-feed-answer`, positive, `answer>0=${positive}`);
    add(
      `${id}-feed-round`,
      completeRound,
      `roundId!=0 && answeredInRound>=roundId = ${completeRound}`,
    );
    add(`${id}-feed-fresh`, fresh, `age=${config.nowSec - ts}s (max ${maxAgeSec}s)`);
  } catch (e) {
    add(`${id}-feed`, false, `${addr} feed check failed: ${short(e)}`);
  }
}

function ageOk(age: number): boolean {
  return Number.isInteger(age) && age > 0 && age <= MAX_FEED_AGE_CEILING_SEC;
}

/** Compact, secret-free error rendering (class + first line only). */
function short(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message.split("\n")[0]!.slice(0, 120)}`;
  return String(e).slice(0, 120);
}

/** Human-readable, secret-free rendering of the report. */
export function formatCanaryReport(r: CanaryReadinessReport): string {
  const lines: string[] = [];
  lines.push("BPS GUARDED-SETTLEMENT CANARY PREFLIGHT");
  lines.push(`chainId: ${r.chainId ?? "unknown"}`);
  lines.push(`executionLocked: ${r.executionLocked}`);
  lines.push("checks:");
  for (const c of r.checks) lines.push(`  [${c.ok ? "PASS" : "FAIL"}] ${c.id} — ${c.detail}`);
  if (r.failed.length > 0) lines.push(`failed: ${r.failed.join(", ")}`);
  lines.push(`STATUS: ${r.status}`);
  return lines.join("\n");
}
