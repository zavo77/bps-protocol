# BPS Experiment

Engineering monorepo for the BPS protocol. Implemented so far: the fixed-supply
`BPSToken` ERC-20 contract; a deterministic mock-asset Proof-of-Distribution engine
(`@bps/shared`) with a local fixture runner (`@bps/pilot`); the funded, immutable
`DistributionClaimManager` contract that verifies claims against the frozen
Proof-of-Distribution Merkle standard; and `BPSLockingVault`, the fixed-term BPS locking
contract implementing the frozen `vebps-1` reward-weight policy. All assets, addresses,
positions, claims, and transactions are fictional and local-only. Nothing is deployed to
any network, mainnet or otherwise, and no on-chain claim is executed.

## Prerequisites

- Node.js >= 22
- npm >= 10
- Git
- Foundry (`forge`) — required only for Solidity work in `packages/contracts`

## Repository layout

| Path                 | Package          | Purpose                                                            |
| -------------------- | ---------------- | ------------------------------------------------------------------ |
| `apps/web`           | `@bps/web`       | Next.js (App Router) web application                               |
| `apps/indexer`       | `@bps/indexer`   | Chain indexer service (scaffold)                                   |
| `apps/worker`        | `@bps/worker`    | Background worker service (scaffold)                               |
| `packages/contracts` | `@bps/contracts` | Foundry: `BPSToken`, `DistributionClaimManager`, `BPSLockingVault` |
| `packages/shared`    | `@bps/shared`    | Proof-of-Distribution domain logic                                 |
| `packages/db`        | `@bps/db`        | Database access layer (scaffold)                                   |
| `packages/rialto`    | `@bps/rialto`    | Rialto integration (scaffold)                                      |
| `packages/pilot`     | `@bps/pilot`     | PoD local fixture runner + CLI                                     |

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
and `BPSLockingVault` (fixed-term BPS locks under the frozen `vebps-1` policy — 7/14/21/30
day tiers at 1.10/1.25/1.50/1.75x, non-transferable reward weight, exact principal
preservation, multiple independent positions, self-service withdrawal, one-way owner
emergency exit; no mint/burn, no early unlock, no participant-fund withdrawal by the
owner, no policy setters, no drain, no upgrade). Not implemented: trade router, protocol
fees, buy-and-burn, eligibility contract, the 15-minute epoch indexer, database, and UI
features. No contract is deployed. There is no mainnet deployment.

**Deployment-order rule:** the real claim-manager contract address and target chain ID
must be known **before** production Merkle artifacts are generated — a root generated
for a different manager address or chain cannot be used (leaves bind `block.chainid`
and `address(this)`).
