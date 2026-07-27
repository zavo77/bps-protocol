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

const base = {
  sellToken: GOOGL,
  buyToken: TOKEN,
  sellAmountWei: 10n ** 18n,
  taker: TOKEN,
  slippageBps: 100,
};

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
  });

  it("uses the returned spender even when it equals the tx target (0x v2 allowance-holder)", async () => {
    // In the allowance-holder flow the AllowanceHolder is BOTH the approval
    // spender and the transaction target — this is correct, not a Settler
    // approval. We approve exactly issues.allowance.spender.
    process.env.ZEROX_API_KEY = "test-key";
    const HOLDER = getAddress("0x0000000000001fF3684f28c67538d4D072C22734");
    stub({
      buyAmount: "600",
      transaction: { to: HOLDER, data: "0xabcd", value: "0" },
      issues: { allowance: { spender: HOLDER } },
      liquidityAvailable: true,
    });
    const q = await quoteZeroExRoute(base);
    expect(q?.allowanceTarget).toBe(HOLDER);
    expect(q?.transactionTarget).toBe(HOLDER);
  });

  it("native-ETH sell returns no allowance target (no approval needed)", async () => {
    process.env.ZEROX_API_KEY = "test-key";
    stub({
      buyAmount: "600",
      transaction: {
        to: getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"),
        data: "0x1234",
        value: "0",
      },
      issues: { allowance: null },
      liquidityAvailable: true,
    });
    const q = await quoteZeroExRoute(base);
    expect(q?.allowanceTarget).toBeNull();
  });

  it("returns null when 0x reports no liquidity", async () => {
    process.env.ZEROX_API_KEY = "test-key";
    stub({ liquidityAvailable: false });
    expect(await quoteZeroExRoute(base)).toBeNull();
  });
});
