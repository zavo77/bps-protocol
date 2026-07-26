import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, keccak256, toFunctionSelector, type Hex } from "viem";
import { redactRpc, runCanaryPreflightCli, type CliDeps } from "./canary-preflight-cli.js";
import {
  type ChainReader,
  ETH_USD_FEED,
  ETH_USD_FEED_DESCRIPTION,
  FLAG_CONTROLLER_REQUIRED,
  NVDA_USD_FEED,
  NVDA_USD_FEED_DESCRIPTION,
  ROBINHOOD_CHAIN_ID,
} from "./canary-preflight.js";
import { NVDA, OFFICIAL_REGISTRY, WETH } from "./guarded-settlement.js";

const SEL = {
  decimals: toFunctionSelector("decimals()"),
  symbol: toFunctionSelector("symbol()"),
  description: toFunctionSelector("description()"),
  latestRoundData: toFunctionSelector("latestRoundData()"),
  ownerOf: toFunctionSelector("ownerOf(uint256)"),
  oraclePaused: toFunctionSelector("oraclePaused()"),
};
const enc = {
  uint8: (n: number) => encodeAbiParameters([{ type: "uint8" }], [n]),
  string: (s: string) => encodeAbiParameters([{ type: "string" }], [s]),
  bool: (b: boolean) => encodeAbiParameters([{ type: "bool" }], [b]),
  address: (a: Hex) => encodeAbiParameters([{ type: "address" }], [a]),
  round: (r: bigint, ans: bigint, ts: bigint, air: bigint) =>
    encodeAbiParameters(
      [
        { type: "uint80" },
        { type: "int256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint80" },
      ],
      [r, ans, ts, ts, air],
    ),
};

const ROUTER = "0x1111111111111111111111111111111111111111" as Hex;
const CONTROLLER = "0x2222222222222222222222222222222222222222" as Hex;
const ROUTER_CODE = "0xdead" as Hex;
const NOW = 1_785_000_000;

function healthyReader(): ChainReader {
  const code = new Map<string, Hex>();
  const calls = new Map<string, Hex>();
  const setCode = (a: string, c: Hex) => code.set(a.toLowerCase(), c);
  const setCall = (a: string, s: string, h: Hex) => calls.set(`${a.toLowerCase()}:${s}`, h);
  setCode(OFFICIAL_REGISTRY, "0xaa");
  setCall(OFFICIAL_REGISTRY, SEL.ownerOf, enc.address(ROUTER));
  setCode(ROUTER, ROUTER_CODE);
  setCode(WETH, "0xbb");
  setCall(WETH, SEL.decimals, enc.uint8(18));
  setCall(WETH, SEL.symbol, enc.string("WETH"));
  setCode(NVDA, "0xcc");
  setCall(NVDA, SEL.decimals, enc.uint8(18));
  setCall(NVDA, SEL.symbol, enc.string("NVDA"));
  setCall(NVDA, SEL.oraclePaused, enc.bool(false));
  for (const [feed, desc] of [
    [ETH_USD_FEED, ETH_USD_FEED_DESCRIPTION],
    [NVDA_USD_FEED, NVDA_USD_FEED_DESCRIPTION],
  ] as const) {
    setCode(feed, "0xdd");
    setCall(feed, SEL.decimals, enc.uint8(8));
    setCall(feed, SEL.description, enc.string(desc));
    setCall(feed, SEL.latestRoundData, enc.round(10n, 200_000_000_000n, BigInt(NOW - 60), 10n));
  }
  setCode(CONTROLLER, "0xee");
  return {
    getChainId: async () => ROBINHOOD_CHAIN_ID,
    getCode: async (a) => code.get(a.toLowerCase()) ?? "0x",
    call: async (to, data) => {
      const v = calls.get(`${to.toLowerCase()}:${data.slice(0, 10)}`);
      if (v === undefined) throw new Error(`no fake for ${to}`);
      return v;
    },
  };
}

function baseEnv(): Record<string, string | undefined> {
  return {
    CANARY_RPC_URL: "http://read-only.invalid",
    GS_CONTROLLER: CONTROLLER,
    GS_SEQUENCER_FEED: "0x0000000000000000000000000000000000000000",
    GS_MAX_WETH_FEED_AGE_SEC: "900",
    GS_MAX_NVDA_FEED_AGE_SEC: "900",
    GS_CANARY_CAP_WEI: "1000000000000000",
  };
}

function deps(over: Partial<CliDeps>): CliDeps {
  const lines: string[] = [];
  const d: CliDeps = {
    env: baseEnv(),
    now: () => NOW,
    makeReader: () => healthyReader(),
    log: (l) => lines.push(l),
    expectedRouterCodeHash: keccak256(ROUTER_CODE),
    ...over,
  };
  (d as unknown as { _lines: string[] })._lines = lines;
  return d;
}

function linesOf(d: CliDeps): string[] {
  return (d as unknown as { _lines: string[] })._lines;
}

describe("redactRpc", () => {
  it("strips the full URL, host, and credential path plus any other absolute URL", () => {
    const url = "https://rpc.example-relay.net/rpc/deadbeefsecretcredential";
    const msg = `HTTP request failed. URL: ${url} details: fetch to https://other.host/x failed`;
    const out = redactRpc(url, msg);
    expect(out).not.toContain("example-relay.net");
    expect(out).not.toContain("deadbeefsecretcredential");
    expect(out).not.toContain(url);
    expect(out).not.toMatch(/https?:\/\//);
  });
});

describe("runCanaryPreflightCli — refusals", () => {
  it("ABORTS (exit 2) without building a reader when a secret env is present", async () => {
    const makeReader = vi.fn(() => healthyReader());
    const d = deps({ env: { ...baseEnv(), PRIVATE_KEY: "0xshould-never-be-read" }, makeReader });
    const out = await runCanaryPreflightCli(d);
    expect(out.status).toBe("ABORTED");
    expect(out.exitCode).toBe(2);
    expect(makeReader).not.toHaveBeenCalled();
    expect(linesOf(d).join("\n")).toContain("PRIVATE_KEY");
    expect(linesOf(d).join("\n")).not.toContain("0xshould-never-be-read");
  });

  it("refuses each forbidden secret name", async () => {
    for (const name of ["MNEMONIC", "SEED_PHRASE", "RIALTO_API_KEY", "DEPLOYER_PRIVATE_KEY"]) {
      const d = deps({ env: { ...baseEnv(), [name]: "x" } });
      const out = await runCanaryPreflightCli(d);
      expect(out.status, name).toBe("ABORTED");
    }
  });

  it("returns CANARY_NOT_READY (exit 1) when CANARY_RPC_URL is missing", async () => {
    const makeReader = vi.fn(() => healthyReader());
    const env = baseEnv();
    delete env.CANARY_RPC_URL;
    const out = await runCanaryPreflightCli(deps({ env, makeReader }));
    expect(out.status).toBe("CANARY_NOT_READY");
    expect(out.exitCode).toBe(1);
    expect(makeReader).not.toHaveBeenCalled();
  });
});

describe("runCanaryPreflightCli — evaluation", () => {
  it("returns CANARY_BUILD_READY_EXECUTION_LOCKED (exit 0) on a healthy read-only chain", async () => {
    const d = deps({});
    const out = await runCanaryPreflightCli(d);
    expect(out.status, linesOf(d).join("\n")).toBe("CANARY_BUILD_READY_EXECUTION_LOCKED");
    expect(out.exitCode).toBe(0);
    expect(linesOf(d).join("\n")).toContain("STATUS: CANARY_BUILD_READY_EXECUTION_LOCKED");
  });

  it("missing GS_CONTROLLER => CONTROLLER_REQUIRED (exit 1) but live checks still run", async () => {
    const env = baseEnv();
    delete env.GS_CONTROLLER;
    const d = deps({ env });
    const out = await runCanaryPreflightCli(d);
    expect(out.status).toBe("CANARY_NOT_READY");
    expect(out.exitCode).toBe(1);
    const text = linesOf(d).join("\n");
    expect(text).toContain(FLAG_CONTROLLER_REQUIRED);
    expect(text).toContain("[PASS] eth-usd-feed-fresh");
    expect(text).toContain("[PASS] router-code-hash");
  });

  it("maps a failing evaluation to exit 1 (pinned router hash cannot match a fake)", async () => {
    // No override => the CLI uses the authoritative pinned hash, which a fake router cannot satisfy.
    const lines: string[] = [];
    const d: CliDeps = {
      env: baseEnv(),
      now: () => NOW,
      makeReader: () => healthyReader(),
      log: (l) => lines.push(l),
    };
    const out = await runCanaryPreflightCli(d);
    expect(out.status).toBe("CANARY_NOT_READY");
    expect(out.exitCode).toBe(1);
    expect(lines.join("\n")).toContain("router-code-hash");
  });

  it("redacts the RPC endpoint if the reader throws", async () => {
    const url = "https://secret-relay.example/rpc/topsecretcredential";
    const lines: string[] = [];
    const d: CliDeps = {
      env: { ...baseEnv(), CANARY_RPC_URL: url },
      now: () => NOW,
      makeReader: () => {
        throw new Error(`connect failed to ${url}`);
      },
      log: (l) => lines.push(l),
    };
    const out = await runCanaryPreflightCli(d);
    expect(out.status).toBe("CANARY_NOT_READY");
    const text = lines.join("\n");
    expect(text).not.toContain("secret-relay.example");
    expect(text).not.toContain("topsecretcredential");
  });
});

describe("runCanaryPreflightCli — network tripwire", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("never touches globalThis.fetch when a reader is injected", async () => {
    globalThis.fetch = (() => {
      throw new Error("TRIPWIRE: CLI must not use the network directly when a reader is injected");
    }) as typeof fetch;
    const out = await runCanaryPreflightCli(deps({}));
    expect(out.status).toBe("CANARY_BUILD_READY_EXECUTION_LOCKED");
  });
});
