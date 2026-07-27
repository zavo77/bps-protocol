import { describe, expect, it } from "vitest";
import { decodeFunctionData, getAddress } from "viem";
import { buildCollectFeesTx } from "./index";

const POOL_ID = `0x${"cd".repeat(32)}` as `0x${string}`;
// DopplerHookInitializer on 4663.
const INITIALIZER = getAddress("0x4e3468951D49f2EEa976eD0D6e75fFCb44a9a544");

describe("buildCollectFeesTx", () => {
  it("targets the DopplerHookInitializer with collectFees(poolId)", () => {
    const tx = buildCollectFeesTx(POOL_ID);
    expect(tx.to).toBe(INITIALIZER);
    expect(tx.value).toBe("0");
    const decoded = decodeFunctionData({
      abi: [
        {
          type: "function",
          name: "collectFees",
          stateMutability: "nonpayable",
          inputs: [{ name: "poolId", type: "bytes32" }],
          outputs: [
            { name: "fees0", type: "uint128" },
            { name: "fees1", type: "uint128" },
          ],
        },
      ] as const,
      data: tx.data,
    });
    expect(decoded.functionName).toBe("collectFees");
    expect(decoded.args[0]).toBe(POOL_ID);
  });
});
