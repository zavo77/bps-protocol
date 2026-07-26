# BPS Rialto Guarded Settlement Core — 2026-07-25 (TASK 10K-3)

Production-shaped but **deliberately disabled** guarded-settlement core for the Rialto WETH→stock-token
flow on Robinhood Chain (chain 4663, registry feature 2). It validates and prepares a settlement plan
**offline** and fails closed until the remaining production facts are supplied and explicitly approved.
**Nothing here enables live trading. D-24 stands.**

- Offline core: [`packages/rialto/src/guarded-settlement.ts`](../../packages/rialto/src/guarded-settlement.ts)
- Tests: [`packages/rialto/src/guarded-settlement.test.ts`](../../packages/rialto/src/guarded-settlement.test.ts)
- Contract-ready interface (Solidity deferred): [`IGuardedSettlementExecutor.sol`](../../packages/contracts/src/interfaces/IGuardedSettlementExecutor.sol)

## Threat model (summary)

Adversaries considered: a manipulated/rotated router; a paused/uninitialized feature; a swapped or
opaque selector; an attacker-supplied "trusted" router/price string; a stale or undated registry/price
observation; an over-sized or wrong-direction trade; a replayed or expired intent; an integrator-fee or
excess-slippage skim; a nonzero-value (native drain) call; leakage of the API key, raw quote id, or full
calldata. Every one is a fail-closed path (see invariants). The dead-address canary is explicitly not an
acceptable production taker.

## Implemented invariants (offline, pure, integer-safe)

- No import-time side effects; no env/network/filesystem/process-exit; all state injected (registry
  observation, price observation, replay store, clock). Token/price/fee/bps math is integer-only
  (bigint); deviation uses floor rounding for a conservative ceiling.
- **Registry** assessed SEPARATELY from the quote: registry+feature match, current router nonzero, not
  paused, target == current router (previous/next-only never passes), and the observation must be dated
  AND within the age limit. The undated QEX-1 snapshot reconciles historically but fails production
  readiness (`REGISTRY_OBSERVATION_STALE`).
- **Selector** must be in an explicit allow-list. The production allow-list is EMPTY; `0x77963966` stays
  evidence-only → `SELECTOR_UNAPPROVED`. One observed quote never approves a selector.
- **Taker** must be a resolved, nonzero, non-dead address matching the intent.
- **Token/amount/fee/value**: exact approved pair+direction; positive amounts; per-token cap (unresolved
  ⇒ fail closed); `tx.value == 0`; platform fee ≤ 5 bps; no integrator fee; slippage ≤ 100 bps; calldata
  hash present + well-formed (complete calldata never stored).
- **Price (D-22B)**: injected observation must come from an allowed source, match pair/direction, be
  fresh, and the quote's minimum return must not exceed the permitted deviation from the trusted
  reference. No production source is approved ⇒ `PRICE_SOURCE_UNRESOLVED`.
- **Replay/expiry**: domain-separated single-use digest, per-taker nonce, deadline, bounded lifetime
  (≤ 5 min). In-memory store is labelled NON-PRODUCTION; a durable store backs the interface.
- **Plan** (only when all guards pass): reverify registry → approve exact → call verified router →
  require min buy → clear allowance to zero → consume intent atomically → record sanitized evidence.
  A future on-chain executor MUST revert the entire operation on any sub-step failure. The result status
  `READY_OFFLINE_ONLY` is NEVER execution authorization.

## Candidate policy (engineering defaults)

Chain 4663; feature 2; sell WETH only; buy NVDA only; integrator fee forbidden; max platform fee 5 bps;
default slippage 50 bps; hard-max slippage 100 bps; max price deviation 100 bps; intent lifetime ≤ 300 s.
Unresolved by design (fail closed): per-token sell cap, registry/price observation age limits, approved
price sources, and the final taker.

## Fail-closed production gaps / remaining prerequisites (ordered)

1. **Approved selector** — prove `0x77963966`'s function offline via a repo-owned/vendored router ABI and
   add it to the allow-list (D-6). Not inferable from one quote.
2. **Final taker/guarded-executor (Safe) address** — the dead-address canary is unacceptable (D-6).
3. **Dated runtime registry strategy** — a live, dated `ownerOf(2)` read at execution (D-6).
4. **Trusted price source + age limit** — an approved oracle/reference (D-22B).
5. **Per-token sell cap** — a founder/security-approved maximum.
6. **Durable atomic replay store + on-chain executor verification** (D-21, D-5).

## Solidity executor — IMPLEMENTED (TASK 10K-4)

`packages/contracts/src/GuardedSettlementExecutor.sol` (undeployed) plus interfaces
`IGuardedSettlementExecutor.sol`, `ISettlementPriceGuard.sol`, `ISettlementCalldataValidator.sol`.
Dependency pin: **forge-std v1.9.7** (commit `77041d2ce690e692d6e03cc812b57d1ddaa4d505`), cloned into the
gitignored `packages/contracts/lib/` (the repo's deps-on-demand convention); OpenZeppelin 5.6.1 via root
`node_modules` (remapped). All tests run **offline** (`forge test --offline`, no fork, no RPC).

Contract invariants (mirror the TypeScript core one-to-one):

- **Controller/executor-as-taker:** `Ownable2Step` controller (a future Safe) is the ONLY account that may
  configure, pause/unpause, settle, or recover; the executor is itself the taker and purchased-token
  recipient. Constructor rejects a zero/dead/self controller and non-contract deps, forces chain 4663, and
  **starts paused**. Disabled by default: no price guard, no selector validator, pair not enabled, cap
  unset — all fail closed.
- **Registry:** resolves the current feature-2 router via `ownerOf(2)` at settlement time (reverts on
  paused/uninitialized), rejects a zero router, requires `target == current router`; previous/next/quote/
  env/override routers can never pass.
- **Selector + calldata:** a selector allow-list alone is insufficient — each approved selector needs a
  registered `ISettlementCalldataValidator` that proves the COMPLETE calldata matches the intent
  (tokens, exact sell, min buy, recipient == executor, platform fee ≤ 5 bps, zero integrator fee).
  Registering the evidence-only selector `0x77963966` is **hard-blocked on-chain**
  (`EvidenceOnlySelectorDisabled`).
- **Token/amount/fee/value:** WETH→NVDA only; positive amounts; per-token cap ≤ 0.01 WETH; non-payable
  (`msg.value` always 0); platform fee ≤ 5 bps; no integrator fee; slippage ≤ 100 bps.
- **Price guard (D-22B):** requires a configured `ISettlementPriceGuard`; a zero/reverting/rejecting/
  deviating guard reverts. No production source approved (mock only).
- **Replay/digest:** domain-separated `keccak256(abi.encode(DigestInput))` binding chain, executor,
  registry, feature, target, selector, token pair, amounts, fee/slippage, taker, nonce, deadline, and
  calldata hash; single-use digest + nonce marked BEFORE the external call (atomic revert restores them);
  rejects expired/too-far deadlines, digest/calldata-hash mismatches, reused nonces/digests.
- **Atomic settlement:** require zero prior allowance → approve EXACTLY the sell amount → call ONLY the
  verified router → require the measured NVDA balance delta ≥ minimum → reset allowance to zero → require
  zero allowance → emit sanitized event. Any failure reverts the whole operation. No arbitrary-call,
  delegatecall, arbitrary-approval, or policy-bypassing path; `recover` only sweeps the contract's own
  balance to the controller and is `nonReentrant`.

Cross-language digest parity is proven by a shared fixed vector asserted in both the TypeScript test
(`computeOnchainIntentDigest`) and the Solidity test (`test_digestParityVector`): digest
`0x99edf1c907908d0d6f278d7e04c0a6624ba35f59ca6b7b74800b220fdd8e8c06`.

Test coverage: 50 Foundry tests (unit + fuzz + a stateful invariant that the router allowance is always
zero across 128,000 handler calls). Executor runtime size ~9.05 KB.

### Remaining gaps (unchanged)

- **Selector proof:** authoritative ABI/source for `0x77963966` NOT found (no repo-owned/vendored Rialto
  router ABI proves its signature/layout) — it stays disabled; **first canary blocker**.
- **Price source (D-22B):** no trusted production price guard/oracle + freshness policy.
- **Safe address:** no production controller Safe authorized.
- **Deployment/authorization:** undeployed; no deploy script/address; D-24 requires a separate bounded
  founder authorization before any live use.

## Decision states (unchanged governance; candidates only)

D-5 exact temporary allowance implemented locally (approval/deployment-pending). D-6 executor-as-taker
architecture implemented; remains open (selector proof, production Safe, and dated runtime registry
strategy unresolved). D-8 0.01 WETH cap + 100-bps ceiling implemented as candidate policy (no production
authorization). D-21 replay + allowance protections implemented/tested locally (deployment-review
pending). D-22B price-guard enforcement implemented with mocks (trusted production source unresolved).
D-3 counsel-pending. D-23 counsel-pending. D-24 stands. D-17 unchanged. Local unit tests are NOT a fork
rehearsal, live simulation, or authorization.
