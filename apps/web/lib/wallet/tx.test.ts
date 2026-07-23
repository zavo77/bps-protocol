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

  it("fails at reconcile when the confirmed state does not match (never success on hash alone)", async () => {
    const req = { ...buyReq(), reconcile: async () => false };
    const res = await runActionLifecycle(clients(), req);
    expect(res).toMatchObject({ ok: false, step: "reconcile", reason: "reconciliation-failed" });
    expect(res.hash).toMatch(/^0x/); // a hash existed, but success was NOT reported
  });

  it("succeeds when reconciliation passes", async () => {
    const req = { ...buyReq(), reconcile: async () => true };
    expect((await runActionLifecycle(clients(), req)).ok).toBe(true);
  });

  it("fails on a reverted receipt", async () => {
    const res = await runActionLifecycle(
      clients(makeDemoState({ receiptReverts: true })),
      buyReq(),
    );
    expect(res.ok).toBe(false);
    expect(["await-approval", "await-receipt"]).toContain(res.step);
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

  // ---- §C: transaction-failure coverage ----

  it("surfaces a rejected APPROVAL at the approve step (no pre-approval)", async () => {
    // sendRejects rejects the first send, which is the approval (allowance starts at 0).
    const res = await runActionLifecycle(clients(makeDemoState({ sendRejects: true })), buyReq());
    expect(res).toMatchObject({ ok: false, step: "approve", reason: "user-rejected" });
  });

  it("fails when the APPROVAL receipt reverts", async () => {
    const res = await runActionLifecycle(
      clients(makeDemoState({ receiptReverts: true })),
      buyReq(),
    );
    // With no pre-approval, the first receipt awaited is the approval's.
    expect(res).toMatchObject({ ok: false, step: "await-approval", reason: "approval-reverted" });
  });

  it("fails at reread-allowance when the approval did not raise the allowance", async () => {
    // Approval send + receipt succeed, but the token does not record the allowance.
    const res = await runActionLifecycle(
      clients(makeDemoState({ suppressApprovalEffect: true })),
      buyReq(),
    );
    expect(res).toMatchObject({
      ok: false,
      step: "reread-allowance",
      reason: "allowance-insufficient",
    });
  });

  it("honors a confirmation depth greater than 1 and still reconciles", async () => {
    const state = makeDemoState();
    const me = LOCAL_TEST_ADDRESS.toLowerCase();
    state.erc20[DEMO_WETH.toLowerCase()]!.allowances[`${me}:${ROUTER.toLowerCase()}`] = 10n ** 18n;
    const req = { ...buyReq(), confirmations: 5, reconcile: async () => true };
    const res = await runActionLifecycle(clients(state), req);
    expect(res.ok).toBe(true);
  });

  // Targeted stubs for mempool-replacement + confirmation-error paths (the deterministic mock chain
  // cannot produce a genuine replacement/pending state). Only the confirmation surface is stubbed;
  // everything else runs the real lifecycle against a pre-approved allowance.
  function stubClients(
    waitImpl: (args: {
      hash: `0x${string}`;
      confirmations?: number;
      onReplaced?: (r: { reason: string }) => void;
    }) => Promise<{ status: string }>,
  ) {
    return {
      account: LOCAL_TEST_ADDRESS as Address,
      pub: {
        getChainId: async () => 4663,
        readContract: async () => 10n ** 18n, // allowance already sufficient → skip approval
        call: async () => ({ data: "0x" }),
        waitForTransactionReceipt: waitImpl,
      } as never,
      wallet: {
        chain: robinhoodChain,
        sendTransaction: async () => `0x${"c".repeat(64)}` as `0x${string}`,
      } as never,
    };
  }

  it("follows a repriced replacement to its confirmed receipt and succeeds", async () => {
    let reconciled = false;
    const res = await runActionLifecycle(
      stubClients(async ({ onReplaced }) => {
        onReplaced?.({ reason: "repriced" });
        return { status: "success" }; // replacement mined successfully
      }),
      { ...buyReq(), reconcile: async () => ((reconciled = true), true) },
    );
    expect(res.ok).toBe(true);
    expect(reconciled).toBe(true); // reconciliation ran against the replacement's confirmed state
  });

  it("treats a CANCELLED replacement as a failed action (never success on a hash)", async () => {
    const res = await runActionLifecycle(
      stubClients(async ({ onReplaced }) => {
        onReplaced?.({ reason: "cancelled" });
        return { status: "success" }; // a receipt exists, but it is the cancel tx
      }),
      { ...buyReq(), reconcile: async () => true },
    );
    expect(res).toMatchObject({
      ok: false,
      step: "await-receipt",
      reason: "cancelled-replacement",
    });
    expect(res.hash).toMatch(/^0x/);
  });

  it("fails closed on a confirmation error (e.g. wait timeout)", async () => {
    const res = await runActionLifecycle(
      stubClients(async () => {
        throw new Error("Timed out while waiting for transaction to be confirmed.");
      }),
      { ...buyReq(), reconcile: async () => true },
    );
    expect(res.ok).toBe(false);
    expect(res.step).toBe("await-receipt");
    expect(res.reason).toContain("confirm-error");
  });
});
