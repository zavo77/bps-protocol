# BPS Guarded-Settlement Executor — Activation Readiness & External Review Packet — 2026-07-26 (TASK 10K-9)

Machine-readable evidence: [`BPS_EXECUTOR_ACTIVATION_READINESS_2026-07-26.evidence.json`](./BPS_EXECUTOR_ACTIVATION_READINESS_2026-07-26.evidence.json).

**Status: `EXECUTOR_EXTERNAL_REVIEW_PACKET_READY`.** This packet is prepared for an **independent
smart-contract auditor and counsel**. It authorizes nothing. **No mainnet transaction, no Safe transaction,
no executor deployment/configuration, no ownership action, no asset movement, no external communication**
occurred. **Claude's own review is NOT an independent audit** and does not satisfy any audit or counsel gate.
**D-24 remains fully in force** and is not weakened, replaced, or reinterpreted by this task.

## Scope

- **In scope:** `GuardedSettlementExecutor.sol`, `ChainlinkSettlementPriceGuard.sol`, their interfaces, and
  the broadcast-free `GuardedSettlementConfig.sol` / `DeployGuardedSettlement.s.sol`. Source SHA-256 hashes,
  compiler settings, and dependency versions are frozen in the evidence JSON.
- **Excluded:** Rialto router/registry internals (opaque, untrusted), Chainlink aggregator internals
  (external oracle), Gnosis Safe v1.4.1 (upstream-audited; verified live), the frozen BPS core (separate
  audit scope), and the off-chain TypeScript preflight.

## Frozen executor candidate

Commit `b4d7eb3a5f9d18d9d8ee99a6317d477a66a5d604` (executor last modified at `5181f1b`; unchanged since; tree
clean). solc **0.8.26**, optimizer on / 200 runs, **evm_version NOT pinned** (see KL-1). OZ **5.6.1**
(production), forge-std **1.9.7** (test-only). Immutables `weth`/`stockToken(NVDA)`/`registry` = the
live-verified addresses. Owner = the controller Safe (`Ownable2Step`). Starts **paused**; `unpause()` is
gated on `ConfigIncomplete` until price guard + approved router code hash + approved selector + WETH cap +
WETH/NVDA pair are all set. Envelope: registry-locked target + pinned router code hash + approved selector +
opaque unmodified calldata + own-balance NVDA delta ≥ minimum + exact allowance reset + single-use
digest/nonce replay guard + atomic revert. **No arbitrary call, no delegatecall, no arbitrary approvals**;
`recover()` moves at most the contract's own balance to the owner. Full constants, required configuration,
ownership mechanism, privileged roles, trusted externals, and **10 unresolved decisions (UD-1..UD-10)** are
enumerated in the evidence JSON.

## Verification & rehearsal (this task, from the clean checkout)

- Foundry `forge test --offline`: **513/513 pass** (51 suites; incl. fuzz + invariants). 0 fail, 0 skip.
- Rialto vitest: **252/252 pass** (10 files). typecheck, lint, build: **clean**. `forge fmt --check` +
  `prettier --check .`: **clean**.
- Deployment rehearsal `test/GuardedSettlementDeploy.t.sol::test_rehearsal_fullLifecycle`: paused-by-default,
  config-gate unpause, fresh-feed settlement returns the oracle-floor delta, stale-feed failure leaves zero
  allowance + unconsumed digest + unused nonce, two-step controller transfer.
- **Mainnet-fork read-only:** Foundry cannot deserialize Robinhood Chain's Arbitrum-Nitro block/tx encoding
  (documented since 10K-5); read-only verification is via direct JSON-RPC instead (feeds/router 10K-7; Safe
  this task). **One documented skip:** `cast run` full-tx fork replay (tooling limitation, not missing state).
- **Safe controller re-check (read-only):** `0x62Ae5b22Dd28Ee338E5A447ed849f9C7008A5E62` — v1.4.1, owners =
  the three approved (2-of-3), threshold 2, nonce 0, singleton + fallback match, **no guard, no modules**,
  native/WETH/NVDA balances **zero**, runtime 171 B hash `0xd7d408…fb4c`. Verified **candidate** controller —
  **not active** (owns/controls nothing; no executor exists).

## Threat & control matrix

The evidence JSON contains the full 20-row matrix (compromised deployer / executor owner / individual Safe
owner; malicious or incorrect router; malicious Rialto response; stale quote; excessive slippage; wrong
token; wrong recipient; replay; double settlement; partial fill; fee-on-transfer/rebasing; oracle/decimal
error; chain/RPC mismatch; configuration error; ownership-transfer failure; pause/recovery failure; Safe
threshold failure; offchain/onchain reconciliation). Each row records mitigation, test/evidence, residual
risk, whether it blocks activation, and the required independent reviewer. **No risk is marked resolved
without in-repo evidence**, and the activation-blocking rows all require an independent smart-contract
auditor (several also require counsel or founder policy).

## Gate status (authoritative repository record)

The authoritative D-numbering is the **Rialto Access + Price/Risk Decision Pack (D-1..D-24)**, every row of
which is **`PROPOSED — NOT APPROVED`** (the founder approval ballot was **never returned/filled**).

- **D-3** — _"May a broader-scope key ever enter the BPS server env?"_ → candidate **"never"**. This is a
  **key-scope policy** (Counsel + Founder), **not** an independent audit. Honored in practice (QEX-1
  consumed; no execution key in env) but not formally approved. **Discrepancy flagged:** the task frames D-3
  as "independent review", but the repository's independent **security-audit** gate is **B-1**.
- **B-1 (independent audit)** — **OPEN.** No independent smart-contract audit has been performed. Claude's
  internal review does **not** satisfy it; the 10K-8 founder "security-review APPROVED FOR PAUSED DEPLOYMENT"
  was a Safe-only-deployment status, not an executor audit.
- **D-23** — _"Legal eligibility gate"_ → **REQUIRED before any real acquisition** (Counsel). **COUNSEL-PENDING**;
  B-2 unresolved; **no qualifying counsel approval exists** in the repository.
- **D-24** — _"Conditions before ANY mainnet acquisition"_ → **"ALL preceding items + independently reviewed
  authorization"** (all of D-1..D-23 approved, selector pinned, audit B-1, legal B-2, fresh authorization
  task). **FULLY IN FORCE; not satisfied.** A new, bounded, independently-reviewed authorization task is
  required to replace it.
- **Other blockers:** B-2 (legal) open; D-22 (price-guard trust model) unresolved; ballot not returned;
  D-8/D-16/D-17/D-18/D-20 deferred; D-9/D-10 feeds verified live but not formally ratified; D-11 mapping
  pending; D-5/D-6/D-21 await written Rialto semantics; no funded deployer (owners hold 0 ETH); QEX-1 consumed.

## Known limitations, evidence still needed, and NOT-AUTHORIZED checklists

Known limitations (KL-1 evm_version not pinned; KL-2 no Foundry fork; KL-3 no indexer; KL-4 Rialto semantics;
KL-5 no sequencer feed), the exact evidence still needed from an **independent auditor**, from **counsel**,
and from the **founder**, plus a later-stage **deployment checklist** and a separate **canary checklist** —
both clearly marked **NOT AUTHORIZED** — are enumerated in the evidence JSON. No auditor or counsel names,
signatures, dates, opinions, or approvals are fabricated.

## Conclusion

The frozen executor + guard pass all in-repo verification and the Safe controller is deployed and verified,
but **the activation gates are NOT met**: no independent audit (B-1), no counsel approval (D-23), the ballot
is unreturned, and **D-24 stands**. The Safe remains a **verified candidate controller**, not an active one.
Terminal status: **`EXECUTOR_EXTERNAL_REVIEW_PACKET_READY`** — activation remains prohibited.
