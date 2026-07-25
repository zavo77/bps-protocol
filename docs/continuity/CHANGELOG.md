# BPS Protocol — Continuity Changelog (append-only)

> **Append-only.** Never rewrite or delete earlier entries. Add a new dated entry at the TOP for every
> material project-state change (source/config change, dependency upgrade, deployment or live transaction,
> changed addresses/hashes/nonces/balances/roles/allowances, new test results, new artifacts,
> infrastructure change, legal/compliance change, product/economic decision, discovered bug or security
> finding, completed milestone, or changed blockers/next actions). Never record secrets or credential-bearing
> URLs here. This file complements the fuller narrative in `HANDOVER.md` "Historical change log".

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
