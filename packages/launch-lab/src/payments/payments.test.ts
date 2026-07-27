import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { PAYMENT_TOKENS, NATIVE_ETH, getPaymentToken } from "./index";

describe("payment tokens", () => {
  it("exposes ETH / WETH / USDG with verified addresses + decimals", () => {
    const byS = Object.fromEntries(PAYMENT_TOKENS.map((t) => [t.symbol, t]));
    expect(byS.ETH.native).toBe(true);
    expect(byS.ETH.address).toBe(NATIVE_ETH);
    expect(byS.WETH.address).toBe(getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"));
    expect(byS.WETH.decimals).toBe(18);
    // USDG is 6-decimal "Global Dollar" (verified on-chain 2026-07-27).
    expect(byS.USDG.address).toBe(getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"));
    expect(byS.USDG.decimals).toBe(6);
  });

  it("resolves by symbol and address, case-insensitively", () => {
    expect(getPaymentToken("weth")?.symbol).toBe("WETH");
    expect(getPaymentToken("0x5fc5360d0400a0fd4f2af552add042d716f1d168")?.symbol).toBe("USDG");
    expect(getPaymentToken("0xdeadbeef")).toBeNull();
  });
});
