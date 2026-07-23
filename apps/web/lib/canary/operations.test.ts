import { describe, expect, it } from "vitest";
import {
  assertCanarySeparation,
  canaryBlockReason,
  enforceCanaryBuyCap,
  enforceCanaryLpCap,
  enforceCanarySellCap,
  prepareCanaryAction,
  requireCanaryChain,
  selectCanaryContract,
} from "./operations";
import { OPERATIONAL_USD_CEILINGS, enableCanaryWrites, resolveCanary } from "./manifest";
import { DEFAULT_CANARY_MANIFEST } from "./manifest.data";

const CANARY = {
  canaryToken: "0x00000000000000000000000000000000000c0001",
  lockingVault: "0x00000000000000000000000000000000000c0002",
  claimManager: "0x00000000000000000000000000000000000c0003",
  stockVault: "0x00000000000000000000000000000000000c0004",
  coordinator: "0x00000000000000000000000000000000000c0005",
  tradeRouter: "0x00000000000000000000000000000000000c0006",
};
// Stand-in for canonical/demo production addresses the canary must never touch.
const CANONICAL = ["0x00000000000000000000000000000000000B0001"];

function readyState() {
  const s = resolveCanary({
    ...DEFAULT_CANARY_MANIFEST,
    broadcastReady: true,
    liveWritesApproved: true,
    actual: { ...CANARY },
    capitalCaps: {
      ...DEFAULT_CANARY_MANIFEST.capitalCaps,
      lpWethMaxWei: "52144170000000000",
      individualTradeWethMaxWei: "1042883000000000",
    },
  });
  const code = Object.fromEntries(Object.values(CANARY).map((a) => [a.toLowerCase(), true]));
  return enableCanaryWrites(s, code);
}

const NOT_APPROVED = resolveCanary(DEFAULT_CANARY_MANIFEST); // committed default: fail-closed

describe("canary operations router (Task 10B-2)", () => {
  it("provider-derived chain gate: fail closed unless 4663", () => {
    expect(requireCanaryChain(4663).ok).toBe(true);
    expect(requireCanaryChain(1).ok).toBe(false);
    expect(requireCanaryChain(null).ok).toBe(false);
  });

  it("every tx-prep path is BLOCKED while writes are disabled (committed default manifest)", () => {
    for (const key of [
      "tradeRouter",
      "lockingVault",
      "claimManager",
      "stockVault",
      "coordinator",
      "canaryToken",
    ] as const) {
      expect(selectCanaryContract(NOT_APPROVED, key).ok).toBe(false);
      expect(prepareCanaryAction(NOT_APPROVED, 4663, key).ok).toBe(false);
    }
    expect(canaryBlockReason(NOT_APPROVED, 4663)).toMatch(/not-approved/);
  });

  it("each tx path selects the CANARY address once a fully valid manifest is supplied (chain 4663)", () => {
    const s = readyState();
    const r = prepareCanaryAction(s, 4663, "tradeRouter");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.target).toBe(CANARY.tradeRouter);
    expect(selectCanaryContract(s, "lockingVault")).toMatchObject({
      ok: true,
      value: CANARY.lockingVault,
    });
    // Wrong chain still blocks even when ready.
    expect(prepareCanaryAction(s, 1, "tradeRouter").ok).toBe(false);
  });

  it("canary mode cannot read/write canonical BPS contracts (only manifest addresses ever selected)", () => {
    const s = readyState();
    const selected = Object.values(CANARY);
    for (const key of [
      "tradeRouter",
      "lockingVault",
      "claimManager",
      "stockVault",
      "coordinator",
    ] as const) {
      const r = selectCanaryContract(s, key);
      expect(r.ok && selected.includes(r.value)).toBe(true);
      expect(r.ok && CANONICAL.includes(r.value)).toBe(false);
    }
    // A manifest whose address overlaps a canonical address is rejected.
    expect(() => assertCanarySeparation(s, [CANARY.tradeRouter])).toThrow(/collides/);
    expect(() => assertCanarySeparation(s, CANONICAL)).not.toThrow();
  });

  it("production mode cannot select BPSC-TEST contracts (separation is symmetric)", () => {
    // The production (demo) address set and the canary set must be disjoint; overlap throws either way.
    expect(() => assertCanarySeparation(readyState(), CANONICAL)).not.toThrow();
    expect(() => assertCanarySeparation(readyState(), [CANARY.coordinator])).toThrow(/collides/);
  });

  it("fixture data cannot appear as live canary state", () => {
    const s = resolveCanary({
      ...DEFAULT_CANARY_MANIFEST,
      broadcastReady: true,
      liveWritesApproved: true,
      isFixture: true,
    });
    expect(s.status).toBe("invalid");
    expect(selectCanaryContract(s, "tradeRouter").ok).toBe(false);
  });

  it("sells use the AUTHORITATIVE simulated WETH output for the $2 cap; buys use gross WETH input", () => {
    const s = readyState();
    // cap = 1042883000000000 wei
    expect(enforceCanarySellCap(s, 1_000_000_000_000_000n).ok).toBe(true);
    expect(enforceCanarySellCap(s, 2_000_000_000_000_000n).ok).toBe(false); // simulated proceeds exceed cap
    expect(enforceCanaryBuyCap(s, 1_042_883_000_000_000n).ok).toBe(true);
    expect(enforceCanaryBuyCap(s, 1_042_883_000_000_001n).ok).toBe(false);
    // Not-approved always blocks.
    expect(enforceCanarySellCap(NOT_APPROVED, 1n).ok).toBe(false);
  });

  it("LP cap enforced from the $100 WETH cap", () => {
    const s = readyState();
    expect(enforceCanaryLpCap(s, 52_144_170_000_000_000n).ok).toBe(true);
    expect(enforceCanaryLpCap(s, 52_144_170_000_000_001n).ok).toBe(false);
    expect(enforceCanaryLpCap(NOT_APPROVED, 1n).ok).toBe(false);
  });

  it("aggregate operational limits remain $100 LP / $2 trade / $20 controlled / $10 gas / $130 total", () => {
    expect(OPERATIONAL_USD_CEILINGS).toEqual({
      lpWethMaxUsd: 100,
      individualTradeMaxUsd: 2,
      controlledTradesMaxUsd: 20,
      gasMaxUsd: 10,
      aggregateMaxUsd: 130,
    });
  });
});
