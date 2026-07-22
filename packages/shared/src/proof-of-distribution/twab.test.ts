import { describe, expect, it } from "vitest";
import { ProofOfDistributionError } from "./errors.js";
import type { WalletWeight } from "./twab.js";
import { computeWeights } from "./twab.js";
import { loadCycleFixture } from "./validate.js";
import { A, E0, baseRawFixture, hash, rawTransfer } from "./testkit.js";

function weightsFromRaw(raw: unknown): ReadonlyMap<string, WalletWeight> {
  const fx = loadCycleFixture(raw);
  return computeWeights(fx.cycle, fx.epochStartBalances, fx.transfers, fx.locks).weights;
}

describe("TWAB", () => {
  it("with no transfers equals the constant epoch-start balance (req 2)", () => {
    const weights = weightsFromRaw(baseRawFixture());
    expect(weights.get(A.w1)?.baseTwab).toBe(100n);
    expect(weights.get(A.w2)?.baseTwab).toBe(300n);
  });

  it("handles a single mid-epoch transfer that changes TWAB (req 3)", () => {
    const raw = baseRawFixture();
    // At E0+450 (half the 900s epoch) w2 sends 200 to w1.
    raw.transfers.push(
      rawTransfer({
        from: A.w2,
        to: A.w1,
        rawAmount: "200",
        timestamp: String(E0 + 450),
        blockNumber: "150",
        transactionHash: hash("aa10"),
        blockHash: hash("bb10"),
      }),
    );
    const weights = weightsFromRaw(raw);
    // w1: 100 for 450s then 300 for 450s -> floor((100*450 + 300*450)/900) = 200.
    expect(weights.get(A.w1)?.baseTwab).toBe(200n);
    // w2: 300 for 450s then 100 for 450s -> 200.
    expect(weights.get(A.w2)?.baseTwab).toBe(200n);
  });

  it("computes TWAB from multiple mid-epoch transfers (req 3)", () => {
    const raw = baseRawFixture();
    raw.transfers.push(
      rawTransfer({
        from: A.w2,
        to: A.w1,
        rawAmount: "100",
        timestamp: String(E0 + 300),
        transactionHash: hash("aa11"),
        blockHash: hash("bb11"),
        blockNumber: "150",
      }),
      rawTransfer({
        from: A.w2,
        to: A.w1,
        rawAmount: "100",
        timestamp: String(E0 + 600),
        transactionHash: hash("aa12"),
        blockHash: hash("bb12"),
        blockNumber: "151",
      }),
    );
    const weights = weightsFromRaw(raw);
    // w1: 100 (0..300s), 200 (300..600s), 300 (600..900s) -> (100*300+200*300+300*300)/900 = 200.
    expect(weights.get(A.w1)?.baseTwab).toBe(200n);
    // w2: 300, 200, 100 -> 200.
    expect(weights.get(A.w2)?.baseTwab).toBe(200n);
  });

  it("treats an E0 transfer as full-epoch and an E1 transfer as next-epoch (req 4)", () => {
    const atStart = baseRawFixture();
    atStart.transfers.push(
      rawTransfer({
        from: A.zero,
        to: A.w1,
        rawAmount: "900",
        timestamp: String(E0), // effective for the whole epoch
        transactionHash: hash("aa13"),
        blockHash: hash("bb13"),
      }),
    );
    // w1 starts 100, minted +900 at E0 => 1000 for the entire epoch.
    expect(weightsFromRaw(atStart).get(A.w1)?.baseTwab).toBe(1000n);

    const atEnd = baseRawFixture();
    atEnd.transfers.push(
      rawTransfer({
        from: A.zero,
        to: A.w1,
        rawAmount: "900",
        timestamp: String(1_800_000_900), // exactly E1 -> belongs to next epoch, zero weight here
        blockNumber: "199",
        transactionHash: hash("aa14"),
        blockHash: hash("bb14"),
      }),
    );
    expect(weightsFromRaw(atEnd).get(A.w1)?.baseTwab).toBe(100n);
    // Snapshot balance also excludes the E1 event.
    expect(weightsFromRaw(atEnd).get(A.w1)?.snapshotBalance).toBe(100n);
  });

  it("is invariant to input ordering; canonical order is enforced (req 5)", () => {
    const ordered = baseRawFixture();
    const t1 = rawTransfer({
      from: A.w2,
      to: A.w1,
      rawAmount: "100",
      timestamp: String(E0 + 300),
      blockNumber: "150",
      transactionHash: hash("aa11"),
      blockHash: hash("bb11"),
    });
    const t2 = rawTransfer({
      from: A.w2,
      to: A.w1,
      rawAmount: "100",
      timestamp: String(E0 + 600),
      blockNumber: "151",
      transactionHash: hash("aa12"),
      blockHash: hash("bb12"),
    });
    ordered.transfers.push(t1, t2);
    const shuffled = baseRawFixture();
    shuffled.transfers.push(t2, t1); // reversed input order
    expect(weightsFromRaw(shuffled).get(A.w1)?.baseTwab).toBe(
      weightsFromRaw(ordered).get(A.w1)?.baseTwab,
    );
  });

  it("is idempotent for an identical duplicate log (req 6)", () => {
    const raw = baseRawFixture();
    const t = rawTransfer({
      from: A.w2,
      to: A.w1,
      rawAmount: "200",
      timestamp: String(E0 + 450),
      blockNumber: "150",
      transactionHash: hash("aa20"),
      blockHash: hash("bb20"),
    });
    raw.transfers.push(t, structuredClone(t)); // exact duplicate
    expect(weightsFromRaw(raw).get(A.w1)?.baseTwab).toBe(200n);
  });

  it("rejects two different logs sharing an identity (req 7)", () => {
    const raw = baseRawFixture();
    const base = rawTransfer({
      from: A.w2,
      to: A.w1,
      rawAmount: "200",
      timestamp: String(E0 + 450),
      transactionHash: hash("aa21"),
      blockHash: hash("bb21"),
    });
    const conflicting = { ...structuredClone(base), rawAmount: "201" }; // same identity, different payload
    raw.transfers.push(base, conflicting);
    expect(() => weightsFromRaw(raw)).toThrow(ProofOfDistributionError);
    expect(() => weightsFromRaw(raw)).toThrow(/CONFLICTING_LOG/);
  });

  it("rejects an impossible transfer that would drive a balance negative (req 8)", () => {
    const raw = baseRawFixture();
    raw.transfers.push(
      rawTransfer({
        from: A.w1, // holds only 100
        to: A.w2,
        rawAmount: "101",
        timestamp: String(E0 + 100),
        transactionHash: hash("aa22"),
        blockHash: hash("bb22"),
      }),
    );
    expect(() => weightsFromRaw(raw)).toThrow(/NEGATIVE_BALANCE/);
  });

  it("normalizes mixed-case addresses so a transfer credits the same wallet (req 9)", () => {
    const raw = baseRawFixture();
    const mixed = A.w1.toUpperCase().replace("0X", "0x"); // mixed/upper-case variant of w1
    raw.transfers.push(
      rawTransfer({
        from: A.zero,
        to: mixed,
        rawAmount: "800",
        timestamp: String(E0),
        transactionHash: hash("aa23"),
        blockHash: hash("bb23"),
      }),
    );
    // Credit lands on the canonical (lowercase) w1: 100 + 800 = 900 for the whole epoch.
    expect(weightsFromRaw(raw).get(A.w1)?.baseTwab).toBe(900n);
  });

  it("handles burns to the zero address deterministically", () => {
    const raw = baseRawFixture();
    raw.transfers.push(
      rawTransfer({
        from: A.w2, // 300 -> burns 100 at E0
        to: A.zero,
        rawAmount: "100",
        timestamp: String(E0),
        transactionHash: hash("aa24"),
        blockHash: hash("bb24"),
      }),
    );
    expect(weightsFromRaw(raw).get(A.w2)?.baseTwab).toBe(200n);
    expect(weightsFromRaw(raw).get(A.w2)?.snapshotBalance).toBe(200n);
  });
});
