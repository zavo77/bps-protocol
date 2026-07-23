# HANDOVER — BPS Experiment

Last updated: 2026-07-22 (local machine time; verification timestamps below are from command output).
The combined beta-first milestone — **TASK 6B-2** (`RialtoStockAcquisitionAdapter` + a server-only
Rialto quote client) + the **`DistributionFundingCoordinator`** + a **complete local end-to-end flow**
(router buy → Rialto stock acquisition → 80/20 split → reserve delivery → distribution funding →
proof-based claim) — is implemented and fully tested under Forge 1.7.1, on top of the committed TASK
6B-1B commit. All assets, addresses, adapters, quotes, and executions are **fictional and local-only**;
nothing is deployed or connected to any network, **no Rialto API is called and no credential/API-key is
read, used, or exposed**, no RPC/wallet/VPS is touched, no pool or liquidity is created, and no real
trade/swap/acquisition/claim executes outside the local Foundry test VM. **Nothing is deployable yet**
— unresolved verified addresses (WETH, BPS, stock tokens, the current feature-2 Rialto router, the
BPS/WETH pool + fee tier), the circular deterministic deployment sequence, a price/oracle slippage
guard, operational controls, and legal/eligibility review all remain (see §11). Production frontend
work has **not** begun.

## 1. Project snapshot

This repository contains the monorepo foundation (TASK 1), the canonical fixed-supply `BPSToken`
ERC-20 (TASK 2), a deterministic mock-asset Proof-of-Distribution engine (TASK 3), the
`DistributionClaimManager` claim contract (TASK 4), the `BPSLockingVault` locking contract
(TASK 5), and the `BPSTradeRouter` official trade router (TASK 6A). The PoD engine turns a
validated cycle fixture into canonical artifacts (15-minute-epoch TWAB, veBPS weights, 80/20 split,
floor allocations, a StandardMerkleTree, reconciliation) with integer-only, byte-reproducible
output. `DistributionClaimManager` consumes that Merkle standard on-chain (owner publishes-and-funds
immutable per-cycle roots; participants claim; anyone sweeps unclaimed funds post-deadline to an
immutable recipient). `BPSLockingVault` lets users lock real BPS for one of four fixed terms
(7/14/21/30 days) and exposes deterministic non-transferable reward weight (veBPS) under the frozen
`vebps-1` policy. `BPSTradeRouter` is the official BPS trade core: an official buy applies a 3%
allocation (2% WETH stock-acquisition budget + 1% BPS repurchase-and-burn, 97% to the user) and an
official sell applies a 4% allocation (2% stock + 2% burn, 96% to the user, computed from **actual**
WETH proceeds); the burn is a **true `totalSupply` reduction**. `StockAcquisitionVault` (TASK 6B-1A)
is the production-shaped custody sink intended to be the router's immutable `stockBudgetRecipient`:
it holds the 2% WETH stock-acquisition budget and, on the authority of a single immutable executor,
converts exact WETH into an approved stock token through an immutable `IStockAcquisitionAdapter`,
then applies a frozen 80/20 split — 80% (floored) retained as the distribution allocation (releasable
only to an immutable `DistributionFundingCoordinator` placeholder) and the remaining 20% plus the
entire rounding remainder delivered to an immutable reserve recipient. It verifies exact WETH spend
and the observed stock-balance delta against the adapter's report, and has no owner, pause, sweep,
withdrawal, arbitrary-call, or upgrade surface. All economics/token/adapter/recipient/basket wiring
is immutable. `UniswapV3BPSSwapAdapter` (TASK 6B-1B) is the production `IBPSSwapAdapter` for the
router: a narrow, non-upgradeable adapter that routes each frozen BPS↔WETH leg through exactly one
Uniswap v3 pool via a single `SwapRouter02.exactInputSingle` call. Everything is immutable (calling
router, BPS/WETH pair, SwapRouter02 target, pool fee); it enforces the deadline itself (SwapRouter02's
params carry none), delivers output directly to the caller-supplied recipient, and independently
verifies the recipient's observed balance delta (== the venue report and >= the minimum) plus no new
net residual BPS/WETH custody, cleared approvals, and rejected recipient sentinels — with no arbitrary
path/calldata/target/fee, no owner/setter/pause/sweep/rescue/withdrawal, and no delegatecall/proxy/
upgrade. `RialtoStockAcquisitionAdapter` (TASK 6B-2) is the production `IStockAcquisitionAdapter`: it
acquires an approved stock token for the vault by executing a Rialto **allowance-settlement** quote's
unmodified calldata against the current registry-locked feature-2 router, then forwards the acquired
stock to the vault — safe via registry-locked target, exact-input WETH consumption, observed-delta
minimum, no residual custody, cleared approval, and atomic revert, with no owner/setter/sweep/rescue/
withdrawal/Permit2/gasless/Universal-Router/delegatecall/proxy/upgrade, and is deployable **only on
Robinhood Chain** (its constructor reverts unless `block.chainid == 4663`).
`DistributionFundingCoordinator` occupies **both** of the frozen vault's immutable roles — it is the
vault's `acquisitionExecutor` **and** its `distributionFundingCoordinator` (the frozen constructor
permits `acquisitionExecutor == distributionFundingCoordinator`; the executor is only zero-checked,
never rejected for aliasing the coordinator). As the vault's sole executor it is the only contract that
can move the acquisition counters, so it drives each acquisition through the vault (which uses the
Rialto adapter), **records it atomically from the vault's exact before/after cumulative deltas**,
assigns a monotonic acquisition id (NONE→RECORDED), and later (RECORDED→FUNDED) releases-and-funds
exactly that acquisition's recorded 80% once, bound to one claim-cycle id — no caller-selected token or
amount, and one acquisition id per cycle id (no splitting, recombination, reassignment, or replay). A
**server-only** Rialto quote client
(`@bps/rialto`) forces `chain_id=4663`/`settlement=allowance`/no-integrator-fee/no-Permit2/no-gasless,
validates the full response, and returns only sanitized execution fields — it reads `RIALTO_API_KEY`
server-side only, never exposes or logs it, and makes no live request in this milestone. A complete
local end-to-end Foundry test proves the whole flow. **Eight contracts + one server client are
implemented and tested but NOT deployed.** **Still unimplemented / out of scope**: production frontend,
transferable veBPS, eligibility contract, the 15-minute epoch indexer / TWAB aggregation, database, a
price/oracle slippage guard, and any deployment. Economics is **BPS-ECON-2.0** (WETH allocation) plus
the frozen 80/20 (acquired-stock split) only. Current execution target: resolve the §11 blockers before
any deployment; do not begin frontend or deployment work (see §13).

## 2. Repository map

- `apps/web` — `@bps/web`. Next.js 16.2.11 (App Router). **TASK 8 restricted-beta interface.** A
  fail-closed dashboard (`app/page.tsx`, `app/layout.tsx`, `app/globals.css`) driven by a tested,
  dependency-free application core under `apps/web/lib/`: `manifest.ts` (deployment-manifest boundary),
  `economics.ts` (frozen BPS-ECON-2.0 math), `eligibility.ts` (wallet+declaration EIP-712 state machine),
  `trade.ts` (official-router-only trade model), `locking.ts`, `claim.ts` (Merkle claim verification),
  `transparency.ts` (provenance-tagged read model), `oracle.ts` (Chainlink read model + minStockOut
  policy), `abis.ts` (hand-written ABIs from the frozen surfaces), `fixtures.ts` (labeled demo data), plus
  `*.test.ts` (application-core vitest tests). **TASK 8B added the real interaction layer on top:**
  `lib/chain.ts` (Robinhood chain + demo chain), `lib/services/{reads,oracle-reads}.ts` (viem
  contract-read + Chainlink read services, transport-injected, fail-closed, chunked/deduped logs),
  `lib/wallet/tx.ts` (approve→simulate→submit→confirm→reconcile lifecycle, exact allowance only),
  `lib/proof/provider.ts` (proof-artifact provider interface + deterministic local provider),
  `lib/config.ts` (versioned declaration config — production null/fail-closed + labeled local-test — and
  an eligibility-service interface + local mock), and `lib/testing/{mock-rpc,local-env,local-account}.ts`
  (deterministic mock JSON-RPC transport + wagmi mock config, local/test only). **TASK 8C/8D** added
  `lib/testing/mock-eip1193.ts` (the authoritative EIP-1193 provider that signs internally + emits
  chain/account/connect/disconnect events, with test-only `__setAccounts`/`__disconnect` controls),
  `lib/services/transparency-reads.ts` (frozen-ABI log decode/aggregate), and `lib/services/claim-validation.ts`
  (`validateClaimReadiness` — authoritative current-cycle claim gate). `app/` is a wagmi + react-query client
  app: `providers.tsx`, `wagmi-local.ts`, `demo.ts`, `AppDashboard.tsx` (wallet / eligibility / trade /
  lock+withdraw / claim / transparency panels). Tests: `lib/**/*.test.ts` (node, incl.
  `services/{reads,oracle-reads,transparency-reads,claim-validation}.test.ts`, `wallet/tx.test.ts`,
  `testing/mock-eip1193.test.ts`) + `app/AppDashboard.test.tsx` (jsdom component/integration) +
  `e2e/flow.spec.ts` (Playwright, real Chromium). The app resolves a fixture manifest → live writes disabled; the full flow runs against the
  mock provider/transport; all fixtures labeled. **Deferred (documented blockers):** no accepted
  production EIP-712 declaration domain (local-test scaffold only), no production eligibility service
  (interface + local mock), no production proof-artifact service (local provider), and the wrong-network
  demo is UI-simulated (the wagmi mock connector does not surface a real cross-chain switch).
- `apps/indexer` — `@bps/indexer`. TypeScript service stub. `src/index.ts` prints health JSON and
  exits (no long-running behavior). `src/health.ts` exports `getHealthStatus()`;
  `src/health.test.ts` covers it.
- `apps/worker` — `@bps/worker`. Identical stub pattern to the indexer.
- `packages/contracts` — `@bps/contracts`. Foundry project: `foundry.toml` (solc 0.8.26,
  remapping to npm-installed OpenZeppelin, `allow_paths` for the hoisted root `node_modules`).
  Sources: `src/BPSToken.sol` (canonical fixed-supply ERC-20, frozen/unchanged),
  `src/DistributionClaimManager.sol` (funded immutable Merkle claim manager, frozen/unchanged),
  `src/BPSLockingVault.sol` (fixed-term BPS locking / `vebps-1` policy),
  `src/BPSTradeRouter.sol` (official BPS trade router / `BPS-ECON-2.0`, TASK 6A),
  `src/StockAcquisitionVault.sol` (multi-asset WETH→stock custody + 80/20 split, TASK 6B-1A),
  `src/adapters/UniswapV3BPSSwapAdapter.sol` (production direct Uniswap v3 SwapRouter02 BPS/WETH
  adapter, TASK 6B-1B), `src/interfaces/IBPSSwapAdapter.sol` (the exact-input swap-adapter boundary the
  router calls), `src/interfaces/IBPSBurnable.sol` (the `burn(uint256)` self-burn the router invokes on
  BPSToken), `src/interfaces/IStockAcquisitionAdapter.sol` (the WETH→stock acquisition boundary the
  vault calls, TASK 6B-1A), `src/interfaces/ISwapRouter02.sol` (minimal hand-written SwapRouter02
  `exactInputSingle` ABI the Uniswap adapter calls, TASK 6B-1B), `src/BuildProbe.sol` (harmless probe).
  Tests (dependency-free: `require`/inline `Vm`, no forge-std)
  — TASK 1–4: `test/BPSToken.t.sol` (23), `test/BuildProbe.t.sol` (1), `test/LeafVector.t.sol` (3),
  `test/Publication.t.sol` (18), `test/Claims.t.sol` (21), `test/RecoveryAccounting.t.sol` (12),
  `test/Fuzz.t.sol` (4), `test/ClaimManagerBase.t.sol` (abstract base). TASK 5 vault:
  `test/LockingVaultBase.t.sol` (abstract base + inline `Vm`), `test/LockingVaultPolicy.t.sol` (8),
  `test/LockingVaultLifecycle.t.sol` (20), `test/LockingVaultWeight.t.sol` (4),
  `test/LockingVaultEmergency.t.sol` (6), `test/LockingVaultAccounting.t.sol` (4),
  `test/LockingVaultHostile.t.sol` (4), `test/LockingVaultFuzz.t.sol` (4 fuzz). TASK 6A router:
  `test/RouterBase.t.sol` (abstract base + inline `Vm`, deploys BPSToken/MockWETH/MockSwapAdapter/
  router with seeded local liquidity), `test/RouterConstructor.t.sol` (10),
  `test/RouterBuy.t.sol` (19), `test/RouterSell.t.sol` (19), `test/RouterSecurity.t.sol` (13),
  `test/RouterFuzz.t.sol` (3 fuzz), `test/BurnProof.t.sol` (6, proves the BPSToken self-burn
  properties additively without touching `BPSToken.t.sol`). TASK 6B-1A stock vault:
  `test/StockVaultBase.t.sol` (abstract base + inline `Vm`, deploys MockWETH/two MockERC20 stock
  tokens/pass-through adapter/vault with a seeded stock SOURCE, a WETH SINK, and a WETH budget),
  `test/StockVaultConstructor.t.sol` (17), `test/StockVaultAcquisition.t.sol` (13),
  `test/StockVaultHostile.t.sol` (12), `test/StockVaultRelease.t.sol` (8),
  `test/StockVaultAccounting.t.sol` (5), `test/StockVaultResidual.t.sol` (4 — the net-residual-custody
  security tests: retained-WETH, skimmed-stock, donation-tolerance, and donation-does-not-mask), and
  `test/StockVaultFuzz.t.sol` (1 fuzz). TASK 6B-1B Uniswap adapter:
  `test/SwapAdapterBase.t.sol` (abstract base + inline `Vm` incl. `getNonce`/`computeCreateAddress`;
  a unit harness where the test contract IS the authorized router, plus an integration harness that
  closes the router↔adapter immutable cycle via a nonce-predicted CREATE address),
  `test/SwapAdapterConstructor.t.sol` (16), `test/SwapAdapterSwap.t.sol` (5),
  `test/SwapAdapterSecurity.t.sol` (15), `test/SwapAdapterHostile.t.sol` (12),
  `test/SwapAdapterDonation.t.sol` (2), `test/SwapAdapterFuzz.t.sol` (2 fuzz), and
  `test/RouterUniswapIntegration.t.sol` (4 — real frozen `BPSTradeRouter` + real adapter over a mock
  SwapRouter02: buy, sell, economics/allowances, hostile-venue rollback). Test-only mocks under
  `test/mocks/`: `MockERC20.sol`
  (configurable-decimals ERC-20 + mint), `MockFeeOnTransferERC20.sol`, `ReentrancyProbeERC20.sol`
  (TASK 4), `FailingERC20Mock.sol` + `ReentrantBPSMock.sol` (TASK 5), `MockWETH.sol` (18-dec WETH
  stand-in with `mint`), `MockSwapAdapter.sol` (honest deterministic fixed-rate BPS/WETH adapter),
  `HostileSwapAdapter.sol` (configurable misbehaving BPS/WETH adapter: HONEST/LIE_OVER/LIE_UNDER/
  SHORT_SPEND/FAIL/REENTER) (TASK 6A), `MockStockAcquisitionAdapter.sol` (honest **pass-through**
  WETH→stock adapter: routes WETH to a sink and stock from a source, holding no residual) and
  `HostileStockAcquisitionAdapter.sol` (configurable misbehaving WETH→stock adapter: HONEST/LIE_OVER/
  LIE_UNDER/UNDER_MIN/PARTIAL_SPEND/EXCESS_SPEND/WRONG_TOKEN/NO_DELIVERY/RETAIN_STOCK/**RETAIN_WETH**/
  **SKIM_STOCK**/REENTER/REVERT) (TASK 6B-1A), `MockSwapRouter02.sol` (honest SwapRouter02
  `exactInputSingle` stand-in that records the exact params passed) and `HostileSwapRouter02.sol`
  (configurable misbehaving venue: HONEST/REVERT/PARTIAL_SPEND/NO_SPEND/UNDER_DELIVER/NO_OUTPUT/
  WRONG_TOKEN/LIE_OVER/LIE_UNDER/OUTPUT_TO_ADAPTER/EXCESS_PULL/REENTER) (TASK 6B-1B). TASK 7 test-only
  mocks: `test/mocks/HostileFundingManager.sol` (under-retaining claim-manager) and
  `test/mocks/AllowanceTrapERC20.sol` (never clears allowance). TASK 7 deployment surface under
  `script/`: `BPSDeployment.sol` (deterministic no-setter deploy plan + fail-closed validation +
  prediction + immutable assertions) and `DeployBPS.s.sol` (broadcast-free operator preflight + sanitized
  manifest); `deploy/` holds `manifest.schema.json`, `robinhood-mainnet.dryrun.json`, `RUNBOOK.md`;
  `.env.example` lists env-var names only. TASK 7 tests: `test/CoordinatorFundingRollback.t.sol` (2),
  `test/DeployConfigValidation.t.sol` (13), `test/ForkDeployRehearsal.t.sol` (1, mainnet-fork, opt-in via
  `ROBINHOOD_FORK_RPC`). npm scripts `forge:build` /
  `forge:test` / `forge:fmt` wrap forge. Depends on `@openzeppelin/contracts` (npm, pinned exact).
- `packages/shared` — `@bps/shared`. **Proof-of-Distribution domain logic** under
  `src/proof-of-distribution/`: `constants.ts` (ECON version, tiers, exclusion categories, leaf
  ABI), `numeric.ts` (integer/bigint helpers), `address.ts` (normalization), `schemas.ts` (zod
  strict schemas), `validate.ts` (normalize + cross-field checks), `model.ts` (typed model),
  `epoch.ts` (15-min epochs), `twab.ts` (time-weighted TWAB + effective weight), `eligibility.ts`,
  `allocation.ts` (80/20 + floor + dust), `merkle.ts` (StandardMerkleTree + wallet index),
  `viem-verify.ts` + `independent-verify.ts` (independent viem verification), `serialize.ts`
  (canonical JSON + keccak), `reconciliation.ts`, `artifacts.ts` (artifact builders),
  `pipeline.ts` (orchestrator), `index.ts` (public API re-exported through `src/index.ts`).
  `testkit.ts` is test-only (excluded from build). Comprehensive `*.test.ts` suites alongside.
- `packages/pilot` — `@bps/pilot`. Thin local runner: `fixtures/canonical-cycle.json` (the single
  canonical fixture), `src/fixture.ts` (loader), `src/cli.ts` (the `proof:mock` CLI),
  `src/index.ts` (`runCanonicalCycle`), `src/pipeline.test.ts` (fixture end-to-end tests). Depends
  on `@bps/shared`.
- `packages/db` — `@bps/db`. Placeholder package exporting a `WorkspaceInfo` object plus one unit test.
- `packages/rialto` — `@bps/rialto`. **Server-only Rialto quote boundary, gated behind a package
  subpath.** `src/quote-client.ts` (`fetchRialtoAllowanceQuote` + typed `RialtoQuoteError`/config/result)
  forces allowance settlement on chain 4663, validates the full response, and returns only sanitized
  execution fields; reads `RIALTO_API_KEY` server-side only, never exposes/logs it, injects `fetch`/`env`
  for tests, and makes no live request. It is exposed **only** through `src/server.ts` (re-export),
  published as the `"@bps/rialto/server"` subpath in `package.json` `exports`; the main barrel
  (`src/index.ts`) deliberately does **not** re-export it, so a browser/client bundle importing
  `@bps/rialto` can never pull the key-handling code. `src/quote-client.test.ts` (27 mocked-fetch tests,
  imported through `./server.js`) + `src/index.test.ts` (3 — workspace info + a structural test proving
  the barrel excludes `fetchRialtoAllowanceQuote`/`RialtoQuoteError` and the server entry exposes them).
  No new dependency (plain-TS validation). **Never import the quote client except via `@bps/rialto/server`.**
- New contracts src (TASK 6B-2 + acquisition-recording coordinator):
  `src/adapters/RialtoStockAcquisitionAdapter.sol`, `src/DistributionFundingCoordinator.sol`, and
  interfaces `src/interfaces/{IStockAcquisitionVaultView,IStockAcquisitionVaultOps,IRialtoRouterRegistry,
IDistributionClaimManagerFunding}.sol`. New Foundry tests: `test/RialtoAdapter{Base,Swap,Security,
Hostile}.t.sol`, `test/CoordinatorFunding.t.sol`, `test/RialtoEndToEnd.t.sol`. New test-only mocks:
  `test/mocks/{MockRialtoRouterRegistry,MockRialtoRouter,HostileRialtoRouter}.sol`.
- Root: `package.json` (workspaces `apps/*` + `packages/*`, pinned exact devDependencies;
  `typecheck`/`test`/`build`/`proof:mock` scripts prebuild `@bps/shared` first — see §9),
  `tsconfig.base.json` (strict + NodeNext), `eslint.config.mjs` (ESLint 9 flat config with
  typescript-eslint), `prettier.config.mjs`, `.prettierignore`, `.npmrc` (`save-exact`,
  `engine-strict`), `.gitignore`, `.env.example` (names/placeholders only), `README.md`,
  `CLAUDE.md` (unchanged), this file.

## 3. Implemented and verified

- **Proof-of-Distribution engine (`@bps/shared`)** — validated fixture in, canonical artifacts
  out; pure and side-effect free (no filesystem/network/clock/randomness in the domain code):
  - Strict zod validation + normalization; rejects malformed addresses, negative/unsafe numeric
    strings, unknown/missing fields, snapshot-after-finalized, inconsistent epoch boundaries,
    unsupported lock tiers/durations, and duplicate holder/exclusion/asset identifiers.
  - Exact 15-minute UTC epochs; time-weighted TWAB from deduped, canonically ordered transfers
    (idempotent identical logs, conflicting-log and negative-balance rejection, mixed-case
    normalization, mint/burn/exact-boundary handling).
  - veBPS effective weight with the five tier multipliers; canonical 100,000-BPS proofs produce
    100,000 / 110,000 / 125,000 / 150,000 / 175,000; no locked/unlocked double-count; start,
    unlock, and withdrawal boundaries covered.
  - 80/20 acquired-asset split (participant pool floor, remainder to reserve), per-wallet floor
    allocation, dust retained outside entitlements, per-asset conservation, mixed-decimal assets
    (6/8/18) allocated independently, zero-total-weight → non-publishable typed result.
  - StandardMerkleTree (`@openzeppelin/merkle-tree`) with the exact leaf tuple (§6); duplicate
    (cycleId, wallet, asset) rejection, no zero-amount leaves, order-independent root, wallet
    proof index (any casing; unknown → empty), and an independent viem verifier (leaf =
    double-keccak, sorted-pair fold) so proofs are not only self-verified. Field tampering
    invalidates proofs.
  - Canonical artifacts (sorted keys, base-10 string integers, LF, single trailing newline),
    manifest envelope hash + allocations content hash, and reconciliation invariants.
- **Local CLI (`@bps/pilot`)** — `npm run proof:mock -- --out <dir>` reads the canonical fixture,
  writes the four artifacts, independently re-verifies root/proofs and both hashes, prints a
  reconciliation summary, and exits non-zero on any invariant failure. Verified twice into
  separate directories: all four artifacts **byte-for-byte identical** (SHA-256 match), no CR,
  single trailing LF.
- Vitest: 68 TS tests pass — `@bps/shared` 8 files/52 tests, `@bps/pilot` 2 files/12 tests, plus
  indexer/worker/db/rialto placeholders (1 each). See §10.
- **`DistributionClaimManager` (TASK 4)** — funded, immutable, per-cycle Merkle distribution.
  Verified with Forge 1.7.1: `forge fmt --check` clean, `forge build` no warnings, `forge test`
  82 tests pass. Behavior proven by tests: two-step ownership; publish-once immutable cycles;
  atomic exact funding via balance-delta (fee-on-transfer / short / insufficient funding revert
  the whole publish with no partial state); single and batch claims bound to the frozen leaf and
  to msg.sender; claim window `[claimStart, claimDeadline]` inclusive at both ends; per-cycle and
  global liability accounting; permissionless post-deadline recovery to the immutable recipient;
  donations excluded from accounting; the audited TASK 3 leaf/root vector verified in Solidity and
  every bound field's tamper rejected. Control surface (see §7): 16 external functions, 6 events,
  26 errors, 6 compiler-declared storage slots (the inherited standard storage-based
  `ReentrancyGuard` also uses a fixed ERC-7201 namespaced slot not shown by `storage-layout` — see
  §7); no root/window mutation, no pause, no arbitrary-recipient recovery, no generic drain, no
  upgrade surface.
- **`BPSLockingVault` (TASK 5)** — fixed-term BPS locking under the frozen `vebps-1` policy.
  Verified with Forge 1.7.1: `forge fmt --check` clean, `forge build` no warnings, `forge test`
  132 tests pass (50 new vault tests + the 82 preserved TASK 1–4 tests). Behavior proven by tests:
  constructor rejects zero owner/token; two-step ownership; `POLICY_VERSION == 1`,
  `POLICY_NAME == "vebps-1"`; `policyMultiplierBps` returns 10000/11000/12500/15000/17500 for
  0/7d/14d/21d/30d and reverts otherwise; `createLock` self-only with exact received-delta funding
  (fee/short/insufficient reverts atomically, no partial state), zero amount/duration and
  unsupported durations rejected; sequential per-wallet ids, independent non-merged positions,
  exact per-wallet and global principal accounting; `withdraw` self-only, inclusive at `unlockTime`,
  effects-before-transfer, double/other-wallet/nonexistent rejected, failed transfer rolls back;
  weight boundaries (0 before start, tier bonus in `[start, unlock)`, 1.00x once expired-unwithdrawn,
  0 at/after withdrawal, historical reproducibility) and canonical 100,000-BPS results
  (100000/110000/125000/150000/175000, floored once); one-way owner emergency exit (blocks new
  locks, enables early self-withdrawal, demotes bonus to 1.00x from activation, moves no funds,
  cannot be re-enabled/disabled, owner cannot take participant funds); donations stranded and
  ignored by accounting; `vaultBalance >= totalLockedPrincipal`; reentrancy blocked on both token
  paths. Control surface (see §7): 20 external functions, 5 events, 15 errors; no mint/burn, no
  policy setters, no early unlock, no owner participant-fund withdrawal, no arbitrary recipient, no
  drain/rescue, no pause, no upgrade, and no transferable veBPS surface.
- **`BPSTradeRouter` (TASK 6A)** — the official BPS trade router implementing `BPS-ECON-2.0`.
  Verified with Forge 1.7.1: `forge fmt --check` clean, `forge build` no warnings, `forge test`
  202 tests pass (70 new router/burn tests + the 132 preserved TASK 1–5 tests). Behavior proven by
  tests: constructor stores immutable BPS/WETH/adapter/stock-recipient and rejects zero addresses,
  `bps == weth`, an adapter aliasing a token, and a stock recipient aliasing the router/tokens/
  adapter; fee constants are exactly 10000/200/100/200/200. **Buy** (`buyExactWethForBps`): pulls
  exactly `grossWethInput` WETH (balance-delta verified; fee-on-transfer/short funding reverts),
  `stockBudget = floor(G*200/10000)`, `burnBudget = floor(G*100/10000)`, `userWethBudget = G −
stock − burn` (remainder to the user; invariant `stock+burn+user==G`), delivers the stock budget
  to the immutable recipient, swaps the user budget WETH→BPS straight to the recipient, repurchases
  BPS with the burn budget and truly burns it, then asserts no new residue. **Sell**
  (`sellExactBpsForWeth`): pulls exactly `grossBpsInput` BPS, swaps the **entire** input BPS→WETH
  into the router, and allocates from the **actual** WETH proceeds `W` — `stock = floor(W*200/10000)`,
  `burn = floor(W*200/10000)`, `user = W − stock − burn` (remainder to the user) — delivers stock and
  user WETH, repurchases-and-burns, asserts no residue. The seller's own input BPS is sold for WETH
  (it is not the burned amount); only the WETH-funded buyback reduces `totalSupply`. Minimums
  (`minimumUserBpsOutput` / `minimumGrossWethOutput` / `minimumUserWethOutput` / `minimumBurnBpsOutput`)
  are enforced by the router against **actual** balance deltas (proven via a min-ignoring adapter so
  the router's own `MinimumOutputNotMet` — not the adapter's — fires); the deadline is inclusive; a
  zero budget performs no external swap and requires a zero minimum. The adapter boundary is
  hardened: exact `forceApprove` cleared to 0 after each swap, independent spend/output balance-delta
  verification, and every dishonest adapter (lie-over, lie-under, short-spend, fail, re-enter) reverts
  the whole trade. Preexisting BPS/WETH donations are excluded from allocation, burning, accounting,
  and the residue check. Owner power is limited to `pause`/`unpause` and two-step ownership;
  `renounceOwnership` reverts `RenounceDisabled`; direct native-ETH transfer reverts
  `NativeTransferNotAllowed`; reentrancy is blocked on both trade paths. Cumulative accounting
  (`tradeCount`, `totalBuys`, `totalSells`, `totalGrossWethInFromBuys`, `totalGrossBpsInFromSells`,
  `totalStockBudgetDelivered`, `totalBurnBudgetConsumed`, `totalBpsBurned`) accumulates correctly
  across mixed trades. Fuzz (256 runs each) proves the buy/sell split conserves the whole and the
  remainder always favors the user. Control surface (see §7): 28 external functions (2 trade + pause/
  unpause + two-step ownership + renounce-revert + view getters), 4 router events + 2 OZ ownership
  events, 16 custom errors + OZ errors; no fee/token/adapter/recipient/trade-math/burn setter, no
  proxy/upgrade/delegatecall, no arbitrary call, no fund sweep/rescue/withdraw/seize, no third-party
  burn.
- **`BPSToken` self-burn (TASK 6A inspection)** — the router's true burn uses the token's existing
  OZ `ERC20Burnable` `burn(uint256)` (burns only `msg.sender`'s own balance, reduces balance and
  `totalSupply` by exactly the amount, emits `Transfer` to `address(0)`, cannot burn another wallet's
  tokens without an explicit allowance). This is a **correct pre-existing permissionless self-burn**,
  so **`BPSToken` was not modified**; `test/BurnProof.t.sol` proves these properties additively.
- **`StockAcquisitionVault` (TASK 6B-1A)** — the production-shaped, multi-asset WETH→stock custody
  boundary intended to be the router's immutable `stockBudgetRecipient`. Verified with Forge 1.7.1:
  `forge fmt --check` clean, `forge build` no warnings, `forge test` 262 tests pass (60 new vault/adapter
  tests + the 202 preserved TASK 1–6A tests). Behavior proven by tests: constructor stores immutable
  WETH/adapter/executor/reserve/coordinator + frozen basket, rejecting zero addresses, adapter/reserve/
  coordinator aliasing, reserve==coordinator, empty/duplicate/zero/aliasing basket entries.
  `executeAcquisition` is executor-only, `nonReentrant`, rejects unapproved stock / zero amount / zero
  minimum / expired deadline / insufficient WETH custody; approves the immutable adapter for exactly the
  input and clears the approval after; independently verifies exact WETH spent, the observed stock delta,
  report==observed, the caller minimum against the actual delta, **and no new net residual custody at
  the adapter** (its WETH and selected-stock balances must equal their pre-call baselines — donation-
  tolerant, so pre-existing balances are fine but retained input / skimmed output revert); applies the
  frozen 80/20 split (`distribution = floor(actualStockOut*80/100)`, `reserve = actualStockOut −
distribution`, remainder to reserve), delivers the reserve portion to the immutable reserve recipient
  verifying **both** the vault's decrease and the recipient's increase, and retains distribution. Every
  dishonest adapter (lie-over/under, under-min, partial/excess WETH spend, wrong-token, no-delivery,
  retain-stock, **retained-WETH, skimmed-stock**, reentrancy, revert) and a fee-on-transfer stock token
  reverts the whole acquisition atomically with no state change. `releaseToDistributionCoordinator` is
  executor-only, `nonReentrant`, fixed-recipient (no recipient parameter), bounded by the unreleased
  distribution allocation so donations can never be released, and verifies **both** the vault's decrease
  and the coordinator's increase. Donation-safe accounting holds
  (`balanceOf(vault) + released >= allocated`; equality only without donations), multi-token accounting
  is isolated, and native ETH is rejected. Control surface (see §7): 2 state-mutating functions, 3 events,
  17 custom errors, 7 storage slots; **no owner, no pause, no setter, no sweep/withdraw/rescue, no
  arbitrary recipient, no arbitrary call, no basket add/remove, no proxy/upgrade**.
- **`UniswapV3BPSSwapAdapter` (TASK 6B-1B)** — the production `IBPSSwapAdapter` (BPS/WETH) for the
  router, a narrow direct Uniswap v3 `SwapRouter02.exactInputSingle` adapter. Verified with Forge 1.7.1:
  `forge fmt --check` clean, `forge build` no warnings, `forge test` 318 tests pass (56 new adapter/
  integration tests + the 262 preserved TASK 1–6B-1A tests). Behavior proven by tests: constructor
  stores immutable router/BPS/WETH/SwapRouter02/`uint24 poolFee`, rejecting zero addresses, `bps==weth`,
  dangerous aliases, and zero fee; it code-checks BPS/WETH/SwapRouter02 but intentionally accepts a
  code-less (predicted) router so the circular router↔adapter immutability can be constructed.
  `swapExactInput` is `nonReentrant`, callable only by the immutable router, only for the BPS↔WETH pair
  (both directions), rejects `tokenIn==tokenOut`, zero `amountIn` (SwapRouter02's contract-balance
  sentinel), expired deadline (enforced by the adapter — SwapRouter02 params carry none), and unsafe
  recipients (`address(0)`, the `address(1)`=msg.sender and `address(2)`=router-self sentinels, the
  adapter, SwapRouter02, and either token — the BPSTradeRouter itself remains valid for the buyback/sell
  legs). It pulls exactly `amountIn` (verifying exact receipt, rejecting fee-on-transfer), approves only
  SwapRouter02 for exactly `amountIn`, calls one `exactInputSingle` (`fee = poolFee`, `recipient` =
  caller recipient, `amountOutMinimum = minimum`, `sqrtPriceLimitX96 = 0`) delivering directly to the
  recipient, clears the approval, then requires the **observed recipient delta** to equal both the
  venue's report and (at least) the minimum, no new net residual BPS/WETH custody (donation-tolerant),
  and a cleared venue allowance. Every misbehaving venue (revert, partial/no input spend, under-deliver,
  no output, wrong-token, lie-over/under, output-to-adapter, excess-pull, reentrancy) and a
  fee-on-transfer input reverts the whole swap atomically with full rollback. The frozen-router
  integration (real `BPSTradeRouter` over a mock SwapRouter02, cycle closed by nonce-predicted CREATE)
  proves the buy, buyback-burn (true `totalSupply` reduction), and sell legs preserve BPS-ECON-2.0 and
  return all allowances to zero, and that a hostile venue reverts the whole trade. Control surface (see
  §7): 1 state-mutating function (`swapExactInput`) + 5 immutable getters; **no owner, setter, pause,
  sweep, rescue, withdrawal, arbitrary path/calldata/target/fee, delegatecall, proxy, or upgrade**.
- **`RialtoStockAcquisitionAdapter` (TASK 6B-2)** — production `IStockAcquisitionAdapter`. Verified:
  `forge test` 382 tests pass (64 in the Rialto/coordinator/e2e milestone: 26 security + 11 hostile + a
  swap/base harness for the adapter, 19 coordinator, 5 end-to-end). Deployable **only on Robinhood Chain**
  — the constructor reverts `WrongChain(block.chainid)` unless `block.chainid == ROBINHOOD_CHAIN_ID`
  (`4663`), a `public constant`, not configurable (`testConstructorWrongChainReverts`). Only the vault may
  call; approves stock only if the vault's basket approves it; `stockToken != WETH`; `amountIn > 0`;
  `minStockOut > 0`; enforces both the vault deadline and the quote's own expiry; decodes a minimal
  `{target, callData, quoteDeadline}` payload; requires non-empty calldata; resolves the current router
  via `registry.ownerOf(2)`, rejects a zero/uninitialized feature and any target != the current router
  (stale/prev/next), rejects a code-less target and target aliases; approves only that router for
  exactly `amountIn`, forwards the **unmodified** quote calldata via a registry-locked low-level call
  with zero value, clears the approval; determines acquired stock only from its observed balance delta
  (never router return data), requires delta >= minimum, WETH fully consumed (no residual), allowance
  cleared; forwards the exact observed stock to the vault, requires no adapter stock residual; donation
  tolerant; reverts atomically on every hostile mode (revert, partial/no spend, under-deliver, no/wrong
  output, output-to-attacker, excess-pull, reentrancy, fee-on-transfer WETH) and on a registry
  migration that makes a quote stale. No native ETH path. Control surface (see §7): 1 state-mutating
  function + immutable getters; no owner/setter/sweep/rescue/withdrawal/Permit2/gasless/Universal-
  Router/delegatecall/proxy/upgrade.
- **`DistributionFundingCoordinator` (TASK 6B-2, acquisition-recording)** — occupies **both** frozen
  vault roles (`acquisitionExecutor` **and** `distributionFundingCoordinator`; the frozen constructor
  permits the alias), verified on-chain in the tests (`testCoordinatorOccupiesBothVaultRoles`). Two
  immutable trusted roles: `acquisitionOperator` (initiates acquisitions, supplies the off-chain quote +
  `minStockOut`) and `rootPublisher` (supplies the governed PoD root/window and funds cycles); plus
  immutable `stockAcquisitionVault` and `distributionClaimManager`. **No owner, no setter.** State
  machine per acquisition id: NONE→RECORDED→FUNDED. `executeAndRecordAcquisition(stockToken,
wethAmountIn, minStockOut, deadline, executionData) returns (acquisitionId)` is operator-only,
  `nonReentrant`: it snapshots the vault's cumulative counters, calls `vault.executeAcquisition` (as the
  vault's sole executor), re-reads the counters, and records the acquisition **only from the exact
  deltas** — requiring `wethSpent == wethAmountIn`, `acquiredStock > 0`, `distribution ==
Math.mulDiv(acquired, 80, 100)` (the vault's own rule), `reserve == acquired − distribution`, and no
  release during the acquisition — then assigns a monotonic id and stores a RECORDED record
  (status, stockToken, wethSpent, acquiredStock, distributionAmount, reserveAmount, cycleId). A hostile
  or reverting acquisition reverts the whole call: no record, no id consumed
  (`testHostileAcquisitionNoRecordNoId`, `testVaultUnderDeliveryRollsBack`). `fundRecordedAcquisition(
acquisitionId, merkleRoot, allocationsContentHash, manifestEnvelopeHash, claimStart, claimDeadline,
cycleId)` is rootPublisher-only, `nonReentrant`: it requires status == RECORDED and an unused `cycleId`,
  derives the stock token and amount **from the stored record** (no caller-selected token/amount), binds
  one acquisition id to one cycle id (`cycleUsed`/`cycleAcquisitionId`), advances to FUNDED, then
  releases exactly the recorded 80% from the vault and publishes-and-funds that one cycle — verifying the
  vault's release delta, the coordinator's exact receipt, the reserve accounting is unchanged, the
  manager's exact receipt, the coordinator returns to its pre-release baseline (donations preserved), and
  the manager allowance is cleared. Splitting, recombination, reassignment to a second cycle, a cycle
  funding a second acquisition, replay, and out-of-order funding are all rejected
  (`testCannotReassignAcquisitionToSecondCycle`, `testCycleIdCannotFundSecondAcquisition`,
  `testDuplicateFundingReverts`, `testOutOfOrderFundingCorrect`, `testReserveNeverReleasedThroughCoordinator`,
  `testPreloadedDonationsPreserved`). No arbitrary recipient/withdrawal/sweep/generic-call/proxy/upgrade.
  19 coordinator tests.
- **Server-only Rialto quote client (`@bps/rialto`)** — `fetchRialtoAllowanceQuote` forces
  `chain_id=4663`, `settlement=allowance`, `sell_token=WETH`, `taker=adapter`, no `swap_fee_bps`, no
  Permit2, no gasless; validates the full response (chain, settlement, tokens, exact amount, taker,
  `tx.to` nonzero, bounded hex `tx.data`, `tx.value==0`, `min_buy_amount>0`, `issues.balance==null`,
  simulation complete, allowance spender `== tx.to`) and fails closed; reads `RIALTO_API_KEY`
  server-side only, never returns/logs it, uses `AbortSignal` timeout + `no-store`, and makes **no live
  request**. Reachable only through the `@bps/rialto/server` subpath (`src/server.ts`); the main barrel
  does not re-export it — proven structurally by `src/index.test.ts`. 27 mocked-fetch tests + 3 boundary
  tests.
- **Complete local end-to-end** (`RialtoEndToEnd.t.sol`, 5 tests): a real frozen `BPSTradeRouter` buy
  funds the 2% WETH budget to the vault; the trusted `acquisitionOperator` calls the coordinator, which
  (as the vault's sole executor) drives the acquisition through the Rialto adapter (registry-locked mock
  router on chain 4663) and **records the exact acquisition from the vault's deltas**; the vault applies
  the exact 80/20 split and delivers the 20% reserve; the `rootPublisher` funds exactly that acquisition's
  recorded 80% into one cycle; an eligible locker claims against a single-leaf fixture PoD root;
  invalid-proof and duplicate-claim revert; a hostile Rialto router rolls the whole acquisition back (no
  record, vault budget intact); and a fee-on-transfer stock token is rejected through the complete
  adapter→vault path. Reconciles acquisition = distribution + reserve; all allowances/residues return to
  zero.
- **Restricted-beta application (`@bps/web`, TASK 8/8B/8C/8D)** — a fail-closed dashboard driven entirely
  through an authoritative deterministic EIP-1193 mock provider + the wagmi `injected` connector (the app
  never imports the deterministic key or constructs a separate wallet client). Complete for the beta
  surface: authoritative contract reads (router paused, ERC-20 balance/decimals/exact allowance, locked
  principal + lock count, `cycles()`/`assetFunding()`/`claimed()`/`remaining()`, `acquisitions()`); a
  connector-driven approve→simulate→submit→confirm→**reconcile** transaction lifecycle where success is
  never inferred from a hash (with mempool-replacement handling via `onReplaced` — cancelled → failure,
  repriced → follow the confirmed receipt — and fail-closed confirmation errors); a real **lock** and a
  **partial `withdraw(lockId)`** each reconciled against the authoritative locked balance; **event-backed
  transparency** decoding OfficialBuy/OfficialSell, BpsRepurchasedAndBurned, StockBudgetDelivered,
  AcquisitionRecorded/Funded, Claimed (deduped by (block,tx,logIndex), confirmation-depth filtered,
  malformed-log rejecting, provenance-tagged with tx-hash/block/emitter refs); and **authoritative claim
  validation** (`lib/services/claim-validation.ts`) that compares the artifact root to the CURRENT on-chain
  `cycles()` root (a stale event root can never authorize a claim) plus published allocation, claim-used,
  manager balance, and remaining. `oracle-reads.ts` reads the Chainlink feed + sequencer + `oraclePaused()`
  fail-closed. Live writes are disabled without a broadcast-ready manifest; the declaration domain,
  eligibility service, and proof-artifact service remain labeled fail-closed blockers.
- `BPSToken`, `DistributionClaimManager`, `BPSLockingVault`, `BPSTradeRouter`, `StockAcquisitionVault`,
  `UniswapV3BPSSwapAdapter`, and all frozen interfaces (`IBPSSwapAdapter`, `IBPSBurnable`,
  `IStockAcquisitionAdapter`, `ISwapRouter02`) are unchanged (no git diff on any of them or their
  tests); the `packages/shared/src` PoD engine is unchanged. Their tests still pass within the 398-test
  suite.
- Full `npm run check` passes end-to-end (all TS stages plus all three Foundry stages; incl. 27
  quote-client + **129 `@bps/web`** tests (app-core + read/tx/oracle/transparency/claim-validation services
  - provider-state + provider-driven component/integration), **398 Foundry tests**) when `forge` is on PATH
    (see §11). Separately, the **Playwright browser E2E** (`apps/web/e2e/flow.spec.ts`, run via
    `npm run test:e2e --workspace @bps/web` against a production build) passes in real Chromium and drives the
    FULL connector-driven workflow (incl. partial withdrawal + sell/burn/budget transparency + authoritative
    claim). The 398 Foundry include the TASK 7 additions (2 coordinator funding-rollback, 13 deployment-config
    validation, 1 fork-rehearsal that skips without `ROBINHOOD_FORK_RPC`).
- Git repository: prior checkpoints `c443b925…` (1–5), `33062815…` (6A), `0f326913…` (6B-1A),
  `64825a3…` (6B-1B), `41d86cc…` (6B-2 + coordinator + e2e), `90e338a…` (acquisition-recording redesign),
  `cd98df3…` (TASK 7 deployment preparation), `d9b9fc0…` (TASK 8 partial-core interface),
  `d212456…` (TASK 8B interaction layer), `26b7feb` (TASK 8C
  "fix(app): finish restricted beta interaction coverage", HEAD). The TASK 8D work (complete authoritative
  reads, `withdraw` flow, full tx-failure coverage, complete event transparency incl. sell/burn/budget,
  extracted `claim-validation` service, oracle-boundary + provider-state tests, extended E2E) is working-tree
  only until the authorized `fix(app): close restricted beta acceptance gaps` commit.

## 4. In progress

Nothing is mid-implementation. TASK 1–5, 6A, 6B-1A, 6B-1B, and the combined 6B-2 + coordinator + e2e
milestone are complete and verified. Remaining work (production frontend, indexer, deployment) must not
be started without an explicit definition from the user.

## 5. Not started

- **Deployment** of the full stack — blocked on the §11 verified-address, configuration, operational,
  and legal blockers, and the circular deterministic deployment sequence. No deployment script exists.
- **Production frontend / web UI** — not begun (explicitly out of scope this milestone).
- On-chain / live components: liquidity provisioning, real Stock Token registry, the 15-minute epoch
  indexer (direct-wallet TWAB from BPSToken `Transfer` logs combined with lock-position state from
  `BPSLockingVault` events), RPC access / live event indexer, reorg persistence, PostgreSQL /
  migrations, transferable veBPS, eligibility smart contract / live screening, wallet connection,
  proof API, real claim/lock/trade transactions, website/dashboard pages, deployment scripts, and any
  Anvil / testnet / mainnet deployment. None exist; none should be added without an explicit task.
  `DistributionClaimManager`, `BPSLockingVault`, `BPSTradeRouter`, and `StockAcquisitionVault` are
  exercised only in the local Foundry test VM — none is deployed and no real claim, lock, withdrawal,
  trade, swap, acquisition, or burn has executed.

## 6. Canonical technical rules

- Node.js >= 22 enforced via root `engines` + `.npmrc` `engine-strict=true`.
- Exact dependency pinning: `.npmrc` `save-exact=true`; no floating versions in any manifest.
- TypeScript strict mode from `tsconfig.base.json` (also `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, NodeNext modules). Web overrides:
  Bundler resolution, `jsx: preserve`, `noEmit`.
- Node workspaces are ESM (`"type": "module"`); imports use `.js` extensions.
- Solidity pinned to 0.8.26 in `foundry.toml`; optimizer on, 200 runs.
- Foundry toolchain verified with Forge 1.7.1 (installed at
  `C:\Users\Administrator\.foundry\bin`). If `forge` is not on the current shell's PATH,
  prepend that directory before running the contract scripts.
- Contracts tests deliberately avoid forge-std (no git submodules). Cheatcodes used in tests are
  declared via a minimal inline `Vm` interface at cheatcode address
  `0x7109709ECfa91a80626fF3989D68f67F5b1DD12D`.
- Solidity dependencies are installed via **npm** (not git submodules, not soldeer) and resolved
  by a Foundry remapping to the hoisted root `node_modules`. Do not switch this to submodules
  without reason; it is the established, clean-checkout-reproducible approach.
- Package names: `@bps/web`, `@bps/indexer`, `@bps/worker`, `@bps/contracts`, `@bps/shared`,
  `@bps/db`, `@bps/rialto`, `@bps/pilot`.
- Pinned toolchain: typescript 5.9.3, eslint 9.39.5, prettier 3.9.6, vitest 4.1.10,
  next 16.2.11, react 19.2.8, typescript-eslint 8.65.0, @types/node 24.13.3.
- Solidity dependency: `@openzeppelin/contracts` 5.6.1 (pinned exact; MIT; audited ERC-20
  primitives).
- **Canonical `BPSToken` values (must not be silently changed):**
  - Name: `BPS Protocol`; Symbol: `BPS`; Decimals: 18 (OZ ERC20 default).
  - Fixed total supply: `1_000_000_000 * 10 ** 18` = 1,000,000,000 BPS (exposed as the
    `MAX_SUPPLY` public constant). Minted exactly once in the constructor to a
    constructor-provided `recipient`.
  - No mint path after construction, no owner/admin/roles, no fee/tax/rebase/reflection/
    blacklist/whitelist/pause/limit/upgrade/confiscation/arbitrary-burn-from/hidden-transfer.
  - Voluntary burn: `burn(uint256)` (caller's own balance) and `burnFrom(address,uint256)`
    (within allowance), via OZ `ERC20Burnable`; each reduces `totalSupply` by the burned amount.
    This is unrelated to any future protocol buy-and-burn mechanism (not implemented).
- **Canonical economics: `BPS-ECON-2.0` ONLY.** Official-route policy (for the future router,
  NOT implemented here): Buy 3% total = 2% stock-token acquisition + 1% BPS repurchase/burn;
  Sell 4% total = 2% stock-token acquisition + 2% BPS repurchase/burn. There is **no stewardship
  fee**. The superseded models — "2% total protocol fee", "150/50 BPS split", "3%/5% fee model",
  "Protocol Stewardship Treasury fee", "2.98% all-in", "hardcoded 1% LP-tier" — must never appear
  as active economics in code, fixtures, README, or this file's current-state sections.
- **PoD canonical rules (must not be silently changed):**
  - Epochs: `epochId = floor(ts/900)`, `epochStart = epochId*900`, `epochEnd = epochStart+900`;
    interval is half-open `[epochStart, epochEnd)`. All values bigint; JSON integers are base-10
    strings.
  - TWAB: `walletTwab = floor(sum(balanceDuringInterval * intervalSeconds) / 900)`. Transfers are
    deduped by `chainId|txHash|logIndex`, applied in canonical `(block, txIndex, logIndex)` order;
    input order does not affect results; a transfer at exactly `epochEnd` belongs to the next
    epoch.
  - veBPS tiers (multiplier bps / lock seconds): `LOCK_7D` 11000 / 604800, `LOCK_14D` 12500 /
    1209600, `LOCK_21D` 15000 / 1814400, `LOCK_30D` 17500 / 2592000; unlocked = 10000. A lock's
    `unlock - start` must equal its tier duration. `effectiveWeight = unlockedTwab +
sum_tier floor(lockedTwabByTier * multiplierBps / 10000)`. Bonus applies while
    `start <= t < min(unlock, withdrawal)`; free balance (balance − active-locked) must never go
    negative. veBPS is non-transferable participation power; no veBPS token/contract exists.
  - 80/20 acquired-asset split (per asset, own raw units):
    `participantPool = floor(acquired*8000/10000)`, `strategicReserve = acquired - participantPool`
    (remainder to reserve). The Strategic Asset Reserve is never in Merkle entitlements.
  - Allocation: `walletAllocation = floor(participantPool * walletEffectiveWeight /
totalEffectiveWeight)`; `allocated = sum(walletAllocation)`;
    `distributionDust = participantPool - allocated` (retained in the vault for rollover). Invariants
    enforced: `pool + reserve == acquired`, `allocated + dust == pool`, `allocated <= pool`. Zero
    amounts never become leaves. `totalEffectiveWeight == 0` → non-publishable (no root, no
    entitlements).
  - Merkle leaf tuple (exact order): `[chainId, claimManager, cycleId, wallet, asset, amount]`
    with ABI types `[uint256, address, uint256, address, address, uint256]`; leaf schema
    `bps.pod.leaf/1`. This schema is FIXED and reused by the future on-chain claim manager.
  - **Leaf hashing (OpenZeppelin StandardMerkleTree double-hash):**
    `innerHash = keccak256(abi.encode(chainId, claimManager, cycleId, wallet, asset, amount))`
    (standard ABI encoding, all args left-padded to 32 bytes), then
    `leaf = keccak256(bytes.concat(innerHash))` (equivalently `keccak256(innerHash)` — the
    double hash). The tree hashes internal nodes with commutative **sorted pairs**: for children
    `a`, `b`, `parent = keccak256(a < b ? a‖b : b‖a)`. A proof is folded over the leaf with the
    same sorted-pair rule and must equal the published root.
  - **Exact Solidity-equivalent leaf expression TASK 4 must use (do not change stylistically):**
    ```solidity
    keccak256(
        bytes.concat(
            keccak256(
                abi.encode(
                    block.chainid,   // chainId  — binds the claim to its intended chain
                    address(this),   // claimManager — binds to this claim-manager deployment
                    cycleId,         // prevents cross-cycle replay
                    claimant,        // prevents another wallet from using the proof
                    asset,           // prevents cross-asset substitution
                    amount           // prevents value tampering
                )
            )
        )
    );
    ```
    `abi.encode` (NOT `abi.encodePacked`) is required to match the generator. Verified equal to the
    generated OpenZeppelin leaf via viem (`encodeAbiParameters` + double keccak256) — see §10 audit.
  - Artifacts are canonical: sorted keys at every depth, base-10 string integers, LF line endings,
    single trailing newline, no clock/random/machine-path/env fields (timestamps from fixture),
    byte-for-byte reproducible. Manifest carries an `envelopeHash` (keccak256 of the canonical body
    without that field) and an `allocationsContentHash` (keccak256 of the canonical allocations
    payload).
- **`DistributionClaimManager` canonical rules (must not be silently changed):**
  - Frozen leaf (identical to the PoD standard, reused on-chain):
    `keccak256(bytes.concat(keccak256(abi.encode(block.chainid, address(this), cycleId, claimant, asset, amount))))`.
    Tuple order `[chainId, claimManager, cycleId, claimant, asset, amount]`, ABI types
    `[uint256, address, uint256, address, address, uint256]`. Use `abi.encode` (never
    `abi.encodePacked`); OZ `MerkleProof` sorted-pair verification. Do not add/remove/reorder leaf
    fields, entitlement indexes, or multiproofs. `leafFor(...)` and the claim path share one
    internal `_leaf`.
  - Publication (`publishCycle`, owner only, atomic): a cycle id publishes exactly once; root and
    both content hashes nonzero; `claimStart` strictly after the publication timestamp;
    `claimDeadline` strictly after `claimStart`; nonempty assets; equal-length assets/amounts;
    each asset nonzero and each amount nonzero; duplicate assets revert. Each asset is pulled from
    `msg.sender` with SafeERC20 and the **received balance delta must equal the declared amount
    exactly** (fee-on-transfer/short/failed transfer reverts the whole publication — no partial
    state). `fundedAmounts` are the TASK 3 `allocated` participant entitlements only (never
    reserve, dust, full pool, or other inventory).
  - Immutability: after publication nothing can change cycleId, root, either content hash,
    claimStart, claimDeadline, registered assets, or funded amounts. A later distribution uses a
    new cycle id.
  - Claims: claimant is always `msg.sender` (no claim-on-behalf); amount nonzero; cycle published;
    asset registered; window inclusive `claimStart <= block.timestamp <= claimDeadline`; proof
    valid against the immutable root; each `(cycleId, claimant, asset)` claimable once; claimed
    flag + accounting updated **before** the SafeERC20 transfer; nonReentrant; a claim may not
    exceed `funded - claimed - recovered`. `claimBatch` is same-cycle, same-sender, atomic; empty
    batch reverts; a duplicate/invalid item reverts the whole batch.
  - Accounting per (cycle, asset): registered, funded, claimed, recovered, recoveryClosed;
    `remaining = funded - claimed - recovered`; enforced `claimed + recovered <= funded`. Global
    `totalOutstanding[token]` increments on funding, decrements on claim and on recovery. For
    standard mock ERC-20s the manager's balance for an asset is always ≥ its recorded outstanding
    liability. Unsolicited donations never change funded/claim/recovery accounting.
  - Recovery (`recoverExpired`): permissionless; destination is always the immutable
    `recoveryRecipient` (constructor-set, nonzero, stored `immutable`); only after
    `block.timestamp > claimDeadline`; once per cycle/asset; recovers only the recorded remaining
    (accounting, not `balanceOf`); zero remaining closes without a token transfer.
  - Owner powers are limited to two-step ownership (transfer/accept/renounce, from OZ `Ownable2Step`)
    and publishing/funding new immutable cycles. The owner cannot alter a published root/hash/window/
    asset/amount, cancel a cycle, mark or pause claims, choose a recovery destination, or drain
    participant funds. There is no pause, no arbitrary-recipient recovery, no generic drain, no
    upgrade/proxy. `renounceOwnership` (inherited) only disables future publication and cannot touch
    published cycles, claims, or recovery.
- **`BPSLockingVault` / frozen `vebps-1` policy (must not be silently changed):**
  - Identity: `POLICY_NAME = "vebps-1"`, `POLICY_VERSION = 1` (both stored in each position; no
    setters exist for the version, durations, or multipliers — a future policy needs a new reviewed
    deployment). `bpsToken` and the initial owner are nonzero immutable/constructor values; two-step
    ownership. The vault never mints, burns, or modifies BPSToken; it only holds and returns
    principal.
  - Frozen tier table (multiplier bps, denominator 10_000): unlocked/zero `10000` (1.00x, preview
    tier only — **not** a valid vault lock), 7 days `11000`, 14 days `12500`, 21 days `15000`,
    30 days `17500`. `policyMultiplierBps(uint32 duration)` returns those values and reverts
    `UnsupportedPolicyDuration` for anything else. Durations are exact seconds
    (7 days = 604800, …, 30 days = 2592000).
  - Positions: identified by `(account, lockId)`; per-wallet sequential ids starting at 0
    (`lockCount[account]` is the next id). Each position permanently records principal, startTime,
    duration, unlockTime, multiplierBps, policyVersion, withdrawnAt, and exists/withdrawn flags.
    Positions are never merged, extended, shortened, renewed, split, transferred, or relocked; a
    later deposit is a new independent position.
  - `createLock(amount, duration)`: msg.sender-only (no recipient param); amount nonzero; duration
    must be one of the four terms (zero is rejected even though the policy helper exposes the
    unlocked preview tier); exact received balance-delta funding via SafeERC20 (fee/short/failed/
    insufficient reverts the whole call with no partial state); `nonReentrant`; blocked once
    emergency exit is enabled; emits `LockCreated`. `effectiveLockWeight = floor(principal *
multiplierBps / 10_000)` via `Math.mulDiv`. Canonical: 100,000 BPS →
    100000/110000/125000/150000/175000.
  - `withdraw(lockId)`: msg.sender-only (no recipient param); position must exist and be
    unwithdrawn; normal mode requires `block.timestamp >= unlockTime` (inclusive); withdrawn flag +
    accounting updated **before** the SafeERC20 transfer; `nonReentrant`; returns exactly principal;
    failed transfer reverts atomically; double withdrawal reverts. There is no ordinary early
    unlock in v1.
  - Weight timing (frozen): 0 before startTime; stored tier multiplier while
    `startTime <= t < unlockTime` (and, under emergency, `t < emergencyExitEnabledAt`); exactly
    1.00x principal once expired-or-emergency-demoted while unwithdrawn; 0 at and after
    `withdrawnAt`. Floor once after multiplying. Bonus ends at expiry; expired but unwithdrawn
    principal counts at 1.00x until withdrawal. `positionWeightAt(account, lockId, timestamp)` is the
    deterministic read; `positionWeight` uses the current block time.
  - Accounting: `lockedPrincipal[account]` and `totalLockedPrincipal` increase on lock and decrease
    on withdrawal by exactly the principal; for standard BPS flows `vault balance >=
totalLockedPrincipal`. Unsolicited BPS donations never create a position or change accounting/
    withdrawals and may remain stranded (no donation-rescue surface).
  - Emergency exit (`enableEmergencyExit`): owner-only, one-way, terminal; cannot be re-enabled or
    disabled; records `emergencyExitEnabledAt`; permanently blocks new locks; lets each position
    owner withdraw their own principal early; transfers no funds itself; the owner can never
    withdraw, redirect, seize, or assign participant principal; from activation, unwithdrawn
    positions carry only 1.00x weight (historical weight before activation is unchanged).
  - Owner powers are limited to two-step ownership and the one-way emergency exit. The owner cannot
    change the token/policy/durations/multipliers/a position, create or transfer veBPS, withdraw for
    a user, choose a recipient, seize/sweep/rescue/redirect BPS, withdraw donations, pause matured
    withdrawals, disable emergency exit after activation, preserve bonus after activation, make
    arbitrary calls, or upgrade. `renounceOwnership` (inherited) is retained — see §11 (availability
    risk): after renunciation matured/self-service withdrawals still work but emergency exit can no
    longer be enabled.
- **`BPSTradeRouter` / `BPS-ECON-2.0` router rules (must not be silently changed):**
  - Frozen allocation constants (basis points, denominator 10_000, all `public constant`):
    `BPS_DENOMINATOR = 10_000`, `BUY_STOCK_BPS = 200`, `BUY_BURN_BPS = 100`, `SELL_STOCK_BPS = 200`,
    `SELL_BURN_BPS = 200`. There is **no** stewardship/treasury/creation/graduation fee, transfer
    tax, rebase, reflection, or post-deployment mint anywhere in the router. Buy total = 3% (2% stock
    - 1% burn); sell total = 4% (2% stock + 2% burn). These are the only economics.
  - Immutable wiring (set once in the constructor, no setter exists): `bpsToken`, `weth`,
    `swapAdapter`, `stockBudgetRecipient`. Constructor rejects any zero address, `bps == weth`, an
    adapter equal to either token, and a stock recipient equal to the router/either token/the adapter.
  - Buy arithmetic (`buyExactWethForBps(grossWethInput, minimumUserBpsOutput, minimumBurnBpsOutput,
recipient, deadline)`): `stockBudget = floor(G*200/10000)`, `burnBudget = floor(G*100/10000)`,
    `userWethBudget = G − stockBudget − burnBudget` via `Math.mulDiv` (floor). Invariant
    `stock+burn+user == G`; the flooring remainder always goes to the user. Returns
    `(userBpsOutput, bpsBurned)`.
  - Sell arithmetic (`sellExactBpsForWeth(grossBpsInput, minimumGrossWethOutput, minimumUserWethOutput,
minimumBurnBpsOutput, recipient, deadline)`): swap **all** `Q` BPS→WETH first, measure the
    **actual** proceeds `W` (never a price oracle), then `stockBudget = floor(W*200/10000)`,
    `burnBudget = floor(W*200/10000)`, `userWethOutput = W − stock − burn` (remainder to the user).
    Returns `(grossWethOutput, userWethOutput, bpsBurned)`.
  - Both trade functions are `nonReentrant` + `whenNotPaused`; deadline is inclusive
    (`block.timestamp > deadline` reverts); recipient may not be zero/router/either token/the adapter;
    zero input reverts. Funding is pulled with an exact received balance-delta check
    (`FundingMismatch` on any shortfall, so fee-on-transfer inputs revert). Every stock/user/burn
    delivery is verified by an independent balance-delta on the destination. A successful trade must
    leave **no new** trade-derived BPS or WETH in the router (`UnexpectedResidue`); preexisting
    donations (captured as baselines at entry) are never counted, allocated, delivered, or burned.
  - Adapter boundary (`IBPSSwapAdapter.swapExactInput`): the adapter is immutable; the router never
    accepts a user-supplied target/path/calldata. Per swap the router `forceApprove`s exactly the
    input amount and clears the approval to 0 afterward, then independently verifies the actual input
    spent equals the requested amount (`AdapterSpendMismatch`) and the actual output received equals
    the adapter's reported return (`AdapterOutputMismatch`), and finally enforces the caller minimum
    against the **actual** received amount (`MinimumOutputNotMet`). A lying, short-spending, or
    failing adapter reverts the entire trade. A zero budget performs **no** external call and requires
    a zero minimum (`InvalidZeroBudgetMinimum` otherwise).
  - Owner powers are limited to `pause()`/`unpause()` and two-step ownership
    (`transferOwnership`/`acceptOwnership`, OZ `Ownable2Step`). `renounceOwnership()` is **overridden
    to revert `RenounceDisabled`** (the router must never be stranded ownerless or lose its emergency
    pause). The owner cannot change fees/tokens/adapter/recipient/trade-math/burn, redirect output,
    withdraw/sweep/seize funds, mint or burn anyone's BPS, make arbitrary calls, or upgrade. Direct
    native-ETH transfer reverts (`receive()` → `NativeTransferNotAllowed`); there is no generic
    rescue and no proxy/initializer/delegatecall/multicall/upgrade surface.
- **Burn-truth rule (critical):** the router's BPS burn is a **true supply reduction**, not a
  transfer to a dead address or an internal accounting entry. It repurchases BPS from the market with
  the WETH burn budget through the immutable adapter, then calls the token's own
  `burn(uint256)` (OZ `ERC20Burnable`, via `IBPSBurnable`) and asserts the router's BPS balance and
  the token `totalSupply` each fall by exactly the burned amount (`BurnSupplyMismatch` otherwise). A
  zero burn budget performs no swap and no zero-value burn. The router never burns another wallet's
  BPS and never uses `burnFrom`. Any future adapter/vault must preserve this exact behavior.
- **Deployment-order rule (router, critical):** the router is non-upgradeable and its BPS/WETH/
  adapter/stock-recipient are immutable, so the production swap adapter and the real
  stock-acquisition vault (the `stockBudgetRecipient`) must exist and be trusted **before** the
  router is constructed; a new adapter or recipient requires a new router deployment. Only trades
  routed through this router fund stock acquisition and BPS burning — direct-pool trades bypass it
  entirely. (TASK 6A builds and tests the router locally only; nothing is deployed.)
- **`UniswapV3BPSSwapAdapter` (TASK 6B-1B — must not be silently changed):**
  - Design: a narrow, non-upgradeable production `IBPSSwapAdapter` that routes each frozen router leg
    through exactly one Uniswap v3 pool via a single `SwapRouter02.exactInputSingle`. No multi-hop, no
    `bytes` path/calldata, no Universal Router commands, no v4, no exact-output. Immutable: the calling
    `bpsTradeRouter`, `bps`, `weth`, `swapRouter02`, and `uint24 poolFee` — no setter, owner, pause,
    proxy, delegatecall, or upgrade.
  - Corrected SwapRouter02 recipient sentinels (this deployment): **`address(1)` = msg.sender**,
    **`address(2)` = the router itself**; `address(0)` is NOT the msg.sender sentinel. The adapter
    rejects recipient ∈ {`address(0)`, `address(1)`, `address(2)`, the adapter, SwapRouter02, BPS,
    WETH}. The immutable `bpsTradeRouter` IS a valid recipient (the frozen buyback and sell legs use it).
  - Zero-input: the adapter rejects `amountIn == 0` itself (SwapRouter02 treats `amountIn == 0` as its
    contract-balance sentinel), even though the frozen router already skips zero-budget legs.
  - Deadline: enforced by the adapter (`block.timestamp <= deadline`) because SwapRouter02's
    `ExactInputSingleParams` has no deadline field; it does NOT use the deadline-aware `multicall`
    wrapper. `sqrtPriceLimitX96 = 0`; `amountOutMinimum` = the caller minimum.
  - Output verification: output is delivered directly to `recipient`; the adapter records the recipient
    `tokenOut` balance before and after, requires the **observed delta == SwapRouter02's returned
    amount** and **>= minimum**, and returns the observed amount. The frozen router then independently
    repeats its own recipient-delta and reported-output checks.
  - Flow/invariants: pull exactly `amountIn` (verify exact receipt → reject fee-on-transfer/incompatible
    tokens); approve only SwapRouter02 for exactly `amountIn`; one `exactInputSingle`; clear the venue
    approval to 0; require no new net residual BPS/WETH custody at the adapter (donation-tolerant
    baselines, not absolute zero) and a cleared venue allowance. Any mismatch reverts atomically.
    `nonReentrant`; direct native ETH reverts (`receive`), though forced ETH cannot be prevented at the
    EVM level and would remain stuck (no recovery path) — the ETH balance is not guaranteed zero.
  - Pool fee: `poolFee` is constructor-frozen and nonzero; it is NOT restricted to {500,3000,10000} and
    NOT owner/runtime-selectable. The specific tier is a later product/deployment decision.
  - The constructor does NOT verify the official SwapRouter02/factory, pool existence/initialization,
    the fee tier, or liquidity — those are later deployment gates.
- **Router↔adapter deployment-cycle rule (critical):** `BPSTradeRouter` stores the adapter immutably
  and `UniswapV3BPSSwapAdapter` stores the router immutably — a circular dependency. Production
  deployment requires a reviewed deterministic / nonce-predicted sequence that constructs the second
  contract at exactly the predicted address of the first, then verifies both immutables on-chain
  (`router.swapAdapter() == adapter` and `adapter.bpsTradeRouter() == router`). If the second contract
  is not deployed at the predicted address, the pair is unusable. There is deliberately **no one-time
  setter** shortcut. The adapter's constructor omits the router code-check precisely to allow the
  predicted (code-less) router address. No live deployment is authorized.
- **`RialtoStockAcquisitionAdapter` rules (TASK 6B-2 — must not be silently changed):** deployable ONLY
  on Robinhood Chain — the constructor reverts `WrongChain(block.chainid)` unless `block.chainid ==
ROBINHOOD_CHAIN_ID` (`4663`, a `public constant`). This is a hard, non-configurable guard, not a stored
  parameter. Runtime: vault-only caller; only a vault-approved `stockToken != WETH`; `amountIn > 0`,
  `minStockOut > 0`; enforce both
  the vault deadline and the quote's own `quoteDeadline`; decode only `{target, callData, quoteDeadline}`
  (no caller-selected value/spender/secondary-target/callback); require non-empty calldata. **Registry
  target lock:** accept ONLY `registry.ownerOf(2)` (revert on zero/uninitialized and on any target !=
  current — never `prev`/`next`/staged), require target code, reject target aliases; a router migration
  between quote and execution reverts and forces a fresh quote. Approve only that router for exactly
  `amountIn`, forward the **unmodified** quote calldata via a registry-locked low-level `call` with zero
  value (no delegatecall, no arbitrary secondary target), clear the approval. Acquired stock is
  determined ONLY from the adapter's observed balance delta (never router return data); require delta >=
  minimum, WETH fully consumed (no residual), allowance cleared; forward exactly the observed stock to
  the vault; no adapter residual; donation-tolerant; atomic revert on any mismatch. No native-ETH path
  (forced ETH may stick). No owner/setter/sweep/rescue/withdrawal/Permit2/gasless/Universal-Router/
  proxy/upgrade. The exact Rialto router ABI/selector is unverified — the design deliberately relies on
  the registry-locked target + invariants, not a guessed selector (§11 config blocker).
- **`DistributionFundingCoordinator` rules (acquisition-recording — must not be silently changed):** the
  coordinator occupies **both** frozen vault roles — it is the vault's `acquisitionExecutor` AND its
  `distributionFundingCoordinator`. This is permitted because the frozen vault constructor only
  zero-checks the executor and never rejects `acquisitionExecutor == distributionFundingCoordinator`
  (it does reject the coordinator aliasing the vault/adapter/WETH/reserve, none of which the coordinator
  is). Being the vault's **sole** executor is what makes per-acquisition delta attribution exact: no
  other party can move the vault's cumulative counters, and both vault entry points are `nonReentrant`,
  so a single `executeAcquisition` is the only thing that can change the counters between the
  coordinator's before/after reads. Immutable roles: `acquisitionOperator` (initiates acquisitions),
  `rootPublisher` (funds cycles), `stockAcquisitionVault`, `distributionClaimManager`; **no owner, no
  setter.** Per-acquisition state machine NONE→RECORDED→FUNDED, ids monotonic from 1 (0 is never valid).
  `executeAndRecordAcquisition` (operator-only, `nonReentrant`): record **only** from the vault's exact
  before/after deltas, requiring `wethSpent == wethAmountIn`, `acquiredStock > 0`, `distribution ==
Math.mulDiv(acquired, DISTRIBUTION_PERCENT, SPLIT_DENOMINATOR)` (read from the vault: 80/100), `reserve
== acquired − distribution`, and zero release during the acquisition; a hostile/reverting acquisition
  writes no record and consumes no id. `fundRecordedAcquisition` (rootPublisher-only, `nonReentrant`):
  requires RECORDED status and an unused `cycleId`; derives the stock token and amount **from the stored
  record only** (never a caller parameter); binds exactly one acquisition id to one cycle id
  (`cycleUsed`/`cycleAcquisitionId`) so acquisitions cannot be split, recombined, reassigned, or replayed
  and a cycle id cannot fund a second acquisition; advances to FUNDED; releases exactly the recorded 80%
  and publishes-and-funds that one cycle, verifying the vault's release delta, the coordinator's exact
  receipt, unchanged reserve accounting, the manager's exact receipt, a return to the coordinator's
  pre-release baseline (donations preserved), and a cleared manager allowance. The PoD root/hashes/window
  are governed inputs passed through to the frozen manager (never computed on-chain). The coordinator is
  the frozen manager's owner (set at deploy via a predicted address; NO setter). No arbitrary-recipient/
  withdrawal/sweep/generic-call/proxy/upgrade. **Vault↔coordinator (both roles) and manager-ownership
  deployment cycles** resolve via nonce-predicted CREATE (no one-time setter), verified on-chain after
  deploy.
- **`StockAcquisitionVault` / frozen 80/20 split (TASK 6B-1A — must not be silently changed):**
  - Frozen split constants (percent, denominator 100, `public constant`): `SPLIT_DENOMINATOR = 100`,
    `DISTRIBUTION_PERCENT = 80`. Per successful acquisition:
    `distributionAllocation = floor(actualStockOut * 80 / 100)` via `Math.mulDiv`;
    `reserveAllocation = actualStockOut − distributionAllocation`. The entire rounding remainder goes
    to the reserve. This 80/20 is the on-chain custody split of _acquired stock_ and is distinct from
    the router's `BPS-ECON-2.0` 2%/1%/2% WETH allocation; do not conflate them.
  - Immutable wiring (constructor, no setter): `weth`, `acquisitionAdapter` (`IStockAcquisitionAdapter`),
    `acquisitionExecutor` (sole authority; there is NO owner and NO pause), `reserveRecipient`,
    `distributionFundingCoordinator`, and the approved stock **basket** (frozen at construction;
    `isApprovedStockToken` is write-once, with no add/remove function in v1). Constructor rejects zero
    addresses, adapter aliasing WETH/vault, reserve or coordinator aliasing vault/adapter/WETH,
    reserve==coordinator, and empty/zero/duplicate/aliasing basket entries. It does **not** reject
    `acquisitionExecutor == distributionFundingCoordinator` (the executor is only zero-checked), which is
    exactly what lets the `DistributionFundingCoordinator` occupy both roles (see its rules below).
    Deployment remains blocked on the §11 gates, but the coordinator is no longer a placeholder — the
    acquisition-recording coordinator is the intended value for both the executor and coordinator slots.
  - `executeAcquisition(stockToken, wethAmountIn, minStockOut, deadline, executionData)`: executor-only,
    `nonReentrant`; rejects unapproved stock, zero `wethAmountIn`, zero `minStockOut`, expired deadline
    (inclusive), and `wethAmountIn` exceeding custody. Approves the immutable adapter for exactly
    `wethAmountIn` and clears the approval to 0 after the call. Independently verifies: WETH spent ==
    `wethAmountIn` (`WethSpendMismatch`); observed `stockToken` delta == adapter-reported
    (`ReportedStockMismatch`); observed delta >= `minStockOut` (`MinimumStockOutNotMet`). Delivers the
    reserve portion to `reserveRecipient` with a verified balance delta and retains the distribution
    portion. Any lie/short/excess-spend/wrong-token/no-delivery/retention/reentrancy/failure reverts
    atomically. `executionData` is an opaque per-call payload for a later concrete adapter; the generic
    vault never inspects it and a concrete adapter must lock its own external target (it cannot be an
    arbitrary target inside `executionData`).
  - **No new net residual custody at the adapter (critical).** In addition to the vault-side checks
    above, `executeAcquisition` records the adapter's own WETH and selected-stock balances immediately
    before the call and, after it, requires each to equal its pre-call baseline
    (`ResidualWethInAdapter` / `ResidualStockInAdapter`). This closes the gap where exact-spend,
    report==observed, and minimum all pass yet the adapter (a) pulled the exact WETH input but retained
    it instead of consuming it, or (b) delivered enough stock while skimming extra acquired stock into
    itself. The comparison is to the pre-call balance, **not zero**, so pre-existing unsolicited
    balances at the adapter are tolerated and never brick execution. A correct production adapter is a
    pass-through that holds no inventory, so both baselines are naturally preserved. Reserve delivery
    and `releaseToDistributionCoordinator` additionally verify **both** sides of the transfer (the
    vault's exact decrease and the recipient's exact increase).
  - `releaseToDistributionCoordinator(stockToken, amount)`: executor-only, `nonReentrant`, fixed
    recipient (no recipient parameter), bounded by `distributionAllocated − distributionReleased`
    (`ReleaseExceedsAllocation`), verified delivery delta. This is only the narrow custody→coordinator
    boundary — it does NOT publish or fund `DistributionClaimManager` cycles, and a bare transfer to the
    coordinator completes no distribution.
  - Donation-safe accounting (never equality invariants a donation can break): the vault tracks
    `totalWethSpent`, `totalStockAcquired[t]`, `distributionAllocated[t]`, `reserveAllocated[t]`,
    `distributionReleased[t]`, and treats its raw WETH balance as unattributed custody. The required
    stock relationship is `balanceOf(vault, t) + distributionReleased[t] >= distributionAllocated[t]`
    (equality only without donations); the excess is unsolicited donated stock and can never be released.
  - Authority limits: no owner, no pause, no fee, no economic setter, no basket mutation, no arbitrary
    recipient, no owner/executor withdrawal of custody, no generic sweep/rescue, no stock recovery to a
    discretionary address, no arbitrary call, and no proxy/upgrade. Native ETH is rejected (`receive()`
    → `NativeTransferNotAllowed`). **Deployment is blocked** until the concrete
    `DistributionFundingCoordinator` and the full ownership/authorization sequence are finalized.
- **Verified Rialto facts (official documentation — record only; do NOT hardcode in generic contracts):**
  - Robinhood Chain ID: **4663**. Taker-submitted **Router Registry**:
    `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E`. Registry **feature ID 2** identifies the current
    taker-submitted RialtoRouter; the registry may also expose a previous router during a migration
    dwell window. Smart-contract takers use **allowance settlement**. A quote returns dynamic `tx.to`
    and `tx.data` that **must not be modified**; `min_buy_amount` is encoded inside `tx.data`.
  - Partner eligibility (dashboard): Integrator ID **124**, display name **BPS**, approved max integrator
    fee **30 bps** (OPTIONAL), quote/swap rate limits 6,000 req/min. An external protected Rialto API
    credential exists but is **not stored or used by this repository** and must never be recorded here.
  - **30 bps fee semantics:** the 30 bps is an **OPTIONAL integrator fee**. BPS v1 must request **no**
    integrator fee — omit `swap_fee_bps` or set it to zero. Never describe the optional 30 bps as
    unavoidable slippage or an ordinary venue fee. Separately, Rialto's standard venue fee and price
    impact may reduce stock output and are absorbed by the acquisition minimum (`minStockOut`), never
    added to or netted against the vault's 80/20 split.
  - **Still unverified (must be verified before 6B-2 / any deployment):** the WETH (quote-asset) address,
    the approved stock-token addresses, the current live RialtoRouter resolved from the registry, and the
    precise quote-response/calldata schema. These belong to the later concrete Rialto adapter (6B-2), not
    the generic 6B-1A vault/interface; the Router Registry address above must **not** be hardcoded into
    `StockAcquisitionVault` or `IStockAcquisitionAdapter`.
  - **Router-vs-Rialto boundary:** Rialto's RFQ model (off-chain quote → on-chain RialtoRouter
    `tx.to`/`tx.data`) fits the vault's governed, keeper-driven `executeAcquisition` (which can carry a
    quote in `executionData`). It is **not** suitable for `BPSTradeRouter`'s synchronous, user-facing
    BPS/WETH legs, whose frozen `IBPSSwapAdapter.swapExactInput` carries no calldata and never forwards a
    caller target — those require a conventional AMM adapter (6B-1B).
- **Epoch-indexer rule (critical, for the future TASK-8 indexer):** the indexer must process
  BPSToken `Transfer` events and `BPSLockingVault` events in canonical block/transaction/log order.
  Direct-wallet TWAB and locked-vault weight must be **mutually exclusive for the same BPS unit**
  (the vault holds locked principal, so it is not simultaneously a direct-wallet balance). Bonus
  weight applies only before `unlockTime` and before `emergencyExitEnabledAt`; expired or
  emergency-demoted unwithdrawn principal contributes only 1.00x until withdrawal. The vault
  intentionally does **not** compute direct-wallet/unlocked TWAB; TASK 8 combines direct-wallet
  time-weighted balance with lock-position state off-chain.
- **Deployment-order rule (critical):** the real claim-manager contract address and target chain
  ID must be known **before** production Merkle artifacts are generated, because each leaf binds
  `block.chainid` and `address(this)`. A root generated for a different manager address or chain
  cannot be claimed. The audited TASK 3 root is bound to the fictional address `0x…c1a1` and is a
  Solidity compatibility test vector only — never claimable through a manager deployed elsewhere.
- No protocol fee values, router logic, live chain IDs, or governance roles beyond the claim
  manager's two-step owner are implemented yet. Token decimals are fixed at 18 (see above).

## 7. Contracts and deployments

- **No BPS protocol contract is deployed on any network.** Every contract below is exercised only in the
  local Foundry VM and (for the deployment sequence) in an ephemeral mainnet-fork rehearsal.
- **Independently verified Robinhood Chain (id 4663) externals (TASK 7, observed block 16726801 via the
  read-only public RPC + official Rialto/Uniswap sources; recorded in
  `packages/contracts/deploy/robinhood-mainnet.dryrun.json`).** These are external dependencies, NOT BPS
  deployments; addresses are passed to constructors, never hardcoded into protocol logic:
  - WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` — 18 decimals, symbol/name "WETH"; cross-confirmed
    by `SwapRouter02.WETH9()` and the public Rialto `/tokens` list. codehash
    `0x5706be52…5f5353`.
  - Rialto Router Registry `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E` — codehash `0xf8b9b92c…68a01e`.
    `ownerOf(2)` FAILS CLOSED (reverts on paused/uninitialized; empirically `ownerOf(9999)`/`ownerOf(0)`
    revert with custom errors, never a zero return). `getFeature(2)` returned
    `(prev=0x0, current=<router>, next=0x0, paused=false)`. Docs confirm `prev/next/getFeature` take
    `uint128` while `ownerOf` takes `uint256` — matching the frozen `IRialtoRouterRegistry.ownerOf`.
  - Current feature-2 router `0xC94135b63772b91D79d0A2DaAb2a8801f32359bD` — a DYNAMIC value from
    `ownerOf(2)`; has code (codehash `0xa7041268…f27611`); may change on a Rialto migration.
  - Uniswap v3 SwapRouter02 `0xCaf681a66D020601342297493863E78C959E5cb2` — codehash `0x6f36c378…cb25dc`;
    `WETH9()==WETH`, `factory()==0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` (v3 factory, codehash
    `0xec72b1ab…091739`). BPS uses ONLY direct v3 SwapRouter02 — no Universal Router, no Permit2.
  - Restricted-beta stock candidates: 19 whitelisted 18-decimal stock tokens from the public Rialto
    `/tokens` endpoint (`https://rialto-trade-api.rialto.xyz/tokens`, chain_id 4663). AAPL
    `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` and NVDA `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC`
    re-verified on-chain (code present, 18 decimals). The beta basket selection is a product/legal
    decision (deliberately not made here).
- **Deployment surface (TASK 7, NOT executed live): `packages/contracts/script/BPSDeployment.sol`** — a
  broadcast-free abstract library that encodes the single deterministic CREATE-nonce deploy plan
  resolving all circular immutable dependencies without a setter (order n0+0..n0+7: BPSToken,
  BPSLockingVault, DistributionClaimManager, RialtoStockAcquisitionAdapter, DistributionFundingCoordinator
  (== both vault roles), StockAcquisitionVault, UniswapV3BPSSwapAdapter, BPSTradeRouter). It exposes
  `_predict` (pure address prediction), `_validate` (fail-closed: wrong chain, zero/placeholder/aliased
  roles, no-code externals, unresolved feature-2 router, empty/duplicate/zero/weth-aliasing basket), and
  `_deployAndVerify` (executes the sequence and asserts every prediction, immutable role, and the
  coordinator-occupies-both-vault-roles invariant). `script/DeployBPS.s.sol` is the operator preflight
  wrapper (env-driven, fails closed, writes a sanitized `deploy/manifest.out.json`; broadcast-free, never
  reads a secret). `deploy/manifest.schema.json` + `deploy/robinhood-mainnet.dryrun.json` +
  `deploy/RUNBOOK.md` + `.env.example` complete the package. A mainnet-fork rehearsal
  (`test/ForkDeployRehearsal.t.sol`) deploys the whole stack against the real externals and passes.
- `BPSToken.sol` (`packages/contracts/src`) — canonical fixed-supply ERC-20. Inherits OZ
  `ERC20` + `ERC20Burnable`. Constructor signature: `constructor(address recipient)`; it mints
  `MAX_SUPPLY` (1e9 * 1e18) to `recipient` exactly once and reverts if `recipient` is the zero
  address (OZ `_mint` rejects the zero receiver). No owner, admin, roles, or privileged mint.
  Control surface (from `forge inspect ... methods` / `... abi`): exactly **12 externally
  callable functions** — `MAX_SUPPLY()`, `name()`, `symbol()`, `decimals()`, `totalSupply()`,
  `balanceOf(address)`, `transfer(address,uint256)`, `transferFrom(address,address,uint256)`,
  `approve(address,uint256)`, `allowance(address,address)`, `burn(uint256)`,
  `burnFrom(address,uint256)` — none privileged. The ABI also contains 1 `constructor`
  (a separate ABI entry, not counted among the 12 functions), 2 events (`Transfer`, `Approval`),
  and 6 OpenZeppelin ERC-20 custom errors (`ERC20InsufficientAllowance`,
  `ERC20InsufficientBalance`, `ERC20InvalidApprover`, `ERC20InvalidReceiver`,
  `ERC20InvalidSender`, `ERC20InvalidSpender`). `burnFrom` is the standard OZ `ERC20Burnable`
  path and remains allowance-limited (spends the caller's allowance; reverts with
  `ERC20InsufficientAllowance` when exceeded). **Not deployed**, no address/transaction exists.
  No constructor inputs have been chosen for any deployment.
- `DistributionClaimManager.sol` (`packages/contracts/src`) — funded, immutable per-cycle Merkle
  claim manager. Inherits OZ `Ownable2Step` + `ReentrancyGuard`; uses OZ `SafeERC20`, `MerkleProof`.
  Constructor `(address initialOwner, address recoveryRecipient_)`; `recoveryRecipient` is stored
  `immutable` (rejects zero). Control surface from `forge inspect` — **16 externally callable
  functions**: `publishCycle`, `claim`, `claimBatch`, `recoverExpired`, `leafFor` (view),
  `remaining` (view), `cycles`/`assetFunding`/`claimed`/`totalOutstanding`/`recoveryRecipient`
  (view getters), and the OZ ownership set `owner`, `pendingOwner`, `transferOwnership`,
  `acceptOwnership`, `renounceOwnership`. The ABI also has 1 constructor (not counted), **6 events**
  (`CyclePublished`, `CycleAssetFunded`, `Claimed`, `ExpiredRecovered`, plus OZ
  `OwnershipTransferStarted`/`OwnershipTransferred`), and **26 errors** (22 custom —
  `ZeroAddress`, `CycleAlreadyPublished`, `CycleNotFound`, `ZeroRoot`, `ZeroContentHash`,
  `InvalidClaimWindow`, `EmptyAssetList`, `ArrayLengthMismatch`, `ZeroAsset`, `ZeroFundingAmount`,
  `DuplicateAsset`, `FundingAmountMismatch`, `AssetNotRegistered`, `ClaimNotStarted`, `ClaimExpired`,
  `ZeroClaimAmount`, `AlreadyClaimed`, `InvalidProof`, `InsufficientCycleFunding`, `EmptyBatch`,
  `RecoveryTooEarly`, `AlreadyRecovered` — plus OZ `OwnableInvalidOwner`,
  `OwnableUnauthorizedAccount`, `ReentrancyGuardReentrantCall`, `SafeERC20FailedOperation`).
  `forge inspect ... storage-layout` reports **6 compiler-declared storage slots** (`_owner`,
  `_pendingOwner`, `cycles`, `assetFunding`, `claimed`, `totalOutstanding`). `recoveryRecipient` is
  `immutable` (embedded in bytecode, not a storage slot). The inherited guard is OpenZeppelin
  5.6.1's **standard, storage-based** `ReentrancyGuard` (imported from
  `@openzeppelin/contracts/utils/ReentrancyGuard.sol`, not `ReentrancyGuardTransient`); it reads/
  writes a fixed ERC-7201 **namespaced** storage slot
  `0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00` via `StorageSlot`. That
  namespaced slot is a genuine persistent storage location but is **not** part of the compiler
  storage-layout output, so the "6 slots" figure is the compiler-declared layout only — the
  contract does use that additional guard slot. (The contract does **not** use EIP-1153 transient
  storage; switching to `ReentrancyGuardTransient` is out of scope and not planned.) A
  privileged-surface scan found **no** root-update, window-update, pause, arbitrary-recipient
  recovery, generic drain, or upgrade/proxy function. **Not deployed**; no address/transaction/owner
  exists on any network.
- `BPSLockingVault.sol` (`packages/contracts/src`) — fixed-term BPS locking / frozen `vebps-1`
  policy. Inherits OZ `Ownable2Step` + `ReentrancyGuard`; uses OZ `SafeERC20`, `Math` (mulDiv),
  `SafeCast`. Constructor `(address bpsToken_, address initialOwner)`; `bpsToken` is `immutable`
  (rejects zero); owner is nonzero (OZ). Control surface from `forge inspect` — **20 externally
  callable functions** (6 state-mutating: `createLock`, `withdraw`, `enableEmergencyExit`, plus OZ
  `transferOwnership`/`acceptOwnership`/`renounceOwnership`; 14 view: `policyMultiplierBps`,
  `positionWeight`, `positionWeightAt`, `getPosition`, `lockCount`, `lockedPrincipal`,
  `totalLockedPrincipal`, `emergencyExitEnabled`, `emergencyExitEnabledAt`, `bpsToken`,
  `POLICY_NAME`, `POLICY_VERSION`, `owner`, `pendingOwner`). ABI: 1 constructor (not counted),
  **5 events** (`LockCreated`, `LockWithdrawn`, `EmergencyExitEnabled`, plus OZ
  `OwnershipTransferStarted`/`OwnershipTransferred`), **15 errors** (10 custom — `ZeroAddress`,
  `ZeroAmount`, `UnsupportedPolicyDuration`, `ZeroDurationLock`, `FundingAmountMismatch`,
  `EmergencyExitAlreadyEnabled`, `NewLocksDisabled`, `LockNotFound`, `LockNotExpired`,
  `LockAlreadyWithdrawn` — plus OZ `OwnableInvalidOwner`, `OwnableUnauthorizedAccount`,
  `ReentrancyGuardReentrantCall`, `SafeCastOverflowedUintDowncast`, `SafeERC20FailedOperation`).
  `storage-layout` reports **8 compiler-declared variables in 7 slots** (`_owner` s0,
  `_pendingOwner` s1, `lockCount` s2, `_positions` s3, `lockedPrincipal` s4, `totalLockedPrincipal`
  s5, `emergencyExitEnabled` + `emergencyExitEnabledAt` packed in s6). `bpsToken` is `immutable`
  (bytecode, not a slot); the inherited **standard, storage-based** OZ `ReentrancyGuard` uses its
  fixed ERC-7201 namespaced slot `0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00`
  (a real persistent slot, not shown by `storage-layout`; **not** transient storage). A
  forbidden-surface scan confirmed **no** function to mint/burn BPS, transfer veBPS, modify policy
  tiers or a position, extend/shorten a lock, early-unlock in normal mode, let the owner withdraw
  participant funds, choose an arbitrary recipient, rescue/sweep/drain, toggle emergency mode back
  off, pause matured withdrawals, make arbitrary external calls, or upgrade/replace logic (the only
  three flagged names — `emergencyExitEnabled`, `emergencyExitEnabledAt`, `enableEmergencyExit` —
  are false positives from the substring "merge" inside "emergency"). **Not deployed**; no
  address/transaction/owner exists on any network.
- `BPSTradeRouter.sol` (`packages/contracts/src`) — official BPS trade router / `BPS-ECON-2.0`.
  Inherits OZ `Ownable2Step` + `Pausable` + `ReentrancyGuard`; uses OZ `SafeERC20`,
  `Math` (mulDiv). Calls `IBPSSwapAdapter` (`src/interfaces/IBPSSwapAdapter.sol`) for swaps and
  `IBPSBurnable` (`src/interfaces/IBPSBurnable.sol`) for the token self-burn. Constructor
  `(address initialOwner, address bps, address weth_, address adapter_, address stockRecipient_)`;
  `bpsToken`/`weth`/`swapAdapter`/`stockBudgetRecipient` are all `immutable`. Control surface from
  `forge inspect ... methods` — **28 externally callable functions**: 2 trade
  (`buyExactWethForBps(uint256,uint256,uint256,address,uint256)`,
  `sellExactBpsForWeth(uint256,uint256,uint256,uint256,address,uint256)`), `pause`, `unpause`, the OZ
  ownership set (`owner`, `pendingOwner`, `transferOwnership`, `acceptOwnership`, `renounceOwnership`
  — the last reverts `RenounceDisabled`), `paused`, the 5 fee constants
  (`BPS_DENOMINATOR`/`BUY_STOCK_BPS`/`BUY_BURN_BPS`/`SELL_STOCK_BPS`/`SELL_BURN_BPS`), the 4 immutable
  getters (`bpsToken`/`weth`/`swapAdapter`/`stockBudgetRecipient`), and the 8 cumulative-accounting
  getters (`tradeCount`/`totalBuys`/`totalSells`/`totalGrossWethInFromBuys`/`totalGrossBpsInFromSells`/
  `totalStockBudgetDelivered`/`totalBurnBudgetConsumed`/`totalBpsBurned`). ABI also has 1 constructor
  (not counted), **6 events** (`OfficialBuy`, `OfficialSell`, `StockBudgetDelivered`,
  `BpsRepurchasedAndBurned`, plus OZ `OwnershipTransferStarted`/`OwnershipTransferred`; note
  `Paused`/`Unpaused` are the OZ `Pausable` events, emitted by pause/unpause), and **16 custom errors**
  (`ZeroAddress`, `InvalidTokenPair`, `InvalidSystemAddress`, `ZeroInput`, `InvalidRecipient`,
  `ExpiredDeadline`, `FundingMismatch`, `AdapterSpendMismatch`, `AdapterOutputMismatch`,
  `MinimumOutputNotMet`, `StockBudgetDeliveryMismatch`, `BurnSupplyMismatch`, `UnexpectedResidue`,
  `InvalidZeroBudgetMinimum`, `RenounceDisabled`, `NativeTransferNotAllowed`) plus OZ errors
  (`OwnableInvalidOwner`, `OwnableUnauthorizedAccount`, `EnforcedPause`, `ExpectedPause`,
  `ReentrancyGuardReentrantCall`, `SafeERC20FailedOperation`). `storage-layout` reports **11
  compiler-declared slots**: `_owner` (s0), `_pendingOwner` + `_paused` packed (s1), then the 8
  cumulative counters `tradeCount`/`totalBuys`/`totalSells`/`totalGrossWethInFromBuys`/
  `totalGrossBpsInFromSells`/`totalStockBudgetDelivered`/`totalBurnBudgetConsumed`/`totalBpsBurned`
  (s2–s9). The four `immutable` dependencies live in bytecode (not slots); the inherited **standard,
  storage-based** OZ `ReentrancyGuard` uses its fixed ERC-7201 namespaced slot
  `0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00` (a real persistent slot not
  shown by `storage-layout`; **not** transient storage). A forbidden-surface scan confirmed **no**
  fee/token/adapter/recipient/trade-math/burn setter, no fund sweep/rescue/withdraw/seize, no
  third-party burn, no arbitrary external call, and no proxy/upgrade/delegatecall/initializer.
  **Not deployed**; no address/transaction/owner exists on any network. No production
  `stockBudgetRecipient` or swap adapter has been chosen — the tests use fictional local ones.
- `IBPSSwapAdapter.sol` / `IBPSBurnable.sol` (`packages/contracts/src/interfaces`) — the two minimal
  interfaces the router depends on: `swapExactInput(address tokenIn, address tokenOut, uint256
amountIn, uint256 minimumAmountOut, address recipient, uint256 deadline) returns (uint256)` and
  `burn(uint256)`. No implementation of `IBPSSwapAdapter` is shipped in `src/` (production adapter is
  deferred to TASK 6B-1B); only test mocks implement it.
- `StockAcquisitionVault.sol` (`packages/contracts/src`) — multi-asset WETH→stock custody + 80/20
  split. Inherits OZ `ReentrancyGuard`; uses OZ `SafeERC20`, `Math` (mulDiv). Calls
  `IStockAcquisitionAdapter` for acquisitions. Constructor `(address weth_, address acquisitionAdapter_,
address acquisitionExecutor_, address reserveRecipient_, address distributionFundingCoordinator_,
address[] approvedStockTokens_)`; `weth`/`acquisitionAdapter`/`acquisitionExecutor`/`reserveRecipient`/
  `distributionFundingCoordinator` are all `immutable`. Control surface from `forge inspect ... methods`
  — **22 externally callable functions**, of which only **2 are state-mutating**
  (`executeAcquisition(address,uint256,uint256,uint256,bytes)`,
  `releaseToDistributionCoordinator(address,uint256)`); the rest are 2 split constants
  (`SPLIT_DENOMINATOR`/`DISTRIBUTION_PERCENT`), 5 immutable getters, the basket views
  (`approvedStockTokens`/`approvedStockTokenCount`/`approvedStockTokenAt`/`isApprovedStockToken`), and
  the accounting/derived views (`totalWethSpent`, `totalStockAcquired`, `distributionAllocated`,
  `reserveAllocated`, `distributionReleased`, `distributionReleasable`, `availableWethCustody`,
  `unsolicitedStockBalance`). ABI: 1 constructor (not counted), **3 events** (`StockAcquired`,
  `ReserveAllocated`, `DistributionReleased`), **17 custom errors** (`ZeroAddress`,
  `InvalidSystemAddress`, `DuplicateStockToken`, `EmptyBasket`, `NotAuthorizedExecutor`,
  `StockTokenNotApproved`, `ZeroAmount`, `ZeroMinimumOutput`, `ExpiredDeadline`,
  `InsufficientWethCustody`, `WethSpendMismatch`, `MinimumStockOutNotMet`, `ReportedStockMismatch`,
  `ResidualWethInAdapter`, `ResidualStockInAdapter`, `ReserveDeliveryMismatch`,
  `DistributionDeliveryMismatch`, `ReleaseExceedsAllocation`,
  `NativeTransferNotAllowed`) plus OZ `ReentrancyGuardReentrantCall`, `SafeERC20FailedOperation`.
  `storage-layout` reports **7 slots** (`isApprovedStockToken` s0, `_approvedStockTokens` s1,
  `totalWethSpent` s2, then `totalStockAcquired`/`distributionAllocated`/`reserveAllocated`/
  `distributionReleased` s3–s6); the 5 immutables live in bytecode, and the inherited standard OZ
  `ReentrancyGuard` uses its fixed ERC-7201 namespaced slot (not shown; not transient). A
  forbidden-surface scan confirmed **no** owner/`Ownable`, pause, setter, basket add/remove, sweep/
  rescue/withdraw, arbitrary recipient, arbitrary call, or proxy/upgrade. **Not deployed**; deployment
  is blocked until the concrete `DistributionFundingCoordinator` and the ownership/authorization
  sequence are finalized. No production adapter, executor, reserve, coordinator, or basket has been
  chosen — the tests use fictional local ones.
- `IStockAcquisitionAdapter.sol` (`packages/contracts/src/interfaces`) — the WETH→stock acquisition
  boundary the vault calls: `acquireStock(address stockToken, uint256 wethAmountIn, uint256 minStockOut,
uint256 deadline, bytes executionData) returns (uint256 reportedStockOut)`. No implementation is
  shipped in `src/` (the concrete Rialto adapter is deferred to TASK 6B-2); only test mocks implement
  it. The NatSpec requires exact-input WETH acquisition, only the requested approved stock token,
  delivery back to the vault, actual output >= `minStockOut`, report == vault-observed delta, no native
  ETH, no residual custody, atomic failure, and that a concrete adapter lock its own external target
  (never an arbitrary target inside `executionData`).
- `UniswapV3BPSSwapAdapter.sol` (`packages/contracts/src/adapters`) — production direct Uniswap v3
  `SwapRouter02.exactInputSingle` adapter implementing the frozen `IBPSSwapAdapter`. Inherits OZ
  `ReentrancyGuard`; uses OZ `SafeERC20`. Constructor `(address bpsTradeRouter_, address bps_,
address weth_, address swapRouter02_, uint24 poolFee_)`; all five are `immutable`. Control surface
  from `forge inspect ... methods` — **6 externally callable functions**, only **1 state-mutating**
  (`swapExactInput(address,address,uint256,uint256,address,uint256)`), plus 5 immutable getters
  (`bpsTradeRouter`, `bps`, `weth`, `swapRouter02`, `poolFee`). ABI: 1 constructor (not counted), **0
  events**, **17 custom errors** (`ZeroAddress`, `InvalidTokenPair`, `InvalidSystemAddress`,
  `ZeroPoolFee`, `NotAContract`, `NotBpsTradeRouter`, `UnsupportedPair`, `SameToken`, `ZeroAmountIn`,
  `ExpiredDeadline`, `InvalidRecipient`, `FundingMismatch`, `OutputMismatch`, `MinimumOutputNotMet`,
  `ResidualBpsInAdapter`, `ResidualWethInAdapter`, `ApprovalNotCleared`, `NativeTransferNotAllowed`)
  plus OZ `ReentrancyGuardReentrantCall`, `SafeERC20FailedOperation`. Holds no storage beyond the
  inherited standard OZ `ReentrancyGuard` ERC-7201 namespaced slot; the 5 immutables live in bytecode.
  A forbidden-surface scan confirmed **no** owner/`Ownable`, setter, pause, sweep/rescue/withdraw,
  arbitrary target/path/calldata/fee, delegatecall, or proxy/upgrade. **Not deployed**; the official
  Robinhood Chain SwapRouter02 is `0xcaf681a66d020601342297493863e78c959e5cb2` (recorded reference —
  NOT hardcoded in any contract). No WETH/BPS/pool address, fee tier, price, or liquidity is chosen;
  deployment is blocked pending those plus the deterministic router↔adapter sequence (see §6).
- `ISwapRouter02.sol` (`packages/contracts/src/interfaces`) — minimal hand-written SwapRouter02 ABI:
  only `exactInputSingle(ExactInputSingleParams) payable returns (uint256)` and its struct
  (`tokenIn, tokenOut, uint24 fee, recipient, amountIn, amountOutMinimum, uint160 sqrtPriceLimitX96`).
  No broad Uniswap dependency, no copied implementation, and no Universal Router / multicall / Permit2 /
  v2 / exact-output / multi-hop functions. No new npm dependency was added.
- `RialtoStockAcquisitionAdapter.sol` (`packages/contracts/src/adapters`) — production
  `IStockAcquisitionAdapter` executing a Rialto allowance-settlement quote against the registry-locked
  feature-2 router. Inherits OZ `ReentrancyGuard`; uses OZ `SafeERC20`. Constructor `(address vault_,
address weth_, address registry_)`; all three immutable (`SWAP_ROUTER_FEATURE_ID = 2` and
  `ROBINHOOD_CHAIN_ID = 4663` constants). The constructor reverts `WrongChain(block.chainid)` off chain 4663. Control surface: **1 state-mutating function** (`acquireStock`) + immutable getters
  (`stockAcquisitionVault`, `weth`, `routerRegistry`, `SWAP_ROUTER_FEATURE_ID`, `ROBINHOOD_CHAIN_ID`). No
  events (it reverts or returns), ~19 custom errors (incl. `WrongChain`), no owner/setter/sweep/rescue/
  withdrawal/Permit2/gasless/Universal-Router/delegatecall/proxy/upgrade, no native-ETH path. **Not
  deployed**; vault↔adapter immutability is circular (nonce-predicted deploy). The registry ABI
  (`ownerOf(2)`), the current feature-2 router, WETH, and stock-token addresses are deployment gates (§11).
- `DistributionFundingCoordinator.sol` (`packages/contracts/src`) — acquisition-recording coordinator
  occupying **both** frozen vault roles (executor + distributionFundingCoordinator). Inherits OZ
  `ReentrancyGuard`; uses OZ `SafeERC20` and `Math`. Constructor `(address vault_, address claimManager_,
address acquisitionOperator_, address rootPublisher_)`; all immutable (constructor code-checks the
  already-deployed manager but not the predicted vault). Control surface: **2 state-mutating functions**
  (`executeAndRecordAcquisition`, `fundRecordedAcquisition`) + public getters (`acquisitions` mapping,
  `acquisitionCount`, `cycleUsed`, `cycleAcquisitionId`, immutable refs). 2 events (`AcquisitionRecorded`,
  `AcquisitionFunded`), ~22 custom errors. Is the claim manager's owner (set at deploy via predicted
  address; no setter). No owner/mutable-setter/arbitrary-recipient/withdrawal/sweep/generic-call. **Not
  deployed**; vault↔coordinator immutability (both roles) is circular (nonce-predicted deploy).
- `IStockAcquisitionVaultView.sol` / `IStockAcquisitionVaultOps.sol` / `IRialtoRouterRegistry.sol` /
  `IDistributionClaimManagerFunding.sol` (`packages/contracts/src/interfaces`) — minimal read/call slices
  the new components use against the frozen vault (`isApprovedStockToken` + `distributionReleased` for the
  adapter's view; the counter getters, `executeAcquisition`, `releaseToDistributionCoordinator`, and the
  80/20 constants for the coordinator's ops), the Rialto registry (`ownerOf`), and the frozen manager
  (`publishCycle`). No frozen implementation is imported or modified.
- `BuildProbe.sol` (`packages/contracts/src`) — toolchain probe only, compiles (Solc 0.8.26)
  and its test passes under Forge 1.7.1. **Not deployed**, must never be deployed.
- No deployments on any network. No addresses, transaction hashes, or roles exist. No deployment
  scripts exist. Every contract — including the Rialto adapter and the coordinator — is exercised only
  in the local Foundry test VM. The official Robinhood Chain Rialto Router Registry is
  `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E` (feature ID 2 = active taker-submitted swap router);
  recorded as a verified reference only and passed to the adapter as a constructor argument — never
  hardcoded into contract logic. The current feature-2 router, WETH, BPS, stock-token, and pool
  addresses remain unverified deployment gates.

## 8. Data and integrations

- Solidity dependency `@openzeppelin/contracts` 5.6.1 is a real, installed npm dependency of
  `@bps/contracts` (pinned exact; integrity-locked in `package-lock.json`). Foundry resolves it
  via `remappings = ["@openzeppelin/contracts/=../../node_modules/@openzeppelin/contracts/"]`
  plus `allow_paths = ["../../node_modules"]` in `foundry.toml`. Clean-checkout flow: `npm install`
  restores it, then any forge command resolves the import.
- PoD runtime dependencies of `@bps/shared` (all pinned exact, integrity-locked; restored by a
  clean `npm install`): `@openzeppelin/merkle-tree` 1.0.8 (StandardMerkleTree — the required Merkle
  standard), `viem` 2.55.5 (independent keccak256/ABI-encode + sorted-pair verification, and the
  canonical-serialization hasher), `zod` 4.4.3 (strict runtime fixture validation). `@bps/pilot`
  depends on `@bps/shared`. No git submodules, no copied cryptographic source.
- PoD data is a single checked-in JSON fixture (`packages/pilot/fixtures/canonical-cycle.json`),
  entirely fictional. No RPC, no live event source, no chain connection.
- PostgreSQL: **not configured**. No schema, no migrations, no client library installed.
  `@bps/db` is an empty placeholder.
- Robinhood Chain RPC: **not configured**; no RPC client code exists. Officially documented facts to
  use later (recorded only; not wired into any code and not hardcoded in any contract): **chain ID
  4663**.
- Uniswap on Robinhood Chain (official documentation — recorded reference only; NOT wired into or
  hardcoded in any contract): v2/v3/v4 and UniswapX are live. Final v3 deployments — UniswapV3Factory
  `0x1f7d7550b1b028f7571e69a784071f0205fd2efa`, QuoterV2 `0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7`,
  **SwapRouter02 `0xcaf681a66d020601342297493863e78c959e5cb2`**, Permit2
  `0x000000000022D473030F116dDEE9F6B43aC78BA3`, UniversalRouter
  `0x8876789976decbfcbbbe364623c63652db8c0904`. BPS v1 uses only the **direct v3 SwapRouter02**
  boundary (not Universal Router or v4). **Still requiring independent verification before any
  deployment:** the Robinhood Chain WETH address, the deployed BPS address, the BPS/WETH v3 pool
  address, the chosen fee tier, initial price and liquidity, that the pool descends from the official
  factory, and the deterministic router↔adapter deployment sequence. These are deployment gates, not
  yet resolved.
- Rialto: **integrated locally (server-only), not live.** `@bps/rialto` now ships a server-only quote
  client (`quote-client.ts` — `fetchRialtoAllowanceQuote`) and the on-chain `RialtoStockAcquisitionAdapter`
  consumes its quote. The client forces `chain_id=4663`, `settlement=allowance`, `sell_token=WETH`,
  `taker=adapter`, no `swap_fee_bps` (no integrator fee), no Permit2, no gasless; validates the full
  response (chain/settlement/tokens/exact amount/taker/`tx.to`/bounded hex `tx.data`/`tx.value==0`/
  `min_buy_amount>0`/`issues.balance==null`/simulation-complete/allowance-spender==`tx.to`) and fails
  closed; reads `RIALTO_API_KEY` **server-side only** (never `NEXT_PUBLIC_*`), never returns/logs it,
  uses an `AbortSignal` timeout + `no-store`, and makes **no live request**. GET `/tokens` is public
  and GET `/quote` is bearer-protected (not called here). Officially documented facts: taker-submitted
  **Router Registry**
  `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E` (feature **ID 2** = current taker-submitted
  RialtoRouter; a previous router may appear during a migration dwell window); smart-contract takers
  use **allowance settlement**; a quote returns dynamic `tx.to`/`tx.data` that must not be modified,
  with `min_buy_amount` encoded in `tx.data`; Integrator ID **124**, display name **BPS**, approved
  max integrator fee **30 bps (OPTIONAL — BPS v1 requests none: omit `swap_fee_bps` / zero)**,
  quote/swap limits 6,000 req/min. An external protected Rialto API credential exists but is **not
  stored or used by this repository** and is never recorded here; it must not be created, exposed, or
  used from this repo. **Still requiring independent verification before 6B-2 / any deployment:** the
  WETH (quote-asset) address, approved stock-token addresses, the current live RialtoRouter resolved
  from the registry, and the exact quote-response/calldata schema. These
  belong to the concrete Rialto adapter (6B-2). The 30 bps optional integrator fee is distinct from
  Rialto's standard venue fee / price impact, which reduce stock output and are absorbed by the
  acquisition minimum — see §6 Rialto rules.
- Wallet authentication: **not implemented**.
- `.env.example` lists expected variable names only (all placeholders, no real values):
  `APP_ENV`, `PORT`, `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `ROBINHOOD_CHAIN_RPC_URL`,
  `ROBINHOOD_CHAIN_ID`, `WALLET_AUTH_SESSION_SECRET`, `WALLET_AUTH_DOMAIN`, `RIALTO_API_URL`,
  `RIALTO_API_KEY`, `PILOT_ALLOWLIST`, `PILOT_ACCESS_CODE`, `BPS_TOKEN_ADDRESS`,
  `BPS_STAKING_ADDRESS`, `TX_MAX_VALUE`, `TX_MAX_PER_DAY`. No code reads these yet.

## 9. Commands

All run from the repository root:

- Install: `npm install`
- Dev (web app on :3000): `npm run dev`
- Format check / fix: `npm run format:check` / `npm run format`
- Lint: `npm run lint`
- Typecheck (all workspaces): `npm run typecheck`
- Unit tests (all workspaces): `npm run test`
- Production builds (all workspaces): `npm run build`
- Foundry (requires forge on PATH; installed at `C:\Users\Administrator\.foundry\bin`, add to
  PATH if not present in the current shell): `npm run fmt:contracts`, `npm run build:contracts`,
  `npm run test:contracts`
- Full suite: `npm run check` (format:check → lint → typecheck → test → build →
  fmt:contracts → build:contracts → test:contracts)
- Proof-of-Distribution CLI: `npm run proof:mock -- --out <directory>` (builds `@bps/shared` and
  `@bps/pilot`, then writes the four artifacts to `<directory>`; network-free; exits non-zero on
  any invariant failure).
- Service smoke run: `npm run start --workspace @bps/indexer` (or `@bps/worker`)
- Inspect a contract's surface (run from `packages/contracts`, each also `abi` / `storage-layout`):
  `forge inspect src/BPSToken.sol:BPSToken methods`;
  `forge inspect src/DistributionClaimManager.sol:DistributionClaimManager methods`;
  `forge inspect src/BPSLockingVault.sol:BPSLockingVault methods`;
  `forge inspect src/BPSTradeRouter.sol:BPSTradeRouter methods`;
  `forge inspect src/StockAcquisitionVault.sol:StockAcquisitionVault methods` (if `storage-layout`
  reports a caching error, run `forge clean` first);
  `forge inspect src/adapters/UniswapV3BPSSwapAdapter.sol:UniswapV3BPSSwapAdapter methods`.
- Run only the router/burn suites: `forge test --match-contract
"RouterConstructor|RouterBuy|RouterSell|RouterSecurity|RouterFuzz|BurnProof"` (from
  `packages/contracts`).
- Run only the stock-vault suites: `forge test --match-contract "StockVault"` (from
  `packages/contracts`).
- Run only the Uniswap adapter suites: `forge test --match-contract
"SwapAdapter|RouterUniswapIntegration"` (from `packages/contracts`).

Note: `typecheck`, `test`, `build`, and `proof:mock` first run `build:shared`
(`npm run build --workspace @bps/shared`) so consumers of `@bps/shared` resolve its built `dist`
types/JS. This is required because `@bps/pilot` imports `@bps/shared`.

## 10. Latest verification

TASK 8D verification run 2026-07-23 (Forge 1.7.1, Node 24.18.0), from HEAD `26b7feb` (TASK 8C). Commands
actually run:

- `npm run check` — **exit 0**: `prettier --check` PASS (after formatting the 8D files), `eslint` PASS,
  `tsc --noEmit` PASS, web vitest **129 tests pass** across 17 files (adds
  `lib/services/claim-validation.test.ts` 8, `lib/testing/mock-eip1193.test.ts` 9, and the extended
  reads/oracle-reads/transparency-reads/tx/AppDashboard suites), web `next build` PASS, `forge fmt --check`
  PASS, `forge build` PASS, `forge test` **398 tests pass, 0 failed** (all contract suites unchanged).
- `npm run test:e2e` (Playwright, real Chromium against the production build on port 3100) — **1 browser
  test passed**: connect → provider-derived wrong chain → real switch to 4663 → connector signature →
  eligibility → official buy (approve→simulate→submit→confirm) → lock (reconciled 500→1500) → **partial
  withdrawal (reconciled 1500→500, button then disabled)** → event-derived transparency (buy 1000, sell 200,
  repurchase-burn 5, delivered budget 20, acquisition remaining 1600) → authoritative-cycle claim →
  transparency updates (claimed 1600) → duplicate claim disabled.
- Safety scan: no `localTestAccount`/`createDemoWalletClient` imported by `apps/web/app` or non-testing
  `apps/web/lib` (only the public `LOCAL_TEST_ADDRESS` in demo config); the deterministic key stays confined
  to `lib/testing/mock-eip1193.ts`. `git status` shows only `apps/web` files — no frozen Solidity/interface/
  contract-test, `packages/shared/src`, or TASK 7 change; no `package.json`/lockfile change.

Prior — Acquisition-recording redesign verification run 2026-07-22 with Forge 1.7.1 and Node 24.18.0. Baseline
confirmed at `41d86ccaa9b53a3f7a837790d2bc9e2f03e65bf3` (HEAD, the TASK 6B-2 + funding-flow commit).
Commands actually run:

- `forge fmt --check` — PASS. `forge build` — PASS, no warnings. `forge test` — **382 tests pass, 0
  failed** across 39 suites: 318 preserved TASK 1–6B-1B tests + 64 in this milestone —
  `RialtoAdapterSecurityTest` 26 (incl. `testConstructorWrongChainReverts`, malformed/truncated
  executionData), `RialtoAdapterHostileTest` 11 (incl. `testFalseReturnIgnored`), the adapter swap/base
  harness, `CoordinatorFundingTest` 19 (dual-role occupancy, exact single/distinct records, hostile
  no-record, reassignment/recombination/replay/out-of-order prevention, preloaded donations, reserve
  never released), `RialtoEndToEndTest` 5 (full flow, invalid/duplicate claim, hostile rollback,
  fee-on-transfer stock rejection through the adapter→vault path).
- `npm run test --workspace @bps/rialto` — **30 pass** (27 quote-client via the `@bps/rialto/server`
  subpath + 3 boundary/workspace, incl. the structural test that the main barrel excludes
  `fetchRialtoAllowanceQuote`). Full TS suite **97 pass**.
- `npm run check` — see below (run as the final gate). `git diff --check` — clean. Secret scan over all
  changed files — no real credential; the Rialto registry address appears only in `IRialtoRouterRegistry`
  NatSpec; the quote client reads `RIALTO_API_KEY` server-side only; tests use a placeholder key.
- Frozen files confirmed unchanged (`git diff` empty): `BPSToken`, `DistributionClaimManager`,
  `BPSLockingVault`, `BPSTradeRouter`, `StockAcquisitionVault`, `UniswapV3BPSSwapAdapter`, all frozen
  interfaces (incl. `IStockAcquisitionAdapter`), their tests, and `packages/shared/src`. No new dependency.

Prior — TASK 6B-2 + coordinator + end-to-end verification run 2026-07-22 with Forge 1.7.1 and Node
24.18.0 (superseded by the redesign above; the coordinator was later rebuilt as acquisition-recording
and the adapter gained the chain-4663 guard). Baseline confirmed at
`64825a3185b34100a1b36b44daac31e28b3c8c68` (the TASK 6B-1B commit); working tree was clean before edits.
Commands actually run:

- `forge fmt --check` — PASS. `forge build` — PASS, no warnings (production contracts use OZ
  `SafeERC20`/`ReentrancyGuard`; the low-level `router.call` in the Rialto adapter targets only the
  registry-resolved, validated router).
- `forge test` — **372 tests pass, 0 failed** across 39 suites: 318 preserved + **54 new** —
  `RialtoAdapterSwapTest` 3, `RialtoAdapterSecurityTest` 22, `RialtoAdapterHostileTest` 10,
  `CoordinatorFundingTest` 15, `RialtoEndToEndTest` 4.
- `forge inspect` (methods) — `RialtoStockAcquisitionAdapter` and `DistributionFundingCoordinator` each
  expose exactly **1 state-mutating function** (`acquireStock` / `fundAndPublishCycle`) plus immutable/
  view getters; structural-absence scan clean (no owner/setter/sweep/rescue/withdrawal/Permit2/gasless/
  Universal-Router/delegatecall/proxy/upgrade).
- `npm run test --workspace @bps/rialto` — **28 pass** (27 quote-client + 1 workspace); `npm run check`
  — **PASS end-to-end** (exit 0): format, lint, typecheck, 94 TS tests, build, and all three Foundry
  stages (372 tests).
- `git diff --check` — clean (only benign LF→CRLF notices on docs). Secret/credential/live-address scan
  over all new files — **no real credential**; the Rialto registry address appears only in the
  `IRialtoRouterRegistry` NatSpec (documented verified fact, never in execution logic — the adapter
  resolves the router from the registry at runtime); the quote client reads `RIALTO_API_KEY` server-side
  only and never exposes it; tests use a placeholder key.
- Frozen files confirmed unchanged: `git diff` empty for `BPSToken`, `DistributionClaimManager`,
  `BPSLockingVault`, `BPSTradeRouter`, `StockAcquisitionVault`, `UniswapV3BPSSwapAdapter`, all frozen
  interfaces, their tests, and the `packages/shared/src` PoD engine. No new dependency or generated file.

TASK 6B-1B verification run 2026-07-22 with Forge 1.7.1 and Node 24.18.0. Baseline confirmed at
`0f326913b01780a1d9c6284a0c9a8824194e8069` (HEAD, the TASK 6B-1A commit); working tree was clean
before edits. Commands actually run:

- `forge fmt --check` — PASS. `forge build` — PASS, no warnings (production `UniswapV3BPSSwapAdapter`
  uses OZ `SafeERC20`/`ReentrancyGuard`; the mock venues' unchecked transfers carry scoped `forge-lint`
  directives).
- `forge test` — **318 tests pass, 0 failed** across 34 suites: the 262 preserved TASK 1–6B-1A tests
  plus **56 new** — `SwapAdapterConstructorTest` 16, `SwapAdapterSwapTest` 5, `SwapAdapterSecurityTest`
  15, `SwapAdapterHostileTest` 12, `SwapAdapterDonationTest` 2, `SwapAdapterFuzzTest` 2 (@ 256 runs),
  `RouterUniswapIntegrationTest` 4. Covers constructor/alias/code-presence validation, caller/pair/
  same-token/zero-amount/deadline rejection, all seven rejected recipient sentinels (incl. the
  corrected `address(1)`/`address(2)`), exact-input & minimum passthrough, immutable fee &
  `sqrtPriceLimitX96 == 0`, direct-recipient delivery with double (returned vs observed) verification,
  approval clearing, no-residual custody, donation tolerance, and atomic rollback under every hostile
  venue mode + reentrancy + fee-on-transfer; plus the frozen-router integration (buy, buyback-burn with
  true `totalSupply` reduction, sell, BPS-ECON-2.0 economics, allowances→0, hostile-venue rollback).
- `forge inspect src/adapters/UniswapV3BPSSwapAdapter.sol:UniswapV3BPSSwapAdapter methods` — **1
  state-mutating function** (`swapExactInput`) + 5 immutable getters; no owner/setter/pause/sweep/
  withdraw/rescue/arbitrary-call/upgrade surface.
- `npm run check` — **PASS end-to-end** (exit 0): 68 TS tests + 318 Foundry tests.
- `git diff --check` — clean (only benign LF→CRLF notices on docs). Frozen files (`BPSToken`,
  `DistributionClaimManager`, `BPSLockingVault`, `BPSTradeRouter`, `StockAcquisitionVault`, and all
  their tests + `IBPSSwapAdapter`/`IBPSBurnable`/`IStockAcquisitionAdapter`) show **no diff**. No new
  npm dependency or generated file appeared; no secret/credential is in the diff.

TASK 6B-1A **security correction** (net-residual-custody) run 2026-07-22 with Forge 1.7.1 and Node
24.18.0. HEAD unchanged at `33062815b1ad83c1f6b6ad43dc9957a77a5a6f35`. Gap found and closed: the
original `executeAcquisition` verified only the vault's own balance deltas, so an adapter that pulled
the exact WETH but retained it, or delivered ≥ min stock while skimming extra into itself, passed all
checks. Fix: record the adapter's WETH and selected-stock balances before the call and require each to
equal its pre-call baseline afterward (`ResidualWethInAdapter` / `ResidualStockInAdapter`), plus
both-side (sender + recipient) delta checks on reserve delivery and distribution release. Commands run:

- `forge fmt --check` — PASS. `forge build` — PASS, no warnings.
- `forge test` — **262 tests pass, 0 failed** (was 258; +4 new `StockVaultResidualTest`:
  retained-WETH revert, skimmed-stock revert, donation-tolerant honest success, donation-does-not-mask
  retained-WETH — each with full atomic-rollback assertions over vault/adapter/reserve/sink balances,
  accounting mappings, and the vault→adapter allowance). The mocks were reworked into true
  pass-through adapters (route WETH to a sink, stock from a source, hold nothing) so honest behavior
  satisfies the residual checks; two hostile modes added (`RETAIN_WETH`, `SKIM_STOCK`).
- `forge inspect ... methods` — still **2 state-mutating functions** only; error count 15 → **17**
  (added the two residual errors); 7 storage slots unchanged; no owner/pause/setter/sweep/withdraw/
  rescue/arbitrary-recipient/arbitrary-call/upgrade surface.
- `npm run check` — **PASS end-to-end** (exit 0): 68 TS tests + 262 Foundry tests.
- `git diff --check` — clean (only benign LF→CRLF notices on docs). Frozen files (`BPSToken`,
  `DistributionClaimManager`, `BPSLockingVault`, `BPSTradeRouter`, both router interfaces, and all
  their tests) show **no diff**.

TASK 6B-1A verification run 2026-07-22 with Forge 1.7.1 and Node 24.18.0. Baseline confirmed at commit
`33062815b1ad83c1f6b6ad43dc9957a77a5a6f35` (HEAD, the TASK 6A checkpoint); working tree was clean
before edits. Commands actually run:

- `forge fmt --check` — PASS. `forge build` — PASS, **no warnings** (the mock-adapter
  `erc20-unchecked-transfer` lint notes are suppressed with scoped `forge-lint` directives; the
  production `StockAcquisitionVault.sol` uses OZ `SafeERC20`/`Math` throughout and is warning-clean).
- `forge test` — **258 tests pass, 0 failed** across 26 suites: the 202 preserved TASK 1–6A tests plus
  **56 new** — `StockVaultConstructorTest` 17, `StockVaultAcquisitionTest` 13, `StockVaultHostileTest`
  12, `StockVaultReleaseTest` 8, `StockVaultAccountingTest` 5, `StockVaultFuzzTest` 1 (@ 256 runs).
  Covers constructor/basket validation, executor-only authority, unapproved-stock/zero/deadline/
  custody rejection, exact-WETH-spend and minimum enforcement, report-vs-observed equality, approval
  clearing, atomic rollback under every hostile adapter mode (lie-over/under, under-min, partial/excess
  spend, wrong-token, no-delivery, retain-stock, reentrancy, revert) and a fee-on-transfer stock token,
  the 80/20 split with rounding remainder to reserve, multi-token accounting isolation, immutable-
  recipient-only releases with over-release prevention, donation-safe accounting, and native-ETH reject.
- `forge inspect src/StockAcquisitionVault.sol:StockAcquisitionVault methods / storage-layout` — 22
  external functions (only 2 state-mutating), 7 storage slots (see §7); forbidden-surface scan clean
  (no owner/pause/setter/sweep/withdraw/arbitrary-recipient/arbitrary-call/basket-mutation/upgrade).
- `npm run check` — **PASS end-to-end** with `forge` on PATH: format:check, lint, typecheck, test
  (68 TS tests), build, fmt:contracts, build:contracts, test:contracts (258 Foundry tests).
- Repository search over the new TASK 6B-1A files (`StockAcquisitionVault.sol`,
  `IStockAcquisitionAdapter.sol`, `StockVault*.t.sol`, `MockStockAcquisitionAdapter.sol`,
  `HostileStockAcquisitionAdapter.sol`) for private keys/RPC URLs/real addresses, the Rialto Router
  Registry / chain ID 4663, `.env`/`vm.env`/`ffi`, `delegatecall`/`selfdestruct`/`tx.origin`, and any
  owner/pause/sweep/withdraw/upgrade surface — **no matches** (only the word "Insu**ffi**cient" and
  NatSpec text documenting the absence of those surfaces). The verified Rialto facts live only in this
  handover, never in a contract.
- Frozen files confirmed unchanged: `git status` shows **no diff** for `BPSToken.sol`,
  `DistributionClaimManager.sol`, `BPSLockingVault.sol`, `BPSTradeRouter.sol`, `IBPSSwapAdapter.sol`,
  `IBPSBurnable.sol`, or any of their tests. All TASK 6B-1A files are new/untracked.

TASK 6A verification run 2026-07-22 with Forge 1.7.1 and Node 24.18.0. Baseline confirmed at commit
`c443b925c0c59488bbe4a3404fe929dafd694b22` (HEAD). Commands actually run:

- `forge fmt --check` — PASS. `forge build` — PASS, **no warnings** (the four
  `erc20-unchecked-transfer` lint notes on the two test-only mock adapters —
  `MockSwapAdapter.sol`, `HostileSwapAdapter.sol` — are intentionally suppressed with scoped
  `forge-lint: disable-next-line(erc20-unchecked-transfer)` comments; the production
  `BPSTradeRouter.sol` uses OZ `SafeERC20` throughout and is warning-clean).
- `forge test` — **202 tests pass, 0 failed** across 20 suites: the 132 preserved TASK 1–5 tests
  plus **70 new** — `RouterConstructorTest` 10, `RouterBuyTest` 19, `RouterSellTest` 19,
  `RouterSecurityTest` 13, `RouterFuzzTest` 3 (@ 256 runs), `BurnProofTest` 6. Covers buy/sell
  arithmetic and rounding-to-user, exact-delta funding/delivery, true burn with `totalSupply`
  verification, no-residue, donation exclusion, router-enforced minimums, inclusive deadlines,
  zero-budget skips, hostile-adapter rejection (lie/short/fail/reenter), pause/ownership/renounce-
  disabled/native-ETH-reject, cumulative accounting across mixed trades, and the BPSToken self-burn
  properties.
- `forge inspect src/BPSTradeRouter.sol:BPSTradeRouter methods / storage-layout` — 28 external
  functions (constructor not counted), 11 compiler-declared storage slots (see §7); forbidden-surface
  scan clean (no fee/token/adapter/recipient/burn setter, no sweep/rescue/withdraw/seize, no arbitrary
  call, no upgrade/proxy/delegatecall). `forge inspect src/BPSToken.sol:BPSToken methods` — unchanged
  12-function surface (`burn`/`burnFrom` present via `ERC20Burnable`), confirming no token change was
  needed.
- `npm run check` — all TS stages PASS (format:check, lint, typecheck, test = 68 TS tests, build);
  the three Foundry stages (`fmt:contracts`, `build:contracts`, `test:contracts` = 202 tests) PASS
  **when `forge` is on PATH** (verified by running the three contract npm scripts directly with the
  Foundry bin prepended — see §11 PATH note). The single non-code failure in a bare `npm run check`
  is only that the npm-spawned shell did not inherit the Foundry bin on PATH; it is an environment
  issue, not a code defect.
- Repository search over the new TASK 6A files (`BPSTradeRouter.sol`, `interfaces/*.sol`,
  `Router*.t.sol`, `BurnProof.t.sol`, `MockWETH.sol`, `MockSwapAdapter.sol`, `HostileSwapAdapter.sol`)
  for private keys/seeds, RPC URLs, real token/personal addresses, `.env`/`vm.env`/`ffi`,
  `delegatecall`/`selfdestruct`/`tx.origin`, and obsolete economics
  (stewardship/treasury/graduation/rebase/reflection/transfer-tax) — **zero matches**; the only hits
  were event names and comment text.
- Frozen files confirmed unchanged: `git status` shows **no diff** for `BPSToken.sol`,
  `BPSToken.t.sol`, `DistributionClaimManager.sol`, or `BPSLockingVault.sol`; the only tracked change
  is `.gitignore` (added `.claude/settings.local.json`, which `git check-ignore` confirms is now
  ignored and untracked). All other TASK 6A files are new/untracked.

TASK 5 verification run 2026-07-22 with Forge 1.7.1 and Node 24.18.0. Commands actually run:

- `forge fmt --check` — PASS. `forge build --force` — PASS, **no warnings** (two `unsafe-typecast`
  notes on `uint16(POLICY_VERSION)` were removed by using a dedicated `uint16` constant; the
  `block.timestamp` comparison in `withdraw` carries a scoped `forge-lint` disable + rationale).
- `forge test` — **132 tests pass, 0 failed** across 14 suites: the 82 preserved TASK 1–4 tests
  plus 50 new `BPSLockingVault` tests (`LockingVaultPolicyTest` 8, `LockingVaultLifecycleTest` 20,
  `LockingVaultWeightTest` 4, `LockingVaultEmergencyTest` 6, `LockingVaultAccountingTest` 4,
  `LockingVaultHostileTest` 4, `LockingVaultFuzzTest` 4 @ 256 runs). Covers all 80 required test
  items (79 mapped to dedicated tests + item 80 = the preserved TASK 3/4 suites still passing).
- `forge inspect ... methods / abi / storage-layout` — 20 external functions (constructor not
  counted), 5 events, 15 errors, 8 compiler-declared storage variables in 7 slots. Forbidden-surface
  scan clean (see §7; the three "merge" hits are the substring inside "emergency").
- `npm run check` — **PASS end-to-end** (exit 0): format:check, lint, typecheck, test (68 TS tests),
  build, fmt:contracts, build:contracts, test:contracts (132 Foundry tests).
- Repository search over the new TASK 5 files (`BPSLockingVault.sol`, `LockingVault*.t.sol`,
  `FailingERC20Mock.sol`, `ReentrantBPSMock.sol`) for RPC URLs, private keys/seeds, real token/
  personal addresses, `ECON-1.0`/`150-50`/stewardship, mutable-tier or transferable-veBPS surfaces,
  ordinary early unlock, owner/admin participant-fund withdrawals, arbitrary recipients, rescue/
  drain, proxy/upgrade code, and TASK 6 leakage — **zero matches**.
- Frozen files confirmed byte-unchanged: `DistributionClaimManager.sol` SHA-256 prefix
  `F5A9CB12FCFC550A` (matches the TASK 4 audit); `BPSToken.sol` / `BPSToken.t.sol` untouched.

TASK 4 verification run 2026-07-22 with Forge 1.7.1 and Node 24.18.0. Commands actually run:

- `forge fmt --check` — PASS. `forge build --force` — PASS, **no warnings** (the four
  `block-timestamp` lint notes on the claim-window comparisons are intentionally suppressed with
  scoped `forge-lint: disable-next-line(block-timestamp)` comments and a rationale; one
  `erc20-unchecked-transfer` note on a test donation helper is likewise suppressed).
- `forge test` — **82 tests pass, 0 failed** across 7 suites: `BuildProbeTest` 1, `BPSTokenTest`
  23 (unchanged), `LeafVectorTest` 3, `PublicationTest` 18, `ClaimsTest` 21,
  `RecoveryAccountingTest` 12, `FuzzTest` 4 (256 runs each). Covers all 56 required test items.
- Canonical Solidity compatibility vector (`LeafVectorTest`): the frozen leaf recomputed with
  `abi.encode` + double keccak equals the audited leaf
  `0xac90578a19c27ce2da8491889e35c371cef25ffa7bda44aa7294259a8ce0cb21`; the audited proof verifies
  against the audited root `0x9b85d4fffa825ad596f5a4062131d90a38eb432dbbe169ee752890170092217d` via
  OZ `MerkleProof`; tampering each of the six bound fields fails. (This test uses the fictional
  `0x…c1a1` manager address and does not call the deployed manager.)
- `forge inspect ... methods / abi / storage-layout` — 16 external functions (constructor not
  counted), 6 events, 26 errors, **6 compiler-declared storage slots** (`storage-layout` does not
  include the inherited standard `ReentrancyGuard`'s fixed ERC-7201 namespaced slot, which is a real
  persistent slot accessed via `StorageSlot` — see §7; the contract uses storage-based, not
  transient, reentrancy protection). Privileged-surface scan
  (setRoot/updateCycle/updateWindow/pause/rescue/sweep/withdraw/drain/upgrade/migrate/setRecovery)
  over function names returned **zero matches**.
- `npm run check` — **PASS end-to-end** (exit 0): format:check, lint, typecheck, test (68 TS
  tests), build, fmt:contracts, build:contracts, test:contracts (82 Foundry tests).
- Repository search over new/changed files for real RPC URLs, private keys, real token addresses,
  `ECON-1.0`, `150/50`/`150 BPS`/`50 BPS`, `stewardship`, root-update functions, arbitrary recovery
  recipients, generic admin drains, and proxy/upgrade code — only benign matches: the audited
  32-byte Merkle hashes in `LeafVector.t.sol` (required vectors, not keys/addresses) and NatSpec
  wording documenting the permissionless-recovery-to-fixed-recipient and the absence of drains/
  upgrades. No secrets, real addresses, obsolete economics, or dangerous surfaces.

### TASK 3 final artifact/Merkle audit (2026-07-22)

Ran `npm run proof:mock -- --out <fresh>` twice
into separate directories and independently re-derived all leaves/proofs from the emitted bytes
with viem (not the generator). **No defect found.** Audited canonical values for the checked-in
fixture (fixed anchors for TASK 4):

- Artifact SHA-256 (bytes; all LF-only, single terminal newline; identical across both runs):
  - `cycle-manifest.json` — 5830 bytes —
    `38FB5AD2DACE69D015183566832BD66CBE1F473EC2237AB23E4FA2E317AEE5F3`
  - `allocations.json` — 4151 bytes —
    `AF2552E4F5A414FC0CE186766505F6773702BEB83D57C7B0A7E9AE2356EF0DD6`
  - `wallet-proofs.json` — 13361 bytes —
    `2A749628E8CD7FB72935B41E08FB9C7A3F064A957B0A54A69B7DD4286C8DBC2C`
  - `reconciliation.json` — 2071 bytes —
    `5FBF890E31C6D71A97016C0104E3DD3B5742EC52351BF0060FAF80C1DB24CB63`
- Manifest: manifestSchema `bps.pod.manifest/1`; leafSchema `bps.pod.leaf/1`; economics
  `BPS-ECON-2.0`; rewardPolicy `vebps-1`; chainId 987654; claimManager
  `0x000000000000000000000000000000000000c1a1`; cycleId 42; claimStart 1800001000; claimDeadline
  1800600000; publishable true; totalEligibleSnapshotBalance 560000; totalBaseTwab 560000;
  totalEffectiveWeight 720000.
  - **Merkle root** `0x9b85d4fffa825ad596f5a4062131d90a38eb432dbbe169ee752890170092217d`
  - **allocationsContentHash** `0x9f677bbf8f200eea2cae9b785ee2d4cf8a32c227d335e3dda149c71e0b7c355f`
  - **manifest envelopeHash** `0xc83e41d2e1af4cbdaeadf8da6dcd13962630be9f951162321ddcb6c71a8cd46c`
  - Both hashes independently recomputed (keccak256 over canonical payload) and matched.
- First canonical entitlement (sorted by wallet, then asset): chainId 987654, claimManager
  `0x…c1a1`, cycleId 42, wallet `0x0000000000000000000000000000000000001001`, asset
  `0x000000000000000000000000000000000000a006` (USDX), amount 111111111111. Leaf
  `0xac90578a19c27ce2da8491889e35c371cef25ffa7bda44aa7294259a8ce0cb21` — independently recomputed
  via viem `keccak256(bytes.concat(keccak256(abi.encode(...))))` and matched; proof folds
  (sorted pairs) to the published root.
- Independent verification from bytes: **21/21 proofs verify**; 7 wallets × 3 claims each; claims
  in ascending asset order; mixed-case wallet lookup returns 3 claims; unknown-wallet lookup empty.
- Entitlements (from `allocations.json`): exactly **21** nonzero tuples; every
  `(cycleId, wallet, asset)` unique; no zero-value entitlement; all addresses canonical
  (lowercase 20-byte); per-asset entitlement sums equal recorded `allocated`.
- Per-asset reconciliation (raw units never summed across unlike assets):
  - USDX (6): acquired 1000000000001, reserve 200000000001, pool 800000000000, allocated
    799999999997, dust 3.
  - WBTX (8): acquired 5000000001, reserve 1000000001, pool 4000000000, allocated 3999999998,
    dust 2.
  - GOVX (18): acquired 1000000000000000000000001, reserve 200000000000000000000001, pool
    800000000000000000000000, allocated 799999999999999999999997, dust 3.
  - For every asset: `pool+reserve==acquired`, `allocated+dust==pool`,
    `reserve+allocated+dust==acquired`, `fundedRequired==claimable==unclaimed==allocated`,
    `claimed==0`, `claimExecuted==false`.
- `npm run check` re-run after the audit — PASS end-to-end (exit 0); no source/fixture/test files
  changed (docs-only HANDOVER update).

TASK 3 verification run 2026-07-22 (console local time ~00:33–00:50) with Node 24.18.0 and Forge
1.7.1. Commands actually run:

- `npm install` (after adding PoD deps) — PASS (added `@openzeppelin/merkle-tree` 1.0.8, `viem`
  2.55.5, `zod` 4.4.3, plus transitive packages; `sharp@0.34.5` install-script skipped by npm
  allow-scripts policy — harmless; a transitive `uuid@9` deprecation warning is harmless).
- `npm run check` — **PASS end-to-end** (exit 0). Sequence: format:check PASS, lint PASS,
  typecheck PASS, test PASS, build PASS, fmt:contracts PASS, build:contracts PASS,
  test:contracts PASS.
  - `npm run test` — 68 TS tests pass: `@bps/shared` 8 files / 52 tests (epoch, twab, multiplier,
    allocation, merkle, validate, serialize, workspace-info); `@bps/pilot` 2 files / 12 tests
    (fixture end-to-end); indexer/worker/db/rialto 1 each.
  - `forge test -vv` — 24 tests pass (23 `BPSTokenTest` + 1 `BuildProbeTest`).
- `npm run proof:mock -- --out <dir>` — PASS (exit 0). Output: publishable=true, 21 entitlements
  (7 eligible wallets × 3 assets), `totalEffectiveWeight=720000`; generator proofs OZ 21/21 and
  viem 21/21; independent (viem-from-bytes) proofs 21/21; manifest envelope hash ok; allocations
  content hash ok. Multiplier weights on the five real wallets: 100000 / 110000 / 125000 / 150000
  / 175000. Per-asset dust: USDX 3, WBTX 2, GOVX 3; each asset conserves acquired = reserve +
  allocated + dust.
- **Byte-for-byte reproducibility** — ran the CLI twice into two separate directories; all four
  artifacts SHA-256-identical (`cycle-manifest.json`, `allocations.json`, `wallet-proofs.json`,
  `reconciliation.json`), no CR bytes, single trailing LF each.
- **Superseded-terms search** — case-insensitive search over new/changed files for `ECON-1.0`,
  `150 BPS`, `50 BPS`, `150/50`, `stewardship`, `2.98%`, `3% sell`, `5% sell`. The only matches are
  legitimate negatives: a prohibition comment in `constants.ts`, the guard-test term list in
  `pipeline.test.ts`, and a rejection test asserting `BPS-ECON-1.0` is refused in `validate.test.ts`.
  No new implementation, fixture, README, or HANDOVER current-state text presents them as active
  economics.

## 11. Known issues and blockers

- **No local functional blockers.** All TASK 1–5, 6A, 6B-1A, 6B-1B, and the 6B-2 milestone with the
  acquisition-recording coordinator pass locally (398 Foundry + 97 TS tests; TASK 7 closed the two
  funding-rollback gaps and added the deployment-validation + fork-rehearsal suites). The remaining blockers
  below prevent any deployment / public beta and are grouped by kind.
- **Code blockers (local):** none — the local architecture is complete and safe. One design decision to
  finalize before deployment: whether to pin an exact Rialto settlement selector in the adapter. This
  task did NOT independently verify the deployed Rialto router ABI, so the adapter relies on the
  registry-locked target + strict invariants and forwards the unmodified quote calldata (no guessed
  selector). If the official router ABI is verified, optionally restrict the low-level call to that
  exact selector.
- **Verified-address / configuration blockers:** the Robinhood Chain **WETH** address; the deployed
  **BPS** address; the approved **stock-token** addresses; the **current feature-2 Rialto router**
  (resolved on-chain from Router Registry `0x71a120…687E`, whose exact ABI — `ownerOf(2)` — must be
  verified against the deployed registry); the **BPS/WETH v3 pool** address + fee tier; initial price
  and liquidity + pool provenance (official Uniswap factory); the Rialto quote **base URL** and the
  exact quote-response schema; and the three **circular deterministic deployment sequences**
  (router↔Uniswap-adapter, vault↔Rialto-adapter, vault↔coordinator, plus claim-manager owner =
  coordinator) — each resolved by nonce-predicted CREATE with on-chain immutable verification, no
  one-time setter. None are guessed; all are configurable and blocked from deployment.
- **Operational blockers:** the vault's `acquisitionExecutor` and the coordinator's `rootPublisher` are
  **trusted governance/keeper roles** (a Security Safe / keyed keeper). The acquisition path is NOT
  fully permissionless or fully decentralized: it depends on the protected Rialto **quote service**
  (server-only, bearer-key) and a trusted executor supplying `minStockOut`. Caller-supplied
  `minStockOut` alone does not make execution price-safe; a **price/oracle slippage guard** (e.g.
  Chainlink — addresses unverified, do not add) is required for a safe permissionless/public flow and
  is a public-beta blocker. Operational transaction limits and slippage policy must be set.
- **Legal / eligibility blockers:** **Robinhood Stock Tokens carry jurisdiction and eligibility
  restrictions.** This is recorded as a **public-beta launch blocker**; BPS provides no legal
  conclusion and requires external legal and eligibility review before any live beta. The quote API is a
  centralized, protected service — the acquisition path is not decentralized and must not be described
  as such.
- **Post-beta improvements:** pin the exact Rialto settlement selector once verified; an on-chain oracle
  slippage guard for permissionless acquisition; the 15-minute epoch indexer / TWAB aggregation; a
  production frontend; transferable veBPS; an eligibility contract.
- **Credential handling:** an external protected Rialto API credential exists but is **not stored, read,
  used, logged, or exposed by this repository** and is never recorded here. The quote client reads
  `RIALTO_API_KEY` from the server environment only (never a `NEXT_PUBLIC_*` variable) and never returns
  or logs it; tests use a placeholder value only.
- **Deployment blocker (by design): `UniswapV3BPSSwapAdapter` is not deployable yet.** Unresolved:
  the Robinhood Chain WETH address, the deployed BPS address, the BPS/WETH v3 pool + fee tier, initial
  price/liquidity, pool-provenance verification (official factory), and the **circular router↔adapter
  deployment sequence** (each stores the other immutably; requires a deterministic / nonce-predicted
  deploy of the second contract at the first's predicted address, then on-chain verification of both
  immutables — there is deliberately no one-time setter). The constructor does not verify the official
  SwapRouter02/factory, pool existence/initialization, fee tier, or liquidity; those are deployment
  gates. Native ETH forced onto the adapter (via `selfdestruct`/coinbase) cannot be prevented and
  would remain stuck (no recovery path) — documented, not a functional defect.
- **Deployment blocker (by design): `StockAcquisitionVault` is not deployable yet.** It binds the
  `acquisitionExecutor` and `distributionFundingCoordinator` addresses immutably. The concrete
  `DistributionFundingCoordinator` now exists and is intended to be **both** of those addresses (it
  records and funds each acquisition), but the governance-address set (`acquisitionOperator`,
  `rootPublisher`, `reserveRecipient`, claim-manager `recoveryRecipient`) and the deterministic deploy
  order are not finalized. Because the vault's adapter, executor, reserve, coordinator, and basket are
  all immutable, changing any of them requires a new vault (and, since the router binds the vault as
  `stockBudgetRecipient`, a new router). The deploy sequence must place the coordinator at the vault's
  predicted executor==coordinator address and make the coordinator the claim manager's owner — via
  nonce-predicted CREATE, no one-time setter.
- Router ownership hardening (by design, not a risk): unlike the claim manager and locking vault,
  `BPSTradeRouter` **disables** `renounceOwnership` (reverts `RenounceDisabled`) so it can never be
  stranded ownerless or lose its emergency pause. Ownership moves only through the two-step
  `transferOwnership`/`acceptOwnership` flow. The owner has no economic or fund authority — only
  pause/unpause.
- Router dependency prerequisite (not a defect): the router's swap adapter and stock-budget recipient
  are immutable, so a **trusted production `IBPSSwapAdapter` and a real stock-acquisition vault must
  exist before the router is deployed**. The production adapter (`UniswapV3BPSSwapAdapter`, 6B-1B) and
  the stock vault (`StockAcquisitionVault`, 6B-1A) now exist and are tested locally, but neither is
  deployed and both carry their own deployment gates (§11). Deploying against a wrong/malicious adapter
  or recipient would require redeploying the router.
- Availability risk (not a defect): `BPSLockingVault` retains OZ `Ownable`'s single-step
  `renounceOwnership`. Assessment: **acceptable / documented (option B)** — it does not conflict
  with the frozen requirements. Matured and self-service withdrawals are permissionless and remain
  operational after renunciation; the owner never has withdrawal/redirect authority over participant
  principal. The only consequence is that renouncing **before** activating emergency exit
  permanently removes the ability to enable emergency exit (early self-withdrawal for still-locked
  positions). Mitigation: governance should reach the vault via the two-step
  `transferOwnership`/`acceptOwnership` flow and only renounce deliberately. No code change is
  warranted (disabling it is not required by the frozen spec).
- Operational risk (not a defect): `DistributionClaimManager` retains OZ `Ownable`'s single-step
  `renounceOwnership`. Assessment: **acceptable / documented risk (option B)** — it does not conflict
  with the frozen requirements. It cannot alter published cycles, roots, windows, or funds, and
  participant claims and permissionless expired recovery keep working after renunciation; it only
  disables publishing new cycles. The risk is that an _accidental_ renunciation permanently disables
  future cycle publication. Mitigation: governance should reach the manager via the two-step
  `transferOwnership`/`acceptOwnership` flow and avoid `renounceOwnership` unless intentionally
  freezing new distributions. No code change is warranted (disabling it is not required by the
  frozen spec).
- Build-order note (not a blocker): `@bps/pilot` imports `@bps/shared`, so the root `typecheck`,
  `test`, `build`, and `proof:mock` scripts prebuild `@bps/shared` (see §9). A clean `npm install`
  followed by `npm run check` works without manual ordering.
- PATH note (not a blocker): Forge is installed at `C:\Users\Administrator\.foundry\bin` but may
  not be on a fresh shell's PATH. If `forge` is "not recognized", prepend that directory to PATH
  for the session, e.g. PowerShell:
  `$env:Path = "C:\Users\Administrator\.foundry\bin;" + $env:Path` before running the contract
  scripts or `npm run check`.
- Commit state: TASK 1–5, 6A, and 6B-1A are committed (HEAD `0f326913…`); the TASK 6B-1B working-tree
  changes are **not** committed (user instruction: do not commit yet).

## 12. Recent change log

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

## 13. Next-session pickup

1. Read `CLAUDE.md` and this file first.
2. Ensure Forge is on PATH (see §11 PATH note). Run `npm install` (if `node_modules` is missing),
   then `npm run check` with Forge on PATH — expect a full end-to-end PASS (**129** web vitest tests +
   the other TS workspaces, 398 Foundry tests). The **Playwright browser E2E** is separate:
   `npm run test:e2e --workspace @bps/web` (real Chromium; run `npx playwright install chromium` first if
   needed). The mainnet-fork deploy rehearsal is opt-in:
   `ROBINHOOD_FORK_RPC=<read-only rpc> forge test --match-contract ForkDeployRehearsal`. TS subsets:
   `npm run test --workspace @bps/web` (**129 tests**). Contract subsets: `forge test --match-contract
"RialtoAdapter|CoordinatorFunding|RialtoEndToEnd"`, `... "DeployConfigValidation"`, `... "StockVault"`.
   The working tree carries the TASK 8 restricted-beta application (`apps/web`) unless it has been
   checkpointed as `feat(app): integrate restricted beta protocol flows`.
3. **TASK 8 (restricted-beta application) is complete; TASK 7's NO-GO for a live deployment stands** —
   application integration does not lift it. The app fails closed (writes disabled without a valid live
   manifest), keeps eligibility separate from terms acceptance, keeps the Rialto client server-only, and
   labels all fixtures. Deferred with documented blockers: a real wallet-connect + EIP-712-signing UI and
   React/browser tests (need wagmi/@testing-library/jsdom — not installed), and a governance/legal-final
   EIP-712 declaration domain (the current one is a labeled scaffold). NO-GO remains blocked on the
   BPS/WETH pool + fee tier, user-supplied deployer/role addresses, the beta basket selection, an on-chain
   slippage/oracle guard, and external legal/eligibility + security review (all §11). The TASK 7
   deployment package is ready and fails closed: `script/BPSDeployment.sol` + `script/DeployBPS.s.sol` +
   `deploy/` (schema, dry-run manifest, runbook) + `.env.example`; the fork rehearsal proves the
   deterministic wiring against the real externals. The coordinator occupies both frozen vault roles; the
   Rialto adapter is chain-4663-guarded; the quote client is server-only via `@bps/rialto/server`. Do NOT
   begin live deployment, pool creation, liquidity provision, or the separate launchpad project.
   Before any deployment, resolve the §11 blockers: the verified BPS/WETH pool + fee tier + liquidity;
   the user-supplied deployer/role/basket values; a price/oracle slippage guard; operational controls; and
   external legal/eligibility review (Robinhood Stock Tokens have jurisdiction limits). The external
   Robinhood Chain dependencies (WETH, registry + fail-closed `ownerOf(2)`, feature-2 router, SwapRouter02
   - factory, stock candidates) are already verified (§7). Before any
     deployment, resolve the §11 blockers: verified WETH/BPS/stock/router/pool addresses + fee tier; the
     exact Rialto router ABI (`ownerOf(2)`) and settlement selector; a price/oracle slippage guard;
     operational controls; the circular deterministic deployment sequences (router↔Uniswap-adapter,
     vault↔Rialto-adapter, vault↔coordinator **for both roles**, claim-manager owner = coordinator); and
     external legal/eligibility review (Robinhood Stock Tokens have jurisdiction limits).
     Do NOT create/use/expose the Rialto API key or make a live quote request. When resuming, honor the §6
     rules (Rialto adapter, coordinator, 80/20, router, burn-truth) and the frozen contracts; introduce no
     economics other than
     `BPS-ECON-2.0` (WETH allocation) and the frozen 80/20 (acquired-stock split). Do not modify the frozen
     `BPSToken`, PoD, `DistributionClaimManager`, `BPSLockingVault`/`vebps-1`, `BPSTradeRouter`, or
     `StockAcquisitionVault`, or `UniswapV3BPSSwapAdapter` without an explicit instruction. Relevant
     files: `packages/contracts/src/StockAcquisitionVault.sol`,
     `packages/contracts/src/interfaces/IStockAcquisitionAdapter.sol`,
     `packages/contracts/test/StockVault*.t.sol`,
     `packages/contracts/test/mocks/{MockStockAcquisitionAdapter,HostileStockAcquisitionAdapter}.sol`,
     `packages/contracts/src/adapters/UniswapV3BPSSwapAdapter.sol`,
     `packages/contracts/src/interfaces/ISwapRouter02.sol`,
     `packages/contracts/test/SwapAdapter*.t.sol`, `packages/contracts/test/RouterUniswapIntegration.t.sol`,
     `packages/contracts/test/mocks/{MockSwapRouter02,HostileSwapRouter02}.sol`,
     `packages/contracts/src/BPSTradeRouter.sol`,
     `packages/contracts/src/interfaces/IBPSSwapAdapter.sol`,
     `packages/contracts/src/DistributionClaimManager.sol`.
