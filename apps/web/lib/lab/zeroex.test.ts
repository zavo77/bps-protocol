import { afterEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { quoteZeroExRoute } from "./zeroex";

const GOOGL = getAddress("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3");
const TOKEN = getAddress("0x1F212fccea9995931f4f2F9CA0C8b641188Ca196");
const SETTLER = getAddress("0x1111111111111111111111111111111111111111");
const ALLOWANCE_HOLDER = getAddress("0x2222222222222222222222222222222222222222");

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

function stub(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => body })),
  );
}

const base = { sellToken: GOOGL, buyToken: TOKEN, sellAmountWei: 10n ** 18n, taker: TOKEN, slippageBps: 100 };

describe("quoteZeroExRoute", () => {
  it("returns null when ZEROX_API_KEY is unset (no route is not a failure)", async () => {
    delete process.env.ZEROX_API_KEY;
    expect(await quoteZeroExRoute(base)).toBeNull();
  });

  it("takes the allowance spender from the 0x response, never the Settler", async () => {
    process.env.ZEROX_API_KEY = "test-key";
    stub({
      buyAmount: "600",
      minBuyAmount: "594",
      transaction: { to: SETTLER, data: "0xabcd", value: "0", gas: "450000" },
      issues: { allowance: { spender: ALLOWANCE_HOLDER } },
      liquidityAvailable: true,
    });
    const q = await quoteZeroExRoute(base);
    expect(q?.routeId).toBe("zeroEx");
    expect(q?.allowanceTarget).toBe(ALLOWANCE_HOLDER);
    expect(q?.transactionTarget).toBe(SETTLER);
    expect(q?.allowanceTarget).not.toBe(q?.transactionTarget);
  });

  it("rejects a quote whose allowance target equals the transaction target (Settler-approval guard)", async () => {
    process.env.ZEROX_API_KEY = "test-key";
    stub({
      buyAmount: "600",
      transaction: { to: SETTLER, data: "0xabcd", value: "0" },
      issues: { allowance: { spender: SETTLER } },
      liquidityAvailable: true,
    });
    expect(await quoteZeroExRoute(base)).toBeNull();
  });

  it("returns null when 0x reports no liquidity", async () => {
    process.env.ZEROX_API_KEY = "test-key";
    stub({ liquidityAvailable: false });
    expect(await quoteZeroExRoute(base)).toBeNull();
  });
});
