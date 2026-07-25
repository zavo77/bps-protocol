// TASK 10G-1 — pure enumeration tests (LOCAL_TEST_ONLY synthetic records).
import { describe, expect, it } from "vitest";
import { enumerateCandidates } from "./enumeration.js";

const A = "0x0000000000000000000000000000000000000a11";
const B = "0x0000000000000000000000000000000000000b22";

describe("candidate enumeration (LOCAL_TEST_ONLY)", () => {
  it("deduplicates repeat appearances across events and lock ids", () => {
    const r = enumerateCandidates(
      [
        { account: A, lockId: 0n, blockNumber: 10n, logIndex: 0 },
        { account: A.toUpperCase().replace("0X", "0x"), lockId: 1n, blockNumber: 20n, logIndex: 1 },
        { account: B, lockId: 0n, blockNumber: 15n, logIndex: 0 },
        { account: A, lockId: 2n, blockNumber: 30n, logIndex: 2 },
      ],
      100n,
    );
    expect(r.candidates).toEqual([A, B]);
    expect(r.recordsSeen).toBe(4);
    expect(r.excludedAfterSnapshot).toBe(0);
  });

  it("excludes events strictly after the snapshot block; keeps the exact-boundary block", () => {
    const r = enumerateCandidates(
      [
        { account: A, lockId: 0n, blockNumber: 100n, logIndex: 0 }, // exactly at pin -> included
        { account: B, lockId: 0n, blockNumber: 101n, logIndex: 0 }, // after pin -> excluded
      ],
      100n,
    );
    expect(r.candidates).toEqual([A]);
    expect(r.excludedAfterSnapshot).toBe(1);
  });

  it("sorted output is deterministic regardless of input order", () => {
    const fwd = enumerateCandidates(
      [
        { account: B, lockId: 0n, blockNumber: 1n, logIndex: 0 },
        { account: A, lockId: 0n, blockNumber: 2n, logIndex: 0 },
      ],
      10n,
    );
    const rev = enumerateCandidates(
      [
        { account: A, lockId: 0n, blockNumber: 2n, logIndex: 0 },
        { account: B, lockId: 0n, blockNumber: 1n, logIndex: 0 },
      ],
      10n,
    );
    expect(fwd.candidates).toEqual(rev.candidates);
  });

  it("rejects malformed records", () => {
    expect(() =>
      enumerateCandidates([{ account: A, lockId: -1n, blockNumber: 1n, logIndex: 0 }], 10n),
    ).toThrowError(/MALFORMED_RECORD/);
  });
});
