# BPS Experiment

Engineering monorepo for the BPS protocol. Implemented so far: the fixed-supply
`BPSToken` ERC-20 contract; a deterministic mock-asset Proof-of-Distribution engine
(`@bps/shared`) with a local fixture runner (`@bps/pilot`); the funded, immutable
`DistributionClaimManager` contract that verifies claims against the frozen
Proof-of-Distribution Merkle standard; `BPSLockingVault`, the fixed-term BPS locking
contract implementing the frozen `vebps-1` reward-weight policy; `BPSTradeRouter`, the
official BPS trade router implementing `BPS-ECON-2.0` (3% buy / 4% sell allocation, a 2%
WETH stock-acquisition budget, and a true BPS repurchase-and-burn that reduces total
supply); and `StockAcquisitionVault`, the production-shaped multi-asset custody boundary
that converts the WETH stock-acquisition budget into approved stock tokens through an
immutable adapter and applies a frozen 80/20 split (distribution retained, remainder to the
reserve); and `UniswapV3BPSSwapAdapter`, the production `IBPSSwapAdapter` that routes each
frozen BPS↔WETH router leg through exactly one Uniswap v3 pool via a single
`SwapRouter02.exactInputSingle` (immutable router/pair/router02/pool-fee, adapter-enforced
deadline, direct-recipient delivery with double balance-delta verification, no residual
custody, no arbitrary path/calldata/target/fee, no owner/upgrade);
`RialtoStockAcquisitionAdapter`, the production `IStockAcquisitionAdapter` that acquires an
approved stock token by executing a Rialto allowance-settlement quote against the current
registry-locked (feature ID 2) router with strict exact-input, minimum, residual, and
atomicity invariants, and is deployable only on Robinhood Chain (its constructor requires
`block.chainid == 4663`); and `DistributionFundingCoordinator`, which occupies **both** of the
frozen vault's immutable roles (its `acquisitionExecutor` and `distributionFundingCoordinator`)
so that, as the vault's sole executor, it records each acquisition atomically from the vault's
exact before/after accounting deltas, assigns a monotonic acquisition id, and later releases and
funds a `DistributionClaimManager` cycle with exactly that acquisition's recorded 80% — bound
one-to-one to a single cycle id (no caller-selected amount, no split, recombination, reassignment,
or replay). A server-only Rialto quote client (`@bps/rialto`) forces allowance settlement on chain
4663, validates the full response, and reads its API key server-side only (never exposed); it is
reachable only through the `@bps/rialto/server` subpath, never the package's main entry. A
complete local Foundry end-to-end test proves buy → stock acquisition → recorded 80/20 split →
reserve delivery → recorded-acquisition funding → proof-based claim. All assets, addresses,
adapters, quotes, budgets, burns, claims, and transactions are fictional and local-only.
Nothing is deployed to any network, no Rialto API is called, no credential is read or
exposed, and no on-chain claim, trade, swap, acquisition, or burn is executed.

## Prerequisites

- Node.js >= 22
- npm >= 10
- Git
- Foundry (`forge`) — required only for Solidity work in `packages/contracts`

## Repository layout

| Path                 | Package          | Purpose                                                                                                                                                                                                     |
| -------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`           | `@bps/web`       | Restricted-beta interface: fail-closed dashboard + tested application core (`lib/`) for deployment config, eligibility, official trade/lock/claim, transparency, and oracle read models                     |
| `apps/indexer`       | `@bps/indexer`   | Chain indexer service (scaffold)                                                                                                                                                                            |
| `apps/worker`        | `@bps/worker`    | Background worker service (scaffold)                                                                                                                                                                        |
| `packages/contracts` | `@bps/contracts` | Foundry: `BPSToken`, `DistributionClaimManager`, `BPSLockingVault`, `BPSTradeRouter`, `StockAcquisitionVault`, `UniswapV3BPSSwapAdapter`, `RialtoStockAcquisitionAdapter`, `DistributionFundingCoordinator` |
| `packages/shared`    | `@bps/shared`    | Proof-of-Distribution domain logic                                                                                                                                                                          |
| `packages/db`        | `@bps/db`        | Database access layer (scaffold)                                                                                                                                                                            |
| `packages/rialto`    | `@bps/rialto`    | Server-only Rialto quote client (allowance settlement)                                                                                                                                                      |
| `packages/pilot`     | `@bps/pilot`     | PoD local fixture runner + CLI                                                                                                                                                                              |

## Install

```
npm install
```

## Development

```
npm run dev
```

Starts the web app at http://localhost:3000.

## Verification

```
npm run format:check   # Prettier
npm run lint           # ESLint
npm run typecheck      # TypeScript, all workspaces
npm run test           # Vitest, all workspaces
npm run build          # Production builds, all workspaces
npm run fmt:contracts  # forge fmt --check (requires Foundry)
npm run build:contracts# forge build (requires Foundry)
npm run test:contracts # forge test (requires Foundry)
npm run check          # All of the above, in order
```

## Proof-of-Distribution (mock, local-only)

Run the deterministic Proof-of-Distribution pipeline against the canonical checked-in
fixture and write the four artifacts (`cycle-manifest.json`, `allocations.json`,
`wallet-proofs.json`, `reconciliation.json`) to a directory:

```
npm run proof:mock -- --out <directory>
```

It validates the fixture, computes TWAB and veBPS-weighted allocations under
economics `BPS-ECON-2.0`, builds a StandardMerkleTree, independently re-verifies the
root and every proof (viem), prints a reconciliation summary, and exits non-zero on
any invariant failure. It never touches the network, credentials, or tracked files.
All data is fictional and no on-chain claim is executed.

## Status

Implemented: the fixed-supply `BPSToken` ERC-20 (name "BPS Protocol", symbol "BPS",
18 decimals, 1,000,000,000 fixed supply, voluntary holder burn, no privileged
controls); the deterministic mock Proof-of-Distribution engine (epochs/TWAB, veBPS
multipliers, 80/20 acquired-asset split, allocation/rounding, Merkle proofs, canonical
artifacts); `DistributionClaimManager` (funded, immutable per-cycle Merkle claims
with single/batch claiming, permissionless post-deadline recovery to an immutable
recipient, two-step ownership; no root/window mutation, no pause, no drain, no upgrade);
`BPSLockingVault` (fixed-term BPS locks under the frozen `vebps-1` policy — 7/14/21/30
day tiers at 1.10/1.25/1.50/1.75x, non-transferable reward weight, exact principal
preservation, multiple independent positions, self-service withdrawal, one-way owner
emergency exit; no mint/burn, no early unlock, no participant-fund withdrawal by the
owner, no policy setters, no drain, no upgrade); and `BPSTradeRouter` (the official
`BPS-ECON-2.0` trade core — buy 3% = 2% WETH stock budget + 1% BPS burn, 97% to the user;
sell 4% = 2% stock + 2% burn, 96% to the user, computed from actual WETH proceeds; the
burn is a true `totalSupply` reduction via a market repurchase and the token's own
self-burn; immutable BPS/WETH/adapter/stock-recipient wiring; owner power limited to
pause/unpause and two-step ownership with renounce disabled; no fee/token/adapter/burn
setter, no fund sweep/rescue/seize, no arbitrary call, no upgrade); and
`StockAcquisitionVault` (production-shaped multi-asset custody for the router's WETH
stock-acquisition budget — an immutable executor converts exact WETH into an approved
stock token through an immutable acquisition adapter, verifying exact WETH spend, the
observed stock delta, and that the adapter keeps no new net residual custody of WETH or
acquired stock, then applies a frozen 80/20 split with the rounding remainder to the
reserve and the distribution portion releasable only to an immutable coordinator; no owner,
no pause, no basket mutation, no sweep/withdrawal, no arbitrary recipient/call, no upgrade);
and `UniswapV3BPSSwapAdapter` (the production `IBPSSwapAdapter` — a narrow direct Uniswap v3
`SwapRouter02.exactInputSingle` adapter, immutable router/BPS/WETH/SwapRouter02/pool-fee,
only the router may call, only the BPS↔WETH pair, deadline enforced by the adapter, output
delivered directly to the recipient with double balance-delta verification, no residual
custody, rejected recipient sentinels, no arbitrary path/calldata/target/fee, no
owner/setter/pause/sweep/rescue/withdrawal, no delegatecall/proxy/upgrade);
`RialtoStockAcquisitionAdapter` (the production `IStockAcquisitionAdapter` — executes a
Rialto allowance-settlement quote against the registry-locked feature-2 router with
exact-input, observed-delta minimum, no-residual, cleared-approval, and atomic-revert
invariants; deployable only on Robinhood Chain (`block.chainid == 4663`); no
owner/sweep/withdrawal/Permit2/gasless/Universal-Router/delegatecall/upgrade); and
`DistributionFundingCoordinator` (occupies both frozen vault roles — executor and distribution
coordinator — records each acquisition atomically from the vault's exact deltas, and funds one
claim cycle with exactly that acquisition's recorded 80%, bound one-to-one to a single cycle id;
trusted acquisition operator + governed root publisher, no arbitrary recipient/withdrawal). A
server-only Rialto quote client (`@bps/rialto`, reachable only via the `@bps/rialto/server`
subpath) and a complete local end-to-end Foundry test are included. Not implemented: production frontend/UI, eligibility
contract, the 15-minute epoch indexer, database, transferable veBPS, and an on-chain
price/oracle slippage guard. No contract is deployed; none is deployable until the verified
addresses, fee tier, liquidity, circular deployment sequences, operational controls, and
legal/eligibility review are resolved. There is no mainnet deployment.

**Economics — `BPS-ECON-2.0` only:** buy 3% (2% stock acquisition + 1% burn); sell 4%
(2% stock acquisition + 2% burn). There is no stewardship, treasury, creation, or
graduation fee, no transfer tax, and no rebase/reflection.

**Deployment-order rules:** (1) the real claim-manager contract address and target chain
ID must be known **before** production Merkle artifacts are generated — a root generated
for a different manager address or chain cannot be used (leaves bind `block.chainid`
and `address(this)`). (2) `BPSTradeRouter`'s swap adapter and stock-budget recipient are
immutable, so a trusted production swap adapter and `StockAcquisitionVault` must exist
**before** the router is deployed; changing either requires a new router. (3)
`StockAcquisitionVault`'s adapter, executor, reserve recipient, distribution coordinator,
and approved basket are all immutable, and the `DistributionFundingCoordinator` is intended to
be **both** the executor and the coordinator, so that coordinator (and the governance/authorization
sequence) must be finalized **before** the vault is deployed; changing any of them requires a new
vault (and hence a new router). (4) `BPSTradeRouter` and
`UniswapV3BPSSwapAdapter` each store the other immutably (a circular dependency), so
production deployment needs a reviewed deterministic / nonce-predicted sequence that
constructs the second contract at the first's predicted address and then verifies both
immutables on-chain — there is no one-time setter. The adapter's WETH/BPS/pool addresses,
fee tier, and pool liquidity are also unresolved deployment gates. (5) The
`RialtoStockAcquisitionAdapter` (vault↔adapter) and `DistributionFundingCoordinator`
(vault↔coordinator for **both** the executor and coordinator roles, and claim-manager owner =
coordinator) add the same predicted-address cycles; and the Rialto adapter needs the verified
feature-2 router (from Router Registry
`0x71a120…687E`), WETH, and stock-token addresses plus the exact registry/router ABI.

**Not deployable / beta blockers.** Beyond addresses and the deployment cycles: the
acquisition path is **not fully permissionless or decentralized** — it depends on a trusted
governance executor/root-publisher and the centralized, protected Rialto quote service; a
price/oracle slippage guard is required for a safe permissionless flow. **Robinhood Stock
Tokens carry jurisdiction and eligibility restrictions** — a public-beta launch blocker
requiring external legal and eligibility review (BPS provides no legal conclusion). See
`HANDOVER.md` §11 for the full code / configuration / operational / legal blocker breakdown.

**Deployment package (verified, not broadcast).** `packages/contracts/script/` +
`packages/contracts/deploy/` contain a broadcast-free deployment surface: a deterministic,
no-setter CREATE-nonce plan resolving every circular immutable dependency, fail-closed config
validation, a manifest schema + dry-run manifest, and an operator runbook. The Robinhood Chain
(id 4663) external dependencies — WETH, the Rialto Router Registry (with fail-closed `ownerOf(2)`
semantics), the live feature-2 router, Uniswap v3 SwapRouter02 + factory, and stock-token
candidates — are independently verified via a read-only RPC and official documentation. A
mainnet-fork rehearsal (`ROBINHOOD_FORK_RPC=<rpc> forge test --match-contract ForkDeployRehearsal`)
deploys the whole stack against the real externals and asserts every predicted address and
immutable role. **Nothing is deployed, broadcast, signed, or pooled.** The first live deployment
decision is **NO-GO** until the pool/fee tier, deployer/role/basket inputs, an on-chain slippage
guard, and legal/eligibility review are resolved.

**Restricted-beta application (fail-closed, no live writes).** `apps/web` provides the interface: a
tested, dependency-free application core (`apps/web/lib/`) covering a deployment-manifest boundary
(chain 4663, rejects placeholder/null addresses, writes disabled until a broadcast-ready same-commit
manifest with runtime code), a wallet/declaration/eligibility state machine (EIP-712 verification
where signing is never sufficient for eligibility), an official-router-only trade model (exact
allowances, never SwapRouter02 direct), locking and Merkle-verified claim flows, a provenance-tagged
transparency read model, and a read-only Chainlink oracle model with a `minStockOut` operator policy.
The dashboard resolves the dry-run manifest to **"Protocol not live"**, disables every write, labels
all fixtures as demonstration data, and states the system is **not fully decentralized**. Covered by
55 vitest tests including a full local end-to-end flow and a server-only Rialto import boundary. A
real wallet-connect + EIP-712-signing UI and browser tests are deferred (they require dependencies
not installed in this task); the EIP-712 declaration domain is a labeled beta scaffold pending
governance/legal finalization. `RIALTO_API_KEY` and the quote client remain server-only.
