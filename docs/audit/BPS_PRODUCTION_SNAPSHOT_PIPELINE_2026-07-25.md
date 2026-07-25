# BPS Production Snapshot Pipeline — 2026-07-25 (TASK 10G-1)

**Classification: `SNAPSHOT PIPELINE PASS`**

> This pipeline does not establish legal eligibility.
> This pipeline does not authorize root publication.
> No Merkle root was published to mainnet.
> No real RWA acquisition or settlement occurred.
> BPSC remains a canary and is not canonical BPS.
> This task does not establish production readiness or deployment authorization.

Machine-readable evidence:
[`BPS_PRODUCTION_SNAPSHOT_PIPELINE_2026-07-25.evidence.json`](./BPS_PRODUCTION_SNAPSHOT_PIPELINE_2026-07-25.evidence.json).
Repository-path note: the task prompt named `C:\Projects\bps-protocol`, which is a **different, older
repository** (superseded doc copies, HEAD `d03458ba…`); the expected branch/HEAD/tree exist uniquely in
`C:\Projects\bps-experiment`, where this task executed (recorded, not silently resolved).

## What was built (closes the two 10F-1 limitations)

1. **INF-3 — indexer-backed participant enumeration** (`apps/indexer/src/lock-snapshot/`):
   a deterministic, fail-closed scan of `BPSLockingVault` `LockCreated`/`LockWithdrawn` events from the
   vault's deployment block to an explicitly pinned snapshot block. Event history discovers CANDIDATES
   only; **authoritative effective weight comes from block-pinned `eth_call` reads**
   (`lockCount` + `positionWeightAt` at the pinned block/timestamp) — never from event replay.
   Fail-closed guards: chain-id mismatch, missing block, block-hash mismatch (reorg protection),
   indexer-behind, incomplete coverage (vault code existing before the scan start), vault-not-deployed,
   malformed/duplicate records, unpinned reads, historical-state-unavailable, cross-endpoint chain check.
2. **Chain-bound Proof-of-Distribution artifacts** replacing the 10F-1 placeholder hashes: canonical
   snapshot JSON, participant proof bundle, evidence envelope, and an **unsigned** `publishCycle`
   payload whose `allocationsContentHash`/`manifestEnvelopeHash` are the REAL canonical digests. The
   payload is classified `UNSIGNED_DO_NOT_BROADCAST — NOT AUTHORIZED FOR PUBLICATION` and cannot execute
   as-is (no recorded acquisition exists; the manager's owner is the coordinator).

Every artifact is labeled:
`TECHNICAL CANDIDATE SNAPSHOT — LEGAL ELIGIBILITY UNVERIFIED — NOT AUTHORIZED FOR PUBLICATION`.

## Pinned mainnet demonstration (observed state, read-only)

| Item                      | Value                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chain / block / hash      | 4663 / **18791290** / `0x2d332bb08395b53f571015af9959d1a0e9c68baec300265b08fe77b38ef1516f`                                                                                           |
| Enumeration window        | 18395614 (vault deployment, coverage-guard-proven) → 18791290                                                                                                                        |
| Candidates → included     | 1 → 1 (the live canary tester lock; 0 zero-weight exclusions)                                                                                                                        |
| Total effective weight    | **523,101,036,779,224,972,875,501** — matches the canary evidence + 10F-1 rehearsal value exactly, independently re-derived via pinned reads                                         |
| Distribution (demo input) | 230,074,787,421,624,000 NVDA base units (the 10F-1 figure; no real distribution exists)                                                                                              |
| Entitlement / dust        | 230,074,787,421,624,000 / **0** (single participant; `total + dust == amount` exact)                                                                                                 |
| Merkle root               | `0xbf4a88b5ca7b12117c8fb9df350017c6c42ba27dc16d0dfad1499536a529aebb`                                                                                                                 |
| Canonical snapshot digest | `0x893042b8b6c7ed1466958ce7f38964ffb6826597607431229183dd3ffef4c0c0`                                                                                                                 |
| Proof-bundle digest       | `0xbd8a1a7184b2c519341781fecaae8abd8176df7639decf347aab3d69081d7fa3`                                                                                                                 |
| **On-chain leaf parity**  | **1/1** — the deployed `DistributionClaimManager.leafFor` at the pinned block equals the TypeScript leaf (enforced in-pipeline)                                                      |
| Two-run determinism       | **byte-identical** canonical artifacts across two independent CLI runs (`cmp`); a first-cut defect (live chain head inside the canonical artifact) was found by this check and fixed |

Artifacts: `docs/audit/snapshots/robinhood-4663-block18791290/{canonical-snapshot, proof-bundle,
unsigned-publication, evidence-envelope}.json` (digest-bound; directory excluded from reformatting).

## Cross-language parity

`viemLeafHashRaw` AND the pipeline's `StandardMerkleTree.leafHash` both reproduce the audited Solidity
vector (`LeafVector.t.sol`: leaf `0xac90578a…`, root `0x9b85d4ff…`); sorted-pair proof processing
reproduces the audited root; domain fields (chain, manager, cycle) cannot be substituted; invalid EIP-55
casing is rejected fail-closed; live `leafFor` equality holds on the deployed manager (above).

## Consumer boundary

`lookupParticipant` returns the exact entitlement + verifying proof for included wallets and **null** for
missing or zero-weight wallets (no fabricated entitlement); `aggregateView` reads only the canonical
artifact and reports `publicationStatus: NOT PUBLISHED — NOT AUTHORIZED`.

## Verification

| Suite                                                                  | Result                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Focused indexer vitest (enumeration/pipeline/negative/parity/consumer) | **37/37** (6 files)                                                                              |
| Full `forge test` (fork env)                                           | **418/418** (47 suites)                                                                          |
| `npm run check` (full gate)                                            | PASS end-to-end                                                                                  |
| Two-run artifact comparison                                            | byte-identical                                                                                   |
| Mainnet before/after (read-only)                                       | IDENTICAL — deployer 16/16, tester **8/8**, no nonce-8 tx, locks/allowances/vault/pool unchanged |
| Canonical artifacts (v9 ZIP, canary + 10F-1 evidence)                  | byte-identical, reverified                                                                       |

The complete 31-condition negative/boundary coverage map (each condition → exact named test, named
Foundry suite, in-pipeline guard, or `INAPPLICABLE` with reason) is in the evidence manifest's
`negativeCoverageMap`. No required implemented control is UNPROVEN.

## Findings and remaining gaps

- **INF-2 evidenced concretely:** the archival provider caps `eth_getLogs` to 10-block ranges; the public
  fallback RPC serves wide log ranges but has **pruned historical state**. The pipeline therefore supports
  a split-endpoint mode (archival primary + wide-range logs endpoint, chain-id cross-verified). A
  production archival+wide-logs endpoint remains an infrastructure requirement.
- **INF-3: CLOSED** for pinned-snapshot generation (stateless indexer module + CLI). A persistent-DB
  indexer remains open as **INF-1**.
- Single real participant at the pin; multi-participant behavior proven with clearly-labeled
  `LOCAL_TEST_ONLY` fixtures only.
- Legal eligibility (B-2) unresolved; Rialto venue integration (B-3) unaddressed; independent audit (B-1)
  not begun; the `@bps/pilot` fixture pipeline remains fixture-only (self-declared fictional).

## TASK 10G-2 review corrections (2026-07-25)

Superseded pre-review hashes (recorded, not rewritten): evidence JSON `3935c05a…9e22`, report MD
`81569855…3ef1`. Corrections: (1) **dual-endpoint pinned-hash guard** — a separate logs endpoint must
now agree on the pinned block hash, not just the chain id (`LOGS_ENDPOINT_HASH_MISMATCH`); (2)
**dependency-metadata hardening** — `@bps/indexer` explicitly declares `@bps/shared`,
`@openzeppelin/merkle-tree` and `viem` at the existing pinned versions (lockfile updated offline;
zero external version/resolved/integrity drift). Two fresh reproduction runs remained byte-identical
to the committed artifacts. Final file hashes are in the 10G-2 checkpoint report.

## Recommended next task

**Production Rialto venue integration and settlement hardening (B-3)** — not begun.
