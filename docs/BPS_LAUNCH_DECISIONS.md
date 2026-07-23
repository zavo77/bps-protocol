# BPS Protocol — Launch Decisions

**Status:** implementation-ready MVP policy; real-money launch still requires counsel review and founder approval of the seed amount
**Economic policy:** `BPS-ECON-2.0`
**Mandate:** `BPS-FRONTIER-10-1.0`
**Verified:** 18 July 2026

> **Document control (bps-experiment canonical).** This copy in `bps-experiment/docs/` is authoritative for the current implementation. It is reconciled to economic policy **`BPS-ECON-2.0`** and the frozen `BPSTradeRouter` contract behavior. Previous external copies stamped `BPS-ECON-1.0` (byte-identical copies under `bps-protocol/docs/`, `bps-protocol/`, `bps-input/`, and `bps-inputs/`) are **superseded and non-authoritative**. The reconciliation was documentation-to-contract only; **no protocol behavior changed** and no external copy was modified.

## 1. Final launch architecture

BPS v1 uses a standard, fixed-supply ERC-20 and a dedicated BPS trade router. The token itself has no transfer tax, rebase, blacklist, or post-deployment mint path.

The official BPS trade router applies a protocol allocation to each official-route trade under `BPS-ECON-2.0` — 3% on a buy and 4% on a sell — and routes the remaining WETH through the canonical Uniswap v3 deployment on Robinhood Chain. The protocol allocation is separate from the Uniswap pool fee.

This is the correct one-day MVP architecture because fee-on-transfer tokens are not a safe assumption for Uniswap v3 integrations. Direct pool trades can bypass the BPS protocol allocation in v1, so the interface and public analytics must distinguish **official-route volume** from total pool volume.

## 2. Verified Robinhood Chain configuration

| Parameter                              | Production value                                       |
| -------------------------------------- | ------------------------------------------------------ |
| Network                                | Robinhood Chain Mainnet                                |
| Chain ID                               | `4663` (`0x1237`)                                      |
| Native gas asset                       | ETH                                                    |
| Public RPC — development/fallback only | `https://rpc.mainnet.chain.robinhood.com`              |
| Recommended production RPC pattern     | `https://robinhood-mainnet.g.alchemy.com/v2/{API_KEY}` |
| Explorer                               | `https://robinhoodchain.blockscout.com`                |
| WETH                                   | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`           |
| USDG                                   | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`           |

Robinhood states that its public RPC is rate-limited and not intended for production-grade traffic. Use a dedicated provider for the web app, indexer, automation service, and deployment scripts, with the public RPC only as a non-critical fallback.

Primary source: [Robinhood Chain — Connecting](https://docs.robinhood.com/chain/connecting/) and [Robinhood Chain — Token Contracts](https://docs.robinhood.com/chain/contracts/).

## 3. Verified Uniswap v3 configuration

| Contract                   | Robinhood Chain address                      |
| -------------------------- | -------------------------------------------- |
| UniswapV3Factory           | `0x1f7d7550b1b028f7571e69a784071f0205fd2efa` |
| QuoterV2                   | `0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7` |
| NonfungiblePositionManager | `0x73991a25c818bf1f1128deaab1492d45638de0d3` |
| SwapRouter02               | `0xcaf681a66d020601342297493863e78c959e5cb2` |
| UniversalRouter            | `0x8876789976decbfcbbbe364623c63652db8c0904` |
| Permit2                    | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

Use `SwapRouter02` inside the v1 BPS trade router because its single-pool v3 integration is simpler to implement and test. The public web app may later use `UniversalRouter`, which Uniswap identifies as its preferred general swap entrypoint.

Primary source: [Uniswap — Robinhood Chain deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments).

### Supported v3 fee tiers

The factory state was read at Robinhood Chain block `13,277,200` on 18 July 2026:

| Solidity fee value | Pool fee | Tick spacing | Enabled |
| -----------------: | -------: | -----------: | ------- |
|              `100` |    0.01% |            1 | Yes     |
|              `500` |    0.05% |           10 | Yes     |
|             `3000` |    0.30% |           60 | Yes     |
|            `10000` |    1.00% |          200 | Yes     |

The BPS/WETH launch pool uses fee value `10000` (1.00%) and tick spacing `200`. This **Uniswap pool fee is separate from the BPS protocol allocation** described in section 5.

Reproduce the state check before deployment:

```powershell
cast call 0x1f7d7550b1b028f7571e69a784071f0205fd2efa `
  "feeAmountTickSpacing(uint24)(int24)" 10000 `
  --rpc-url $env:RH_RPC_URL
```

Uniswap documentation describes 0.01%, 0.05%, 0.30%, and 1.00% v3 tiers. Enabled tiers must still be checked against the actual factory before pool creation: [Uniswap — fees](https://developers.uniswap.org/docs/get-started/concepts/fees).

## 4. Frontier 10 acquisition mandate

Frontier 10 is not a fund NAV that BPS continuously rebalances. It is the rule that divides each Stock Token acquisition cycle. Acquired assets are then allocated to eligible BPS holders. An **accrued acquisition budget is not a completed acquisition**: budget accrues from official-route allocations, while an acquisition occurs only when a cycle is executed and recorded on-chain.

> The Frontier 10 membership, target weights, and token addresses below are a **proposal pending final founder/counsel approval and independent registry verification** — see the founder decision pack. They are not finalized here. Every address must be re-verified against Robinhood's live canonical registry and the execution venue immediately before any real acquisition.

| Ticker | Reference company                   | Mandate sleeve         | Target acquisition weight | Canonical Robinhood Token observed on Robinhood Chain |
| ------ | ----------------------------------- | ---------------------- | ------------------------: | ----------------------------------------------------- |
| NVDA   | NVIDIA                              | Accelerated compute    |                       17% | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC`          |
| MSFT   | Microsoft                           | AI platforms           |                       13% | `0xe93237C50D904957Cf27E7B1133b510C669c2e74`          |
| GOOGL  | Alphabet Class A                    | AI infrastructure      |                       11% | `0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3`          |
| AMZN   | Amazon                              | Cloud infrastructure   |                        9% | `0x12f190a9F9d7D37a250758b26824B97CE941bF54`          |
| META   | Meta Platforms                      | AI distribution        |                        8% | `0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35`          |
| AMD    | AMD                                 | Compute infrastructure |                        8% | `0x86923f96303D656E4aa86D9d42D1e57ad2023fdC`          |
| TSLA   | Tesla                               | Autonomy               |                        8% | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d`          |
| PLTR   | Palantir Technologies               | Applied intelligence   |                        8% | `0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A`          |
| SPCX   | Space Exploration Technologies Corp | Private space systems  |                       10% | `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa`          |
| RKLB   | Rocket Lab Corporation              | Public space systems   |                        8% | `0x3b14C39E89D60D627b42a1A4CA45b5bb45Fc12e2`          |
|        | **Total**                           |                        |                  **100%** |                                                       |

The mandate creates three explicit sleeves:

- 66% AI compute, infrastructure, and distribution.
- 16% applied intelligence and autonomy.
- 18% space systems.

The private-company-linked SPCX exposure is capped at 10%. BPS must describe it as exposure through an issuer's tokenized debt security—not equity ownership in SpaceX.

The issuer's disclosure library contains Final Terms for all ten reference assets: [Robinhood Assets (Jersey) disclosure library](https://robinhood.com/eu/en/legal/rhj/). Code plus the expected onchain name, symbol, and 18-decimal metadata were confirmed for all ten listed addresses at Robinhood Chain block `13,285,312`. Contract addresses must still be checked again against Robinhood's live canonical registry and the execution venue immediately before every real acquisition.

### Acquisition and fallback rules

1. Apply target weights to the acquisition budget after gas and venue costs.
2. Execute only a canonical Robinhood Token with current issuer documentation, a valid executable quote, acceptable transferability, and a recipient-eligibility path.
3. Maximum quote age: 30 seconds. Maximum price impact/slippage: 100 BPS for the capped MVP.
4. Round down to venue-supported units. Leave residual value in the distribution vault and add it to the next cycle.
5. If an asset is temporarily unavailable, defer that slice for up to seven days.
6. After seven days, reallocate only inside the same sleeve. If an entire sleeve is unavailable, retain its value in the vault. Do not create cross-sleeve style drift.
7. Track cumulative target-versus-actual acquisition weights. Subsequent cycles may catch up a prior shortfall without exceeding the 20% per-name hard cap in any one cycle.
8. Review the mandate quarterly. Weight or membership changes require a new version, published rationale, effective cycle, and content hash before execution.

OpenAI remains on the watchlist until a canonical, transferable Robinhood Token and executable compliant route can be independently verified.

## 5. Final economic defaults

Acquired Stock Tokens are split **80% to the distribution allocation and 20% to the strategic reserve** (per the frozen `StockAcquisitionVault`). Market price and fully-diluted valuation are **not** the same as asset backing.

| Parameter                                                |                                                                                                                                                                                        `BPS-ECON-2.0` decision |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| Fixed token supply                                       |                                                                                                                                                                                              1,000,000,000 BPS |
| Token decimals                                           |                                                                                                                                                                                                             18 |
| Minting after deployment                                 |                                                                                                                                                                                                           None |
| Transfer tax                                             |                                                                                                                                                                                                           None |
| Official-route protocol allocation — **buy**             |                                               **3% total**: 200 BPS (2%) Stock Token acquisition funding + 100 BPS (1%) BPS repurchase-and-burn; the remaining 97% of gross WETH input is routed into the swap |
| Official-route protocol allocation — **sell**            | **4% total**: 200 BPS (2%) Stock Token acquisition funding + 200 BPS (2%) BPS repurchase-and-burn, taken from realized WETH proceeds; the remaining 96% of realized WETH proceeds is transferred to the seller |
| Acquired Stock Token split                               |                                                                                                                                                            80% distribution allocation / 20% strategic reserve |
| Uniswap pool fee (separate from the protocol allocation) |                                                                                                                                                                                      1.00% / fee value `10000` |
| Cost-distinction note                                    |                                  The protocol allocation (3% buy / 4% sell) is **separate** from the ~1% Uniswap pool fee, gas, price impact, and slippage; these are not summed into a single protocol figure |
| Staking requirement                                      |                                                                                                                                                                                                           None |
| Eligibility-attestation term                             |                                                                                                                                                                                                        90 days |
| Claim window                                             |                                                                                                                                                                                                        90 days |
| First real proof-cycle target                            |                                                                                                                                                                 $250 equivalent, capped and founder-authorized |
| Normal cycle trigger                                     |                                                                                                           Evaluated weekly; execute once the vault holds at least $1,000 equivalent and venue minimums are met |
| Unclaimed allocations                                    |                                                                                                                               Rolled into a later cycle after the claim window, subject to the published terms |
| Distribution rounding dust                               |                                                                                                                                                           Remains in the distribution vault for the next cycle |
| Emergency control                                        |                                                                                                                                                                                          Safe-controlled pause |

Frozen `BPSTradeRouter` execution (BPS-ECON-2.0):

- **Buy.** After the 2% Stock Token acquisition allocation and 1% BPS repurchase-and-burn allocation, 97% of gross WETH input is routed into the Uniswap swap. The separate Uniswap pool fee, price impact and slippage affect the resulting BPS output.
- **Sell.**
  1. BPS is swapped through the Uniswap pool;
  2. the separate pool fee applies within that swap;
  3. 2% of realized WETH proceeds funds Stock Token acquisition;
  4. 2% funds BPS repurchase-and-burn;
  5. the remaining 96% of realized WETH proceeds is transferred to the seller.

The BPS repurchase-and-burn is a true `totalSupply` reduction: the router repurchases BPS with the WETH burn allocation through the immutable adapter and burns the BPS it receives via the token's self-burn.

LP fees are separate from BPS protocol revenue. During the first 90 days, 100% of fees attributable to a protocol-controlled LP position are reserved for collection and redeployment into liquidity. Public accounting must show the LP NFT owner, fees collected, and redeployment transactions.

### Eligible supply for a cycle

Exclude these addresses from the holder denominator:

- The Uniswap pool and NonfungiblePositionManager.
- Burn/dead addresses.
- BPS treasury and distribution vaults.
- Team/contributor vesting contracts.
- Bridges, routers, and contracts that cannot legally complete eligibility.
- Any address explicitly excluded in the published cycle manifest.

The cycle manifest must publish the snapshot block, excluded-address list, total eligible BPS supply, asset allocations, rounding method, terms version, restricted-jurisdiction version, and Merkle root.

## 6. Values that cannot be silently chosen

Only three live-launch inputs remain founder/counsel controlled:

1. Exact ETH seed amount and approved BPS inventory for the first LP position.
2. The operating legal entity, governing law, notices address, and privacy contact.
3. Whether Rialto and the Stock Token issuer require KYC/AML or an allowlist for the purchasing wallet, vault, and recipients.

Codex may implement placeholders and mock flows for these values. It must not spend funds, deploy mainnet contracts, or represent a wallet as eligible without explicit authorization and verified integration requirements. See `docs/audit/TASK_10_FOUNDER_DECISION_PACK.md` for the full unresolved-decision list, which remains fail-closed.
