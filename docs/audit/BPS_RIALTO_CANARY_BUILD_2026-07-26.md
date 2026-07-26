# BPS Guarded-Settlement Canary Build — 2026-07-26 (TASK 10K-6)

Machine-readable evidence + sanitized rehearsal receipt:
[`BPS_RIALTO_CANARY_BUILD_2026-07-26.evidence.json`](./BPS_RIALTO_CANARY_BUILD_2026-07-26.evidence.json).

**Status: `CANARY_BUILD_READY_EXECUTION_LOCKED`.** The guarded-settlement stack now has a real Chainlink
price guard, a paused-by-default executor that cannot be unpaused until fully configured, a deployed-contract
controller model with a two-step transfer, reproducible test tooling, broadcast-free deploy tooling, a
read-only canary preflight, and a full offline lifecycle rehearsal. It is **UNDEPLOYED**; execution stays
locked. **No Rialto request, no API key, no signing, no broadcast, no deployment.** D-24 stands.

## What was built

- **`ChainlinkSettlementPriceGuard.sol`** — a real dual-feed guard (ETH/USD `0x78F3…d3A9` "ETH / USD" 8dp;
  NVDA/USD `0x379E…9F15` "RHNVDA / USD" 8dp), replacing the placeholder. It reverts unless `minBuyAmount`
  meets the Chainlink-derived fair output reduced by ≤ 100 bps, and fails closed on wrong chain/pair, zero
  amount, changed feed decimals/identity, non-positive answer, zero/future timestamp, incomplete round,
  stale feed (> configured age, ceiling 900 s), globally paused stock oracle, and (if a sequencer feed is
  configured) sequencer down / grace-not-elapsed. The NVDA feed is the multiplier-adjusted Total Return
  Value/USD, so `uiMultiplier` is **not** re-applied. No official Robinhood Chain sequencer uptime feed is
  published; this is mitigated by strict 15-minute dual-feed freshness.
- **Executor config gate** — `GuardedSettlementExecutor.unpause()` now reverts `ConfigIncomplete` unless the
  price guard, approved router code hash, approved selector, WETH cap, and WETH→NVDA pair are all set. The
  executor deploys **paused**. `transferOwnership` is a two-step `Ownable2Step` transfer that rejects
  zero/dead/self.
- **Deploy tooling (broadcast-free)** — `script/settlement/GuardedSettlementConfig.sol` (pinned identities +
  fail-closed `validate` + `deployPaused`) and `script/settlement/DeployGuardedSettlement.s.sol` (loads env,
  validates, writes a sanitized manifest; no `vm.broadcast`, no key, no API key).
- **Reproducible toolchain** — tracked `tool/bootstrap-forge-std.{sh,ps1}` pin forge-std v1.9.7
  (`77041d2…4d505`), verify commit + version, refuse on mismatch, and never overwrite an existing checkout.
- **Read-only canary preflight (TS)** — `packages/rialto/src/canary-preflight.ts` (pure, dependency-injected
  core) + `canary-preflight-cli.ts` (viem read-only client; **refuses to run if any key/secret env is
  present**). Emits exactly `CANARY_BUILD_READY_EXECUTION_LOCKED` or `CANARY_NOT_READY`.
- **Runbook + config template** — `deploy/GUARDED_SETTLEMENT_RUNBOOK.md` (phases A/B/C) and
  `deploy/guarded-settlement.env.example` (no secrets).

## Verification (all offline / read-only)

- Foundry: `forge test --offline` — **513/513 pass** (guard 26, executor 60 incl. fuzz + 2 invariants,
  deploy/rehearsal 9).
- Rialto vitest: **245/245 pass** (219 prior + 26 new canary-preflight core/CLI incl. network tripwires).
- `npm run typecheck`, `npm run lint`, `npm run build` — clean. `forge fmt --check` + `prettier --check .` —
  clean.
- Secret scan and broadcast-path scan of all changed files — clean (the only code-hash string is the public
  router runtime hash; no keys, no `vm.broadcast`, no wallet/signing path).

## Sanitized rehearsal receipt

`GuardedSettlementDeploy.t.sol::test_rehearsal_fullLifecycle` (offline; mock code etched at the pinned
official addresses) proved, with no fork/RPC/broadcast: (1) `deployPaused` yields a paused, controller-owned
executor; (2) `unpause` is blocked by `ConfigIncomplete` until full config, then succeeds; (3) a fresh
dual-feed 0.001 WETH → NVDA settlement returns the exact Chainlink oracle-floor NVDA delta; (4) a stale feed
reverts and leaves **zero router allowance, an unconsumed digest, and an unused nonce**; (5) two-step
controller transfer moves ownership.

## Controller / Safe check

**Not performed** — no controller/Safe address has been supplied and no read-only RPC endpoint is
configured. `eth_getCode` on the controller (must be a deployed contract, not an EOA/zero/dead) is enforced
at run time by both the Solidity deploy preflight (`validate`) and the TS canary preflight. No Safe was
deployed.

## Decision state

- **Build ready, execution locked.** Nothing here deploys, funds, approves, acquires, or executes.
- **D-24 stands** and is **expired**; a new bounded, independently reviewed authorization is required before
  any live step.
- Open gates: production Safe/controller address (**D-6**); external audit + counsel (**D-3/D-23**); trusted
  price source (**D-22B**); per-token cap approval (**D-8**). The missing Rialto ABI remains a non-blocker
  (**D-5/D-21**, opaque-call model). QEX-1 remains **consumed**.
- The one labelled read-only live preflight run is an operator step, blocked on a read-only RPC URL and the
  controller address; **no network call is made by this repository.**
