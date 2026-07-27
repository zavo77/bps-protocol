// Canonical LaunchManifest construction and deterministic hashing.

import { keccak256, stringToHex, type Hex } from "viem";
import type { LaunchManifest } from "../types/index";

/** Deterministic JSON: recursively sorted keys, no whitespace variance. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

export function hashManifest(manifest: LaunchManifest): Hex {
  return keccak256(stringToHex(canonicalize(manifest)));
}

export function hashDescription(description: string): Hex {
  return keccak256(stringToHex(description));
}
