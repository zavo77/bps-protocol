# HANDOVER — BPS Experiment

Last updated: 2026-07-22 (local machine time; verification timestamps below are from command output).
TASK 6A (`BPSTradeRouter` — the official BPS trade router: true BPS burning and stock-acquisition
budget under `BPS-ECON-2.0`) is complete and fully tested under Forge 1.7.1. All assets, addresses,
adapters, budgets, burns, and transactions are **fictional and local-only**; nothing is deployed or
connected to any network, no RPC/wallet/credential is used, no liquidity is created, and no real
trade, swap, or burn executes outside the local Foundry test VM. TASK 6B and any later task have
**not** begun.

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
WETH proceeds); the burn is a **true `totalSupply` reduction** — the router repurchases BPS with the
WETH burn budget through an immutable swap adapter and burns the BPS it receives via the token's
self-burn. All economics, token, adapter, and recipient wiring is immutable; the only owner power is
pause/unpause and two-step ownership (renounce is disabled). All four contracts are implemented and
unit-tested but **not deployed**. **Still unimplemented**: the production Uniswap swap adapter, the
real stock-acquisition vault, the Rialto adapter, protocol-fee-on-transfer (there is none —
economics is trade-routed only), transferable veBPS, eligibility contract, the 15-minute epoch
indexer / TWAB aggregation, database, UI, and any deployment. Economics is **BPS-ECON-2.0** only.
Current execution target: await an explicit TASK 6B (production adapters / vault) definition — do
not begin it (see §13).

## 2. Repository map

- `apps/web` — `@bps/web`. Next.js 16.2.11 (App Router, Turbopack). Single static page stating
  "BPS Protocol — Engineering Build" and "Live pilot functionality is not configured."
  Files: `app/layout.tsx`, `app/page.tsx`, `next.config.mjs` (empty config), `tsconfig.json`.
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
  `src/interfaces/IBPSSwapAdapter.sol` (the exact-input swap-adapter boundary the router calls) and
  `src/interfaces/IBPSBurnable.sol` (the `burn(uint256)` self-burn the router invokes on BPSToken),
  `src/BuildProbe.sol` (harmless probe). Tests (dependency-free: `require`/inline `Vm`, no forge-std)
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
  properties additively without touching `BPSToken.t.sol`). Test-only mocks under `test/mocks/`:
  `MockERC20.sol`, `MockFeeOnTransferERC20.sol`, `ReentrancyProbeERC20.sol` (TASK 4),
  `FailingERC20Mock.sol` + `ReentrantBPSMock.sol` (TASK 5), and `MockWETH.sol` (18-dec WETH stand-in
  with `mint`), `MockSwapAdapter.sol` (honest deterministic fixed-rate BPS/WETH adapter),
  `HostileSwapAdapter.sol` (configurable misbehaving adapter: HONEST/LIE_OVER/LIE_UNDER/SHORT_SPEND/
  FAIL/REENTER) (TASK 6A). Empty `script/` directory. npm scripts `forge:build` / `forge:test` /
  `forge:fmt` wrap forge. Depends on `@openzeppelin/contracts` (npm, pinned exact).
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
- `packages/db`, `packages/rialto` — `@bps/db`, `@bps/rialto`. Placeholder packages, each exporting
  a `WorkspaceInfo` object plus one unit test. No product behavior.
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
- `BPSToken`, `DistributionClaimManager`, and `BPSLockingVault` are frozen and unchanged for TASK 6A
  (byte-identical; `BPSToken.sol`/`BPSToken.t.sol` show no git diff); their tests (23 + 79 + 50) still
  pass.
- Full `npm run check` passes end-to-end (all TS stages plus all three Foundry stages; 68 TS tests,
  202 Foundry tests) when `forge` is on PATH (see §11 PATH note).
- Git repository: TASK 1–5 are committed at checkpoint `c443b925c0c59488bbe4a3404fe929dafd694b22`
  ("checkpoint: complete BPS tasks 1-5"), which is HEAD. TASK 6A files are staged-work-tree only and
  **not committed** (user instruction: do not commit without explicit request).

## 4. In progress

Nothing is mid-implementation. All TASK 1–5 and TASK 6A verification is complete. TASK 6B and any
later task have not begun and must not be started without an explicit definition from the user.

## 5. Not started

- **TASK 6B and beyond (explicitly deferred):** the production Uniswap swap adapter implementing
  `IBPSSwapAdapter` against real pools, the real `StockAcquisitionVault` (the production
  `stockBudgetRecipient`), and the Rialto adapter. None exist; TASK 6A created only the router and
  its interfaces plus test-only mock adapters. Do not create the production adapter, acquisition
  vault, or Rialto adapter here.
- On-chain / live components: liquidity provisioning, real Stock Token registry, the 15-minute epoch
  indexer (direct-wallet TWAB from BPSToken `Transfer` logs combined with lock-position state from
  `BPSLockingVault` events), RPC access / live event indexer, reorg persistence, PostgreSQL /
  migrations, transferable veBPS, eligibility smart contract / live screening, wallet connection,
  proof API, real claim/lock/trade transactions, website/dashboard pages, deployment scripts, and any
  Anvil / testnet / mainnet deployment. None exist; none should be added without an explicit task.
  `DistributionClaimManager`, `BPSLockingVault`, and `BPSTradeRouter` are exercised only in the local
  Foundry test VM — none is deployed and no real claim, lock, withdrawal, trade, swap, or burn has
  executed.

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
  deferred to TASK 6B); only test mocks implement it.
- `BuildProbe.sol` (`packages/contracts/src`) — toolchain probe only, compiles (Solc 0.8.26)
  and its test passes under Forge 1.7.1. **Not deployed**, must never be deployed.
- No deployments on any network. No addresses, transaction hashes, or roles exist. No deployment
  scripts exist. The claim manager, locking vault, and trade router are exercised only in the local
  Foundry test VM.

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
- Robinhood Chain RPC: **not configured**; no RPC client code exists.
- Rialto: **not configured**; `@bps/rialto` is an empty placeholder.
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
  `forge inspect src/BPSTradeRouter.sol:BPSTradeRouter methods`.
- Run only the router/burn suites: `forge test --match-contract
"RouterConstructor|RouterBuy|RouterSell|RouterSecurity|RouterFuzz|BurnProof"` (from
  `packages/contracts`).

Note: `typecheck`, `test`, `build`, and `proof:mock` first run `build:shared`
(`npm run build --workspace @bps/shared`) so consumers of `@bps/shared` resolve its built `dist`
types/JS. This is required because `@bps/pilot` imports `@bps/shared`.

## 10. Latest verification

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

- **No functional blockers.** All TASK 1–5 and TASK 6A verification passes.
- Router ownership hardening (by design, not a risk): unlike the claim manager and locking vault,
  `BPSTradeRouter` **disables** `renounceOwnership` (reverts `RenounceDisabled`) so it can never be
  stranded ownerless or lose its emergency pause. Ownership moves only through the two-step
  `transferOwnership`/`acceptOwnership` flow. The owner has no economic or fund authority — only
  pause/unpause.
- Router dependency prerequisite (not a defect): the router's swap adapter and stock-budget recipient
  are immutable, so a **trusted production `IBPSSwapAdapter` and a real stock-acquisition vault must
  exist before the router is deployed** (TASK 6B). Deploying against a wrong/malicious adapter or
  recipient would require redeploying the router. TASK 6A ships only the interfaces and test mocks; no
  production adapter/vault exists yet.
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
- Nothing is committed to git yet (user instruction: do not commit).

## 12. Recent change log

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
   then `npm run check` with Forge on PATH — expect a full end-to-end PASS (68 TS tests, 202 Foundry
   tests). A quick router re-check: `forge test --match-contract
"RouterConstructor|RouterBuy|RouterSell|RouterSecurity|RouterFuzz|BurnProof"` from
   `packages/contracts`. Optionally `npm run proof:mock -- --out <tmp>` (writes only to `<tmp>`).
3. **Await an explicit TASK 6B (or later) definition before adding any new component.** Do not begin
   it here. TASK 6A intentionally shipped only `BPSTradeRouter` + its two interfaces + test mocks; the
   production `IBPSSwapAdapter` (real Uniswap adapter), the real `StockAcquisitionVault` (production
   `stockBudgetRecipient`), and the Rialto adapter were **explicitly out of scope** and must not be
   created without an explicit task. When TASK 6B is defined, honor the §6 **router rules**
   (immutable wiring, adapter-boundary hardening, exact-delta verification), the **burn-truth rule**
   (a real `totalSupply` reduction, never a dead-address transfer or accounting entry), and the
   **router deployment-order rule** (a trusted adapter + acquisition vault must exist before the
   router is constructed). Do not modify the frozen `BPSToken`, PoD, `DistributionClaimManager`,
   `BPSLockingVault`/`vebps-1`, or `BPSTradeRouter`/`BPS-ECON-2.0` rules in §6, or the audited TASK 3
   artifacts, without an explicit instruction, and introduce no economics other than `BPS-ECON-2.0`.
   Relevant files: `packages/contracts/src/BPSTradeRouter.sol`,
   `packages/contracts/src/interfaces/IBPSSwapAdapter.sol`,
   `packages/contracts/src/interfaces/IBPSBurnable.sol`, `packages/contracts/test/Router*.t.sol`,
   `packages/contracts/test/mocks/{MockWETH,MockSwapAdapter,HostileSwapAdapter}.sol`,
   `packages/contracts/src/BPSLockingVault.sol`,
   `packages/contracts/src/DistributionClaimManager.sol`.
