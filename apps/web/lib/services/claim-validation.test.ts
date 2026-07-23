import { describe, expect, it } from "vitest";
import { createPublicClient, type Address, type Hex } from "viem";
import { robinhoodChain } from "../chain";
import { mockTransport } from "../testing/mock-rpc";
import {
  DEMO_ROOT,
  DEMO_STOCK,
  DEMO_CYCLE_ID,
  DEMO_DISTRIBUTION,
  makeDemoState,
} from "../testing/local-env";
import { LOCAL_TEST_ADDRESS } from "../testing/local-account";
import { LOCAL_DEMO_MANIFEST } from "../fixtures";
import { validateClaimReadiness } from "./claim-validation";

const MANAGER = LOCAL_DEMO_MANIFEST.actual.claimManager as Address;
const STOCK_KEY = DEMO_STOCK.toLowerCase();
const CYC = DEMO_CYCLE_ID.toString();

function client(state = makeDemoState()) {
  return createPublicClient({ chain: robinhoodChain, transport: mockTransport(state) });
}

function baseInput() {
  return {
    manager: MANAGER,
    cycleId: DEMO_CYCLE_ID,
    asset: DEMO_STOCK,
    claimant: LOCAL_TEST_ADDRESS as Address,
    amount: DEMO_DISTRIBUTION,
    artifactRoot: DEMO_ROOT as Hex,
  };
}

describe("authoritative claim-readiness validation (§E)", () => {
  it("passes when every current claim-manager field matches", async () => {
    const r = await validateClaimReadiness(client(), baseInput());
    expect(r.ok).toBe(true);
    expect(r.onchainRoot?.toLowerCase()).toBe(DEMO_ROOT.toLowerCase());
    expect(r.remaining).toBe(DEMO_DISTRIBUTION);
  });

  it("rejects when the cycle is not published", async () => {
    const state = makeDemoState();
    state.cyclePublished[CYC] = false;
    const r = await validateClaimReadiness(client(state), baseInput());
    expect(r).toMatchObject({ ok: false, reason: "cycle-not-published" });
  });

  it("rejects on a root mismatch against the CURRENT on-chain root", async () => {
    const state = makeDemoState();
    state.cycleRoot[CYC] = `0x${"9".repeat(64)}` as Hex;
    const r = await validateClaimReadiness(client(state), baseInput());
    expect(r).toMatchObject({ ok: false, reason: "root-mismatch" });
  });

  it("rejects when the amount exceeds the published allocation", async () => {
    const r = await validateClaimReadiness(client(), {
      ...baseInput(),
      amount: DEMO_DISTRIBUTION + 1n,
    });
    expect(r).toMatchObject({ ok: false, reason: "exceeds-published-allocation" });
  });

  it("rejects when the asset is not registered/funded for the cycle", async () => {
    const state = makeDemoState();
    delete state.assetFunded[`${CYC}:${STOCK_KEY}`];
    const r = await validateClaimReadiness(client(state), baseInput());
    expect(r).toMatchObject({ ok: false, reason: "exceeds-published-allocation" });
  });

  it("rejects when the account has already claimed", async () => {
    const state = makeDemoState();
    state.claimed[`${CYC}::${LOCAL_TEST_ADDRESS.toLowerCase()}`] = true;
    const r = await validateClaimReadiness(client(state), baseInput());
    expect(r).toMatchObject({ ok: false, reason: "already-claimed" });
  });

  it("rejects when the claim manager's stock balance is insufficient", async () => {
    const state = makeDemoState();
    state.erc20[STOCK_KEY]!.balances[MANAGER.toLowerCase()] = DEMO_DISTRIBUTION - 1n;
    const r = await validateClaimReadiness(client(state), baseInput());
    expect(r).toMatchObject({ ok: false, reason: "manager-balance-insufficient" });
  });

  it("an OLD event root cannot override a CHANGED current cycle root", async () => {
    // Simulate the cycle being re-published with a new root AFTER the artifact/event was produced.
    // The artifact still carries the original DEMO_ROOT (as a stale AcquisitionFunded event would),
    // but the authoritative cycles() read returns the new root → the claim must be rejected.
    const state = makeDemoState();
    const newRoot = `0x${"a".repeat(64)}` as Hex;
    state.cycleRoot[CYC] = newRoot;
    const r = await validateClaimReadiness(client(state), baseInput()); // artifactRoot = old DEMO_ROOT
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("root-mismatch");
    expect(r.onchainRoot).toBe(newRoot); // the CURRENT root wins, not the stale artifact/event root
  });
});
