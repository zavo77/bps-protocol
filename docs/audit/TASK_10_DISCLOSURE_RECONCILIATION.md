# TASK 10 — BPS Disclosure Reconciliation (BPS-ECON-2.0)

**Date:** 2026-07-23. **Repository:** `C:\Projects\bps-experiment` (branch `master`).
**Scope:** documentation-to-contract reconciliation of protocol-economics disclosure copy only.

> This is an internal documentation reconciliation. It is **not** legal advice and **not** an independent
> audit. `BPS_LEGAL_MVP_PACK.md` remains a working draft for external counsel review. No jurisdiction,
> KYC/AML, eligibility, valuation, or legal decision was made or finalized here.

---

## 1. Summary

Older BPS disclosure documents described an obsolete economic policy (`BPS-ECON-1.0`): a flat **2%**
official-route protocol fee split **1.50% Frontier Distribution Vault / 0.50% Protocol Stewardship
Treasury**, summarized as a single **"2.98%" all-in** figure. The frozen `BPSTradeRouter` contract implements
`BPS-ECON-2.0`: a **3% buy / 4% sell** protocol allocation with an explicit BPS repurchase-and-burn and an
**80/20** acquired-stock split. The obsolete copy was reconciled **to the contract** (documentation → code).
**No protocol behavior, contract, ABI, interface, contract test, `packages/shared/src`, Task 7 file, or
economics value was changed.**

The in-repo application surfaces (`apps/web/lib/economics.ts`, `README.md`, `HANDOVER.md`) were already on
`BPS-ECON-2.0`; the only application copy correction was a one-phrase wording fix (below).

---

## 2. Exact frozen-contract evidence (reconciliation anchor)

From `packages/contracts/src/BPSTradeRouter.sol` (frozen; byte-unchanged since checkpoint `90e338a`):

```solidity
// --- Frozen BPS-ECON-2.0 allocation (basis points, denominator 10_000) ---
uint256 public constant BPS_DENOMINATOR = 10_000;
uint256 public constant BUY_STOCK_BPS  = 200; // 2% WETH stock-acquisition budget
uint256 public constant BUY_BURN_BPS   = 100; // 1% WETH BPS repurchase-and-burn
uint256 public constant SELL_STOCK_BPS = 200; // 2% WETH stock-acquisition budget
uint256 public constant SELL_BURN_BPS  = 200; // 2% WETH BPS repurchase-and-burn
```

- **Buy** = 200 + 100 = **300 BPS (3%)**; the remaining **97%** of gross WETH input is routed into the swap.
- **Sell** = 200 + 200 = **400 BPS (4%)**, taken from realized WETH proceeds; the remaining **96%** is
  transferred to the seller.
- The burn is a **true `totalSupply` reduction** (contract NatSpec lines 15–19): the router repurchases BPS
  with the WETH burn allocation through the immutable adapter and burns the BPS via the token's self-burn.
- Acquired-stock split **80% distribution / 20% strategic reserve** is enforced by the frozen
  `StockAcquisitionVault`; mirrored read-only in `apps/web/lib/economics.ts` (`DISTRIBUTION_PERCENT = 80`).

Corroboration in-repo: `HANDOVER.md` already forbids the obsolete terms ("Protocol Stewardship Treasury",
"2.98% all-in", "150/50 BPS", "BPS-ECON-1.0") and the shared engine rejects `BPS-ECON-1.0` in
`validate.test.ts`.

---

## 3. Canonical economic terminology (to be used consistently)

| Term                                                 | Canonical statement                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Buy protocol allocation                              | **3% total** — 2% Stock Token acquisition funding + 1% BPS repurchase-and-burn; 97% of gross WETH routed to the swap                           |
| Sell protocol allocation                             | **4% total** — 2% Stock Token acquisition funding + 2% BPS repurchase-and-burn from realized WETH proceeds; 96% of realized WETH to the seller |
| Acquired Stock Token split                           | 80% distribution allocation / 20% strategic reserve                                                                                            |
| Uniswap pool fee                                     | ~1% (fee value `10000`) — **separate** from the protocol allocation; not summed into one figure                                                |
| Accrued acquisition budget vs. completed acquisition | Budget accrues from official-route allocations; an acquisition occurs only when a cycle is executed and recorded on-chain                      |
| Market price / FDV vs. asset backing                 | A market price or fully-diluted valuation is not, and does not guarantee, asset backing                                                        |
| Non-guarantees                                       | No guaranteed return, yield, dividend, ownership, redemption, liquidity, or value; eligibility may expire/revoke                               |
| Economic version                                     | `BPS-ECON-2.0` (never `BPS-ECON-1.0`)                                                                                                          |

---

## 4. Approved discrepancy matrix (as applied)

### `docs/BPS_LAUNCH_DECISIONS.md` (new canonical copy; source: external `BPS-ECON-1.0` copies)

| #   | Section                           | Obsolete language (BPS-ECON-1.0)                                                                                                              | Reconciled language (BPS-ECON-2.0)                                                                        | Class                            |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------- |
| L1  | §5 defaults table                 | `Official-router protocol fee 2.00% / 200 BPS`; `Frontier Distribution Vault 1.50% / 150 BPS`; `Protocol Stewardship Treasury 0.50% / 50 BPS` | Buy 3% (2% stock + 1% repurchase-and-burn); Sell 4% (2% + 2%); vault/treasury split rows removed          | Technical reconciliation         |
| L2  | §5 fee load                       | `Approximate official-route fee load 2.98% before slippage and gas`                                                                           | Cost-distinction note: protocol allocation (3%/4%) separate from ~1% pool fee, gas, slippage — not summed | Technical reconciliation         |
| L3  | §5 worked example                 | `retains 0.02G and routes 0.98G … 2% + (1% × 98%) = 2.98%`                                                                                    | Approved buy wording (97% routed) + approved sell execution-order bullets                                 | Technical reconciliation         |
| L4  | §1                                | `charges a 200 BPS protocol fee`                                                                                                              | `applies a 3% (buy) / 4% (sell) protocol allocation`                                                      | Technical reconciliation         |
| L5  | §5 header / metadata              | `BPS-ECON-1.0`                                                                                                                                | `BPS-ECON-2.0`                                                                                            | Technical reconciliation         |
| L6  | §5 defaults                       | (no 80/20 row)                                                                                                                                | Added `Acquired Stock Token split 80% distribution / 20% strategic reserve`                               | Technical reconciliation         |
| L7  | §3 / §5 pool tier                 | Pool tier stated without distinction                                                                                                          | Labeled "separate from the BPS protocol allocation"                                                       | Technical reconciliation         |
| L8  | §4 acquisition rules              | `Frontier Distribution Vault` (residual)                                                                                                      | `distribution vault` (generic; removes superseded proper noun)                                            | Technical reconciliation         |
| L9  | §4 Frontier 10 basket + addresses | Presented as verified basket                                                                                                                  | Kept verbatim but flagged **proposal pending final approval + registry verification**; not finalized      | Unresolved founder/counsel input |

### `docs/BPS_LEGAL_MVP_PACK.md` (new canonical copy)

| #   | Section                                                                                                                          | Obsolete language                                                                                                                    | Reconciled language                                                                                                                                                       | Class                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| M1  | §4 Official trade route and fees                                                                                                 | `charges a 2.00% protocol fee … Under BPS-ECON-1.0, 1.50% to Frontier Distribution Vault and 0.50% to Protocol Stewardship Treasury` | Buy 3% / Sell 4% allocation split (2% stock + 1%/2% repurchase-and-burn); 80/20 split; accrued-budget-vs-acquisition and price-vs-backing distinctions; pool fee separate | Technical reconciliation             |
| M2  | §4 version                                                                                                                       | `BPS-ECON-1.0`                                                                                                                       | `BPS-ECON-2.0`                                                                                                                                                            | Technical reconciliation             |
| M3  | §3 BPS token                                                                                                                     | (no price/backing distinction)                                                                                                       | Added: market price / FDV is not asset backing                                                                                                                            | Technical reconciliation             |
| M4  | Legal versions (`BPS-TERMS/RISK/PRIVACY/RESTRICTED-1.0`), `[LIABILITY CAP]`, jurisdictions, KYC, entity, governing law, contacts | Bracketed/placeholder                                                                                                                | **Unchanged** — preserved, bracketed, fail-closed; not invented or finalized                                                                                              | Unresolved counsel input (no change) |
| M5  | Risk / declaration copy                                                                                                          | Already conservative                                                                                                                 | Preserved (no guaranteed yield/dividend/ownership; admin-key risk; "not fully decentralized")                                                                             | No change                            |

### In-repo application copy

| #   | File                                                      | Before                 | After                                                                                      | Class                    |
| --- | --------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| R1  | `apps/web/lib/economics.ts` (`ECON_DISCLOSURE.sell.burn`) | `"2% direct BPS burn"` | `"2% BPS repurchase-and-burn"` (sell uses the same WETH-funded repurchase-and-burn as buy) | Technical reconciliation |
| R1t | `apps/web/lib/economics.test.ts`                          | —                      | Added one assertion locking the corrected disclosure wording (no "direct" burn)            | Directly affected test   |
| R2  | `README.md`, `HANDOVER.md`                                | Already BPS-ECON-2.0   | **No change** (already accurate; HANDOVER already forbids obsolete terms)                  | —                        |

---

## 5. Confirmations

- **Reconciliation direction:** documentation → contract. Every corrected figure matches the frozen
  `BPSTradeRouter` constants in §2.
- **No protocol behavior changed.** No contract, ABI, interface, contract test, `packages/shared/src`, or
  Task 7 deployment file was modified. No fee, routing, or transaction behavior changed. No new economics
  version was invented — the canonical model is and remains `BPS-ECON-2.0`.
- **No document conflicts with actual frozen behavior.** The only divergences were stale docs on the
  superseded `BPS-ECON-1.0`; none required a code change.
- **No external copy modified.** The external copies under `bps-protocol/docs/`, `bps-protocol/`,
  `bps-input/`, `bps-inputs/` were used **read-only** as source material.

## 6. New canonical document paths

- `docs/BPS_LAUNCH_DECISIONS.md` — authoritative Launch Decisions (BPS-ECON-2.0).
- `docs/BPS_LEGAL_MVP_PACK.md` — authoritative Legal & Eligibility Pack (working draft for counsel review).
- `docs/audit/TASK_10_DISCLOSURE_RECONCILIATION.md` — this record.
- `docs/audit/TASK_10_FOUNDER_DECISION_PACK.md` — unresolved fail-closed decisions.

## 7. Superseded external copies (read-only source; non-authoritative)

Byte-identical `BPS-ECON-1.0` copies (SHA/`md5` identical per file) — **not** modified:

- `C:\Projects\bps-protocol\docs\BPS_LAUNCH_DECISIONS.md`, `…\BPS_LEGAL_MVP_PACK.md`
- `C:\Projects\bps-protocol\BPS_LAUNCH_DECISIONS.md`, `…\BPS_LEGAL_MVP_PACK.md`
- `C:\Projects\bps-input\BPS_LAUNCH_DECISIONS.md`, `…\BPS_LEGAL_MVP_PACK.md`
- `C:\Projects\bps-inputs\BPS_LAUNCH_DECISIONS.md`, `…\BPS_LEGAL_MVP_PACK.md`

The `bps-experiment/docs/` copies are authoritative for the current implementation; the above are superseded.
