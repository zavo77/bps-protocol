# HANDOVER — BPS Protocol Master Handover (bps-experiment)

> **DOCUMENT PURPOSE.** This is the single authoritative continuity document for the BPS Protocol
> engineering repository. It exists so that a completely fresh Claude Code session — with zero prior
> conversation history — can open this repository, verify the facts, understand every project lane, and
> safely continue from the correct next task. **Read this entire document before acting.**
>
> **HANDOVER.md IS NOT A BACKUP OF THE REPOSITORY OR SECRETS.** See section Q (Disaster recovery).

## SNAPSHOT (verified)

| Field                       | Value                                                                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Last fully verified (UTC)   | **2026-07-25T07:10:56Z** (live chain re-check at block 18821299 the same hour)                                                                                                                                                                                                                  |
| Repository path             | `C:\Projects\bps-experiment`                                                                                                                                                                                                                                                                    |
| Branch                      | `master` (VERIFIED via `git branch --show-current`; note: tooling may claim a `main` default — no `main` branch is in use)                                                                                                                                                                      |
| HEAD                        | `535e75347c25bb4f253ab7449cd512761f22d74e` — `fix(rialto): close oracle semantics review findings` (2026-07-25; parent `6cb33745…`)                                                                                                                                                             |
| Working tree                | Clean at the checkpoint commit except the post-checkpoint continuity updates in `HANDOVER.md` + `docs/continuity/*` (intentionally uncommitted). All canary deliverables + evidence are now **tracked** at HEAD; `.gitattributes` pins them to byte-identical checkout (`-text`)                |
| Tags                        | none                                                                                                                                                                                                                                                                                            |
| Local backup                | Archive `bps-experiment-checkpoint-2026-07-25-6ace4803.tar.gz` (149,713,634 B, SHA-256 `a971760fa0748b6eeebb8f8ee3a196735e4163890fa3d673c8c8ddf8136f374d`); **off-device encrypted transfer COMPLETE — USER VERIFIED 2026-07-25** (user confirmation; not independently inspected by Claude)    |
| Current phase               | Post-canary. The 19-step BPSC-TEST mainnet canary is **COMPLETE and reconciled** (VERIFIED). Production BPS is **NOT deployed**.                                                                                                                                                                |
| Last completed milestone    | **TASK 10J-3 — persist oracle/feed metadata evidence + normalized founder D-1..D-24 decision register** (2026-07-25). Feed candidates block-pinned at 19223939; D-9/D-10 `OFFICIALLY IDENTIFIED CANDIDATE — NOT APPROVED / NOT CONFIGURED`, D-13 `UNRESOLVED`. Prior: 10I-2 ballot (`535e7534`) |
| Current active task         | none — evidence + decision register persisted; founder ballot decisions recorded (Group A founder-approved; B/quote/counsel gates open)                                                                                                                                                         |
| Exact next recommended task | Founder manually sends the drafted `quote:read` access request (decision = SEND MANUALLY) and returns Rialto's response for review; security/engineering + counsel gates (D-3/D-5/D-6/D-9/D-10/D-12/D-13/D-16/D-19/D-20/D-21/D-22B/D-23) remain; no selection is activated                      |
| Mainnet status              | BPSC-TEST canary live on Robinhood Chain (chainId 4663): 8 contracts, pool, LP NFT 371728, lock (unlock 2026-07-31T23:02:26Z). Final nonces deployer 16/16, tester 8/8 (VERIFIED live 2026-07-25). Tester nonce-8 delayed withdrawal **NOT executed, NOT authorized**.                          |
| Production status           | **NOT deployed. NO-GO stands** (TASK 7/9 verdicts; external blockers in §N unresolved). BPSC canary must NEVER be presented or reused as canonical BPS production.                                                                                                                              |
| Highest-priority blockers   | B-1 external security audit; B-2 legal/entity/jurisdiction placeholders; B-3 Rialto production terms + KYC path; B-4 founder authorizations (seed size, Safe setup, go decision); see §N                                                                                                        |
| Continuity files            | `docs/continuity/CURRENT_STATE.json`, `docs/continuity/CHANGELOG.md`, `docs/continuity/BACKUP_AND_RECOVERY.md` (this task)                                                                                                                                                                      |

Evidence labels used throughout: **VERIFIED** (confirmed from code/Git/tests/artifact/chain), **DECIDED**
(explicitly approved), **IMPLEMENTED** (present in current code), **PLANNED** (approved, not implemented),
**PROPOSED** (under consideration), **UNKNOWN** (evidence missing), **BLOCKED** (needs named dependency),
**SUPERSEDED** (no longer active). A proposal is never a decision; a specification is never implemented code.

---

## START HERE — FRESH CLAUDE CODE TAKEOVER

1. Assume you have **no trustworthy conversation history**. Everything you need is in this repository.
2. Read `CLAUDE.md` (role + scope + the MANDATORY BPS CONTINUITY GATE) and this entire file.
3. Read `docs/continuity/CURRENT_STATE.json` and all entries in `docs/continuity/CHANGELOG.md`.
4. Inspect Git before modifying anything: `git branch --show-current`, `git rev-parse HEAD`,
   `git status --short`. Compare with the SNAPSHOT above. **Stop and report any material discrepancy.**
5. Verify critical facts from primary evidence, in this precedence order:
   (1) live on-chain state + receipts → (2) accepted authorization/evidence artifacts
   (`docs/audit/*.evidence.json`, `packages/contracts/canary-packet/*.zip` SHA-256) → (3) source code,
   tests, deployment registries → (4) Git history → (5) decision records (`docs/BPS_LAUNCH_DECISIONS.md`,
   `docs/audit/TASK_10_FOUNDER_DECISION_PACK.md`) → (6) older handovers/summaries → (7) chat claims.
6. Treat unverified or conflicting facts as blockers, not as choices to make silently.
7. **Never treat an expired canary packet (v5–v9) as execution authorization.** They are evidence only.
8. **Never reuse BPSC-TEST as production.** A canonical BPS production launch requires a fresh, separately
   authorized deployment (see `docs/CANARY_RUNBOOK.md` §8).
9. **Never send tester nonce 8 or any live transaction** without a new, bounded, independently reviewed
   authorization task from the user.
10. Produce a takeover-readiness report (what you verified, discrepancies, proposed next step) and **wait
    for user approval before implementing anything**.

---

# PART I — MASTER ORIENTATION

## A. Executive project orientation

**What BPS Protocol is.** BPS Protocol (also referred to as the **BPS Capital Engine**) is RWA-distribution
infrastructure on **Robinhood Chain mainnet (chainId 4663)**. A fixed-supply ERC-20 (BPS) trades through an
**official trade route** (a dedicated router over canonical Uniswap v3). Each official-route trade takes a
protocol allocation in WETH that funds two things: (a) **Stock Token acquisition** — buying canonical
tokenized real-world equities (Robinhood “Stock Tokens”) that are then **allocated to eligible BPS
holders**, and (b) **BPS repurchase-and-burn** — a true totalSupply reduction. Holders lock BPS in a
locking vault to earn time/weight-multiplied eligibility; acquisitions are divided per a published mandate
(“Frontier 10”), snapshotted, and distributed via Merkle claims with on-chain, reproducible
**proof-of-distribution** accounting.

**User problem it solves.** Token holders normally have no verifiable link between protocol fee flow and
real-world value returned to them. BPS makes the whole chain — fee accrual → RWA acquisition → allocation →
claim — deterministic, on-chain, and independently reproducible (“proof of distribution”), instead of a
discretionary treasury promise.

**Proof of distribution (PoD).** A published cycle manifest (snapshot block, excluded addresses, eligible
supply, allocations, rounding method, terms + restricted-jurisdiction versions, Merkle root) plus on-chain
events lets anyone recompute exactly who was owed what and verify claims. Implemented as a deterministic
TypeScript pipeline in `packages/shared/src/proof-of-distribution/` + `packages/pilot` (mock, local-only
today) and on-chain `DistributionClaimManager` (IMPLEMENTED; not yet demonstrated end-to-end — see §O).

**Decentralization/transparency thesis.** DECIDED: BPS must NOT be described as fully decentralized while
privileged roles exist (Safe-controlled pause, owner roles). The thesis is _verifiability first_: every
allocation reproducible from public data; official-route volume clearly distinguished from raw pool volume.

**Intended users.** (1) BPS traders/holders seeking RWA-linked distributions; (2) participants who lock BPS
for weighted eligibility; (3) auditors/analysts verifying PoD; (4) the operator (founder) running capped,
reviewed acquisition cycles.

**Built vs planned (summary).** IMPLEMENTED + VERIFIED: full contract layer (frozen, 416 Foundry tests),
restricted-beta web app (Next.js, 177 vitest + Playwright E2E), PoD mock pipeline, Rialto server-only quote
client, canary execution/verification system, completed mainnet canary. PLANNED / NOT DEMONSTRATED: live
fee→acquisition→settlement→snapshot→claim lifecycle (next milestone rehearses it on a fork), indexer/worker
(health-check skeletons only), production deployment, public transparency app. See §B lanes.

**Explicitly out of scope (current phase).** Production deployment; any live transaction; Launch Lab
implementation inside Capital Engine contracts; fee-on-transfer token designs (DECIDED against for v1);
presenting SPCX exposure as SpaceX equity (must be described as exposure via an issuer's tokenized debt
security); describing BPS as audited or fully decentralized.

**BPS Protocol / Capital Engine vs BPS RWA Launch Lab.** The Capital Engine is THIS repository: the BPS
token, router, vaults, PoD, web app. The **Launch Lab** is a separate PROPOSED product lane (launchpad-style
issuance of new RWA-paired tokens, e.g. TICK/NVDA concepts). **No Launch Lab code exists in this
repository** (VERIFIED by file inventory); its specifications live in the founder's external planning
threads (out of repo scope per `CLAUDE.md`). It must not be mixed into Capital Engine contracts without a
separately approved milestone (see §L).

**Why BPSC is not production.** The mainnet canary used `BPSCanaryToken` (“BPS Canary — TEST ONLY”,
`BPSC-TEST`, `IS_CANARY = true`) with tiny capped economics ($130 all-inclusive) purely to prove the
deployment/execution machinery under real mainnet conditions. `docs/CANARY_RUNBOOK.md` §8 (DECIDED):
after the canary, canonical BPS requires a **fresh deployment** with production parameters, seed, legal
pack, and authorization. Presenting BPSC as BPS production would be materially misleading.

### Explain BPS in five minutes (for a new technical agent)

1. Fixed-supply ERC-20 **BPS** (1e9 × 1e18; no mint path, no tax, no blacklist) + WETH Uniswap v3 pool
   (1.00% tier) on Robinhood Chain.
2. Users trade through **BPSTradeRouter** (the “official route”). Buy: 2% of gross WETH → Stock Token
   acquisition funding, 1% → BPS repurchase-and-burn, 97% swapped. Sell: swap first, then 2% + 2% of
   realized WETH proceeds, 96% to the seller. (BPS-ECON-2.0, VERIFIED in frozen contract + canary events.)
3. Acquisition funding accrues as WETH in **StockAcquisitionVault**. On an executed cycle, the
   **DistributionFundingCoordinator** + **RialtoStockAcquisitionAdapter** buy canonical Robinhood Stock
   Tokens per the **Frontier 10** mandate (PROPOSED basket, pending approval); acquired tokens split
   **80% distribution / 20% strategic reserve** (frozen in the vault).
4. Holders lock BPS in **BPSLockingVault** → time-multiplied effective weight (canary lock: 11000 bps
   multiplier ×1.1).
5. A snapshot + published manifest + Merkle root let eligible lockers claim their distribution share via
   **DistributionClaimManager**; everything is recomputable (**proof of distribution**).
6. Today: contracts + web app are built and heavily tested; a $130-capped canary of steps 1–19 (deploy →
   pool → LP → buy → sell → lock) ran on mainnet and reconciled exactly; the acquisition→claim half of the
   lifecycle exists in code but has **not** been demonstrated end-to-end — that fork rehearsal is the next
   milestone. Production launch is gated on audit, legal, Rialto terms, and founder authorizations.

## B. Product and strategy — lanes

Canonical names: **BPS** (production token, not deployed), **BPSC-TEST** (canary token, deployed),
**BPS-ECON-2.0** (economic policy), **BPS-FRONTIER-10-1.0** (acquisition mandate, PROPOSED basket),
**BPS-RESTRICTED-1.0** (draft restricted-jurisdiction list). Experimental/superseded names: `BPS-ECON-1.0`
(SUPERSEDED), external doc copies under `bps-protocol/`/`bps-input(s)/` (SUPERSEDED, non-authoritative).

### Lane 1 — BPS Protocol / Capital Engine (contracts)

- **Objective:** frozen, production-grade contract layer for official-route trading, fee accrual, RWA
  acquisition, reserve accounting.
- **Status:** IMPLEMENTED + frozen; VERIFIED by 416 Foundry tests + canary execution. NOT audited externally.
- **Completed:** all contracts in `packages/contracts/src/` (see §F / Part II §2); TASK 9 release review.
- **Unfinished:** external audit; production parameters; Safe/multisig wiring; acquisition cycle proven live.
- **Dependencies/blockers:** N §B-1, B-3, B-4. **Next action:** lifecycle fork rehearsal (§O).
- **Files:** `packages/contracts/src/**`, tests `packages/contracts/test/**`, deploy config
  `packages/contracts/deploy/`, `docs/audit/TASK_9_RELEASE_READINESS.md`.

### Lane 2 — Proof-of-Distribution & participant claims

- **Objective:** deterministic snapshot → allocation → Merkle → claim pipeline with reproducible artifacts.
- **Status:** IMPLEMENTED as local mock pipeline + on-chain claim manager; **not demonstrated end-to-end**.
- **Completed:** `packages/shared/src/proof-of-distribution/**` (epoch/eligibility/allocation/merkle/
  artifacts), `packages/pilot` CLI + canonical fixture, `DistributionClaimManager.sol` + tests, web claim UI.
- **Unfinished:** real snapshot from chain state; real manifest publication; lifecycle rehearsal; indexer.
- **Next action:** §O rehearsal. **Files:** as above + `apps/web/lib/services/*claim*`.

### Lane 3 — Public web application & transparency

- **Status:** restricted-beta app IMPLEMENTED (`apps/web`, Next.js): wallet connect, chain guard, terms
  acceptance, official buy/sell, lock/withdraw, claims, transparency reads (official volume, burns,
  budgets), demo/pilot gating. VERIFIED: vitest 177/177 + Playwright E2E (2026-07-25 / 8D).
  PLANNED: public read-only transparency app (launch gate; §N P-5).
- **Files:** `apps/web/**` (`lib/services/`, `lib/connectors/`, `app/`), `.env.example` names.

### Lane 4 — BPS RWA Launch Lab — see §L. PROPOSED only; no in-repo code (VERIFIED).

### Lane 5 — Legal / eligibility infrastructure

- **Status:** DRAFT pack IMPLEMENTED as documents + fail-closed app gates; every operator/jurisdiction/KYC
  field UNRESOLVED (see §K). **Files:** `docs/BPS_LEGAL_MVP_PACK.md`,
  `docs/audit/TASK_10_FOUNDER_DECISION_PACK.md`, terms/eligibility services in `apps/web/lib/`.

### Lane 6 — Production deployment & operations

- **Status:** BLOCKED (NO-GO stands). Deployment system exists (`packages/contracts/deploy/` + fork
  rehearsal test), canary proved the machinery; production needs §N blockers cleared + fresh authorization.
- **Files:** `packages/contracts/deploy/*.json`, `script/` deploy scripts, `docs/CANARY_RUNBOOK.md` §8–9.

### Positioning & messaging (DECIDED unless noted)

RWA distribution infrastructure; systematic allocation for tokenized markets; **defined allocation,
disciplined execution, verifiable settlement**; proof of distribution as the differentiator. Avoid casino/
meme framing entirely. Required cost language: the protocol allocation (3% buy / 4% sell) is **separate**
from the ~1% Uniswap pool fee, gas, price impact, and slippage (never summed into one number)
(`docs/audit/TASK_10_DISCLOSURE_RECONCILIATION.md`). Official-route volume must be distinguished from raw
pool volume. SPCX = exposure via issuer tokenized debt, not equity. Unresolved copy: final public site copy
for the transparency app (PLANNED, low priority until §O/§N progress).

# PART II — TECHNICAL

## C. Economic model and token mechanics (reconciled)

Canonical policy **BPS-ECON-2.0** (`docs/BPS_LAUNCH_DECISIONS.md` §5, DECIDED; reconciled to the frozen
contract in `docs/audit/TASK_10_DISCLOSURE_RECONCILIATION.md`). `BPS-ECON-1.0` + all external doc copies are
SUPERSEDED.

| Mechanic                               | Value                                                                                  | Approved (docs)                                                   | Implemented (code)                                             | Exercised by canary                                       | Demonstrated end-to-end               |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------- |
| Fixed supply                           | 1,000,000,000 × 1e18; no post-deploy mint, no tax, no blacklist                        | DECIDED                                                           | IMPLEMENTED (`BPSToken.sol`, `canary/BPSCanaryToken.sol`)      | VERIFIED (supply/burn math exact)                         | n/a                                   |
| Buy allocation                         | **3%** = 2% acquisition + 1% repurchase-and-burn; 97% swapped                          | DECIDED                                                           | IMPLEMENTED (`BPSTradeRouter.sol`)                             | VERIFIED (tradeId 1 events exact)                         | —                                     |
| Sell allocation                        | **4%** = 2% acquisition + 2% repurchase-and-burn from realized proceeds; 96% to seller | DECIDED                                                           | IMPLEMENTED                                                    | VERIFIED (tradeId 2 events exact)                         | —                                     |
| Burn                                   | true `totalSupply` reduction via adapter repurchase + self-burn                        | DECIDED                                                           | IMPLEMENTED                                                    | VERIFIED (supply = 1e27 − 19,075,555,916,145,897,703,744) | —                                     |
| Acquired Stock Token split             | 80% distribution / 20% strategic reserve                                               | DECIDED                                                           | IMPLEMENTED (frozen `StockAcquisitionVault`)                   | NOT exercised                                             | **NOT demonstrated**                  |
| Locking / effective weight             | lock BPS → multiplier (canary: 11000 bps = ×1.1, policyVersion 1)                      | DECIDED                                                           | IMPLEMENTED (`BPSLockingVault.sol`)                            | VERIFIED (lockId 0)                                       | weight→claim NOT demonstrated         |
| Snapshots + Merkle claims + PoD        | manifest: snapshot block, exclusions, eligible supply, root                            | DECIDED                                                           | IMPLEMENTED (shared PoD pipeline + `DistributionClaimManager`) | NOT exercised                                             | **NOT demonstrated** (next milestone) |
| Uniswap pool fee                       | 1.00% (`10000`, tick spacing 200) — separate from protocol allocation                  | DECIDED                                                           | IMPLEMENTED                                                    | VERIFIED (canary pool)                                    | —                                     |
| Eligibility attestation / claim window | 90 days / 90 days                                                                      | DECIDED                                                           | app gates fail-closed; provider UNRESOLVED                     | —                                                         | —                                     |
| Cycle triggers                         | first proof cycle $250 capped + founder-authorized; weekly eval, execute ≥ $1,000      | DECIDED (params)                                                  | PLANNED (no cycle executed)                                    | —                                                         | —                                     |
| LP-fee policy (first 90 days)          | 100% of protocol-LP fees recollected into liquidity, publicly accounted                | DECIDED                                                           | PLANNED                                                        | —                                                         | —                                     |
| Frontier 10 basket weights/addresses   | 10 tokens; 66/16/18 sleeves; SPCX ≤ 10%                                                | **PROPOSED — pending founder/counsel + registry re-verification** | registry addresses observed once (block 13,285,312)            | —                                                         | —                                     |
| Production seed / float / FDV          | earlier $1M FDV / 1.25% float **NOT accepted**                                         | UNRESOLVED (§N B-4)                                               | —                                                              | —                                                         | —                                     |

**Plain-language value flow (exact intended sequence):**

1. Trader uses the official route → router takes the WETH allocation (buy 2%+1%, sell 2%+2%).
2. Acquisition WETH accrues in `StockAcquisitionVault` (canary: 31,435,920,663,381 wei — VERIFIED).
3. Burn WETH immediately repurchases BPS via the immutable Uniswap adapter and burns it (VERIFIED).
4. On a cycle trigger (founder-authorized, capped), `DistributionFundingCoordinator` funds
   `RialtoStockAcquisitionAdapter` to buy Frontier-10 Stock Tokens (≤30 s quote age, ≤100 bps impact,
   round-down, sleeve-constrained fallback; `docs/BPS_LAUNCH_DECISIONS.md` §4).
5. Acquired tokens split 80% distribution / 20% strategic reserve; the cycle is recorded on-chain
   (coordinator↔vault acquisition binding — VERIFIED in tests).
6. Snapshot at a published block → eligible supply excludes pool/NPM/burn/treasury/vesting/bridges per the
   published list → weighted by lock effective weight.
7. Cycle manifest + Merkle root published; participants claim via `DistributionClaimManager` inside the
   90-day window; unclaimed rolls forward; rounding dust stays in the vault.
8. PoD tooling recomputes everything from public data; the web app shows official-route vs pool volume,
   burns, budgets, acquisitions, claims.

Steps 1–3 are VERIFIED on mainnet (canary). Steps 4–8 are IMPLEMENTED in code/tests but **NOT yet
demonstrated end-to-end** — the next milestone (§O) rehearses them on a fork.

## D. Repository and technical architecture

Monorepo: npm workspaces (`apps/*`, `packages/*`). Node **v24.18.0**; TypeScript strict; Next.js **16.2.11**
/ React **19.2.8** / viem **2.55.8** (web); Foundry + **solc 0.8.26** (optimizer on, 200 runs; contracts).
Root scripts (`package.json`): `dev, build:shared, build, lint, typecheck, test, format, format:check,
proof:mock, build:contracts, test:contracts, fmt:contracts, check`. Aggregate gate: **`npm run check`**.

### First-party repository tree (source-controlled; generated output excluded)

```
bps-experiment/
├─ CLAUDE.md                         Engineer role + scope + MANDATORY CONTINUITY GATE (§5 of this doc)
├─ HANDOVER.md                       THIS master handover (authoritative continuity doc)
├─ README.md                         Public-facing repo overview + verification quickstart
├─ .env.example                      Env-var NAMES only (no secrets); template to copy to .env
├─ package.json / package-lock.json  Workspace root + pinned lockfile
├─ tsconfig.base.json                Shared TS config
├─ eslint.config.mjs / prettier.config.mjs / .prettierignore   Lint/format (canary-packet excluded)
├─ docs/
│  ├─ BPS_LAUNCH_DECISIONS.md        DECIDED economics/config (BPS-ECON-2.0, Frontier 10, chain+Uniswap)
│  ├─ BPS_LEGAL_MVP_PACK.md          DRAFT terms + privacy pack (bracketed placeholders; counsel review)
│  ├─ CANARY_RUNBOOK.md              Canary policy: caps, two-wallet rule, "fresh production deploy" rule
│  ├─ audit/
│  │  ├─ TASK_9_RELEASE_READINESS.md         Release review + NO-GO verdict + test reconciliation
│  │  ├─ TASK_10_DISCLOSURE_RECONCILIATION.md Economics reconciled to frozen router (BPS-ECON-2.0)
│  │  ├─ TASK_10_FOUNDER_DECISION_PACK.md    15 UNRESOLVED fail-closed founder/counsel decisions
│  │  ├─ BPS_CANARY_MAINNET_COMPLETION_2026-07-25.md          Canary completion checkpoint (human)
│  │  └─ BPS_CANARY_MAINNET_COMPLETION_2026-07-25.evidence.json  Machine-readable evidence manifest
│  └─ continuity/                    (this task) CHANGELOG.md, CURRENT_STATE.json, BACKUP_AND_RECOVERY.md
├─ apps/
│  ├─ web/       Next.js restricted-beta app: wallet connect, official trade, lock, claims, transparency
│  ├─ indexer/   Health-check skeleton only (src/health.ts, index.ts) — event indexing NOT implemented
│  └─ worker/    Health-check skeleton only — background jobs NOT implemented
├─ packages/
│  ├─ contracts/ Solidity (src/), Foundry tests (test/), deploy config (deploy/) + scripts (script/),
│  │             and canary-packet/ (untracked execution+recovery bundle — see §G)
│  ├─ shared/    @bps/shared: proof-of-distribution domain logic (epoch, eligibility, allocation, merkle)
│  ├─ pilot/     @bps/pilot: PoD CLI + canonical fixture (mock cycle, local-only)
│  ├─ rialto/    @bps/rialto: server-only Rialto quote client + server (no live request in-repo)
│  └─ db/        @bps/db: DB access placeholder (schema/migrations NOT implemented)
```

### Component detail

- **`packages/contracts`** — the protocol. `src/` has the 8 core contracts + adapters + interfaces + the
  canary token; `test/` has 45 Foundry suites (416 tests); `deploy/` holds the fail-closed deployment
  registry (`robinhood-mainnet.canary.json`, `.dryrun.json`, `manifest.schema.json`, `RUNBOOK.md`);
  `script/` holds Foundry deploy scripts (`DeployBPS.s.sol`, `canary/DeployBPSCanary.s.sol`). External
  interfaces: Uniswap v3 (`ISwapRouter02`, factory, NPM), Rialto registry, WETH. Test coverage: high
  (unit/fuzz/hostile/fork). Limitation: not externally audited.
- **`apps/web`** — Next.js app. Entry `app/`; services `lib/services/`; wallet connectors `lib/connectors/`.
  Inputs: injected wallet + read RPC; outputs: signed user txs, transparency reads. Coverage: 177 vitest +
  Playwright E2E. Limitation: restricted-beta gating; fails closed when connector/eligibility absent.
- **`packages/shared`** — pure deterministic PoD logic (no I/O). Entry `src/proof-of-distribution/`. Inputs:
  holder set + cycle params; outputs: allocations + Merkle root + artifacts. Coverage: unit + fixture.
- **`packages/pilot`** — CLI (`src/cli.ts`) that runs the mock cycle from `fixtures/canonical-cycle.json`
  (`npm run proof:mock`). Local-only; no chain writes.
- **`packages/rialto`** — server-only quote client (`src/quote-client.ts`, `src/server.ts`). Makes **no live
  request in-repo** (fail-closed); production terms + rehearsal required before any real quote.
- **`apps/indexer`, `apps/worker`, `packages/db`** — health-check skeletons / placeholder only. Real
  indexing, jobs, and DB schema are **NOT implemented** (PLANNED).

### End-to-end flows (implementation status)

| Flow                                            | Status                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| Wallet connection (injected + chain-4663 guard) | IMPLEMENTED (`apps/web`), VERIFIED (tests/E2E)                             |
| Official trade route (buy/sell)                 | IMPLEMENTED + VERIFIED on mainnet (canary tradeId 1/2)                     |
| Fee accounting (acquisition + burn budgets)     | IMPLEMENTED + VERIFIED on mainnet (accrual)                                |
| Stock Token acquisition funding (coordinator)   | IMPLEMENTED; **NOT demonstrated end-to-end**                               |
| Acquisition-adapter settlement (Rialto)         | IMPLEMENTED (adapter) + tests; live path UNPROVEN / BLOCKED (Rialto terms) |
| Reserve accounting (80/20)                      | IMPLEMENTED + tested; not exercised on mainnet                             |
| Participant locking                             | IMPLEMENTED + VERIFIED on mainnet (lockId 0)                               |
| Snapshot generation                             | IMPLEMENTED (shared/pilot, mock); real chain snapshot NOT implemented      |
| Merkle-root publication                         | IMPLEMENTED (shared) + on-chain publish path; NOT exercised live           |
| Participant claim                               | IMPLEMENTED (`DistributionClaimManager` + web); NOT demonstrated live      |
| Proof-of-distribution display                   | IMPLEMENTED (transparency reads) + mock; live cycle data absent            |

**Files a new agent must NEVER casually regenerate/delete:** any file under
`packages/contracts/canary-packet/` (accepted execution + recovery bundles, ZIPs, evidence); the two
`docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.*` files; `docs/audit/*` review records;
`package-lock.json`. Generated/derived (safe to rebuild): `packages/contracts/out/`, `cache/`, `lib/`,
`apps/web/.next/`, `dist/`, `node_modules/`.

## E. Robinhood Chain and external protocol configuration (VERIFIED)

Defined in `docs/BPS_LAUNCH_DECISIONS.md` §2–3 (source-verified 2026-07-18 at block 13,277,200); runtime
copies in `packages/contracts/deploy/robinhood-mainnet.canary.json` (with on-chain runtime-code hashes) and
the canary bundle policy. Dependency code hashes/sizes are re-verified at every canary preflight (last
2026-07-25). **Never commit or print an RPC URL; the endpoint comes from env `ROBINHOOD_CHAIN_RPC_URL`.**

| Item                                     | Value                                                                                         | Status                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Network / chainId / native               | Robinhood Chain Mainnet / **4663** (`0x1237`) / ETH                                           | VERIFIED (live, repeatedly)                                                  |
| Public RPC (dev/fallback only)           | `https://rpc.mainnet.chain.robinhood.com` (rate-limited; not for production)                  | DECIDED                                                                      |
| Production RPC policy                    | dedicated provider via env `ROBINHOOD_CHAIN_RPC_URL`; public RPC as non-critical fallback     | DECIDED                                                                      |
| Explorer                                 | `https://robinhoodchain.blockscout.com`                                                       | VERIFIED                                                                     |
| WETH                                     | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` (codehash `0x5706be52…5353`)                     | VERIFIED                                                                     |
| USDG                                     | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`                                                  | VERIFIED (docs; unused by canary)                                            |
| UniswapV3Factory                         | `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` (codehash `0xec72b1ab…1739`)                     | VERIFIED                                                                     |
| QuoterV2                                 | `0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7`                                                  | VERIFIED (docs; codehash bound, address null in registry pending re-confirm) |
| NonfungiblePositionManager               | `0x73991a25c818bf1f1128deaab1492d45638de0d3` (codehash `0x0a493d1a…ad4f`)                     | VERIFIED                                                                     |
| SwapRouter02 (router v1 uses)            | `0xCaf681a66D020601342297493863E78C959E5cb2` (codehash `0x6f36c378…25dc`)                     | VERIFIED                                                                     |
| UniversalRouter (possible later web use) | `0x8876789976decbfcbbbe364623c63652db8c0904`                                                  | VERIFIED (docs)                                                              |
| Permit2                                  | `0x000000000022D473030F116dDEE9F6B43aC78BA3`                                                  | VERIFIED (docs)                                                              |
| Rialto router registry (canary-bound)    | `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E` (codehash `0xf8b9b92c…a01e`)                     | VERIFIED                                                                     |
| Approved pool fee tiers / tick spacing   | 100/1, 500/10, 3000/60, 10000/200 (all enabled); **launch pool = 10000 (1.00%), spacing 200** | VERIFIED (factory read 2026-07-18)                                           |
| ETH/USD oracle + sequencer-uptime feed   | none required on-chain by any frozen contract; left `null`, **not invented**                  | VERIFIED (registry note)                                                     |

Never include a private RPC endpoint or any credential-bearing URL in any file.

## F. Smart contracts

All sources under `packages/contracts/src/`. The layer is **frozen** (no ABI/interface/behavior changes
without a separately approved milestone; see `docs/audit/TASK_10_FOUNDER_DECISION_PACK.md` standing
constraints). Toolchain solc 0.8.26, optimizer 200 runs. No contract is upgradeable/proxied (all
immutable); privileged control is via explicit roles + a Safe-controlled pause (production Safe UNRESOLVED).

### Core contracts

| Contract                       | Path                                             | Purpose                                                                                     | Key roles / config                                 | Key events                  | Deployment status                                 |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------- | ------------------------------------------------- |
| BPSToken                       | `src/BPSToken.sol`                               | Production fixed-supply ERC-20 (1e27, 18 dec, no mint/tax/blacklist), self-burn             | owner/none post-deploy                             | Transfer, Approval          | **NOT deployed** (production)                     |
| BPSTradeRouter                 | `src/BPSTradeRouter.sol`                         | Official trade route; applies buy 2%+1% / sell 2%+2%; routes swap; funds acquisition + burn | operator/owner; immutable adapters + vault + token | OfficialBuy, OfficialSell   | Canary deployed; production NOT                   |
| StockAcquisitionVault          | `src/StockAcquisitionVault.sol`                  | Holds acquisition WETH; records acquisitions; 80/20 distribution/reserve split              | vault ops role, reserve recipient                  | acquisition/release events  | Canary deployed; production NOT                   |
| DistributionFundingCoordinator | `src/DistributionFundingCoordinator.sol`         | Binds funding to recorded acquisitions; funds the claim manager per cycle                   | acquisition operator, root publisher               | funding/coordination events | Canary deployed; production NOT                   |
| DistributionClaimManager       | `src/DistributionClaimManager.sol`               | Merkle-root cycles; participant claims within the window; recovery of unclaimed             | root publisher, recovery recipient                 | root published, claimed     | Canary deployed; production NOT                   |
| BPSLockingVault                | `src/BPSLockingVault.sol`                        | Lock BPS → effective weight (multiplier, policyVersion); withdraw after unlock              | owner/policy                                       | LockCreated, withdraw       | Canary deployed; production NOT                   |
| RialtoStockAcquisitionAdapter  | `src/adapters/RialtoStockAcquisitionAdapter.sol` | Executes Stock-Token acquisition via Rialto registry/route                                  | acquisition operator; immutable registry           | acquisition events          | Canary deployed; production NOT                   |
| UniswapV3BPSSwapAdapter        | `src/adapters/UniswapV3BPSSwapAdapter.sol`       | Immutable swap adapter over SwapRouter02 (buy WETH→BPS, burn repurchase)                    | none (immutable)                                   | swap events                 | Canary deployed; production NOT                   |
| BPSCanaryToken                 | `src/canary/BPSCanaryToken.sol`                  | **CANARY-ONLY** ERC-20 ("BPS Canary — TEST ONLY", BPSC-TEST, `IS_CANARY=true`)              | owner                                              | Transfer, Approval          | **Canary deployed** (this is what ran on mainnet) |

Interfaces: `src/interfaces/` (`IBPSBurnable`, `IBPSSwapAdapter`, `IDistributionClaimManagerFunding`,
`IRialtoRouterRegistry`, `IStockAcquisitionAdapter`, `IStockAcquisitionVaultOps/View`, `ISwapRouter02`).
Build probe: `src/BuildProbe.sol` (dev-only). Test-only mocks live under `test/` (ERC-20 mocks, hostile
reentrancy/again mocks) and **must never be deployed to production**.

**Deployment order (canary, VERIFIED on chain):** BPSCanaryToken → BPSLockingVault → DistributionClaimManager
→ RialtoStockAcquisitionAdapter → DistributionFundingCoordinator → StockAcquisitionVault →
UniswapV3BPSSwapAdapter → BPSTradeRouter, then pool create/initialize + LP mint. Dependency map: router
depends on token + swap adapter + acquisition vault + coordinator; coordinator depends on vault + claim
manager; acquisition adapter depends on the Rialto registry; swap adapter depends on SwapRouter02 + WETH +
token.

**Invariants / failure modes (frozen-layer, VERIFIED by tests):** fixed supply only decreases (burn); buy
routes exactly 97% and sell returns exactly 96% after allocations; acquisition funding cannot exceed
recorded acquisitions (rollback tested); locks cannot be withdrawn before unlock; claims validate against
the published Merkle root; hostile/reentrancy suites pass. Deploy-config validation reverts on
placeholder/zero roles (fail-closed).

**Classification (must remain distinct):**

- **Canary contracts** — `BPSCanaryToken`; the 8 canary _deployments_ on mainnet (below). Not production.
- **Reusable protocol code** — all `src/` core contracts + adapters (production-intended, to be _freshly
  deployed_, never reusing canary instances).
- **Dev-only mocks** — everything under `test/` mocks. Never deploy.
- **Planned production contracts** — the same core set redeployed with production params (NOT done).
- **Must-not-reuse-in-production** — every canary deployment address in §G.

## G. Mainnet canary — history and final state (VERIFIED)

**Authoritative sources:** live on-chain state (re-verified 2026-07-25T07:10:56Z, block 18821299);
`docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.{md,evidence.json}` (TASK 10E-1, read-only
reconciliation). The BPSC-TEST canary proved the deploy/execute machinery under real mainnet conditions with
a $130 all-inclusive cap. **It is a canary, not canonical BPS production.**

**Wallets:** deployer `0xD9Eec97DEDafe1451b7f201E416A502b93c1e203`; controlled tester
`0x78B256A742fa2c0f84ebdAf570fCDC16Ee206024`. Final nonces (VERIFIED live): **deployer 16/16, tester 8/8**.

**Deployed canary contracts (actual on-chain addresses — authoritative; the deploy-registry `predicted`
map is offset and its `actual` map is null — see §N DOC-1):**

| Slot                           | Address                                      | Runtime code hash     |
| ------------------------------ | -------------------------------------------- | --------------------- |
| BPSCanaryToken (BPSC-TEST)     | `0x2E6C3dC1e04C45d4B9d40BeE392a135beA50A5d7` | `0xca16cad61af5b3cb…` |
| BPSLockingVault                | `0xeFA9d1C40358E281da21A1BC20a204c849cB8A42` | `0xb378d3ede6f9daee…` |
| DistributionClaimManager       | `0x5EcbADf1cF050F1B86D44B979416A8e859Fb2574` | `0x8da296360640c8a2…` |
| RialtoStockAcquisitionAdapter  | `0xbe2C8c6CB7CeeED24708419F5aaEEF8d949866AE` | `0x9e6e6db3405b9b5f…` |
| DistributionFundingCoordinator | `0xE3Bd9e1D58d16A31912f804f931Cc6bfcD702205` | `0x3886aa4ce0a4c38c…` |
| StockAcquisitionVault          | `0x9a5a55361BcFDD6Ded4A6EAa02D997F1108EdeC6` | `0xd3a283ff652b7be9…` |
| UniswapV3BPSSwapAdapter        | `0x5891Dcc2BACD1ADC8b5a9C30B365931290d7E5E1` | `0xb8a2faf72e3f734a…` |
| BPSTradeRouter                 | `0x4847b410D1243eD38B481B89B1D1D59a8C8691e6` | `0x5791a715dfdff519…` |

Full runtime-code hashes are in the evidence manifest (`contracts.*.runtimeCodeHash`).

**Pool:** `0x4A429194dC4E4A1f3b1cD24bBaf7754f65ABc5EF` — token0 WETH `0x0Bd7…AD73`, token1 BPSC
`0x2E6C…A5d7`, fee tier 10000, sqrtPriceX96 `2417079578844823385640923054405439`, liquidity
`3235182407869072596640`. **LP position:** NPM tokenId **371728**, owner = deployer, liquidity
`3235182407869072596640` (== pool liquidity).

**All 19 transactions (VERIFIED; status = success/1 for every one):**

| #   | Step                                  | Signer/nonce | Tx hash                                                              | Block    |
| --- | ------------------------------------- | ------------ | -------------------------------------------------------------------- | -------- |
| 1   | BPSCanaryToken deploy                 | dep/3        | `0x36acf3e3752e0cfc2688c280680c4a9a100e3fcb2520bf41ae723f1a05612e2c` | 18193678 |
| 2   | BPSLockingVault deploy                | dep/4        | `0x4569523ae523090ee7b19644380b4cecb33d34d19db1cd2f52c677a724a2d758` | 18395614 |
| 3   | DistributionClaimManager deploy       | dep/5        | `0x6c8b970bce36b43b0aab2c1320e0881bacc5865ba0b854c278fd2dff7b97d3cc` | 18457374 |
| 4   | RialtoStockAcquisitionAdapter deploy  | dep/6        | `0x0b4256157b8c8f8d570045102c058024b19b863b2447e022d66f6cae5f3bad8d` | 18459117 |
| 5   | DistributionFundingCoordinator deploy | dep/7        | `0xd902672f5a42586010570d61ed3bc42da0b4c9362c718dfefacdc05adddcfa2a` | 18460678 |
| 6   | StockAcquisitionVault deploy          | dep/8        | `0x7cd8d07a3b86572846a1a22439114c1318df2fca841c76f60ddd7e89ae701db0` | 18461676 |
| 7   | UniswapV3BPSSwapAdapter deploy        | dep/9        | `0xbd9f479376315ae7e7f95439e7effccc92aa106c75f42997eb2eef69c2062d8c` | 18461904 |
| 8   | BPSTradeRouter deploy                 | dep/10       | `0x9fd2989adcbc0afb891c2dfd1f9566b8f95aef870e82534f58e22d9c4e332842` | 18462165 |
| 9   | WETH.approve(NPM)                     | dep/11       | `0x8b9a42e8d2bbaef520f67c4c36c65a146b2894c5af65c2a06c79f9c3a315f8a0` | 18462403 |
| 10  | BPSC.approve(NPM)                     | dep/12       | `0xe8a56b1ed9b997d628c17676dea7251e06338dac6de69f7bd8a40486140163b2` | 18462691 |
| 11  | factory.createPool                    | dep/13       | `0x85cc476f66800277b1738e44bca8cb5012580b33ff6f1f83fba3119adf7740d8` | 18462963 |
| 12  | pool.initialize                       | dep/14       | `0x443e07448c8d02da18969fec52f871e172f85e241484563b36f856a0221091b9` | 18463189 |
| 13  | NPM.mint (LP 371728)                  | dep/15       | `0x09ee1c10862f669461bf2596b24ca6d9331db48a84c4c928fc3eb2ad53a3a3f8` | 18463447 |
| 14  | WETH.approve(router)                  | test/2       | `0x2daf53fe75dd0f5dffeae2c2b3dd30b08665c72a8594b74305987eb977d2eae9` | 18788315 |
| 15  | buyExactWethForBps (tradeId 1)        | test/3       | `0x40d67b20a4fdb2a8a3a784c2ea56e3f8ad55338a4f3d412284a2e2b077f7871c` | 18788800 |
| 16  | BPSC.approve(router)                  | test/4       | `0x550aa1963a6880ceb41314c060811c249f0b3861f433322af9bf023bf6ccdc0f` | 18789018 |
| 17  | sellExactBpsForWeth (tradeId 2)       | test/5       | `0x518ffc03f367548bb19b86afe49efe00caed0aaeb5beb61ad87c5f23419fa01d` | 18789201 |
| 18  | BPSC.approve(vault)                   | test/6       | `0xbed1b299effdffe1f91e42e321dc2e94967e378de0bddf393153bd94fa7f6db3` | 18789543 |
| 19  | createLock(amount, 7d)                | test/7       | `0x6818bfabb2be8983dc8737f211d4e308e5b260c94717083935e8bdda2ddbb0ba` | 18791290 |

**Final lock (lockId 0):** account = tester; principal `475,546,397,072,022,702,614,092`; startTime
1784960546; duration 604800 s (7 d); **unlockTime 1785565346 = 2026-07-31T23:02:26Z**; multiplierBps 11000
(×1.1); policyVersion 1; effective weight `523,101,036,779,224,972,875,501`. Tester BPSC balance now 0.

**Final allowances (VERIFIED):** tester→router (WETH, BPSC) = 0; tester→vault (BPSC) = 0 (exact-amount
approvals fully consumed). Residual deployer→NPM: `663,707,774,444,919` wei WETH + `7,568` BPSC-units.
**No approval revocation was performed** (out of scope for the read-only reconciliation).

**Final balances (VERIFIED):** deployer ETH `2,966,115,952,402,154` / WETH `710,132,572,995,220` / BPSC
`950,000,000,000,000,000,000,007,568`. Tester ETH `282,910,817,214,031` / WETH `10,069,854,066,833,712` /
BPSC `0`. StockAcquisitionVault WETH `31,435,920,663,381`.

**Realized gas:** steps 1–13 = `1,754,578,810,854,000` wei; steps 14–19 = `127,023,573,346,000` wei;
**all 19 = `1,881,602,384,200,000` wei** (≈$3.50). **Generated fees / burns:** acquisition budget accrued
`31,435,920,663,381` wei WETH (= buy 2% + sell 2%); total BPSC burned `19,075,555,916,145,897,703,744`;
BPSC totalSupply now `999,980,924,444,083,854,102,296,256` (= 1e27 − burned). Planned all-inclusive
exposure was $123.01 (≤ $130 cap); realized gas for 14–19 came in ~26% of ceiling; no cap exceeded.

**Canonical artifact hashes (accepted execution package v9):**

- ZIP: `canary-rabby-recovery-execution-review-v9.zip`, size **578,871** bytes, SHA-256
  `0c958a58b8684878c4dfce4a15cdba3b2fc0e39680d46902430ab6e78a09b74d`.
- recoveryAuthorizationDigest `0xc50d97d780c48308667d17366e383be0b70556e0d0bfbab69225222e228d8314`
  (identical across packet, policy, packaged operator authorization).
- Prior anchors (bound inside v9, evidence only): v5 zip `5a6246ca…64b3b` / digest `0x4fdfd36b…e248`;
  v6 zip `fd57f5c1…fb356` / digest `0xdca84194…cf57`; v7 zip `b8dd4e6d…06253` / digest `0xf12f37c6…dfea`;
  v8 zip `6c92a429…b8aa9` / digest `0x5f92fd12…6662`.
- Evidence manifest SHA-256 `d6005083b20e5188ce783cde5b30159b56228398d5bf204746b536e9e36b8ec3`.

**Evidence file paths:** `docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.md`,
`docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.evidence.json`,
`packages/contracts/canary-packet/canary-rabby-recovery-execution-review-v9.zip`,
`packages/contracts/canary-packet/exec/` (bundle), `packages/contracts/canary-packet/post-canary-reconcile.mjs`.

**FINAL EXECUTION BOUNDARY (DECIDED, enforced):** the 19-step plan is complete. The **v9 authorization
window is historical/expired** and is **evidence only — never permission to send another transaction**.
The delayed **tester nonce-8 withdrawal was NOT executed and is NOT authorized**; it may only occur after
2026-07-31T23:02:26Z (lock unlock) via a **separately regenerated, independently reviewed** packet. Do not
send nonce 8, do not reuse any expired packet, do not reuse any canary address for production.

## H. Tests, verification and audit state

**Last full re-run: 2026-07-25** (this session, TASK 10E-1 verification pass). Totals below were rerun on
that date unless marked historical. Prerequisite for all contract/fork suites: Foundry on PATH
(`export PATH="$HOME/.foundry/bin:$PATH"`). No dependency install/upgrade was performed.

| Suite                                    | Command                                                                           | Last result                                                                                                                                                                              | Date                                 | Safety                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| Aggregate gate                           | `npm run check`                                                                   | **PASS** (prettier, eslint, tsc, all workspace vitest, next build, forge fmt/build/test)                                                                                                 | 2026-07-25                           | READ-ONLY SAFE                                         |
| Contract compile + build                 | `forge build` (via `npm run build:contracts`)                                     | PASS (8 bytecodes, solc 0.8.26)                                                                                                                                                          | 2026-07-25                           | READ-ONLY SAFE                                         |
| Foundry unit/invariant/fuzz/hostile      | `forge test`                                                                      | **416 passed / 0 failed**, 45 suites                                                                                                                                                     | 2026-07-25                           | READ-ONLY SAFE (local EVM)                             |
| Fork deploy rehearsal                    | `ROBINHOOD_FORK_RPC=<ro rpc> forge test --match-contract ForkDeployRehearsal`     | PASS (in the 416)                                                                                                                                                                        | 2026-07-25                           | FORK ONLY                                              |
| `@bps/web` Vitest                        | `npx vitest run` (in `apps/web`)                                                  | **177 passed** (25 files)                                                                                                                                                                | 2026-07-25                           | READ-ONLY SAFE                                         |
| `@bps/shared` Vitest                     | `npm run test --workspace @bps/shared`                                            | 52 passed (8 files)                                                                                                                                                                      | 2026-07-25                           | READ-ONLY SAFE                                         |
| `@bps/pilot` Vitest                      | `npm run test --workspace @bps/pilot`                                             | 30 passed (2 files)                                                                                                                                                                      | 2026-07-25                           | READ-ONLY SAFE                                         |
| `@bps/rialto` Vitest                     | `npm run test --workspace @bps/rialto`                                            | 30 passed (2 files)                                                                                                                                                                      | 2026-07-25 (rerun) / TASK 9 baseline | READ-ONLY SAFE                                         |
| `@bps/indexer`, `@bps/worker`, `@bps/db` | `npm run test --workspace …`                                                      | 1 each (health-check)                                                                                                                                                                    | 2026-07-25                           | READ-ONLY SAFE                                         |
| Playwright E2E (Chromium)                | `npm run test:e2e --workspace @bps/web` (`npx playwright install chromium` first) | PASS (historical, TASK 8D) — **rerun before relying on it**                                                                                                                              | ~2026-07-24                          | LOCAL MUTATION (spawns local server)                   |
| Canary bundle VERIFY-ALL                 | `node verify-all.mjs` (in `packages/contracts/canary-packet/exec/`)               | **PASS** — 9 suites (compile 7/7, offline 61/61, manifest 5/5, static-scan 7/7, replay 19/19, operator 46/46, v5 browser smoke 7/7, v9 recovery 40/40, v9 browser smoke 10/10 port 8741) | 2026-07-25                           | READ-ONLY SAFE / LOCAL (localhost server + local fork) |
| Canary live preflight                    | `node recovery-preflight.mjs` (needs `ROBINHOOD_CHAIN_RPC_URL`)                   | PASS historically (gates + anchors) — **read-only chain reads only**                                                                                                                     | 2026-07-25                           | READ-ONLY SAFE (no writes)                             |
| Post-canary reconciliation               | `node packages/contracts/canary-packet/post-canary-reconcile.mjs` (needs RPC env) | **PASS** (all 19 verified, evidence written)                                                                                                                                             | 2026-07-25                           | READ-ONLY SAFE                                         |

**Historical baseline (TASK 9, `docs/audit/TASK_9_RELEASE_READINESS.md`):** forge **398**, `@bps/web` **129**
(TypeScript aggregate 226), Playwright 1. The current higher counts (416 / 177) reflect tests added in later
tasks (8D application coverage + canary recovery suites). Known limitation: the Playwright E2E is a single
smoke flow; treat it as smoke, not full coverage. Security scans: secret + browser-bundle scans PASS
(TASK 9 §11) and the canary static-safety scan is in VERIFY-ALL. **Audit status: no external/independent
smart-contract audit has been performed** (BLOCKER B-1). "Frozen contracts pass the in-repo suite" is
explicitly NOT a substitute for an external audit.

## I. Security and operational controls

- **Threat model.** Protect against: mis-send / wrong-nonce / wrong-account execution; expired or mutated
  calldata; gas-price griefing; replay across chains; leaking RPC/secret; presenting canary as production.
  The canary execution system was hardened iteratively (v5→v9) against each.
- **Wallet separation (DECIDED).** Deployer `0xD9Eec97D…e203` (deploys + LP), controlled tester
  `0x78B256A7…6024` (trades + lock), production operator/Safe **UNRESOLVED** (must be distinct;
  `deploy` config validation reverts on placeholder/zero roles).
- **Nonce safety.** Final nonces deployer 16/16, tester 8/8; **nonce 8 is a hard stop** (unauthorized).
  On-chain reconstruction verifies each tx's exact sender+nonce.
- **Transaction-review workflow.** Localhost-only operator with **per-transaction Rabby approval**; the
  operator never handles a private key; a wrong selected account is a non-halting refusal (v8 fix).
- **Gas / exposure controls.** Bounded-gas verifier with per-step ceilings (accepted at 1.25× reviewed cost,
  priority ceiling exactly 50,000,000 wei, unchanged maxFee/2× gasLimit), all-inclusive **$130 cap**
  enforced at preflight (realized exposure $123.01).
- **Artifact digest binding.** Every action is bound to `recoveryAuthorizationDigest` = keccak256 over the
  canonical authorization; the digest is replicated across packet/policy/operator and re-verified offline.
- **Deadline handling.** Buy/sell calldata deadlines were refreshed only by a narrow ABI decode/re-encode of
  the single 32-byte deadline word, with a byte-diff proof; all other calldata bytes byte-identical.
- **Replay / chain-ID.** `eth_chainId == 4663` re-checked at every boundary; storage namespaces isolated per
  version (`canary`, `canaryv6…v9`); durable in-flight-intent journal closes the storage failure window.
- **Uncertain-send handling.** On any ambiguous receipt/nonce state the operator halts and surfaces, rather
  than resending. Browser/operator isolation: distinct localhost ports (v9 = 8741), allowlisted static serve.
- **Incident stop conditions.** Any nonce mismatch, unexpected pending tx, digest mismatch, exposure over
  cap, chain-ID mismatch, or account mismatch → STOP and report (do not work around).
- **Mainnet vs fork boundary.** All rehearsals run on local Anvil forks; mainnet writes require an explicit,
  bounded, per-action user authorization. **Expired execution artifacts are evidence only and must never be
  refreshed or executed without a separately reviewed authorization task.**
- **Approval/allowance policy.** Canary used exact-amount approvals (now consumed to 0); no blanket
  approvals; no revocation performed post-canary (residual deployer→NPM allowances remain, harmless).
- **Multisig/ownership (UNRESOLVED).** Production ownership = Safe m-of-n (thresholds UNRESOLVED, §N B-4);
  Safe-controlled pause is the only emergency control; BPS not described as fully decentralized while roles
  exist. **Monitoring** (RPC/alerting) UNRESOLVED (§N INF-2). **Rollback limitation:** deployments and live
  transactions are irreversible; the only mitigation is the pause + not proceeding. **Emergency procedure:**
  pause via Safe, stop operators, do not send further txs, reconcile on chain, regenerate a reviewed packet.
- **Audit status / launch gates.** External audit (B-1), legal (B-2), Rialto terms (B-3), founder
  authorizations (B-4), production RPC/monitoring (INF-2) all open. See §N.

## J. Infrastructure and external services

Env-var **names** only (values live in a local `.env`, never committed; see `.env.example`). No credential
or private URL appears in any repo file.

| Dependency                         | Purpose                           | Status                                                        | Env var(s) / config                                | Owner action required                        |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| Robinhood Chain RPC                | chain reads + (future) writes     | dev via public RPC; production dedicated provider PLANNED     | `ROBINHOOD_CHAIN_RPC_URL`, `ROBINHOOD_CHAIN_ID`    | provision production RPC + fallback (INF-2)  |
| Domain / DNS                       | public app hostname               | UNKNOWN / not provisioned in-repo                             | `WALLET_AUTH_DOMAIN` (expected signing domain)     | founder to register + DNS                    |
| Hosting / deploy platform          | web app hosting                   | PLANNED (Next.js; platform not chosen in-repo)                | —                                                  | founder to choose + configure                |
| PostgreSQL                         | app/indexer persistence           | PLANNED (schema NOT implemented; `@bps/db` placeholder)       | `DATABASE_URL`, `DATABASE_MIGRATION_URL`           | provision DB, define schema                  |
| Indexer                            | on-chain event indexing           | NOT implemented (health skeleton)                             | (shares RPC)                                       | build indexer (PLANNED)                      |
| Worker                             | background jobs                   | NOT implemented (health skeleton)                             | —                                                  | build worker (PLANNED)                       |
| IPFS / storage                     | manifest/artifact hosting         | PROPOSED (PoD manifests)                                      | —                                                  | decide storage for cycle manifests           |
| Explorer / source verification     | contract verification             | available (Blockscout)                                        | explorer base URL (public)                         | verify production contracts post-deploy      |
| Monitoring / analytics             | uptime + alerting                 | UNRESOLVED                                                    | —                                                  | configure (INF-2)                            |
| Wallet auth                        | server-side session signing       | IMPLEMENTED (server)                                          | `WALLET_AUTH_SESSION_SECRET`, `WALLET_AUTH_DOMAIN` | set strong secret in prod                    |
| Rialto (RWA acquisition)           | Stock-Token quotes + route        | server-only client; **no live request in-repo (fail-closed)** | `RIALTO_API_URL`, `RIALTO_API_KEY`                 | production terms + KYC path (B-3)            |
| Pilot access gating                | restricted-beta allowlist         | IMPLEMENTED                                                   | `PILOT_ALLOWLIST`, `PILOT_ACCESS_CODE`             | set allowlist for beta                       |
| Eligibility / attestation provider | KYC / wallet eligibility          | UNRESOLVED (absent ⇒ ineligible, fail-closed)                 | (provider-specific)                                | select provider (B-2/B-3)                    |
| Sanctions screening                | restricted-jurisdiction/sanctions | draft policy only (`BPS-RESTRICTED-1.0`)                      | —                                                  | counsel + provider (B-2)                     |
| Contract-address env               | app wiring to deployed contracts  | placeholders only                                             | `BPS_TOKEN_ADDRESS`, `BPS_STAKING_ADDRESS`         | fill only after authorized production deploy |
| Tx safety limits                   | server-enforced ceilings          | IMPLEMENTED                                                   | `TX_MAX_VALUE`, `TX_MAX_PER_DAY`                   | set production limits                        |
| App runtime                        | env/port                          | IMPLEMENTED                                                   | `APP_ENV`, `PORT`                                  | —                                            |

Fallback/recovery: public RPC is a non-critical fallback only; the app fails closed with no mock fallback
when a production connector/provider is absent. None of the above is production-ready yet.

## K. Legal, eligibility and compliance

Sources: `docs/BPS_LEGAL_MVP_PACK.md` (DRAFT terms + privacy) and
`docs/audit/TASK_10_FOUNDER_DECISION_PACK.md` (15 UNRESOLVED, fail-closed). **Nothing here is approved legal
advice**; the pack is a working draft for external counsel. All bracketed fields remain placeholders.

| Item                                | Status                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Legal-pack status                   | DRAFT (terms + privacy), reconciled to BPS-ECON-2.0 economics in §4; every bracket unresolved                              |
| Terms acceptance model              | IMPLEMENTED as a fail-closed app gate (acceptance required; signing alone never grants eligibility)                        |
| EIP-712 declaration plan            | PLANNED (signed terms/eligibility declaration; eligibility is a _separate_ gate)                                           |
| Restricted-jurisdiction policy      | DRAFT `BPS-RESTRICTED-1.0`; restricted functions blocked until resolved                                                    |
| Sanctions policy                    | DRAFT; provider UNRESOLVED                                                                                                 |
| KYC / attestation plan              | UNRESOLVED; **no wallet is marked eligible without the configured provider (absent in-repo ⇒ ineligible)**                 |
| Stock Token eligibility constraints | issuer/venue may require KYC/allowlist for wallet + vault + recipients (UNRESOLVED, B-3)                                   |
| Distribution restrictions           | published cycle manifest must include restricted-jurisdiction version + exclusions                                         |
| Production launch dependencies      | operator entity, governing law, forum, registered address, contacts, liability cap, min age, data regions — ALL UNRESOLVED |

**Unresolved placeholders (from the founder decision pack, all `UNRESOLVED`, fail-closed):**
1 approved/prohibited jurisdictions · 2 KYC/AML + wallet-eligibility policy · 3 operator legal entity
(`[OPERATOR LEGAL NAME]`, `[ENTITY TYPE AND JURISDICTION]`) · 4 governing law + forum (`[GOVERNING LAW]`,
`[COURTS OR ARBITRATION FORUM]`) · 5 registered address + legal/privacy contacts · 6 liability cap · 7 min
age + data hosting regions/processors · 8 Rialto production terms · 9 final Stock-Token basket + verified
registry · 10 oracle/sequencer/multiplier config · 11 operational wallets + Safe thresholds · 12 valuation /
float / liquidity authorization (earlier $1M FDV / 1.25% float **NOT accepted**) · 13 explicit founder
authorization to take a real-money action · 14 independent security audit · 15 production RPC + monitoring.
Keep legal DRAFTS strictly separate from any approved policy; do not present drafts as final.

## L. BPS RWA Launch Lab (separate lane — PROPOSED, no in-repo code)

The **Launch Lab** is a distinct product concept from the Capital Engine implemented here. **No Launch Lab
code exists in this repository** (VERIFIED by full file inventory 2026-07-25); its detailed specs live in the
founder's external planning threads, which are out of scope for this engineering folder per `CLAUDE.md`.
Recorded here only so a successor keeps the lanes separate and does not accidentally fold Launch Lab ideas
into frozen Capital Engine contracts.

| Aspect                                  | State                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Purpose                                 | Launchpad-style issuance of new RWA-paired tokens (distinct from BPS's own fee→RWA distribution) | PROPOSED                     |
| V1 concept                              | Single-token launch paired with an RWA/quote asset                                               | PROPOSED                     |
| V2 ecosystem-switch concept             | Ecosystem/router "switch" between venues                                                         | PROPOSED                     |
| Relationship to Long / Doppler          | External references in founder planning; **not integrated in-repo**                              | PROPOSED/UNKNOWN             |
| Pairing model                           | RWA/token pairing mechanics                                                                      | PROPOSED                     |
| Creator + platform economics            | creator/platform fee split                                                                       | PROPOSED (values UNRESOLVED) |
| First-token concepts (e.g. TICK / NVDA) | example launch tokens                                                                            | PROPOSED                     |
| Distribution / airdrop / claim-meta     | reuse of PoD-style claims for launches                                                           | PROPOSED                     |
| Decisions made                          | none binding in-repo                                                                             | —                            |
| Ideas rejected / unresolved             | tracked in founder threads (out of scope)                                                        | UNKNOWN                      |
| Technical dependencies                  | would need its own contracts + review milestone                                                  | PLANNED (separate)           |
| Legal dependencies                      | same eligibility/jurisdiction gates as Capital Engine, plus issuance-specific                    | PLANNED                      |

**Rule (DECIDED):** Launch Lab implementation must NOT be mixed into the current Capital Engine contracts
without a separately approved milestone. The frozen contract set is for BPS distribution, not token launches.

## M. Decision register (chronological; newest at bottom)

| ID    | Date        | Decision                                                                                                                                                   | Status                | Affects                  | Supersedes                           |
| ----- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------ | ------------------------------------ |
| D-001 | 2026-07-18  | Economic policy **BPS-ECON-2.0**: buy 3% (2%+1%), sell 4% (2%+2%), 80/20 acquired-token split, fixed 1e9 supply, no mint                                   | DECIDED / IMPLEMENTED | router, vault, token     | BPS-ECON-1.0 (SUPERSEDED)            |
| D-002 | 2026-07-18  | v1 uses a standard fixed-supply ERC-20 + dedicated router over Uniswap v3; **no** fee-on-transfer token                                                    | DECIDED / IMPLEMENTED | token, router            | —                                    |
| D-003 | 2026-07-18  | Launch pool = WETH/BPS, fee tier 10000 (1.00%), tick spacing 200; use SwapRouter02 in v1                                                                   | DECIDED / IMPLEMENTED | swap adapter, pool       | —                                    |
| D-004 | 2026-07-18  | **Frontier 10** acquisition mandate (`BPS-FRONTIER-10-1.0`), 66/16/18 sleeves, SPCX ≤ 10%, basket **PROPOSED pending approval + registry re-verification** | PROPOSED              | acquisition adapter      | —                                    |
| D-005 | 2026-07-18  | Contract layer frozen; no ABI/interface/behavior change without a separate approved milestone                                                              | DECIDED               | all contracts            | —                                    |
| D-006 | 2026-07-18  | 15 founder/counsel decisions remain UNRESOLVED and fail-closed (`TASK_10_FOUNDER_DECISION_PACK.md`)                                                        | DECIDED (to defer)    | legal, ops, integrations | —                                    |
| D-007 | ~2026-07-20 | Release-readiness verdict: **NO-GO for live production**; external blockers outstanding (TASK 9)                                                           | DECIDED               | production launch        | —                                    |
| D-008 | 2026-07-18  | Disclosure reconciliation: protocol allocation (3%/4%) stated **separately** from ~1% pool fee/gas/slippage; official vs pool volume distinguished         | DECIDED / IMPLEMENTED | app copy, docs           | ECON-1.0 disclosures                 |
| D-009 | 2026-07     | Run a **$130-capped BPSC-TEST canary** (not production) to prove the deploy/execute machinery; fresh canonical deploy required afterward                   | DECIDED / DONE        | canary                   | —                                    |
| D-010 | 2026-07-24  | Canary gas policy: per-step ceilings = 1.25× reviewed cost; priority ceiling 50,000,000 wei; $130 all-inclusive cap; maxFee/2× gasLimit unchanged          | DECIDED / APPLIED     | canary operator          | earlier v6 ceilings                  |
| D-011 | 2026-07-24  | Narrow ABI deadline-refresh authorization (only the buy/sell/mint deadline word; byte-diff proven)                                                         | DECIDED / APPLIED     | canary calldata          | byte-for-byte preservation (partial) |
| D-012 | 2026-07-24  | Wrong selected account = non-halting refusal (nothing sent; switch + retry safe) — v8 operator                                                             | DECIDED / IMPLEMENTED | canary operator          | v7 halting precheck                  |
| D-013 | 2026-07-25  | Canary **complete + reconciled** (all 19 tx; nonces 16/8); v9 window now historical/expired; nonce-8 withdrawal deferred + unauthorized                    | DECIDED / VERIFIED    | canary                   | —                                    |
| D-014 | 2026-07-25  | Recommended next milestone = **distribution lifecycle fork rehearsal** (fee → acquisition → settlement → snapshot → claim)                                 | DECIDED (direction)   | lane 1/2                 | —                                    |
| D-015 | 2026-07-25  | Exclude `packages/contracts/canary-packet/` from repo prettier/eslint (byte-stable deliverable governed by its own manifest)                               | DECIDED / IMPLEMENTED | tooling config           | —                                    |
| D-016 | 2026-07-25  | Adopt the master handover + continuity-file system + `CLAUDE.md` continuity gate (this task, 10F)                                                          | DECIDED / IMPLEMENTED | docs, process            | prior handover structure             |

**Rejected/abandoned approaches (kept to avoid rework):** fee-on-transfer token design (unsafe for v3);
$1M FDV / 1.25% float figure (NOT accepted); treating any expired canary packet as reusable authorization
(explicitly prohibited); reusing BPSC canary instances as production; byte-for-byte calldata preservation
across a deadline expiry (superseded only for the deadline word).

## N. Open questions, blockers and technical debt

**Immediate / production blockers**

| ID  | Sev  | Item                                                                                  | Owner                   | Next action                                                | Done when                                            |
| --- | ---- | ------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| B-1 | High | No independent smart-contract security audit                                          | External auditor        | Commission audit of the frozen layer                       | Audit report received + findings resolved            |
| B-2 | High | Legal entity / jurisdiction / eligibility placeholders unresolved (decision-pack 1–7) | Founder + counsel       | Provide entity, governing law, forum, contacts, KYC policy | Placeholders replaced + counsel sign-off             |
| B-3 | High | Rialto production terms + Stock-Token KYC/allowlist path unproven                     | Founder + Rialto/issuer | Obtain terms; rehearse acquisition on fork                 | Live acquisition path verified on fork               |
| B-4 | High | Founder authorizations: seed size, valuation/float, Safe m-of-n, real-money go        | Founder                 | Decide seed + Safe + explicit go                           | Values set in deploy config + authorization recorded |

**Security blockers:** B-1 (audit). **Legal blockers:** B-2 (entity/jurisdiction/KYC), sanctions provider.
**Infrastructure blockers**

| ID    | Sev | Item                                                      | Next action                                 | Done when                                 |
| ----- | --- | --------------------------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| INF-1 | Med | Postgres schema + `@bps/db` not implemented (placeholder) | Design schema + migrations                  | Migrations run + tested                   |
| INF-2 | Med | Production RPC + monitoring/alerting unresolved           | Provision dedicated RPC + fallback + alerts | Endpoints configured (names only in repo) |
| INF-3 | Med | Indexer + worker are health skeletons only                | Implement event indexing + jobs             | Indexer serves cycle data                 |

**Product decisions:** Frontier 10 basket finalization (D-004); final public transparency-app copy;
IPFS/storage choice for manifests.

**Technical debt / documentation conflicts**

| ID     | Sev | Item                                                                                                                                                | Evidence                                      | Resolution                                                                                                                                                        |
| ------ | --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOC-1  | Med | Deploy registry `robinhood-mainnet.canary.json` `predicted` addresses are **offset** vs actual on-chain deployment and its `actual` map is **null** | registry vs evidence manifest (on-chain wins) | Treat evidence manifest + on-chain as authoritative; optionally backfill `actual` in a future task (registry `sourceCommit`/`pool`/`actual` still `null`/`UNSET`) |
| DOC-2  | Low | Historical test counts differ (TASK 9: forge 398 / web 129) vs current (416 / 177)                                                                  | later tasks added tests                       | Current re-run (2026-07-25) is authoritative; TASK 9 is a labeled historical baseline                                                                             |
| DEBT-1 | Low | Playwright E2E is a single smoke flow                                                                                                               | TASK 9 §5                                     | Expand E2E before public launch                                                                                                                                   |

**Deferred enhancements:** approval revocation for residual deployer→NPM allowances (harmless; not done);
nonce-8 delayed withdrawal (after unlock, separate reviewed packet).

## O. Exact next milestone

**Recommended production sequence (reconciled):**

1. **Post-canary mainnet reconciliation + permanent evidence checkpoint — COMPLETE** (VERIFIED; TASK 10E-1,
   2026-07-25; see §G and `docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.*`). This is confirmed
   complete from the read-only reconciliation, not from an execution screenshot.
2. **Distribution-lifecycle fork rehearsal** — **COMPLETE: `REHEARSAL PASS`** (TASK 10F-1, 2026-07-25,
   pinned fork block 18791290; the external Rialto settlement venue was explicitly mocked; see
   `docs/audit/BPS_DISTRIBUTION_LIFECYCLE_FORK_REHEARSAL_2026-07-25.md`). It does NOT establish
   production readiness, legal eligibility, or real RWA settlement.
3. Production hardening + independent security review (B-1) — NOT started.
4. Legal / eligibility completion (B-2/B-3) — NOT started.
5. Read-only public transparency application — NOT started.
6. Separately authorized production deployment — BLOCKED on 3–5 + B-4.

### NEXT TASK (bounded) — Distribution-lifecycle fork rehearsal

- **Objective.** On a local Anvil fork pinned to post-canary Robinhood Chain state (block ≥ 18791290),
  drive the full lifecycle end-to-end using the deployed BPSC-TEST canary contracts as fixtures: starting
  from the accrued StockAcquisitionVault WETH, execute an acquisition cycle (coordinator → Rialto adapter,
  with a mock/forked acquisition venue), apply the 80/20 split, take a snapshot, build the eligible-supply
  set (weighted by the existing lock), publish a Merkle root, and complete a participant claim — proving
  the half of the lifecycle the canary did not demonstrate. Produce a reproducible evidence artifact.
- **Prerequisites.** Read `CLAUDE.md` + this file + `docs/continuity/*`; Foundry on PATH; a **read-only**
  `ROBINHOOD_CHAIN_RPC_URL` (or fork RPC) for pinning; no dependency install/upgrade.
- **Permitted actions.** Local Anvil forks; fork-only Foundry tests (`ForkDeployRehearsal`-style, extended);
  read-only mainnet reads to pin/verify; writing new tests + a fork-rehearsal script + an evidence doc.
- **Prohibited actions.** ANY mainnet write, signing, broadcast, wallet connection, funding, approval,
  revocation, withdrawal, **tester nonce 8**, deploy, operator start, dependency change, commit, or push.
  Never reuse an expired canary packet as authorization. Never reuse BPSC as production.
- **Files expected to change.** New/updated under `packages/contracts/test/` (fork rehearsal),
  possibly `packages/contracts/script/` (a fork-only rehearsal script), `packages/shared`/`packages/pilot`
  wiring for a real (forked) snapshot, and a new `docs/audit/` evidence doc. Update the continuity files.
- **Required tests.** `forge test` (incl. the new fork rehearsal) PASS; `npm run check` PASS; the new
  lifecycle test asserts fee→acquisition→split→snapshot→root→claim invariants on forked state.
- **Completion evidence.** A reproducible fork-rehearsal run + evidence doc showing each lifecycle stage
  with on-chain-consistent numbers; continuity files updated; uncommitted.
- **Stop conditions.** Any requirement conflict, any need to write to mainnet, any missing external
  dependency (e.g. no forkable acquisition venue) → STOP and report; do not substitute a mock while claiming
  a live result. **Do not execute this task during the continuity assignment.**

## P. Operational command cookbook

Classification: **[R]** READ-ONLY SAFE · **[L]** LOCAL MUTATION · **[F]** FORK ONLY ·
**[LIVE]** LIVE-RISK — REQUIRES SEPARATE AUTHORIZATION. Foundry prefix for contract/fork commands:
`export PATH="$HOME/.foundry/bin:$PATH"`.

**Environment / Git inspection**

- `[R]` `node --version` · `git branch --show-current` · `git rev-parse HEAD` · `git status --short` ·
  `git log --oneline -12` · `git diff --check`
- `[R]` `git ls-files | wc -l` (tracked file count) · `git tag` (currently none)

**Dependency-safe tests / builds** (no install/upgrade)

- `[R]` `npm run check` — full gate (prettier, eslint, tsc, all vitest, next build, forge fmt/build/test)
- `[R]` `forge test` (in `packages/contracts`) — 416 tests
- `[R]` `npx vitest run` (in `apps/web`) — 177 tests · `npm run test --workspace @bps/shared` (52)
- `[R]` `npm run build:shared` · `[R]` `npm run build` (workspace builds)
- `[R]` `npm run proof:mock` — PoD mock cycle (local-only, no chain)

**Fork testing**

- `[F]` `ROBINHOOD_FORK_RPC=<read-only rpc> forge test --match-contract ForkDeployRehearsal`
- `[F]` `anvil --fork-url "$ROBINHOOD_CHAIN_RPC_URL" --fork-block-number 18791290` (local fork; no mainnet write)

**Evidence / source verification**

- `[R]` `sha256sum packages/contracts/canary-packet/canary-rabby-recovery-execution-review-v9.zip`
  → must equal `0c958a58b8684878c4dfce4a15cdba3b2fc0e39680d46902430ab6e78a09b74d`
- `[R]` `sha256sum docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.evidence.json`
  → must equal `d6005083b20e5188ce783cde5b30159b56228398d5bf204746b536e9e36b8ec3`
- `[R]` `node verify-all.mjs` (in `packages/contracts/canary-packet/exec/`) — 9-suite bundle verify
- `[R]` `node packages/contracts/canary-packet/post-canary-reconcile.mjs` (needs `ROBINHOOD_CHAIN_RPC_URL`)
  — re-reconcile all 19 tx read-only

**Safe read-only chain checks** (RPC from env; never print the URL)

- `[R]` nonces: `eth_getTransactionCount` for deployer/tester at `latest`+`pending` (expect 16/16, 8/8)
- `[R]` chain id: `eth_chainId` (expect 4663)
- `[R]` `node recovery-preflight.mjs` (in bundle `exec/`) — read-only preflight gates

**Detecting stale/expired execution packets**

- `[R]` any canary packet whose meta expiry timestamp is in the past, OR whose window/nonces no longer match
  live state, is **expired = evidence only**. Confirm via `post-canary-reconcile.mjs` (nonces 16/8) — if it
  passes, the plan is complete and NO packet is executable.

**Stopping local operators**

- `[L]` stop any local static/operator server (e.g. the bundle's localhost server on port 8741) by ending
  its process; no mainnet effect.

**LIVE (do NOT run without a separate, bounded, reviewed authorization task)**

- `[LIVE]` any `cast send` / broadcast / deploy / `anvil`-less mainnet write / operator "execute" against
  chainId 4663, including the tester **nonce-8** withdrawal. **No ready-to-paste live command is provided
  here by design.**

## Q. Disaster recovery

> **HANDOVER.md IS NOT A BACKUP OF THE REPOSITORY OR SECRETS.** It is a map, not the territory. If the repo
> or the secrets are lost, this file cannot restore them.

**What must be preserved OUTSIDE any Claude/ChatGPT account (off-account backup set):**

- The full repository **including `.git`** (history + commit `7428f74`).
- The **uncommitted working tree** (modified `.prettierignore`, `eslint.config.mjs`, `HANDOVER.md`; the
  `docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.*` files; the new `docs/continuity/*`).
- Required **untracked evidence + canary ZIPs**: the entire `packages/contracts/canary-packet/` directory,
  especially `canary-rabby-recovery-execution-review-v9.zip` (SHA `0c958a58…b74d`, 578,871 bytes) and the
  `exec/` bundle.
- The **deployment registry** (`packages/contracts/deploy/*`) and **audit reports** (`docs/audit/*`).
- **On-chain evidence manifest** (`…evidence.json`, SHA `d6005083…8ec3`).
- **Database backups** where applicable (once a DB exists — not yet).
- **Domain / hosting / account-ownership records** (registrar, host, RPC provider, Safe signers).
- **Environment-variable-name inventory** (from `.env.example`; names only).
- **Secret VALUES** (RPC URL, `RIALTO_API_KEY`, `WALLET_AUTH_SESSION_SECRET`, DB URL, deployer/tester keys)
  in a **separate encrypted password manager or secret store** — NEVER in this repo or any continuity file.
- **Recovery codes** (wallet, provider, registrar) stored securely and separately.

**Windows recovery checklist (new machine):**

1. Install prerequisites: Git, Node **v24.18.0** (match `engines`), Foundry (`foundryup`; ensure
   `~/.foundry/bin` on PATH).
2. Restore the repo (with `.git`) and the untracked evidence/canary directories to `C:\Projects\bps-experiment`.
3. Verify integrity (below) before trusting anything.
4. `npm ci` (uses `package-lock.json`; do not upgrade). Copy `.env.example` → `.env` and fill secrets from
   the encrypted store (never commit).
5. Run `npm run check` and the canary `verify-all.mjs` to confirm a healthy tree.
6. Read `CLAUDE.md` + `HANDOVER.md` + `docs/continuity/*`, then follow **START HERE** before any work.

**Integrity verification procedure:**

- `git rev-parse HEAD` == `7428f7470ad9805f1563ca3be57573e4257a05d4` (or a documented later commit).
- `sha256sum` the v9 ZIP == `0c958a58…b74d`; the evidence JSON == `d6005083…8ec3`.
- `node post-canary-reconcile.mjs` (read-only) confirms nonces 16/8 and all 19 tx — the on-chain source of
  truth independent of any local file.
- `git diff --check` clean; `git status` matches the SNAPSHOT (or the current continuity state).

**Restore without exposing secrets:** never paste secret values into chat, commits, logs, or continuity
files; inject them only via the local `.env` / environment at runtime; keep the RPC URL out of all output.

---

# PART III — PRESERVED HISTORY

## Historical change log (preserved from prior handover; newest first)

- **2026-07-25 (TASK 10E-1 — post-canary mainnet reconciliation and evidence checkpoint)** — Strictly
  read-only. **All 19 BPSC-TEST canary transactions are COMPLETE on Robinhood Chain mainnet** (executed via
  the reviewed v9 operator). Independently reconstructed tester nonces 2-7 (original steps 14-19) on chain
  and verified them byte-exactly against the v9 canonical; re-verified all 13 prior anchors, 8 runtime
  hashes, pool/LP position, buy/sell/lock events + accounting, fee accrual, burns, balances and allowances;
  confirmed final nonces deployer 16/16 / tester 8/8 with NO nonce-8 transaction (delayed withdrawal
  unexecuted + unauthorized; no approval revocation performed; the fee → RWA acquisition → snapshot → claim
  lifecycle is NOT yet demonstrated). New files: `docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.md`,
  `docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.evidence.json` (SHA-256 `d6005083…8ec3`), and the
  read-only reconstruction script `packages/contracts/canary-packet/post-canary-reconcile.mjs` (untracked
  dir). Config: `.prettierignore` + `eslint.config.mjs` now exclude `packages/contracts/canary-packet/`
  (byte-stable deliverable). Suites: canary VERIFY-ALL PASS (9 suites); repo `npm run check` PASS incl.
  web vitest 177/177 and forge 416/416. **Next milestone: Distribution lifecycle fork rehearsal — fee
  accounting → acquisition funding → RWA settlement → snapshot → Merkle claim.** All changes left
  uncommitted.

- **2026-07-25 (TASK 10D-8 — pure v9 time refresh from reviewed v8)** — The reviewed v8 package (zip SHA
  `6c92a429…8aa9`, digest `0x5f92fd12…6662`, both verified on disk before use) expired before execution.
  v9 is a PURE TIME REFRESH from that reviewed source: all 13 anchors independently re-reconstructed and
  re-verified on chain (same hashes/gas; pool + position state exact); live nonces re-confirmed deployer
  16/16 / tester 2/2; the six tester transactions (original steps 14-19, tester nonces 2-7) sourced from the
  reviewed v8 packet with ONLY the steps-15/17 deadline word refreshed (source deadline required == bound v8
  value 1784949999 → new 1784978640 == fresh packet expiry; byte-diff proven single-word; other four
  calldatas byte-identical to v8); accepted gas policy + $130 cap unchanged; **metadata fix:**
  originalPlan.deployerStepRange corrected "2-13"→"1-13" with a digest-bound identity (all 13 anchors are
  deployer steps 1-13) + regression tests; v8 zip SHA + v8 digest bound into the v9 canonical (v5/v6/v7
  anchors retained); port **8741**, isolated `canaryv9:` namespace (v5/v6/v7/v8 untouched, tested).
  **No live write, signing, broadcast, Rabby connection, commit, or push.** Verification: compile 7/7,
  offline 61/61, manifest 5/5 (105), static 7/7, v5 replay 19/19, v5 operator 46/46, v5 smoke 7/7,
  **recovery-test 40/40**, **v9 smoke 10/10 (port 8741)**, **recovery preflight PASS** (exposure
  $123.01-123.05 ≤ $130), clean-extraction VERIFY-ALL PASS. Delivered untracked
  `packages/contracts/canary-packet/canary-rabby-recovery-execution-review-v9.zip`.

- **2026-07-24 (TASK 10D-7 — v8 recovery after v7 account-selection precheck halt)** — The v7 operator
  executed original steps 3-13 successfully (through NPM.mint, tx `0x09ee1c10…a3f8`, deployer nonce 15),
  then terminally halted on the accountSelected pre-check for original step 14 with the deployer still
  selected in Rabby (no tester transaction occurred; no tester nonce consumed — verified live 16/16 + 2/2).
  Built v8: **all 13 completed steps independently RECONSTRUCTED on chain** (steps 3-13 tx hashes discovered
  by binary-searching each deployer-nonce transition block, then verified against the accepted v7 canonical:
  sender/nonce/destination/value/calldata/receipt/deployed-runtime-hashes/events; pool + LP position state
  exact — tokenId 371728, liquidity matches; realized gas steps 1-13 = 1,754,578,810,854,000 wei). Only the
  FINAL SIX tester transactions (original steps 14-19, tester nonces 2-7) are signable; NO deployer
  transaction is actionable. **v7 halt fix:** connect refuses any account other than the tester and a
  wrong-account pre-check is a NON-HALTING refusal (nothing sent; switch + retry safe). Accepted v7 gas
  policy preserved (1.25x cost ceilings, 50,000,000 wei priority ceiling); accepted deadline-refresh applied
  to remaining steps 15/17 only (source deadline required == bound v7 value 1784946528; byte-diff limited to
  the single deadline word; other four calldatas byte-identical to v7). Port **8740**, isolated `canaryv8:`
  namespace (v5/v6/v7 records untouched). **No live write, signing, broadcast, Rabby connection, commit, or
  push; no key handled; RPC from env only.** Verification: compile 7/7, offline 61/61, manifest 5/5 (104),
  static 7/7, v5 replay 19/19, v5 operator 46/46, v5 smoke 7/7, **recovery-test 40/40** (13 anchors imported
  - 6/6 tester replay on REAL post-step-13 fork state + account-gate/gas/deadline/mutation suites: 668-leaf
    canonical + source-input completeness), **v8 smoke 10/10 (port 8740)**, **recovery preflight PASS** (9
    gates incl. all 13 anchors re-verified live), clean-extraction VERIFY-ALL PASS. Delivered untracked
    `packages/contracts/canary-packet/canary-rabby-recovery-execution-review-v8.zip`.

- **2026-07-24 (TASK 10D-6 — v7 recovery after confirmed original step 2)** — Original step 2
  (BPSLockingVault deploy) also executed successfully on mainnet — tx `0x4569523a…d758`, created
  `0xeFA9d1C4…8A42` (deployer nonce 4, block 18395614, actual gas cost 153175336840000 wei; Rabby envelope
  1901820/186000000/50000000). v6 halted post-broadcast on BOTH its priority ceiling (0.05 > 0.01 gwei) and
  its per-step cost cap (353.7e12 > 301.3e12 reviewed) — reported as a requirements conflict; the user
  explicitly authorized **option B**: per-step maxGasCost ceilings = exactly **1.25× reviewed** (steps 3–19
  only), priority ceiling exactly **50,000,000 wei**, maxFee/gasLimit ceilings and the $130 cap unchanged.
  A second discovered blocker — the accepted mint/buy/sell calldata deadlines (1784916327) had expired on
  chain — was separately authorized for a **strict ABI decode/re-encode deadline refresh** (steps 13/15/17
  only; new deadline == packet expiry == pinned ts + 21600; byte-diff proof restricts each change to the
  single 32-byte deadline word; the other 14 calldatas byte-identical). Built v7: both anchors verified
  on-chain and permanently non-actionable (no dispatch route for deployer nonces 3/4), 17 signables
  (original steps 3–19, deployer 5–15 / tester 2–7), canonical v7 recovery authorization binding v5+v6 zip/
  digest anchors, both completed-step anchors, the gas policy and the deadline refresh (with per-step old
  reviewed + new 1.25× ceilings and old/new dataKeccak), port **8739**, isolated `canaryv7:` namespace,
  runtime gates (provider block ts strictly before expiry; bound calldata deadline == bound expiry).
  Historical v5 engine test now runs with a frozen in-window test clock (the superseded v5 packet's live
  preflight correctly FAILs). **No live write, signing, broadcast, Rabby connection, commit, or push.**
  Verification: compile 7/7, offline 61/61, manifest 5/5 (103), static 7/7, v5 replay 19/19, v5 operator
  46/46, v5 smoke 7/7, **recovery-test 44/44** (17/17 replay + gas-policy/deadline/mutation suites: 545
  canonical leaves, 513/443 source-input), **v7 smoke 9/9 (port 8739)**, **recovery preflight PASS**,
  clean-extraction VERIFY-ALL PASS. Delivered untracked
  `packages/contracts/canary-packet/canary-rabby-recovery-execution-review-v7.zip`.

- **2026-07-24 (TASK 10D-5 — v6 confirmed-step recovery operator)** — The v5 browser operator executed
  original step 1 (BPSCanaryToken deploy) successfully on Robinhood Chain mainnet — tx
  `0x36acf3e3752e0cfc2688c280680c4a9a100e3fcb2520bf41ae723f1a05612e2c`, created
  `0x2E6C3dC1e04C45d4B9d40BeE392a135beA50A5d7` (deployer nonce 3, block 18193678) — then halted fail-closed
  in post-verification (provider omitted tx-response chainId; Rabby adjusted the EIP-1559 gas envelope
  within the reviewed cap). Built a fresh RECOVERY package: **no live write, funding, signing, broadcast,
  Rabby connection, live operator start, commit or push in this task; no key handled; RPC from env only.**
  (1) `recovery-capture.mjs` independently verified the completed step-1 anchor on chain (hash/chain/sender/
  nonce-3/creation/value-0/exact calldata/predicted address/runtime hash+size/constructor effects incl. name/
  symbol/decimals/supply/allocation/IS_CANARY/single mint log/gas accounting/no replacement at nonce 3) and
  captured the fresh live recovery snapshot (deployer latest=pending=4, tester 2/2, completed token code
  exact, other 7 predicted empty, 6 dependency hashes+sizes exact). (2) `recovery-generate.mjs` +
  `operator/recovery-canonical.mjs` produce the canonical recovery authorization binding v5 anchors (zip
  SHA + reviewedAuthorizationDigest), the complete original 19-step identity, the exact completed-step
  tx/receipt anchor, the 18 remaining signables (original indices 2–19 retained; step 1 permanently
  non-actionable with no dispatch route), live nonce expectations 4/2, actual step-1 gas cost
  (65693784716000 wei), per-step gas-adjustment ceilings (gasLimit ≤ 2× reviewed; fee caps = reviewed;
  gasLimit×maxFee ≤ reviewed step cost), and the recovery exposure identity (actual step-1 gas + remaining
  principal + remaining max gas = aggregate ≤ $130); digest anchored in recovery packet + recovery policy +
  packaged `operator/recovery-authorization.json`. (3) `operator/recovery-core.mjs` (extends the v5 engine):
  bounded-gas shared verifier (exact from/nonce/to|create/value/calldata/type/access-list; the observed
  step-1 envelope 900128/126100000/6196000 passes), `eth_chainId==4663` asserted at every boundary with
  absent-tx-response-chainId tolerated only under that assertion, on-chain step-1 anchor re-verified at
  every reconcile, DISTINCT `canaryv6:` storage namespace (v5 halt records never read/mutated), and the
  v5 `resolveUncertainSend` storage defect fixed (journal-first; stays halted unless every durable write
  round-trips). Also fixed a latent postcondition bug: LockCreated start/unlock are execution-time values —
  now verified via internal consistency (start+duration==unlock) + bound duration/multiplier/policyVersion.
  (4) v6 browser (`operator/recovery-serve.mjs` port **8738**, `recovery-index.html`, `recovery-app.js`):
  dual counters ("Original step N of 19" / "Remaining transaction M of 18"), step-1 shown only as
  "Original step 1 verified complete on chain.", manual tester-switch prompt before original step 14,
  injection-safe DOM only. (5) Tests: `recovery-test.mjs` **30/30** (step-1 import + 18/18 replay on a
  post-step-1 fork, restart after every remaining step, bounded-gas + chainId + isolation + storage-fault
  adversarial, 510-leaf recovery canonical mutation, source-input completeness 477 shift / 437 unused,
  10 regressions incl. step-1-injection), `recovery-browser-smoke.mjs` **8/8**, `recovery-preflight.mjs`
  **PASS** (9 gates incl. chain), full `verify-all.mjs` (9 suites) **PASS** in-place and from a clean
  extraction of the delivered zip. The stale v5 preflight now truthfully FAILs (nonce 4; token deployed),
  preventing v5 re-execution. Delivered untracked
  `packages/contracts/canary-packet/canary-rabby-recovery-execution-review-v6.zip`.

- **2026-07-24 (TASK 10D-4 — final browser-path + canonical-runtime completion)** — Fixed the reasons v4 was
  rejected, scoped to operator/browser/runtime-binding + tests + docs + packaging (no contract/economics
  change; all v3/v4 restart/uncertain-send/tx-field/nonce/price protections preserved). **No live transaction,
  funding, signing, broadcast, deploy, approval, Rabby connection, operator start, commit, or push; no private
  key handled; provider RPC read from `ROBINHOOD_CHAIN_RPC_URL` (env) only.** (1) `operator/serve.mjs`
  allowlist now serves `/canonical.mjs` + `/reviewed-authorization.json` (were 403, breaking the real page);
  new `browser-smoke.mjs` starts the server and proves over HTTP that every allowlisted asset + the full
  module/fetch graph is 200, traversal/non-allowlisted paths are 403, the served `app.js` completes canonical
  binding with no console/import/fetch error, Connect is the only enabled initial control, and HTML text stays
  inert. (2) Canonical object (`operator/canonical.mjs`, schema `10D-4`) now binds EVERY runtime-consumed
  value: 6 dependency addresses+runtime-hashes+code-sizes, 8 deployed runtime code hashes, fixed step
  identity (phase/label/postconditionType), LP/fee/tick/mint expectations, complete buy/sell event+accounting
  (tradeId/trader/recipient/adapter/budget), complete lock (account/lockId/principal/start/duration/unlock/
  multiplier/policy). `operator-core.mjs` builds `this.steps` from canonical, derives `decodedArgs` from
  calldata + `maxGasCostWei = gasLimit*maxFeePerGas`, and **discards** raw packet/policy/snapshot after bind
  (static-scan enforces no runtime read of them). (3) `operator-test.mjs` adds a source-input mutation harness
  (every packet/policy/snapshot leaf changes the digest or is provably unused), section-2 regressions, exact
  indexed-event adversarial tests (wrong Approval owner / buy trader-recipient-adapter / lock id-duration-
  policy), and 5 storage crash-window fault tests. (4) `app.js` rebuilt with `createElement`/`textContent`
  only (no `innerHTML`); static-scan asserts no HTML/JS injection sink. (5) `package.json` description
  corrected from the stale "HISTORICAL FIXTURE — non-live, non-executable". Fresh live packet regenerated at
  block 18134956 (nonces re-checked live: 3/2). Delivered untracked bundle
  `packages/contracts/canary-packet/canary-rabby-execution-review-v5.zip`. Verification: compile 7/7, offline
  61/61, manifest 5/5, static 7/7, replay 19/19, operator-test **46/46**, browser-smoke **7/7**, preflight
  8/8, clean-extraction `npm ci --ignore-scripts && node verify-all.mjs` PASS.

- **2026-07-24 (TASK 10D-3 — reviewed-input binding correction)** — The independent v3 review found the
  Rabby operator's packet binding accepted ≥14 material mutations (2035 expiry, authorization disabled,
  NVDA/pool address changes, chain/wallet snapshot changes, zeroed WETH/gas exposure inputs, etc.) because
  it cross-compared packet/policy/snapshot rather than binding to one reviewed object. Fix, scoped to
  reviewed-input binding + its runtime data source + tests + docs + packaging only (no operator rewrite;
  all v3 restart/recovery/tx-verification/nonce/price protections preserved). **No live transaction,
  funding, signing, broadcast, deploy, approval, Rabby connection, operator start, commit, or push; no
  private key requested or handled; provider RPC read from `ROBINHOOD_CHAIN_RPC_URL` (env) only, never
  printed or written.** (A) New `operator/canonical.mjs`: ONE strict, versioned canonical
  reviewed-authorization object over EVERY security-relevant leaf (chain, wallets, start nonces, block
  snapshot, all infra/token/pool/oracle/Uniswap addresses, 8 predicted deployment addresses + empty-code
  assertion, all 19 signable txs + per-tx gas/fees, principal/max-gas/aggregate exposure inputs with an
  aggregate-identity check, exact $130 cap, generated/expiry/validity, auth+safety flags, provenance hashes,
  executionPacketDigest, delayed-withdrawal-disabled); `reviewedAuthorizationDigest = keccak256(canonicalStable)`;
  strict schema rejects missing/unknown/duplicate keys, wrong types, alternate numeric encodings, non-canonical
  addresses. (B) `generate-packet.mjs` writes the digest as three INDEPENDENT anchors — `packet.meta`,
  `review-policy.json`, and packaged `operator/reviewed-authorization.json`. (C) `operator-core.mjs`
  `bindAndVerifyPacket` reconstructs the canonical object from runtime inputs and requires all three anchors
  to agree + strict validation + structural equality; after binding, ALL runtime values (cap, exposure
  components, infra/wallet/nonce/pool/deployment addresses, expiry, authorization) come ONLY from the bound
  object (`_exposureGate`, `preconditions` expiry + auth flags updated accordingly). (D) `app.js` loads the
  packaged anchor (raw + parsed) and binds before Connect. (E) `verify-packet.mjs` reconstructs + asserts the
  three anchors agree with an 8-way source-mutation test. (F) `operator-test.mjs` adds a generic every-leaf
  mutation harness (318 leaves, each fails binding), the 14 v3 regressions, structural mutations
  (missing/unknown/duplicate-key/reorder/duplicate-index/casing/hex/leading-zero), single-anchor-recompute
  attacks, and a failed-bind-disables-controls assertion — all v3 tests retained. Fresh live packet
  regenerated at block 18075638 (nonces re-checked live: deployer 3 / tester 2). Delivered untracked bundle
  `packages/contracts/canary-packet/canary-rabby-execution-review-v4.zip`. See §10 for the verification run.

- **2026-07-23 (TASK 8D — close final restricted-beta acceptance gaps)** — Closed the remaining TASK 8
  acceptance gaps without redesigning accepted 8B/8C work. **No live transaction, deployment, wallet
  access, signature, broadcast, or protected Rialto request; `RIALTO_API_KEY` never read; no frozen
  Solidity/interface/contract-test, `packages/shared/src`, or TASK 7 file modified; no dependency installed
  or lockfile change.** (A) Added authoritative reads + tests: `readCycle` (cycles()), `readAssetFunding`
  (assetFunding()), `readClaimUsed` (claimed()), `readAcquisition` (acquisitions()), `readLockCount`
  (lockCount()); extended `abis.ts` with those frozen getters. (B) **Withdrawal**: real `withdraw(uint256
lockId)` flow in `LockPanel` (`demo-withdraw`) — reads authoritative locked balance → validate → simulate
  → submit through the connector → confirm → re-read locked balance → success ONLY on exact reconciliation
  (locked drops by exactly the withdrawn position principal). A pre-existing 500-BPS position (id 0) is
  seeded so the demo lock (id 1) then `withdraw(1)` is a genuine PARTIAL withdrawal leaving 500 locked.
  (C) tx-lifecycle failure coverage: added `waitConfirmed` handling mempool replacement via viem's
  `onReplaced` (cancelled replacement → failure; repriced/replaced → follow the confirmed receipt) and
  confirmation errors (fail-closed), plus tests for approval rejection, approval-reverted receipt,
  allowance-reconcile failure (`suppressApprovalEffect`), confirmation-depth >1, replacement-confirmed,
  replacement-cancelled, and confirmation timeout. (D) **Complete event transparency**: decode OfficialSell,
  BpsRepurchasedAndBurned (dedicated repurchase/burn figure, distinct from per-trade burn), and
  StockBudgetDelivered; each decoded event carries a tx-hash/block/emitter `EventRef`; UI shows sell volume,
  repurchase-and-burn, and delivered budget; tests for sell/burn/budget, overlapping-range dedup,
  confirmation-depth exclusion end-to-end, missing-range and inconsistent-linkage. The mock `eth_getLogs`
  now honors fromBlock/toBlock/address. (E) **Authoritative claim validation**: extracted
  `lib/services/claim-validation.ts` (`validateClaimReadiness`) — reads current cycles()/assetFunding()/
  claimed()/remaining()/manager-balance and compares the artifact root to the CURRENT on-chain root; the
  ClaimPanel now uses it. Negative test per mismatch (not-published, root-mismatch, exceeds-allocation,
  not-registered, already-claimed, manager-balance-insufficient) + a test proving an OLD event root cannot
  override a CHANGED current cycle root. (F) **Oracle boundary**: extended `oracle-reads.test.ts` with a
  tailored transport covering decimals, positive/zero answer, updatedAt/heartbeat staleness, oraclePaused,
  sequencer up/down/grace, missing code, malformed response, and RPC failure (all fail-closed). (G)
  **Provider-state coverage**: added test-only `__setAccounts`/`__disconnect` controls to the mock provider
  and `mock-eip1193.test.ts` proving accountsChanged updates the exposed account, chainChanged updates the
  chain, a signature recovering to a different account than the message wallet is rejected, disconnect
  exposes no accounts, reconnect requires explicit `eth_requestAccounts` (no silent consent), a rejected
  switch preserves the wrong chain, and the deterministic key is reachable only through the provider's
  request surface. (H) Extended the **Playwright** Chromium E2E with the partial withdrawal (reconciled
  locked balance 1500→500), event-derived buy/sell/repurchase-burn/budget transparency, and authoritative
  cycle-backed claim — no separate local wallet client constructed. Verification: full `npm run check`
  (format + lint + typecheck + **129** web vitest tests + web `next build` + `forge fmt/build/test` **398**,
  exit 0) and `npm run test:e2e` (1 browser test passed). Live writes remain disabled without a
  broadcast-ready manifest; production declaration/eligibility/proof-artifact configs remain fail-closed
  blockers; the system is not public, decentralized, or legally approved.

- **2026-07-22 (TASK 8C — finish restricted-beta interaction coverage)** — Closed the TASK 8B interaction
  gaps. **No live transaction, deployment, wallet access, signature, broadcast, or protected Rialto
  request; no frozen contract/interface/test or `packages/shared/src` or TASK 7 file modified; no new
  dependency installed.** (A) Replaced the UI-level network simulation + the direct local wallet client
  with an AUTHORITATIVE deterministic EIP-1193 provider (`lib/testing/mock-eip1193.ts`) driven by the
  wagmi `injected` connector: `eth_requestAccounts`, `eth_chainId` (initial wrong chain), real
  `wallet_switchEthereumChain` that mutates state + emits `chainChanged`, `eth_signTypedData_v4` (signs
  internally with the local-test key), `eth_sendTransaction`, receipts + `chainChanged`/`connect` events.
  The app now signs and sends ONLY through the connector — no panel imports `localTestAccount` and
  `createDemoWalletClient` was removed. Declaration signing goes through `useSignTypedData` and the
  recovered signer is checked against the connected account. (C) Real lock flow (read balance/locked/
  allowance → exact approval → simulate → submit → confirm → **reconcile** the confirmed locked balance).
  (D) tx lifecycle gained a post-confirmation `reconcile` step (success is never reported on a returned
  hash alone) + tests for reconcile-fail and reverted-receipt. (E) Event-backed transparency
  (`lib/services/transparency-reads.ts`): encode/decode real frozen-ABI logs (OfficialBuy,
  AcquisitionRecorded/Funded, Claimed), dedupe by (block,tx,logIndex), reject malformed, aggregate to the
  provenance-tagged model; the UI consumes the decoded result and updates after a confirmed claim. (B)
  Added `readLockedPrincipal`; (G) `readFeed` tested against the mock. (F) Full claim field validation
  (artifact version/chain/manager/account + on-chain root from the decoded funded event + proof/remaining
  - simulation). New component tests (provider-derived wrong chain, rejected switch, connector signature,
    full flow) and an extended **Playwright browser E2E** in real Chromium proving connector-driven switch,
    signature, trade, lock+reconcile, transparency update, and claim+duplicate-disabled. Verification:
    `forge fmt/build/test` (398), full `npm run check` (176 TS + 398 Foundry, exit 0), web `next build`
    static, `npm run test:e2e` (1 browser test passed), no `localTestAccount`/`createDemoWalletClient` in
    app code, browser-bundle scan clean of `RIALTO_API_KEY`/`fetchRialtoAllowanceQuote`, `git diff --check`
    clean. Live writes remain disabled without a broadcast-ready manifest; production declaration/eligibility/
    proof-artifact configs remain fail-closed blockers; the system is not public, decentralized, or legally
    approved.

- **2026-07-22 (TASK 8B — complete restricted-beta interaction layer)** — Built the real wallet / RPC /
  transaction interaction layer on top of the accepted TASK 8 core. **No live transaction, deployment,
  wallet access, signature, or protected Rialto request; no frozen contract/interface/test or
  `packages/shared/src` modified; no Task 7 file changed.** Installed authorized deps into `@bps/web`:
  `wagmi` 3.7.4, `@tanstack/react-query` 5.101.4, `viem` 2.55.8 + `zod` 4.4.3 (declared; also bumped
  `@bps/shared` viem 2.55.5→2.55.8 so the tree dedupes to a single viem — required by wagmi), and dev
  deps `@testing-library/react` 16.3.2, `@testing-library/user-event` 14.6.1, `@testing-library/jest-dom`
  6.9.1, `jsdom` 29.1.1, `@vitejs/plugin-react` 6.0.4, `@playwright/test` 1.61.1. Added: viem contract-
  read + Chainlink-read services (transport-injected, fail-closed on wrong chain / missing code / RPC
  error; chunked+deduped logs), a transaction-lifecycle service (exact approval → simulate → submit →
  confirm → reconcile, never unlimited approval, never SwapRouter02), a proof-artifact provider (local
  deterministic; production service is a blocker), a versioned declaration config (production null →
  fail-closed; labeled local-test config) + eligibility-service interface + local mock (no public endpoint
  that can mark users eligible), a deterministic mock JSON-RPC transport + wagmi mock config (local/test
  only), and a wagmi + react-query client app (`AppDashboard` with wallet/eligibility/trade/lock/claim/
  transparency panels). Tests: 6 read-service + 5 tx-lifecycle + 3 component/integration (jsdom) tests,
  and a **Playwright browser E2E** in real Chromium driving connect → wrong-network → switch(4663) → sign
  local declaration → separate local eligibility → preview buy → exact approval → simulation → mocked
  confirmation → verify proof → claim → duplicate-disabled. Verification: `forge fmt/build/test` (398),
  full `npm run check` (166 TS + 398 Foundry, exit 0), web `next build` static, `npm run test:e2e` (1
  browser test passed), responsive inspection at 1280px + 375px in a real browser (no horizontal
  overflow; accessible roles/labels; disabled live controls; fixture labels), browser-bundle scan clean
  of `RIALTO_API_KEY`/`fetchRialtoAllowanceQuote`, `git diff --check` clean. **Deferred/blocked (not
  faked):** no accepted production EIP-712 declaration domain (local-test scaffold; USER/LEGAL INPUT
  REQUIRED), no production eligibility service (interface + local mock; EXTERNAL REVIEW REQUIRED), no
  production proof-artifact service (local provider); the wrong-network→switch demo is UI-simulated
  because the wagmi mock connector does not surface a real cross-chain switch (documented). Live writes
  remain disabled without a broadcast-ready manifest; the system is not public, decentralized, or legally
  approved.

- **2026-07-22 (TASK 8 — restricted-beta application integration + on-chain transparency)** — Built a
  production-shaped restricted-beta interface on `apps/web` from the previously placeholder page. **No
  contract deploy, live transaction, signature, broadcast, pool, or liquidity action; no wallet/key/
  credential/protected-Rialto access; no frozen contract/interface/test or `packages/shared/src`
  modified; no dependency installed (viem/zod/vitest used via workspace hoisting).** Added a tested,
  dependency-free application core under `apps/web/lib/`: (A) `manifest.ts` — a deployment-manifest
  boundary that validates the Task 7 schema, requires chain 4663, distinguishes local/fork/restricted-
  beta/production, rejects null/zero/placeholder/malformed addresses, and FAILS CLOSED (writes stay
  disabled until a broadcast-ready, same-commit, real-address manifest passes an injected runtime-code
  check; fixtures never enable writes). (B) `eligibility.ts` — a 7-state wallet+declaration machine with
  EIP-712 verification (signer/chain/expiry/nonce-replay/document-version via viem) where signing is
  NEVER sufficient for eligibility (a separate boundary result is required). (C) `trade.ts` — official
  trades route only through BPSTradeRouter (never SwapRouter02), exact allowances, full economics
  disclosure, and a fail-closed submission gate. (D) `locking.ts` — no yield/APY language. (E) `claim.ts`
  — local double-keccak leaf + sorted-pair Merkle verification against the on-chain cycle; entitlement is
  never inferred from holdings. (F) `transparency.ts` — provenance-tagged read model that keeps budget
  accrual distinct from executed acquisitions and never calls Rialto decentralized. (G) a source-scan
  test proving no browser-reachable code imports the quote client or references `RIALTO_API_KEY`. (H)
  `oracle.ts` — a read-only Chainlink feed model + `minStockOut` operator policy (feed addresses are
  config-injected, not hardcoded). A fail-closed UI (`app/page.tsx`, `globals.css`) renders "Protocol not
  live", disables all writes, labels fixtures, and states the system is not decentralized. Tests: 55
  vitest tests in `apps/web/lib/*.test.ts` (incl. `e2e.test.ts` and `rialto-boundary.test.ts`), wired via
  `vitest.config.ts` + a `test` script. Verification: `forge fmt --check`, `forge build`, `forge test`
  (398 pass), `npm run test --workspace @bps/web` (55 pass), full `npm run check` (152 TS + 398 Foundry,
  exit 0), web `next build` static, browser-bundle scan clean of `RIALTO_API_KEY`/
  `fetchRialtoAllowanceQuote`, `git diff --check` clean. **Deferred as blockers (not faked):** a real
  wallet-connect + EIP-712-signing UI and React-component/browser-E2E tests require wagmi/
  @testing-library/jsdom (not installed — stopped before installing); there is no pre-existing accepted
  EIP-712 legal domain, so the declaration typed-data is a clearly-labeled beta scaffold pending
  governance/legal finalization; a protected operator/quote route stays disabled (no operator-auth
  boundary exists). Live blockers carried forward unchanged (§11); legal/eligibility and security review
  remain incomplete.
- **2026-07-22 (TASK 7 — verified deployment configuration + restricted-beta rehearsal)** — Prepared a
  production-shaped, independently verified Robinhood Chain deployment package and a deterministic
  deployment rehearsal; **no live broadcast, deploy, sign, pool, or liquidity action was performed**, no
  wallet/key/credential/protected-Rialto endpoint was accessed, and no frozen contract/interface/test or
  `packages/shared/src` was modified. (A) Closed the two admitted Task 6B funding-rollback test gaps with
  test-only fixtures (`test/mocks/HostileFundingManager.sol` under-retains → `ManagerReceiptMismatch`;
  `test/mocks/AllowanceTrapERC20.sol` never clears its allowance → `AllowanceNotCleared`) and
  `test/CoordinatorFundingRollback.t.sol` (2 tests) proving the entire funding operation rolls back
  (status, cycle linkage, vault `distributionReleased`, balances, allowance, reserve accounting). (B/C/G)
  Verified externals via the read-only public RPC + official docs and recorded them in
  `deploy/robinhood-mainnet.dryrun.json`: chain 4663; WETH (18-dec, triple-confirmed); the Rialto
  registry with `ownerOf(2)` FAIL-CLOSED semantics (empirically + docs) matching the frozen
  `IRialtoRouterRegistry`; the live feature-2 router; SwapRouter02 (`WETH9()==WETH`) + v3 factory; and 19
  whitelisted stock candidates (AAPL/NVDA re-verified on-chain). (D/E/F) Added `script/BPSDeployment.sol`
  (deterministic no-setter deploy plan + fail-closed validation + prediction + immutable assertions),
  `script/DeployBPS.s.sol` (broadcast-free operator preflight + sanitized manifest),
  `deploy/manifest.schema.json`, `deploy/robinhood-mainnet.dryrun.json`, `deploy/RUNBOOK.md`, and
  `.env.example`; `foundry.toml` gained a `./deploy`-scoped `fs_permissions` and `.gitignore` ignores the
  generated `manifest.out.json`. Tests: `test/DeployConfigValidation.t.sol` (13, offline) and
  `test/ForkDeployRehearsal.t.sol` (1, mainnet-fork; skips when `ROBINHOOD_FORK_RPC` unset). Verification:
  `forge fmt --check`, `forge build` (no warnings), `forge test` (398 pass offline), the fork rehearsal
  (PASS against the live read-only RPC), full `npm run check` (97 TS + 398 Foundry, exit 0),
  `git diff --check` clean. **Decision: NO-GO for live deployment** — blocked on the BPS/WETH pool +
  fee tier, user-supplied deployer/role addresses, the beta basket selection, an on-chain slippage/oracle
  guard, and external legal/eligibility review (see §11). The code, registry-safety, deterministic-
  deployment, and external-address integrity are all GREEN.
- **2026-07-22 (acquisition-recording coordinator redesign)** — Rebuilt `DistributionFundingCoordinator`
  to close the per-acquisition acceptance gap **without touching the frozen `StockAcquisitionVault`**.
  The coordinator now occupies **both** frozen vault roles (`acquisitionExecutor` +
  `distributionFundingCoordinator`) — permitted because the frozen constructor only zero-checks the
  executor. As the vault's sole executor it exposes `executeAndRecordAcquisition(...)` (operator-only,
  records each acquisition atomically from the vault's exact before/after cumulative deltas, assigns a
  monotonic id, NONE→RECORDED) and `fundRecordedAcquisition(acquisitionId, root, hashes, window, cycleId)`
  (rootPublisher-only, RECORDED→FUNDED, derives the stock token and 80% amount from the stored record,
  binds one acquisition id to one cycle id, releases-and-funds exactly once). New immutable
  `acquisitionOperator` role; new `IStockAcquisitionVaultOps` interface (counter getters +
  `executeAcquisition`/`releaseToDistributionCoordinator` + 80/20 constants). Added an
  `IStockAcquisitionAdapter` chain guard: `RialtoStockAcquisitionAdapter` reverts
  `WrongChain(block.chainid)` unless `block.chainid == ROBINHOOD_CHAIN_ID` (4663). Corrected the Rialto
  registry model to the **verified** fail-closed semantics (`ownerOf(2)` reverts on paused/uninitialized)
  in `IRialtoRouterRegistry` NatSpec and `MockRialtoRouterRegistry` (`pause`/`forceReturnZero`). Made the
  quote client server-only at the module-boundary level: added `packages/rialto/src/server.ts` and the
  `@bps/rialto/server` subpath export; removed it from the main barrel; added a structural test. Added
  adapter test gaps (wrong-chain, malformed/truncated executionData, false-return-ignored,
  fee-on-transfer stock through the full adapter→vault path). Rewrote `CoordinatorFunding.t.sol` (19) and
  `RialtoEndToEnd.t.sol` (5) for the new flow; deleted the now-dead `MockDistributionSource.sol`. Files:
  `src/DistributionFundingCoordinator.sol`, `src/interfaces/IStockAcquisitionVaultOps.sol`,
  `src/interfaces/IRialtoRouterRegistry.sol`, `src/adapters/RialtoStockAcquisitionAdapter.sol`,
  `test/{CoordinatorFunding,RialtoEndToEnd,RialtoAdapterBase,RialtoAdapterSecurity,RialtoAdapterHostile}.t.sol`,
  `test/mocks/{MockRialtoRouterRegistry,HostileRialtoRouter}.sol`,
  `packages/rialto/src/{index.ts,server.ts,index.test.ts,quote-client.test.ts}`,
  `packages/rialto/package.json`, `README.md`, `HANDOVER.md`. Uses existing OZ 5.6.1; **no new
  dependency**. Verification: `forge fmt --check`, `forge build` (no warnings), `forge test` (382 pass =
  318 preserved + 64 milestone), `npm run test --workspace @bps/rialto` (30 pass), full `npm run check`
  (97 TS + 382 Foundry), `git diff --check` clean — all PASS; frozen contracts/tests and the PoD engine
  unchanged; no secret/credential/live-address in code. Status: complete and verified; **not deployable**
  (§11 blockers); no Rialto API called; no credential read/used/exposed.
- **2026-07-22 (TASK 6B-2 + coordinator + local end-to-end)** — Implemented the concrete
  `RialtoStockAcquisitionAdapter` (allowance-settlement, registry-locked feature-2 target, unmodified
  quote calldata, exact-input + observed-delta-minimum + no-residual invariants), the
  `DistributionFundingCoordinator` (governed root publisher funds a claim cycle with exactly the vault's
  released 80%, bounded by `distributionReleased`, coordinator is the manager's owner via predicted
  address), three minimal interfaces (`IStockAcquisitionVaultView`, `IRialtoRouterRegistry`,
  `IDistributionClaimManagerFunding`), and a server-only Rialto quote client (`@bps/rialto`
  `quote-client.ts`, forces `settlement=allowance`/`chain_id=4663`/no-fee/no-Permit2/no-gasless, full
  response validation, key server-only and never exposed, no live request). New Foundry tests:
  `RialtoAdapterBase/Swap/Security/Hostile.t.sol`, `CoordinatorFunding.t.sol`, `RialtoEndToEnd.t.sol`
  (buy → acquisition → 80/20 → reserve → funding → proof claim, hostile rollback). New mocks:
  `MockRialtoRouterRegistry`, `MockRialtoRouter`, `HostileRialtoRouter`, `MockDistributionSource`. New
  TS tests: `quote-client.test.ts` (27). Files: `src/adapters/RialtoStockAcquisitionAdapter.sol`,
  `src/DistributionFundingCoordinator.sol`, `src/interfaces/{IStockAcquisitionVaultView,
IRialtoRouterRegistry,IDistributionClaimManagerFunding}.sol`, six `test/*.t.sol`, four `test/mocks/*`,
  `packages/rialto/src/{quote-client.ts,quote-client.test.ts,index.ts,index.test.ts}`, `README.md`,
  `HANDOVER.md`. Uses existing OZ 5.6.1; **no new dependency**. Verification: `forge fmt --check`,
  `forge build` (no warnings), `forge test` (372 pass = 318 preserved + 54 new), `forge inspect`
  (1 state-mutating fn each, no forbidden surface), full `npm run check` (94 TS + 372 Foundry),
  `git diff --check` clean — all PASS; frozen contracts/tests and the PoD engine unchanged; no new
  dependency/generated file; no secret/credential/live-address in code. Status: complete and verified;
  nothing committed until authorized; **not deployable** (§11 blockers); no Rialto API called; no
  credential read/used/exposed.
- **2026-07-22 (TASK 6B-1B)** — Implemented `UniswapV3BPSSwapAdapter` (production `IBPSSwapAdapter`
  routing each frozen BPS↔WETH leg through one Uniswap v3 pool via a single
  `SwapRouter02.exactInputSingle`) and the minimal hand-written `ISwapRouter02` ABI. New source:
  `src/adapters/UniswapV3BPSSwapAdapter.sol`, `src/interfaces/ISwapRouter02.sol`. New tests:
  `test/SwapAdapterBase.t.sol`, `test/SwapAdapterConstructor.t.sol`, `test/SwapAdapterSwap.t.sol`,
  `test/SwapAdapterSecurity.t.sol`, `test/SwapAdapterHostile.t.sol`, `test/SwapAdapterDonation.t.sol`,
  `test/SwapAdapterFuzz.t.sol`, `test/RouterUniswapIntegration.t.sol`. New test-only mocks:
  `test/mocks/MockSwapRouter02.sol` (honest, records params), `test/mocks/HostileSwapRouter02.sol`
  (12 modes). Corrections from the readiness review applied: corrected SwapRouter02 recipient sentinels
  (`address(1)`=msg.sender, `address(2)`=router-self; both rejected, plus `address(0)`); reject
  `amountIn == 0`; constructor-frozen nonzero `uint24 poolFee` **not** restricted to {500,3000,10000};
  double output verification (observed recipient delta == venue return **and** >= minimum). Uses
  existing OZ 5.6.1 (`ReentrancyGuard`, `SafeERC20`); **no new dependency** (a minimal local interface,
  no broad Uniswap package). Updated `README.md` and this handover (recording the official SwapRouter02
  address `0xcaf681…5cb2` as reference only, never hardcoded; the WETH/BPS/pool/fee/liquidity and the
  circular router↔adapter deployment sequence remain unresolved deployment gates). Verification:
  `forge fmt --check`, `forge build` (no warnings), `forge test` (318 pass = 262 preserved + 56 new),
  `forge inspect` (1 state-mutating fn, 5 getters, no forbidden surface), full `npm run check`
  (68 TS + 318 Foundry), `git diff --check` clean — all PASS; frozen contracts and their tests
  unchanged; no new dependency/generated file; no secret in the diff. Status: 6B-1B complete and
  verified; nothing committed; not deployable (deployment gates in §11); no real trade/swap; TASK 6B-2
  and the coordinator not begun.
- **2026-07-22 (TASK 6B-1A — security correction)** — Closed a net-residual-custody gap in
  `StockAcquisitionVault.executeAcquisition`: an adapter could pull the exact WETH but retain it, or
  deliver ≥ min stock while skimming extra into itself, and still pass the vault's own-balance checks.
  Added donation-tolerant post-call checks that the adapter's WETH and selected-stock balances equal
  their pre-call baselines (`ResidualWethInAdapter` / `ResidualStockInAdapter`), and both-side (sender
  - recipient) delta checks on reserve delivery and distribution release. Reworked the acquisition
    mocks into true pass-through adapters (route WETH to a sink, stock from a source, hold no residual)
    and added `RETAIN_WETH` / `SKIM_STOCK` hostile modes; new `test/StockVaultResidual.t.sol` (4 tests)
    with full atomic-rollback assertions. Files changed: `src/StockAcquisitionVault.sol`,
    `test/mocks/MockStockAcquisitionAdapter.sol`, `test/mocks/HostileStockAcquisitionAdapter.sol`,
    `test/StockVaultBase.t.sol`, `test/StockVaultHostile.t.sol`, `test/StockVaultResidual.t.sol` (new),
    `README.md`, `HANDOVER.md`. Also corrected the stale "0 API keys created" note (an external
    protected Rialto credential exists but is not stored or used by this repository). Verification:
    `forge fmt --check`, `forge build` (no warnings), `forge test` (262 pass = 202 preserved + 60 vault),
    `forge inspect` (2 state-mutating fns, 17 errors, 7 slots, no forbidden surface), `npm run check`
    (68 TS + 262 Foundry) — all PASS; `git diff --check` clean; frozen files unchanged. Status: fix
    complete and verified; nothing committed; still not deployable.
- **2026-07-22 (TASK 6B-1A)** — Implemented `StockAcquisitionVault` (production-shaped, multi-asset
  WETH→stock custody with the frozen 80/20 split: 80% distribution retained, remainder to the reserve)
  and the `IStockAcquisitionAdapter` boundary. New source: `src/StockAcquisitionVault.sol`,
  `src/interfaces/IStockAcquisitionAdapter.sol`. New tests: `test/StockVaultBase.t.sol`,
  `test/StockVaultConstructor.t.sol`, `test/StockVaultAcquisition.t.sol`, `test/StockVaultHostile.t.sol`,
  `test/StockVaultRelease.t.sol`, `test/StockVaultAccounting.t.sol`, `test/StockVaultFuzz.t.sol`. New
  test-only mocks: `test/mocks/MockStockAcquisitionAdapter.sol` (honest),
  `test/mocks/HostileStockAcquisitionAdapter.sol` (11 misbehavior modes). Reuses existing
  `MockWETH`/`MockERC20`/`MockFeeOnTransferERC20`. Uses existing OZ `@openzeppelin/contracts` 5.6.1
  (`ReentrancyGuard`, `SafeERC20`, `Math`); no new dependency; no deps installed. Updated `README.md`
  and this handover (incl. corrected optional-30-bps semantics and the verified chain ID 4663 / Router
  Registry `0x71a120…687E` recorded in §§6/8 — NOT hardcoded in any contract). Verification:
  `forge fmt --check`, `forge build` (no warnings), `forge test` (258 pass = 202 preserved + 56 new),
  `forge inspect` (22 functions / 2 state-mutating / 3 events / 15 errors / 7 storage slots, no
  forbidden surface), full `npm run check` (68 TS + 258 Foundry) — all PASS; new-file secret/registry/
  dangerous-surface scan clean. `BPSToken.sol`, `DistributionClaimManager.sol`, `BPSLockingVault.sol`,
  `BPSTradeRouter.sol`, `IBPSSwapAdapter.sol`, `IBPSBurnable.sol`, and all TASK 3 artifacts unchanged
  (no git diff). Status: TASK 6B-1A complete and verified; nothing committed; not deployable (coordinator
  - ownership sequence pending); no real acquisition/trade/swap/burn; no Rialto API credential created,
    stored, exposed, or used by this repository.

- **2026-07-22 (TASK 6A)** — Implemented `BPSTradeRouter` (the official BPS trade router under
  `BPS-ECON-2.0`: 3% buy / 4% sell allocation, 2% WETH stock-acquisition budget, and a **true** BPS
  repurchase-and-burn that reduces `totalSupply`). New source: `src/BPSTradeRouter.sol`,
  `src/interfaces/IBPSSwapAdapter.sol`, `src/interfaces/IBPSBurnable.sol`. New tests:
  `test/RouterBase.t.sol`, `test/RouterConstructor.t.sol`, `test/RouterBuy.t.sol`,
  `test/RouterSell.t.sol`, `test/RouterSecurity.t.sol`, `test/RouterFuzz.t.sol`,
  `test/BurnProof.t.sol`. New test-only mocks: `test/mocks/MockWETH.sol`,
  `test/mocks/MockSwapAdapter.sol`, `test/mocks/HostileSwapAdapter.sol`. Inspection determined
  `BPSToken` already has a correct permissionless self-burn (OZ `ERC20Burnable` `burn(uint256)`), so
  **`BPSToken` was not modified**; `BurnProof.t.sol` proves the burn properties additively. Uses
  existing OZ `@openzeppelin/contracts` 5.6.1 (`Ownable2Step`, `Pausable`, `ReentrancyGuard`,
  `SafeERC20`, `Math`); no new dependency. `.gitignore` updated to ignore
  `.claude/settings.local.json` only (the rest of `.claude/` stays shared). Updated `README.md` and
  this handover. Verification: `forge fmt --check`, `forge build` (no warnings), `forge test`
  (202 pass = 132 preserved + 70 new), `forge inspect` (28 functions / router events / 16 custom
  errors / 11 storage slots, no forbidden surface), the three contract npm scripts + all TS stages of
  `npm run check` — all PASS; new-file secret/economics/dangerous-surface scan clean.
  `BPSToken.sol`, `BPSToken.t.sol`, `DistributionClaimManager.sol`, `BPSLockingVault.sol`, and all
  TASK 3 logic/fixtures/artifacts unchanged (no git diff). Status: TASK 6A complete and verified;
  nothing committed (baseline HEAD remains checkpoint `c443b925…`); no deployment; no real
  trade/swap/burn; TASK 6B not begun.
- **2026-07-22 (TASK 5)** — Implemented `BPSLockingVault` (fixed-term BPS locking under the frozen
  `vebps-1` policy). New files: `packages/contracts/src/BPSLockingVault.sol`; tests
  `test/LockingVaultBase.t.sol`, `test/LockingVaultPolicy.t.sol`, `test/LockingVaultLifecycle.t.sol`,
  `test/LockingVaultWeight.t.sol`, `test/LockingVaultEmergency.t.sol`,
  `test/LockingVaultAccounting.t.sol`, `test/LockingVaultHostile.t.sol`, `test/LockingVaultFuzz.t.sol`;
  test-only mocks `test/mocks/FailingERC20Mock.sol`, `test/mocks/ReentrantBPSMock.sol`. Uses existing
  OZ `@openzeppelin/contracts` 5.6.1 (`Ownable2Step`, `ReentrancyGuard`, `SafeERC20`, `Math`,
  `SafeCast`); no new dependency. Updated `README.md` and this handover. Verification:
  `forge fmt --check`, `forge build` (no warnings), `forge test` (132 pass = 82 preserved + 50 new),
  `forge inspect` (20 functions / 5 events / 15 errors / 8 storage vars, no forbidden surface), full
  `npm run check` (68 TS + 132 Foundry) — all PASS; new-file secret/economics scan clean.
  `BPSToken.sol`, `BPSToken.t.sol`, `DistributionClaimManager.sol`, and all TASK 3 logic/fixtures/
  artifacts unchanged (byte-identical). Status: TASK 5 complete and verified; nothing committed; no
  deployment; no real lock/withdrawal/claim.
- **2026-07-22 (TASK 4)** — Implemented `DistributionClaimManager` (funded, immutable per-cycle
  Merkle claims against the frozen TASK 3 leaf). New files:
  `packages/contracts/src/DistributionClaimManager.sol`; tests
  `test/LeafVector.t.sol`, `test/Publication.t.sol`, `test/Claims.t.sol`,
  `test/RecoveryAccounting.t.sol`, `test/Fuzz.t.sol`, `test/ClaimManagerBase.t.sol`; test-only
  mocks `test/mocks/MockERC20.sol`, `test/mocks/MockFeeOnTransferERC20.sol`,
  `test/mocks/ReentrancyProbeERC20.sol`. Uses existing OZ `@openzeppelin/contracts` 5.6.1
  (`Ownable2Step`, `ReentrancyGuard`, `SafeERC20`, `MerkleProof`); no new dependency. Updated
  `README.md` and this handover. Verification: `forge fmt --check`, `forge build` (no warnings),
  `forge test` (82 pass), `forge inspect` (16 functions / 6 events / 26 errors / 6 slots, no
  privileged surface), and full `npm run check` — all PASS; new-file secret/economics search
  clean. `BPSToken.sol`, `BPSToken.t.sol`, TASK 3 logic/fixtures/artifacts unchanged. Status:
  TASK 4 complete and verified; nothing committed; no deployment; no on-chain claim.
- **2026-07-22 (TASK 3 — artifact/Merkle audit)** — Ran the CLI twice into fresh directories and
  independently re-derived every leaf/proof from the emitted bytes with viem. Confirmed the exact
  generated Merkle root, both content hashes, artifact sizes/SHA-256, the representative
  leaf/proof, all 21 proofs, entitlement uniqueness/counts, and per-asset reconciliation (values
  recorded in §10). No defect found; no source/fixture/test change. HANDOVER updated docs-only:
  §6 now records the OZ double-hash leaf formula and the exact Solidity-equivalent leaf expression
  for TASK 4, and §10 records the audited canonical values. `npm run check` — PASS.
- **2026-07-22 (TASK 3)** — Implemented the deterministic mock-asset Proof-of-Distribution engine.
  Added pinned npm deps to `@bps/shared`: `@openzeppelin/merkle-tree` 1.0.8, `viem` 2.55.5, `zod`
  4.4.3. New domain modules under `packages/shared/src/proof-of-distribution/` (constants, numeric,
  address, schemas, validate, model, epoch, twab, eligibility, allocation, merkle, viem-verify,
  independent-verify, serialize, reconciliation, artifacts, pipeline, index, testkit) plus 8 test
  files; public API re-exported through `packages/shared/src/index.ts`. New `@bps/pilot` fixture
  runner: `fixtures/canonical-cycle.json`, `src/fixture.ts`, `src/cli.ts`, `src/index.ts`,
  `src/pipeline.test.ts`. Root `package.json` scripts updated to prebuild `@bps/shared` and add
  `proof:mock`; `@bps/shared` `exports` gained a `types` condition. Updated `README.md` and this
  handover. Verification: full `npm run check` PASS (68 TS tests, 24 Foundry tests); CLI run twice
  → byte-for-byte identical artifacts; superseded-terms search clean. `BPSToken.sol`/tests
  unchanged. Status: TASK 3 complete and verified; nothing committed; no deployment; no on-chain
  claim.
- **2026-07-21 (TASK 2 — ABI verification / doc correction)** — Ran
  `forge inspect src/BPSToken.sol:BPSToken methods` and `... abi` to establish the exact
  control surface. Ground truth: ABI has constructor 1, function 12, event 2, error 6, i.e.
  **exactly 12 externally callable functions** (the constructor is a separate ABI entry, not one
  of the 12). Corrected the earlier "13 methods" statements in §§3, 7, 10, 12 to 12; no source
  code was changed (no defect found). Re-ran `npm run check` — PASS. Files changed: `HANDOVER.md`
  only.
- **2026-07-21 (TASK 2)** — Implemented the canonical fixed-supply `BPSToken` ERC-20. Added
  `@openzeppelin/contracts` 5.6.1 as a pinned npm dependency of `@bps/contracts`; wired Foundry
  remapping + `allow_paths` in `foundry.toml`. Created `src/BPSToken.sol` (OZ `ERC20` +
  `ERC20Burnable`, fixed 1e9 * 1e18 supply minted once to a constructor recipient, no privileged
  controls) and `test/BPSToken.t.sol` (23 dependency-free tests covering metadata, supply,
  distribution, zero-recipient revert, transfers, approve/transferFrom, allowance, burn/burnFrom,
  and fixed-supply invariants). Updated `README.md` (status/layout) and this handover. Verification:
  `forge build` (no warnings), `forge test` (24 pass), `forge fmt --check`, `forge inspect`
  (12 externally callable functions, none privileged), and full `npm run check` — all PASS.
  Files changed:
  `packages/contracts/package.json`, `packages/contracts/foundry.toml`,
  `packages/contracts/src/BPSToken.sol` (new), `packages/contracts/test/BPSToken.t.sol` (new),
  `package.json`/`package-lock.json` (OZ dependency), `README.md`, `HANDOVER.md`. Status: TASK 2
  complete and verified; nothing committed; no deployment.
- **2026-07-21 (later)** — TASK 1 verification completed. Installed Foundry located
  (Forge 1.7.1). Ran `npm run fmt:contracts`, `npm run build:contracts`, `npm run test:contracts`,
  and full `npm run check` — all PASS. No source files changed; updated `HANDOVER.md` §§3, 4, 6,
  7, 9, 10, 11, 12, 13 to record the completed Foundry verification. Status: TASK 1 fully verified;
  nothing committed; protocol functionality still not implemented.
- **2026-07-21** — TASK 1: created monorepo foundation. Git init; root configs
  (`package.json`, `.npmrc`, `.gitignore`, `.env.example`, `tsconfig.base.json`,
  `eslint.config.mjs`, `prettier.config.mjs`, `.prettierignore`, `README.md`); workspaces
  `@bps/web` (Next.js placeholder page), `@bps/indexer`, `@bps/worker` (health stubs + tests),
  `@bps/shared`, `@bps/db`, `@bps/rialto`, `@bps/pilot` (typed placeholders + tests),
  `@bps/contracts` (Foundry project with BuildProbe). Verification: all TS-side checks PASS;
  Foundry checks blocked (forge not installed at the time). Status: foundation complete except
  Solidity verification; nothing committed.
