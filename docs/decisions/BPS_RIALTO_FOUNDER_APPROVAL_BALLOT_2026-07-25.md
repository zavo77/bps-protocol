# BPS Rialto — Founder/Counsel Approval Ballot — 2026-07-25 (TASK 10I-2)

## 1. Where things stand

- Checkpoint under review: `6cb33745693905f576ec521422c2fca1de3605ac` (branch `master`).
- **B-3 status: `PARTIAL — RIALTO QUOTE ACCESS REQUIRED`.** Also open:
  `APPROVED PRICE AND RISK POLICY REQUIRED`, `VENUE SELECTOR UNVERIFIED`,
  `VENUE REPLAY SEMANTICS UNRESOLVED`, `LEGAL ELIGIBILITY UNRESOLVED`,
  `PRICE-GUARD TRUST MODEL NOT YET APPROVED`.
- BPSC remains a canary; no Merkle root published; no mainnet acquisition has occurred; nonces
  deployer 16 / tester 8/8.

## 2. What this ballot is (plain language)

BPS wants to acquire tokenized-equity "Stock Tokens" with protocol fees and distribute them to
lockers. To do that safely it must (a) get read access to Rialto's quote service, (b) fix exactly
which price feeds and safety limits guard each acquisition, and (c) decide who is allowed to trigger
one. This ballot lists **24 decisions**. **Approving a row records a decision; it does NOT configure
any credential, feed address, selector, contract, or risk value, and does NOT authorize a mainnet
acquisition.** Activation is a separate, later, independently-reviewed engineering task. Every row is
`PROPOSED — NOT APPROVED` until you return the response template in section 4.

Where a value cannot yet be defended with evidence, the conservative choice is **`DEFER — KEEP
FAIL-CLOSED`** (the system already refuses to act without it).

## 3. Decisions

### A. Founder decisions available now

| ID   | Decision                               | Options                                             | Conservative candidate                                                        | Consequence                              | Approver |
| ---- | -------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- | -------- |
| D-1  | Rialto integrator owner wallet/profile | founder wallet · dedicated ops wallet · Safe signer | **dedicated ops wallet** distinct from deployer/tester                        | clear custody + accountability           | Founder  |
| D-2  | Request a `quote:read`-only key        | yes · scoped-down default · none                    | **yes — request quote:read-only**                                             | least privilege at the server            | Founder  |
| D-4  | Key storage/rotation/revocation owner  | founder · ops role · secret manager                 | **founder-owned encrypted store + documented rotation**                       | credential lifecycle defined             | Founder  |
| D-7  | Technical quote-validation amount      | tiny fixed amount                                   | **minimal venue-accepted amount, never funded**                               | enables structural validation only       | Founder  |
| D-8  | Quote-request `slippage_bps`           | value TBD (docs' 50 bps is NOT a recommendation)    | **DEFER — KEEP FAIL-CLOSED** until chosen with D-16                           | avoids picking a number without evidence | Founder  |
| D-17 | Per-acquisition cap                    | value TBD                                           | **small first cap** (align to $250 first-proof-cycle in BPS_LAUNCH_DECISIONS) | bounds loss per tx                       | Founder  |
| D-18 | Daily acquisition cap                  | value TBD                                           | **conservative multiple of D-17**                                             | bounds loss per day                      | Founder  |

### B. Security/engineering decisions available now

| ID   | Decision                             | Options                                         | Conservative candidate                                         | Consequence                      | Approver     |
| ---- | ------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------- | -------------------------------- | ------------ |
| D-12 | Feed heartbeat/staleness rule        | fixed max-staleness · session-aware later       | **strict freshness-limit enforcement; NO market calendar now** | off-hours held feeds fail closed | Security/Eng |
| D-14 | Oracle-pause behavior                | halt on `oraclePaused()`                        | **halt (implemented; ratify)**                                 | corporate-action safety          | Security/Eng |
| D-15 | Pending-multiplier behavior          | halt during transition                          | **halt (implemented; ratify)**                                 | split-window safety              | Security/Eng |
| D-19 | Weekend/off-hours behavior           | fail closed on staleness · future session-aware | **fail closed (D-12); session-aware deferred**                 | no unsafe off-hours acquisition  | Security/Eng |
| D-20 | Quote deadline / max-future-deadline | reject-absent-expiry (done) + max-lifetime TBD  | **reject absent/expired (done); DEFER max-lifetime value**     | stale-execution bound            | Security/Eng |

### C. Decisions awaiting Rialto confirmation or quote evidence

| ID   | Decision                                                       | Missing evidence                                               | Conservative candidate                                            | Approver               |
| ---- | -------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------- |
| D-5  | Settlement mode = allowance                                    | validate against a real current allowance-mode quote           | **propose allowance (matches frozen adapter); validate on quote** | Security/Eng + Founder |
| D-6  | Quote taker/recipient                                          | Rialto smart-contract-taker support confirmation               | **canary adapter for validation only; confirm SC-taker support**  | Security/Eng + Founder |
| D-21 | Allowance-mode replay + execution-ID + obligation on retrieval | Rialto written semantics (D-21 question in the access request) | **DEFER — KEEP FAIL-CLOSED until Rialto confirms**                | Security/Eng           |

### D. Decisions awaiting official feed metadata

| ID   | Decision                                     | Missing evidence                                                                      | Conservative candidate                                      | Approver               |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------- |
| D-9  | Chainlink INPUT feed (WETH/ETH-USD) identity | current official address + decimals + heartbeat (not published in the reviewed pages) | **DEFER** until pinned from chain.link                      | Founder + Security/Eng |
| D-10 | Chainlink Stock-Token (NVDA) feed identity   | current official tokenized-equity feed address + metadata                             | **DEFER** until pinned from chain.link                      | Founder + Security/Eng |
| D-13 | L2 sequencer feed + recovery grace           | official sequencer feed identity (none found) + grace seconds                         | **DEFER** feed; propose conservative grace once feed exists | Founder + Security/Eng |
| D-16 | Independent-price deviation limit            | joint with D-8; needs a real quote to calibrate                                       | **DEFER — KEEP FAIL-CLOSED**                                | Founder + Security/Eng |

### E. Counsel-controlled legal decisions

| ID   | Decision                                                                   | Conservative candidate                                                                                                                               | Approver                                                        |
| ---- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| D-3  | May a broader-scope (execution-capable) key ever enter the BPS server env? | **never outside a future authorized-settlement runbook**                                                                                             | Counsel + Founder                                               |
| D-11 | WETH→ETH/USD feed mapping rule (wrap-parity assumption)                    | **require an explicit approved mapping statement**; primarily price-risk/engineering, counsel only if a legal characterization of WETH is implicated | Security/Eng (Founder); Counsel only if legal rationale applies |
| D-23 | Legal eligibility of Stock-Token acquisition + distribution                | **REQUIRED before any real acquisition**                                                                                                             | Counsel                                                         |

### F. Final go/no-go conditions

| ID   | Decision                                     | Options                                                                                                                                                                                                                                                                                              | Conservative candidate                                                                                                                          | Approver                                                     |
| ---- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| D-22 | Price-guard trust model + executor authority | **A** accept trusted-server/operator price enforcement for the initial controlled acquisition with approved operational controls · **B** require coordinator-level on-chain oracle-floor / guarded executor before any mainnet acquisition (accepts redeployment) · **C** keep acquisitions disabled | **C (disabled) unless A is expressly accepted as a trust assumption OR B is implemented + reviewed**                                            | Security/Eng + Founder (Counsel input on operator authority) |
| D-24 | Conditions before ANY mainnet acquisition    | inherits ALL of D-1..D-23                                                                                                                                                                                                                                                                            | **ALL prerequisites approved + selector pinned + audit (B-1) + legal (B-2/D-23) + a fresh, bounded, independently-reviewed authorization task** | Founder + Counsel + Security/Eng                             |

**Approval ≠ activation.** Approving any row authorizes engineering to _prepare_ it under a later
reviewed task; nothing goes into production configuration from this ballot.

## 4. Compact founder response template (return in one message)

```
BPS RIALTO BALLOT 2026-07-25 — DECISIONS
D-1:  APPROVE candidate | CHOOSE <option> | DEFER
D-2:  APPROVE | DEFER
D-3:  APPROVE candidate | CHOOSE <option> | DEFER        (counsel)
D-4:  APPROVE candidate | CHOOSE <option> | DEFER
D-5:  APPROVE-PROPOSAL (validate on quote) | DEFER
D-6:  APPROVE-PROPOSAL (confirm SC-taker) | DEFER
D-7:  APPROVE candidate | SET <amount> | DEFER
D-8:  DEFER | SET <bps>
D-9:  DEFER | SET <feed address once pinned>
D-10: DEFER | SET <feed address once pinned>
D-11: APPROVE mapping statement | DEFER                  (counsel if legal)
D-12: APPROVE | CHOOSE <option>
D-13: DEFER | SET <feed + grace once pinned>
D-14: RATIFY | CHANGE
D-15: RATIFY | CHANGE
D-16: DEFER | SET <bps>
D-17: SET <per-acq cap> | DEFER
D-18: SET <daily cap> | DEFER
D-19: APPROVE (fail-closed) | CHOOSE <option>
D-20: APPROVE reject-absent/expired | SET <max-lifetime> | DEFER
D-21: DEFER (await Rialto)
D-22: A | B | C
D-23: COUNSEL-APPROVED | COUNSEL-PENDING
D-24: CONDITIONS-ACKNOWLEDGED (no acquisition authorized)
ACCESS REQUEST: SEND | HOLD
```

## 5. Restricted-access request (DRAFT — NOT SENT)

> Subject: BPS integrator — restricted quote-read API key request (chain 4663)
>
> We request a dedicated BPS server-side API key restricted to `quote:read` for chain 4663, with no
> `swap:create`, gasless-relay or integrator-fee capability. Please confirm: (1) exact key scopes;
> (2) expiry + revocation process; (3) quote rate limits; (4) **whether quote retrieval creates any
> obligation, reservation or server-side commitment**; (5) the exact allowance-mode settlement
> selector + a verified ABI source for the feature-2 router; (6) allowance-mode quote replay/nonce
> semantics; (7) whether smart-contract takers are supported in allowance mode; (8) whether a
> non-funded adapter address may request quotes for structural validation; (9) whether a
> sandbox/test credential exists.

**DRAFT — NOT SENT.** No key requested, created, rotated or revoked.
