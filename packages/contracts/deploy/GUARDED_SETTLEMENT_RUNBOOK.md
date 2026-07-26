# Guarded Settlement — Canary Deploy & Preflight Runbook (TASK 10K-6)

Operational runbook for the BPS guarded-settlement canary stack on **Robinhood Chain (chainId 4663)**:
`ChainlinkSettlementPriceGuard` + `GuardedSettlementExecutor`, deployed **paused-by-default** and owned by
a **deployed-contract controller (Safe)** via a two-step transfer.

> **Safety.** Every step below is broadcast-free or read-only UNTIL the explicitly marked controller-driven
> deploy/configure/unpause step. This repository ships **no command that automatically broadcasts**. The
> executor cannot be unpaused until it is fully configured (`ConfigIncomplete` gate). **D-24 stands:** none
> of this authorizes deployment, funding, approval, acquisition, or execution. A new, bounded, independently
> reviewed authorization is required before any live step.

---

## 0. Prerequisites (blockers to clear first)

| #   | Prerequisite                                                        | Status                                                                                                                       |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Final **controller/Safe** address (deployed contract on chain 4663) | **BLOCKED** — owners/threshold unresolved. Safe v1.4.1 stack **verified available** on 4663 (see `SAFE_CONTROLLER_SETUP.md`) |
| 2   | External **audit** of the guard + executor                          | **BLOCKED** — counsel/audit pending (D-3/D-23)                                                                               |
| 3   | New bounded **founder authorization** replacing the expired D-24    | **BLOCKED** — required before any live step                                                                                  |
| 4   | Read-only Robinhood Chain **RPC URL** for the preflight             | **RESOLVED** — read-only preflight run 2026-07-26 (TASK 10K-7); operator supplies own `.env`                                 |
| 5   | Trusted **price-source** confirmation (D-22B)                       | **ENGINEERING-COMPLETE** — feed identities/live behavior verified (TASK 10K-7)                                               |

Until #1–#3 clear, the offline verification, broadcast-free preflight, and read-only canary preflight below
are the only runnable steps.

---

## 1. Reproducible toolchain (forge-std)

`packages/contracts/lib/forge-std` is gitignored. On a fresh clone, install the pinned version first:

```bash
packages/contracts/tool/bootstrap-forge-std.sh
```

```powershell
powershell -NoProfile -File packages/contracts/tool/bootstrap-forge-std.ps1
```

Both pin **forge-std v1.9.7** (commit `77041d2ce690e692d6e03cc812b57d1ddaa4d505`), verify the checked-out
commit and package version, **refuse on any mismatch**, and **never overwrite** an existing checkout.

---

## 2. Offline verification (no chain)

```bash
cd packages/contracts && forge test --offline
```

Covers: the Chainlink price guard, the executor opaque-call safety envelope + config gate + two-step
controller transfer, and the deployment-config validator + full local lifecycle rehearsal
(`test/GuardedSettlementDeploy.t.sol`). All tests run with no fork and no RPC.

---

## 3. Broadcast-free deployment preflight (Solidity)

Copy `deploy/guarded-settlement.env.example` to a local gitignored `.env` and fill it in (no secrets).
Then run the **non-broadcasting** preflight against a chain-4663 RPC (reads only; `run()` has no
`vm.broadcast`, reads no private key, and reads no API key):

```bash
cd packages/contracts
forge script script/settlement/DeployGuardedSettlement.s.sol:DeployGuardedSettlement --rpc-url "$CANARY_RPC_URL"
```

It **fails closed** (`GuardedSettlementConfig.validate`) on wrong chain, an EOA/zero/dead controller, any
missing pinned external, a cap `> 0.001 WETH`, or a feed age `> 900 s`, and otherwise writes the sanitized
manifest `deploy/guarded-settlement.manifest.out.json` (addresses + policy values only; no secrets).

---

## 4. Read-only canary preflight (TypeScript)

Confirms the live pinned identities and that execution stays locked. **Read-only** (`eth_chainId` /
`eth_getCode` / `eth_call` only); it **refuses to run** if any key/secret env is present.

```bash
CANARY_RPC_URL=<read-only-rpc> GS_CONTROLLER=<safe> \
GS_CANARY_CAP_WEI=1000000000000000 GS_MAX_WETH_FEED_AGE_SEC=900 GS_MAX_NVDA_FEED_AGE_SEC=900 \
node --loader ts-node/esm packages/rialto/src/canary-preflight-cli.ts
```

Checks: chain id 4663; registry code; `ownerOf(2)` router present and its **runtime code hash == the pinned
`0xa7041268…27611`**; settlement selector `0x77963966`; WETH/NVDA code + 18 decimals; both Chainlink feeds
(code, 8 decimals, exact description, positive answer, complete round, freshness ≤ configured age);
`NVDA.oraclePaused()==false`; sequencer policy (none published → zero, dual-feed freshness enforced);
controller has code; cap `0 < cap ≤ 0.001 WETH`; feed-age bounds; execution locked (executor undeployed, or
deployed **and** paused); and `QEX1_CONSUMED==true`. Emits exactly **`CANARY_BUILD_READY_EXECUTION_LOCKED`**
(exit 0) or **`CANARY_NOT_READY`** (exit ≥ 1). Set `CANARY_EXECUTOR_ADDRESS` after deployment to assert the
deployed executor is paused.

Missing `GS_CONTROLLER` is reported as one explicit `CONTROLLER_REQUIRED` failure — the live oracle/router/
token checks still run. A stale NVDA feed is flagged `NVDA_FEED_STALE_MARKET_CLOSED` (off-hours), a stale
ETH feed `ETH_USD_FEED_STALE`. Every RPC error is redacted so no endpoint URL can appear in output.

> **Read-only live run — DONE (TASK 10K-7, 2026-07-26):** executed against a live Robinhood Chain read-only
> RPC in missing-controller mode → `CANARY_NOT_READY` (failed: `eth-usd-feed-fresh`, `nvda-usd-feed-fresh`,
> `controller`; flags: `ETH_USD_FEED_STALE`, `NVDA_FEED_STALE_MARKET_CLOSED`, `CONTROLLER_REQUIRED`); every
> controller-independent check passed. Receipt:
> [`docs/audit/BPS_RIALTO_LIVE_ORACLE_2026-07-26.md`](../../../docs/audit/BPS_RIALTO_LIVE_ORACLE_2026-07-26.md).
> The repository itself makes no network call; the operator supplies a read-only RPC in a gitignored `.env`.

---

## 5. Controller-driven activation — **LIVE, EXPLICIT AUTHORIZATION REQUIRED**

Only after prerequisites #1–#3 clear and a new bounded authorization is granted. Performed **by the
controller (Safe)**, not by any script in this repo:

1. **Deploy (paused):** `GuardedSettlementConfig.deployPaused(cfg)` deploys the guard (immutable-configured)
   and the executor (`owner = controller`, **paused**, unconfigured).
2. **Configure (as controller):** `setTokenPairAllowed(WETH, NVDA, true)`; `setMaxSellAmount(WETH, cap)`
   with `cap ≤ 0.001 WETH`; `setPriceGuard(guard)`; `setApprovedRouterCode(pinnedRouterCodeHash, 0x77963966)`.
3. **Preflight again:** re-run §4 with `CANARY_EXECUTOR_ADDRESS` set → must print `…EXECUTION_LOCKED` while
   still paused.
4. **Unpause:** `unpause()` — reverts `ConfigIncomplete` unless price guard + approved code hash + approved
   selector + WETH cap + WETH/NVDA pair are all set.
5. **Transfer control (two-step):** `transferOwnership(finalController)` then `acceptOwnership()` from the
   new controller (rejects zero/dead/self).

---

## 6. Canary phases

- **Phase A — Dry (build):** §1–§4 with the executor **undeployed**. Success = `CANARY_BUILD_READY_EXECUTION_LOCKED`.
  This is the current target ceiling under D-24.
- **Phase B — Deployed & paused:** §5.1–§5.3 done; executor deployed, configured, **still paused**; §4 with
  `CANARY_EXECUTOR_ADDRESS` prints `…EXECUTION_LOCKED`. No settlement possible.
- **Phase C — Live canary:** only after a new bounded authorization; `unpause()`; execute a **single**
  ≤ 0.001 WETH → NVDA settlement; verify the executor's NVDA balance delta ≥ minimum and the router
  allowance returned to zero; then re-pause pending review.

---

## 7. Rollback / halt

Any of these **halts settlement automatically or immediately**: a router rotation / code-hash change
(`setApprovedRouterCode` no longer matches → every settlement reverts), a stale or paused feed (guard
reverts), `pause()` by the controller, or `transferOwnership` to a fresh controller. No funds can be moved
while paused; the executor holds no standing allowance (it is reset to zero after each settlement).
