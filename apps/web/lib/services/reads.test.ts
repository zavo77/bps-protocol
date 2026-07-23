import { describe, expect, it } from "vitest";
import { createPublicClient, type Address } from "viem";
import { robinhoodChain } from "../chain";
import { mockTransport } from "../testing/mock-rpc";
import {
  DEMO_BPS,
  DEMO_ROOT,
  DEMO_STOCK,
  DEMO_CYCLE_ID,
  DEMO_DISTRIBUTION,
  DEMO_PRELOCKED,
  makeDemoState,
} from "../testing/local-env";
import { LOCAL_TEST_ADDRESS } from "../testing/local-account";
import { LOCAL_DEMO_MANIFEST } from "../fixtures";
import {
  MissingCodeError,
  WrongChainError,
  assertReadable,
  dedupeLogs,
  readAcquisition,
  readAssetFunding,
  readClaimRemaining,
  readClaimUsed,
  readCycle,
  readLockCount,
  readLockedPrincipal,
  readErc20,
  readRouterPaused,
} from "./reads";

function client(state = makeDemoState()) {
  return createPublicClient({ chain: robinhoodChain, transport: mockTransport(state) });
}

const ROUTER = LOCAL_DEMO_MANIFEST.actual.tradeRouter as Address;
const MANAGER = LOCAL_DEMO_MANIFEST.actual.claimManager as Address;
const VAULT = LOCAL_DEMO_MANIFEST.actual.lockingVault as Address;
const COORDINATOR = LOCAL_DEMO_MANIFEST.actual.coordinator as Address;

describe("contract-read service (§D)", () => {
  it("assertReadable passes on chain 4663 with code present", async () => {
    await expect(assertReadable(client(), [ROUTER])).resolves.toBeUndefined();
  });

  it("fails closed on wrong chain", async () => {
    await expect(
      assertReadable(client(makeDemoState({ chainId: 1 })), [ROUTER]),
    ).rejects.toBeInstanceOf(WrongChainError);
  });

  it("fails closed on missing code", async () => {
    const noCode = "0x000000000000000000000000000000000000dEaD" as Address;
    await expect(assertReadable(client(), [noCode])).rejects.toBeInstanceOf(MissingCodeError);
  });

  it("reads ERC-20 balance/decimals/allowance", async () => {
    const snap = await readErc20(client(), DEMO_BPS, LOCAL_TEST_ADDRESS, ROUTER);
    expect(snap.decimals).toBe(18);
    expect(snap.balance).toBe(100_000n * 10n ** 18n);
    expect(snap.allowance).toBe(0n);
  });

  it("reads router paused and claim remaining", async () => {
    expect(await readRouterPaused(client(), ROUTER)).toBe(false);
    expect(
      await readClaimRemaining(
        client(),
        LOCAL_DEMO_MANIFEST.actual.claimManager as Address,
        DEMO_CYCLE_ID,
        DEMO_STOCK,
      ),
    ).toBe(DEMO_DISTRIBUTION);
  });

  it("reads locked principal from the vault", async () => {
    const state = makeDemoState();
    state.lockedPrincipal[LOCAL_TEST_ADDRESS.toLowerCase()] = 500n * 10n ** 18n;
    const c = createPublicClient({ chain: robinhoodChain, transport: mockTransport(state) });
    const vault = LOCAL_DEMO_MANIFEST.actual.lockingVault as Address;
    expect(await readLockedPrincipal(c, vault, LOCAL_TEST_ADDRESS)).toBe(500n * 10n ** 18n);
  });

  it("reads authoritative current cycle state via cycles()", async () => {
    const cyc = await readCycle(client(), MANAGER, DEMO_CYCLE_ID);
    expect(cyc.published).toBe(true);
    expect(cyc.merkleRoot.toLowerCase()).toBe(DEMO_ROOT.toLowerCase());
    expect(cyc.claimDeadline).toBeGreaterThan(0n);
  });

  it("reads authoritative per-cycle/asset funding via assetFunding()", async () => {
    const af = await readAssetFunding(client(), MANAGER, DEMO_CYCLE_ID, DEMO_STOCK);
    expect(af.registered).toBe(true);
    expect(af.funded).toBe(DEMO_DISTRIBUTION);
    expect(af.claimed).toBe(0n);
  });

  it("reads authoritative account claim-used flag via claimed()", async () => {
    const state = makeDemoState();
    expect(
      await readClaimUsed(client(state), MANAGER, DEMO_CYCLE_ID, LOCAL_TEST_ADDRESS, DEMO_STOCK),
    ).toBe(false);
    state.claimed[`${DEMO_CYCLE_ID}::${LOCAL_TEST_ADDRESS.toLowerCase()}`] = true;
    expect(
      await readClaimUsed(client(state), MANAGER, DEMO_CYCLE_ID, LOCAL_TEST_ADDRESS, DEMO_STOCK),
    ).toBe(true);
  });

  it("reads authoritative acquisition record via acquisitions()", async () => {
    const a = await readAcquisition(client(), COORDINATOR, 1n);
    expect(a.status).toBe(2); // FUNDED
    expect(a.stockToken.toLowerCase()).toBe(DEMO_STOCK.toLowerCase());
    expect(a.distributionAmount).toBe(DEMO_DISTRIBUTION);
    expect(a.reserveAmount).toBe(400n * 10n ** 18n);
    expect(a.cycleId).toBe(DEMO_CYCLE_ID);
    // 80/20 split reconciles against acquiredStock.
    expect(a.distributionAmount + a.reserveAmount).toBe(a.acquiredStock);
  });

  it("reads lock count reflecting the seeded pre-existing position", async () => {
    expect(await readLockCount(client(), VAULT, LOCAL_TEST_ADDRESS)).toBe(1n);
  });

  it("seeded pre-existing locked principal equals DEMO_PRELOCKED", async () => {
    expect(await readLockedPrincipal(client(), VAULT, LOCAL_TEST_ADDRESS)).toBe(DEMO_PRELOCKED);
  });

  it("dedupes logs by (txHash, logIndex)", () => {
    const a = { transactionHash: "0xaa", logIndex: 0, blockNumber: 1n };
    const dup = { transactionHash: "0xAA", logIndex: 0, blockNumber: 1n };
    const b = { transactionHash: "0xbb", logIndex: 1, blockNumber: 1n };
    expect(dedupeLogs([a, dup, b])).toHaveLength(2);
  });
});
