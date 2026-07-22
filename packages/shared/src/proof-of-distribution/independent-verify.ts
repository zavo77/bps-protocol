// Independent re-verification of emitted artifacts, using only the artifact bytes plus viem
// hashing and sorted-pair folding. This does not use the OpenZeppelin generator, so a passing
// result is genuine cross-implementation agreement, not self-confirmation. Also re-derives the
// manifest envelope hash and the allocations content hash to detect any committed-field mutation.

import type { Hex } from "viem";
import { keccakOfCanonical } from "./serialize.js";
import { viemVerifyRaw } from "./viem-verify.js";

export interface IndependentProofResult {
  readonly root: string | null;
  readonly proofCount: number;
  readonly verified: number;
  readonly ok: boolean;
  readonly failures: readonly string[];
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`independent-verify: ${label} must be a string`);
  return value;
}

/**
 * Re-verify every proof in a parsed wallet-proofs artifact against its own declared root, using
 * viem. When the artifact is non-publishable (root null / no wallets) this returns ok with zero
 * proofs.
 */
export function independentlyVerifyWalletProofs(walletProofs: unknown): IndependentProofResult {
  const wp = walletProofs as Record<string, unknown>;
  const rootValue = wp["merkleRoot"];
  const wallets = (wp["wallets"] ?? {}) as Record<string, unknown>;
  const failures: string[] = [];

  if (rootValue === null || rootValue === undefined) {
    const count = Object.keys(wallets).length;
    if (count > 0) failures.push("null root but wallets present");
    return { root: null, proofCount: 0, verified: 0, ok: failures.length === 0, failures };
  }

  const root = asString(rootValue, "merkleRoot") as Hex;
  const chainId = BigInt(asString(wp["chainId"], "chainId"));
  const claimManager = asString(wp["claimManager"], "claimManager");
  const cycleId = BigInt(asString(wp["cycleId"], "cycleId"));

  let proofCount = 0;
  let verified = 0;
  for (const wallet of Object.keys(wallets)) {
    const claims = wallets[wallet] as Array<Record<string, unknown>>;
    for (const claim of claims) {
      proofCount += 1;
      const asset = asString(claim["asset"], "asset");
      const amount = BigInt(asString(claim["amount"], "amount"));
      const proof = (claim["proof"] as string[]).map((p) => p as Hex);
      const ok = viemVerifyRaw(
        { chainId, claimManager, cycleId, wallet, asset, amount },
        proof,
        root,
      );
      if (ok) verified += 1;
      else failures.push(`proof failed for ${wallet} / ${asset}`);
    }
  }
  return {
    root,
    proofCount,
    verified,
    ok: failures.length === 0 && verified === proofCount,
    failures,
  };
}

/** Recompute a manifest's envelope hash from its own body and compare to the committed value. */
export function verifyManifestEnvelope(manifest: unknown): boolean {
  const m = manifest as Record<string, unknown>;
  const committed = m["envelopeHash"];
  if (typeof committed !== "string") return false;
  const body: Record<string, unknown> = { ...m };
  delete body["envelopeHash"];
  return keccakOfCanonical(body) === committed;
}

/** Verify the manifest's recorded allocations content hash matches the allocations artifact. */
export function verifyAllocationsContentHash(manifest: unknown, allocations: unknown): boolean {
  const m = manifest as Record<string, unknown>;
  const committed = m["allocationsContentHash"];
  if (typeof committed !== "string") return false;
  return keccakOfCanonical(allocations) === committed;
}
