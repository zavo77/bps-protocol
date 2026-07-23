# TASK 10 — BPS Founder Decision Pack (unresolved, fail-closed)

**Date:** 2026-07-23. **Status:** OPEN — none of the items below are decided in this repository.

> Every item here is an unresolved founder/counsel input. The implementation is **fail-closed** with respect
> to all of them: nothing proceeds to a real-money action until the relevant item is explicitly resolved and
> verified. This document records decisions to be made; it does **not** make, invent, or finalize any of
> them. It is not legal advice.

---

## How to read this pack

- **State:** always `UNRESOLVED` in-repo.
- **Fail-closed behavior:** what the code/docs do while the item is open (so an unresolved item cannot cause
  a real-money or eligibility action).
- **Resolution owner:** who must decide (founder and/or external counsel / integration partner).

Placeholders in the canonical docs remain bracketed (e.g. `[GOVERNING LAW]`) or version-tagged (e.g.
`BPS-RESTRICTED-1.0`) and must not be filled by implementation work.

---

## 1. Legal / jurisdiction / eligibility (external counsel)

| #   | Decision                                                                                                   | State      | Fail-closed behavior                                                                                                                         | Owner             |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | Approved and prohibited jurisdictions (final list)                                                         | UNRESOLVED | App keeps `BPS-RESTRICTED-1.0` draft list; restricted functions blocked; declaration required; signing alone never grants eligibility        | Founder + counsel |
| 2   | KYC/AML and wallet-eligibility policy                                                                      | UNRESOLVED | Eligibility is a separate gate from terms-signing; no wallet is marked eligible without the configured service (absent in-repo → ineligible) | Founder + counsel |
| 3   | Operator legal entity (`[OPERATOR LEGAL NAME]`, `[ENTITY TYPE AND JURISDICTION]`)                          | UNRESOLVED | Bracketed placeholders retained in `BPS_LEGAL_MVP_PACK.md`                                                                                   | Founder + counsel |
| 4   | Governing law & dispute forum (`[GOVERNING LAW]`, `[COURTS OR ARBITRATION FORUM]`)                         | UNRESOLVED | Bracketed placeholders retained                                                                                                              | Counsel           |
| 5   | Registered address & legal/privacy contacts (`[REGISTERED ADDRESS]`, `[CONTACT EMAIL]`, `[PRIVACY EMAIL]`) | UNRESOLVED | Bracketed placeholders retained                                                                                                              | Founder           |
| 6   | Liability cap (`[LIABILITY CAP]`)                                                                          | UNRESOLVED | Bracketed placeholder retained                                                                                                               | Counsel           |
| 7   | Minimum age / data hosting regions & processors (`[MINIMUM AGE]`, `[DATA HOSTING REGIONS AND PROCESSORS]`) | UNRESOLVED | Bracketed placeholders retained                                                                                                              | Founder + counsel |

The canonical legal pack **remains a working draft for external counsel review**; nothing in it is legally
approved.

## 2. Integrations & registries (partner / source-backed)

| #   | Decision                                                    | State      | Fail-closed behavior                                                                                                                                                                                  | Owner                  |
| --- | ----------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 8   | Final Rialto terms and eligibility restrictions             | UNRESOLVED | Rialto quote client is server-only; makes no live request in-repo; production terms/rehearsal required before any real quote                                                                          | Founder + Rialto       |
| 9   | Final Stock Token basket and verified token/feed registry   | UNRESOLVED | Frontier 10 basket in `BPS_LAUNCH_DECISIONS.md` is a **proposal**; addresses must be re-verified against the live canonical registry immediately before any acquisition; no address is finalized here | Founder + issuer/venue |
| 10  | Source-backed oracle / sequencer / multiplier configuration | UNRESOLVED | Oracle layer is read-only and fail-closed; no production feed addresses invented                                                                                                                      | Founder + source       |

## 3. Operational / custody & launch economics (founder)

| #   | Decision                                                                        | State      | Fail-closed behavior                                                                                              | Owner   |
| --- | ------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- | ------- |
| 11  | Operational wallet addresses and Safe thresholds (deployer, roles, Safe m-of-n) | UNRESOLVED | Deployment config validation reverts on placeholder/zero roles; no real addresses invented                        | Founder |
| 12  | Final BPS valuation, circulating float, and liquidity authorization             | UNRESOLVED | No liquidity/pool/seed action taken; the earlier $1M FDV / 1.25% float figure is **not accepted**                 | Founder |
| 13  | Explicit founder authorization to proceed to a real-money action                | UNRESOLVED | No deployment, broadcast, signature, transaction, liquidity action, or protected Rialto request occurs without it | Founder |

## 4. Independent review (external)

| #   | Decision                                              | State      | Fail-closed behavior                                                                                                 | Owner            |
| --- | ----------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 14  | Independent smart-contract security audit             | UNRESOLVED | Frozen contracts pass the in-repo suite, but that is not a substitute for an external audit                          | External auditor |
| 15  | Production RPC, fallback RPC, monitoring and alerting | UNRESOLVED | App uses the injected/production connector and fails closed with no mock fallback; no production RPC write performed | Founder          |

---

## Standing constraints (unchanged by this task)

- No frozen contract / ABI / interface / contract-test changes; no `packages/shared/src`; no Task 7
  deployment changes; no economic or transaction-behavior changes.
- Canonical economics is `BPS-ECON-2.0` (3% buy / 4% sell; 2% stock + 1%/2% BPS repurchase-and-burn; 80/20
  acquired-stock split). See `docs/audit/TASK_10_DISCLOSURE_RECONCILIATION.md`.
- BPS is **not** described as fully decentralized while privileged roles and controls remain (Safe-controlled
  pause, trusted acquisition operator, governed root publisher, permissioned Rialto quote service).
- No production deployment, wallet action, signature, transaction, Rialto request, or RPC write; no external
  launchpad/TICK work.
