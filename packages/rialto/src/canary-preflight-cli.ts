// TASK 10K-6 — Read-only CLI for the guarded-settlement canary preflight.
//
// SCOPE / SAFETY:
// - READ-ONLY. Builds a viem public client that issues ONLY eth_chainId / eth_getCode / eth_call. There is
//   no wallet client, no account, no signing, and no broadcast path anywhere in this file.
// - It REFUSES to run if ANY key/secret-bearing environment variable is present (private key, mnemonic,
//   seed phrase, or Rialto API key) — the preflight must never see key material.
// - It prints a secret-free report and the single status token `CANARY_BUILD_READY_EXECUTION_LOCKED`
//   or `CANARY_NOT_READY`. It never prints RPC credentials, calldata, or quote IDs.
// - D-24 stands: a passing report authorizes no deployment, funding, approval, acquisition, or execution.
//
// Local run (user-executed; requires a read-only Robinhood Chain RPC in a gitignored .env):
//   CANARY_RPC_URL=<rpc> GS_CONTROLLER=<safe> GS_CANARY_CAP_WEI=1000000000000000 \
//   GS_MAX_WETH_FEED_AGE_SEC=900 GS_MAX_NVDA_FEED_AGE_SEC=900 \
//   node --loader ts-node/esm packages/rialto/src/canary-preflight-cli.ts

import { createPublicClient, defineChain, http } from "viem";
import {
  type CanaryPreflightConfig,
  type CanaryStatus,
  type ChainReader,
  type Hex,
  evaluateCanaryReadiness,
  formatCanaryReport,
  ROBINHOOD_CHAIN_ID,
} from "./canary-preflight.js";
import { ZERO_ADDRESS } from "./guarded-settlement.js";
import { QEX1_CONSUMED } from "./quote-eval-cli.js";

/** Env names that must NEVER be present when the preflight runs (name-only checks; values never read). */
export const FORBIDDEN_SECRET_ENV = [
  "PRIVATE_KEY",
  "PRIVATE_KEYS",
  "GS_PRIVATE_KEY",
  "DEPLOYER_PRIVATE_KEY",
  "WALLET_PRIVATE_KEY",
  "MNEMONIC",
  "SEED_PHRASE",
  "RIALTO_API_KEY",
] as const;

export interface CliDeps {
  env: Record<string, string | undefined>;
  now: () => number;
  makeReader: (rpcUrl: string) => ChainReader;
  log: (line: string) => void;
  /** TEST-ONLY router code-hash override. Production `main()` never sets it (the pin is authoritative). */
  expectedRouterCodeHash?: Hex;
}

export interface CliOutcome {
  readonly status: CanaryStatus | "ABORTED";
  readonly exitCode: number;
}

/** Default reader: a viem public client bound to Robinhood Chain, read methods only. */
export function makeRpcReader(rpcUrl: string): ChainReader {
  const chain = defineChain({
    id: ROBINHOOD_CHAIN_ID,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  return {
    getChainId: () => client.getChainId(),
    getCode: async (address: Hex) => (await client.getBytecode({ address })) ?? "0x",
    call: async (to: Hex, data: Hex) => (await client.call({ to, data })).data ?? "0x",
  };
}

function parseAddress(v: string | undefined, fallback: Hex | null): Hex | null {
  if (v === undefined || v.trim() === "") return fallback;
  return v.trim() as Hex;
}

/** DI-friendly CLI body. Returns the outcome instead of calling process.exit (tests inject fakes). */
export async function runCanaryPreflightCli(deps: CliDeps): Promise<CliOutcome> {
  const { env, log } = deps;

  // Hard refusal: no key/secret material may be present in the environment.
  const present = FORBIDDEN_SECRET_ENV.filter((n) => (env[n] ?? "").trim() !== "");
  if (present.length > 0) {
    log(
      `ABORT: refusing to run with secret-bearing env present: ${present.join(", ")} (names only). Remove them.`,
    );
    return { status: "ABORTED", exitCode: 2 };
  }

  const rpcUrl = (env.CANARY_RPC_URL ?? "").trim();
  if (rpcUrl === "") {
    log("CANARY_NOT_READY: CANARY_RPC_URL is not set (read-only RPC endpoint required).");
    return { status: "CANARY_NOT_READY", exitCode: 1 };
  }

  const controller = parseAddress(env.GS_CONTROLLER, ZERO_ADDRESS as Hex)!;
  const executor = parseAddress(env.CANARY_EXECUTOR_ADDRESS, null);
  const sequencerFeed = parseAddress(env.GS_SEQUENCER_FEED, ZERO_ADDRESS as Hex)!;
  const config: CanaryPreflightConfig = {
    controller,
    executor,
    sequencerFeed,
    maxWethFeedAgeSec: Number(env.GS_MAX_WETH_FEED_AGE_SEC ?? "0"),
    maxNvdaFeedAgeSec: Number(env.GS_MAX_NVDA_FEED_AGE_SEC ?? "0"),
    canaryCapWei: BigInt(env.GS_CANARY_CAP_WEI ?? "0"),
    nowSec: deps.now(),
    qex1Consumed: QEX1_CONSUMED,
    ...(deps.expectedRouterCodeHash ? { expectedRouterCodeHash: deps.expectedRouterCodeHash } : {}),
  };

  let report;
  try {
    const reader = deps.makeReader(rpcUrl);
    report = await evaluateCanaryReadiness(reader, config);
  } catch (e) {
    log(
      `CANARY_NOT_READY: preflight aborted: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`,
    );
    return { status: "CANARY_NOT_READY", exitCode: 1 };
  }

  log(formatCanaryReport(report));
  return {
    status: report.status,
    exitCode: report.status === "CANARY_BUILD_READY_EXECUTION_LOCKED" ? 0 : 1,
  };
}

// Execute only when run directly (never on import, so tests stay side-effect-free).
const isDirect = (() => {
  try {
    return (
      typeof process !== "undefined" &&
      Array.isArray(process.argv) &&
      /canary-preflight-cli\.(ts|js)$/.test(process.argv[1] ?? "")
    );
  } catch {
    return false;
  }
})();

if (isDirect) {
  runCanaryPreflightCli({
    env: process.env,
    now: () => Math.floor(Date.now() / 1000),
    makeReader: makeRpcReader,
    log: (line) => console.log(line),
  })
    .then((o) => {
      process.exitCode = o.exitCode;
    })
    .catch((e) => {
      console.error(
        `CANARY_NOT_READY: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`,
      );
      process.exitCode = 1;
    });
}
