import { describe, expect, it } from "vitest";
import { createPublicClient, createWalletClient, encodeFunctionData, type Address } from "viem";
import { robinhoodChain } from "../chain";
import { bpsTradeRouterAbi } from "../abis";
import { mockTransport } from "../testing/mock-rpc";
import { DEMO_WETH, makeDemoState } from "../testing/local-env";
import { localTestAccount, LOCAL_TEST_ADDRESS } from "../testing/local-account";
import { LOCAL_DEMO_MANIFEST } from "../fixtures";
import { runActionLifecycle, type ActionRequest, type LifecycleStep } from "./tx";

const ROUTER = LOCAL_DEMO_MANIFEST.actual.tradeRouter as Address;

function clients(state = makeDemoState()) {
  const transport = mockTransport(state);
  return {
    pub: createPublicClient({ chain: robinhoodChain, transport }),
    wallet: createWalletClient({ account: localTestAccount, chain: robinhoodChain, transport }),
    account: localTestAccount,
  };
}

function buyReq(): ActionRequest {
  const data = encodeFunctionData({
    abi: bpsTradeRouterAbi,
    functionName: "buyExactWethForBps",
    args: [10n ** 18n, 1n, 0n, LOCAL_TEST_ADDRESS, 2_000_000_000n],
  });
  return {
    target: ROUTER,
    data,
    value: 0n,
    approval: { token: DEMO_WETH, spender: ROUTER, amount: 10n ** 18n },
    confirmations: 1,
  };
}

describe("transaction lifecycle (§E)", () => {
  it("runs approve -> simulate -> submit -> confirm with EXACT approval", async () => {
    const steps: LifecycleStep[] = [];
    const res = await runActionLifecycle(clients(), buyReq(), (s) => steps.push(s));
    expect(res.ok).toBe(true);
    expect(res.hash).toMatch(/^0x/);
    expect(steps).toContain("approve");
    expect(steps).toContain("simulate");
    expect(steps).toContain("submit");
    expect(steps).toContain("done");
  });

  it("fails closed on wrong chain", async () => {
    const res = await runActionLifecycle(clients(makeDemoState({ chainId: 1 })), buyReq());
    expect(res).toMatchObject({ ok: false, step: "validate", reason: "wrong-chain" });
  });

  it("fails on a reverting simulation before submitting", async () => {
    const res = await runActionLifecycle(
      clients(makeDemoState({ revertOnSimulate: true })),
      buyReq(),
    );
    expect(res.ok).toBe(false);
    expect(res.step).toBe("simulate");
  });

  it("surfaces wallet rejection at submit", async () => {
    // Pre-approve so we reach submit, then reject the send.
    const state = makeDemoState({ sendRejects: true });
    const me = LOCAL_TEST_ADDRESS.toLowerCase();
    state.erc20[DEMO_WETH.toLowerCase()]!.allowances[`${me}:${ROUTER.toLowerCase()}`] = 10n ** 18n;
    const res = await runActionLifecycle(clients(state), buyReq());
    expect(res).toMatchObject({ ok: false, step: "submit", reason: "user-rejected" });
  });

  it("skips approval when allowance already sufficient", async () => {
    const state = makeDemoState();
    const me = LOCAL_TEST_ADDRESS.toLowerCase();
    state.erc20[DEMO_WETH.toLowerCase()]!.allowances[`${me}:${ROUTER.toLowerCase()}`] = 10n ** 18n;
    const steps: LifecycleStep[] = [];
    const res = await runActionLifecycle(clients(state), buyReq(), (s) => steps.push(s));
    expect(res.ok).toBe(true);
    expect(steps).not.toContain("approve");
  });
});
