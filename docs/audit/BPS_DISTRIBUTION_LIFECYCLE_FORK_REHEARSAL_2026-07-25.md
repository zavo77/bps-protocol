# BPS Distribution-Lifecycle Fork Rehearsal — 2026-07-25 (TASK 10F-1)

**Classification: `REHEARSAL PASS`** — meaning exactly: _the currently implemented lifecycle was
demonstrated on a pinned local fork, with the external RWA settlement boundary explicitly mocked._

**This rehearsal is NOT:** a production deployment · a real RWA/Stock-Token purchase · legal
eligibility · production readiness · deployment authorization · a conversion of BPSC-TEST into
canonical BPS. **No wallet was connected, no key was handled, nothing was signed or broadcast, and
upstream mainnet was proven unchanged** (deployer nonce 16/16 and tester nonce 8/8 before AND after;
no nonce-8 transaction; all monitored state identical).

Machine-readable evidence:
[`BPS_DISTRIBUTION_LIFECYCLE_FORK_REHEARSAL_2026-07-25.evidence.json`](./BPS_DISTRIBUTION_LIFECYCLE_FORK_REHEARSAL_2026-07-25.evidence.json)
(SHA-256 `2557a3d782bd38b2c679902578f7bc5519b7b0e5f82f9fdea85e28a77d5cb065`).

## Fork

- **Pinned block 18791290** (the canary's final step-19 block), hash
  `0x2d332bb08395b53f571015af9959d1a0e9c68baec300265b08fe77b38ef1516f` — verified against BOTH the
  accepted canary evidence manifest and a fresh upstream `eth_getBlockByNumber`; upstream chainId
  4663 verified before forking. Local chainId = 4663 (in-process fork preserves it; the deployed
  adapter's chain gate and the claim-leaf domain binding require it). Isolation control: Foundry
  **in-process** fork — no signing key, no broadcast path; a conspicuous `_assertForkLocal()`
  (active-fork + chainid) runs before every mutating stage.
- Post-canary state anchors asserted in-fork before any mutation: vault accrued WETH
  31,435,920,663,381; tester locked principal 475,546,397,072,022,702,614,092; BPSC totalSupply
  999,980,924,444,083,854,102,296,256.

## What ran (real deployed canary contracts, inside the fork)

Router `0x4847b410…91e6` → real Uniswap pool → real `StockAcquisitionVault 0x9a5a5536…deC6` →
real `DistributionFundingCoordinator 0xE3Bd9e1D…2205` → real `RialtoStockAcquisitionAdapter
0xbe2C8c6C…66AE` → **mock venue** → real NVDA `0xd0601CE1…9EEC` → real `DistributionClaimManager
0x5EcbADf1…2574`, with real `BPSLockingVault 0xeFA9d1C4…8A42` supplying weights.

**The single mocked boundary:** the Rialto feature-2 settlement venue. The off-chain quote blob
cannot be synthesized on-chain and the venue's settlement selector is a recorded config blocker, so
`registry.ownerOf(2)` was redirected fork-locally (`vm.mockCall` on the real registry) to the
existing development-only `test/mocks/MockRialtoRouter.sol` (`LOCAL_FORK_ONLY` deploy at
`0x5615dEB7…b72f`, rate 1000), seeded with real NVDA via fork-local storage writes. The REAL
adapter code executed the settlement round-trip. Success AND failure behavior of the boundary were
exercised (honest settlement; under-delivery atomic rollback; expired quote).

**Documented impersonations (fork-local `vm.prank`; no key/signature/broadcast):** the canary role
holder `0xD9Eec97D…e203` (immutable acquisitionOperator / rootPublisher / router owner — the only
way to exercise the authorized paths on the deployed instances) and the tester `0x78B256A7…6024`
as **claimant only** (its live lock is a genuine snapshot participant).

## Lifecycle demonstrated (exact base units)

| Stage                                                         | Result                                                                                                                                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official buys (alice/bob/carol)                               | gross WETH in 5,000,000,000,000,000 / 4,000,000,000,000,000 / 2,000,000,000,000,000                                                                                                          |
| Buy fee split (alice)                                         | stock 2% = 100,000,000,000,000; burn 1% = 50,000,000,000,000; BPSC out 2,850,207,613,595,350,811,167,890; burned 42,147,344,162,508,061,507,146 (true supply reduction)                      |
| Official sell (alice, 1,425,103,806,797,675,405,583,945 BPSC) | gross WETH out 1,807,878,180,682,483; user 96% = 1,735,563,053,455,185; stock 2% = 36,157,563,613,649; burn leg burned 28,365,553,006,108,628,825,208                                        |
| Fee conservation                                              | vault accrual delta == Σ 2% stock budgets exactly (220,000,000,000,000 + 36,157,563,613,649)                                                                                                 |
| Locks                                                         | alice 7d (×1.10), bob 14d (×1.25), carol 21d (×1.50) + the live tester lock (×1.10)                                                                                                          |
| Snapshot @ ts 1784960546                                      | weights 3,135,228,374,954,885,892,284,679 / 3,949,658,936,145,492,460,083,161 / 2,251,207,608,740,811,898,024,131 / 523,101,036,779,224,972,875,501; total 9,859,195,956,620,415,223,267,472 |
| Acquisition                                                   | WETH in **287,593,484,277,030** (= canary accrual + rehearsal accrual, exact); NVDA acquired **287,593,484,277,030,000**                                                                     |
| 80/20 split                                                   | distribution **230,074,787,421,624,000** (retained in vault); reserve **57,518,696,855,406,000** delivered to reserveRecipient — exact                                                       |
| Merkle root                                                   | `0xefcc033c554bb10ce9a5ad3a04162520b8874093f6e79fdf7b2b25170cb42cee` (canonical double-hashed leaves via `leafFor`, sorted-pair nodes)                                                       |
| Publication                                                   | via `coordinator.fundRecordedAcquisition` (the existing authorized path); manager funded exactly 230,074,787,421,624,000                                                                     |
| Claims (4/4)                                                  | alice 73,163,877,161,972,197; bob 92,169,477,523,305,697; carol 52,534,315,607,672,429; tester 12,207,117,128,673,674 — each delivered exactly                                               |
| Dust                                                          | **3** units retained → recovered to recoveryRecipient after the window; manager ends at **0** (zero residue)                                                                                 |
| Global conservation                                           | acquired == reserve + Σclaims + dust — exact                                                                                                                                                 |

## Negative & boundary tests (14, all passed on-fork)

expired trade deadline · paused official route · unauthorized settlement (coordinator layer) ·
unauthorized settlement (vault layer) · expired quote · unsupported asset · **adapter
under-delivery with proven atomic rollback (no silent accounting loss)** · claim before cycle ·
unauthorized publication (coordinator layer) · unauthorized publication (manager layer) · claim
before claimStart · duplicate claim/replay · wrong claimant with valid other-party proof · wrong
amount / wrong cycle / unregistered asset. Every required negative/boundary condition is mapped one-to-one to its exact fork assertion or
named unit test in the evidence manifest's `negativeCoverageMap` (no vague references; no required
implemented control is UNPROVEN).

## Verification

| Suite                                                     | Result                                                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Focused lifecycle fork test (`ForkDistributionLifecycle`) | PASS (staged assertions + 14 negatives)                                                                                    |
| Fork discovery probe (`ForkLifecycleProbe`)               | PASS                                                                                                                       |
| `forge test` (full, with fork env)                        | **418 / 418**, 47 suites                                                                                                   |
| `npm run check` (offline full gate)                       | PASS end-to-end                                                                                                            |
| Mainnet non-mutation (before/after read-only snapshot)    | IDENTICAL — nonces 16/16 & 8/8, no nonce-8 tx, no state change                                                             |
| Canonical artifacts                                       | v9 ZIP `0c958a58…b74d` (578,871 B), digest `0xc50d97d7…8314`, canary evidence `d6005083…8ec3` — all re-verified, untouched |

## What this rehearsal does NOT prove

1. Real Rialto venue settlement (quote format, settlement selector, venue eligibility controls) —
   still an external unresolved dependency (blocker B-3).
2. Production wallet-set enumeration for snapshots (needs the indexer; not implemented).
3. TS proof-of-distribution artifact generation bound to real chain state (pipeline is
   fixture-only; rehearsal hashes were placeholders).
4. Legal eligibility, production readiness, or any authorization to deploy or transact live.

## Recommended next milestone

Production hardening + independent security review (HANDOVER.md §O step 3), with the Rialto venue
integration (B-3) and indexer-backed snapshot enumeration as the concrete engineering gaps this
rehearsal surfaced.
