import { describe, expect, it } from "vitest";
import { createPublicClient, type Address } from "viem";
import { robinhoodChain } from "../chain";
import { mockTransport } from "../testing/mock-rpc";
import {
  DEMO_BPS,
  DEMO_STOCK,
  DEMO_CYCLE_ID,
  DEMO_DISTRIBUTION,
  makeDemoState,
} from "../testing/local-env";
import { LOCAL_TEST_ADDRESS } from "../testing/local-account";
import { LOCAL_DEMO_MANIFEST } from "../fixtures";
import {
  MissingCodeError,
  WrongChainError,
  assertReadable,
  dedupeLogs,
  readClaimRemaining,
  readErc20,
  readRouterPaused,
} from "./reads";

function client(state = makeDemoState()) {
  return createPublicClient({ chain: robinhoodChain, transport: mockTransport(state) });
}

const ROUTER = LOCAL_DEMO_MANIFEST.actual.tradeRouter as Address;

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

  it("dedupes logs by (txHash, logIndex)", () => {
    const a = { transactionHash: "0xaa", logIndex: 0, blockNumber: 1n };
    const dup = { transactionHash: "0xAA", logIndex: 0, blockNumber: 1n };
    const b = { transactionHash: "0xbb", logIndex: 1, blockNumber: 1n };
    expect(dedupeLogs([a, dup, b])).toHaveLength(2);
  });
});
