import { describe, expect, it } from "vitest";
import {
  CANARY_LABEL,
  CANARY_TOKEN_SYMBOL,
  assertNoCanonicalOverlap,
  canaryWritesAllowed,
  enableCanaryWrites,
  explorerAddressUrl,
  explorerTxUrl,
  resolveCanary,
  withinIndividualTradeCap,
  withinLpCap,
} from "./manifest";
import { DEFAULT_CANARY_MANIFEST } from "./manifest.data";

const REAL = {
  canaryToken: "0x00000000000000000000000000000000000c0001",
  lockingVault: "0x00000000000000000000000000000000000c0002",
  claimManager: "0x00000000000000000000000000000000000c0003",
  stockVault: "0x00000000000000000000000000000000000c0004",
  coordinator: "0x00000000000000000000000000000000000c0005",
  tradeRouter: "0x00000000000000000000000000000000000c0006",
};

function approvedManifest() {
  return {
    ...DEFAULT_CANARY_MANIFEST,
    broadcastReady: true,
    liveWritesApproved: true,
    actual: { ...REAL },
    capitalCaps: {
      ...DEFAULT_CANARY_MANIFEST.capitalCaps,
      lpWethMaxWei: "52144170000000000", // ~0.0521 WETH
      individualTradeWethMaxWei: "1042883000000000", // ~$2 in WETH
    },
  };
}

describe("canary manifest (Task 10B-1, fail-closed)", () => {
  it("the persistent label + symbol constants are correct", () => {
    expect(CANARY_LABEL).toBe("BPSC-TEST — ROBINHOOD MAINNET CANARY — TEST ONLY");
    expect(CANARY_TOKEN_SYMBOL).toBe("BPSC-TEST");
  });

  it("the default committed manifest is not-approved (writes disabled)", () => {
    const s = resolveCanary(DEFAULT_CANARY_MANIFEST);
    expect(s.status).toBe("not-approved");
    expect(canaryWritesAllowed(s)).toBe(false);
  });

  it("missing/incorrect fields fail closed (invalid)", () => {
    expect(resolveCanary({}).status).toBe("invalid");
    expect(resolveCanary({ ...DEFAULT_CANARY_MANIFEST, canary: false }).status).toBe("invalid");
    expect(resolveCanary({ ...DEFAULT_CANARY_MANIFEST, production: true }).status).toBe("invalid");
  });

  it("incorrect chain fails closed", () => {
    expect(resolveCanary({ ...DEFAULT_CANARY_MANIFEST, chainId: 1 }).status).toBe("invalid");
  });

  it("wrong token symbol fails closed", () => {
    const bad = { ...DEFAULT_CANARY_MANIFEST, token: { name: "x", symbol: "BPS", decimals: 18 } };
    expect(resolveCanary(bad).status).toBe("invalid");
  });

  it("a fixture manifest can never be a live canary", () => {
    const s = resolveCanary({ ...approvedManifest(), isFixture: true });
    expect(s.status).toBe("invalid");
  });

  it("writes stay disabled without BOTH approval flags", () => {
    expect(resolveCanary({ ...approvedManifest(), broadcastReady: false }).status).toBe(
      "not-approved",
    );
    expect(resolveCanary({ ...approvedManifest(), liveWritesApproved: false }).status).toBe(
      "not-approved",
    );
  });

  it("approved manifest with null caps still fails closed", () => {
    const s = resolveCanary({
      ...approvedManifest(),
      capitalCaps: { ...approvedManifest().capitalCaps, individualTradeWethMaxWei: null },
    });
    expect(s.status).toBe("not-approved");
  });

  it("fully-approved manifest resolves ready, and writes enable only after code check", () => {
    const s = resolveCanary(approvedManifest());
    expect(s.status).toBe("ready");
    expect(canaryWritesAllowed(s)).toBe(false); // not until code confirmed
    const codePresent = Object.fromEntries(Object.values(REAL).map((a) => [a.toLowerCase(), true]));
    const enabled = enableCanaryWrites(s, codePresent);
    expect(canaryWritesAllowed(enabled)).toBe(true);
    // Missing code on one required contract keeps writes disabled.
    const missing = { ...codePresent, [REAL.tradeRouter.toLowerCase()]: false };
    expect(canaryWritesAllowed(enableCanaryWrites(s, missing))).toBe(false);
  });

  it("individual-trade WETH cap enforced from the quoted/simulated WETH result", () => {
    const s = resolveCanary(approvedManifest());
    expect(withinIndividualTradeCap(s, 1_000_000_000_000_000n)).toBe(true); // < cap
    expect(withinIndividualTradeCap(s, 2_000_000_000_000_000n)).toBe(false); // > cap
    expect(withinIndividualTradeCap(s, 0n)).toBe(false);
    // Not-approved state always blocks.
    expect(withinIndividualTradeCap(resolveCanary(DEFAULT_CANARY_MANIFEST), 1n)).toBe(false);
  });

  it("LP WETH cap enforced", () => {
    const s = resolveCanary(approvedManifest());
    expect(withinLpCap(s, 52_144_170_000_000_000n)).toBe(true);
    expect(withinLpCap(s, 52_144_170_000_000_001n)).toBe(false);
  });

  it("canary rejects canonical-address overlap; production rejects canary overlap (symmetric)", () => {
    const canary = Object.values(REAL);
    const canonical = ["0x00000000000000000000000000000000000B0001"]; // disjoint
    expect(() => assertNoCanonicalOverlap(canary, canonical)).not.toThrow();
    // Overlap either direction throws.
    expect(() => assertNoCanonicalOverlap(canary, [REAL.tradeRouter])).toThrow(/collides/);
    expect(() => assertNoCanonicalOverlap([canonical[0]!], [canonical[0]!])).toThrow(/collides/);
  });

  it("explorer links use the Robinhood Chain Blockscout domain", () => {
    expect(explorerTxUrl("0xabc")).toBe("https://robinhoodchain.blockscout.com/tx/0xabc");
    expect(explorerAddressUrl("0xdef")).toBe("https://robinhoodchain.blockscout.com/address/0xdef");
  });
});
