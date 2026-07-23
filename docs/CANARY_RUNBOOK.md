# BPSC-TEST Canary Runbook — Robinhood Mainnet (TEST ONLY)

> **BPSC-TEST — ROBINHOOD MAINNET CANARY — TEST ONLY.** Non-production experimental token with no official
> value. This runbook describes how the isolated canary would operate; it authorizes **no** live action.
> Nothing here is signed, broadcast, deployed, funded, or approved. This is not legal or financial advice.

## 1. Purpose and permanent on-chain visibility

BPSC-TEST validates the real Robinhood-mainnet operational path of the frozen BPS system (deploy, pool,
wallet-through-website buy/sell/lock/withdraw, repurchase-and-burn accounting, event-derived transparency,
cycle funding + claims where feasible) **before** any canonical BPS deployment with meaningful liquidity. It
is a private operational canary, not a public token launch.

A mainnet deployment is **permanent and publicly visible**: the BPSC-TEST token, pool, and every transaction
remain forever on Robinhood Chain and its explorer. BPSC-TEST is deliberately named `BPS Canary — TEST ONLY`
(symbol `BPSC-TEST`) so it is visibly and technically distinguishable from canonical BPS. Do not present it
as canonical BPS anywhere.

## 2. Two-wallet minimum (public addresses only)

- **Canary deployer/admin/LP wallet** (`BPSC_DEPLOYER` / `BPSC_RECIPIENT` / `BPSC_OWNER`): deploys the canary
  contracts, holds the BPSC-TEST supply, seeds the LP.
- **Controlled tester wallet** (`BPSC_CONTROLLED_TESTER`): performs website-driven buys/sells/locks/claims.

Both are **public addresses only**. Never use a canonical BPS treasury, production, or unrelated personal
wallet. Never read, print, export, or expose a private key, seed phrase, mnemonic, or keystore. Placeholders
live in `packages/contracts/.env.canary.example` and remain **unset** in the repository.

## 3. Capital limits (hard operational ceilings)

| Item                           | Ceiling               | Enforcement                                                                                                        |
| ------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| LP WETH deposited              | ≤ $100 equivalent     | Application-enforced from a manifest WETH cap once populated; treat as **potentially unrecoverable**               |
| Individual trade               | ≤ $2 equivalent       | Application-enforced from the **authoritative simulated/quoted WETH result** (for sells, the quoted WETH proceeds) |
| Controlled trades total        | ≤ $20 equivalent      | Operational control                                                                                                |
| Gas                            | ≤ $10 equivalent      | Operational control                                                                                                |
| **Aggregate external capital** | ≤ **$130** equivalent | Operational control                                                                                                |

**Which limits are application-enforced vs operational:** the per-trade and LP WETH caps are enforced in the
application _once the manifest populates exact WETH-wei caps_ (`capitalCaps.individualTradeWethMaxWei`,
`lpWethMaxWei`); until then they are **null and fail closed** (the action is disabled). The USD ceilings and
the $20 / $10 / $130 aggregates are **operational controls**, not enforced by any contract. Do not
auto-increase any limit for price/gas/slippage/minimum-order/failure reasons.

## 4. Exact approval and reconciliation flow

- **Exact-amount approvals only.** Every ERC-20 approval (WETH and BPSC-TEST) is for the exact amount of the
  action — never unlimited. The application transaction lifecycle already enforces exact approvals.
- **Confirmation-depth waiting + reconciliation.** Success is reported only after the confirmed receipt at
  the required depth AND a post-confirmation authoritative-state reconciliation (never inferred from a tx
  hash alone). Mempool replacement is handled (cancelled → failure; repriced → follow the confirmed receipt).
- All signatures and transactions flow through the connected wallet connector/provider. No deterministic key
  exists outside the isolated test/E2E mock provider.

## 5. Irreversible actions

- LP WETH deposit (treat as unrecoverable).
- Any live buy/sell.
- BPSC-TEST repurchase-and-burn (permanent `totalSupply` reduction).
- Deployment (contracts are immutable; the LP position remains withdrawable by its owner).

## 6. Pause and recovery

- The canary `BPSTradeRouter` is `Pausable` (owner/Safe pause); the locking vault has an owner emergency
  exit; the LP position is withdrawable by the position owner (the recovery path for the deposited WETH).
- Revoke any approval by setting the allowance to 0.

## 7. External Rialto / Stock Token boundary the $100 canary CANNOT validate

The real Stock Token acquisition path (Rialto) is a protected, server-only, permissioned API. A $100 canary
generates a trivial acquisition budget (≈$0.04 from a $2 trade) — far below any realistic minimum order — and
the Stock Token basket, oracle/sequencer feeds, and token/feed registry are unresolved and fail-closed.
Therefore the external Stock Token settlement boundary **cannot** be tested by this canary. Do **not** access
a protected Rialto endpoint, fabricate an acquisition, or present a mock/simulated Stock Token settlement as
live. The interface must clearly distinguish **accrued acquisition budget** from a **completed acquisition**,
and **simulated/unavailable external settlement** from genuine live on-chain state. What the canary _can_
validate is everything on-chain: buy/sell accounting, repurchase-and-burn, budget accrual, locking/withdrawal,
event-derived transparency, authoritative cycle reads, and claims where feasible.

## 8. After the canary: a fresh canonical BPS deployment is required

BPSC-TEST is throwaway. Canonical BPS must be a **separate, fresh deployment** of the frozen `BPSToken` via
the production path (`script/BPSDeployment.sol` / `DeployBPS.s.sol`) with production role/Safe addresses,
verified infrastructure, and the founder/counsel inputs resolved. The canary deployment path
(`script/canary/*`, `deploy/robinhood-mainnet.canary.json`) never touches the canonical production manifest.

## 9. Enabling a live canary (a separate, explicitly-authorized step — NOT done here)

Live canary writes remain **disabled** until an approved canary manifest contains **both**
`broadcastReady: true` **and** `liveWritesApproved: true`, with real deployed addresses, verified
code-hashes, and populated exact WETH caps. Neither flag is set in this task. Enabling them requires a fresh
preflight (exact addresses, nonces, calldata hashes, caps) and explicit founder authorization.
