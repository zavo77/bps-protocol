# HANDOVER — BPS Protocol Master Handover (bps-experiment)

> **DOCUMENT PURPOSE.** This is the single authoritative continuity document for the BPS Protocol
> engineering repository. It exists so that a completely fresh Claude Code session — with zero prior
> conversation history — can open this repository, verify the facts, understand every project lane, and
> safely continue from the correct next task. **Read this entire document before acting.**
>
> **HANDOVER.md IS NOT A BACKUP OF THE REPOSITORY OR SECRETS.** See section Q (Disaster recovery).

## ACTIVE PARALLEL LANE — BPS RWA LAUNCH LAB (2026-07-27)

> A founder-authorized, SEPARATE product lane is being built on branch
> `feature/bps-launch-lab-8h-vercel` (spec: `docs/launch-lab/BPS_LAUNCH_LAB_8H_VERCEL_MASTER_PROMPT.md`;
> running log: `docs/launch-lab/BPS_LAUNCH_LAB_8H_PROGRESS.md`; continuity entry: top of
> `docs/continuity/CHANGELOG.md`; machine state: `launchLab` key in `docs/continuity/CURRENT_STATE.json`).
> It does NOT modify the Capital Engine, frozen contracts, canary artifacts, or the Stage-A lane below.
> Everything in the SNAPSHOT below continues to describe the Capital Engine lane on `master`.
>
> **Lane state (2026-07-28, commit `60c344e`, deployed):** the first LIVE market exists — **mag8/MAG8
> paired with GOOGL** at `0x7382C73b2830e6521a5167aa7347CAF0f39Ad0d5` (launched by the ADVISOR during
> the authorized 2026-07-28 session; it is the production canary and does NOT satisfy the PRINT
> acceptance). P0.1 market accuracy is shipped and live-verified: awaited BPS-leg trade ingestion,
> hash-gated immutable launch facts (`lab_launches.launch_manifest`; MAG8 backfilled proven-only),
> separate "Pool reserve"/"Curve inventory value" stats, anchor-denominated "GOOGL per MAG8" chart (no
> retroactive USD history), trader identity (`event_sender`/`transaction_from` + UI Wallet column),
> server-side token-metadata resolver, pool-bound DexScreener adapter. Earlier: frozen V1 Rialto-primary
> routing (`01c8cfd`), live-verified Rialto activation (`48a7c8d`), public shell + simplified wizard,
> wallet-chain gate fix (`47032dd`), live market recovery (`7a7ea73`).
>
> **POSTURE (2026-07-29, CURRENT): ★ NORMAL PUBLIC OPERATION.** The Launch Lab is the real public
> product: ACCESS_MODE=public, BROADCAST_ENABLED=true, KILL_SWITCH=false, SELL_PAUSED=false
> (health 13d685eb5720). No allowlists, no acceptance windows, no ticker/anchor forcing — identical
> behavior for every wallet. Emergency env controls stay available but INACTIVE; re-engage only for
> a genuine fund-safety or transaction-integrity defect. NEVER remove BPS_LAUNCH_LAB_ACCESS_MODE
> from the Vercel env store (it was once missing while old deployments carried a baked-in value —
> a redeploy would have gone allowlist/disabled). PRINT acceptance dissolved. Verified 2026-07-29:
> wizard live for disconnected visitors; random-wallet manifest + exact create simulation ok;
> only provenance-verified markets listed; public buys + one-transaction allowance sells live.
> A live founder AAPL manifest is active (genuine launch in progress).
>
> **POSTURE (2026-07-28, superseded):** Production **FAIL-CLOSED** — public / broadcast FALSE / kill
> switch TRUE, health-verified at commit `d5051611cf18`. Market CREATION is closed. **SELLS ARE PAUSED again — the one authorised MAG8 sell canary EXECUTED and PASSED (2026-07-28T18:11Z, tx 0x9017bd7a…e0f114: one wallet prompt, Rialto one-step, exact delivery, ≤3.75s public visibility, no dupes incl. indexer restart) and the brake was immediately restored**; previously (`BPS_LAUNCH_LAB_SELL_PAUSED=true` incident brake — new market-token sells 503
> SELL_PAUSED; buys + partial-sale recovery legs unaffected). The sell failure is fully
> root-caused AND fixed: (a) the 4-prompt sign→approve→sign→send UX (now SIGNATURE-FREE
> preparation, exact-amount approvals, planned prompts upfront, attemptId logs); (b) a Rialto
> adapter bug — `issues.allowance:null` (allowance already satisfied, the wallet's exact
> post-approval state) was rejected, demoting post-approval sells to 0x with a different spender,
> so the swap prompt never appeared. Ingestion now triggers on ANY market-token leg (any venue);
> NO_MARKET_SWAP keeps a confirmed trade confirmed ("market data is syncing"). Read-only
> verification passed: venue rialto, 1 wallet action, planned prompt exactly "Sell MAG8 for ETH",
> no approvals for the incident wallet, exact simulation ok. Founder lifts the brake by setting
> `BPS_LAUNCH_LAB_SELL_PAUSED=false` in Vercel Production + redeploy. See
> `docs/continuity/CURRENT_STATE.json` → `launchLab.sellFailureIncident`.
> **Deploy from the REPO ROOT** (`npx vercel deploy --prod`) — `apps/web/.vercel` is a stale link.
> Pending after the brake lifts: founder/advisor MAG8 canary buy+sell (Claude cannot trade); Claude
> then verifies ≤5s ingestion, chart direction, labels, reserves, volume, wallet identity, no
> duplicates, reload survival.

## SNAPSHOT (verified)

| Field                       | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Last fully verified (UTC)   | **2026-07-27T05:44:12Z** (Stage-A guard deployment independently verified via read-only RPC: guard live at `0x5753…078d`, tx `0xc3095c2e…`, nonce 1, block 20167604; live runtime == immutable-resolved hash `0xfcb2694b…857f4`; deployer nonce now 2, executor address empty). Prior: 2026-07-26T11:23:46Z Safe 29/29.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Repository path             | `C:\Projects\bps-experiment`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Branch                      | `master` (VERIFIED via `git branch --show-current`; note: tooling may claim a `main` default — no `main` branch is in use)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| HEAD                        | `5f71acc2ddc178a4aca95a8eae42bf08033389e3` — `ops(canary): finalize private execution bundle` (TASK 10K-10). The Stage-A guard-verification + launcher-repair task made NO commit; it changed only continuity/docs (uncommitted). Run `git rev-parse HEAD` to confirm.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Working tree                | **Dirty (uncommitted): continuity/docs only** — `HANDOVER.md`, `docs/continuity/CURRENT_STATE.json`, `docs/continuity/CHANGELOG.md` (Stage-A guard verification + launcher repair). **NO source/contract/bundle change.** The repaired Rabby launcher and the scratch paris rebuild live OUTSIDE the repo (OS temp) and are not tracked. Untracked `docs/launch-lab/` is pre-existing (do not touch). forge-std v1.9.7 lives in the gitignored `packages/contracts/lib/`; run `packages/contracts/tool/bootstrap-forge-std.{sh,ps1}` on a fresh clone before `forge test`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Tags                        | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Local backup                | Archive `bps-experiment-checkpoint-2026-07-25-6ace4803.tar.gz` (149,713,634 B, SHA-256 `a971760fa0748b6eeebb8f8ee3a196735e4163890fa3d673c8c8ddf8136f374d`); **off-device encrypted transfer COMPLETE — USER VERIFIED 2026-07-25** (user confirmation; not independently inspected by Claude)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Current phase               | **Stage A in progress (PCE-1): guard DEPLOYED + verified; executor NOT yet deployed.** Post-canary otherwise. The 19-step BPSC-TEST mainnet canary is COMPLETE and reconciled (VERIFIED). Canonical production BPS is **NOT deployed**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Last completed milestone    | **STAGE A step 1 (2026-07-26/27) — guard DEPLOYED + independently verified; executor runtime hash derived offline; launcher repaired.** Guard `ChainlinkSettlementPriceGuard` live at `0x5753…078d` (tx `0xc3095c2e…`, nonce 1, block 20167604). **CRITICAL:** the bundle `runtimeBytecodeHash` fields (guard `0x4c5859…92e8`, executor `0x16c8af…0908`) are **PRE-IMMUTABLE templates**; the immutable-RESOLVED runtime hashes are **guard `0xfcb2694b…857f4` (== live)** and **executor `0xf864233b…273a8d`** (derived by two agreeing methods: AST-splice + read-only eth_call creation-simulation). Guard proven live==frozen: masked byte-compare confines every live/template diff to solc immutable ranges; all 14 immutables + public getters match frozen args + live-read feed/token values; reconstruct==live. Ephemeral launcher repaired to executor-only + immutable-resolved validation (sha256 `d2c5d5…be731`). NO Safe/unpause/fund/approve/quote/settle; executor NOT broadcast. — Prior: **TASK 10K-10 — private canary execution-bundle finalization (PCE-1; offline/read-only).** Resolved KL-1: pinned `evm_version = "paris"` in a narrow `[profile.canary]` (default profile unchanged; basis: Arbitrum-Nitro L2, paris predates PUSH0/MCOPY/transient, frozen contracts need none). **Two clean builds byte-identical** (reproducible): executor creation `0xbf0d3b…0fa0` (10564 B) / runtime `0x16c8af…0908` (9256 B); guard creation `0x9385b6…0b34` (6985 B) / runtime `0x4c5859…92e8` (4485 B); solc 0.8.26+commit.8a97fa7a. Deployer `0x7116…2ba2` nonce **1**, balance 0.000483 ETH; predicted **guard `0x5753…078d` (n1)** + **executor `0x17e0…f84C` (n2)**, empty (valid only while nonce==1). Generated offline unsigned bundle (`deploy/canary-bundle/{unsigned-deployment,unsigned-safe-transactions,verification-manifest}.json`). 18-step lifecycle rehearsal mapped to existing tests; **513 Foundry / 252 rialto** pass; Safe re-checked unchanged/inactive. **Max all-inclusive exposure ≈ $2.93 vs $130 (≈44× headroom) — $130 safely covers the lifecycle.** No sign/broadcast/deploy/fund/Safe-tx. **B-1 OPEN, B-2/D-23 COUNSEL-PENDING, D-24 in force for production; PCE-1 single-use, not yet consumed.** Status `PRIVATE_CANARY_EXECUTION_BUNDLE_READY`. Prior: PCE-1 (`02f1a21`), 10K-9 (`d660421`) |
| Current active task         | **Stage A step 2 pending — executor NOT yet deployed.** Guard is live+verified. The ephemeral Rabby launcher (`%TEMP%/bps-stage-a-launcher/server.mjs`, sha256 `d2c5d5…be731`; NOT in repo) has been repaired to executor-only and validates the deployed runtime against the **immutable-resolved** executor hash `0xf864233b…273a8d` (see §Stage-A note). The human broadcasts the single executor CREATE at nonce 2 through Rabby; Claude does NOT broadcast. Safe remains a verified CANDIDATE controller (not active). **B-1 audit OPEN, B-2/D-23 counsel INCOMPLETE, D-24 in force for production**; PCE-1 authorizes only guard+executor deploy+verify — NO Safe config/unpause/fund/approve/quote/settle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Exact next recommended task | **(A) Stage A step 2 — executor deploy (human broadcast):** guard already deployed at nonce 1; the human broadcasts the executor CREATE at **nonce 2** via the repaired launcher. Then Claude runs read-only executor verification (receipt status/from/addr/nonce 2/value 0/to null; **deployed runtime hash == `0xf864233b…273a8d`**; `owner()`==Safe `0x62Ae…5E62`; `paused()`==true; `weth`/`stockToken`/`registry` immutables) and updates continuity. Executor deploys **PAUSED / fail-closed**. **(B) Later PCE-1 stages** (Safe config, unpause, WETH fund, approve, quote, settle) each need a **separate** bounded founder go-signal + fresh live Rialto quote + open NVDA session — NOT authorized now. **(C) Production (still fully gated):** B-1 audit, D-23/B-2 counsel, returned ballot, a new D-24-replacing authorization.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Mainnet status              | BPSC-TEST canary live on Robinhood Chain (chainId 4663): 8 contracts, pool, LP NFT 371728, lock (unlock 2026-07-31T23:02:26Z). Final nonces deployer 16/16, tester 8/8 (VERIFIED live 2026-07-25). Tester nonce-8 delayed withdrawal **NOT executed, NOT authorized**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Production status           | **NOT deployed. NO-GO stands** (TASK 7/9 verdicts; external blockers in §N unresolved). BPSC canary must NEVER be presented or reused as canonical BPS production.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Highest-priority blockers   | B-1 external security audit; B-2 legal/entity/jurisdiction placeholders; B-3 Rialto production terms + KYC path; B-4 founder authorizations (seed size, Safe setup, go decision); see §N                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Continuity files            | `docs/continuity/CURRENT_STATE.json`, `docs/continuity/CHANGELOG.md`, `docs/continuity/BACKUP_AND_RECOVERY.md` (this task)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

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
- **`packages/rialto`** — server-only Rialto boundary: quote client (`src/quote-client.ts`), structural
  validator (`src/quote-structural.ts`), price guard (`src/price-guard.ts`), boundary status
  (`src/boundary-status.ts`), the GET /quote eval harness (`src/quote-eval-cli.ts`), and a **pure offline**
  registry-structural evaluator (`src/registry-structural.ts`). Key is read from `RIALTO_API_KEY` (never
  logged/returned). QEX-1 (the one-shot GET /quote exception) is **CONSUMED / COMPLETE**: the live CLI is
  **retired** and now fails with `QEX1_CONSUMED` before any env read or network call (no env override
  bypasses it). `registry-structural.ts` reconciles a quote target against a SEPARATE, undated registry
  observation (fail-closed) independently of selector approval; it holds no key and makes no network call.
  A **pure offline guarded-settlement core** (`src/guarded-settlement.ts`, TASK 10K-3) validates a typed
  policy + normalized intent through registry/selector/taker/token/amount/fee/value/price/replay guards and
  returns a sanitized plan only as `READY_OFFLINE_ONLY` (never execution authorization); it is deliberately
  disabled (empty production selector list, unresolved taker/caps/ages/price source) and fails closed. It
  also exposes `validateOpaqueQuoteForIntent` (TASK 10K-5) — a pure offline validator of an
  already-fetched allowance-mode quote (settlement/to/spender/value/selector/tokens/taker/amounts/fee/
  freshness) that never modifies `tx.data` and returns only the calldata hash. The concrete Solidity
  executor `packages/contracts/src/GuardedSettlementExecutor.sol` (UNDEPLOYED, paused/disabled) implements
  the OPAQUE-CALL model: it binds an approved runtime code hash + selector (not a decoded ABI), calls the
  registry-locked router with unmodified calldata, and enforces exact-allowance + own-balance min-delta +
  atomic revert. Production terms + counsel gates remain before any acquisition (D-24 stands).
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

### Guarded settlement (Rialto feature-2 WETH→NVDA) — UNDEPLOYED canary stack (TASK 10K-4/5/6)

Separate lane from the frozen core; **not deployed**, deploys **paused**, execution locked. Files:

- `src/GuardedSettlementExecutor.sol` — opaque-call executor. Binds registry `ownerOf(2)` target + approved
  runtime **code hash** + approved leading selector (no ABI decode); pulls exactly the sell amount; enforces
  its own NVDA balance delta ≥ minimum; resets allowance to zero; digest+nonce replay guard; atomic revert.
  `Ownable2Step` controller (rejects zero/dead/self), `Pausable`, `ReentrancyGuard`. **`unpause()` reverts
  `ConfigIncomplete`** unless price guard + approved code hash + approved selector + WETH cap + WETH/NVDA
  pair are all set.
- `src/ChainlinkSettlementPriceGuard.sol` — dual-feed guard (ETH/USD `0x78F3…d3A9` "ETH / USD" 8dp; NVDA/USD
  `0x379E…9F15` "RHNVDA / USD" 8dp). Reverts unless `minBuyAmount` ≥ Chainlink fair output reduced by ≤100
  bps; fail-closed on wrong chain/pair, zero amount, feed decimals/identity change, non-positive answer,
  zero/future timestamp, incomplete round, stale feed (ceiling 900 s), globally paused stock oracle, and
  (if configured) sequencer down / grace. NVDA feed is the multiplier-adjusted Total Return Value/USD —
  `uiMultiplier` is NOT re-applied. No official sequencer feed published → strict dual-feed freshness.
- Interfaces `src/interfaces/{AggregatorV3Interface,IStockTokenOracleState,ISettlementPriceGuard,IGuardedSettlementExecutor}.sol`.
- Deploy tooling (broadcast-free): `script/settlement/GuardedSettlementConfig.sol` (pinned identities +
  fail-closed `validate` + `deployPaused`) and `script/settlement/DeployGuardedSettlement.s.sol`.
- Reproducible toolchain: `tool/bootstrap-forge-std.{sh,ps1}` (pins forge-std v1.9.7 `77041d2…4d505`).
- Read-only preflight (TS): `packages/rialto/src/canary-preflight.ts` + `canary-preflight-cli.ts`.
- Runbook + template: `deploy/GUARDED_SETTLEMENT_RUNBOOK.md`, `deploy/guarded-settlement.env.example`.
- Evidence: `docs/audit/BPS_RIALTO_CANARY_BUILD_2026-07-26.{md,evidence.json}` (build) +
  `docs/audit/BPS_RIALTO_LIVE_ORACLE_2026-07-26.{md,evidence.json}` (TASK 10K-7 live acceptance).

**TASK 10K-7 live verification (read-only, pinned block 19761208, 2026-07-26):** all configured identities
MATCH live chain — ETH/USD `0x78F3…d3A9` `description()` "ETH / USD" 8dp; NVDA/USD `0x379E…9F15`
`description()` **"RHNVDA / USD"** 8dp (directory display name "Robinhood NVDA / USD" differs from the
on-chain string — the on-chain string is pinned and correct); router `ownerOf(2)`=`0xC94135b6…` code hash
`0xa7041268…27611`; WETH/NVDA symbols+18dp; NVDA `oraclePaused=false`, `uiMultiplier=1e18`. **No official
Chainlink L2 Sequencer Uptime Feed** exists for Robinhood Chain (56 directory feeds, none sequencer) →
strict dual-feed 900s retained. The preflight now supports a **missing-controller mode**
(`CONTROLLER_REQUIRED`, all live checks still run), **stale classification** (`NVDA_FEED_STALE_MARKET_CLOSED`,
`ETH_USD_FEED_STALE`), and **RPC-URL redaction**. Real read-only preflight = **`CANARY_NOT_READY`**
(controller missing + both feeds beyond the strict 900s window: NVDA market-closed Sunday, ETH low-volatility
within its 86400s heartbeat — runtime availability, not a defect). **Safe controller:**
`CANONICAL_SAFE_STACK_AVAILABLE` — Safe v1.4.1 (SafeL2 `0x29fcB4…C762`, ProxyFactory `0x4e1DCf…ec67`,
FallbackHandler `0xfd0732…Ec99`, MultiSend `0x38869b…B526`, MultiSendCallOnly `0x9641d7…02e2`) verified live
on 4663 (code hashes match manifest); sanitized creation packet `deploy/SAFE_CONTROLLER_SETUP.md`.

**TASK 10K-8 — 2-of-3 Safe controller DEPLOYED (candidate; NOT activated):** the founder signed/broadcast one
authorized `createProxyWithNonce` via Owner 1's Rabby wallet (Claude did read-only verification only, no
signing/broadcast). **Safe `0x62Ae5b22Dd28Ee338E5A447ed849f9C7008A5E62`** (Safe v1.4.1 SafeL2, 2-of-3) —
owners `0x7116F2998e625651D310E97919a1c638a7F82ba2`, `0x006024ff3b9b707ad0779eD3586546440fAAC49f`,
`0xd5Bb1534Efc88400f34A832D85D0939c0e2F1759`; threshold 2; nonce 0; master copy = SafeL2 singleton; fallback
`0xfd0732…Ec99`; **no modules, no guard**; native/WETH/NVDA balances all zero; runtime 171 B hash
`0xd7d408…fb4c`; salt nonce `0x87893661…8cf9`. Deploy tx `0x09a4b2c179da9b1ab2abfc0c2b8067a07fe5850f026d8f8aa89af4d5451ccbb0`,
block 19831992 (2026-07-26T11:23:46Z), status 1, gas 306172 (0.00001661289272 ETH). **29/29 verification
checks pass** (evidence `docs/audit/BPS_SAFE_CONTROLLER_DEPLOYMENT_2026-07-26.*`). It is the **verified
candidate controller** only — **not activated**, because no `GuardedSettlementExecutor` is deployed (the Safe
owns/controls nothing yet). The one-time Safe-creation authorization is **consumed**; **D-24 stands** for the
executor, settlement, and canary.

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

| Suite                                    | Command                                                                           | Last result                                                                                                                                                                                         | Date        | Safety                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------ |
| Aggregate gate                           | `npm run check`                                                                   | **PASS** (prettier, eslint, tsc, all workspace vitest, next build, forge fmt/build/test)                                                                                                            | 2026-07-25  | READ-ONLY SAFE                                         |
| Contract compile + build                 | `forge build` (via `npm run build:contracts`)                                     | PASS (8 bytecodes, solc 0.8.26)                                                                                                                                                                     | 2026-07-25  | READ-ONLY SAFE                                         |
| Foundry unit/invariant/fuzz/hostile      | `forge test --offline`                                                            | **513 passed / 0 failed**, 51 suites (incl. guarded-settlement: price guard 26, executor 60, deploy/rehearsal 9)                                                                                    | 2026-07-26  | READ-ONLY SAFE (local EVM, no fork/RPC)                |
| Fork deploy rehearsal                    | `ROBINHOOD_FORK_RPC=<ro rpc> forge test --match-contract ForkDeployRehearsal`     | PASS (in the 416)                                                                                                                                                                                   | 2026-07-25  | FORK ONLY                                              |
| `@bps/web` Vitest                        | `npx vitest run` (in `apps/web`)                                                  | **177 passed** (25 files)                                                                                                                                                                           | 2026-07-25  | READ-ONLY SAFE                                         |
| `@bps/shared` Vitest                     | `npm run test --workspace @bps/shared`                                            | 52 passed (8 files)                                                                                                                                                                                 | 2026-07-25  | READ-ONLY SAFE                                         |
| `@bps/pilot` Vitest                      | `npm run test --workspace @bps/pilot`                                             | 30 passed (2 files)                                                                                                                                                                                 | 2026-07-25  | READ-ONLY SAFE                                         |
| `@bps/rialto` Vitest                     | `npx vitest run packages/rialto`                                                  | **252 passed** (10 files; incl. guarded-settlement, opaque-quote boundary, digest parity, canary-preflight core+CLI with missing-controller/stale-classification/RPC-redaction + network tripwires) | 2026-07-26  | READ-ONLY SAFE                                         |
| `@bps/indexer`, `@bps/worker`, `@bps/db` | `npm run test --workspace …`                                                      | 1 each (health-check)                                                                                                                                                                               | 2026-07-25  | READ-ONLY SAFE                                         |
| Playwright E2E (Chromium)                | `npm run test:e2e --workspace @bps/web` (`npx playwright install chromium` first) | PASS (historical, TASK 8D) — **rerun before relying on it**                                                                                                                                         | ~2026-07-24 | LOCAL MUTATION (spawns local server)                   |
| Canary bundle VERIFY-ALL                 | `node verify-all.mjs` (in `packages/contracts/canary-packet/exec/`)               | **PASS** — 9 suites (compile 7/7, offline 61/61, manifest 5/5, static-scan 7/7, replay 19/19, operator 46/46, v5 browser smoke 7/7, v9 recovery 40/40, v9 browser smoke 10/10 port 8741)            | 2026-07-25  | READ-ONLY SAFE / LOCAL (localhost server + local fork) |
| Canary live preflight                    | `node recovery-preflight.mjs` (needs `ROBINHOOD_CHAIN_RPC_URL`)                   | PASS historically (gates + anchors) — **read-only chain reads only**                                                                                                                                | 2026-07-25  | READ-ONLY SAFE (no writes)                             |
| Post-canary reconciliation               | `node packages/contracts/canary-packet/post-canary-reconcile.mjs` (needs RPC env) | **PASS** (all 19 verified, evidence written)                                                                                                                                                        | 2026-07-25  | READ-ONLY SAFE                                         |

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

| ID    | Date        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Status                                                                                                                                                                                       | Affects                  | Supersedes                           |
| ----- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------ |
| D-001 | 2026-07-18  | Economic policy **BPS-ECON-2.0**: buy 3% (2%+1%), sell 4% (2%+2%), 80/20 acquired-token split, fixed 1e9 supply, no mint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | DECIDED / IMPLEMENTED                                                                                                                                                                        | router, vault, token     | BPS-ECON-1.0 (SUPERSEDED)            |
| D-002 | 2026-07-18  | v1 uses a standard fixed-supply ERC-20 + dedicated router over Uniswap v3; **no** fee-on-transfer token                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | DECIDED / IMPLEMENTED                                                                                                                                                                        | token, router            | —                                    |
| D-003 | 2026-07-18  | Launch pool = WETH/BPS, fee tier 10000 (1.00%), tick spacing 200; use SwapRouter02 in v1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | DECIDED / IMPLEMENTED                                                                                                                                                                        | swap adapter, pool       | —                                    |
| D-004 | 2026-07-18  | **Frontier 10** acquisition mandate (`BPS-FRONTIER-10-1.0`), 66/16/18 sleeves, SPCX ≤ 10%, basket **PROPOSED pending approval + registry re-verification**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | PROPOSED                                                                                                                                                                                     | acquisition adapter      | —                                    |
| D-005 | 2026-07-18  | Contract layer frozen; no ABI/interface/behavior change without a separate approved milestone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | DECIDED                                                                                                                                                                                      | all contracts            | —                                    |
| D-006 | 2026-07-18  | 15 founder/counsel decisions remain UNRESOLVED and fail-closed (`TASK_10_FOUNDER_DECISION_PACK.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | DECIDED (to defer)                                                                                                                                                                           | legal, ops, integrations | —                                    |
| D-007 | ~2026-07-20 | Release-readiness verdict: **NO-GO for live production**; external blockers outstanding (TASK 9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | DECIDED                                                                                                                                                                                      | production launch        | —                                    |
| D-008 | 2026-07-18  | Disclosure reconciliation: protocol allocation (3%/4%) stated **separately** from ~1% pool fee/gas/slippage; official vs pool volume distinguished                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | DECIDED / IMPLEMENTED                                                                                                                                                                        | app copy, docs           | ECON-1.0 disclosures                 |
| D-009 | 2026-07     | Run a **$130-capped BPSC-TEST canary** (not production) to prove the deploy/execute machinery; fresh canonical deploy required afterward                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | DECIDED / DONE                                                                                                                                                                               | canary                   | —                                    |
| D-010 | 2026-07-24  | Canary gas policy: per-step ceilings = 1.25× reviewed cost; priority ceiling 50,000,000 wei; $130 all-inclusive cap; maxFee/2× gasLimit unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | DECIDED / APPLIED                                                                                                                                                                            | canary operator          | earlier v6 ceilings                  |
| D-011 | 2026-07-24  | Narrow ABI deadline-refresh authorization (only the buy/sell/mint deadline word; byte-diff proven)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | DECIDED / APPLIED                                                                                                                                                                            | canary calldata          | byte-for-byte preservation (partial) |
| D-012 | 2026-07-24  | Wrong selected account = non-halting refusal (nothing sent; switch + retry safe) — v8 operator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | DECIDED / IMPLEMENTED                                                                                                                                                                        | canary operator          | v7 halting precheck                  |
| D-013 | 2026-07-25  | Canary **complete + reconciled** (all 19 tx; nonces 16/8); v9 window now historical/expired; nonce-8 withdrawal deferred + unauthorized                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | DECIDED / VERIFIED                                                                                                                                                                           | canary                   | —                                    |
| D-014 | 2026-07-25  | Recommended next milestone = **distribution lifecycle fork rehearsal** (fee → acquisition → settlement → snapshot → claim)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | DECIDED (direction)                                                                                                                                                                          | lane 1/2                 | —                                    |
| D-015 | 2026-07-25  | Exclude `packages/contracts/canary-packet/` from repo prettier/eslint (byte-stable deliverable governed by its own manifest)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | DECIDED / IMPLEMENTED                                                                                                                                                                        | tooling config           | —                                    |
| D-016 | 2026-07-25  | Adopt the master handover + continuity-file system + `CLAUDE.md` continuity gate (this task, 10F)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | DECIDED / IMPLEMENTED                                                                                                                                                                        | docs, process            | prior handover structure             |
| QEX-1 | 2026-07-25  | **Isolated Rialto Quote-Evaluation Exception**: D-2 (quote:read-only key) remains the founder's preferred policy but is currently UNAVAILABLE via Rialto's dashboard (every key bundles quote:read + swap:create + swap:integrator). QEX-1 is a **bounded exception, not an erasure**: the bundled key may be used **only** in an isolated, non-executing quote-evaluation environment (no signing key, funded wallet, allowance, Permit2 signature, or swap-submission route); authorizes **GET /quote testing only**; does NOT authorize acquisition/execution (D-24 stands); D-3 counsel-pending; D-5/D-6/D-8/D-21/D-22B/D-23 remain open; no router/selector approved or pinned | DECIDED (founder) / IMPLEMENTED (harness) / CONSUMED-COMPLETE 2026-07-25 (one GET /quote; evidence docs/audit/BPS_RIALTO_QEX1_QUOTE_EVIDENCE_2026-07-25.*; live CLI retired = QEX1_CONSUMED) | Rialto boundary, ops     | — (D-2 preserved)                    |

| D-017 | 2026-07-26 | **Guarded-settlement canary stack build-ready, UNDEPLOYED, execution locked** (TASK 10K-4/5/6). Real Chainlink dual-feed price guard (ETH/USD + NVDA/USD, ≤100 bps floor, fail-closed) + opaque-call executor with `ConfigIncomplete` unpause gate + paused-by-default + two-step `Ownable2Step` controller (rejects zero/dead/self). Broadcast-free deploy tooling, tracked forge-std bootstrap (v1.9.7 `77041d2…`), read-only TS canary preflight, runbook. Verified offline (513 Foundry / 245 rialto vitest). `0x77963966` approvable ONLY paired with router code hash `0xa7041268…27611`. Status `CANARY_BUILD_READY_EXECUTION_LOCKED`. **No deploy/fund/approve/execute.** D-24 stands and is expired — a new bounded, independently reviewed authorization is required before any live step; D-6 (Safe/controller), D-3/D-23 (audit/counsel), D-22B (price source), D-8 (cap) remain open | DECIDED (state) / IMPLEMENTED (build) / UNDEPLOYED | Rialto settlement lane | evidence `docs/audit/BPS_RIALTO_CANARY_BUILD_2026-07-26.*` |

| D-018 | 2026-07-26 | **Live oracle/Safe/preflight acceptance (TASK 10K-7).** Read-only live-chain verification (pinned block 19761208) confirms every configured feed/token/router identity MATCHES chain (ETH/USD "ETH / USD" 8dp; NVDA/USD on-chain `description()` "RHNVDA / USD" 8dp — directory label differs; router code hash `0xa7041268…27611`; NVDA `oraclePaused=false`, `uiMultiplier=1e18`). **D-22B ENGINEERING-COMPLETE.** No official Chainlink sequencer feed exists → strict dual-feed 900s retained. Preflight hardened (CONTROLLER_REQUIRED / stale classification / RPC redaction). Real preflight `CANARY_NOT_READY` (controller missing + market-closed/low-volatility stale feeds). **Safe v1.4.1 stack verified available on 4663** (`CANONICAL_SAFE_STACK_AVAILABLE`). RPC "not configured" blocker eliminated. No key/quote/sign/broadcast/deploy; auth RPC URLs never committed. **D-24 stands.** | DECIDED (state) / VERIFIED (live, read-only) / UNDEPLOYED | Rialto settlement lane | evidence `docs/audit/BPS_RIALTO_LIVE_ORACLE_2026-07-26.*` |

| D-019 | 2026-07-26 | **Canonical 2-of-3 Safe controller DEPLOYED (candidate; TASK 10K-8).** Founder signed/broadcast one authorized `createProxyWithNonce` via Owner 1's Rabby wallet (Claude read-only verification only — no signing/broadcast/funding). Safe `0x62Ae5b22Dd28Ee338E5A447ed849f9C7008A5E62` (Safe v1.4.1 SafeL2, 2-of-3; owners `0x7116…2ba2`/`0x0060…c49f`/`0xd5Bb…1759`; threshold 2; nonce 0; no modules; no guard; balances zero). Deploy tx `0x09a4b2c1…ccbb0` block 19831992, status 1. **29/29 checks pass.** Recorded as **candidate contract controller**; **NOT activated** (no executor deployed). One-time Safe-creation authorization **consumed**; **D-24 stands** for executor/settlement/canary. | DECIDED (state) / VERIFIED (live, read-only) / DEPLOYED (Safe only) | controller / Rialto settlement lane | evidence `docs/audit/BPS_SAFE_CONTROLLER_DEPLOYMENT_2026-07-26.*` |

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
   2b. **Guarded-settlement canary stack (Rialto feature-2 WETH→NVDA)** — **BUILD-READY, UNDEPLOYED** (TASK
   10K-4/5/6, 2026-07-26). Chainlink dual-feed price guard + opaque-call executor with a config gate +
   two-step controller + broadcast-free deploy tooling + read-only preflight + runbook. Status
   `CANARY_BUILD_READY_EXECUTION_LOCKED`. Remaining gates below; nothing deployed or authorized.
3. Production hardening + independent security review (B-1) — NOT started.
4. Legal / eligibility completion (B-2/B-3) — NOT started.
5. Read-only public transparency application — NOT started.
6. Separately authorized production deployment — BLOCKED on 3–5 + B-4.

### NEXT TASK (bounded) — Clear the guarded-settlement canary gates (no build work remains)

- **Objective.** The guarded-settlement canary build is complete and verified offline. The next task is
  NOT more code: it is to clear the external gates before any live step — supply the final deployed-contract
  **Safe/controller** address on chain 4663 (D-6); obtain the **external audit** of
  `ChainlinkSettlementPriceGuard.sol` + `GuardedSettlementExecutor.sol` and legal counsel (D-3/D-23);
  confirm the trusted **price source** (D-22B); and record a **new bounded, independently reviewed founder
  authorization** replacing the expired D-24. With a read-only RPC URL, run the one labelled read-only
  canary preflight and archive its report. Then, and only then, follow
  `packages/contracts/deploy/GUARDED_SETTLEMENT_RUNBOOK.md` §5 (controller-driven deploy→configure→
  preflight→unpause). (The older distribution-lifecycle fork rehearsal is already COMPLETE — see item 2.)
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

**Rialto GET /quote evaluation (QEX-1 — isolated, non-executing; GET /quote ONLY)**

- Build once: `npm run build:shared && npm run build --workspace @bps/rialto`
- `[R]` run with the API key entered **masked** (never placed in shell history) and cleared on exit. The
  official origin is the built-in default; the harness performs GET /quote ONLY (no signing, funding,
  allowance, Permit2, or submission) and prints only sanitized JSON (no key, no raw `quote_id`, no full
  calldata). Paste that JSON back for analysis.

```powershell
# Windows PowerShell / PowerShell 7 — key is read interactively (masked), used only by the child, then removed.
$sec = Read-Host -AsSecureString "Rialto API key"
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$env:RIALTO_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
$env:RIALTO_SELL_TOKEN = "<WETH candidate address>"
$env:RIALTO_BUY_TOKEN  = "<stock token candidate address>"
$env:RIALTO_TAKER      = "<unfunded validation / canary adapter address>"
$env:RIALTO_SELL_AMOUNT_DECIMAL = "<human-decimal WETH amount, e.g. 0.01>"
$env:RIALTO_SLIPPAGE_BPS = "<integer bps>"
try { node packages/rialto/dist/quote-eval-cli.js } finally { Remove-Item Env:RIALTO_API_KEY -ErrorAction SilentlyContinue }
```

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

- **2026-07-27 (STAGE A step 1 — guard deployment verified + executor runtime hash derived + launcher repaired)**
  — Read-only on-chain verification + offline bytecode analysis + repair of the ephemeral (out-of-repo) Rabby
  launcher. **No signing, broadcast, deploy, fund, Safe transaction, approval, unpause, transfer, swap, or
  settlement by Claude; no key/mnemonic/RPC/API secret read or exposed.** Repo change is continuity/docs ONLY.
  - **Guard DEPLOYED + independently verified:** the founder broadcast the guard CREATE. `ChainlinkSettlementPriceGuard`
    live at `0x57538680194D9E15Ba78bf243B10B440f663078d`, tx
    `0xc3095c2ed7d4b8365dde2b6a7d76220a75806c552e4f3e17361fa2aedbb4256f`, deployer `0x7116…2ba2` nonce 1,
    block 20167604 (2026-07-26T20:44:17Z), gasUsed 1,121,401, value 0, `to` null, status success (read-only RPC).
  - **CRITICAL — immutable-resolved vs template runtime hashes:** Foundry `deployedBytecode.object` is a TEMPLATE
    with zeroed immutable placeholders, so the bundle's `runtimeBytecodeHash` (guard `0x4c5859…92e8`, executor
    `0x16c8af…0908`) is the PRE-IMMUTABLE hash and can NEVER equal an on-chain runtime that has immutables. Resolved
    runtime hashes: **guard `0xfcb2694b60737532d4d44ede77750068cfb0c0756263c1aaceede57fc74857f4` (== live)**,
    **executor `0xf864233b76b77d05fd95250a3641839941fc00fc4aed3ac736458be957273a8d`** (derived; not yet deployed).
  - **Guard live==frozen proof (offline):** paris rebuild reproduces the bundle exactly. Masked byte-compare of the
    template vs the live runtime confines every difference to the 14 solc immutable reference ranges (equal length
    4485 B, nothing else differs). Each immutable is consistent across its reference sites and equals the
    independently-computed expected value — frozen ctor args (WETH/NVDA/ETH-feed/NVDA-feed, sequencer=0, grace=0,
    maxAges=900/900) + live-read derived values (feed decimals 8/8, token decimals 18/18, description hashes
    keccak("ETH / USD")=`0x62ddc8…1777`, keccak("RHNVDA / USD")=`0xf4d5d0…8b49`). All 14 public immutable getters
    match. Reconstruct(template + expected immutables) == live runtime exactly.
  - **Executor expected hash derived offline (two agreeing methods):** AST-splice (template + solc immutableReferences
    with weth=`0x0Bd7…AD73`, stockToken=`0xd060…9EEC`, registry=`0x71a1…687E`; controller Safe is Ownable storage,
    NOT immutable) AND a read-only `eth_call` creation-simulation against live mainnet state — both `0xf864233b…273a8d`
    (9256 B), differ from template. Simulation also confirms the executor constructor does not revert against live state.
  - **Pre-executor recheck (read-only):** deployer latest & pending nonce **2**, guard code present, executor address
    `0x17e0…f84C` empty, balance 427902428602000 wei (~0.000428 ETH), gasPrice 0.048972 gwei — sufficient (~3×).
  - **Ephemeral launcher repaired** (`%TEMP%/bps-stage-a-launcher/server.mjs`; NOT in repo; sha256
    `d2c5d5d3bfd18e5cd9cce160335af82f3ea85d6fac9d1ffa72dc1eb4d5ebe731`): now EXECUTOR-ONLY; post-deploy validation
    compares the deployed code hash to the immutable-RESOLVED hashes (was comparing to the pre-immutable template —
    would have failed every deploy and falsely disabled the executor); preflight enforces the founder recheck (latest
    & pending nonce==2, guard present AND live runtime==resolved guard hash, executor empty, balance>=gas*price); binds
    127.0.0.1:8799, no key, single `eth_sendTransaction`, read-only RPC allowlist, server-side viem keccak, startup
    self-checks. Smoke-tested read-only then STOPPED. Broadcast NOT performed — the human restarts it to broadcast.
  - **Governance unchanged:** PCE-1 authorizes only guard+executor deploy+verify; NO Safe config/unpause/fund/approve/
    quote/settle. B-1 OPEN, B-2/D-23 COUNSEL-PENDING, D-24 in force for production. Executor deploys PAUSED/fail-closed.
- **2026-07-26 (TASK 10K-10 — private canary execution-bundle finalization, PCE-1)** — Offline/read-only
  finalization; one local commit. **No signing, broadcast, deploy, fund, Safe transaction, approval,
  transfer, swap, settlement, canary, or external contact; no key/mnemonic/RPC/API secret exposed. This is
  preparation, NOT the EXECUTE authorization.** **KL-1 resolved:** pinned `evm_version = "paris"` in a narrow
  `[profile.canary]` in `packages/contracts/foundry.toml` (default profile unchanged so the test suite still
  compiles — OZ 5.6.1's MCOPY-using utils, pulled in via Strings by the deploy script/tests, forbid a
  project-wide paris pin). Basis: Robinhood Chain is an Arbitrum Dedicated Blockchain (Nitro/Orbit), "fully
  EVM-compatible" per official docs, exact ArbOS/hardfork unpublished; paris predates PUSH0/MCOPY/transient/
  blobs, the frozen contracts need none, so paris bytecode runs on every Arbitrum Nitro version and solc
  won't emit MCOPY in the executor. **Two clean builds byte-identical (reproducible):** executor creation
  `0xbf0d3bb70372c0ed6598d451c7967a0f83b40c92ad219b1826c51cbb0d350fa0` (10564 B) / runtime
  `0x16c8afa9344bcbef44ceb073368d723ba7fba6f87fb83b74db9a9efded770908` (9256 B); guard creation
  `0x9385b6b4bb6a94d3d09a2cd23abf2d449ac481a2c9f62c66ebf900c3eea20b34` (6985 B) / runtime
  `0x4c5859271a39e5e9b86cff9932b433e292d79ba749ae3e6d66b8403ca5ea92e8` (4485 B); solc 0.8.26+commit.8a97fa7a,
  optimizer 200. Constructor-args + deploy-data hashes recorded. **Deployer read-only:** `0x7116…2ba2` nonce
  **1**, balance 0.000483387 ETH, no code; predicted CREATE guard `0x57538680194D9E15Ba78bf243B10B440f663078d`
  (nonce 1) + executor `0x17e060c41d34E89147bBAa1C364f6A6e58d2f84C` (nonce 2), both empty — **valid only while
  nonce == 1 (nonce change = hard abort)**. Frozen every constructor/config value; deploy Safe-as-owner (no
  temp owner). Generated sanitized offline artifacts `packages/contracts/deploy/canary-bundle/{unsigned-
deployment,unsigned-safe-transactions,verification-manifest}.json`. 18-step lifecycle rehearsal mapped to
  existing passing tests (item 10 aggregate-cap = operator-side stop). Verified: **forge test --offline
  513/513**, **rialto vitest 252/252**, typecheck/lint/build clean, forge fmt + prettier clean; one documented
  skip (`cast run` full-tx fork replay — Arbitrum-Nitro encoding; substituted with read-only JSON-RPC). Safe
  re-checked read-only (unchanged, inactive). **Gas/exposure:** gasPrice 0.05183 gwei; deploy gas guard
  1,119,595 + executor 2,161,377; max all-inclusive exposure ≈ 0.001555 ETH ≈ **$2.93** at live $1885/ETH vs
  the **$130** cap (~44× headroom) — **$130 safely covers the complete lifecycle**; min deployer funding
  ≈ 0.000340 ETH (deployer already sufficient). **B-1 OPEN, B-2/D-23 COUNSEL-PENDING, D-24 in force for
  production; PCE-1 single-use, not yet consumed.** Status `PRIVATE_CANARY_EXECUTION_BUNDLE_READY`. Evidence
  `docs/audit/BPS_PRIVATE_CANARY_EXECUTION_BUNDLE_2026-07-26.{md,evidence.json}`. Commit `ops(canary):
finalize private execution bundle`.
- **2026-07-26 (PCE-1 — one-time private canary exception: governance amendment + deploy packet)** —
  Documentation only. The founder authorized (via chat) preparation + commit of a governance amendment and an
  exact technical deployment packet for a **single, bounded, private** guarded-settlement canary: **≤ $130
  all-inclusive exposure, no public users, no production reuse, exactly one WETH→NVDA acquisition cycle,
  mandatory pause + recovery afterward.** **Claude prepared documentation only — no broadcast, fund, deploy,
  Safe transaction, or canary was performed; no key/mnemonic/RPC/API secret read or exposed.** PCE-1 is a
  **narrow carve-out from D-24 for this one canary only**: it **does NOT** satisfy or close **B-1**
  (independent audit — remains OPEN/INCOMPLETE) or **B-2/D-23** (counsel — remains INCOMPLETE/COUNSEL-PENDING),
  and **does NOT** weaken/replace/reinterpret **D-24 for production**. The founder explicitly **accepts the
  security + legal risk** of proceeding without B-1/B-2 for this bounded private canary. Technical bounds:
  controller = the verified 2-of-3 Safe `0x62Ae5b22…5E62` as owner; per-acquisition cap 0.001 WETH (reviewed
  `GuardedSettlementConfig` value; executor hard ceiling 0.01 WETH); slippage ≤ 100 bps; oracle deviation 100
  bps; deadline ≤ 300 s; feeds ETH/USD `0x78F3…d3A9` + NVDA/USD `0x379E…9F15`; approved router code hash
  `0xa7041268…27611` + selector `0x77963966`. Execution remains gated on a **separate founder EXECUTE
  go-signal**, an **open NVDA trading session** (fresh feeds < 900 s), a **live Rialto quote** (operator
  obtains it), a **funded deployer** (KL-1 evm_version pin + bytecode verification required first), and 2-of-3
  Safe signatures; then ONE cycle → verify → **mandatory pause + recover to the Safe**. Artifacts:
  `docs/decisions/BPS_PRIVATE_CANARY_EXCEPTION_2026-07-26.md`,
  `packages/contracts/deploy/PRIVATE_CANARY_DEPLOY_PACKET_2026-07-26.md`,
  `docs/audit/BPS_PRIVATE_CANARY_EXCEPTION_2026-07-26.evidence.json`. No auditor/counsel names, signatures, or
  opinions fabricated. Commit `ops(canary): record private canary exception and deploy packet` (docs only).
- **2026-07-26 (TASK 10K-9 — executor activation gate review + external review packet)** —
  Documentation/review only: repository inspection, read-only verification, test/rehearsal execution, and one
  documentation-only commit. **No mainnet or Safe transaction, no deployment, no funding, no approval/
  transfer, no ownership action, no external communication; no key/mnemonic/RPC/API secret exposed. Claude's
  own review is NOT an independent audit.** Froze the executor candidate at commit `5181f1b` (unchanged;
  tree clean) with recorded source SHA-256 hashes (`GuardedSettlementExecutor.sol`
  `14d8e7ed…fe2f`, `ChainlinkSettlementPriceGuard.sol` `92b774c3…c670`, + interfaces + config/deploy script),
  solc 0.8.26 / optimizer 200 (evm_version NOT pinned — KL-1), OZ 5.6.1, forge-std 1.9.7 (test-only). Re-ran
  the full battery from clean: **forge test --offline 513/513**, **rialto vitest 252/252**, typecheck/lint/
  build clean, `forge fmt` + prettier clean; deployment rehearsal green; one documented skip (`cast run` fork
  replay — Arbitrum-Nitro encoding, KL-2). Re-checked the Safe read-only: `0x62Ae5b22…5E62` v1.4.1, exactly
  the three approved owners, threshold 2, nonce 0, singleton/fallback match, **no modules, no guard**,
  native/WETH/NVDA balances zero, runtime 171 B hash `0xd7d408…fb4c` — verified **candidate** controller,
  **not active**. Produced the external-review packet
  `docs/audit/BPS_EXECUTOR_ACTIVATION_READINESS_2026-07-26.{md,evidence.json}` (scope, frozen identifiers,
  build/test evidence, a 20-row threat/control matrix, deployment/ownership design, external-integration
  trust, known limitations KL-1..KL-5, unresolved decisions UD-1..UD-10, exact evidence still needed from
  auditor/counsel/founder, and NOT-AUTHORIZED deployment + canary checklists). **Gate status (authoritative
  Rialto decision pack D-1..D-24, all PROPOSED; ballot never returned):** repo **D-3** = key-scope policy
  ("never" broaden server-env key) — honored, not an audit gate (flagged the task's "D-3 = independent
  review" framing as a naming divergence; the real audit gate is **B-1**); **B-1 independent audit OPEN**
  (none performed); **D-23 counsel PENDING** (B-2 unresolved; no counsel opinion in repo); **D-24 FULLY IN
  FORCE**, requiring D-1..D-23 approved + selector pinned + audit B-1 + legal B-2 + a fresh independently-
  reviewed authorization. This task did **not** weaken, replace, expire, or reinterpret D-24. Status
  `EXECUTOR_EXTERNAL_REVIEW_PACKET_READY` — activation prohibited; Safe remains a candidate controller.
  Commit `ops(executor): prepare activation gate packet` (evidence + continuity only; no code change).
- **2026-07-26 (TASK 10K-8 — deploy the canonical 2-of-3 Safe controller only)** — The founder signed and
  broadcast exactly one authorized `SafeProxyFactory.createProxyWithNonce` transaction through Owner 1's Rabby
  wallet. **Claude performed read-only verification only — no signing, no broadcast, no funding, no key/
  mnemonic read, no authenticated RPC exposure, no executor/approval/swap/settlement/canary.** In the prior
  turn Claude had prepared the complete unsigned packet (`UNSIGNED_SAFE_CREATION_READY`) because this headless
  environment has no interactive signer. Deployed **Safe `0x62Ae5b22Dd28Ee338E5A447ed849f9C7008A5E62`** (Safe
  v1.4.1 SafeL2, 2-of-3): owners `0x7116F2998e625651D310E97919a1c638a7F82ba2`,
  `0x006024ff3b9b707ad0779eD3586546440fAAC49f`, `0xd5Bb1534Efc88400f34A832D85D0939c0e2F1759`; threshold 2;
  nonce 0; master copy = SafeL2 singleton `0x29fcB4…C762`; fallback handler `0xfd0732…Ec99`; **no modules, no
  guard**; native/WETH/NVDA balances all zero; runtime 171 B hash `0xd7d408…fb4c`; salt nonce
  `0x87893661…8cf9`. Deploy tx `0x09a4b2c179da9b1ab2abfc0c2b8067a07fe5850f026d8f8aa89af4d5451ccbb0`, block
  19831992 (hash `0x304d994f…e77b2`, 2026-07-26T11:23:46Z), receipt status 1, sender Owner 1, to the canonical
  proxy factory `0x4e1DCf…ec67`, value 0, gas used 306172 (0.00001661289272 ETH), exactly one `ProxyCreation`
  (proxy = Safe, singleton = SafeL2). **Independent read-only verification: 29/29 checks pass.** Recorded as
  the **verified candidate contract controller** — **NOT activated** as the executor controller because no
  `GuardedSettlementExecutor` is deployed (the Safe owns/controls nothing yet). The one-time Safe-creation
  authorization is **consumed**; **D-24 remains fully effective** for the executor, settlement, and canary.
  Evidence `docs/audit/BPS_SAFE_CONTROLLER_DEPLOYMENT_2026-07-26.{md,evidence.json}`. Commit `ops(safe):
record canonical controller deployment` (evidence + continuity only; no code change).
- **2026-07-26 (TASK 10K-7 — close the live oracle, Safe, and preflight evidence gaps)** — Read-only
  live-chain acceptance at pinned block **19761208** (hash `0x71d860…cf2d08`, `2026-07-26T09:25:23Z`, chain 4663) via a private Robinhood Chain relay that served block-tagged state (no fallback needed; authenticated
  RPC URLs used only via ephemeral process env, never written to the repo). **Feed resolution** used the
  official Chainlink reference-data directory (`feeds-robinhood-mainnet.json`, 56 feeds): ETH/USD
  `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` (on-chain `description()` "ETH / USD", 8dp, heartbeat 86400s,
  0.5% dev, crypto 24/7) and NVDA/USD `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` (directory name "Robinhood
  NVDA / USD" but on-chain `description()` **"RHNVDA / USD"**, 8dp, us_equities_24/5). **Every production-facing
  identity MATCHED the implementation — no address/description/decimals fix was required** (the 10K-6
  "RHNVDA / USD" pin was correct). No separate WETH/USD feed exists; ETH/USD prices canonical WETH 1:1 (no
  multiplier). NVDA token: `oraclePaused=false`, `uiMultiplier=newUIMultiplier=1e18`, `effectiveAt=0` — feed
  already reflects the Total Return Value, guard does not re-apply. Router `ownerOf(2)`=`0xC94135b6…359bD`,
  live code hash `0xa7041268…27611` (matches pin). **No official Chainlink L2 Sequencer Uptime Feed** for
  Robinhood Chain (none among 56 feeds) → strict dual-feed 900s freshness retained (Robinhood's WebSocket
  "Sequencer Feed" RPC is NOT a Chainlink on-chain feed). Both feeds were stale under 900s at observation
  (NVDA market-closed Sunday, ETH low-volatility within its 86400s heartbeat) — runtime availability, not a
  defect; max age was NOT increased. **Preflight hardened** (`packages/rialto/src/canary-preflight*.ts`): a
  missing-controller mode reporting `CONTROLLER_REQUIRED` as one failure while all controller-independent live
  checks still run; stale classifications `NVDA_FEED_STALE_MARKET_CLOSED` / `ETH_USD_FEED_STALE`; token-symbol
  - selector/code-hash-pairing checks; and full RPC-URL redaction so no endpoint can leak through any error.
    **Real read-only preflight** (`NETWORKED READ-ONLY PREFLIGHT`, missing-controller mode) =
    **`CANARY_NOT_READY`** (failed `eth-usd-feed-fresh`, `nvda-usd-feed-fresh`, `controller`; flags
    `ETH_USD_FEED_STALE`, `NVDA_FEED_STALE_MARKET_CLOSED`, `CONTROLLER_REQUIRED`); every controller-independent
    check passed. **Safe investigation** (`safe-deployments` manifests + live `eth_getCode`):
    **`CANONICAL_SAFE_STACK_AVAILABLE`** — Safe v1.4.1 SafeL2 `0x29fcB4…C762`, ProxyFactory `0x4e1DCf…ec67`,
    FallbackHandler `0xfd0732…Ec99`, MultiSend `0x38869b…B526`, MultiSendCallOnly `0x9641d7…02e2` all listed for
    4663 with live code hashes matching the manifest; sanitized non-broadcast creation packet added
    (`deploy/SAFE_CONTROLLER_SETUP.md`; owners/threshold unresolved). **D-22B ENGINEERING-COMPLETE**; RPC
    "not configured" blocker eliminated; D-5/D-8/D-21 unchanged; D-6 only final controller + activation remain;
    D-3/D-23 counsel/audit-pending; **D-24 stands**; D-17 untouched; QEX-1 consumed. Verified: **513 Foundry /
    252 rialto vitest**, typecheck/lint/build/format clean; secret + RPC-hostname scans clean. Two independent
    conclusions: technical build = `CANARY_BUILD_READY_EXECUTION_LOCKED`; live runtime = `CANARY_NOT_READY`.
    No Rialto request, no API key, no private key/mnemonic, no signing/funding/approval/deployment/broadcast.
    Evidence `docs/audit/BPS_RIALTO_LIVE_ORACLE_2026-07-26.{md,evidence.json}`. Commit `fix(settlement): verify
live oracle and canary preflight`.
- **2026-07-26 (TASK 10K-6 — final canary-ready build: Chainlink price guard, controller gate, deployment
  rehearsal)** — Replaced the placeholder price guard with `ChainlinkSettlementPriceGuard.sol`: a real
  dual-feed guard over the verified Robinhood Chain Chainlink proxies (ETH/USD `0x78F3…d3A9` "ETH / USD" 8dp;
  NVDA/USD `0x379E…9F15` "RHNVDA / USD" 8dp) that reverts unless `minBuyAmount` ≥ the Chainlink fair output
  reduced by ≤100 bps and fails closed on wrong chain/pair, zero amount, changed feed decimals/identity,
  non-positive answer, zero/future timestamp, incomplete round, stale feed (ceiling 900 s), a globally
  paused stock oracle, and (if a sequencer feed is configured) sequencer down / grace. The NVDA feed is the
  multiplier-adjusted Total Return Value/USD so `uiMultiplier` is not re-applied; no official sequencer feed
  is published, mitigated by strict 15-minute dual-feed freshness. Wired it into the executor and added a
  **config gate**: `unpause()` reverts `ConfigIncomplete` unless price guard + approved code hash + approved
  selector + WETH cap + WETH/NVDA pair are set; the executor deploys **paused**; `transferOwnership` is a
  two-step `Ownable2Step` transfer rejecting zero/dead/self. Added broadcast-free deploy tooling
  (`script/settlement/GuardedSettlementConfig.sol` with fail-closed `validate` + `deployPaused`, and
  `DeployGuardedSettlement.s.sol` writing a sanitized manifest — no `vm.broadcast`, no key, no API key), a
  tracked forge-std bootstrap (`tool/bootstrap-forge-std.{sh,ps1}`, pinning v1.9.7 `77041d2…4d505`, verify +
  refuse-on-mismatch + no-overwrite), a read-only TS canary preflight (`packages/rialto/src/
canary-preflight.ts` DI core + `canary-preflight-cli.ts`, which refuses to run if any key/secret env is
  present and emits `CANARY_BUILD_READY_EXECUTION_LOCKED`/`CANARY_NOT_READY`), the config template
  `deploy/guarded-settlement.env.example`, and the runbook `deploy/GUARDED_SETTLEMENT_RUNBOOK.md`
  (phases A/B/C). Local rehearsal (`test/GuardedSettlementDeploy.t.sol`, mock code etched at the pinned
  addresses) proves paused-by-default, the config-gate unpause, a fresh-feed 0.001 WETH→NVDA settlement
  returning the exact oracle-floor NVDA delta, a stale-feed failure leaving zero allowance + unconsumed
  digest + unused nonce, and the two-step controller transfer. Verified offline: **513 Foundry / 245 rialto
  vitest**, typecheck/lint/build clean, `forge fmt --check` + `prettier --check .` clean, secret + broadcast
  scans clean. **No Rialto request, no API key, no signing, no broadcast, no deployment; QEX-1 consumed;
  D-24 stands (expired).** Status `CANARY_BUILD_READY_EXECUTION_LOCKED`; UNDEPLOYED. Evidence:
  `docs/audit/BPS_RIALTO_CANARY_BUILD_2026-07-26.{md,evidence.json}`. Commit `feat(settlement): add chainlink
price guard and canary preflight`.
- **2026-07-26 (TASK 10K-5 — remove the Rialto-ABI blocker via opaque-call validation)** — Refactored the
  guarded executor to treat Rialto's returned calldata as an OPAQUE, quote-bound payload (per Rialto's
  "submit tx.to/tx.data/tx.value unmodified" docs), removing the assumption that BPS needs Rialto's inner
  ABI/function signature. The per-selector ABI-decoding calldata validator + its interface/mock were
  deleted; the executor now binds an **approved runtime code hash + selector** (`setApprovedRouterCode`),
  reads `router.codehash` at execution (rotation/upgrade => `CodeHashMismatch` halt), extracts only the
  leading selector, and low-level-calls the unmodified calldata — safety comes from the envelope
  (registry lock + approved code hash + exact allowance + own-balance NVDA min-delta + allowance reset +
  digest/nonce replay + atomic revert), not from understanding the payload. Read-only on-chain
  investigation (public RPC, no key/signing) at block 19674173: router
  `0xc94135b63772b91d79d0a2daab2a8801f32359bd` runtime code hash
  `0xa7041268d6f20802f420b5c71e84a991dc797f27cb474265598b89e43ef27611` (24,232 bytes; stable at the
  example-tx block), **direct implementation** (no EIP-1967 slots; creation tx `to: null`),
  `registry.ownerOf(2)`==router, selector `0x77963966` in the dispatcher, router = target + allowance
  spender, and (older selector `0x8fb4309b`) delivering NVDA to the original taker. Full `cast run` replay
  UNAVAILABLE (Arbitrum-Nitro block/tx encoding vs foundry 1.7.1) — archive STATE reads were used instead;
  not a blocker. Evidence: `docs/audit/BPS_RIALTO_ROUTER_OPAQUE_CALL_2026-07-26.{md,evidence.json}`. Added
  TS `validateOpaqueQuoteForIntent` (never modifies `tx.data`, returns only the calldata hash). Tests:
  **55 Foundry** (unit + malicious routers: output-elsewhere, no-output, overpull, wrong/rotated code hash;
  - fuzz + allowance-zero invariant) all offline; rialto vitest **219/219** (+ TS opaque-quote-boundary +
    digest parity unchanged). Governance: the missing ABI is no longer a blocker; `0x77963966` is approvable
    ONLY with the observed code hash; rotation halts settlement; D-6 open only for Safe/taker + activation;
    price source separate (D-22B); **D-24 stands**; D-17 unchanged. No Rialto request, API key, signing,
    funding, approval, deployment, or broadcast; QEX-1 remains consumed. Commit
    `feat(rialto): validate opaque settlement calldata`.

- **2026-07-25 (TASK 10K-4 — Solidity GuardedSettlementExecutor + offline Foundry tests)** — Implemented
  `packages/contracts/src/GuardedSettlementExecutor.sol` (UNDEPLOYED; starts paused; disabled until
  configured) + interfaces `IGuardedSettlementExecutor.sol` (rewritten to the concrete surface),
  `ISettlementPriceGuard.sol`, `ISettlementCalldataValidator.sol`. Architecture: `Ownable2Step` Safe
  controller (rejects zero/dead/self), executor-as-taker + purchased-token recipient, `Pausable`,
  `ReentrancyGuard`, `SafeERC20`; registry `ownerOf(2)` lock (never prev/next/quote/env/override);
  per-selector COMPLETE-calldata validator (selector allow-list alone insufficient); required price guard
  (D-22B); WETH→NVDA only; per-token cap ≤ 0.01 WETH; non-payable (msg.value 0); platform fee ≤ 5 bps; no
  integrator fee; slippage ≤ 100 bps; domain-separated `keccak256(abi.encode(DigestInput))` intent digest
  with single-use digest+nonce marked before the external call (atomic revert restores); exact-allowance →
  verified router call → min received-delta → allowance reset to zero; sanitized events (no calldata);
  narrow `recover` (owner-only, own balance only, nonReentrant). The evidence-only selector `0x77963966`
  is **hard-blocked** on-chain (`EvidenceOnlySelectorDisabled`) — **not authoritatively proven**, so it
  stays disabled. Dependency: **forge-std v1.9.7** (commit `77041d2ce690e692d6e03cc812b57d1ddaa4d505`)
  cloned into the gitignored `packages/contracts/lib/`; OZ 5.6.1 via node_modules. Tests: 50 Foundry
  tests (unit + fuzz + a stateful invariant — router allowance always zero across 128,000 calls), all
  **offline** (`forge test --offline`, no fork, no RPC). TypeScript: added `computeOnchainIntentDigest`
  (viem) to `guarded-settlement.ts` proving byte-identical TS↔Solidity digests via a shared vector
  (`0x99edf1c9…8c06`); rialto vitest **202/202**. NO deployment, signing, funding, approval, simulation,
  broadcast, quote, or API-key read; QEX-1 remains consumed. Governance (candidates only; nothing closed):
  D-5/D-8/D-21/D-22B candidate; D-6 open; D-3/D-23 counsel-pending; **D-24 stands**; D-17 unchanged.
  Commit `feat(rialto): implement guarded settlement executor`.

- **2026-07-25 (TASK 10K-3 — guarded-settlement core, production-shaped but DISABLED)** — Offline code +
  tests + concise docs only. NO Rialto request, API key use/read, RPC/website/registry/external API,
  network client, signing/funding/approval/simulation/deployment/submission/broadcast, enabled execution
  path, QEX-1 re-enable, or push/PR. Zero network requests (every test carries a network tripwire).
  Implemented `packages/rialto/src/guarded-settlement.ts`: typed `SettlementPolicy` (candidate defaults:
  chain 4663, feature 2, WETH→NVDA only, no integrator fee, ≤5 bps platform fee, 50/100 bps slippage,
  ≤100 bps deviation, ≤300 s lifetime; unresolved-by-design selector list/taker/caps/ages/price sources),
  domain-separated `computeIntentDigest`, and `evaluateGuardedSettlement` running registry/selector/taker/
  token/amount/fee/value/price(D-22B)/replay+expiry guards with integer-safe math (floor deviation
  rounding) and a full `GuardStatus` set — returning a sanitized immutable plan only as
  `READY_OFFLINE_ONLY` (never execution authorization). `replayQex1Evidence` demonstrates the sanitized
  QEX-1 evidence is NOT production-ready (SELECTOR_UNAPPROVED, TAKER_UNRESOLVED, AMOUNT_LIMIT_UNRESOLVED,
  PRICE_SOURCE_UNRESOLVED, REGISTRY_OBSERVATION_STALE, …). Doc:
  `docs/audit/BPS_RIALTO_GUARDED_SETTLEMENT_2026-07-25.md`. Solidity executor DEFERRED — forge-std is not
  vendored (`packages/contracts/lib/` gitignored/absent) so the Foundry test runner can't run offline;
  added the contract-ready interface `packages/contracts/src/interfaces/IGuardedSettlementExecutor.sol`
  (OZ + `IRialtoRouterRegistry` ABI present; only forge-std missing). Governance (candidates only, nothing
  closed): D-5/D-8/D-21/D-22B candidate; D-6 open; D-3/D-23 counsel-pending; **D-24 stands**; D-17
  unchanged. QEX-1 remains CONSUMED. Verified OFFLINE: rialto typecheck + build + eslint clean, vitest
  **201/201**; format:check + JSON validation clean; no `rialto_live_` key body in tracked files. Commit
  `feat(rialto): add guarded settlement core`.

- **2026-07-25 (TASK 10K-2 — record QEX-1 quote evidence + offline structural replay)** — Offline
  evidence-recording + validation only. NO Rialto request, NO API key read, NO RPC/website/external API,
  NO network client, NO signing/simulation/approval/funding/deploy/submit/broadcast, NO
  transaction-execution path, NO change to any production approval or acquisition boundary, NO push/PR.
  (1) **Evidence artifact** `docs/audit/BPS_RIALTO_QEX1_QUOTE_EVIDENCE_2026-07-25.{md,evidence.json}`
  records the founder-supplied sanitized result of the single QEX-1 GET /quote (raw sell/buy/min-buy,
  settlement `allowance`, platform fee 5 bps, `tx.to` = `0xc94135b63772b91d79d0a2daab2a8801f32359bd`,
  selector `0x77963966`, calldata byte length 804, `tx.value` 0, one all-`null` route leg, SHA-256 of
  `quote_id` only), the original structural result (`ROUTER_UNRESOLVED`, preserved unchanged), a SEPARATE
  read-only **undated** registry observation (feature 2 current router matches the target; `paused=false`;
  block/time unavailable), the derived offline replay, governance limitations, and fields omitted for
  security. Layout note: uses the flat `docs/audit/BPS_RIALTO_*` convention (no `docs/audit/rialto/`
  subtree). (2) **Pure offline evaluator** `packages/rialto/src/registry-structural.ts` assesses the
  registry observation SEPARATELY from selector approval and fails closed (malformed addr/selector, zero
  current router, paused feature, target≠current, previous/next-only match, missing fields, wrong chain).
  Derived result for this evidence: router reconciled against the undated snapshot only → **
  `SELECTOR_UNAPPROVED`**; selector evidence-only (not approved/pinned); **production structural approval
  false; D-6 open**. A single observed selector cannot self-approve or close D-6. (3) **QEX-1 retired:**
  the live CLI now stops with `QEX1_CONSUMED` before any env read or network call; no env override bypasses
  it; the reviewed quote client is NOT deleted; any future live quote needs a separately reviewed source
  change + new founder authorization. (4) **Governance:** QEX-1 CONSUMED/COMPLETE (one quote only);
  D-2 read-only preference preserved; D-3 counsel-pending; D-5/D-6/D-8/D-21/D-22B open; D-23
  counsel-pending; **D-24 stands**; ballot D-17 untouched. Verified OFFLINE: rialto typecheck + build +
  eslint clean, vitest **150/150** (network tripwire in the offline suite); format:check + JSON validation
  clean; no `rialto_live_` key body in tracked files; **zero network requests**. Commit
  `chore(rialto): record QEX-1 quote evidence`.

- **2026-07-25 (TASK 10K-1A — corrected quote-eval units, origin and governance)** — Corrective task on
  the 10K-1 harness (10K-1 commit `1d580e3` preserved). (1) **Units:** `GET /quote` `sell_amount` is a
  HUMAN-DECIMAL token amount, not raw base units. The runtime input is now `RIALTO_SELL_AMOUNT_DECIMAL`
  (validated positive decimal, ≤18 fractional digits); the request transmits the decimal (e.g. `0.01`),
  and the returned RAW sell amount is validated against the decimal converted at WETH's 18 decimals. D-7
  contains no exact usable quantity ("minimum venue-accepted amount" only), so **no default amount was
  invented** — the operator must supply one. (2) **Origin:** the official origin
  `https://rialto-trade-api.rialto.xyz` is enforced (BAD_ORIGIN fail-closed on any other
  protocol/host/credentials/port/path/fragment/query), before any network activity. (3) **Report:**
  expanded sanitized report (chain id, tokens, requested decimal, returned raw sell/buy/min-buy,
  settlement mode, platform-fee breakdown, integrator-fee-not-requested, network-fee estimate, issues,
  route legs, tx target, selector + byte length (never full calldata), tx value, quote created/expiry, and
  a **SHA-256 digest of `quote_id`** — never the raw id). (4) **Governance:** decision renamed **QEX-1 —
  Isolated Rialto Quote-Evaluation Exception** (the label `D-017` was ambiguous with ballot D-17, which is
  unchanged); **D-2's read-only preference restored/preserved**, recorded as unavailable via Rialto's
  dashboard with QEX-1 as a bounded exception (not an erasure); D-3 counsel-pending; D-5/D-6/D-8/D-21/
  D-22B/D-23/D-24 remain open; the observed router/selector are candidates only (reconcile against the
  official registry `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E`). (5) **Run docs:** replaced the unsafe
  PowerShell example with a masked `Read-Host -AsSecureString` method that clears `RIALTO_API_KEY` after
  the process exits (§P). NO live GET /quote and NO credential used. Verified OFFLINE: rialto typecheck +
  build + eslint clean, vitest **129/129**; repo format:check + JSON validation clean; no `rialto_live_`
  in tracked files. Commit `fix(rialto): correct quote-eval units and governance`.

- **2026-07-25 (TASK 10K-1 — isolated non-executing Rialto GET /quote evaluation harness + Quote-Evaluation
  Exception)** — Founder issued the **Isolated Rialto Quote-Evaluation Exception (QEX-1)** — D-2's read-only preference is PRESERVED (bounded exception, not an erasure): Rialto confirmed it
  issues **no** `quote:read`-only key (every key bundles `swap:create` + `swap:integrator`), so the mandatory
  bundled key may be used **only** in an isolated, non-executing quote-evaluation environment (no signing key,
  funded wallet, allowance, Permit2 signature, or swap-submission route); it authorizes **GET /quote testing
  only** and does **not** authorize acquisition/execution (D-24 stands). Implemented
  `packages/rialto/src/quote-eval-cli.ts` — reuses the hardened `fetchRialtoAllowanceQuote` (key from
  `RIALTO_API_KEY`, never logged/returned; no signer, wallet, allowance, or submission path), runs the
  fail-closed `validateQuoteExecution` + `classifyBoundary`, and prints only sanitized fields (target,
  selector = calldata[0:10], min-buy, expiry). Exported via `@bps/rialto/server`; added
  `quote-eval-cli.test.ts` (18 tests: sanitized report, key-never-in-output, missing-key ⇒ no network,
  fail-closed structural codes). Verified OFFLINE only: `@bps/rialto` typecheck + build clean, eslint clean,
  vitest **107/107**. **No live GET /quote was run** — blocked on runtime inputs (Rialto API base URL, taker,
  sell amount, slippage) and a rotated key (the key pasted into chat is exposed/compromised and should be
  revoked). Recorded as **QEX-1**. Commit `feat(rialto): isolated non-executing quote-eval harness`. (Units + governance corrected in TASK 10K-1A below.)

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
