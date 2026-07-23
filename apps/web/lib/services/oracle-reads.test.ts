import { describe, expect, it } from "vitest";
import { createPublicClient, type Address } from "viem";
import { robinhoodChain } from "../chain";
import { mockTransport } from "../testing/mock-rpc";
import { makeDemoState, DEMO_STOCK } from "../testing/local-env";
import { evaluateFeed } from "../oracle";
import { readFeed } from "./oracle-reads";
import type { FeedConfig } from "../oracle";

const FEED = "0x00000000000000000000000000000000feed0001" as Address;
const CONFIG: FeedConfig = {
  stockSymbol: "AAPL",
  proxy: FEED,
  decimals: 8,
  heartbeatSec: 3600,
  multiplier: 1,
  sourceUrl: "test",
};

function client(codePresent = true) {
  const state = makeDemoState();
  if (codePresent) state.code[FEED.toLowerCase()] = true;
  return createPublicClient({ chain: robinhoodChain, transport: mockTransport(state) });
}

describe("oracle read boundary (§G)", () => {
  it("reads a live feed (code, decimals, latestRoundData, oraclePaused) into a valid reading", async () => {
    const reading = await readFeed(client(), CONFIG, DEMO_STOCK);
    expect(reading.hasCode).toBe(true);
    expect(reading.decimals).toBe(8);
    expect(reading.answer).toBe(200_00000000n);
    expect(reading.oraclePaused).toBe(false);
    const verdict = evaluateFeed(
      CONFIG,
      reading,
      { up: true, changedAtSec: 0n, gracePeriodSec: 0n },
      reading.updatedAtSec, // within heartbeat
    );
    expect(verdict.ok).toBe(true);
  });

  it("fails closed when the feed has no code", async () => {
    const reading = await readFeed(client(false), CONFIG, DEMO_STOCK);
    expect(reading.hasCode).toBe(false);
  });
});
