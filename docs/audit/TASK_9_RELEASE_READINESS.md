# TASK 9 — BPS Protocol Release-Readiness Review

**Type:** Independent audit and evidence pass (audit-only; no product/test/config code modified).
**Date:** 2026-07-23. **Auditor role:** Claude Code (engineering audit).
**Repository:** `C:\Projects\bps-experiment`. **Branch:** `master`. **HEAD:** `8c97add`.

> This review is **not** an independent external smart-contract audit and is **not** a legal or
> jurisdiction/eligibility review. A Task 9 PASS does not authorize Task 10, deployment, or launch. See §20.

---

## 1. Executive verdict

**PASS WITH EXTERNAL BLOCKERS.**

The code and the local (in-repo) release controls satisfy the gate: the frozen protocol layer is provably
unchanged since the accepted frozen checkpoint `90e338a`; Task 7 deployment files are unchanged since
`cd98df3`; every repository-defined check passes with zero failures and zero skips; no test was deleted,
weakened, or skipped; secrets and the server-only Rialto boundary are not present in the built browser
bundle; and every substantive Task 8 acceptance item is implemented on the real application path and
covered by a named test. No Critical, High, or Medium finding was identified.

Production nonetheless remains **blocked** by external inputs that are outside this repository's control
(independent contract audit, legal/eligibility approval, Rialto production terms + credential, finalized
role/wallet-control addresses, source-backed Stock-Token/oracle configuration, liquidity/valuation/float
decision, restricted participant list, production RPC + monitoring, and explicit founder authorization) and
by one in-repo gate item recorded as a Low/Informational finding: the application currently defaults to the
local deterministic mock wallet config, so a real-injected-wallet production build path is not yet wired and
`apps/web/lib/testing/*` (including the throwaway demo key) is still part of the demonstration bundle.

This is not a code defect — the app is a deliberately fail-closed **local demonstration** (live writes
disabled, all data labeled fixture) — but it is a required entry condition before any real-wallet canary.

**No FAIL condition exists.**

---

## 2. Starting state and checkpoint chain

Confirmed by direct inspection:

| Item             | Expected  | Observed                                   | Result |
| ---------------- | --------- | ------------------------------------------ | ------ |
| Branch           | `master`  | `master`                                   | ✅     |
| HEAD             | `8c97add` | `8c97add3bde3ed287822ab1b07db25df878e5e03` | ✅     |
| Parent of HEAD   | `26b7feb` | `26b7febf3977285ae77266ca124b9da4277cc78f` | ✅     |
| Working tree     | clean     | clean (`git status --short` empty)         | ✅     |
| Untracked source | none      | none                                       | ✅     |
| Remotes / push   | none      | `git remote -v` empty → nothing pushed     | ✅     |

**Preserved checkpoint chain** (each proven an ancestor of HEAD via `git merge-base --is-ancestor`):
`d9b9fc0` → `d212456` → `26b7feb` → `8c97add`. Also ancestors of HEAD: `90e338a` (frozen protocol
checkpoint), `cd98df3` (Task 7 deployment preparation).

`git log --oneline --decorate -12` (top):

```
8c97add (HEAD -> master) fix(app): close restricted beta acceptance gaps
26b7feb fix(app): finish restricted beta interaction coverage
d212456 feat(app): complete restricted beta interaction layer
d9b9fc0 feat(app): integrate restricted beta protocol flows
cd98df3 feat(deploy): prepare restricted beta release
90e338a fix(protocol): bind funding to recorded acquisitions
41d86cc feat(protocol): integrate Rialto stock funding flow
64825a3 feat(contracts): add Uniswap v3 BPS swap adapter
0f32691 feat(contracts): add stock acquisition vault boundary
3306281 checkpoint: complete BPS task 6A trade router
c443b92 checkpoint: complete BPS tasks 1-5
```

**Environment (exact):** Node `v24.18.0`, npm `11.16.0`, Git `2.55.0.windows.2`, Forge `1.7.1`
(commit `4072e48705af9d93e3c0f6e29e93b5e9a40caed8`). OS: Windows Server 2022 (win32).

**Dependency/lockfile state:** unchanged. `git diff 26b7feb..8c97add` touches no `package.json` or
`package-lock.json` (see §4); `npm ls` reports a healthy tree (only platform-specific **optional** native
binaries for other OSes are unmet — expected on win32). No dependency was installed by this task.

---

## 3. Audit scope and exclusions

**In scope:** starting-state verification; frozen-boundary proof; full reproducible validation of all
repository-defined checks; test-total reconciliation; a Task 8 acceptance evidence ledger; a manual
security review of contracts, deployment system, application/wallet layer, and the Rialto/server boundary;
secret and browser-bundle scans.

**Explicitly out of scope / not performed (per Task 9 constraints):** any live wallet access, real
signature or transaction, deployment or broadcast, production RPC write, protected Rialto request, reading
or using `RIALTO_API_KEY`, pool creation or liquidity action, and any modification to application, contract,
deployment, test, package, or configuration code. The **only** file created is this report.

**Not a substitute for:** an independent third-party smart-contract audit, a formal verification effort, or
legal/jurisdiction/eligibility review. See §20.

---

## 4. Frozen-boundary proof

All diffs computed directly with Git. "EMPTY" = the tool produced no output (no change).

| Assertion                                                          | Command                                                                                         | Result       |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------ |
| Frozen production contracts + interfaces unchanged since `90e338a` | `git diff 90e338a..HEAD --stat -- packages/contracts/src/**/*.sol packages/contracts/src/*.sol` | **EMPTY** ✅ |
| No contract/test/deploy change since Task 7 (`cd98df3`)            | `git diff cd98df3..HEAD --stat -- packages/contracts`                                           | **EMPTY** ✅ |
| `packages/shared/src` unchanged since `90e338a` (through 8B–8D)    | `git diff 90e338a..HEAD --stat -- packages/shared/src`                                          | **EMPTY** ✅ |
| Task 7 deployment files unchanged since `cd98df3`                  | `git diff cd98df3..HEAD --stat -- packages/contracts/script packages/contracts/deploy`          | **EMPTY** ✅ |
| No `package.json`/lockfile change in Task 8D                       | `git diff 26b7feb..HEAD --stat -- **/package.json package.json package-lock.json`               | **EMPTY** ✅ |

The 17 frozen Solidity units confirmed byte-unchanged since `90e338a`:
`BPSToken.sol`, `DistributionClaimManager.sol`, `BPSLockingVault.sol`, `BPSTradeRouter.sol`,
`DistributionFundingCoordinator.sol`, `StockAcquisitionVault.sol`, `BuildProbe.sol`,
`adapters/RialtoStockAcquisitionAdapter.sol`, `adapters/UniswapV3BPSSwapAdapter.sol`, and the interfaces
`IBPSBurnable`, `IBPSSwapAdapter`, `IDistributionClaimManagerFunding`, `IRialtoRouterRegistry`,
`IStockAcquisitionAdapter`, `IStockAcquisitionVaultOps`, `IStockAcquisitionVaultView`, `ISwapRouter02`.

**Note on the 90e338a..HEAD contract diff:** it shows additions **only** under `packages/contracts/test/*`
(+ 3 lines in `foundry.toml`). These were introduced entirely by `cd98df3` (Task 7): the new tests
`CoordinatorFundingRollback.t.sol`, `DeployConfigValidation.t.sol`, `ForkDeployRehearsal.t.sol` and mocks
`AllowanceTrapERC20.sol`, `HostileFundingManager.sol`. Confirmed via `git diff 90e338a..cd98df3 --name-status`
and the empty `cd98df3..HEAD` contract diff — i.e., Task 8 added **zero** contract or contract-test changes.

**Accepted economics unchanged:** since every `src/*.sol` is byte-identical to `90e338a`, the accepted
supply, fees, routing, acquisition, distribution (80/20), and locking economics are unchanged by
construction. No `BPS-ECON-2.0` or 80/20 constant was touched.

**No test deleted / weakened / skipped / de-asserted (Task 8D):** `git diff 26b7feb..HEAD --name-status`
shows every test file as `M` (modified) or `A` (added) — none `D` (deleted). A deletion-only scan of test
lines found exactly two removed assertion-bearing lines, both **value updates inside a net expansion**, not
removals of coverage:

- `AppDashboard.test.tsx` / `flow.spec.ts`: `locked-balance "1000.000"` → `"1500.000"` (the seeded
  pre-existing 500-BPS lock changed the post-lock total; a partial-withdrawal assertion set was added).
- `oracle-reads.test.ts`: `describe("… (§G)")` + one `it("fails closed when the feed has no code")` were
  replaced by `describe("… (§F)")` with the same case **plus 12 additional cases**.

No `.skip`, `.only`, `.todo`, `xit`, or `xdescribe` was added anywhere (`git diff 26b7feb..HEAD` scan empty).
Foundry reports `0 skipped`.

---

## 5. Exact test-total reconciliation

All suites executed locally with no dependency installation.

| Suite | Command | Tests | Files | Skipped |
|---|---|---|---:|---:|---:|
| Foundry (contracts) | `forge test` | **398** | 42 suites | 0 |
| `@bps/web` Vitest (all) | `vitest run` | **129** | 17 | 0 |
| `@bps/shared` | `vitest run` | 52 | 8 | 0 |
| `@bps/pilot` | `vitest run` | 12 | 2 | 0 |
| `@bps/rialto` | `vitest run` | 30 | 2 | 0 |
| `@bps/indexer` | `vitest run` | 1 | 1 | 0 |
| `@bps/worker` | `vitest run` | 1 | 1 | 0 |
| `@bps/db` | `vitest run` | 1 | 1 | 0 |
| **TypeScript total** | (`npm run test` aggregate) | **226** | 32 | 0 |
| Playwright (Chromium E2E) | `playwright test` | **1** | 1 | 0 |

**`@bps/web` breakdown (129):**

| Category                                                                                                                                                     | Files |  Tests |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | -----: |
| Application-core (`lib/*.test.ts`: claim 6, e2e 1, economics 5, eligibility 14, locking 4, manifest 7, oracle 6, rialto-boundary 2, trade 5, transparency 5) | 10    | **55** |
| Service tests (`lib/services/*`: claim-validation 8, oracle-reads 14, reads 13, transparency-reads 12)                                                       | 4     | **47** |
| Wallet lifecycle (`lib/wallet/tx.test.ts`)                                                                                                                   | 1     | **15** |
| Provider-state (`lib/testing/mock-eip1193.test.ts`)                                                                                                          | 1     |  **9** |
| Server-boundary (`lib/rialto-boundary.test.ts`, counted within app-core above)                                                                               | (1)   |    (2) |
| Component/integration jsdom (`app/AppDashboard.test.tsx`)                                                                                                    | 1     |  **3** |

**Reconciliation of the Task 8D-reported numbers:**

- The prior "**176 TypeScript tests**" figure (Task 8B/8C baseline) = `@bps/web` **79** (its count at Task 8C)
  - **97** across the other TS workspaces. The 97 is confirmed by direct measurement now:
    `52 + 12 + 30 + 1 + 1 + 1 = 97`.
- Task 8D grew `@bps/web` from 79 → **129** (+50, all additive: new `claim-validation.test.ts` 8,
  `mock-eip1193.test.ts` 9, plus expansions to reads/oracle-reads/transparency-reads/tx). The other 97
  are unchanged.
- Therefore the current TypeScript total is `129 + 97 = `**226**, and the pre-existing 176-test suite is
  fully preserved and still executes (79 → 129 web by expansion, 97 others unchanged; **no earlier suite was
  dropped**). "**398 Foundry**" is unchanged from the Task 7/8 baseline (contracts frozen).

**No earlier suite is missing** → no FAIL on this axis.

**Excluded projects / not run as tests:** `@bps/contracts` has no npm `test` script (its tests run under
Forge). No workspace is skipped by `--if-present`; every TS workspace has `test: vitest run`.

---

## 6. Task 8 acceptance ledger

Legend: **PASS** = implemented on the real application/service path and covered by a named test (and, where
relevant, the Chromium E2E). "Frozen-interface note" flags items where the frozen ABI/getter exists and is
exercised but is not yet surfaced through a dedicated read service or consumed by a component.

| #   | Requirement                                                | Implementation (file · symbol)                                                                                                                                                             | Test (file · exact name)                                                                                                                                                                              | Browser E2E         | Result                 |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------- |
| 1   | Provider-derived chain state                               | `mock-eip1193.ts` `request(eth_chainId)`; `AppDashboard.tsx` `useChainId`                                                                                                                  | `mock-eip1193.test.ts` · "chainChanged: …updates the exposed chain id"; `AppDashboard.test.tsx` · "rejected network switch preserves the wrong-chain state"                                           | ✅                  | PASS                   |
| 2   | Provider actually changes to 4663                          | `mock-eip1193.ts` `wallet_switchEthereumChain` mutates `state.chainId` + emits; `AppDashboard.tsx` `switchChain`                                                                           | `AppDashboard.test.tsx` · "full flow: switch → …"                                                                                                                                                     | ✅ "switch to 4663" | PASS                   |
| 3   | accountsChanged handling                                   | `mock-eip1193.ts` `__setAccounts`→`accountsChanged`                                                                                                                                        | `mock-eip1193.test.ts` · "accountsChanged: updates the selected/exposed account"                                                                                                                      | —                   | PASS                   |
| 4   | chainChanged handling                                      | `mock-eip1193.ts` emit `chainChanged`                                                                                                                                                      | `mock-eip1193.test.ts` · "chainChanged: …"                                                                                                                                                            | ✅                  | PASS                   |
| 5   | disconnect + explicit reconnect                            | `mock-eip1193.ts` `__disconnect`, `eth_requestAccounts` restores                                                                                                                           | `mock-eip1193.test.ts` · "disconnect: exposes no accounts", "reconnect does NOT silently re-establish consent"                                                                                        | —                   | PASS                   |
| 6   | Connected-account typed-data signing + recovery            | `AppDashboard.tsx` `signDeclaration` (`useSignTypedData` + `recoverTypedDataAddress`)                                                                                                      | `mock-eip1193.test.ts` · "the same signature IS accepted for the account that actually signed"; `AppDashboard.test.tsx` full flow                                                                     | ✅                  | PASS                   |
| 7   | Signature/account mismatch rejection                       | `eligibility.ts` `verifyDeclaration`→`wrong-signer`; `AppDashboard.tsx` recovered≠address guard                                                                                            | `mock-eip1193.test.ts` · "a signature recovering to a DIFFERENT account…", "after accountsChanged…no longer matches"                                                                                  | —                   | PASS                   |
| 8   | Declaration and eligibility are separate controls          | `eligibility.ts` `deriveEligibilityState`; `app/demo.ts` `demoEligibilityService`                                                                                                          | `eligibility.test.ts` (14); `AppDashboard.test.tsx` full flow (`elig-state`)                                                                                                                          | ✅                  | PASS                   |
| 9   | Exact approval + post-approval reconciliation              | `wallet/tx.ts` `runActionLifecycle` (exact `amount`, `reread-allowance`)                                                                                                                   | `tx.test.ts` · "runs approve -> … with EXACT approval", "skips approval when allowance already sufficient"                                                                                            | ✅                  | PASS                   |
| 10  | Approval rejection + reverted approval                     | `tx.ts` approve `catch`; `await-approval` receipt status                                                                                                                                   | `tx.test.ts` · "surfaces a rejected APPROVAL at the approve step", "fails when the APPROVAL receipt reverts"                                                                                          | —                   | PASS                   |
| 11  | Allowance-reconciliation failure                           | `tx.ts` `reread-allowance` guard                                                                                                                                                           | `tx.test.ts` · "fails at reread-allowance when the approval did not raise the allowance"                                                                                                              | —                   | PASS                   |
| 12  | Simulation failure                                         | `tx.ts` `simulate` `catch`                                                                                                                                                                 | `tx.test.ts` · "fails on a reverting simulation before submitting"                                                                                                                                    | —                   | PASS                   |
| 13  | Stale quote                                                | `trade.ts` `tradeSubmissionGate`→`stale-quote`                                                                                                                                             | `trade.test.ts` · "submission gate fails closed on each missing condition" (`quoteFresh:false`)                                                                                                       | —                   | PASS¹                  |
| 14  | Expired deadline                                           | `trade.ts` `tradeSubmissionGate`→`deadline-expired`                                                                                                                                        | `trade.test.ts` · same gate test (`deadline:500n`)                                                                                                                                                    | —                   | PASS¹                  |
| 15  | Wallet rejection                                           | `tx.ts` submit `catch`→`user-rejected`                                                                                                                                                     | `tx.test.ts` · "surfaces wallet rejection at submit"                                                                                                                                                  | —                   | PASS                   |
| 16  | Confirmed replacement                                      | `tx.ts` `waitConfirmed` `onReplaced` (repriced→follow receipt)                                                                                                                             | `tx.test.ts` · "follows a repriced replacement to its confirmed receipt and succeeds"                                                                                                                 | —                   | PASS                   |
| 17  | Cancelled replacement                                      | `tx.ts` `waitConfirmed` cancelled→failure                                                                                                                                                  | `tx.test.ts` · "treats a CANCELLED replacement as a failed action (never success on a hash)"                                                                                                          | —                   | PASS                   |
| 18  | Reverted action receipt                                    | `tx.ts` `await-receipt` status≠success                                                                                                                                                     | `tx.test.ts` · "fails on a reverted receipt"                                                                                                                                                          | —                   | PASS                   |
| 19  | Confirmation-depth waiting + failure                       | `tx.ts` `confirmations`; `waitConfirmed` confirm-error                                                                                                                                     | `tx.test.ts` · "honors a confirmation depth greater than 1 and still reconciles", "fails closed on a confirmation error (e.g. wait timeout)"                                                          | —                   | PASS                   |
| 20  | Final-state reconciliation failure                         | `tx.ts` `reconcile` step                                                                                                                                                                   | `tx.test.ts` · "fails at reconcile when the confirmed state does not match (never success on hash alone)"                                                                                             | —                   | PASS                   |
| 21  | Trades only target BPSTradeRouter                          | `trade.ts` `buildTradePreview` `target=tradeRouter` + `assertOfficialRoute`; `AppDashboard.tsx` uses `preview.target` for simulate+approval                                                | `trade.test.ts` · "assertOfficialRoute rejects a non-router target (e.g. SwapRouter02)"                                                                                                               | ✅                  | PASS                   |
| 22  | Real connector-driven locking + reconciliation             | `AppDashboard.tsx` `LockPanel.runLock` (`connectorWallet`; reconcile `lockedPrincipal`)                                                                                                    | `AppDashboard.test.tsx` full flow (lock→1500.000 reconciled)                                                                                                                                          | ✅                  | PASS                   |
| 23  | Real connector-driven partial withdrawal + reconciliation  | `AppDashboard.tsx` `runWithdraw` (`withdraw(lockId)`; reconcile)                                                                                                                           | `AppDashboard.test.tsx` full flow (withdraw→500.000; button disabled)                                                                                                                                 | ✅                  | PASS                   |
| 24  | Authoritative cycle + claim-manager reads                  | `reads.ts` `readCycle`/`readAssetFunding`/`readClaimUsed`/`readClaimRemaining`; `claim-validation.ts` `validateClaimReadiness` (wired `AppDashboard.tsx:603`)                              | `reads.test.ts` (authoritative reads); `claim-validation.test.ts` (8)                                                                                                                                 | ✅                  | PASS                   |
| 25  | `cycleUsed` + `cycleAcquisitionId` reads (where supported) | Present in `abis.ts` (`distributionFundingCoordinatorAbi`) and exercised by `mock-rpc.ts` `handleCall`; **no read-service wrapper, no component consumer**                                 | — (no dedicated service test; ABI shape only)                                                                                                                                                         | —                   | Frozen-interface note² |
| 26  | Acquisition + funding-record reads                         | App path: event-derived `transparency-reads.ts` (`AcquisitionRecorded`/`Funded`) in `TransparencyPanel`. Authoritative getter `reads.ts` `readAcquisition` tested but **not app-consumed** | `transparency-reads.test.ts`; `reads.test.ts` · "reads authoritative acquisition record via acquisitions()"                                                                                           | ✅ (events)         | PASS³                  |
| 27  | Current root cannot be overridden by an old event          | `claim-validation.ts` compares artifact root to `readCycle` (current on-chain root)                                                                                                        | `claim-validation.test.ts` · "an OLD event root cannot override a CHANGED current cycle root"                                                                                                         | —                   | PASS                   |
| 28  | Complete artifact/leaf/proof/claim-state validation        | `AppDashboard.tsx` verify (version/chain/manager/account) + `validateClaimReadiness` + `claim.ts` `verifyClaim` (leaf/proof)                                                               | `claim.test.ts` (6); `claim-validation.test.ts` (8)                                                                                                                                                   | ✅                  | PASS                   |
| 29  | Oracle heartbeat/staleness/sequencer/grace                 | `oracle-reads.ts` `readFeed`/`readSequencer` + `oracle.ts` `evaluateFeed`                                                                                                                  | `oracle-reads.test.ts` · "a stale updatedAt…", "reads the sequencer as DOWN…", "enforces the sequencer grace period…"                                                                                 | —                   | PASS⁴                  |
| 30  | `oraclePaused` + multiplier config                         | `oracle-reads.ts` `readFeed.oraclePaused`; `oracle.ts` `config.multiplier`                                                                                                                 | `oracle-reads.test.ts` · "propagates oraclePaused() = true", "carries the per-token multiplier into the priced verdict"                                                                               | —                   | PASS⁴                  |
| 31  | Event-derived buy/sell/burn/budget metrics                 | `transparency-reads.ts` `aggregate` + `transparency.ts`; `TransparencyPanel` (`tx-sellvol`, `tx-repurchase-burn`, `tx-budget-delivered`)                                                   | `transparency-reads.test.ts` · "decodes OfficialSell…", "decodes BpsRepurchasedAndBurned…", "decodes StockBudgetDelivered…"                                                                           | ✅                  | PASS                   |
| 32  | Acquisition, 80/20, funding + claim linkage                | `transparency.ts` `buildTransparencyReport` (`splitReconciles`, cycle linkage)                                                                                                             | `transparency.test.ts` · "acquisition row reconciles 80/20 and links to its cycle"; `transparency-reads.test.ts` linkage cases                                                                        | ✅                  | PASS                   |
| 33  | Log chunking/overlap/dedup/confirmation exclusion          | `reads.ts` `getLogsChunked`/`dedupeLogs`; `mock-rpc.ts` `eth_getLogs` range filter                                                                                                         | `transparency-reads.test.ts` · "dedupes across overlapping ranges", "excludes logs within the confirmation depth end-to-end (fetchTransparency)", "deduplicates identical (block, tx, logIndex) logs" | —                   | PASS                   |
| 34  | Full deterministic Chromium workflow                       | `e2e/flow.spec.ts`                                                                                                                                                                         | `playwright test` — 1 passed                                                                                                                                                                          | ✅                  | PASS                   |
| 35  | Live controls disabled without valid production config     | `AppDashboard.tsx` `writesAllowed(demoDeployment)`=false; not-live banner; `live-trade` disabled                                                                                           | `AppDashboard.test.tsx` · "before connect: protocol-not-live, disabled live writes, fixture label"                                                                                                    | ✅                  | PASS                   |

**Ledger result: 33 full PASS; item 26 PASS with note; item 25 recorded as a frozen-interface note.** No FAIL.

¹ Items 13/14 are enforced by the app-core `tradeSubmissionGate` and its test. In the current build the live
submission path that consumes the gate is disabled (`writesAllowed`=false); the demo trade button exercises
the lifecycle against the mock. Correct and fail-closed, but the gate is not on an active live path yet.
² Item 25: `cycleUsed`/`cycleAcquisitionId` are present in the ABI and answered by the deterministic mock,
but there is **no `readCycleUsed`/`readCycleAcquisitionId` service and no component consumer**. Acceptance
says "where supported"; this is not a defect but is not a PASS-with-app-path. Recorded as finding L-2.
³ Item 26: the application surfaces acquisition/funding/claim linkage via **decoded events** (app-wired in
`TransparencyPanel`). The authoritative coordinator getter `readAcquisition` is implemented and unit-tested
but not consumed by a component. See finding L-2.
⁴ Items 29/30: the oracle layer is a **read/operator-policy boundary** (service + pure model with tests). By
design it is not consumed by a browser write path — acquisitions/`minStockOut` are an operator/server-side
concern — so it is PASS at the service+model level, not wired to a live in-browser action.

---

## 7. Contract security review (frozen layer)

The production contracts are byte-identical to `90e338a` (§4) and are covered by the 398-test Foundry suite,
including hostile/fuzz/security suites (`RialtoAdapterSecurity`, `RialtoAdapterHostile`, `CoordinatorFunding`,
`CoordinatorFundingRollback`, `DeployConfigValidation`, `RouterFuzz`, `LockingFuzz`, `Fuzz`, `Claims`,
`RecoveryAccounting`, `SwapAdapterFuzz`, `RialtoEndToEnd`). Manual spot-verification of the highest-risk
mechanisms (evidence cited):

- **Reentrancy & external-call ordering:** all seven production contracts import/apply
  `ReentrancyGuard` and OpenZeppelin `SafeERC20`. `DistributionClaimManager.claim()` follows
  checks-effects-interactions: it reverts on `AlreadyClaimed`, verifies the Merkle proof and remaining
  liability, then sets `claimed[cycleId][claimant][asset] = true`, updates `af.claimed`/`totalOutstanding`,
  and only then performs `IERC20(asset).safeTransfer` (source lines ~253–269).
- **Double-claim prevention:** the `claimed[cycle][claimant][asset]` mapping guard + effects-before-transfer
  ordering (above); covered by `Claims.t.sol` and `Fuzz.t.sol` (`testFuzz_WrongAmountFails`,
  `testFuzz_WrongClaimantFails`, claim-window fuzz).
- **Cycle reuse / acquisition linkage:** `DistributionFundingCoordinator` enforces
  `RECORDED → FUNDED` transitions with `if (rec.status != RECORDED) revert AcquisitionNotRecorded`,
  `if (cycleUsed[cycleId]) revert CycleAlreadyUsed`, then sets `cycleUsed[cycleId]=true` and
  `cycleAcquisitionId[cycleId]=acquisitionId` (one acquisition per cycle; no split/recombine/replay).
  Covered by `CoordinatorFunding` + `CoordinatorFundingRollback` (19 + rollback tests).
- **Burn accounting:** the router's 1%/2% burn is a **true `totalSupply` reduction** via
  `IBPSBurnable(address(bpsToken)).burn(burned)` (BPSTradeRouter.sol:406), not a transfer-to-dead-address.
- **Exact 80/20 & budget accounting:** the acquired-stock split (80% distribution floor + 20% reserve +
  rounding remainder) is enforced in `StockAcquisitionVault` and reconciled from observed balance deltas;
  covered by the vault suites and `RialtoEndToEnd` (acquisition = distribution + reserve; allowances/residues
  return to zero).
- **Locked-principal accounting & withdrawal:** `BPSLockingVault` keeps `_positions` internal, tracks
  `lockedPrincipal[account]` and `totalLockedPrincipal`, "preserves principal exactly," and never mints or
  burns BPS — it only holds and returns locked principal; covered by the locking suites + `LockingFuzz`.
- **Official-route enforcement / adapter safety:** `RialtoStockAcquisitionAdapter` is chain-4663-guarded and
  registry-locked; `UniswapV3BPSSwapAdapter` routes a single `exactInputSingle`, verifies recipient
  balance-delta, clears approvals, and rejects residuals; covered by the adapter security/hostile suites.
- **DoS / malformed-token risk:** hostile/fee-on-transfer/false-return mocks
  (`HostileFundingManager`, `AllowanceTrapERC20`, `RialtoAdapterHostile`) exercise rollback and rejection
  paths.

No new contract finding was identified. **This is not a substitute for an independent contract audit** (§14).

---

## 8. Deployment-system review (Task 7, unchanged since `cd98df3`)

Reviewed as evidence only (no change since `cd98df3`; §4). `script/BPSDeployment.sol` + `script/DeployBPS.s.sol`

- `deploy/` (schema, dry-run manifest, runbook) provide a fail-closed deployment package validated by
  `DeployConfigValidation.t.sol` (13 tests) and `ForkDeployRehearsal.t.sol`:

* **Deterministic addresses:** `testPredictionMatchesCreateAddressAndIsDistinct`,
  `testPredictionChangesWithNonce` (predicted vs `CREATE` address).
* **Chain ID / code validation:** `testWrongChainReverts`, `testNoCodeExternalReverts`.
* **Fail-closed config:** placeholder role/zero-address/empty-or-duplicate-basket/WETH-alias reverts
  (`testPlaceholderRoleReverts`, `testZeroWethReverts`, `testEmptyBasketReverts`, `testBasketDuplicateReverts`,
  `testRoleAliasesSystemReverts`, `testValidConfigPasses`).
* **Fork rehearsal:** `ForkDeployRehearsal.t.sol` proves deterministic wiring against real externals and
  **skips gracefully without `ROBINHOOD_FORK_RPC`** (opt-in; not run here — no production RPC access is
  authorized). No production address was invented in this review.

Manifest versioning, deployment-block/confirmation-depth semantics, and predicted-vs-deployed checks are
present in the package and covered by the above. Deployment remains **blocked** on external inputs (§14).

---

## 9. Application and wallet review (`@bps/web`)

- **Connector-only signing/sends:** no production module constructs a wallet client — `git grep createWalletClient`
  over `app/` + non-testing `lib/` (excluding tests) is **empty**. The app obtains a wallet exclusively via
  `getConnectorClient(config).extend(walletActions)` (`AppDashboard.tsx:62`) and signs via `useSignTypedData`
  (`AppDashboard.tsx:71,97`). Trade/lock/withdraw/claim all run `runActionLifecycle` through that connector
  client.
- **Connector-selected account enforcement / chain & account changes:** the mock provider emits
  `accountsChanged`/`chainChanged`/`disconnect`; signatures are re-verified against the connected account,
  and a signature recovering to a different account is rejected (`verifyDeclaration` → `wrong-signer`).
  Covered by `mock-eip1193.test.ts` (9) and `AppDashboard.test.tsx`.
- **Declaration replay / domain separation:** `verifyDeclaration` checks chain, document version/hash,
  expiry, and nonce replay (`usedNonces`) before signer recovery (`eligibility.ts`); 14 eligibility tests.
- **Eligibility bypass resistance:** `deriveEligibilityState` keeps a valid signature and eligibility as
  **separate** gates — signing alone never yields `eligible`.
- **Exact approval / stale quote / deadline / replacement / reconciliation:** covered in the ledger
  (items 9–20). Success is never reported from a transaction hash alone (post-confirmation `reconcile`),
  and mempool replacement is handled via viem `onReplaced` (cancelled → failure).
- **Proof-artifact tampering & authoritative claim state:** `validateClaimReadiness` reads current
  `cycles()`/`assetFunding()`/`claimed()`/`remaining()` + manager balance and compares the artifact root to
  the **current** on-chain root; a stale event root cannot authorize a claim (item 27).
- **Event-log poisoning / inconsistent linkage:** `decodeLogs` dedupes by `(block,tx,logIndex)`, rejects
  malformed logs and non-matching topics, and excludes logs inside the confirmation depth; inconsistent
  linkage yields no acquisition row (items 33, 26).
- **Fail-closed production controls:** `writesAllowed(demoDeployment)` is `false` (fixture manifest), the
  not-live banner renders, `live-trade` is disabled, and all data is labeled fixture (`FIXTURE_LABEL`).

**Server/browser trust boundary:** the app currently wires the local deterministic mock config by default
(`providers.tsx` → `wagmi-local.ts` → `createLocalWagmiConfig`), which is why `lib/testing/*` (including the
mock provider and its label-derived key) appears in the demonstration browser bundle. This is expected for a
labeled non-live demo but is a canary entry condition (finding **L-1**).

---

## 10. Rialto / server-boundary review

- **Server-only imports:** `fetchRialtoAllowanceQuote` is reachable only through the `@bps/rialto/server`
  subpath; the main `@bps/rialto` barrel does not re-export it (structurally asserted by the package's
  `index.test.ts`). The `@bps/web` browser code does not import it (see §11).
- **API-key handling:** the quote client reads `RIALTO_API_KEY` **server-side only** (never `NEXT_PUBLIC_*`),
  and never returns or logs it. Not read or used by this audit.
- **Allowance settlement / quote binding / route & target validation / min-output & deadline / malformed
  simulation:** `fetchRialtoAllowanceQuote` forces `chain_id=4663`, `settlement=allowance`,
  `sell_token=WETH`, `taker=adapter`, no `swap_fee_bps`, no Permit2/gasless; validates chain, settlement,
  tokens, exact amount, taker, non-zero `tx.to`, bounded `tx.data`, `tx.value==0`, `min_buy_amount>0`,
  `issues.balance==null`, complete simulation, and `allowance spender == tx.to`, failing closed. Covered by
  30 `@bps/rialto` tests (mocked fetch + boundary). On-chain, `RialtoStockAcquisitionAdapter` re-validates
  registry-locked target, exact-input WETH consumption, observed-delta minimum, and atomic revert.
- **No live request** was made; `RIALTO_API_KEY` was never read.

---

## 11. Secret and browser-bundle scans

| Scan                                                    | Method                                                                             | Result                                                                                                                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RIALTO_API_KEY` in tracked source/docs                 | `git grep RIALTO_API_KEY`                                                          | Only `.env.example` (empty placeholder), documentation (HANDOVER/README/RUNBOOK/dry-run), and `rialto-boundary.test.ts` (asserts it is **forbidden** in the browser barrel). **No secret value.** ✅ |
| `RIALTO_API_KEY` in built bundle                        | `grep -r apps/web/.next/static`                                                    | **absent** ✅                                                                                                                                                                                        |
| `fetchRialtoAllowanceQuote` in built bundle             | `grep -r apps/web/.next/static`                                                    | **absent** ✅                                                                                                                                                                                        |
| `@bps/rialto/server` / quote client in built bundle     | `grep -r apps/web/.next/static`                                                    | **absent** ✅                                                                                                                                                                                        |
| Private key / mnemonic / credentials in production code | `git grep` for key imports + 64-hex over `app/` + non-testing `lib/` (excl. tests) | **none** — the only 64-hex hits are `runtimeCodeHash`/`merkleRoot` values in `fixtures.ts` (hashes, not keys) ✅                                                                                     |
| Deterministic test key confined to mock/test            | import-graph trace                                                                 | `local-account.ts` is imported **only** via `lib/testing/local-env.ts` → `mock-eip1193.ts`; no production `app/`/`lib` module imports it directly ✅                                                 |

**Nuance (finding L-1):** because the app defaults to `createLocalWagmiConfig`, the mock provider and the
throwaway key label (`bps-task8b-local-test-wallet`) + `createMockEip1193Provider` **do** appear in the
current demonstration `.next/static` bundle. This key is `keccak256` of a public label string, controls no
assets, and is used only in a live-writes-disabled demo — so it is **not** a secret exposure. It nonetheless
means the "cannot enter a production bundle" property is only satisfiable once a real-injected-wallet
production config replaces the default wiring and `lib/testing/*` is excluded (canary entry condition).

**Additional confirmations:** no fixture is presented as live (not-live banner + `FIXTURE_LABEL` everywhere);
no production component imports a local test account or constructs a separate wallet client; all signatures
and sends use the connector; no protected Rialto endpoint was called; no live RPC write occurred.

---

## 12. Findings by severity

**Critical:** none. **High:** none. **Medium:** none.

**Low**

- **L-1 — App defaults to the local mock wallet config; demo bundle includes `lib/testing/*` + the throwaway
  key.** Evidence: `app/providers.tsx` → `app/wagmi-local.ts` (`createLocalWagmiConfig(makeDemoState())`);
  `bps-task8b-local-test-wallet` and `createMockEip1193Provider` present in `apps/web/.next/static`. Impact:
  no real-injected-wallet production path is wired yet; the demonstration bundle ships the mock provider and a
  public label-derived, asset-less key. **Blocks restricted deployment?** Not the current labeled demo, but it
  **is** a required entry condition before any real-wallet canary. Recommended action: before canary, wire a
  production wagmi config that uses the user's injected wallet and a production manifest, and exclude
  `apps/web/lib/testing/*` from the production build; verify the built bundle contains no mock provider/key.

- **L-2 — Authoritative coordinator getters not surfaced/consumed.** `cycleUsed`/`cycleAcquisitionId` exist in
  `abis.ts` and are answered by the mock but have no read-service wrapper or component consumer; `readAcquisition`
  is implemented + unit-tested but not consumed by a component (the app uses event-derived acquisition data).
  Impact: acceptance items 25/26 rely on the event path for the UI while the authoritative getters are
  available but idle. **Blocks restricted deployment?** No. Recommended action: either wire the authoritative
  getters into the transparency/claim views for defense-in-depth, or record explicitly that acquisition
  transparency is intentionally event-derived.

**Informational**

- **I-1 — `forge coverage` unsupported in the current config.** Under coverage instrumentation, Forge fails to
  resolve OpenZeppelin's relative imports given this project's remapping + hoisted-root `allow_paths`
  (`error: file ../../utils/Context.sol not found`). Normal `forge build`/`forge test` compile and pass. This
  is a known tooling limitation, not a code defect. Coverage was optional/conditional and is not required by
  the gate. Recommended action (optional): add a coverage-mode remapping or local OZ copy if line-coverage
  metrics are later desired.

- **I-2 — Oracle layer is a read/operator-policy boundary, not a live in-browser gate.** Items 29/30 are
  service+model with tests; by design the oracle/`minStockOut` policy is an operator/server-side concern and
  is not on a browser write path. No action for the demo; relevant when the live acquisition/operator flow is
  built.

No speculative issue is reported as a confirmed vulnerability.

---

## 13. Code-readiness verdict (by layer)

| Layer                              | Verdict                              | Basis                                                                                                                                                         |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen protocol code               | **READY (code)**                     | Byte-unchanged since `90e338a`; 398 Foundry tests pass, 0 skipped; security mechanisms verified (§7). External audit still required (§14).                    |
| Task 7 deployment system           | **READY (code), BLOCKED (external)** | Unchanged since `cd98df3`; fail-closed config validated (13 tests) + fork rehearsal; requires real addresses/RPC/authorization (§14).                         |
| Task 8 application                 | **READY (code)**                     | 33/35 ledger PASS + 2 notes; 226 TS + 1 E2E pass; fail-closed, connector-only, no secret leakage. Finding L-1 is a canary entry condition, not a demo defect. |
| Deterministic deployment-rehearsal | **READY to run (opt-in)**            | `ForkDeployRehearsal` present; requires `ROBINHOOD_FORK_RPC` (read-only) — not run here.                                                                      |
| Restricted canary                  | **BLOCKED**                          | Requires L-1 (production wallet config), production manifest/declaration/eligibility/proof configs, and the external inputs in §14.                           |
| Public / unrestricted launch       | **BLOCKED**                          | Requires all of the above plus audit, legal, liquidity/valuation/float, and founder authorization.                                                            |

---

## 14. External blockers (outside this repository)

Production must remain blocked pending the applicable external inputs:

1. Independent third-party smart-contract audit (and, ideally, formal verification of the claim/coordinator/
   vault invariants).
2. Legal and jurisdiction/eligibility approval (Robinhood Stock Tokens carry jurisdiction limits); a
   governance/legal-final EIP-712 declaration domain (the in-repo one is a labeled scaffold).
3. Rialto production approval, terms, and a server-only production credential.
4. Finalized role/admin addresses and the wallet-control/custody model.
5. Source-backed Stock-Token and Chainlink oracle/sequencer configuration (feed proxies, heartbeats,
   multipliers) — no production address may be invented.
6. Final liquidity, valuation, and public-float decision. The earlier **$1M FDV / 1.25% float proposal is NOT
   accepted** and remains an open launch input.
7. Restricted participant list.
8. Production RPC endpoints and monitoring/alerting.
9. Explicit founder authorization to proceed.

---

## 15. Required user inputs (to unblock, in likely order)

1. Commission the independent contract audit; triage/resolve its findings on the frozen layer.
2. Provide legal-approved declaration domain + eligibility policy and the jurisdiction gating decision.
3. Provide Rialto production terms + server-only credential handling plan (never in-browser).
4. Provide finalized deployer/role/admin addresses and the basket/Stock-Token + oracle config (source-backed).
5. Decide liquidity/valuation/float; provide the restricted participant list.
6. Provide production RPC + monitoring; give explicit go/no-go authorization.

---

## 16. Task 10 entry conditions

Task 10 (or a restricted rehearsal) should not begin until all of the following hold:

1. This Task 9 report is accepted.
2. An independent contract audit has been completed and its findings resolved on the frozen layer.
3. Finding **L-1** is resolved: a production wagmi config using the user's injected wallet replaces the
   default mock wiring, `apps/web/lib/testing/*` is excluded from the production build, and a rebuilt bundle
   is re-scanned clean of the mock provider/key.
4. A real, same-commit, broadcast-ready deployment manifest (with runtime-code hashes) exists and the
   production declaration/eligibility/proof-artifact configs are supplied (no longer fail-closed scaffolds).
5. External blockers §14 items 1–9 are satisfied or explicitly waived by the founder in writing.
6. The deterministic fork rehearsal has been run against a read-only production RPC and passes.

A Task 9 PASS does **not** by itself authorize any of the above.

---

## 17. Exact commands and results

```
git rev-parse --abbrev-ref HEAD                → master
git rev-parse HEAD                             → 8c97add3bde3ed287822ab1b07db25df878e5e03
git rev-parse HEAD~1                            → 26b7febf3977285ae77266ca124b9da4277cc78f
git remote -v                                  → (empty; nothing pushed)
node --version / npm --version / git --version → v24.18.0 / 11.16.0 / 2.55.0.windows.2
forge --version                                → 1.7.1 (4072e48705…)

git diff 90e338a..HEAD -- packages/contracts/src/**/*.sol packages/contracts/src/*.sol → EMPTY
git diff cd98df3..HEAD -- packages/contracts                                            → EMPTY
git diff 90e338a..HEAD -- packages/shared/src                                           → EMPTY
git diff cd98df3..HEAD -- packages/contracts/script packages/contracts/deploy           → EMPTY
git diff 26b7feb..HEAD -- **/package.json package.json package-lock.json                → EMPTY

forge fmt --check     → PASS
forge build           → PASS (no files changed, compilation skipped)
forge test            → 398 passed, 0 failed, 0 skipped (42 suites)
forge coverage        → NOT SUPPORTED in current OZ remapping config (import-resolution error); build/test OK (finding I-1)

vitest run @bps/web    → 129 passed (17 files), 0 skipped
vitest run @bps/shared → 52 passed (8)
vitest run @bps/pilot  → 12 passed (2)
vitest run @bps/rialto → 30 passed (2)
vitest run @bps/indexer/@bps/worker/@bps/db → 1 + 1 + 1 passed
TypeScript total       → 226 passed, 0 skipped

playwright test        → 1 passed (Chromium, production build on :3100)
npm run check          → exit 0 (format:check + lint + typecheck + test[all workspaces] + build[incl. next build] + fmt:contracts + build:contracts + test:contracts)
npm ls                 → healthy (only OPTIONAL cross-platform native deps unmet; exit 0)
git diff --check       → clean
```

`git show --stat --oneline 8c97add` — 20 files changed, 1750 insertions(+), 116 deletions(-) (all under
`apps/web/` + `HANDOVER.md`/`README.md`).

---

## 18. git status and commit evidence

- Before this report: `git status --short` empty; working tree clean; no untracked source files.
- After all validation runs: `git status --short` empty (no test wrote tracked files).
- This audit created exactly one new file, `docs/audit/TASK_9_RELEASE_READINESS.md`, staged and committed
  alone. No application, contract, deployment, test, package, or configuration file was modified.
- HEAD `8c97add` was **not** amended; nothing was pushed (no remote configured).

(Commit hash + staged diff evidence are appended to the return summary accompanying this report.)

---

## 19. Confirmation of no live side effects

During this audit: **no** live wallet access, **no** real signature or transaction, **no** deployment or
broadcast, **no** production RPC write, **no** protected Rialto request, **no** read or use of
`RIALTO_API_KEY`, **no** pool creation or liquidity action, and **no** production address was invented. All
execution was local: Git inspection, local Vitest/Forge/Playwright (against the deterministic mock provider
and a local production web build on `localhost:3100`), and read-only scans. The `ForkDeployRehearsal` opt-in
was **not** run (no production RPC).

---

## 20. This review is not an independent external audit

This is an internal engineering release-readiness review. It does **not** replace, and must not be
represented as, an independent third-party smart-contract security audit, a formal verification effort, or a
legal / jurisdiction / eligibility review. A PASS (or PASS WITH EXTERNAL BLOCKERS) here does **not** authorize
Task 10, deployment, pool creation, liquidity provision, public launch, or the separate launchpad project.
Those remain gated on the external inputs in §14 and explicit founder authorization.
