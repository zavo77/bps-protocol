import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sanitizePending,
  savePendingTrade,
  loadPendingTrade,
  clearPendingTrade,
  isQuoteExpired,
  resumePrompt,
  type PendingComposedTrade,
} from "../../../hooks/lab/trade-recovery";

const WALLET = "0x29244A2309B703F82E292A3db7df0e95d0cdca72";
const base: PendingComposedTrade = {
  v: 1,
  side: "buy",
  marketToken: "0x1F212fccea9995931f4f2F9CA0C8b641188Ca196",
  marketSymbol: "PRINT",
  anchorSymbol: "NVDA",
  anchorAddress: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
  paymentSymbol: "ETH",
  paymentAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  completedLegTxHash: `0x${"ab".repeat(32)}`,
  actualReceivedAnchorWei: "123456789000000000",
  pendingLegNumber: 2,
  quoteExpiry: Date.now() + 60_000,
  createdAt: Date.now(),
};

// jsdom provides localStorage in the dom project; guard for node runs.
const hasStorage = typeof globalThis.localStorage !== "undefined";

beforeEach(() => {
  if (hasStorage) globalThis.localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("sanitizePending — only non-secret public state", () => {
  it("accepts a valid record", () => {
    expect(sanitizePending({ ...base } as unknown as Record<string, unknown>)).not.toBeNull();
  });

  it("rejects any record carrying signature/calldata/data/envelope", () => {
    for (const bad of ["signature", "calldata", "data", "envelope", "sig", "secret"]) {
      const tampered = { ...base, [bad]: "0xdeadbeef" } as unknown as Record<string, unknown>;
      expect(sanitizePending(tampered), `must reject ${bad}`).toBeNull();
    }
  });

  it("drops unknown keys and rejects malformed core fields", () => {
    expect(sanitizePending({ ...base, marketToken: "0x123" } as never)).toBeNull();
    expect(sanitizePending({ ...base, completedLegTxHash: "0xshort" } as never)).toBeNull();
    expect(sanitizePending({ ...base, pendingLegNumber: 1 } as never)).toBeNull();
    // a valid record round-trips to exactly the allow-listed keys
    const clean = sanitizePending({ ...base, junk: 1 } as never)!;
    expect(Object.keys(clean)).not.toContain("junk");
  });
});

describe("expiry forces a fresh second-leg quote", () => {
  it("isQuoteExpired true once past quoteExpiry", () => {
    expect(isQuoteExpired(base, base.quoteExpiry - 1)).toBe(false);
    expect(isQuoteExpired(base, base.quoteExpiry + 1)).toBe(true);
  });
});

describe("resume prompt copy", () => {
  it("buy → 'Trade partially completed' / 'Continue buying …'", () => {
    const p = resumePrompt(base);
    expect(p.heading).toBe("Trade partially completed");
    expect(p.action).toBe("Continue buying PRINT");
  });
  it("sell → 'Sale partially completed' / 'Continue converting ANCHOR to PAY'", () => {
    const p = resumePrompt({ ...base, side: "sell", paymentSymbol: "USDG" });
    expect(p.heading).toBe("Sale partially completed");
    expect(p.action).toBe("Continue converting NVDA to USDG");
  });
});

describe.runIf(hasStorage)("persistence round-trip (jsdom)", () => {
  it("saves and loads a pending trade; simulates a refresh via a fresh load", () => {
    savePendingTrade(WALLET, base);
    const loaded = loadPendingTrade(WALLET, base.marketToken);
    expect(loaded?.actualReceivedAnchorWei).toBe(base.actualReceivedAnchorWei);
    expect(loaded?.pendingLegNumber).toBe(2);
  });
  it("cancel clears the pending trade (user keeps the anchor)", () => {
    savePendingTrade(WALLET, base);
    clearPendingTrade(WALLET, base.marketToken);
    expect(loadPendingTrade(WALLET, base.marketToken)).toBeNull();
  });
  it("a persisted blob containing calldata is refused on load", () => {
    globalThis.localStorage.setItem(
      `bps.lab.pendingTrade.${WALLET.toLowerCase()}.${base.marketToken.toLowerCase()}`,
      JSON.stringify({ ...base, calldata: "0xdeadbeef" }),
    );
    expect(loadPendingTrade(WALLET, base.marketToken)).toBeNull();
  });
});
