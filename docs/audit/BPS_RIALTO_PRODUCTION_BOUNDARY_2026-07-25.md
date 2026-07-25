# BPS Rialto Production Boundary — 2026-07-25 (TASK 10H-1, B-3)

**Classification: `PARTIAL — RIALTO QUOTE ACCESS REQUIRED`**

> No Rialto quote was executed.
> No Stock Token was purchased or sold.
> No mainnet allowance was changed.
> No mainnet settlement occurred.
> No wallet, signature or broadcast capability was used.
> Technical Stock Token identity does not establish legal eligibility.
> BPSC remains a canary and is not canonical BPS.
> This task does not authorize deployment, root publication or public launch.

Machine-readable evidence:
[`BPS_RIALTO_PRODUCTION_BOUNDARY_2026-07-25.evidence.json`](./BPS_RIALTO_PRODUCTION_BOUNDARY_2026-07-25.evidence.json).

## Why PARTIAL

`RIALTO_API_URL` / `RIALTO_API_KEY` are **not configured** in this environment (checked as booleans
only). No authorized read-only quote could be retrieved, and none was fabricated. Per the task
instruction, all quote-independent hardening was completed and the classification is
`PARTIAL — RIALTO QUOTE ACCESS REQUIRED`. Two further gaps are recorded (not silently absorbed):
the venue **settlement selector remains unpinned** (needs a real quote) and **no approved
price/staleness/deviation/cap policy exists** (founder decision pack #10/#12) — the new machinery
fails closed on all three.

## Current external truth (read-only, block 19062620)

| Item                        | Value                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chain                       | 4663 (verified)                                                                                                                                                                                                                                                                                                                                       |
| Rialto Router Registry      | `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E` — 4,968 bytes, code hash `0xf8b9b92ca74f49f59f66ece51adb02dbefe254dcf967db586c4dda798268a01e` (matches the recorded verified value)                                                                                                                                                                      |
| Feature 2 → resolved router | **`0xc94135b63772b91d79d0a2daab2a8801f32359bd`** — nonzero, 24,232 bytes, code hash `0xa7041268d6f20802f420b5c71e84a991dc797f27cb474265598b89e43ef27611`; resolution SUCCESS proves initialized + not paused                                                                                                                                          |
| WETH                        | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` — code hash matches the authoritative record                                                                                                                                                                                                                                                             |
| Technical validation asset  | NVDA `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` — code hash matches the official-registry-sourced record; symbol/name/decimals confirmed on-chain; uiMultiplier 1e18 (no pending transition observable); oraclePaused = false (not halted). **TECHNICAL VENUE VALIDATION ASSET — LEGAL ELIGIBILITY UNVERIFIED — NOT AN APPROVED PRODUCTION BASKET** |

Identity is established by **address + code hash against the official registry record** — never by
symbol or name.

## Hardening delivered (all fail-closed, policy-neutral; no economics touched)

1. **`packages/rialto/src/quote-structural.ts`** — execution-shape validation: `tx.to` must equal
   the **live-resolved** feature router; approved-selector schema list is **EMPTY by default**
   (`SELECTOR_POLICY_MISSING` until the real selector is pinned); opaque multicall selectors
   forbidden; exact ABI decode + canonical **re-encode round-trip** (rejects trailing/ambiguous
   bytes); token/amount/recipient role binding; expiry required and enforced.
2. **`packages/rialto/src/price-guard.ts`** — independent price guard: integer-only, explicit pair
   binding, decimal normalization, zero/negative/stale/incomplete rejection, **corporate-action
   uiMultiplier handling** with fail-closed pending-transition, deviation band + per-transaction cap
   — with **no invented feed, threshold or cap** (missing policy fails closed).
3. **`packages/rialto/src/boundary-status.ts`** — consumer status classifier distinguishing quote
   observed / structurally valid / price-guard passed / settlement not executed /
   `SETTLEMENT_EXECUTED_LOCAL_FORK_ONLY` / mainnet confirmed; a malformed proof never upgrades the
   status; **this task cannot produce `MAINNET_SETTLEMENT_CONFIRMED`**; legal eligibility always
   reported unresolved.
4. **`quote-client.ts`**: `redirect: "error"` added — a redirecting quote endpoint is now a hard
   failure. Server-only isolation re-verified (`@bps/rialto/server` subpath; browser-import test
   rerun).

## Settlement review

The frozen adapter/vault/coordinator already enforce every §9 requirement — mapped to exact named
Foundry tests in the evidence (`settlementHardeningReview`): exact balance-delta truth
(`StockVaultHostile.testLieOver/UnderReverts`), overspend/partial-spend/no-spend, zero output,
under-delivery, fee-on-transfer rejection, residuals, allowance clearing (`AllowanceNotCleared`),
hostile-router theft, reentrancy, record-mismatch, funding caps, atomic rollback
(`RialtoEndToEnd.testHostileRialtoRollsBackAcquisition`). **No contract change was needed or made.**
Residual venue dependency recorded: quote replay/nonce semantics are venue-side (bounded on-chain by
`ExpiredQuote` + operator authority).

## Verification

| Suite                                                                     | Result                                                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@bps/rialto` vitest (30 baseline + 46 new incl. 10H-2 arithmetic matrix) | **76/76**                                                                                             |
| Web browser-import boundary                                               | 2/2                                                                                                   |
| Adapter/vault/coordinator Foundry                                         | 126/126                                                                                               |
| Full `forge test` (fork env)                                              | **418/418**                                                                                           |
| `npm run check`                                                           | PASS end-to-end                                                                                       |
| Mainnet before/after (read-only)                                          | IDENTICAL — 16/16, 8/8, no nonce-8; no allowance/lock/vault/supply/pool change; **zero acquisitions** |
| Prior artifacts (v9 ZIP, canary, 10F-1, 10G-1)                            | byte-identical                                                                                        |

The complete ~60-condition coverage map (each condition → exact named Vitest/Foundry test, concrete
runtime guard, or justified `INAPPLICABLE`) is in the evidence manifest's `coverageMap`.

## TASK 10H-2 review (2026-07-25)

Submitted hashes (recorded, superseded by review corrections): evidence `e7bc7e6a…006e`, report
`2b87cde1…41df`. Corrections: (1) a 7-case decimal×multiplier arithmetic matrix with independently
derived expected values (incl. 6/8/18-decimal combinations, 10x split, 0.5x reverse split, 2^200
inputs, conservative floor); (2) trust-model clarification — `nowSec`/`resolvedRouter` are injected
only by the trusted server boundary (no external caller path exists), with the on-chain adapter's
registry-locked target + ExpiredQuote enforcement authoritative regardless; (3) re-affirmed that
expiry revalidation is not durable venue replay protection. Fresh router re-resolution at block
19078598 reproduced the identical router + code hash. Final hashes are in the 10H-2 report.

## Remaining B-3 blockers

1. Authorized server-side Rialto API access (retrieve one real read-only quote).
2. Pin the real venue settlement selector + ABI from that quote into an approved selector policy.
3. Founder/counsel-approved independent price feed + staleness/deviation/transaction-cap policies.
4. Venue-side quote replay/nonce semantics confirmation.

## Recommended next task

Obtain authorized Rialto API access and rerun this boundary against a real read-only quote
(selector pinning + sanitized quote evidence), alongside commissioning the independent audit (B-1).

## TASK 10I-1 correction (2026-07-25, appended — history preserved)

1. **Price-unit defect (CRITICAL, corrected):** the 10H-1 price guard modeled its feed answer as
   the RAW UNDERLYING share price and multiplied by `uiMultiplier`. The verified official
   semantics (Chainlink tokenized-equity feeds) return the PER-TOKEN price with the multiplier
   ALREADY included — the production configuration would have DOUBLE-APPLIED the multiplier. The
   guard was rewritten with typed semantics (`PER_TOKEN_CHAINLINK` used directly;
   `RAW_UNDERLYING` an explicitly gated evidence mode applying the multiplier exactly once), a
   two-feed expected-output model, and L2 sequencer machinery. See
   `docs/audit/BPS_RIALTO_ORACLE_SEMANTICS_REVIEW_2026-07-25.md`.
2. **Wording:** the earlier read-only description of `/quote` is corrected to **NON-BINDING,
   NON-SIGNED, NON-BROADCAST QUOTE RETRIEVAL** — it returns a firm executable payload and a
   server-stored `quote_id`.
3. 10H-2-final hashes (evidence `979f351d…d1b8`, report `7b0c88c6…5a87`) are preserved as
   historical facts and superseded by the post-correction hashes in the 10I-1 report.

## TASK 10I-2 wording correction (2026-07-25, appended)

The 10I-1 phrasing "NON-BINDING, NON-SIGNED, NON-BROADCAST QUOTE RETRIEVAL" is superseded: Rialto
documents the quote as firm + server-stored, so only signature/broadcast absence is evidenced.
Corrected phrasing: **QUOTE RETRIEVAL ONLY — RETURNS A FIRM EXECUTABLE PAYLOAD; NO SIGNATURE OR BROADCAST OCCURS DURING RETRIEVAL**. 10I-1 hash for this file is preserved in history and
superseded by the 10I-2 review report.
