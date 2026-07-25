# BPS Protocol — Continuity Changelog (append-only)

> **Append-only.** Never rewrite or delete earlier entries. Add a new dated entry at the TOP for every
> material project-state change (source/config change, dependency upgrade, deployment or live transaction,
> changed addresses/hashes/nonces/balances/roles/allowances, new test results, new artifacts,
> infrastructure change, legal/compliance change, product/economic decision, discovered bug or security
> finding, completed milestone, or changed blockers/next actions). Never record secrets or credential-bearing
> URLs here. This file complements the fuller narrative in `HANDOVER.md` "Historical change log".

## 2026-07-25 — TASK 10I-1: oracle-semantics correction + decision pack (commit `6cb33745`)

- **Type:** critical correction + policy consolidation. NO quote, key operation, wallet,
  signature, broadcast, allowance, selector/feed/policy approval, deployment, mainnet mutation,
  nonce-8 use, dependency/lockfile change, push, or PR. Continuity gate followed exactly.
- **CRITICAL FIX:** official docs verified (Chainlink tokenized-equity + Robinhood oracle pages):
  Stock-Token Chainlink feeds return the PER-TOKEN USD price with uiMultiplier ALREADY included;
  REST /prices is raw-underlying. The 10H-1 guard multiplied by uiMultiplier (raw-underlying
  model) — in production configuration it would have DOUBLE-APPLIED the multiplier (a 10x split
  would loosen the price floor 10x). `price-guard.ts` rewritten: typed semantics
  (PER_TOKEN_CHAINLINK direct; RAW_UNDERLYING gated evidence-only, multiplier exactly once),
  two-feed expected-output model (WETH-USD in / NVDA-token-USD out), oraclePaused +
  pending-multiplier + L2-sequencer fail-closed machinery. 79/79 rialto tests (all 20 required
  arithmetic/corporate-action cases incl. split continuity + double-apply unrepresentability,
  independently hand-derived).
- **Enforcement boundary recorded:** TS guard = trusted-server only; on-chain has NO independent
  price check (operator-supplied minStockOut) — minimal future coordinator-level oracle floor
  documented, NOT made.
- **Rialto facts corrected:** /quote = NON-BINDING, NON-SIGNED, NON-BROADCAST QUOTE RETRIEVAL
  returning a firm executable payload + server-stored quote_id; feature 2 direct vs 3 gasless;
  allowance vs Permit2; no documented selector/ABI; replay semantics undocumented. Dated
  corrections appended to 10H artifacts; superseded hashes preserved (evidence 979f351d… ->
  63d94b7a…; report 7b0c88c6… -> ad298ebf…).
- **Decision pack:** `docs/decisions/BPS_RIALTO_ACCESS_AND_PRICE_RISK_DECISION_PACK_2026-07-25.md`
  — 24 decisions, ALL PROPOSED — NOT APPROVED, incl. drafted (NOT sent) quote:read access request.
- **Suites:** rialto 79/79; boundary 2/2; focused Foundry 126/126; full forge (fork env) 418/418;
  npm run check PASS; scans clean. Mainnet before/after IDENTICAL; fresh feature-2 re-resolution
  (block 19115535) identical router. B-3 remains PARTIAL — RIALTO QUOTE ACCESS REQUIRED (+
  APPROVED PRICE AND RISK POLICY REQUIRED / VENUE SELECTOR UNVERIFIED / VENUE REPLAY SEMANTICS
  UNRESOLVED / LEGAL ELIGIBILITY UNRESOLVED).
- **Backup:** archive `bps-experiment-oracle-semantics-2026-07-25-6cb33745.tar.gz` (size/SHA in
  report; extraction-verified). Off-device: PENDING.
- **Next:** founder/counsel decision-pack approvals + send access request; engineering resumes on
  approvals.

## 2026-07-25 — TASK 10H-2: review + checkpoint of the Rialto boundary (commit `adaddceb`)

- **Type:** review + preservation. NO wallet, secret, signature, quote, order, broadcast, trade,
  allowance change, deployment, root publication, mainnet mutation, nonce-8 use, dependency/lockfile
  change, push, or PR. Continuity gate followed (exact 5M+8?? tree reconciled; cycle 1 re-verified
  UNPUBLISHED; nonces 16 / 8/8; all accepted artifacts byte-identical).
- **Review findings:** rialto code diff confirmed to be exactly the intended 6 hardening lines;
  `docs/audit/rialto/2026-07-25/` correctly absent (no quote); no web caller of the quote client
  exists (no endpoint-injection path); cited Foundry settlement tests spot-verified substantive
  (hostile LIE_OVER + `_assertNoStateChange`; real re-entry attempt). **Corrections:** (1) 7-case
  decimal×multiplier arithmetic matrix added to `price-guard.test.ts` (18/6/8-decimal combinations,
  10x split, 0.5x reverse split, 2^200-scale inputs, conservative floor) — rialto suite now
  **76/76**; (2) trust-model clarification recorded: `nowSec`/`resolvedRouter` are injected only by
  the trusted server boundary, with on-chain adapter enforcement authoritative regardless; (3)
  re-affirmed expiry revalidation ≠ durable venue replay protection. Classification upheld:
  **`PARTIAL — RIALTO QUOTE ACCESS REQUIRED`** (price/risk policy + venue replay semantics
  independently recorded as unresolved).
- **Fresh external recheck (block 19078598):** feature-2 router identical
  (`0xc94135b63772b91d79d0a2daab2a8801f32359bd`, code hash `0xa7041268…7611`).
- **Evidence hashes:** submitted `e7bc7e6a…006e` / `2b87cde1…41df` → **final** evidence
  `979f351d9a88c8f0058628417da46a8809d4a394e4440ec42025f3dd87e8d1b8`, report
  `7b0c88c6b11a9bda072241378b5c289f62fbd64d846c43ce4b13a0dae4d75a87`.
- **Checkpoint commit:** `adaddceb09302db78e36fdb294494fe71df0e43b` —
  `feat(rialto): harden production venue boundary` (13 reviewed paths; staged list displayed and
  verified free of secrets/lockfile/production/registry changes).
- **Suites at checkpoint:** rialto 76/76; web boundary 2/2; focused Foundry 126/126; full forge
  (fork env) 418/418; `npm run check` PASS; prettier/diff-check/JSON/secret/manifest checks clean.
  Mainnet before/after IDENTICAL (zero acquisitions; publication state unchanged).
- **Backup:** new archive `bps-experiment-rialto-boundary-2026-07-25-adaddceb.tar.gz` outside the
  repo (size/SHA in task report; extraction-verified). **Off-device: PENDING.** Snapshot-pipeline
  archive status preserved as COMPLETE — USER VERIFIED 2026-07-25.
- **Next:** authorized Rialto API access + approved selector and price/risk decision pack, then
  rerun the boundary against a real read-only quote. B-1 audit not begun; B-2 legal unresolved.

## 2026-07-25 — TASK 10H-1: Rialto production boundary (B-3) — `PARTIAL — RIALTO QUOTE ACCESS REQUIRED`

- **Type:** production-boundary hardening. NO wallet, secret, signature, broadcast, trade, allowance
  change, deployment, mainnet mutation, root publication, nonce-8 use, dependency change, commit,
  push, or PR. Continuity gate followed (exact state match; cycle-1 verified UNPUBLISHED on-chain).
- **Backup:** snapshot-pipeline archive recorded **COMPLETE — USER VERIFIED 2026-07-25**
  (`bps-experiment-snapshot-pipeline-2026-07-25-9043476.tar.gz`, 149,996,786 B, SHA-256
  `5b45c966…e6d0`; user-verified destination-side evidence, not independently inspected).
- **External truth (read-only, block 19062620):** registry `0x71a120Cb…687E` live (hash matches);
  **feature 2 → router `0xc94135b63772b91d79d0a2daab2a8801f32359bd`** (24,232 B, hash
  `0xa7041268…7611`, initialized + not paused); WETH hash matches; NVDA identity verified by
  address + code hash vs the official-registry record (uiMultiplier 1e18, not halted) — labeled
  TECHNICAL VENUE VALIDATION ASSET, not a production basket.
- **Quote access:** RIALTO_API_URL/RIALTO_API_KEY unconfigured (booleans only) → no real quote, none
  fabricated → classification per instruction. **Hardening shipped (fail-closed, policy-neutral):**
  `quote-structural.ts` (live-router equality, EMPTY-default approved-selector schemas, forbidden
  multicalls, decode + canonical re-encode round-trip, role binding, expiry), `price-guard.ts`
  (integer-only independent price guard w/ uiMultiplier handling; missing policy/feed fails closed),
  `boundary-status.ts` (never-overstating consumer states; MAINNET_SETTLEMENT_CONFIRMED unproducible
  here), quote-client `redirect:"error"`. Settlement review: frozen contracts already satisfy every
  section-9 requirement — mapped to named Foundry tests; **no contract change**.
- **Suites:** rialto vitest **69/69** (39 new); web boundary 2/2; adapter/vault/coordinator Foundry
  126/126; full forge (fork env) 418/418; `npm run check` PASS; prettier/git-diff/JSON/secret scans
  clean; prior artifacts byte-identical. Mainnet before/after IDENTICAL (zero acquisitions).
- **Remaining B-3:** authorized API access; selector pinning from a real quote; approved
  price/staleness/deviation/cap policies; venue replay/nonce semantics. Legal eligibility (B-2)
  unresolved; audit (B-1) not begun; BPSC remains a canary. Changes left **uncommitted for review**.
- **Evidence:** `docs/audit/BPS_RIALTO_PRODUCTION_BOUNDARY_2026-07-25.{md,evidence.json}`.
- **Next:** authorized Rialto API access + real read-only quote rerun; audit (B-1) in parallel.

## 2026-07-25 — TASK 10G-2: review + checkpoint of the snapshot pipeline (commit `9043476`)

- **Type:** review, reproducibility hardening, preservation. NO wallet, secret, signature, broadcast,
  deployment, mainnet mutation, root publication, nonce-8 use, dependency VERSION change, push, or PR.
  Continuity gate followed (exact state match; tester nonce live 8/8; all artifact hashes exact;
  correct repository confirmed as `C:\Projects\bps-experiment` — the `bps-protocol` path was an error).
- **Review corrections:** (1) **dual-endpoint pinned-hash guard** (`LOGS_ENDPOINT_HASH_MISMATCH`) — a
  separate logs endpoint must agree on the pinned block hash, not only the chain id, before scan
  results are combined; exercised live in the reproduction runs. (2) **Dependency-metadata hardening**
  (not an upgrade): `@bps/indexer` explicitly declares `@bps/shared 0.0.0`,
  `@openzeppelin/merkle-tree 1.0.8`, `viem 2.55.8`; lockfile updated offline (`--package-lock-only
--offline`) — diff is exactly the apps/indexer dependency edge, ZERO external
  version/resolved/integrity changes.
- **Reproduction:** two fresh CLI runs byte-identical to each other AND the committed artifacts.
  Values reproduced exactly: candidates 1, included 1, total weight `523101036779224972875501`,
  distribution `230074787421624000`, entitlement total `230074787421624000`, dust 0. Root
  `0xbf4a88b5ca7b12117c8fb9df350017c6c42ba27dc16d0dfad1499536a529aebb`; canonical digest
  `0x893042b8b6c7ed1466958ce7f38964ffb6826597607431229183dd3ffef4c0c0`; proof-bundle digest
  `0xbd8a1a7184b2c519341781fecaae8abd8176df7639decf347aab3d69081d7fa3`.
- **Coverage validated:** all 31 map entries point to named tests/guards or justified INAPPLICABLE;
  `LockingVaultWeight.testWeightBoundariesUnwithdrawn` inspected — asserts bonus at unlockTime−1,
  base 1.00x at exactly unlockTime (exact expiry boundary genuinely exercised). Classification
  **`SNAPSHOT PIPELINE PASS` upheld**. Scope: INF-3 closed for deterministic block-pinned snapshot
  enumeration ONLY; persistent DB indexing = INF-1; provider (archival + wide-logs) config remains an
  operational prerequisite; NOT a continuous production indexer.
- **Evidence hashes:** superseded (pre-review) `3935c05a…9e22` / `81569855…3ef1`; **final**
  evidence `aa7aa1f709bc323eaeecf73849bbf53f6df6b3ffcddcbf0c2ea83f71623a98f8`, report
  `4b6089c653c0622db979cd328a721926ae3b07817f81a6e90f19db9c9265ba07`.
- **Checkpoint commit:** `9043476509a9c7f662c5cf580f50e5ae1e0a382d` —
  `feat(indexer): checkpoint production snapshot pipeline` (25 reviewed paths; staged list verified
  free of secrets/deps/caches/canary/production changes).
- **Suites at checkpoint:** indexer vitest 37/37; `npm run check` PASS; forge (fork env) 418/418;
  prettier clean; `git diff --check` clean; all JSON parses; secret scan clean; mainnet before/after
  IDENTICAL (16/16, 8/8, no nonce-8 tx).
- **Backup:** new archive `bps-experiment-snapshot-pipeline-2026-07-25-9043476.tar.gz` outside the
  repo (size/SHA in the task report; extraction-verified). **Off-device: PENDING.** All earlier
  archive statuses preserved unchanged.
- **Next:** production Rialto venue integration and settlement hardening (B-3) — not begun.

## 2026-07-25 — TASK 10G-1: production snapshot pipeline — `SNAPSHOT PIPELINE PASS`

- **Type:** production-hardening implementation (indexer + artifacts). NO wallet, key, signer,
  signature, broadcast, eth_sendTransaction/eth_sendRawTransaction, deployment, mainnet mutation,
  nonce-8 use, dependency change, commit, push, or PR. Read-only RPC only. Continuity gate followed.
- **Prompt-path discrepancy recorded:** the task named `C:\Projects\bps-protocol` — a different, older
  repository (HEAD `d03458ba…`, superseded doc copies). The expected branch/HEAD/tree exist uniquely in
  `C:\Projects\bps-experiment` (also the CLAUDE.md scope), where the task executed.
- **Off-device backup:** rehearsal archive `bps-experiment-rehearsal-2026-07-25-d699f7ae.tar.gz`
  (149,833,975 B, SHA-256 `6e685258…1039`) recorded **COMPLETE — USER VERIFIED 2026-07-25**
  (user-verified; destination copy not independently inspected). The earlier checkpoint archive's
  historical status remains unchanged.
- **Built (closes the two 10F-1 limitations):** `apps/indexer/src/lock-snapshot/` — fail-closed,
  deterministic, indexer-backed candidate enumeration (LockCreated scan from the vault deployment
  block) + authoritative block-pinned effective weights (`lockCount`/`positionWeightAt` via pinned
  `eth_call`) + approved floor-rule entitlements + canonical StandardMerkleTree/LEAF_ABI_TYPES leaves
  - chain-bound artifacts (canonical snapshot, proof bundle, evidence envelope, UNSIGNED publication
    payload whose content hashes are the REAL canonical digests — placeholder hashes retired) + read-only
    consumer boundary + `snapshot-cli`. All artifacts labeled `TECHNICAL CANDIDATE SNAPSHOT — LEGAL
ELIGIBILITY UNVERIFIED — NOT AUTHORIZED FOR PUBLICATION`.
- **Pinned mainnet demonstration (block 18791290, hash `0x2d332bb0…516f`):** 1 candidate discovered
  (the live tester lock), total effective weight `523101036779224972875501` (matches canary + 10F-1
  values, independently re-derived), entitlement + dust reconcile exactly, Merkle root
  `0xbf4a88b5…aebb`, **on-chain `leafFor` parity 1/1 against the deployed DistributionClaimManager**,
  **two-run byte-identical** canonical artifacts (a first-cut determinism defect — live chain head
  embedded in the canonical artifact — was caught by this check and fixed). Artifacts under
  `docs/audit/snapshots/robinhood-4663-block18791290/`.
- **Infrastructure finding (INF-2 evidence):** archival provider caps `eth_getLogs` to 10-block
  ranges; public fallback RPC has pruned historical state. Pipeline supports a split-endpoint mode
  (archival primary + wide-range logs endpoint, chain-id cross-verified).
- **Suites:** indexer vitest **37/37** (6 files incl. 19 fail-closed negatives + 5 parity + 4
  consumer); full `forge test` (fork env) **418/418**; `npm run check` PASS. 31-condition negative
  coverage map (each → named test/guard or INAPPLICABLE with reason) in the evidence manifest.
- **Statuses:** INF-3 **CLOSED** for pinned-snapshot generation (persistent-DB indexer remains
  INF-1); legal eligibility (B-2) UNRESOLVED; Rialto (B-3) UNADDRESSED; audit (B-1) not begun; NO
  root published; production readiness NOT established. Mainnet non-mutation proven (before/after
  identical; nonces 16/16, 8/8). All 10G-1 changes left **uncommitted for review**.
- **Evidence:** `docs/audit/BPS_PRODUCTION_SNAPSHOT_PIPELINE_2026-07-25.{md,evidence.json}`.
- **Next:** production Rialto venue integration and settlement hardening (B-3) — not begun.

## 2026-07-25 — TASK 10F-1 review + checkpoint (commit `d699f7ae`)

- **Type:** review, preservation and backup only. NO wallet, secret, live signature, broadcast,
  deployment, mainnet transaction, nonce-8 use, dependency change, push, or PR. Continuity gate
  followed (state matched the expected branch/HEAD/tree exactly; tester nonce live-confirmed 8/8).
- **Review findings/corrections:** all 10F-1 changes verified in scope (no production contract,
  registry, or operator change; `foundry.toml` + `.prettierignore` additions narrow; the
  `mainnet-snapshot-check.mjs` helper proven strictly read-only, never printing the RPC URL;
  `rehearsal-evidence/` holds only the 1,220-byte raw evidence JSON; canary artifacts byte-identical,
  `exec/` MANIFEST 5/5). **Corrections during review:** (a) `ForkLifecycleProbe.t.sol` classified as
  intentionally RETAINED with a recorded justification (regression guard for the NVDA storage-slot +
  transferability assumptions); (b) an explicit one-to-one **`negativeCoverageMap`** (all 21 required
  negative/boundary conditions → exact fork assertion or named unit test; none UNPROVEN) was added to
  the evidence manifest, changing its SHA-256 to
  `2557a3d782bd38b2c679902578f7bc5519b7b0e5f82f9fdea85e28a77d5cb065` (the pre-review hash `b934289c…`
  appeared only in then-uncommitted text and was corrected before any commit).
- **Evidence re-verified independently:** claim sum 230,074,787,421,623,997 + 3 dust ==
  230,074,787,421,624,000 distribution; distribution + reserve == 287,593,484,277,030,000 acquired;
  custody conservation, weights total, per-wallet floor formula, fork pin block/hash + chainId 4663 —
  all recomputed and matching across the raw JSON, report, and manifest.
- **Checkpoint commit:** `d699f7aea2d8ec7ebf47de8a9d2789791b8da92f` —
  `test(contracts): checkpoint distribution lifecycle rehearsal` (11 reviewed paths; staged list
  verified free of secrets/deps/caches/canary modifications).
- **Suites at checkpoint:** focused fork tests PASS; full `forge test` (fork env) 418/418;
  `npm run check` PASS; prettier clean; `git diff --check` clean; all JSON parses.
- **Backup:** prior checkpoint archive status preserved as **COMPLETE — USER VERIFIED 2026-07-25**
  (historical; not overwritten). NEW dated recovery archive
  `bps-experiment-rehearsal-2026-07-25-d699f7ae.tar.gz` created outside the repository (includes
  `.git` at the new checkpoint + uncommitted continuity metadata + all rehearsal evidence/tests;
  excludes secrets/deps/build output); size + SHA-256 in the task report; extraction-verified.
  **Off-device encrypted transfer: PENDING** until the user independently copies and verifies it.
- **Next milestone:** production hardening + independent security review (NOT begun).

## 2026-07-25 — TASK 10F-1: distribution-lifecycle fork rehearsal — `REHEARSAL PASS`

- **Type:** fork-only rehearsal. NO wallet, key, signature, broadcast, deployment, live transaction,
  nonce-8 use, dependency change, commit, or push. Continuity gate followed (state matched exactly;
  all four canonical artifact values re-verified before work).
- **Off-device backup:** recorded **COMPLETE — USER VERIFIED 2026-07-25** (user confirmation of the
  encrypted off-device copy of `bps-experiment-checkpoint-2026-07-25-6ace4803.tar.gz`, 149,713,634 B,
  SHA-256 `a971760fa0748b6eeebb8f8ee3a196735e4163890fa3d673c8c8ddf8136f374d`; not independently
  inspected by Claude).
- **Rehearsal:** Foundry in-process fork of Robinhood Chain pinned at block **18791290** (hash
  `0x2d332bb0…516f`, verified vs the canary evidence manifest AND upstream). Exercised the REAL
  deployed canary contracts end-to-end: 3 official buys + 1 sell with exact 2%/1% and 2%/2% fee
  reconciliation; acquisition of the full vault custody (287,593,484,277,030 wei WETH — canary
  accrual + rehearsal accrual, conservation exact); **simulated** RWA settlement (dev-only
  `MockRialtoRouter` substituted for the Rialto venue via fork-local `vm.mockCall` of
  `registry.ownerOf(2)`; real adapter code ran; real NVDA delivered); exact 80/20 split; locks
  7d/14d/21d + the live tester lock; deterministic snapshot; canonical Merkle root
  `0xefcc033c…2cee`; publication via the authorized coordinator path; 4/4 exact claims; 14 negative
  tests (auth, proof, replay, deadline, pause, under-delivery atomic rollback); dust (3 units)
  recovered; manager ends at zero residue.
- **Mainnet non-mutation PROVEN:** before/after read-only snapshots identical — deployer 16/16,
  tester 8/8 (no nonce-8 tx), vault WETH, supply, lock, allowances, pool/LP unchanged. Primary
  control: no signing/broadcast-capable command existed in the flow.
- **Suites:** focused fork test PASS; `forge test` (fork env) **418/418** (47 suites); `npm run
check` PASS. New files: `packages/contracts/test/ForkDistributionLifecycle.t.sol`,
  `test/ForkLifecycleProbe.t.sol`, `packages/contracts/canary-packet/mainnet-snapshot-check.mjs`,
  `docs/audit/BPS_DISTRIBUTION_LIFECYCLE_FORK_REHEARSAL_2026-07-25.{md,evidence.json}` (evidence
  SHA-256 `2557a3d782bd38b2c679902578f7bc5519b7b0e5f82f9fdea85e28a77d5cb065`); config:
  `foundry.toml` fs_permissions += `./rehearsal-evidence`, `.prettierignore` += that output dir.
- **NOT proven:** real Rialto venue settlement (quote/selector/eligibility — B-3), indexer-backed
  wallet enumeration, TS PoD artifacts bound to chain state, legal eligibility, production
  readiness. BPSC remains a canary. All 10F-1 changes left **uncommitted for review**.
- **Next:** production hardening + independent security review (HANDOVER.md §O step 3).

## 2026-07-25 — Post-canary local git + backup checkpoint (commit `6ace4803`)

- **Type:** preservation only. No push, PR, deployment, transaction, wallet action, approval change,
  dependency change, or TASK 10F-1 work. Continuity gate followed (documented vs actual state matched
  exactly before work).
- **Commit:** `6ace4803b5b637a58c122e2c89d5216a76dfe48d` — `docs(continuity): checkpoint completed BPSC
canary` on `master` (parent `7428f7470ad9805f1563ca3be57573e4257a05d4`). **182 files** committed: the
  master handover + continuity files, `CLAUDE.md` gate, canary completion evidence
  (`docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.{md,evidence.json}`), the full
  `packages/contracts/canary-packet/` deliverable set (14 accepted ZIPs incl. v9 + `exec/` bundle +
  scripts), lint-config exclusions, and a new `.gitattributes` pinning
  `packages/contracts/canary-packet/**` + `docs/audit/*.evidence.json` to `-text` so future checkouts
  restore byte-identical evidence (staged blobs verified: v9 ZIP `0c958a58…b74d`, evidence JSON
  `d6005083…8ec3`).
- **Pre-commit verification:** v9 ZIP SHA-256 + size (578,871) exact; recovery authorization digest
  `0xc50d97d7…8314` proven via offline verifier 61/61; delivered `exec/` MANIFEST integrity 5/5
  (105/105 files byte-identical); `CURRENT_STATE.json` parses; `git diff --check` clean; secret scan of
  all 181 staged paths + text contents clean (no keys, credentials, RPC URLs; only prohibition text and
  scanner regexes matched); no `.env` present (only `.env.example`); `node_modules`/build caches excluded
  by `.gitignore`.
- **Backup:** dated recovery archive created OUTSIDE the repository (includes `.git`; excludes
  node_modules, build output, logs, any `.env`); path/size/SHA-256 recorded in the task report.
  **Encrypted off-device transfer: PENDING** — the archive exists only on this machine until the owner
  copies it to encrypted external storage per `docs/continuity/BACKUP_AND_RECOVERY.md`.
- **Status after change:** working tree clean at `6ace4803` except these post-checkpoint continuity
  updates (intentionally uncommitted). Next task: **TASK 10F-1 distribution-lifecycle fork rehearsal**
  (not started).

## 2026-07-25 — TASK 10F: authoritative master handover + continuity system created

- **Type:** documentation / continuity-control only. No code, contract, deployment, transaction, wallet,
  dependency, commit, or push action occurred. Working tree left uncommitted.
- **Branch / HEAD at time of change:** `master` / `7428f7470ad9805f1563ca3be57573e4257a05d4`.
- Restructured `HANDOVER.md` into the authoritative, self-contained master handover: prominent verified
  SNAPSHOT, "START HERE — FRESH CLAUDE CODE TAKEOVER", full sections A–Q, decision register, blocker tables,
  bounded next-milestone spec, command cookbook (classified READ-ONLY/LOCAL/FORK/LIVE), disaster-recovery
  checklist. Preserved the prior detailed change log verbatim under "PART III — PRESERVED HISTORY".
- Created `docs/continuity/CURRENT_STATE.json` (machine-readable state; validated as parseable),
  `docs/continuity/CHANGELOG.md` (this file), `docs/continuity/BACKUP_AND_RECOVERY.md`.
- Added the **MANDATORY BPS CONTINUITY GATE** to `CLAUDE.md` (preserving all existing instructions).
- **Facts re-verified live (read-only, block 18821299, chainId 4663):** deployer nonce 16/16, tester nonce
  8/8 (no nonce-8 tx). Artifact hashes re-checked on disk: v9 ZIP `0c958a58…b74d`, evidence manifest
  `d6005083…8ec3`.
- **Conflicts recorded (not silently resolved):** DOC-1 — deploy registry `predicted` addresses are offset
  vs actual on-chain deployment and its `actual` map is null (on-chain + evidence manifest are
  authoritative); DOC-2 — historical test counts (TASK 9: forge 398 / web 129) vs current re-run
  (416 / 177), current authoritative with the older labeled as baseline.
- **Status after change:** canary COMPLETE + reconciled; production NOT deployed (NO-GO stands); next
  milestone = distribution-lifecycle fork rehearsal.

## 2026-07-25 — TASK 10E-1: post-canary mainnet reconciliation + evidence checkpoint (milestone)

- **Type:** read-only reconciliation + evidence artifacts + docs. No mainnet write; nothing committed.
- All 19 BPSC-TEST canary transactions confirmed COMPLETE on Robinhood Chain mainnet; tester nonces 2–7
  (original steps 14–19) independently reconstructed on chain and verified byte-exactly against the v9
  canonical. Final nonces deployer 16/16, tester 8/8 (no nonce-8). Full protocol state, fee accrual, burns,
  lock (lockId 0, unlock 2026-07-31T23:02:26Z), balances, and allowances verified.
- Created `docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.md` and
  `docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.evidence.json` (SHA-256 `d6005083…8ec3`), plus the
  read-only `packages/contracts/canary-packet/post-canary-reconcile.mjs`.
- Config: excluded `packages/contracts/canary-packet/` from repo prettier/eslint. Suites re-run without
  dependency changes: canary VERIFY-ALL PASS (9 suites); `npm run check` PASS (web vitest 177/177, forge
  416/416).

## Prior history

Detailed engineering history for TASK 10D-8 and earlier (canary recovery operator v5→v9, TASK 9 release
review, TASK 8 application, contract layer, PoD pipeline) is preserved in `HANDOVER.md` under
"PART III — PRESERVED HISTORY". This continuity changelog begins at TASK 10E-1; earlier entries were not
retroactively fabricated here.
