// Address normalization. Canonical form is all-lowercase 0x-prefixed 20-byte hex. Normalizing
// before every comparison guarantees a mixed-case duplicate is still detected as a duplicate,
// and that artifacts use one canonical casing.

import { fail } from "./errors.js";

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** True iff `value` is a syntactically valid 20-byte hex address (any casing). */
export function isHexAddress(value: string): boolean {
  return HEX_ADDRESS.test(value);
}

/** Normalize an address to canonical lowercase form. Throws on malformed input. */
export function normalizeAddress(value: string, field = "address"): string {
  if (!isHexAddress(value)) {
    fail("INVALID_ADDRESS", `${field}: malformed address "${value}"`);
  }
  return value.toLowerCase();
}

/** True iff the address is the zero address (canonical form). */
export function isZeroAddress(value: string): boolean {
  return normalizeAddress(value) === ZERO_ADDRESS;
}
