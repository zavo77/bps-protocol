import { afterEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { quoteOneInch } from "./oneinch";

const GOOGL = getAddress("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3");
const WETH = getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73");
const NATIVE = getAddress("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
const ROUTER = getAddress("0x5A705DE8982235a7fa45bB83dCaCf03a211389C7");

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

/** Branch on URL: /swap returns the swap body, /approve/spender returns the router. */
function stub(swapBody: unknown, opts?: { swapOk?: boolean; spender?: string | null }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/approve/spender")) {
        return {
          ok: opts?.spender !== null,
          json: async () => ({ address: opts?.spender ?? ROUTER }),
        };
      }
      return { ok: opts?.swapOk ?? true, json: async () => swapBody };
    }),
  );
}

const base = {
  sellToken: WETH,
  buyToken: GOOGL,
  sellAmountWei: 10n ** 18n,
  taker: GOOGL,
  slippageBps: 100,
};

const swapOk = {
  dstAmount: "1000000000000000000",
  tx: { to: ROUTER, data: "0xabcd", value: "0" },
};

describe("quoteOneInch", () => {
  it("returns null when ONEINCH_API_KEY is unset (dormant-but-ready)", async () => {
    delete process.env.ONEINCH_API_KEY;
    expect(await quoteOneInch(base)).toBeNull();
  });

  it("returns an executable quote with the router as approval target for an ERC-20 sell", async () => {
    process.env.ONEINCH_API_KEY = "test-key";
    stub(swapOk);
    const q = await quoteOneInch(base);
    expect(q?.venue).toBe("oneInch");
    expect(q?.buyAmountWei).toBe("1000000000000000000");
    // minOut = dstAmount * (10000-100)/10000
    expect(q?.minBuyAmountWei).toBe("990000000000000000");
    expect(q?.allowanceTarget).toBe(ROUTER);
    expect(q?.transactionTarget).toBe(ROUTER);
  });

  it("native-ETH sell needs no allowance target", async () => {
    process.env.ONEINCH_API_KEY = "test-key";
    stub(swapOk);
    const q = await quoteOneInch({ ...base, sellToken: NATIVE });
    expect(q?.allowanceTarget).toBeNull();
  });

  it("FAILS CLOSED when the spender endpoint yields no address (never approves tx.to)", async () => {
    // Hard rule: approve ONLY the venue-declared spender. If /approve/spender is
    // unavailable, there is no executable 1inch route — the chain falls through.
    process.env.ONEINCH_API_KEY = "test-key";
    stub(swapOk, { spender: null });
    expect(await quoteOneInch(base)).toBeNull();
  });

  it("returns null when 1inch has no route (swap not ok)", async () => {
    process.env.ONEINCH_API_KEY = "test-key";
    stub(swapOk, { swapOk: false });
    expect(await quoteOneInch(base)).toBeNull();
  });

  it("returns null when the swap payload is incomplete", async () => {
    process.env.ONEINCH_API_KEY = "test-key";
    stub({ dstAmount: "1" }); // no tx
    expect(await quoteOneInch(base)).toBeNull();
  });
});
