# BPS Private Canary — Execution-Bundle Finalization (PCE-1) — 2026-07-26 (TASK 10K-10)

Machine-readable evidence: [`BPS_PRIVATE_CANARY_EXECUTION_BUNDLE_2026-07-26.evidence.json`](./BPS_PRIVATE_CANARY_EXECUTION_BUNDLE_2026-07-26.evidence.json).
Offline artifacts: [`deploy/canary-bundle/`](../../packages/contracts/deploy/canary-bundle/) —
`unsigned-deployment.json`, `unsigned-safe-transactions.json`, `verification-manifest.json`.

**Status: `PRIVATE_CANARY_EXECUTION_BUNDLE_READY`.** Offline/read-only finalization only. **Nothing was
signed, proposed, funded, deployed, or broadcast; no Safe transaction was created or uploaded; no ownership
action, approval, transfer, swap, settlement, or canary occurred; no external party was contacted; no
private key / mnemonic / RPC credential / API key was read or exposed.** **This is preparation, NOT the
EXECUTE authorization.** B-1 remains OPEN/INCOMPLETE; B-2/D-23 remain COUNSEL-PENDING/INCOMPLETE; **D-24
remains fully in force for production**; PCE-1 remains single-use and not yet consumed.

## KL-1 resolved — EVM version pinned `paris`

Robinhood Chain is an Arbitrum Dedicated Blockchain (Nitro/Orbit) L2, "fully EVM-compatible" per
[official docs](https://docs.robinhood.com/chain/), with the exact ArbOS/hardfork **not published**. Pinned
`evm_version = "paris"` in a narrow `[profile.canary]` (the default profile is unchanged so the full test
suite still compiles). Basis: `paris` predates PUSH0 (shanghai) and MCOPY / transient storage / blob opcodes
(cancun); the frozen contracts need none of those (their import graph excludes all seven MCOPY-using OZ
utils), so paris-compiled bytecode is guaranteed executable on every EVM ≥ paris including all Arbitrum Nitro
versions, and solc will not emit MCOPY in the executor's own calldata handling. **No contract-logic change.**

## Reproducible build (two clean builds — identical)

solc `0.8.26+commit.8a97fa7a`, optimizer on / 200 runs, evm `paris`. Command:
`FOUNDRY_PROFILE=canary forge build --offline --skip '*.t.sol' --skip '*.s.sol'`.

| Contract                      | creation hash / len     | runtime hash / len     | ctor-args hash / len  | deploy-data hash / len   |
| ----------------------------- | ----------------------- | ---------------------- | --------------------- | ------------------------ |
| ChainlinkSettlementPriceGuard | `0x9385b6…0b34` / 6985  | `0x4c5859…92e8` / 4485 | `0xaf09a9…d5c3` / 256 | `0xbb4711…dbb9` / 7241   |
| GuardedSettlementExecutor     | `0xbf0d3b…0fa0` / 10564 | `0x16c8af…0908` / 9256 | `0x50b636…89c3` / 128 | `0x9464507…d04a` / 10692 |

Two independently-cleaned builds produced **byte-identical** bytecode (reproducible). Full bytecode blobs are
stored in `unsigned-deployment.json` (not printed here).

## Deployer (read-only) and predicted addresses

- Deployer / Owner 1 `0x7116F2998e625651D310E97919a1c638a7F82ba2` — chainId 4663, **nonce 1**, balance
  **0.000483387 ETH**, no code. (The EOA and the Safe are not interchangeable.)
- **Predicted (CREATE):** guard `0x57538680194D9E15Ba78bf243B10B440f663078d` (nonce 1) · executor
  `0x17e060c41d34E89147bBAa1C364f6A6e58d2f84C` (nonce 2). Both currently **empty**.
- ⚠️ **These addresses are valid ONLY while the deployer nonce == 1. Any nonce change is a HARD ABORT
  requiring full regeneration + reverification of the bundle.**

## Frozen parameters + control split

The complete frozen constructor/config table and the on-chain-enforced vs operator-side control tables are in
the evidence JSON. Highlights: deploy **Safe-as-owner** (no temp owner / no ownership transfer needed);
executor starts **paused**; config via 2-of-3 Safe (`setPriceGuard` → `setApprovedRouterCode(0xa7041268…27611,
0x77963966)` → `setMaxSellAmount(WETH, 0.001 WETH)` → `setTokenPairAllowed(WETH, NVDA, true)`) → preflight →
`unpause`. On-chain: chain lock, cap ≤ 0.01 WETH ceiling, registry lock + code-hash pin + selector, exact
allowance + reset, own-balance NVDA delta ≥ min, single-use digest/nonce, deadline ≤ 300 s, slippage ≤ 100
bps, deviation 100 bps, feed freshness/identity/pause, recover-to-owner-only. Operator-side: **one cycle then
mandatory pause**, ≤ $130 aggregate, ≤ 0.001 WETH funding, open NVDA session, fresh live quote, mandatory
recovery, no public users, no production reuse.

## Lifecycle rehearsal (18 steps) + verification

Offline local rehearsal + full suite. A real Robinhood-Chain full-transaction **fork replay is not possible**
(Foundry cannot deserialize the Arbitrum-Nitro block/tx encoding — documented since 10K-5) and was
**substituted with read-only JSON-RPC verification** (this is stated plainly, not concealed). All 18 rehearsal
items map to existing passing tests (full map in the evidence JSON); item 10 (aggregate-cap) is an
operator-side stop, not a single on-chain cap.

- `forge test --offline`: **513/513 pass** (51 suites; fuzz + invariants). 0 fail, 0 skip.
- Rialto vitest **252/252**; typecheck, lint, build **clean**; `forge fmt --check` + `prettier --check .`
  **clean**. One documented skip: `cast run` full-tx fork replay (tooling limitation).
- Safe re-check (read-only): `0x62Ae5b22…5E62` v1.4.1, three approved owners, threshold 2, nonce 0,
  singleton/fallback match, **no modules, no guard**, native/WETH/NVDA balances **zero** — unchanged,
  inactive, candidate controller.

## Gas + exposure — $130 safely covers the lifecycle

At gasPrice 0.05183 gwei and live ETH $1885.00: deploy gas guard **1,119,595** + executor **2,161,377**;
conservative lifecycle gas 2,010,000; total ~5.35M gas. **Max native cost ≈ 0.000555 ETH; acquisition 0.001
ETH; total all-inclusive exposure ≈ 0.001555 ETH ≈ $2.93** — vs the $130 cap, ~44× headroom. **$130 safely
covers the complete lifecycle.** Minimum deployer funding for the two deployments ≈ **0.000340 ETH**; the
deployer already holds 0.000483 ETH (sufficient; top-up recommended for buffer).

## Twelve human-confirmed execution stages

1. Deployer gas funding (only if required). 2. Contract deployment (2 CREATE txs). 3. Read-only deploy
   verification. 4. Safe configuration (2-of-3). 5. Read-only config verification. 6. Minimal canary funding
   (≤ 0.001 WETH). 7. Fresh live Rialto quote + open-session check. 8. Exactly one settlement. 9. Immediate
   reconciliation. 10. Mandatory pause. 11. Mandatory recovery. 12. Final-state verification + PCE-1 consumption
   record. Each stage has explicit abort conditions (evidence JSON); a failure at any stage prevents automatic
   continuation.

## Remaining execution-time inputs (the only ones)

1. Deployer gas funding **if required** (currently sufficient for deployment; top-up recommended). 2. Human
   wallet signatures + broadcasts (deployer EOA + 2-of-3 Safe + a WETH source for funding). 3. A **fresh live
   Rialto quote** obtained immediately before the one settlement. 4. Confirmation the **NVDA market session is
   open** (fresh feeds). Nothing else remains; the bundle is otherwise complete and verified.
