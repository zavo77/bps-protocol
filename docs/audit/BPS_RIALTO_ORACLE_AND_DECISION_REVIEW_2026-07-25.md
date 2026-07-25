# BPS Rialto Oracle + Decision Review — 2026-07-25 (TASK 10I-2)

Machine-readable evidence:
[`BPS_RIALTO_ORACLE_AND_DECISION_REVIEW_2026-07-25.evidence.json`](./BPS_RIALTO_ORACLE_AND_DECISION_REVIEW_2026-07-25.evidence.json).

Review of the TASK 10I-1 oracle-semantics correction from the actual repository, with the substantive
findings corrected in code and the 24 production decisions consolidated into one founder/counsel
approval ballot ([`../decisions/BPS_RIALTO_FOUNDER_APPROVAL_BALLOT_2026-07-25.md`](../decisions/BPS_RIALTO_FOUNDER_APPROVAL_BALLOT_2026-07-25.md)).

## 1. Source-mode review (10I-1 diff)

`PER_TOKEN_CHAINLINK` is a structurally distinct source mode whose feed answer is used **directly**
as the per-token USD price. Confirmed by reading the code: in that branch `perTokenNum = outF.answer`
and `perTokenDen = 1n`, and `multiplierApplied = false` — **`uiMultiplier` / `newUIMultiplier` /
`effectiveAt` / `oraclePaused` never enter the numerator or denominator**; they are availability/
consistency guards only. A dedicated test now proves that sweeping `uiMultiplier` across 1×…1000×
with the per-token answer unchanged does not change expected output.

**Corrections made this task (structural, minimal):** the 10I-1 version let the _caller_ stamp
`semantics` on each observation, so raw-underlying data could in principle be labeled
`PER_TOKEN_CHAINLINK`. Now the **policy pins** `inputFeedIdentity`, `outputFeedIdentity` and
`outputSemantics`; each observation must match all of `{feedIdentity, semantics, asset}` or the
guard throws `FEED_IDENTITY_MISMATCH` / `SEMANTICS_MISMATCH` / `ASSET_BINDING_MISMATCH`. Empty
policy identity ⇒ `FEED_BINDING_MISSING` (fail closed). The input side's semantics are pinned to
`PER_TOKEN_CHAINLINK` by the code, not the caller. `RAW_UNDERLYING` remains separately typed,
applies the multiplier exactly once, and is reachable **only** when an approved policy sets
`allowRawUnderlyingForEvidence` **and** `outputSemantics: "RAW_UNDERLYING"` — the normal production
Chainlink configuration cannot reach it, and missing Chainlink config cannot silently fall back to
it (`PRICE_FEED_MISSING`). No production feed, heartbeat, sequencer or risk value was invented.

## 2. Independently verified arithmetic

Re-derived dimensionally, the result equals:

```
floor( sellRaw × inputFeedAnswer × 10^outputFeedDecimals × 10^outputTokenDecimals
       / (10^sellTokenDecimals × 10^inputFeedDecimals × outputFeedAnswer) )
```

which matches the implementation for `PER_TOKEN_CHAINLINK` (`perTokenNum = outputFeedAnswer`,
`perTokenDen = 1`); the multiplier appears only in the gated raw-underlying numerator, applied once.
Verified: single conservative floor at the final division; no intermediate rounding; bigint-only;
zero denominator impossible (positive answers + positive `pow10`); decimals bounded to ≤ 77;
**new** uint256-domain bounds reject oversized amounts/answers **before** exponentiation
(`AMOUNT_OUT_OF_DOMAIN`); values near 2^250 handled exactly. Split example re-computed independently:
before ($200 underlying, mult 1, feed $200) and after (10:1 split → $20 underlying, mult 10, feed
$200) both yield the same token-unit output with **no** second 10× application.

## 3. Round, pause, transition, freshness, sequencer

Feeds reject: non-positive answer, `roundId == 0` (**new** `ZERO_ROUND`), `updatedAt == 0`, future
timestamp, incomplete round, staleness beyond policy, wrong feed identity, wrong token, missing
policy. Stock-token state rejects `oraclePaused == true`, pending multiplier transition, non-positive
multiplier, and semantic relabeling. Sequencer validation requires the configured feed identity
(cannot be HTTP-supplied — it is a policy value, not a request field), `answer == 0`, valid
round/timestamp, non-future `startedAt`, elapsed grace measured from `startedAt`, and fails closed
when config/observation/grace is absent. `nowSec` is a trusted-server clock parameter, never a
quote-request field; the shifted-clock unit tests exercise internal branches and do **not** imply a
production caller can move time. Strict freshness-limit enforcement is kept distinct from any future
session-aware policy; **no market calendar is implemented**.

## 4. Enforcement boundary (launch decision)

- TypeScript price validation is a **trusted-server control**.
- On-chain contracts independently enforce registry-selected target, deadline, exact spend +
  balance-delta ≥ operator-supplied `minStockOut`, residual handling, and the 80/20 split.
- On-chain contracts **do not** derive a price floor from oracle data.
- **A sufficiently privileged operator can bypass the TypeScript price guard** by supplying an
  arbitrary `minStockOut` to `executeAndRecordAcquisition`.
- No artifact calls the TypeScript guard authoritative on-chain enforcement.

This is surfaced as ballot **D-22**: (A) accept trusted-server/operator enforcement for the initial
controlled acquisition with approved operational controls; (B) require coordinator-level on-chain
oracle-floor or a guarded executor before any mainnet acquisition (accepts redeployment); (C) keep
acquisitions disabled. Conservative candidate: **C unless A is expressly accepted or B is
implemented + reviewed.** Neither A nor B was implemented in this task.

## 5. Rialto wording (corrected)

`GET /quote` requires `quote:read`, returns a **firm executable transaction payload**, creates/
returns a server-side `quote_id`; retrieval does not sign or broadcast the taker transaction; direct
execution needs the taker to submit; settlement is allowance or Permit2; feature 3 gasless is not
the BPS route; example calldata/selectors are not approval; the actual allowance-mode selector,
verified ABI and replay semantics remain unresolved. **"NON-BINDING" was removed** as unsupported by
evidence; the approved phrasing is:
**QUOTE RETRIEVAL ONLY — RETURNS A FIRM EXECUTABLE PAYLOAD; NO SIGNATURE OR BROADCAST OCCURS DURING
RETRIEVAL.** Whether retrieval creates a server-side obligation/reservation is left OPEN for Rialto
to answer (ballot D-21 + access-request question 4), not answered here.

## 6. Decision-pack dependency/approver corrections

Reclassified in the ballot: D-5/D-6 are architecturally proposable now but require quote/Rialto
validation (not "cannot be decided"); D-7/D-8 are decidable now (D-8 conservatively deferred, and
explicitly NOT anchored to the docs' 50 bps example); D-9/D-10/D-13/D-16 await official feed metadata;
**D-11 reclassified from legal to primarily price-risk/engineering** (counsel only if a legal
characterization of WETH is implicated); **D-22 identified as a security/governance trust-boundary
decision** (with counsel input on operator authority); D-23 remains counsel-controlled; D-24 inherits
every technical/security/legal prerequisite.

## 7. Classification

**B-3 remains `PARTIAL — RIALTO QUOTE ACCESS REQUIRED`** (only documentation + decision-classification
corrections plus structural test/guard strengthening were needed; the implementation is not
downgraded). Independently recorded: `APPROVED PRICE AND RISK POLICY REQUIRED`,
`VENUE SELECTOR UNVERIFIED`, `VENUE REPLAY SEMANTICS UNRESOLVED`, `LEGAL ELIGIBILITY UNRESOLVED`,
`PRICE-GUARD TRUST MODEL NOT YET APPROVED`.

## 8. Next step

Return the single consolidated ballot (section 4 template) for founder/counsel review. No selection
is implemented by this task.
