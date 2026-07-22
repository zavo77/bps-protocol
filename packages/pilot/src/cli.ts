// Local, network-free CLI that runs the Proof-of-Distribution pipeline against the canonical
// checked-in fixture, writes the four canonical artifacts to --out, independently re-verifies the
// Merkle root/proofs and content hashes, prints a reconciliation summary, and exits non-zero on any
// invariant failure. It never touches the network, credentials, or tracked source files.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  formatReconciliation,
  independentlyVerifyWalletProofs,
  runProofOfDistribution,
  verifyAllocationsContentHash,
  verifyManifestEnvelope,
} from "@bps/shared";
import { CANONICAL_FIXTURE_PATH, loadCanonicalFixture } from "./fixture.js";

function parseOutDir(argv: readonly string[]): string {
  let out: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--out") {
      out = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
    }
  }
  if (out === undefined || out.length === 0) {
    throw new Error("usage: proof:mock -- --out <directory>");
  }
  return resolve(out);
}

function run(): number {
  const outDir = parseOutDir(process.argv.slice(2));
  const fixture = loadCanonicalFixture();
  const result = runProofOfDistribution(fixture);

  mkdirSync(outDir, { recursive: true });
  const artifacts: ReadonlyArray<readonly [string, string]> = [
    ["cycle-manifest.json", result.artifacts.manifest.json],
    ["allocations.json", result.artifacts.allocations.json],
    ["wallet-proofs.json", result.artifacts.walletProofs.json],
    ["reconciliation.json", result.artifacts.reconciliation.json],
  ];
  for (const [name, json] of artifacts) {
    // Byte-exact: the json string already ends with a single LF; write raw UTF-8 without a BOM.
    writeFileSync(join(outDir, name), json, { encoding: "utf8" });
  }

  // Independent verification path: recompute from the emitted artifact objects using viem hashing.
  const independent = independentlyVerifyWalletProofs(result.artifacts.walletProofs.object);
  const envelopeOk = verifyManifestEnvelope(result.artifacts.manifest.object);
  const allocationHashOk = verifyAllocationsContentHash(
    result.artifacts.manifest.object,
    result.artifacts.allocations.object,
  );

  const cycle = result.fixture.cycle;
  const v = result.verification;
  const out: string[] = [];
  out.push("BPS Proof-of-Distribution (mock) — all assets and addresses are fictional.");
  out.push("No on-chain claim or protocol transaction occurred.");
  out.push(`fixture: ${CANONICAL_FIXTURE_PATH}`);
  out.push(`output:  ${outDir}`);
  out.push(
    `cycleId=${cycle.cycleId.toString()} chainId=${cycle.chainId.toString()} economics=${cycle.economicsVersion}`,
  );
  out.push(
    `publishable=${String(result.allocation.publishable)} merkleRoot=${result.merkle?.root ?? "(none)"}`,
  );
  out.push(
    `totals: eligibleSnapshotBalance=${result.eligibility.totalEligibleSnapshotBalance.toString()} ` +
      `baseTwab=${result.eligibility.totalBaseTwab.toString()} ` +
      `effectiveWeight=${result.eligibility.totalEffectiveWeight.toString()}`,
  );
  out.push(
    `generator proofs: OZ=${v.ozVerified}/${v.proofCount} viem=${v.viemVerified}/${v.proofCount}`,
  );
  out.push(
    `independent (viem-from-bytes) proofs: ${independent.verified}/${independent.proofCount} ok=${String(independent.ok)}`,
  );
  out.push(
    `manifest envelope hash ok=${String(envelopeOk)}; allocations content hash ok=${String(allocationHashOk)}`,
  );
  out.push("reconciliation:");
  for (const line of formatReconciliation(result.reconciliation)) out.push(`  ${line}`);
  process.stdout.write(`${out.join("\n")}\n`);

  const ok = v.allVerified && independent.ok && envelopeOk && allocationHashOk;
  return ok ? 0 : 1;
}

try {
  process.exit(run());
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`proof:mock failed: ${message}\n`);
  process.exit(1);
}
