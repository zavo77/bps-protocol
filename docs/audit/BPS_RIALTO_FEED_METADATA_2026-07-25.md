# BPS Rialto Oracle / Feed Metadata Evidence — 2026-07-25 (TASK 10J-3)

Matching machine-readable representation:
[`BPS_RIALTO_FEED_METADATA_2026-07-25.evidence.json`](./BPS_RIALTO_FEED_METADATA_2026-07-25.evidence.json).

**Nothing in this document is approved or configured.** Every feed, aggregator and token address is
labeled `CANDIDATE — NOT APPROVED / NOT CONFIGURED`. This persists the read-only findings of
TASK 10J-1 through TASK 10J-2B. B-3 remains `PARTIAL — RIALTO QUOTE ACCESS REQUIRED`.

## Scope and evidence hierarchy

Authority order: (1) official Chainlink feed catalog + Robinhood tokenized-equity feed docs;
(2) official Robinhood Chain docs, including the Stock Token API page that documents
`GET https://api.robinhood.com/rhj/assets`; (3) read-only on-chain verification at an explicitly
recorded Robinhood Chain block; (4) verified contract behavior as supporting evidence only, never a
substitute for an official listing.

## Source-retrieval ledger (all fetched in memory; no response body written to disk)

| URL                                                                        | UTC                  | HTTP | in-memory SHA-256                                                  | class                      | fact                                                                                                        |
| -------------------------------------------------------------------------- | -------------------- | ---- | ------------------------------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood | 2026-07-25T18:25:47Z | 200  | `c978469cb394ab0fcd5110e6a39e7913d4302562a58911afca97433251844040` | official-page-data         | references `feeds-robinhood-mainnet.json` + embeds the ETH/USD and NVDA/USD proxies                         |
| https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json   | 2026-07-25T18:25:48Z | 200  | `ff16a26cfe74f56defc6ea5fbbbbd8b6c20556298c19f258600dcd6bce81d526` | official-page-data-origin  | ETH/USD + Robinhood NVDA/USD proxy/aggregator/decimals/heartbeat/deviation                                  |
| https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood        | 2026-07-25T18:25:48Z | 200  | `cecca1f5c5d8866ac6910938d0c0ca1f09b2d2fbf082f6aa6ae08e49f3efb1e5` | documentary                | per-token = underlying × multiplier; no re-apply; off-hours held values, no off-hours heartbeat             |
| https://docs.chain.link/data-feeds/l2-sequencer-feeds                      | 2026-07-25T18:25:49Z | 200  | `fcad9ff051416b66c72a0ad3ecac3678193eaee58e08989509c4cdd0b2357455` | documentary                | Robinhood Chain / 4663 absent from supported L2 sequencer list                                              |
| https://docs.robinhood.com/chain/contracts/                                | 2026-07-25T18:25:49Z | 200  | `69c0902a7d186ee2a9e97bc14dc71b13fc20eabd66e3a72dbff51eb4f6012ad3` | documentary + client-asset | canonical WETH; Stock Token table generated live from the on-chain asset registry                           |
| https://docs.robinhood.com/chain/stock-token-apis/                         | 2026-07-25T18:25:50Z | 200  | `55d6428586525600d434f68d09850dd712368803a223c1e1eb51557eee818daf` | documentary                | directly documents `GET https://api.robinhood.com/rhj/assets` (per-chain deployments + current multipliers) |
| https://docs.robinhood.com/chain/oracles-and-price-feeds/                  | 2026-07-25T18:25:52Z | 200  | `72622a4bc1da0056f3cfc1c652948ed5b390726784dd3ebb771e41ed15020d59` | documentary                | names the Chainlink addresses page as source of truth; do not re-apply uiMultiplier                         |
| https://docs.robinhood.com/chain/protocol-contracts/                       | 2026-07-25T18:25:53Z | 200  | `c46a80a80f8c758b5757bb15a103283cfc342e43a50a338572c2070474852639` | documentary                | precompiles + WETH + Permit2; no static NVDA token address; no statically labeled stock-token registry      |
| https://api.robinhood.com/rhj/assets                                       | 2026-07-25T18:25:54Z | 200  | `a1fbf1529c12f8f1ad422088d642479d588b7a166c72c069e02e1aea46c51480` | official-endpoint          | canonical NVDA record binding ticker + name to `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` @ chainId 4663  |

**Provenance:** the Chainlink feed directory is `OFFICIAL CHAINLINK PAGE DATA ORIGIN — PROVEN` (the
addresses page references `https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json`
and embeds the same proxies). The Robinhood asset endpoint provenance is the official Stock Token
API documentation page, which documents `GET https://api.robinhood.com/rhj/assets`. The token `rhj`
is used verbatim; no expansion of it is asserted. The Chainlink feeds JSON self-identifies only as
`blockchainName` `Robinhood` and does not contain the literal `4663`; the chain-4663 binding rests on
read-only on-chain verification.

## Chain ID and fixed inspection block

- Chain ID `4663`; RPC availability: PASS (endpoint URL/credential not exposed).
- Block number `19223939`; block hash
  `0xe94b855b7973b78c1fb6611de5f41c421a69bc80f24d6631a89925270bccdb8c`.
- Block timestamp `1785003993` = `2026-07-25T18:26:33Z`. Only non-mutating RPC methods were used.

## Canonical WETH — `CANDIDATE — NOT APPROVED / NOT CONFIGURED`

Address `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` (official: docs.robinhood.com/chain/contracts/).
On-chain @ block 19223939: bytecode hash
`0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353`, `name()` `WETH`, `symbol()`
`WETH`, `decimals()` 18. **Metadata alone does not prove complete 1:1 redemption parity** — wrapping,
deposit/withdrawal, and redemption behavior are security/engineering verification items (D-11).

## ETH/USD candidate — `CANDIDATE — NOT APPROVED / NOT CONFIGURED`

**This is an ETH/USD feed used only as a candidate mapping for canonical WETH. It is not a direct
WETH/USD feed.**

- Proxy `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9`, bytecode hash
  `0xbd6f524cdc4268b6bd1bb6f77a8821faeea9c52ee9e0afa0b6d948ce82c966c2`.
- Aggregator `0x6091E64eb7138EEF066a80FD3A0d7427B91f2721`, bytecode hash
  `0x8cbea1fd25321771256158fd6beb8689fe60cd36230b22c65e77c2a03c5972fd`.
- `decimals()` 8; on-chain `description()` `ETH / USD`; official catalog name `ETH / USD`;
  `version()` 6; proxy-reported aggregator `0x6091e64eb7138eef066a80fd3a0d7427b91f2721` (matches
  catalog).
- Official catalog metadata: decimals 8, heartbeat 86400 seconds, deviation 0.5%, marketHours
  `Crypto`.
- `latestRoundData()` raw: roundId `18446744073709552852`, answer `186543329577`, startedAt
  `1784987022` (`2026-07-25T13:43:42Z`), updatedAt `1784987034` (`2026-07-25T13:43:54Z`),
  answeredInRound `18446744073709552852`. Structural validity: roundId > 0, answer > 0, updatedAt > 0,
  answeredInRound ≥ roundId — **structural only, not a BPS-freshness evaluation**.

## Canonical NVDA Stock Token — token provenance `OFFICIAL LIVE ROBINHOOD LISTING — REPRODUCIBLY ESTABLISHED`

**Official endpoint record** (`https://api.robinhood.com/rhj/assets`): `id`
`0x00000000000000000000000000000000915f477416294f5099a5e0e09f327ce5`, `tokenSymbol` `NVDA`,
`tokenName` `NVIDIA • Robinhood Token`, `deployments[0].contractAddress`
`0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC`, `deployments[0].chainId` 4663, `currentMultiplier`
`1.000000000000000000`, `pendingMultiplier` empty, `status` `ASSET_STATUS_ACTIVE`.

**On-chain corroboration** @ block 19223939, token `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC`:
bytecode hash `0x6c1fdd40002dcb440c7fff6a84171404d279ccb057803b65826f7546acd65630`, `name()`
`NVIDIA • Robinhood Token`, `symbol()` `NVDA`, `decimals()` 18, `uid()`
`0x00000000000000000000000000000000915f477416294f5099a5e0e09f327ce5` (**equals the endpoint asset
id**), `uiMultiplier()` `1000000000000000000`, `newUIMultiplier()` `1000000000000000000`,
`effectiveAt()` `0`, `oraclePaused()` false.

- **What the endpoint establishes:** the canonical token — ticker + name + exact contract address +
  chainId 4663 + current multiplier + active status.
- **What the on-chain calls corroborate:** identity (name/symbol/decimals); that the token's own
  `uid()` equals the endpoint asset id; that `uiMultiplier()` 1e18 matches `currentMultiplier` 1.0 and
  `oraclePaused()` false matches `ASSET_STATUS_ACTIVE`. This is not ticker coincidence.

## NVDA/USD candidate — `CANDIDATE — NOT APPROVED / NOT CONFIGURED`

- Proxy `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15`, bytecode hash
  `0xbd6f524cdc4268b6bd1bb6f77a8821faeea9c52ee9e0afa0b6d948ce82c966c2`.
- Aggregator `0xC9d16E4f2569b9E3ea0468fD85844953713DC2a2`, bytecode hash
  `0x86c40717eec9baaca05681fa740851a8780f155d7b748a6a33a859ae67717d8a`.
- `decimals()` 8; **official catalog name `Robinhood NVDA / USD`** vs **on-chain `description()`
  `RHNVDA / USD`**; `version()` 6; proxy-reported aggregator
  `0xc9d16e4f2569b9e3ea0468fd85844953713dc2a2` (matches catalog).
- Official catalog metadata: decimals 8, heartbeat 86400 seconds, deviation 0.5%, marketHours
  `us_equities_24/5`.
- **Semantics:** the feed reports the Stock Token's multiplier-adjusted Total Return Value; do not
  multiply the feed answer by `uiMultiplier()` again; during closed sessions the feed may hold its
  last value; tokenized-equity feeds have no heartbeat during off-hours.
- `latestRoundData()` raw: roundId `18446744073709552076`, answer `20637470000`, startedAt
  `1784923024` (`2026-07-24T19:57:04Z`), updatedAt `1784923036` (`2026-07-24T19:57:16Z`),
  answeredInRound `18446744073709552076`. Structural validity: roundId > 0, answer > 0, updatedAt > 0,
  answeredInRound ≥ roundId. The observation age at the inspection block is consistent with a value
  held over a closed session; this does **not** establish closed-session freshness or resolve BPS
  policy.

## Inconsistencies

1. NVDA/USD on-chain `description()` `RHNVDA / USD` vs Chainlink catalog name `Robinhood NVDA / USD`
   — same asset, different string; aggregator address matches the catalog exactly.
2. The Chainlink feeds JSON carries `blockchainName` `Robinhood` but no chain id field; chain-4663 is
   established only by on-chain verification.

No other documentary/on-chain inconsistency observed.

## Classifications

- **D-9: `OFFICIALLY IDENTIFIED CANDIDATE — NOT APPROVED / NOT CONFIGURED`** (ETH/USD candidate
  mapping for canonical WETH; not a direct WETH/USD feed; D-11 security/engineering validation
  outstanding).
- **D-10: `OFFICIALLY IDENTIFIED CANDIDATE — NOT APPROVED / NOT CONFIGURED`** (feed provenance proven;
  canonical token binding reproducibly established).
- **D-13: `UNRESOLVED — NO ROBINHOOD CHAIN ADDRESS IN CURRENT OFFICIAL CHAINLINK LIST`** (fail-closed;
  recovery grace period deferred).

## D-12

D-12's strict-freshness approach is founder-directed, but the exact maximum-staleness value remains
deferred. The 86400-second catalog heartbeat is evidence for later analysis, not an approved ceiling,
production setting or closed-session freshness guarantee.

## Remaining security/engineering requirements

D-9 (canonical WETH wrapping/deposit/withdrawal/redemption parity + ETH/USD suitability + proxy round
handling + future freshness enforcement); D-10 (wire the reproduced NVDA feed-and-token binding +
freshness); D-12 (choose a maximum-staleness value; deferred, no numeric constraint approved); D-16
(deviation-limit calibration against a real quote); D-19 (off-hours fail-closed implementation);
D-22B (coordinator-level on-chain oracle-floor / guarded-executor implementation + independent
review); standing B-1 external audit.

## TASK 10J-2 seven-file process deviation

TASK 10J-2 wrote seven response bodies to a session scratchpad directory **outside** the git
repository via `curl -o`; its report line claiming no file occurred was imprecise (no repository file was
created, but seven non-repository filesystem objects were). Files (name, bytes, SHA-256):
`tokenized-equity.html` (359934, `cecca1f5c5d8866ac6910938d0c0ca1f09b2d2fbf082f6aa6ae08e49f3efb1e5`),
`l2-sequencer.html` (340572, `fcad9ff051416b66c72a0ad3ecac3678193eaee58e08989509c4cdd0b2357455`),
`addresses-robinhood.html` (16943376, `c978469cb394ab0fcd5110e6a39e7913d4302562a58911afca97433251844040`),
`rh-oracles.html` (47416, `72622a4bc1da0056f3cfc1c652948ed5b390726784dd3ebb771e41ed15020d59`),
`rh-contracts.html` (22144, `69c0902a7d186ee2a9e97bc14dc71b13fc20eabd66e3a72dbff51eb4f6012ad3`),
`feeds-robinhood.json` (79765, `ff16a26cfe74f56defc6ea5fbbbbd8b6c20556298c19f258600dcd6bce81d526`),
`rh-protocol.html` (57109, `c46a80a80f8c758b5757bb15a103283cfc342e43a50a338572c2070474852639`), under
`C:\Users\Administrator\AppData\Local\Temp\2\claude\C--Projects-bps-experiment\9d4a60ba-88f8-4f76-aea5-a1228d4992d0\scratchpad\10j2`.
**TASK 10J-2A and TASK 10J-2B made no filesystem change**; their evidence was reproduced in memory.

## Confirmation

No value has been approved or configured. No credential, Rialto access, quote retrieval, wallet
action, signature, allowance, simulation, transaction, deployment, or production activation occurred
in the discovery that produced this evidence.
