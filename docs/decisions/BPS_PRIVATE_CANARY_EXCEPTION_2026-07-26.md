# BPS Governance Amendment — One-Time Private Canary Exception (PCE-1) — 2026-07-26

**Status: FOUNDER-AUTHORIZED (documentation only). NOT EXECUTED.** This amendment records a founder decision.
It does **not** deploy, fund, broadcast, create a Safe transaction, or perform the canary — those remain
separate, human-performed steps under the technical packet
([`PRIVATE_CANARY_DEPLOY_PACKET_2026-07-26.md`](../../packages/contracts/deploy/PRIVATE_CANARY_DEPLOY_PACKET_2026-07-26.md)).
Claude prepared this record at the founder's explicit instruction; Claude performed no on-chain action.

## 1. What the founder authorized

A **single, bounded, private guarded-settlement canary** on Robinhood Chain (chainId 4663):

- **Total exposure cap: USD 130, all-inclusive** (acquisition notional + gas + slippage/price buffer).
  Nothing in this exercise may cause total exposure to exceed this cap.
- **No public users** — private operation only; not offered to or usable by any third party.
- **No production reuse** — the deployed executor instance from this canary must **never** be reused,
  presented, or relied upon as canonical BPS production; production requires a fresh, separately authorized,
  fully-gated deployment.
- **One acquisition cycle only** — exactly one `executeSettlement` (one WETH→NVDA acquisition, one nonce).
- **Mandatory pause + recovery afterward** — immediately after the single cycle, the controller **pauses**
  the executor and **recovers** any residual WETH/NVDA to the controller Safe.

## 2. What this amendment explicitly does NOT do

- It does **NOT** satisfy, close, waive, or downgrade **B-1** (independent smart-contract security audit) —
  which **remains OPEN / INCOMPLETE**.
- It does **NOT** satisfy, close, waive, or downgrade **B-2 / D-23** (legal eligibility / counsel approval) —
  which **remains INCOMPLETE / COUNSEL-PENDING**.
- It does **NOT** replace, expire, weaken, or reinterpret **D-24** for production. **D-24 remains fully in
  force** for any acquisition beyond this one bounded private canary.
- It does **NOT** authorize a second cycle, a larger cap, public use, production deployment, or reuse.
- It records **no** auditor or counsel name, signature, date, opinion, or approval (none exist).

## 3. Explicit accepted risk (founder acknowledgement)

The founder has elected to proceed with this **one-time, $130-capped, private** canary **before** an
independent security audit (B-1) and **before** counsel legal-eligibility sign-off (B-2/D-23). The
corresponding **security risk** (an un-audited executor handling real, if tiny, funds) and **legal risk**
(acquiring/holding a tokenized-equity Stock Token without a completed eligibility opinion) are therefore
**knowingly accepted by the founder** and bounded by the $130 cap, the private/no-public-users constraint,
the single cycle, and the mandatory post-cycle pause + recovery. B-1 and B-2/D-23 remain recorded as
**incomplete, not satisfied**, and must be completed before any non-canary / production acquisition.

## 4. Relationship to the decision pack (authoritative D-1..D-24)

PCE-1 is a **narrow carve-out from D-24** applying **only** to this one bounded private canary. Within that
carve-out the founder accepts the following decision-pack items as canary-scoped (candidate values, private
canary only — NOT production policy):

| Item                                  | Canary-scoped disposition (PCE-1 only)                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-3 (server-env key scope)            | Unchanged: no execution-capable key in the BPS server env; the operator uses an interactive/hardware signer for Safe txs.                                             |
| D-5 settlement mode                   | allowance (matches the frozen executor).                                                                                                                              |
| D-6 taker/recipient                   | the executor itself (taker + recipient).                                                                                                                              |
| D-8 slippage_bps                      | ≤ 100 bps (executor `MAX_SLIPPAGE_BPS`); operator sets the quote value within this bound.                                                                             |
| D-16 price deviation                  | 100 bps oracle floor (executor `MAX_PRICE_DEVIATION_BPS`).                                                                                                            |
| D-17 per-acquisition cap              | canary cap ≤ 0.001 WETH (reviewed `GuardedSettlementConfig` value) and ≤ the $130 umbrella.                                                                           |
| D-20 max intent lifetime              | ≤ 300 s (executor `MAX_DEADLINE_HORIZON_SEC`); reject absent/expired deadline.                                                                                        |
| D-9 / D-10 feeds                      | the live-verified ETH/USD `0x78F3…d3A9` + NVDA/USD `0x379E…9F15` (TASK 10K-7).                                                                                        |
| D-21 Rialto replay/SC-taker semantics | still unconfirmed by the venue; the executor's own envelope (registry lock, code-hash pin, own-balance delta, single-use digest/nonce) is relied upon for the canary. |
| D-22 trust model                      | Option B (on-chain guarded executor) — implemented; **not** independently reviewed (see accepted risk).                                                               |
| B-1 audit / B-2 / D-23 counsel        | **NOT satisfied** — see §2/§3.                                                                                                                                        |

## 5. Hard preconditions before the human operator may perform the canary

All must hold at execution time (enforced on-chain and/or operationally):

1. A **new, bounded, founder authorization to EXECUTE** (this amendment authorizes preparation; a separate
   go-signal is required to broadcast — no auto-broadcast exists in the repo).
2. Both Chainlink feeds **fresh** (< 900 s) — i.e., an **open NVDA trading session** (the NVDA feed is
   us_equities_24/5 and is stale on weekends/off-hours; the guard reverts on staleness).
3. A **live Rialto allowance-mode quote** obtained by the operator at execution (the executor validates it
   via its envelope; Claude fetches nothing).
4. The controller **2-of-3 Safe** `0x62Ae5b22Dd28Ee338E5A447ed849f9C7008A5E62` operational; owners able to
   sign via interactive/hardware wallets.
5. Total exposure (WETH funded + gas) **≤ $130**.

## 6. Governance record

- **Decision id:** PCE-1 (one-time private canary exception; a bounded carve-out from D-24).
- **Approver:** Founder (recorded via chat authorization 2026-07-26). Counsel input **not** obtained (B-2/D-23
  incomplete) — legal risk accepted by the founder.
- **Scope:** exactly one WETH→NVDA acquisition cycle, ≤ $130 all-inclusive, private, no production reuse,
  mandatory pause + recovery after.
- **Consumption:** PCE-1 is **single-use**; it is consumed by the one authorized cycle and does not carry over.
- **Standing gates after PCE-1:** B-1 OPEN, B-2/D-23 INCOMPLETE, D-24 in force for production.

Technical parameters and the exact non-broadcast operator procedure are in
[`PRIVATE_CANARY_DEPLOY_PACKET_2026-07-26.md`](../../packages/contracts/deploy/PRIVATE_CANARY_DEPLOY_PACKET_2026-07-26.md);
machine-readable record in
[`BPS_PRIVATE_CANARY_EXCEPTION_2026-07-26.evidence.json`](../audit/BPS_PRIVATE_CANARY_EXCEPTION_2026-07-26.evidence.json).
