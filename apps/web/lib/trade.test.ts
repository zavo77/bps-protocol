import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import { bpsTradeRouterAbi } from "./abis";
import { LOCAL_DEMO_MANIFEST } from "./fixtures";
import { enableWrites, resolveDeployment, type DeploymentState } from "./manifest";
import { assertOfficialRoute, buildTradePreview, tradeSubmissionGate } from "./trade";

const RECIPIENT = "0x000000000000000000000000000000000000c0DE" as const;

function live(writable: boolean): DeploymentState {
  const s = resolveDeployment({
    ...LOCAL_DEMO_MANIFEST,
    isFixture: false,
    mode: "restricted-beta",
    sourceCommit: "abc",
  });
  if (s.status !== "live") throw new Error("expected live");
  if (!writable) return s;
  const code = Object.fromEntries(s.requiredCodeAddresses.map((a) => [a.toLowerCase(), true]));
  return enableWrites(s, code);
}

describe("official trade model (§C)", () => {
  it("buy preview: exact allowance, router target, 2/1/3 allocation, decodable calldata", () => {
    const dep = live(true);
    const p = buildTradePreview(
      {
        direction: "buy",
        amountIn: 1000n * 10n ** 18n,
        expectedUserOut: 500n * 10n ** 18n,
        slippageBps: 100,
        recipient: RECIPIENT,
        nowSec: 1000n,
        ttlSec: 600n,
        poolFee: 3000,
      },
      dep,
    );
    if (dep.status !== "live") throw new Error();
    expect(p.target.toLowerCase()).toBe(dep.addresses.tradeRouter.toLowerCase());
    expect(p.allowanceToken).toBe("WETH");
    expect(p.allowanceAmount).toBe(1000n * 10n ** 18n); // EXACT, not unlimited
    expect(p.stockAcquisitionFunding).toBe(20n * 10n ** 18n);
    expect(p.bpsBurnComponent).toBe(10n * 10n ** 18n);
    expect(p.totalProtocolBps).toBe(300n);
    expect(p.deadline).toBe(1600n);
    expect(p.minUserOut).toBe((500n * 10n ** 18n * 9900n) / 10000n);
    const decoded = decodeFunctionData({ abi: bpsTradeRouterAbi, data: p.calldata });
    expect(decoded.functionName).toBe("buyExactWethForBps");
  });

  it("sell preview computes allocation from actual WETH proceeds", () => {
    const dep = live(true);
    const p = buildTradePreview(
      {
        direction: "sell",
        amountIn: 100n * 10n ** 18n,
        expectedUserOut: 192n * 10n ** 18n,
        expectedWethProceeds: 200n * 10n ** 18n,
        slippageBps: 50,
        recipient: RECIPIENT,
        nowSec: 1000n,
        ttlSec: 300n,
      },
      dep,
    );
    expect(p.allowanceToken).toBe("BPS");
    expect(p.stockAcquisitionFunding).toBe(4n * 10n ** 18n);
    expect(p.bpsBurnComponent).toBe(4n * 10n ** 18n);
    expect(p.totalProtocolBps).toBe(400n);
  });

  it("refuses to build a preview without a live deployment", () => {
    const notLive = resolveDeployment({ ...LOCAL_DEMO_MANIFEST, broadcastReady: false });
    expect(() =>
      buildTradePreview(
        {
          direction: "buy",
          amountIn: 1n,
          expectedUserOut: 1n,
          slippageBps: 0,
          recipient: RECIPIENT,
          nowSec: 1n,
          ttlSec: 1n,
        },
        notLive,
      ),
    ).toThrow();
  });

  it("assertOfficialRoute rejects a non-router target (e.g. SwapRouter02)", () => {
    const dep = live(true);
    expect(() => assertOfficialRoute("0xCaf681a66D020601342297493863E78C959E5cb2", dep)).toThrow(
      /BPSTradeRouter/,
    );
  });

  it("submission gate fails closed on each missing condition", () => {
    const base = {
      deployment: live(true),
      eligible: true,
      simulationOk: true,
      quoteFresh: true,
      nowSec: 1000n,
      deadline: 2000n,
      manifestSourceCommit: "abc",
      quoteSourceCommit: "abc",
    };
    expect(tradeSubmissionGate(base).canSubmit).toBe(true);
    expect(tradeSubmissionGate({ ...base, deployment: live(false) }).canSubmit).toBe(false);
    expect(tradeSubmissionGate({ ...base, eligible: false }).canSubmit).toBe(false);
    expect(tradeSubmissionGate({ ...base, simulationOk: false }).canSubmit).toBe(false);
    expect(tradeSubmissionGate({ ...base, quoteFresh: false }).canSubmit).toBe(false);
    expect(tradeSubmissionGate({ ...base, deadline: 500n }).canSubmit).toBe(false);
    expect(tradeSubmissionGate({ ...base, quoteSourceCommit: "zzz" }).canSubmit).toBe(false);
  });
});
