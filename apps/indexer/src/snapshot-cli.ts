// TASK 10G-1 — deterministic, read-only snapshot CLI.
//
// Every input is EXPLICIT (no `latest`, no defaults for chain-identity or pin inputs). The RPC
// endpoint comes only from ROBINHOOD_CHAIN_RPC_URL and is never printed or written to artifacts.
// The canonical artifacts contain no timestamps; the generation time lives only in the separate
// evidence envelope so canonical digests are byte-stable across reruns.
//
// Usage (all required unless marked optional):
//   node --experimental-strip-types src/snapshot-cli.ts \
//     --chain-id 4663 --vault 0x... --manager 0x... --block 18791290 --block-hash 0x... \
//     --start-block 18395614 --asset 0x... --amount <baseUnits> --cycle-id 1 \
//     --claim-start <unix> --claim-deadline <unix> --out-dir <dir>

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalStringify } from "@bps/shared";
import { runSnapshotPipeline } from "./lock-snapshot/pipeline.js";
import { RpcChainReader } from "./lock-snapshot/rpc-reader.js";
import type { SnapshotRequest } from "./lock-snapshot/types.js";

function optArg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1] as string;
}

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= process.argv.length) {
    console.error(`FAIL: missing required argument --${name}`);
    process.exit(1);
  }
  return process.argv[i + 1] as string;
}

const rpc = process.env.ROBINHOOD_CHAIN_RPC_URL;
if (rpc === undefined || rpc === "") {
  console.error("FAIL: ROBINHOOD_CHAIN_RPC_URL not set");
  process.exit(1);
}

const req: SnapshotRequest = {
  chainId: BigInt(arg("chain-id")),
  lockingVault: arg("vault"),
  claimManager: arg("manager"),
  snapshotBlock: BigInt(arg("block")),
  expectedBlockHash: arg("block-hash"),
  enumerationStartBlock: BigInt(arg("start-block")),
  distributionAsset: arg("asset"),
  distributionAmount: BigInt(arg("amount")),
  cycleId: BigInt(arg("cycle-id")),
  claimStart: BigInt(arg("claim-start")),
  claimDeadline: BigInt(arg("claim-deadline")),
};
const outDir = arg("out-dir");

// Optional: NAME of a second env var holding a wide-range logs endpoint (archival providers can
// cap eth_getLogs ranges). The URL itself stays in the environment and is never printed.
const logsEnvName = optArg("logs-rpc-env");
const logsRpc = logsEnvName === undefined ? undefined : process.env[logsEnvName];
if (logsEnvName !== undefined && (logsRpc === undefined || logsRpc === "")) {
  console.error(`FAIL: --logs-rpc-env named ${logsEnvName} but that variable is not set`);
  process.exit(1);
}
const reader = new RpcChainReader(
  rpc,
  req.lockingVault as `0x${string}`,
  req.claimManager as `0x${string}`,
  req.snapshotBlock,
  logsRpc,
);

const result = await runSnapshotPipeline(reader, req);
mkdirSync(outDir, { recursive: true });
const files = {
  "canonical-snapshot.json": canonicalStringify(result.snapshot),
  "proof-bundle.json": canonicalStringify(result.proofBundle),
  "unsigned-publication.json": canonicalStringify(result.unsignedPublication),
} as const;
for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(outDir, name), body);
}
// Evidence envelope: the ONLY artifact allowed to carry a wall-clock timestamp.
writeFileSync(
  join(outDir, "evidence-envelope.json"),
  canonicalStringify({
    schemaVersion: "bps.snapshot.evidence-envelope/1",
    generatedUtc: new Date().toISOString(),
    observedChainHead: result.observedChainHead,
    canonicalSnapshotDigest: result.canonicalSnapshotDigest,
    proofBundleDigest: result.proofBundleDigest,
    onchainLeafParity: result.onchainLeafParity,
    classification: result.snapshot.classification,
  }),
);
console.log(
  JSON.stringify(
    {
      status: "OK",
      participants: result.snapshot.includedParticipantCount,
      totalEffectiveWeight: result.snapshot.totalEffectiveWeight,
      entitlementTotal: result.snapshot.entitlementTotal,
      dust: result.snapshot.dust,
      merkleRoot: result.snapshot.merkleRoot,
      canonicalSnapshotDigest: result.canonicalSnapshotDigest,
      proofBundleDigest: result.proofBundleDigest,
      onchainLeafParity: result.onchainLeafParity,
      outDir,
    },
    null,
    2,
  ),
);
