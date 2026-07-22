// Deterministic canonical JSON serialization and keccak256 content hashing.
//
// Canonical form: object keys sorted lexicographically at every depth, 2-space indentation, LF
// line endings (JSON.stringify emits "\n"), and no environment-dependent content. Callers must
// convert every bigint to a base-10 string before serializing; a bigint here is a bug and throws.

import { keccak256, stringToBytes } from "viem";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function canonicalize(value: unknown, path: string): Json {
  if (typeof value === "bigint") {
    throw new Error(`canonicalize: bigint at ${path} must be converted to a string first`);
  }
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((v, i) => canonicalize(v, `${path}[${i}]`));
  }
  const t = typeof value;
  if (t === "string" || t === "boolean") {
    return value as Json;
  }
  if (t === "number") {
    if (!Number.isFinite(value as number) || !Number.isInteger(value as number)) {
      throw new Error(`canonicalize: only finite integer numbers allowed, at ${path}`);
    }
    return value as Json;
  }
  if (t === "object") {
    const input = value as Record<string, unknown>;
    const out: Record<string, Json> = {};
    for (const key of Object.keys(input).sort()) {
      out[key] = canonicalize(input[key], `${path}.${key}`);
    }
    return out;
  }
  throw new Error(`canonicalize: unsupported ${t} at ${path}`);
}

/** Serialize a JSON-safe value canonically (sorted keys, 2-space indent, LF). No trailing newline. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value, "$"), null, 2);
}

/** keccak256 over the exact UTF-8 bytes of a string. Returns a 0x-prefixed hex digest. */
export function keccakOfString(text: string): string {
  return keccak256(stringToBytes(text));
}

/** keccak256 over the canonical serialization of a JSON-safe value. */
export function keccakOfCanonical(value: unknown): string {
  return keccakOfString(canonicalStringify(value));
}
