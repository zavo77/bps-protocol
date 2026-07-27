import { afterEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { quoteRialto } from "./rialto";

const GOOGL = getAddress("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3");
const USDG = getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
const NATIVE = getAddress("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
const ROUTER = getAddress("0xc94135b6f9c4e3a3c0d0f3d3f3d3f3d3f3d3f359");
const TXTO = getAddress("0x3333333333333333333333333333333333333333");

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

/** Capture the request URL(s) so we can assert the human-decimal sell_amount. */
function stub(body: unknown, ok = true) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return { ok, json: async () => body };
    }),
  );
  return urls;
}

const okBody = {
  chain_id: 4663,
  settlement: "allowance",
  buy_amount: "1000000000000000000",
  min_buy_amount: "995000000000000000",
  platform_fee: { total_bps: 5 },
  route: { legs: [{}, {}] },
  tx: { to: TXTO, data: "0xdeadbeef", value: "0" },
  issues: { allowance: { spender: ROUTER } },
};

const base = {
  sellToken: USDG,
  sellDecimals: 6,
  buyToken: GOOGL,
  sellAmountWei: 5_000_000n, // 5 USDG (6dp)
  taker: TXTO,
  slippageBps: 100,
};

describe("quoteRialto", () => {
  it("returns null when RIALTO_API_KEY is unset (no route is not a failure)", async () => {
    delete process.env.RIALTO_API_KEY;
    expect(await quoteRialto(base)).toBeNull();
  });

  it("converts sellAmountWei to a human-decimal sell_amount and returns the router spender", async () => {
    process.env.RIALTO_API_KEY = "test-key";
    const urls = stub(okBody);
    const q = await quoteRialto(base);
    expect(urls[0]).toContain("sell_amount=5"); // 5_000_000 / 10^6 == 5
    expect(urls[0]).toContain("chain_id=4663");
    expect(urls[0]).toContain("settlement=allowance");
    expect(q?.venue).toBe("rialto");
    expect(q?.allowanceTarget).toBe(ROUTER); // exactly issues.allowance.spender
    expect(q?.transactionTarget).toBe(TXTO);
    expect(q?.buyAmountWei).toBe("1000000000000000000");
    expect(q?.minBuyAmountWei).toBe("995000000000000000");
    expect(q?.platformFeeBps).toBe(5);
    expect(q?.settlement).toBe("allowance");
    expect(q?.routeLegCount).toBe(2);
  });

  it("native-ETH sell returns no allowance target (no approval needed)", async () => {
    process.env.RIALTO_API_KEY = "test-key";
    stub({ ...okBody, issues: { allowance: null } });
    const q = await quoteRialto({
      ...base,
      sellToken: NATIVE,
      sellDecimals: 18,
      sellAmountWei: 10n ** 18n,
    });
    expect(q?.allowanceTarget).toBeNull();
  });

  it("rejects a quote that is not on chain 4663", async () => {
    process.env.RIALTO_API_KEY = "test-key";
    stub({ ...okBody, chain_id: 1 });
    expect(await quoteRialto(base)).toBeNull();
  });

  it("rejects a settlement mode other than allowance", async () => {
    process.env.RIALTO_API_KEY = "test-key";
    stub({ ...okBody, settlement: "permit2" });
    expect(await quoteRialto(base)).toBeNull();
  });

  it("fails closed on an ERC-20 sell with no allowance spender", async () => {
    process.env.RIALTO_API_KEY = "test-key";
    stub({ ...okBody, issues: { allowance: null } }); // ERC-20 but no spender
    expect(await quoteRialto(base)).toBeNull();
  });

  it("returns null when the response is missing tx/amounts", async () => {
    process.env.RIALTO_API_KEY = "test-key";
    stub({ chain_id: 4663, settlement: "allowance" });
    expect(await quoteRialto(base)).toBeNull();
  });

  it("returns null on a non-OK HTTP status", async () => {
    process.env.RIALTO_API_KEY = "test-key";
    stub(okBody, false);
    expect(await quoteRialto(base)).toBeNull();
  });
});
