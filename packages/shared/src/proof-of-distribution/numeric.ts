// Integer-only numeric helpers. Token balances, weights, allocations, ratios, timestamps, and
// block numbers are represented as bigint internally and as base-10 strings in JSON. JavaScript
// `number` and floating point are never used for these values.

import { fail } from "./errors.js";

const NON_NEGATIVE_INTEGER = /^(0|[1-9][0-9]*)$/;

/** True iff `value` is a canonical base-10 non-negative integer string (no sign, no leading zeros). */
export function isNonNegativeIntegerString(value: string): boolean {
  return NON_NEGATIVE_INTEGER.test(value);
}

/**
 * Parse a canonical base-10 non-negative integer string into a bigint. Rejects negatives,
 * fractional values, leading `+`, leading zeros, whitespace, and any non-digit input.
 */
export function parseNonNegativeInteger(value: string, field: string): bigint {
  if (!isNonNegativeIntegerString(value)) {
    fail(
      "INVALID_INTEGER",
      `${field}: expected a base-10 non-negative integer string, got "${value}"`,
    );
  }
  return BigInt(value);
}

/** Serialize a non-negative bigint as a canonical base-10 string. Rejects negative values. */
export function toDecimalString(value: bigint, field = "value"): string {
  if (value < 0n) {
    fail("NEGATIVE_VALUE", `${field}: negative values are not permitted (${value.toString()})`);
  }
  return value.toString(10);
}

/** floor(a * b / denom) using exact bigint arithmetic. `denom` must be positive. */
export function mulDivFloor(a: bigint, b: bigint, denom: bigint): bigint {
  if (denom <= 0n) {
    fail("BAD_DENOMINATOR", `mulDivFloor denominator must be positive, got ${denom.toString()}`);
  }
  return (a * b) / denom;
}
