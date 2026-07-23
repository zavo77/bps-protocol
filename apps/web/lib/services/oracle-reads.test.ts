import { describe, expect, it } from "vitest";
import {
  createPublicClient,
  custom,
  encodeAbiParameters,
  toFunctionSelector,
  type Address,
} from "viem";
import { robinhoodChain } from "../chain";
import { mockTransport } from "../testing/mock-rpc";
import { makeDemoState, DEMO_STOCK } from "../testing/local-env";
import { evaluateFeed } from "../oracle";
import { readFeed, readSequencer } from "./oracle-reads";
import { ReadFailedError } from "./reads";
import type { FeedConfig } from "../oracle";

const FEED = "0x00000000000000000000000000000000feed0001" as Address;
const SEQUENCER = "0x0000000000000000000000000000000000005e90" as Address;
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

// --- Tailored oracle transport so we can vary decimals / answer / updatedAt / paused / sequencer /
// malformed / RPC failure independently of the deterministic demo chain. ---
const SEL = {
  decimals: toFunctionSelector("decimals()"),
  latest: toFunctionSelector("latestRoundData()"),
  paused: toFunctionSelector("oraclePaused()"),
};
const ROUND_OUT = [
  { type: "uint80" },
  { type: "int256" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint80" },
] as const;

interface OracleOpts {
  code?: boolean;
  decimals?: number;
  answer?: bigint;
  updatedAt?: bigint;
  paused?: boolean;
  sequencerAnswer?: bigint; // 0 up, 1 down
  sequencerStartedAt?: bigint;
  throwOnLatest?: boolean;
  malformedLatest?: boolean;
}

function oracleClient(opts: OracleOpts) {
  const request = async ({ method, params }: { method: string; params?: unknown[] }) => {
    if (method === "eth_chainId") return `0x${robinhoodChain.id.toString(16)}`;
    if (method === "eth_getCode") return opts.code === false ? "0x" : "0x60006000f3";
    if (method === "eth_call") {
      const call = (params as [{ to: string; data: string }])[0];
      const to = call.to.toLowerCase();
      const s = call.data.slice(0, 10).toLowerCase();
      if (s === SEL.decimals.toLowerCase()) {
        return encodeAbiParameters([{ type: "uint8" }], [opts.decimals ?? 8]);
      }
      if (s === SEL.paused.toLowerCase()) {
        return encodeAbiParameters([{ type: "bool" }], [opts.paused ?? false]);
      }
      if (s === SEL.latest.toLowerCase()) {
        if (opts.throwOnLatest) throw new Error("execution reverted: feed down");
        if (opts.malformedLatest) return "0xdead"; // undecodable (too short)
        if (to === SEQUENCER.toLowerCase()) {
          return encodeAbiParameters(ROUND_OUT, [
            1n,
            opts.sequencerAnswer ?? 0n,
            opts.sequencerStartedAt ?? 0n,
            0n,
            1n,
          ]);
        }
        return encodeAbiParameters(ROUND_OUT, [
          1n,
          opts.answer ?? 200_00000000n,
          0n,
          opts.updatedAt ?? 1_000_000n,
          1n,
        ]);
      }
    }
    throw new Error(`unexpected ${method}`);
  };
  return createPublicClient({ chain: robinhoodChain, transport: custom({ request }) });
}

describe("oracle read boundary (§F)", () => {
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
      reading.updatedAtSec,
    );
    expect(verdict.ok).toBe(true);
  });

  it("fails closed when the feed has no code (missing code)", async () => {
    const reading = await readFeed(client(false), CONFIG, DEMO_STOCK);
    expect(reading.hasCode).toBe(false);
    const v = evaluateFeed(
      CONFIG,
      reading,
      { up: true, changedAtSec: 0n, gracePeriodSec: 0n },
      1_000_000n,
    );
    expect(v).toMatchObject({ ok: false, reason: "feed-no-code" });
  });

  it("surfaces every field: decimals, positive answer, updatedAt, oraclePaused", async () => {
    const reading = await readFeed(
      oracleClient({ answer: 150_00000000n, updatedAt: 500n }),
      CONFIG,
      DEMO_STOCK,
    );
    expect(reading).toMatchObject({
      hasCode: true,
      decimals: 8,
      answer: 150_00000000n,
      updatedAtSec: 500n,
      oraclePaused: false,
    });
  });

  it("propagates oraclePaused() = true", async () => {
    const reading = await readFeed(oracleClient({ paused: true }), CONFIG, DEMO_STOCK);
    expect(reading.oraclePaused).toBe(true);
    const v = evaluateFeed(
      CONFIG,
      reading,
      { up: true, changedAtSec: 0n, gracePeriodSec: 100n },
      1_000_000n,
    );
    expect(v).toMatchObject({ ok: false, reason: "oracle-paused" });
  });

  it("a stale updatedAt beyond the heartbeat is rejected", async () => {
    const reading = await readFeed(oracleClient({ updatedAt: 100n }), CONFIG, DEMO_STOCK);
    // now is far beyond updatedAt + heartbeat (3600).
    const v = evaluateFeed(
      CONFIG,
      reading,
      { up: true, changedAtSec: 0n, gracePeriodSec: 0n },
      1_000_000n,
    );
    expect(v).toMatchObject({ ok: false, reason: "stale" });
  });

  it("a non-positive answer is rejected", async () => {
    const reading = await readFeed(
      oracleClient({ answer: 0n, updatedAt: 1_000_000n }),
      CONFIG,
      DEMO_STOCK,
    );
    const v = evaluateFeed(
      CONFIG,
      reading,
      { up: true, changedAtSec: 0n, gracePeriodSec: 0n },
      1_000_000n,
    );
    expect(v).toMatchObject({ ok: false, reason: "non-positive-price" });
  });

  it("decimals that do not match the config are rejected", async () => {
    const reading = await readFeed(
      oracleClient({ decimals: 18, updatedAt: 1_000_000n }),
      CONFIG,
      DEMO_STOCK,
    );
    const v = evaluateFeed(
      CONFIG,
      reading,
      { up: true, changedAtSec: 0n, gracePeriodSec: 0n },
      1_000_000n,
    );
    expect(v).toMatchObject({ ok: false, reason: "decimals-mismatch" });
  });

  it("reads the sequencer as UP when answer is 0", async () => {
    const status = await readSequencer(
      oracleClient({ sequencerAnswer: 0n, sequencerStartedAt: 10n }),
      SEQUENCER,
      3600n,
    );
    expect(status.up).toBe(true);
    expect(status.changedAtSec).toBe(10n);
    expect(status.gracePeriodSec).toBe(3600n);
  });

  it("reads the sequencer as DOWN when answer is 1 and rejects the feed", async () => {
    const status = await readSequencer(oracleClient({ sequencerAnswer: 1n }), SEQUENCER, 3600n);
    expect(status.up).toBe(false);
    const reading = await readFeed(oracleClient({}), CONFIG, DEMO_STOCK);
    expect(evaluateFeed(CONFIG, reading, status, 1_000_000n)).toMatchObject({
      ok: false,
      reason: "sequencer-down",
    });
  });

  it("enforces the sequencer grace period after a recent recovery", async () => {
    const status = await readSequencer(
      oracleClient({ sequencerAnswer: 0n, sequencerStartedAt: 999_000n }),
      SEQUENCER,
      3600n,
    );
    // now - changedAt (1000) <= grace (3600) → still in grace period.
    const reading = await readFeed(oracleClient({ updatedAt: 1_000_000n }), CONFIG, DEMO_STOCK);
    expect(evaluateFeed(CONFIG, reading, status, 1_000_000n)).toMatchObject({
      ok: false,
      reason: "sequencer-grace-period",
    });
  });

  it("carries the per-token multiplier into the priced verdict", async () => {
    const cfg: FeedConfig = { ...CONFIG, multiplier: 3 };
    const reading = await readFeed(
      oracleClient({ answer: 100n, updatedAt: 1_000_000n }),
      cfg,
      DEMO_STOCK,
    );
    const v = evaluateFeed(
      cfg,
      reading,
      { up: true, changedAtSec: 0n, gracePeriodSec: 100n },
      1_000_000n,
    );
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.price).toBe(300n); // answer * multiplier
  });

  it("fails closed (ReadFailedError) on an RPC failure during latestRoundData", async () => {
    await expect(
      readFeed(oracleClient({ throwOnLatest: true }), CONFIG, DEMO_STOCK),
    ).rejects.toBeInstanceOf(ReadFailedError);
  });

  it("fails closed (ReadFailedError) on a malformed latestRoundData response", async () => {
    await expect(
      readFeed(oracleClient({ malformedLatest: true }), CONFIG, DEMO_STOCK),
    ).rejects.toBeInstanceOf(ReadFailedError);
  });

  it("fails closed (ReadFailedError) on an RPC failure reading the sequencer", async () => {
    await expect(
      readSequencer(oracleClient({ throwOnLatest: true }), SEQUENCER, 3600n),
    ).rejects.toBeInstanceOf(ReadFailedError);
  });
});
