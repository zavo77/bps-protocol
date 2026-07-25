# BPS Rialto/Stock-Token Oracle Semantics Review — 2026-07-25 (TASK 10I-1)

Machine-readable evidence:
[`BPS_RIALTO_ORACLE_SEMANTICS_REVIEW_2026-07-25.evidence.json`](./BPS_RIALTO_ORACLE_SEMANTICS_REVIEW_2026-07-25.evidence.json).

## 1. Authoritative oracle semantics (verified 2026-07-25, ~15:15 UTC)

Sources reviewed (exact URLs, retrieval recorded in evidence):
`docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood`,
`docs.robinhood.com/chain/oracles-and-price-feeds/`, `docs.robinhood.com/chain/stock-token-apis/`,
`docs.rialto.xyz/developers/requesting-a-quote`.

Verified semantics:

1. A Robinhood Stock Token Chainlink feed returns the **USD price of ONE STOCK TOKEN** — "Token
   Price = Underlying Equity Market Price × Multiplier". The multiplier is **already included**.
2. Consumers **must not multiply by `uiMultiplier` again** ("you don't apply the multiplier
   yourself").
3. Robinhood REST `/prices` is different: it returns the **raw underlying-equity bid/ask, not
   multiplier-adjusted**, and the docs direct settlement consumers to the on-chain feed.
4. During corporate actions the feed **pauses and holds the last good value**; `oraclePaused()`
   must make the price unavailable; pending state is readable via `newUIMultiplier()`/`effectiveAt()`.
5. Tokenized-equity feeds **hold values outside market sessions and have no off-hours heartbeat**;
   staleness must be checked via `updatedAt`.
6. No sequencer guidance appears on the tokenized-equity page; standard L2 practice (sequencer
   uptime feed + recovery grace) is adopted as policy-neutral machinery pending approved values.
7. No NVDA/ETH feed addresses, decimals or heartbeats were published in the fetched excerpts —
   **no candidate address could be pinned from the official source in this pass; none was invented.**

## 2. Defect finding: the 10H-1 guard double-applied the multiplier for the production source

The 10H-1 `validateIndependentPrice` documented its `answer` as the **raw underlying** share price
and multiplied by `uiMultiplier`. That is correct **only** for a raw-underlying source (e.g. REST
`/prices`). The intended production reference is the **Chainlink per-Stock-Token feed**, whose value
already includes the multiplier — so in production configuration the 10H-1 formula would have
**double-applied the multiplier** (e.g. a 10× split would inflate the expected output 10×,
loosening the deviation floor by the same factor). The 10H-2 review validated the arithmetic
_against its own stated raw-underlying semantics_ and did not catch the production-source mismatch.

## 3. Correction (committed this task)

`packages/rialto/src/price-guard.ts` was rewritten:

- **Typed price semantics** (`PER_TOKEN_CHAINLINK` | `RAW_UNDERLYING`) bound to each observation —
  a caller cannot relabel one source as the other (`SEMANTICS_MISMATCH`).
- **Production mode = `PER_TOKEN_CHAINLINK`**: the feed answer is used **directly**; `uiMultiplier`,
  pending-transition and `oraclePaused()` are consistency/availability guards only
  (`ORACLE_PAUSED`, `MULTIPLIER_TRANSITION` fail closed).
- **`RAW_UNDERLYING` retained as an explicitly gated evidence/testing mode**: applies the
  multiplier exactly once and is unreachable unless `allowRawUnderlyingForEvidence` is set in an
  approved policy (`RAW_UNDERLYING_NOT_APPROVED` otherwise). It can never silently substitute for a
  missing Chainlink token feed.
- **Two-feed expected-output model** (WETH → NVDA:
  `canonical WETH amount × WETH/ETH-USD feed ÷ NVDA Stock-Token-USD feed`):

  ```
  expected = floor( sellRaw × inAnswer × 10^outFeedDec × 10^outDec × perTokenDen
                    / (10^sellDec × 10^inFeedDec × perTokenNum) )
  ```

  Integer-only, decimals ≤ 77 (no unbounded exponentiation), single conservative floor,
  2^200-scale-safe, exact per-feed asset binding.

- **L2 sequencer machinery** added (policy-neutral, fail-closed): configured feed identity (no
  substitution), `answer == 0` = up, round/timestamp validity, configured post-recovery grace;
  missing configuration/observation fails closed. No sequencer address, grace seconds, heartbeat,
  staleness value or off-hours exception was invented.
- 26 corrected/new price tests + 5 sequencer tests, expected values **independently hand-derived**
  (incl. the split-continuity case: underlying $200/mult 1 → underlying $20/mult 10 with the token
  feed unchanged at $200 → identical token-unit output).

**WETH→ETH/USD feed mapping is an asset-mapping policy requiring approval** (canonical WETH priced
by an ETH/USD feed assumes 1:1 wrap parity) — recorded as decision D-9/D-11 in the decision pack,
not decided here.

## 4. Enforcement boundary (unchanged facts, stated precisely)

| Layer                                      | Enforces                                                                                             | Trust assumption                                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript price guard (`@bps/rialto`)     | independent-price deviation, caps, availability                                                      | **Trusted-server validation only** — a privileged operator could bypass it and call `executeAndRecordAcquisition` with an arbitrary `minStockOut` |
| On-chain adapter/vault                     | registry-locked target, quote deadline, exact spend, balance-delta ≥ `minStockOut`, residuals, 80/20 | authoritative, but `minStockOut` **originates from the operator input**                                                                           |
| On-chain balance-delta settlement          | actual received amounts                                                                              | authoritative                                                                                                                                     |
| Independent-price enforcement **on-chain** | **ABSENT**                                                                                           | would require a frozen-contract change                                                                                                            |

Minimal proposed FUTURE change (documented only, NOT made): an oracle-floor check on
`minStockOut` inside `DistributionFundingCoordinator.executeAndRecordAcquisition` (or a new guarded
executor wrapping it) reading the approved Chainlink feeds on-chain; requires redeployment of the
coordinator wiring and is therefore a production-deployment-cycle decision.

## 5. Current Rialto API facts (verified 2026-07-25)

`GET /quote` returns a **firm executable transaction** and a **server-stored `quote_id`**
("UUID handle for the server-stored quote"); retrieval does **not** sign, approve or broadcast;
`slippage_bps` and a nonzero `taker` are required; feature 2 = direct/taker-submitted, feature 3 =
gasless/relayed (not the BPS flow); allowance and Permit2 are distinct settlement modes; no
smart-contract-taker guidance is documented; **no settlement selector/ABI is documented** (examples
are not production approval); allowance-mode replay/nonce semantics are **not documented**
("request a fresh quote if the user waits").

**Correction to earlier wording:** 10H artifacts described `/quote` as "read-only". Corrected to:
**QUOTE RETRIEVAL ONLY — RETURNS A FIRM EXECUTABLE PAYLOAD; NO SIGNATURE OR BROADCAST OCCURS DURING RETRIEVAL** — not an order or execution, but it
returns an executable payload and a server-stored quote identifier. Dated corrections appended to
the 10H evidence/report; superseded hashes preserved as history.

## 6. Classification

B-3 remains **`PARTIAL — RIALTO QUOTE ACCESS REQUIRED`**, with these independently recorded:
`APPROVED PRICE AND RISK POLICY REQUIRED` · `VENUE SELECTOR UNVERIFIED` ·
`VENUE REPLAY SEMANTICS UNRESOLVED` · `LEGAL ELIGIBILITY UNRESOLVED`.

All remaining approvals are consolidated in
[`docs/decisions/BPS_RIALTO_ACCESS_AND_PRICE_RISK_DECISION_PACK_2026-07-25.md`](../decisions/BPS_RIALTO_ACCESS_AND_PRICE_RISK_DECISION_PACK_2026-07-25.md)
(24 decisions, all `PROPOSED — NOT APPROVED`).

## TASK 10I-2 wording correction (2026-07-25, appended)

Rialto documents the quote as a FIRM, server-stored executable payload; therefore "NON-BINDING"
is not supported by current evidence and has been removed. Corrected phrasing: **QUOTE RETRIEVAL ONLY — RETURNS A FIRM EXECUTABLE PAYLOAD; NO SIGNATURE OR BROADCAST OCCURS DURING RETRIEVAL**.
Whether retrieval creates any server-side obligation/reservation remains an OPEN question for
Rialto to answer (decision D-21); it is not asserted here. Superseding hashes are recorded in the
10I-2 review report.
