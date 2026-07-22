import { describe, expect, it } from "vitest";
import {
  EXCLUSION_CATEGORIES,
  independentlyVerifyWalletProofs,
  verifyAllocationsContentHash,
  verifyManifestEnvelope,
} from "@bps/shared";
import { runCanonicalCycle } from "./index.js";

const Z36 = "000000000000000000000000000000000000";
const W = {
  unlocked: `0x${Z36}1001`,
  d7: `0x${Z36}1007`,
  d14: `0x${Z36}1014`,
  d21: `0x${Z36}1021`,
  d30: `0x${Z36}1030`,
  sender: `0x${Z36}2001`,
  receiver: `0x${Z36}abcd`,
  ineligibleFalse: `0x${Z36}3001`,
  uniswapPool: `0x${Z36}9001`,
};

const SUPERSEDED_TERMS = [
  "ECON-1.0",
  "150 BPS",
  "50 BPS",
  "150/50",
  "stewardship",
  "2.98%",
  "3% sell",
  "5% sell",
];

function allocationWallets(alloc: Record<string, unknown>): Set<string> {
  const set = new Set<string>();
  for (const asset of alloc["assets"] as Array<Record<string, unknown>>) {
    for (const a of asset["allocations"] as Array<Record<string, unknown>>) {
      set.add(a["wallet"] as string);
    }
  }
  return set;
}

describe("canonical cycle pipeline (fixture end-to-end)", () => {
  const result = runCanonicalCycle();

  it("produces the canonical multiplier weights for the five real wallets (req 14)", () => {
    const eff = (w: string): bigint => result.weights.get(w)?.effectiveWeight ?? -1n;
    expect(eff(W.unlocked)).toBe(100_000n);
    expect(eff(W.d7)).toBe(110_000n);
    expect(eff(W.d14)).toBe(125_000n);
    expect(eff(W.d21)).toBe(150_000n);
    expect(eff(W.d30)).toBe(175_000n);
    expect(result.eligibility.totalEffectiveWeight).toBe(720_000n);
  });

  it("splits every asset 80/20 and conserves inventory (reqs 17, 22, 34)", () => {
    for (const a of result.allocation.assets) {
      expect(a.participantPool).toBe((a.acquired * 8_000n) / 10_000n);
      expect(a.strategicReserve).toBe(a.acquired - a.participantPool);
      expect(a.allocated + a.distributionDust).toBe(a.participantPool);
      expect(a.strategicReserve + a.allocated + a.distributionDust).toBe(a.acquired);
    }
  });

  it("keeps mixed-decimal assets independent (6, 8, 18) (req 21)", () => {
    const byDecimals = new Map(result.allocation.assets.map((a) => [a.asset.decimals, a]));
    expect([...byDecimals.keys()].sort((x, y) => x - y)).toEqual([6, 8, 18]);
    // Each pool derives only from its own acquired amount (no cross-asset normalization).
    expect(byDecimals.get(6)!.participantPool).toBe(800_000_000_000n);
    expect(byDecimals.get(8)!.participantPool).toBe(4_000_000_000n);
    expect(byDecimals.get(18)!.participantPool).toBe(800_000_000_000_000_000_000_000n);
  });

  it("produces visible rounding dust retained outside entitlements (req 20)", () => {
    const totalDust = result.allocation.assets.reduce((s, a) => s + a.distributionDust, 0n);
    expect(totalDust).toBeGreaterThan(0n);
  });

  it("excludes every exclusion category and the excluded/ineligible wallets (reqs 11, 12)", () => {
    const manifest = result.artifacts.manifest.object;
    const categories = new Set(
      (manifest["exclusions"] as Array<Record<string, unknown>>).map(
        (e) => e["category"] as string,
      ),
    );
    for (const c of EXCLUSION_CATEGORIES) expect(categories.has(c)).toBe(true);

    const wallets = allocationWallets(result.artifacts.allocations.object);
    // Eligible wallets present.
    for (const w of [W.unlocked, W.d7, W.d14, W.d21, W.d30, W.sender, W.receiver]) {
      expect(wallets.has(w)).toBe(true);
    }
    // An address that is eligible-but-excluded (Uniswap pool) receives nothing.
    expect(wallets.has(W.uniswapPool)).toBe(false);
    // An explicitly ineligible wallet receives nothing.
    expect(wallets.has(W.ineligibleFalse)).toBe(false);
  });

  it("satisfies reconciliation invariants with no executed claim (req 34)", () => {
    const recon = result.artifacts.reconciliation.object;
    for (const a of recon["assets"] as Array<Record<string, unknown>>) {
      const acquired = BigInt(a["acquired"] as string);
      const reserve = BigInt(a["strategicReserve"] as string);
      const allocated = BigInt(a["allocated"] as string);
      const dust = BigInt(a["distributionDust"] as string);
      expect(reserve + allocated + dust).toBe(acquired);
      expect(a["fundedRequired"]).toBe(a["allocated"]);
      expect(a["claimable"]).toBe(a["allocated"]);
      expect(a["unclaimed"]).toBe(a["allocated"]);
      expect(a["claimed"]).toBe("0");
      expect(a["claimExecuted"]).toBe(false);
    }
  });

  it("independently verifies every proof from the emitted bytes via viem (req 28)", () => {
    const check = independentlyVerifyWalletProofs(result.artifacts.walletProofs.object);
    expect(check.ok).toBe(true);
    expect(check.proofCount).toBe(21);
    expect(check.verified).toBe(21);
    expect(result.verification.allVerified).toBe(true);
  });

  it("verifies stable manifest envelope and allocations content hashes (req 31)", () => {
    expect(verifyManifestEnvelope(result.artifacts.manifest.object)).toBe(true);
    expect(
      verifyAllocationsContentHash(
        result.artifacts.manifest.object,
        result.artifacts.allocations.object,
      ),
    ).toBe(true);
    // Stable across an independent run.
    const again = runCanonicalCycle();
    expect(again.artifacts.manifest.object["allocationsContentHash"]).toBe(
      result.artifacts.manifest.object["allocationsContentHash"],
    );
    expect(again.artifacts.manifest.object["envelopeHash"]).toBe(
      result.artifacts.manifest.object["envelopeHash"],
    );
  });

  it("detects any committed manifest mutation via the envelope hash (req 32)", () => {
    const mutated = { ...result.artifacts.manifest.object, cycleId: "999" };
    expect(verifyManifestEnvelope(mutated)).toBe(false);
  });

  it("emits byte-for-byte identical artifacts across runs (req 33)", () => {
    const a = runCanonicalCycle().artifacts;
    const b = runCanonicalCycle().artifacts;
    expect(a.manifest.json).toBe(b.manifest.json);
    expect(a.allocations.json).toBe(b.allocations.json);
    expect(a.walletProofs.json).toBe(b.walletProofs.json);
    expect(a.reconciliation.json).toBe(b.reconciliation.json);
    // Artifacts end with exactly one LF and contain no CR.
    for (const art of [a.manifest, a.allocations, a.walletProofs, a.reconciliation]) {
      expect(art.json.endsWith("\n")).toBe(true);
      expect(art.json.endsWith("\n\n")).toBe(false);
      expect(art.json.includes("\r")).toBe(false);
    }
  });

  it("contains no superseded economics terminology in any artifact (req 35)", () => {
    const blob = [
      result.artifacts.manifest.json,
      result.artifacts.allocations.json,
      result.artifacts.walletProofs.json,
      result.artifacts.reconciliation.json,
    ]
      .join("\n")
      .toLowerCase();
    for (const term of SUPERSEDED_TERMS) {
      expect(blob.includes(term.toLowerCase())).toBe(false);
    }
    expect(result.fixture.cycle.economicsVersion).toBe("BPS-ECON-2.0");
  });
});
