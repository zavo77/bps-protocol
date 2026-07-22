import { describe, expect, it } from "vitest";
import { canonicalStringify, keccakOfCanonical } from "./serialize.js";

describe("canonical serialization and hashing", () => {
  it("sorts object keys at every depth regardless of input order", () => {
    const a = canonicalStringify({ b: 1, a: { d: 4, c: 3 } });
    const b = canonicalStringify({ a: { c: 3, d: 4 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{\n  "a": {\n    "c": 3,\n    "d": 4\n  },\n  "b": 1\n}');
  });

  it("uses LF newlines and no trailing newline", () => {
    const s = canonicalStringify({ a: 1 });
    expect(s.includes("\r")).toBe(false);
    expect(s.endsWith("\n")).toBe(false);
  });

  it("produces a stable keccak hash for equal content and a different hash on any change", () => {
    const base = { chainId: "10", amount: "1000", nested: { k: "v" } };
    const same = { nested: { k: "v" }, amount: "1000", chainId: "10" };
    expect(keccakOfCanonical(base)).toBe(keccakOfCanonical(same));
    expect(keccakOfCanonical({ ...base, amount: "1001" })).not.toBe(keccakOfCanonical(base));
  });

  it("throws if a bigint is serialized instead of a base-10 string", () => {
    expect(() => canonicalStringify({ amount: 10n })).toThrow();
  });
});
