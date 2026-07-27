import { describe, expect, it } from "vitest";
import { decodeFunctionData, getAddress } from "viem";
import {
  buildSwapTransaction,
  directionToZeroForOne,
  minAmountOut,
  PRICE_IMPACT_REJECT_BPS,
  type LabPoolContext,
  type SwapQuote,
} from "./index";
import { GOOGL_ADDRESS } from "../config/index";

const TOKEN = getAddress("0x1F212fccea9995931f4f2F9CA0C8b641188Ca196");
const HOOK = getAddress("0x9982538F41f2ae29ddb9d3D9307010052984FDbB");
const UR = getAddress("0x8876789976DECBFCBBBe364623C63652db8C0904");
const PERMIT2 = getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3");

/** Two contexts differing only in token ordering. */
function ctx(googlIsCurrency0: boolean): LabPoolContext {
  const currency0 = googlIsCurrency0 ? GOOGL_ADDRESS : TOKEN;
  const currency1 = googlIsCurrency0 ? TOKEN : GOOGL_ADDRESS;
  return {
    poolKey: { currency0, currency1, fee: 10_000, tickSpacing: 200, hooks: HOOK },
    poolId: `0x${"ab".repeat(32)}`,
    status: 2,
    googlIsCurrency0,
    universalRouter: UR,
    permit2: PERMIT2,
  };
}

function quote(direction: "buy" | "sell", googlIsCurrency0: boolean): SwapQuote {
  return {
    direction,
    amountInWei: "1000000000000000000",
    amountOutWei: "500000000000000000",
    gasEstimate: "400000",
    zeroForOne: directionToZeroForOne(direction, googlIsCurrency0),
    poolKey: ctx(googlIsCurrency0).poolKey,
    quotedAt: Date.now(),
  };
}

describe("token ordering", () => {
  it("buy is GOOGL->token; direction flips with pool ordering", () => {
    expect(directionToZeroForOne("buy", true)).toBe(true); // GOOGL is c0 → zeroForOne
    expect(directionToZeroForOne("buy", false)).toBe(false); // GOOGL is c1
    expect(directionToZeroForOne("sell", true)).toBe(false);
    expect(directionToZeroForOne("sell", false)).toBe(true);
  });

  it("input/output currency follow the resolved ordering, not an assumption", () => {
    // GOOGL is currency0: a buy spends GOOGL (currency0), receives token.
    const buyG0 = buildSwapTransaction({ ctx: ctx(true), quote: quote("buy", true), slippageBps: 100 });
    expect(buyG0.inputCurrency).toBe(GOOGL_ADDRESS);
    expect(buyG0.outputCurrency).toBe(TOKEN);
    // GOOGL is currency1: a buy still spends GOOGL (now currency1).
    const buyG1 = buildSwapTransaction({ ctx: ctx(false), quote: quote("buy", false), slippageBps: 100 });
    expect(buyG1.inputCurrency).toBe(GOOGL_ADDRESS);
    expect(buyG1.outputCurrency).toBe(TOKEN);
    // A sell spends the token in both orderings.
    const sell = buildSwapTransaction({ ctx: ctx(true), quote: quote("sell", true), slippageBps: 100 });
    expect(sell.inputCurrency).toBe(TOKEN);
    expect(sell.outputCurrency).toBe(GOOGL_ADDRESS);
  });
});

describe("slippage / minimum output", () => {
  it("applies bps correctly and rejects out-of-range", () => {
    expect(minAmountOut(1_000_000n, 100)).toBe(990_000n); // 1%
    expect(minAmountOut(1_000_000n, 50)).toBe(995_000n); // 0.5%
    expect(() => minAmountOut(1n, -1)).toThrow();
    expect(() => minAmountOut(1n, 6_000)).toThrow();
  });
  it("build embeds the min-out and targets the Universal Router", () => {
    const tx = buildSwapTransaction({ ctx: ctx(true), quote: quote("buy", true), slippageBps: 300 });
    expect(tx.to).toBe(UR);
    expect(tx.minAmountOutWei).toBe("485000000000000000"); // 500e15 * 0.97
    const decoded = decodeFunctionData({
      abi: [
        {
          type: "function",
          name: "execute",
          stateMutability: "payable",
          inputs: [
            { name: "commands", type: "bytes" },
            { name: "inputs", type: "bytes[]" },
            { name: "deadline", type: "uint256" },
          ],
          outputs: [],
        },
      ] as const,
      data: tx.data,
    });
    expect(decoded.functionName).toBe("execute");
    expect(decoded.args[0]).toBe("0x10"); // V4_SWAP command
  });
});

describe("approval targets", () => {
  it("direct route approves via Permit2", () => {
    expect(ctx(true).permit2).toBe(PERMIT2);
  });
});

describe("safety constants", () => {
  it("reject ceiling is 15%", () => {
    expect(PRICE_IMPACT_REJECT_BPS).toBe(1_500);
  });
});
