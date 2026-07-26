# BPS Founder Decision Register (D-1 to D-24) — 2026-07-25 (TASK 10J-3)

Normalized record of the founder's returned selections against the approval ballot
`docs/decisions/BPS_RIALTO_FOUNDER_APPROVAL_BALLOT_2026-07-25.md`
(SHA-256 `db61b58f6e298c1c73c7cc077d7905429f1a061ff377d5e5eaa94eadd606f0ca`).

**Recording founder selections does not configure any credential, feed, aggregator, selector,
contract or risk value, and does not authorize any acquisition, funding, allowance, quote,
simulation, deployment or production activation.** Founder, security/engineering, Rialto and counsel
gates are tracked separately and are **not** collapsed into a single "approval" status. No item is
characterized as security- or counsel-approved unless that approver has separately signed off (none
has). B-3 remains `PARTIAL — RIALTO QUOTE ACCESS REQUIRED`.

## A. Already founder-approved or ratified — no new founder policy selection presently required

| ID           | Subject                                                                | Selected direction                                                                                                                                                                                                                        | Founder status                                    | Remaining gate / approver                                                                     | Impl/config status                      | Next authorized action                                                                                   | Prohibition                                                                   |
| ------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| D-1          | Rialto integrator owner wallet/profile                                 | Dedicated operations wallet, distinct from deployer and tester                                                                                                                                                                            | FOUNDER-APPROVED                                  | none (founder-sufficient)                                                                     | not configured                          | record the ops wallet identity when onboarding is later authorized                                       | do not reuse deployer/tester                                                  |
| D-2          | Request a `quote:read`-only key                                        | Request a key restricted to `quote:read` only                                                                                                                                                                                             | FOUNDER-APPROVED (read-only preference preserved) | none (founder-sufficient); currently UNAVAILABLE via Rialto dashboard                         | not requested                           | prefer a read-only key if Rialto offers one; interim GET /quote testing runs under QEX-1 (see amendment) | no key requested/created by Claude                                            |
| D-4          | Key storage/rotation/revocation owner                                  | Secret manager: founder-controlled recovery, least-privilege runtime, documented rotation/revocation                                                                                                                                      | FOUNDER-APPROVED                                  | none (founder-sufficient)                                                                     | not configured                          | stand up the secret store before any key exists                                                          | never store the raw key in source control, files, logs, or client config      |
| D-7          | Technical quote-validation amount                                      | Minimum venue-accepted amount; validation address remains unfunded                                                                                                                                                                        | FOUNDER-APPROVED                                  | none (founder-sufficient)                                                                     | not configured                          | used only when a real quote is later authorized                                                          | validation address stays unfunded; no acquisition                             |
| D-11         | WETH → ETH/USD feed mapping rule                                       | Conditional mapping: ETH/USD may price WETH only when the input is the verified canonical 1:1 WETH on Robinhood Chain with policy-pinned identity; any other wrapped/bridged/synthetic ETH fails closed; price-risk mapping only          | FOUNDER-APPROVED (conditional direction)          | security/engineering validation; counsel only if a legal characterization arises              | not configured                          | security/engineering verify WETH wrapping/redemption + ETH/USD suitability                               | does not resolve legal eligibility                                            |
| D-14         | Oracle-pause behavior                                                  | Halt whenever `oraclePaused()` is true                                                                                                                                                                                                    | FOUNDER-RATIFIED                                  | security/engineering formal sign-off (via D-22B review / B-1)                                 | implemented in `price-guard.ts`, tested | ratify under the D-22B review                                                                            | —                                                                             |
| D-15         | Pending-multiplier behavior                                            | Halt whenever a multiplier transition is staged/pending/inconsistent/unresolved                                                                                                                                                           | FOUNDER-RATIFIED                                  | security/engineering formal sign-off (via D-22B review / B-1)                                 | implemented in `price-guard.ts`, tested | ratify under the D-22B review                                                                            | —                                                                             |
| D-17         | Per-acquisition cap                                                    | USD 250 equivalent maximum for the first controlled proof cycle                                                                                                                                                                           | FOUNDER-APPROVED (value set)                      | —                                                                                             | not configured                          | encode as an operational ceiling when acquisitions are later authorized                                  | a maximum, not a target; does not authorize an acquisition                    |
| D-18         | Daily acquisition cap                                                  | USD 250 equivalent per UTC day; at most one maximum-sized acquisition per day                                                                                                                                                             | FOUNDER-APPROVED (value set)                      | —                                                                                             | not configured                          | encode as an operational ceiling when acquisitions are later authorized                                  | does not authorize an acquisition                                             |
| D-22 / D-22B | Price-guard trust model / executor authority (architectural direction) | Option B: require coordinator-level on-chain oracle-floor enforcement or a narrowly guarded executor before any mainnet acquisition; accept redeployment/migration; keep acquisitions disabled until implemented + independently reviewed | FOUNDER-SELECTED (architectural direction only)   | security/engineering implementation + independent review; counsel input on operator authority | not implemented                         | scope the on-chain oracle-floor / guarded-executor design under a separate authorized task               | **direction only — implementation is NOT authorized by this register**        |
| —            | Restricted Rialto access request                                       | `SEND MANUALLY`                                                                                                                                                                                                                           | FOUNDER-AUTHORIZED (to send manually)             | manual transmission by the founder                                                            | request drafted, NOT sent by Claude     | founder sends the drafted request and returns Rialto's response for review                               | Claude must not send it; this is a founder action, not an unresolved decision |

## B. Conditionally selected / requiring evidence, another approver, or later finalization

| ID    | Subject                                                          | Selected direction                                                                                        | Status                                      | Remaining gate / approver                                                         | Supporting evidence                     | Prohibition                                                      |
| ----- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| D-3   | Broader-scope (execution-capable) key ever in the BPS server env | Founder policy: never, outside a separately reviewed future settlement runbook                            | FOUNDER-APPROVED as policy; COUNSEL-PENDING | counsel                                                                           | ballot                                  | not counsel-approved                                             |
| D-5   | Settlement mode                                                  | Allowance (matches the frozen adapter)                                                                    | APPROVE-PROPOSAL                            | validate against an authentic current allowance-mode quote; security/engineering  | ballot; frozen adapter                  | keep fail-closed until validated                                 |
| D-6   | Quote taker/recipient                                            | Canary adapter for structural validation only                                                             | APPROVE-PROPOSAL                            | Rialto written confirmation of smart-contract-taker support; security/engineering | ballot                                  | keep fail-closed until confirmed                                 |
| D-8   | Quote-request `slippage_bps`                                     | DEFER — keep fail-closed; calibrate jointly with D-16 using an authorized quote                           | DEFERRED                                    | authorized quote + approved price-risk analysis                                   | ballot                                  | do not infer from documentation examples                         |
| D-9   | Chainlink INPUT feed (ETH/USD candidate for WETH)                | `OFFICIALLY IDENTIFIED CANDIDATE — NOT APPROVED / NOT CONFIGURED`                                         | candidate identified                        | security/engineering (D-11 validation, freshness)                                 | `BPS_RIALTO_FEED_METADATA_2026-07-25.*` | not configured; ETH/USD is not a direct WETH/USD feed            |
| D-10  | Chainlink NVDA feed + canonical token                            | `OFFICIALLY IDENTIFIED CANDIDATE — NOT APPROVED / NOT CONFIGURED`; token binding reproducibly established | candidate identified                        | security/engineering (wiring + freshness)                                         | `BPS_RIALTO_FEED_METADATA_2026-07-25.*` | not configured                                                   |
| D-12  | Feed heartbeat / maximum-staleness                               | Strict-freshness approach founder-directed; numeric value deferred                                        | FOUNDER-DIRECTED (approach); value DEFERRED | security/engineering numeric value                                                | feed metadata evidence                  | see the exact D-12 wording below; no numeric constraint approved |
| D-13  | L2 sequencer feed + recovery grace                               | `UNRESOLVED — NO ROBINHOOD CHAIN ADDRESS IN CURRENT OFFICIAL CHAINLINK LIST`; grace period deferred       | UNRESOLVED (fail-closed)                    | authoritative Chainlink/Robinhood source + security/engineering                   | feed metadata evidence                  | do not inspect or promote an unofficial candidate                |
| D-16  | Independent-price deviation limit                                | DEFER — keep fail-closed                                                                                  | DEFERRED                                    | authentic quote + both feeds + security/engineering                               | ballot                                  | do not infer from documentation examples                         |
| D-19  | Weekend/off-hours behavior                                       | Fail-closed on staleness; session-aware deferred                                                          | FOUNDER-DIRECTED                            | security/engineering implementation                                               | ballot; feed metadata evidence          | no market calendar implemented                                   |
| D-20  | Quote deadline / maximum lifetime                                | Reject absent/expired deadlines (approved); maximum lifetime deferred                                     | PARTIAL: reject approved; lifetime DEFERRED | security/engineering; Rialto + authentic quote                                    | ballot                                  | —                                                                |
| D-21  | Allowance-mode replay / execution-ID / obligation-on-retrieval   | DEFER — keep fail-closed                                                                                  | DEFERRED                                    | written Rialto confirmation                                                       | ballot                                  | do not answer on Rialto's behalf                                 |
| D-22B | On-chain oracle-floor / guarded-executor implementation + review | (architectural direction in Group A)                                                                      | implementation OUTSTANDING                  | security/engineering implementation + independent review                          | ballot                                  | implementation NOT authorized here                               |
| D-23  | Legal eligibility of Stock-Token acquisition + distribution      | COUNSEL-PENDING                                                                                           | COUNSEL-PENDING (nothing legally approved)  | qualified counsel                                                                 | ballot                                  | gates D-24                                                       |

## C. Final go/no-go — D-24

| ID   | Subject                                   | Status                                                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ----------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-24 | Conditions before ANY mainnet acquisition | CONDITIONS-ACKNOWLEDGED; **no acquisition authorized** | A new, bounded founder execution authorization is required **only after** every technical, security, venue, selector, replay, oracle, governance and legal prerequisite passes. This later bounded authorization is distinct from re-approving the already-settled policy decisions D-1, D-2, D-4, D-7, D-17 or D-18. **No acquisition, funding, allowance, quote, simulation, deployment or activation is currently authorized.** |

## Exact D-12 wording

D-12's strict-freshness approach is founder-directed, but the exact maximum-staleness value remains
deferred. The 86400-second catalog heartbeat is evidence for later analysis, not an approved ceiling,
production setting or closed-session freshness guarantee.

## QEX-1 — Isolated Rialto Quote-Evaluation Exception (2026-07-25)

Ballot **D-2** (a `quote:read`-only key) remains the founder's preferred policy. Rialto's dashboard
currently makes it **unavailable**: every issued key bundles `quote:read`, `swap:create` and
`swap:integrator`. **QEX-1 is a separate, bounded exception — it does not erase or supersede D-2.** It
permits use of a mandatory bundled key **solely** in an isolated, non-executing quote-evaluation
environment, recorded verbatim:

> D-2 is superseded by the confirmed venue constraint. A mandatory bundled Rialto key may be used solely
> in an isolated, non-executing quote-evaluation environment with no signing key, funded wallet,
> allowance, Permit2 signature or swap-submission route. This exception authorizes GET /quote testing
> only. It does not authorize acquisition or execution under D-24.

(The founder's verbatim wording says "superseded"; it is recorded here as a **bounded exception**, not
an erasure of D-2's read-only preference.) Scope notes: (a) authorizes **GET /quote testing only** — no
acquisition, funding, allowance, Permit2 signature, or swap submission, and **D-24 stands**; (b) the
bundled key carries execution-capable scopes (`swap:create`, `swap:integrator`) broader than D-2
requested — **D-3 remains COUNSEL-PENDING** for production possession/use, and the key must stay
strictly isolated from any signing key or on-chain allowance; (c) **D-5, D-6, D-8, D-21, D-22B, D-23
and D-24 remain open** — QEX-1 closes none of them; (d) the observed router (`tx.to`) and selector are
**candidates only** — not approved, pinned, or production-configured — and must be reconciled against
Rialto's official Robinhood Chain Router Registry `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E`
(feature 2 = taker-submitted route; feature 3 = gasless route); (e) the key value pasted into the
working chat is treated as **exposed/compromised** and should be revoked and reissued; (f) `GET /quote`
transmits `sell_amount` as a **human-decimal** amount (not raw base units); (g) implemented by the
isolated, non-executing harness `packages/rialto/src/quote-eval-cli.ts`. Recorded in HANDOVER §M as
**QEX-1**.

### QEX-1 consumption (2026-07-25, TASK 10K-2)

QEX-1 is **CONSUMED / COMPLETE**: exactly one authenticated `GET /quote` succeeded on 2026-07-25. **No
retry or additional quote is authorized.** The sanitized evidence is recorded in
[`BPS_RIALTO_QEX1_QUOTE_EVIDENCE_2026-07-25.evidence.json`](./BPS_RIALTO_QEX1_QUOTE_EVIDENCE_2026-07-25.evidence.json)
(and its `.md`), and the live CLI is retired (fails `QEX1_CONSUMED` before any env read or network call).
Derived offline replay against the SEPARATE, undated registry observation: the target matched the
reported current feature-2 router and the snapshot reported `paused=false`, so router reconciliation
succeeded **for that undated snapshot only**; the selector `0x77963966` remains **evidence-only** (not
approved or pinned); overall production structural approval remains **false**. Decision states are
unchanged by this evidence: **D-2** read-only preference preserved; **D-3** counsel-pending; **D-5** open
(`allowance` was evaluation input only); **D-6** open (selector, final taker, and production pinning
unresolved — one observed quote cannot close it); **D-8** open (50 bps was a test value); **D-21**,
**D-22B** open; **D-23** counsel-pending; **D-24** stands (no acquisition/execution). Ballot **D-17**
untouched.

### Guarded settlement core (2026-07-25, TASK 10K-3)

A production-shaped but **deliberately disabled** guarded-settlement core was implemented **offline** in
`packages/rialto/src/guarded-settlement.ts` (see `docs/audit/BPS_RIALTO_GUARDED_SETTLEMENT_2026-07-25.md`).
It records **candidate** safeguards without closing any unresolved decision: **D-5** candidate
exact-allowance settlement (founder/security approval still required); **D-6** remains open (selector
unproven/unapproved, final taker unknown, dated runtime registry strategy unapproved); **D-8** candidate
50-bps default / 100-bps ceiling (production policy approval-pending); **D-21** replay + exact-allowance
mitigations offline (on-chain executor verification open); **D-22B** price-guard interface + offline
enforcement (trusted production source unresolved); **D-3** and **D-23** counsel-pending; **D-24 stands**
(no acquisition/execution). Ballot **D-17 unchanged**. The Solidity executor is deferred (forge-std absent
offline); a contract-ready interface `packages/contracts/src/interfaces/IGuardedSettlementExecutor.sol`
records the invariants. `READY_OFFLINE_ONLY` is never execution authorization.

**TASK 10K-4 update:** the Solidity `GuardedSettlementExecutor` is now implemented and locally tested
(offline Foundry, no fork/RPC; forge-std v1.9.7 pinned) — UNDEPLOYED and paused/disabled by default.
This records **candidate** safeguards only and closes no decision. **D-5** exact temporary allowance
implemented locally (approval/deployment-pending). **D-6** executor-as-taker + registry `ownerOf(2)` lock
implemented but remains open: the observed selector `0x77963966` is **NOT authoritatively proven** (no
repo-owned/vendored router ABI) and is hard-blocked on-chain, the production Safe is unknown, and a dated
runtime registry strategy is unapproved. **D-8** 0.01 WETH cap + 100-bps ceiling implemented as candidate
policy (no production authorization). **D-21** replay + exact-allowance protections implemented/tested
locally (deployment-review pending). **D-22B** price-guard enforcement implemented with mocks (trusted
production source unresolved). **D-3** and **D-23** counsel-pending; **D-24 stands**; ballot **D-17
unchanged**. Local unit tests are not a fork rehearsal, live simulation, or authorization.

### Opaque-call settlement — Rialto ABI blocker removed (2026-07-26, TASK 10K-5)

Read-only on-chain investigation (block 19674173) plus an opaque-call executor design remove the
assumption that BPS needs Rialto's private ABI/function signature. **The missing human-readable ABI is no
longer a technical blocker.** The executor (`packages/contracts/src/GuardedSettlementExecutor.sol`,
UNDEPLOYED) submits Rialto's `tx.data` **unmodified** and binds an approved router **runtime code hash**
(`0xa7041268d6f20802f420b5c71e84a991dc797f27cb474265598b89e43ef27611`) + selector, enforcing safety via the
envelope (registry lock, exact allowance, own-balance minimum-output delta, atomic revert) rather than
decoding the payload. Evidence: `docs/audit/BPS_RIALTO_ROUTER_OPAQUE_CALL_2026-07-26.*`. Governance:
`0x77963966` may be approved **only** when paired with that code hash; any router rotation or code-hash
change **automatically halts** settlement pending review. **D-6** remains open only for final production
Safe/taker approval and formal activation — not because Rialto support is unavailable. The trusted
production price-source decision (**D-22B**) remains separate. **D-5/D-8/D-21** remain candidate
(approval/deployment-pending); **D-3/D-23** counsel-pending; **D-24 stands**; ballot **D-17 unchanged**.

### Canary-ready build — Chainlink price guard + controller gate (2026-07-26, TASK 10K-6)

The guarded-settlement stack is now **build-ready and UNDEPLOYED**, status
`CANARY_BUILD_READY_EXECUTION_LOCKED`. It closes **no** decision; it makes the candidate safeguards
concrete and testable. **D-22B** — the placeholder price guard is replaced by a real Chainlink dual-feed
guard (`ChainlinkSettlementPriceGuard.sol`: ETH/USD `0x78F3…d3A9` + NVDA/USD `0x379E…9F15`, both 8dp;
≤100 bps floor; fail-closed on stale/paused/decimals/identity/round/timestamp), but the **trusted
production price source remains a separate founder/counsel decision** (the feed addresses are verified, not
yet approved as authoritative). **D-6** — the executor deploys **paused**, cannot be unpaused until fully
configured (`ConfigIncomplete`), and requires a **deployed-contract controller/Safe via a two-step
transfer**; the final Safe/taker address is still open. **D-8** — the config enforces a canary cap ≤ 0.001
WETH (validator rejects anything higher), but the production cap is unapproved. **D-5/D-21** — the executor
enforces exact allowance + own-balance min-delta + replay guard; deployment-review pending. **D-3/D-23** —
external audit + counsel still pending (now with a concrete artifact to audit). **D-24 stands and is
expired** — a **new bounded, independently reviewed founder authorization** is required before any deploy,
configure, unpause, or execute step. Ballot **D-17 unchanged**. Evidence:
`docs/audit/BPS_RIALTO_CANARY_BUILD_2026-07-26.*`; runbook
`packages/contracts/deploy/GUARDED_SETTLEMENT_RUNBOOK.md`. No Rialto request, no key, no signing, no
broadcast, no deployment were performed.

### Live oracle + Safe + preflight acceptance (2026-07-26, TASK 10K-7)

Read-only live-chain verification at pinned block 19761208 closed the acceptance gaps. **No decision was
overridden.** **D-22B is now ENGINEERING-COMPLETE:** the official Chainlink feed identities, addresses,
decimals, and on-chain descriptions match the implementation and were confirmed live — ETH/USD
`0x78F3…d3A9` "ETH / USD" 8dp, NVDA/USD `0x379E…9F15` on-chain description "RHNVDA / USD" 8dp (the directory
display name "Robinhood NVDA / USD" differs from the on-chain string; the implementation correctly pins the
on-chain string). No separate WETH/USD feed exists; ETH/USD prices canonical WETH 1:1 with no multiplier;
NVDA `uiMultiplier`=1e18 and the feed already reflects the Total Return Value (guard does not re-apply it).
Current staleness (NVDA market-closed Sunday; ETH low-volatility within its 86400s heartbeat) is **runtime
availability, not an unresolved price-source design.** **No official Chainlink L2 Sequencer Uptime Feed** is
published for Robinhood Chain (56 directory feeds, none sequencer); the strict dual-feed 900s freshness
mitigation is retained. The **supplied RPC access eliminates "no RPC configured" as a blocker.** **D-6:**
the router/selector/code-hash envelope is live-verified (`ownerOf(2)`=`0xC94135b6…`, code hash
`0xa7041268…27611`) and the **canonical Safe v1.4.1 stack is verified available on chain 4663**
(singletons/proxy-factory/fallback-handler/MultiSend/MultiSendCallOnly, live code hashes match the official
manifest) — only the final Safe owners/threshold (or another audited deployed-contract controller) and
formal activation remain. **D-5/D-8/D-21** unchanged (candidate/tested; activation-pending). The real
read-only preflight returns `CANARY_NOT_READY` (CONTROLLER_REQUIRED + NVDA_FEED_STALE_MARKET_CLOSED +
ETH_USD_FEED_STALE). **D-3/D-23** counsel/audit-pending; **D-24 stands** (a new bounded authorization is
required before any live step); ballot **D-17 unchanged**; **QEX-1 consumed.** Evidence:
`docs/audit/BPS_RIALTO_LIVE_ORACLE_2026-07-26.*`; Safe packet
`packages/contracts/deploy/SAFE_CONTROLLER_SETUP.md`. No Rialto request, no key read, no signing, no
broadcast, no deployment occurred; authenticated RPC URLs were never written to the repository.

### Canonical 2-of-3 Safe controller deployed (2026-07-26, TASK 10K-8)

The founder granted a **narrow, one-time** authorization to create exactly one canonical Safe proxy and
signed/broadcast it through Owner 1's Rabby wallet; Claude performed read-only verification only (no signing,
broadcast, funding, or key access). The deployed **Safe `0x62Ae5b22Dd28Ee338E5A447ed849f9C7008A5E62`** (Safe
v1.4.1 SafeL2, **2-of-3**; owners `0x7116…2ba2`, `0x0060…c49f`, `0xd5Bb…1759`; threshold 2; nonce 0; no
modules; no guard; balances zero) is recorded as the **verified candidate contract controller** for the
guarded-settlement executor. It is **NOT activated** — no `GuardedSettlementExecutor` is deployed, so the
Safe owns and controls nothing. Founder-supplied review statuses recorded as-is: RPC rotation complete;
security review `APPROVED FOR PAUSED DEPLOYMENT`; counsel gate approved; Safe-only deployment authorized. This
partially advances **D-6** (a real deployed-contract controller now exists) but does **not** close it —
executor deployment, configuration, and controller transfer remain. **D-3/D-23** (independent audit +
counsel) remain external gates. The **one-time Safe-creation authorization is CONSUMED**; **D-24 remains
fully effective** and continues to prohibit executor deployment, configuration, controller transfer, funding,
approvals, swaps, settlement, and canary execution — a new bounded, independently reviewed authorization is
required before any of those. Ballot **D-17 unchanged**; **QEX-1 consumed**. Evidence:
`docs/audit/BPS_SAFE_CONTROLLER_DEPLOYMENT_2026-07-26.*`. 29/29 post-deployment checks passed. No private
key, mnemonic, or authenticated RPC URL was exposed.

### Executor activation gate review + external review packet (2026-07-26, TASK 10K-9)

A documentation-only review (no mainnet/Safe action, no external contact) froze the guarded-settlement
executor candidate and produced a sanitized auditor+counsel packet
(`docs/audit/BPS_EXECUTOR_ACTIVATION_READINESS_2026-07-26.*`) with a 20-row threat/control matrix. Full
verification re-ran green (513 Foundry / 252 rialto vitest; typecheck/lint/build/format clean) and the Safe
was re-checked read-only (candidate controller, not active). **Authoritative gate status, quoted from the
Rialto Access + Price/Risk Decision Pack (every row is `PROPOSED — NOT APPROVED`; the founder approval ballot
was never returned):**

- **D-3** — "May a broader-scope key ever enter the BPS server env?" candidate "**never** — execution keys
  live only in the future authorized-settlement runbook." This is a **key-scope policy** (Counsel + Founder),
  **not** an independent audit; honored in practice (QEX-1 consumed), not formally balloted. The independent
  smart-contract **audit** gate is **B-1** (referenced by D-24), which is **OPEN** — no independent audit has
  been performed and **Claude's own review does not satisfy it**.
- **D-23** — "Legal eligibility gate ... REQUIRED before any real acquisition" (Counsel). **COUNSEL-PENDING**;
  B-2 unresolved; **no qualifying counsel approval exists** in the repository.
- **D-24** — "Conditions before ANY mainnet acquisition ... ALL preceding items + independently reviewed
  authorization" (all of D-1..D-23 approved, selector pinned, audit B-1, legal B-2, fresh authorization task).
  **FULLY IN FORCE; not satisfied.** TASK 10K-9 did not weaken, replace, expire, or reinterpret it.

No auditor/counsel names, signatures, dates, or opinions were fabricated. No decision was approved by this
task. Status `EXECUTOR_EXTERNAL_REVIEW_PACKET_READY` — executor activation remains prohibited; the Safe
remains a verified **candidate** controller.

### PCE-1 — one-time private canary exception (2026-07-26)

The founder authorized (via chat) **preparation and commit** of a governance amendment + exact technical
deployment packet for a **single, bounded, private guarded-settlement canary**: **≤ $130 all-inclusive
exposure, no public users, no production reuse, exactly one WETH→NVDA acquisition cycle, mandatory pause +
recovery afterward.** Claude prepared documentation only — **no broadcast, fund, deploy, Safe transaction, or
canary was performed.** **PCE-1 is a narrow carve-out from D-24 for this one canary only.** It **does NOT**
satisfy or close **B-1** (independent audit — remains OPEN/INCOMPLETE) or **B-2/D-23** (counsel — remains
INCOMPLETE/COUNSEL-PENDING), and **does NOT** weaken, replace, or reinterpret **D-24 for production**. The
founder explicitly **accepts the security + legal risk** of proceeding without B-1/B-2 for this bounded
private canary. Per-acquisition cap 0.001 WETH (reviewed `GuardedSettlementConfig` value; executor ceiling
0.01 WETH); execution still requires a separate founder go-signal, an open NVDA session (fresh feeds), a live
Rialto quote, and the 2-of-3 Safe. PCE-1 is single-use. Amendment:
`docs/decisions/BPS_PRIVATE_CANARY_EXCEPTION_2026-07-26.md`; packet
`packages/contracts/deploy/PRIVATE_CANARY_DEPLOY_PACKET_2026-07-26.md`; record
`docs/audit/BPS_PRIVATE_CANARY_EXCEPTION_2026-07-26.evidence.json`. No auditor/counsel names, signatures, or
opinions were fabricated. Ballot **D-17 unchanged**; **QEX-1 consumed**.

## Restricted Rialto access request (DRAFT — NOT SENT)

The exact text is preserved in the ballot §5 and the decision pack. Decision: `SEND MANUALLY`.
Claude has not sent it; manual transmission remains an outstanding founder action.
