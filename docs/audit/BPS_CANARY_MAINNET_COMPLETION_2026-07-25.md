# BPSC-TEST Canary — Mainnet Completion Evidence Checkpoint (2026-07-25)

**Status: ALL 19 PLANNED CANARY TRANSACTIONS COMPLETED AND INDEPENDENTLY RECONCILED ON CHAIN.**
**BPSC-TEST is a CANARY deployment. It is NOT canonical BPS production, which remains excluded and undeployed.**

This checkpoint was produced by TASK 10E-1, a strictly read-only reconciliation against Robinhood Chain
mainnet (chainId 4663). No transaction was signed, broadcast, funded, or revoked; no wallet was connected;
tester nonce 8 was not used. The machine-readable evidence manifest is
[`BPS_CANARY_MAINNET_COMPLETION_2026-07-25.evidence.json`](./BPS_CANARY_MAINNET_COMPLETION_2026-07-25.evidence.json)
(SHA-256 `d6005083b20e5188ce783cde5b30159b56228398d5bf204746b536e9e36b8ec3`).

## Execution provenance

Execution occurred exclusively through the reviewed **v9 recovery operator** (per-transaction Rabby
approval; no key handling; localhost-only):

- v9 ZIP SHA-256: `0c958a58b8684878c4dfce4a15cdba3b2fc0e39680d46902430ab6e78a09b74d` (verified on disk)
- v9 `recoveryAuthorizationDigest`: `0xc50d97d780c48308667d17366e383be0b70556e0d0bfbab69225222e228d8314`
  (verified identical in the packet, the policy, and the packaged operator authorization)
- Prior package anchors (v5/v6/v7/v8 ZIP SHAs + digests) are bound inside the v9 canonical authorization
  and recorded in the evidence manifest.

Steps 1–13 (deployer nonces 3–15) were previously verified and re-verified again in this task. The final
six tester transactions (original steps 14–19, tester nonces 2–7) were **independently reconstructed** by
binary-searching each tester-nonce transition block — hashes were discovered on chain, not taken from any
operator report — and every field (sender, nonce, destination, value, byte-exact calldata, receipt status,
gas envelope vs the accepted ceilings, events) was verified against the v9 canonical transactions.

## Final six transactions (original steps 14–19; tester `0x78B256A742fa2c0f84ebdAf570fCDC16Ee206024`)

| Orig | Step                   | Nonce | Tx hash                                                              | Block    | Realized gas (wei) |
| ---- | ---------------------- | ----- | -------------------------------------------------------------------- | -------- | ------------------ |
| 14   | WETH.approve(router)   | 2     | `0x2daf53fe75dd0f5dffeae2c2b3dd30b08665c72a8594b74305987eb977d2eae9` | 18788315 | 5,019,113,860,000  |
| 15   | buyExactWethForBps     | 3     | `0x40d67b20a4fdb2a8a3a784c2ea56e3f8ad55338a4f3d412284a2e2b077f7871c` | 18788800 | 50,297,710,068,000 |
| 16   | BPSC.approve(router)   | 4     | `0x550aa1963a6880ceb41314c060811c249f0b3861f433322af9bf023bf6ccdc0f` | 18789018 | 4,384,468,256,000  |
| 17   | sellExactBpsForWeth    | 5     | `0x518ffc03f367548bb19b86afe49efe00caed0aaeb5beb61ad87c5f23419fa01d` | 18789201 | 44,576,252,840,000 |
| 18   | BPSC.approve(vault)    | 6     | `0xbed1b299effdffe1f91e42e321dc2e94967e378de0bddf393153bd94fa7f6db3` | 18789543 | 4,350,114,496,000  |
| 19   | createLock(amount, 7d) | 7     | `0x6818bfabb2be8983dc8737f211d4e308e5b260c94717083935e8bdda2ddbb0ba` | 18791290 | 18,395,913,826,000 |

**Final nonces (live, verified):** deployer latest=pending=**16**; tester latest=pending=**8**.
There is **no tester nonce-8 transaction** (mined or pending): the delayed withdrawal was not executed and
remains unauthorized. No unexpected pending transaction exists on either wallet.

## Verified protocol state

- **All eight deployed contracts** match their accepted runtime code hashes exactly (BPSCanaryToken
  `0x2E6C3dC1e04C45d4B9d40BeE392a135beA50A5d7`, BPSLockingVault `0xeFA9d1C40358E281da21A1BC20a204c849cB8A42`,
  DistributionClaimManager, RialtoStockAcquisitionAdapter, DistributionFundingCoordinator,
  StockAcquisitionVault, UniswapV3BPSSwapAdapter, BPSTradeRouter `0x4847b410D1243eD38B481B89B1D1D59a8C8691e6`).
- **Pool** `0x4A429194dC4E4A1f3b1cD24bBaf7754f65ABc5EF` (WETH/BPSC, fee tier 10000): `factory.getPool`
  exact; slot0 + liquidity recorded in the manifest; pool liquidity equals the LP position liquidity.
- **LP position** tokenId **371728**: owner = deployer, liquidity **3,235,182,407,869,072,596,640**
  (unchanged by the trades, as expected).
- **Buy (tradeId 1):** gross WETH in 1,063,637,427,273,790; stock budget (2%) 21,272,748,545,475; burn
  budget (1%) 10,636,374,272,737; user BPSC out 951,092,794,144,045,405,228,183; BPSC burned
  9,710,110,994,972,363,453,967 — all exactly equal to the canonical expectations.
- **Sell (tradeId 2):** gross BPSC in 475,546,397,072,022,702,614,091; gross WETH out 508,158,605,895,345;
  stock budget (2%) 10,163,172,117,906; retirement burn (2%) 10,163,172,117,906; user WETH out
  487,832,261,659,533; BPSC burned 9,365,444,921,173,534,249,777 — all exact.
- **Fee accounting:** StockAcquisitionVault WETH balance **31,435,920,663,381** == buy stock budget + sell
  stock budget exactly. Total BPSC burned 19,075,555,916,145,897,703,744; BPSC totalSupply
  999,980,924,444,083,854,102,296,256 == 1e27 − burned exactly.
- **Lock (lockId 0):** account = tester; principal **475,546,397,072,022,702,614,092** (the tester's entire
  post-trade BPSC balance; `lockedPrincipal(tester)` matches; tester BPSC balance is now 0); startTime
  1784960546; duration 604800 s (7 days); unlockTime 1785565346 (== start + duration, i.e.
  2026-07-31T23:02:26Z); multiplierBps 11000; policyVersion 1; effective weight (principal × 1.1)
  523,101,036,779,224,972,875,501.
- **Remaining allowances:** tester → router (WETH and BPSC) and tester → vault (BPSC) are all **0** (the
  exact-amount approvals were fully consumed). Residual deployer → NPM allowances of 663,707,774,444,919 wei
  WETH and 7,568 wei-units BPSC remain (mint used slightly less than approved). **No approval revocation was
  performed in this task**, by instruction.
- **Balances:** deployer ETH 2,966,115,952,402,154 / WETH 710,132,572,995,220 / BPSC
  950,000,000,000,000,000,000,007,568; tester ETH 282,910,817,214,031 / WETH 10,069,854,066,833,712 /
  BPSC 0.

## Realized economics (no double counting)

- **Realized gas:** steps 1–13 = 1,754,578,810,854,000 wei; steps 14–19 = 127,023,573,346,000 wei;
  **all 19 = 1,881,602,384,200,000 wei** (≈ $3.50 at ~$1,860/ETH).
- **Principal:** planned 63,818,245,636,427,454 wei WETH total. It was **deployed, not lost**: the LP
  principal sits in the pool position (owned by the deployer) and the tester's trade principal returned as
  WETH minus fees/slippage. Tester net WETH trade delta: −575,805,165,614,257 wei (≈ $1.07 — the 5%
  buy+sell protocol take plus AMM impact), of which 31,435,920,663,381 accrued to the StockAcquisitionVault
  and ~19,076 BPSC-wei-e18 were burned.
- **Planned vs realized:** planned all-inclusive exposure $123.01 (realized gas 1–13 + full principal +
  1.25× gas ceiling for 14–19). Realized gas for 14–19 (127.0e12 wei) came in at ~26% of the 489.6e12 wei
  ceiling. No cap was ever exceeded.

## Explicit scope statements

1. **BPSC-TEST is a canary deployment, not canonical BPS production.**
2. **All 19 planned canary transactions completed** and are anchored above.
3. **The delayed tester nonce-8 withdrawal was NOT executed and remains unauthorized.** It requires a
   separately regenerated, reviewed packet after the lock's unlock time (2026-07-31T23:02:26Z).
4. **No approval revocation was performed in this task** (read-only mandate).
5. **The full fee → RWA acquisition → snapshot → claim lifecycle has NOT yet been demonstrated.** Only fee
   accrual into the StockAcquisitionVault occurred. The next milestone is a fork rehearsal of that
   lifecycle: fee accounting → acquisition funding → RWA settlement → snapshot → Merkle claim.
