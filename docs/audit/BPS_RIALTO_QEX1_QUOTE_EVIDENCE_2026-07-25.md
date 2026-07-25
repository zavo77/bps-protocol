# BPS Rialto QEX-1 Quote Evidence — 2026-07-25 (TASK 10K-2)

Machine-readable evidence:
[`BPS_RIALTO_QEX1_QUOTE_EVIDENCE_2026-07-25.evidence.json`](./BPS_RIALTO_QEX1_QUOTE_EVIDENCE_2026-07-25.evidence.json).

> **Location note.** The repository uses a flat `docs/audit/BPS_RIALTO_*_2026-07-25.{md,evidence.json}`
> convention (no `docs/audit/rialto/` subtree exists). Per the task's fallback clause this artifact uses
> that established location/naming rather than introducing a divergent subdirectory.

**QEX-1 is `CONSUMED / COMPLETE`.** Exactly one authenticated Rialto `GET /quote` succeeded on
2026-07-25. No retry or additional quote is authorized. This is a **quote evaluation only** — NOT a
trade, acquisition, approval, simulation, or production configuration. **D-24 stands: no acquisition,
funding, allowance, simulation, or execution is authorized.**

## What this records

- **Original quote response** (sanitized founder-supplied result): raw sell/buy/min-buy amounts,
  settlement mode `allowance`, platform fee 5 bps, `tx.to` = `0xc94135b63772b91d79d0a2daab2a8801f32359bd`,
  selector `0x77963966`, calldata byte length 804, `tx.value` 0, a single route leg with all-`null`
  metadata, and the **SHA-256 of `quote_id`** (never the raw id). No API key, no complete calldata.
- **Original structural result** (captured unchanged): `passed=false`, `ROUTER_UNRESOLVED`,
  boundary `QUOTE_OBSERVED` — the evaluator had no live-resolved router at run time, so it failed closed.
- **Registry observation** (separate, conversation-supplied, read-only, **undated**): registry
  `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E`, feature 2 (taker-submitted route), current router
  `0xc94135b63772b91d79d0a2daab2a8801f32359bd`, previous/next = zero, `paused=false`. Block number and
  observation time are unavailable. This snapshot is **not permanent authority**. Feature 3 is the
  gasless route.
- **Derived offline replay** (pure, no network/env — `packages/rialto/src/registry-structural.ts`):
  router target matched the reported current feature-2 router; snapshot reported `paused=false`; router
  reconciliation succeeded **only for that undated snapshot**; selector `0x77963966` remains
  **evidence-only** and is **not approved or pinned**; overall production structural approval remains
  **false**; **D-6 remains open**. Derived status: `SELECTOR_UNAPPROVED`.

## Governance (unchanged by this evidence)

QEX-1 CONSUMED/COMPLETE (one quote only). D-2 read-only preference preserved. D-3 counsel-pending.
D-5 open (`allowance` was evaluation input only). D-6 open. D-8 open (50 bps was a test value).
D-21 open. D-22B open. D-23 counsel-pending. D-24 stands. Ballot D-17 untouched.

## Deliberately omitted for security

API key / credential fragments; the raw `quote_id` (SHA-256 only); complete calldata (selector +
byte length only); PowerShell secret-entry material; any human-decimal NVDA amount (raw buy amounts are
retained as authoritative).
