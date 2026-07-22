# BPS Restricted-Beta Deployment Runbook (Robinhood Chain, id 4663)

Operator procedure for the **future, explicitly authorized** first live deployment and canary. Nothing
in this repository broadcasts, signs, or deploys. This runbook is prepared ahead of that authorization.

The system is **NOT** fully decentralized in the restricted beta: it retains a trusted
`acquisitionOperator`, a trusted `rootPublisher`, and a dependency on the centralized, protected Rialto
quote service. Do not describe it as public-beta ready until the legal/eligibility review clears.

## 0. Preconditions (all must hold before any broadcast)

- A separate, explicit written authorization for a live deployment exists.
- Every row of the Task 7 readiness matrix that is `USER INPUT REQUIRED` has been supplied and re-verified.
- Legal/eligibility review for Robinhood Stock Tokens has cleared (`EXTERNAL REVIEW REQUIRED`).
- A BPS/WETH Uniswap v3 pool exists and its fee tier and liquidity are verified (currently `BLOCKED`).
- A slippage/oracle policy is defined (no on-chain oracle guard exists yet; `minStockOut` is operator-set).

## 1. Required user-supplied role addresses

Supply as env vars (see `.env.example`); a **Safe** is strongly recommended for owner/operator/publisher:

| Env var                    | Role                                          | Notes                                          |
| -------------------------- | --------------------------------------------- | ---------------------------------------------- |
| `BPS_DEPLOYER`             | deployer EOA/Safe                             | its CREATE nonces produce every address        |
| `BPS_START_NONCE`          | deployer nonce at the BPSToken deploy         | must equal the live nonce at broadcast time    |
| `BPS_TREASURY`             | initial full BPS supply holder                | 1,000,000,000 BPS minted once                  |
| `BPS_PROTOCOL_OWNER`       | owner of `BPSLockingVault` + `BPSTradeRouter` | pause + two-step ownership only; no fund power |
| `BPS_RESERVE_RECIPIENT`    | vault reserve (>=20%) destination             | immutable                                      |
| `BPS_ACQUISITION_OPERATOR` | trusted keeper initiating acquisitions        | supplies the Rialto quote + `minStockOut`      |
| `BPS_ROOT_PUBLISHER`       | governed PoD root publisher / cycle funder    | immutable                                      |
| `BPS_CLAIM_RECOVERY`       | post-deadline recovery destination            | immutable                                      |
| `BPS_STOCK_BASKET`         | approved stock tokens (comma-separated)       | each must have code; product/legal decision    |

## 2. Verified externals (re-verify at broadcast time)

From `deploy/robinhood-mainnet.dryrun.json` (chain 4663), re-check code + runtime code hash against the
live chain immediately before broadcast:

- WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` (decimals 18)
- Rialto Router Registry `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E`
- SwapRouter02 `0xCaf681a66D020601342297493863E78C959E5cb2` (its `WETH9()` must equal WETH)
- Uniswap v3 factory `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` (== `SwapRouter02.factory()`)
- Feature-2 router = `registry.ownerOf(2)` — a **dynamic** value; confirm `getFeature(2).paused == false`
  and that `ownerOf(2)` matches `getFeature(2).current`. The adapter binds only `ownerOf(2)` at
  execution time; never hardcode this address.

## 3. RPC requirements

- Deployment/verification RPC must be a Robinhood Chain node reporting `eth_chainId == 0x1237` (4663).
- The public `https://rpc.mainnet.chain.robinhood.com` is rate-limited and is a **development/fallback**
  RPC only — do not use it as the production broadcast endpoint.
- Read-only calls used: `eth_chainId`, `eth_blockNumber`, `eth_getCode`, `eth_call`.

## 4. Rialto quote-service configuration (acquisition time, not deployment)

- The quote client lives in `@bps/rialto/server` and reads `RIALTO_API_KEY` **server-side only**. Never
  expose it to browser/client bundles; never use a `NEXT_PUBLIC_*` variant; never log it.
- It forces `chain_id=4663`, `settlement=allowance`, `sell_token=WETH`, `taker=<RialtoAdapter>`, no
  integrator fee, no Permit2, no gasless, and validates the full response before use.
- Slippage policy: `minStockOut` is supplied by the operator per acquisition; set a conservative bound.
  A permissionless flow requires an on-chain oracle guard that does not yet exist.
- Operational caps (set by governance): maximum single acquisition WETH; maximum first proof/distribution
  cycle amount; stock-token allowlist == the deployed vault basket.

## 5. Deployment nonce locking + deterministic order

The deploy is a single deployer, no setter, fixed order (offsets from `BPS_START_NONCE = n0`):

```
n0+0 BPSToken            n0+4 DistributionFundingCoordinator (== vault executor AND coordinator)
n0+1 BPSLockingVault     n0+5 StockAcquisitionVault
n0+2 DistributionClaimManager   n0+6 UniswapV3BPSSwapAdapter
n0+3 RialtoStockAcquisitionAdapter   n0+7 BPSTradeRouter
```

- Lock the deployer nonce: no other transaction may originate from `BPS_DEPLOYER` between transactions.
- If any transaction reverts or is skipped, **abort** — the nonce plan is broken and predicted addresses
  no longer match. There is no partial-deployment recovery; restart from a fresh nonce plan.

## 6. Pre-broadcast preflight (broadcast-free)

1. `forge build` and run the full local suite (`forge test`) — must be green.
2. Run the mainnet-fork rehearsal against a read-only RPC:
   `ROBINHOOD_FORK_RPC=<rpc> forge test --match-contract ForkDeployRehearsal` — must pass.
3. Generate the manifest: set every `.env` var, then run `DeployBPS.s.sol` (broadcast-free). It fails
   closed on any zero/placeholder/aliased/no-code/wrong-chain input and writes
   `deploy/manifest.out.json`. Confirm `broadcastReady` becomes true only after all values are real.
4. Verify each contract's creation bytecode hash against a reproducible build.

## 7. Broadcast (authorized step — NOT performed by this repository)

- Use a hardware wallet or an encrypted keystore. Never pass a raw private key on the command line and
  never store one in the repo or `.env`. This runbook deliberately provides no key-wired broadcast path.
- Broadcast the 8 transactions in the exact order above from `BPS_DEPLOYER` at `BPS_START_NONCE`.
- After each transaction, assert the deployed address equals its prediction before sending the next.

## 8. Post-deployment invariant calls

- `vault.acquisitionExecutor() == vault.distributionFundingCoordinator() == coordinator`
- `manager.owner() == coordinator`; `coordinator.stockAcquisitionVault() == vault`;
  `coordinator.distributionClaimManager() == manager`
- `rialtoAdapter.stockAcquisitionVault() == vault`; `rialtoAdapter.routerRegistry() == registry`
- `router.stockBudgetRecipient() == vault`; `router.swapAdapter() == uniswapAdapter`;
  `uniswapAdapter.bpsTradeRouter() == router`
- Economics: router `BUY_STOCK_BPS=200`, `BUY_BURN_BPS=100`, `SELL_STOCK_BPS=200`, `SELL_BURN_BPS=200`,
  `BPS_DENOMINATOR=10000`; vault `DISTRIBUTION_PERCENT=80`, `SPLIT_DENOMINATOR=100`.
- `bps.totalSupply() == bps.MAX_SUPPLY()` and the whole supply is at `BPS_TREASURY`.
- Every protocol contract has zero WETH/stock/BPS balances and zero standing allowances.
- Contract source verification submitted to the chain explorer.

## 9. Abort conditions

Abort immediately (do not send the next transaction) if any of: a deployed address != prediction; an
immutable getter != expected; `getFeature(2).paused == true` or `ownerOf(2)` reverts; a code-hash
mismatch on any external; a nonzero starting balance/allowance; or any economics constant is off.

## 10. Canary (separate explicit authorization; do NOT run in this task)

1. Deploy only after the separate authorization; verify every address and immutable (steps 7–8).
2. Use exactly **one** approved stock.
3. Perform the smallest operationally meaningful acquisition (tiny WETH budget).
4. Run **one** capped distribution cycle via the recorded-acquisition flow (operator records; publisher
   funds exactly the recorded 80%).
5. Restrict claims to pre-approved restricted participants only.
6. Reconcile every WETH, stock, reserve, distribution, and burn delta against expectations.
7. Stop immediately on any mismatch; do not scale up.

## 11. Monitoring & incident criteria

- Watch: `AcquisitionRecorded`/`AcquisitionFunded` (coordinator), reserve deliveries, `publishCycle`
  fundings, burns (`totalSupply` decreases), and registry migrations (`ownerOf(2)` changes).
- Incident triggers: any acquisition without a matching exact record; a cycle funded off the recorded
  80%; reserve accounting drift; an unexpected `ownerOf(2)` change mid-operation; any nonzero residual
  custody/allowance on the coordinator, vault, or adapters after an operation completes.
