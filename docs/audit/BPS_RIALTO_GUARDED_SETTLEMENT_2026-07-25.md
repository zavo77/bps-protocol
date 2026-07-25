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

## Solidity executor — DEFERRED (prerequisite missing)

Foundry (`foundry.toml`, `forge`) and OpenZeppelin (root `node_modules`, remapped) are present, and a
repo-owned documentation-verified `IRialtoRouterRegistry` ABI exists. **However, the Solidity test runner
cannot run offline in this checkout: `packages/contracts/lib/` (forge-std) is gitignored and absent, so
`forge test` cannot compile, and installing forge-std requires a network dependency download that this
task forbids.** Per the task's fallback, the concrete executor + Foundry tests are deferred and a
contract-ready interface (`IGuardedSettlementExecutor.sol`) mirroring the TypeScript invariants is
provided instead. **Exact missing prerequisite:** vendored/installed `forge-std` (and a confirmed offline
`forge build`/`forge test`) in `packages/contracts`.

## Decision states (unchanged governance; candidates only)

D-5 candidate exact-allowance settlement implemented offline (founder/security approval required). D-6
open (selector unproven/unapproved, final taker unknown, dated registry strategy unapproved). D-8
candidate 50/100 bps implemented (production policy approval-pending). D-21 replay + exact-allowance
mitigations implemented offline (on-chain executor verification open). D-22B price-guard interface +
offline enforcement implemented (trusted source unresolved). D-3 counsel-pending. D-23 counsel-pending.
D-24 stands. D-17 unchanged.
