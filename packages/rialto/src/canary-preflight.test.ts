import { afterEach, describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, toFunctionSelector, type Hex } from "viem";
import {
  type CanaryPreflightConfig,
  type ChainReader,
  ETH_USD_FEED,
  ETH_USD_FEED_DESCRIPTION,
  NVDA_USD_FEED,
  NVDA_USD_FEED_DESCRIPTION,
  ROBINHOOD_CHAIN_ID,
  evaluateCanaryReadiness,
  formatCanaryReport,
} from "./canary-preflight.js";
import { NVDA, OFFICIAL_REGISTRY, WETH } from "./guarded-settlement.js";

const SEL = {
  decimals: toFunctionSelector("decimals()"),
  description: toFunctionSelector("description()"),
  latestRoundData: toFunctionSelector("latestRoundData()"),
  ownerOf: toFunctionSelector("ownerOf(uint256)"),
  oraclePaused: toFunctionSelector("oraclePaused()"),
  paused: toFunctionSelector("paused()"),
};

const enc = {
  uint8: (n: number) => encodeAbiParameters([{ type: "uint8" }], [n]),
  string: (s: string) => encodeAbiParameters([{ type: "string" }], [s]),
  bool: (b: boolean) => encodeAbiParameters([{ type: "bool" }], [b]),
  address: (a: Hex) => encodeAbiParameters([{ type: "address" }], [a]),
  round: (roundId: bigint, answer: bigint, updatedAt: bigint, answeredInRound: bigint) =>
    encodeAbiParameters(
      [
        { type: "uint80" },
        { type: "int256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint80" },
      ],
      [roundId, answer, updatedAt, updatedAt, answeredInRound],
    ),
};

const ROUTER = "0x1111111111111111111111111111111111111111" as Hex;
const CONTROLLER = "0x2222222222222222222222222222222222222222" as Hex;
const ROUTER_CODE = "0xdead" as Hex; // arbitrary; hash injected via expectedRouterCodeHash
const NOW = 1_785_000_000;

class FakeChain implements ChainReader {
  chainId = ROBINHOOD_CHAIN_ID;
  private code = new Map<string, Hex>();
  private calls = new Map<string, Hex>();

  setCode(a: string, c: Hex): this {
    this.code.set(a.toLowerCase(), c);
    return this;
  }
  setCall(a: string, selector: string, hex: Hex): this {
    this.calls.set(`${a.toLowerCase()}:${selector}`, hex);
    return this;
  }
  async getChainId(): Promise<number> {
    return this.chainId;
  }
  async getCode(a: Hex): Promise<Hex> {
    return this.code.get(a.toLowerCase()) ?? "0x";
  }
  async call(to: Hex, data: Hex): Promise<Hex> {
    const sel = data.slice(0, 10);
    const v = this.calls.get(`${to.toLowerCase()}:${sel}`);
    if (v === undefined) throw new Error(`no fake for ${to}:${sel}`);
    return v;
  }
}

function healthyChain(): FakeChain {
  const c = new FakeChain();
  c.setCode(OFFICIAL_REGISTRY, "0xaa");
  c.setCall(OFFICIAL_REGISTRY, SEL.ownerOf, enc.address(ROUTER));
  c.setCode(ROUTER, ROUTER_CODE);
  c.setCode(WETH, "0xbb");
  c.setCall(WETH, SEL.decimals, enc.uint8(18));
  c.setCode(NVDA, "0xcc");
  c.setCall(NVDA, SEL.decimals, enc.uint8(18));
  c.setCall(NVDA, SEL.oraclePaused, enc.bool(false));
  for (const [feed, desc] of [
    [ETH_USD_FEED, ETH_USD_FEED_DESCRIPTION],
    [NVDA_USD_FEED, NVDA_USD_FEED_DESCRIPTION],
  ] as const) {
    c.setCode(feed, "0xdd");
    c.setCall(feed, SEL.decimals, enc.uint8(8));
    c.setCall(feed, SEL.description, enc.string(desc));
    c.setCall(feed, SEL.latestRoundData, enc.round(10n, 200_000_000_000n, BigInt(NOW - 60), 10n));
  }
  c.setCode(CONTROLLER, "0xee");
  return c;
}

function healthyConfig(): CanaryPreflightConfig {
  return {
    controller: CONTROLLER,
    executor: null,
    sequencerFeed: "0x0000000000000000000000000000000000000000",
    maxWethFeedAgeSec: 900,
    maxNvdaFeedAgeSec: 900,
    canaryCapWei: 1_000_000_000_000_000n,
    nowSec: NOW,
    qex1Consumed: true,
    expectedRouterCodeHash: keccak256(ROUTER_CODE),
  };
}

describe("evaluateCanaryReadiness — happy path", () => {
  it("returns CANARY_BUILD_READY_EXECUTION_LOCKED when every check passes and executor is undeployed", async () => {
    const r = await evaluateCanaryReadiness(healthyChain(), healthyConfig());
    expect(r.failed, JSON.stringify(r.checks, null, 2)).toEqual([]);
    expect(r.status).toBe("CANARY_BUILD_READY_EXECUTION_LOCKED");
    expect(r.executionLocked).toBe(true);
  });

  it("stays READY when a deployed executor is paused", async () => {
    const executor = "0x3333333333333333333333333333333333333333" as Hex;
    const chain = healthyChain()
      .setCode(executor, "0xff")
      .setCall(executor, SEL.paused, enc.bool(true));
    const r = await evaluateCanaryReadiness(chain, { ...healthyConfig(), executor });
    expect(r.status).toBe("CANARY_BUILD_READY_EXECUTION_LOCKED");
  });
});

describe("evaluateCanaryReadiness — fail-closed on each defect", () => {
  it("wrong chain id", async () => {
    const chain = healthyChain();
    chain.chainId = 1;
    const r = await evaluateCanaryReadiness(chain, healthyConfig());
    expect(r.status).toBe("CANARY_NOT_READY");
    expect(r.failed).toContain("chain-id");
  });

  it("registry has no code", async () => {
    const chain = healthyChain().setCode(OFFICIAL_REGISTRY, "0x");
    const r = await evaluateCanaryReadiness(chain, healthyConfig());
    expect(r.failed).toContain("registry-code");
  });

  it("router code hash mismatch", async () => {
    const r = await evaluateCanaryReadiness(healthyChain(), {
      ...healthyConfig(),
      expectedRouterCodeHash: keccak256("0xbeef" as Hex),
    });
    expect(r.status).toBe("CANARY_NOT_READY");
    expect(r.failed).toContain("router-code-hash");
  });

  it("router owner zero", async () => {
    const chain = healthyChain().setCall(
      OFFICIAL_REGISTRY,
      SEL.ownerOf,
      enc.address("0x0000000000000000000000000000000000000000"),
    );
    const r = await evaluateCanaryReadiness(chain, healthyConfig());
    expect(r.failed).toContain("router-owner");
  });

  it("wrong WETH decimals", async () => {
    const chain = healthyChain().setCall(WETH, SEL.decimals, enc.uint8(6));
    const r = await evaluateCanaryReadiness(chain, healthyConfig());
    expect(r.failed).toContain("weth-token");
  });

  it("stale feed", async () => {
    const chain = healthyChain().setCall(
      NVDA_USD_FEED,
      SEL.latestRoundData,
      enc.round(10n, 200_000_000_000n, BigInt(NOW - 1000), 10n),
    );
    const r = await evaluateCanaryReadiness(chain, healthyConfig());
    expect(r.failed).toContain("nvda-usd-feed-fresh");
  });

  it("non-positive feed answer", async () => {
    const chain = healthyChain().setCall(
      ETH_USD_FEED,
      SEL.latestRoundData,
      enc.round(10n, 0n, BigInt(NOW - 60), 10n),
    );
    const r = await evaluateCanaryReadiness(chain, healthyConfig());
    expect(r.failed).toContain("eth-usd-feed-answer");
  });

  it("incomplete round", async () => {
    const chain = healthyChain().setCall(
      ETH_USD_FEED,
      SEL.latestRoundData,
      enc.round(10n, 200_000_000_000n, BigInt(NOW - 60), 9n),
    );
    const r = await evaluateCanaryReadiness(chain, healthyConfig());
    expect(r.failed).toContain("eth-usd-feed-round");
  });

  it("wrong feed description", async () => {
    const chain = healthyChain().setCall(ETH_USD_FEED, SEL.description, enc.string("WRONG / USD"));
    const r = await evaluateCanaryReadiness(chain, healthyConfig());
    expect(r.failed).toContain("eth-usd-feed-description");
  });

  it("stock oracle globally paused", async () => {
    const chain = healthyChain().setCall(NVDA, SEL.oraclePaused, enc.bool(true));
    const r = await evaluateCanaryReadiness(chain, healthyConfig());
    expect(r.failed).toContain("nvda-oracle-not-paused");
  });

  it("controller has no code (EOA)", async () => {
    const chain = healthyChain().setCode(CONTROLLER, "0x");
    const r = await evaluateCanaryReadiness(chain, healthyConfig());
    expect(r.failed).toContain("controller");
  });

  it("cap above the canary ceiling", async () => {
    const r = await evaluateCanaryReadiness(healthyChain(), {
      ...healthyConfig(),
      canaryCapWei: 1_000_000_000_000_001n,
    });
    expect(r.failed).toContain("canary-cap");
  });

  it("feed age above the ceiling", async () => {
    const r = await evaluateCanaryReadiness(healthyChain(), {
      ...healthyConfig(),
      maxNvdaFeedAgeSec: 901,
    });
    expect(r.failed).toContain("feed-age-policy");
  });

  it("deployed executor left unpaused unlocks execution => NOT ready", async () => {
    const executor = "0x3333333333333333333333333333333333333333" as Hex;
    const chain = healthyChain()
      .setCode(executor, "0xff")
      .setCall(executor, SEL.paused, enc.bool(false));
    const r = await evaluateCanaryReadiness(chain, { ...healthyConfig(), executor });
    expect(r.status).toBe("CANARY_NOT_READY");
    expect(r.executionLocked).toBe(false);
    expect(r.failed).toContain("execution-locked");
  });

  it("QEX-1 not consumed", async () => {
    const r = await evaluateCanaryReadiness(healthyChain(), {
      ...healthyConfig(),
      qex1Consumed: false,
    });
    expect(r.failed).toContain("qex1-consumed");
  });
});

describe("network tripwire — the core touches no network of its own", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("completes with fetch replaced by a throwing tripwire", async () => {
    globalThis.fetch = (() => {
      throw new Error("TRIPWIRE: the canary preflight core must not use the network directly");
    }) as typeof fetch;
    const r = await evaluateCanaryReadiness(healthyChain(), healthyConfig());
    expect(r.status).toBe("CANARY_BUILD_READY_EXECUTION_LOCKED");
  });
});

describe("formatCanaryReport", () => {
  it("renders a secret-free report ending in the status token", async () => {
    const r = await evaluateCanaryReadiness(healthyChain(), healthyConfig());
    const text = formatCanaryReport(r);
    expect(text).toContain("STATUS: CANARY_BUILD_READY_EXECUTION_LOCKED");
    expect(text).not.toMatch(/0x[0-9a-fA-F]{64,}/); // no long hex blobs / calldata
  });
});
