# Private Canary — Exact Technical Deployment Packet (PCE-1) — 2026-07-26

Operator packet for the **one-time, $130-capped, private** guarded-settlement canary authorized by
[`BPS_PRIVATE_CANARY_EXCEPTION_2026-07-26.md`](../../../docs/decisions/BPS_PRIVATE_CANARY_EXCEPTION_2026-07-26.md)
(PCE-1). **Robinhood Chain, chainId 4663.**

> **NOT AUTHORIZED TO BROADCAST FROM THIS REPOSITORY.** Claude prepared this packet only; it did **not**
> deploy, fund, broadcast, create a Safe transaction, or perform the canary. Every step below is a
> **human-operator** action performed through the controller **2-of-3 Safe** and a funded deployer, under a
> separate explicit **go-signal**. No auto-broadcast command exists in this repo. **B-1 (audit) and
> B-2/D-23 (counsel) remain INCOMPLETE**; the founder has accepted that risk for this single bounded canary
> only (see PCE-1 §3). **D-24 remains in force for production.**

## 0. Frozen, verified inputs (do not substitute)

| Item                      | Value                                                                         | Source       |
| ------------------------- | ----------------------------------------------------------------------------- | ------------ |
| Chain id                  | `4663`                                                                        | verified     |
| Controller (owner)        | Safe `0x62Ae5b22Dd28Ee338E5A447ed849f9C7008A5E62` (v1.4.1, 2-of-3)            | TASK 10K-8   |
| WETH                      | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`                                  | 10K-7 live   |
| NVDA (Stock Token)        | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC`                                  | 10K-7 live   |
| Rialto Router Registry    | `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E`                                  | 10K-7 live   |
| Feature id                | `2`                                                                           | verified     |
| Approved router code hash | `0xa7041268d6f20802f420b5c71e84a991dc797f27cb474265598b89e43ef27611`          | 10K-5/10K-7  |
| Approved selector         | `0x77963966` (paired ONLY with the code hash)                                 | 10K-5        |
| ETH/USD feed              | `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` ("ETH / USD", 8dp)               | 10K-7 live   |
| NVDA/USD feed             | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` ("RHNVDA / USD", 8dp)            | 10K-7 live   |
| Executor source           | `src/GuardedSettlementExecutor.sol` sha256 `14d8e7ed…fe2f` (commit `5181f1b`) | 10K-9 freeze |
| Price guard source        | `src/ChainlinkSettlementPriceGuard.sol` sha256 `92b774c3…c670`                | 10K-9 freeze |
| Compiler                  | solc 0.8.26, optimizer 200                                                    | foundry.toml |

## 1. Exposure bounds (PCE-1)

- **Total exposure cap: $130 all-inclusive** (WETH funded + gas). Never exceed.
- **Per-acquisition WETH cap (`setMaxSellAmount`):** `1000000000000000` wei = **0.001 WETH** (the reviewed
  `GuardedSettlementConfig` value; well under both the 0.01 WETH executor ceiling and the $130 umbrella).
- **WETH funded to the executor:** exactly one acquisition's worth, **≤ the cap** above.
- **Cycles:** exactly **one** `executeSettlement` (one nonce).
- If ETH price ever implies 0.001 WETH + gas > $130 (not the case at the last observed ~$1885/ETH), reduce
  the cap. Do not raise it.

## 2. evm_version (KL-1 — resolve before building)

`foundry.toml` does not pin `evm_version`. Before producing deployment bytecode, pin a Robinhood-Chain
(Arbitrum-Nitro) supported `evm_version`, rebuild, and **verify the deployed bytecode against the frozen
source hashes** in §0. Do not deploy an unverified artifact.

## 3. Deploy (paused) — human operator, one create tx

Deploy with the **Safe as the initial owner** so every privileged action is a 2-of-3 Safe transaction
(resolves UD-1 for this canary; no separate ownership transfer needed):

- Deploy `ChainlinkSettlementPriceGuard(WETH, NVDA, ETH_USD_FEED, NVDA_USD_FEED, sequencerFeed=0x0,
sequencerGraceSec=0, maxWethFeedAgeSec=900, maxNvdaFeedAgeSec=900)`.
- Deploy `GuardedSettlementExecutor(controller_=Safe, weth_=WETH, stock_=NVDA, registry_=Registry)` — it
  **starts paused** (constructor `_pause()`), owner = the Safe.
- Sender = a **funded deployer EOA** (UD-2 — founder-provided; needs gas). The deployer is only the tx
  sender; the constructor sets `owner = Safe`. Record both deployed addresses.

> `GuardedSettlementConfig.deployPaused(cfg)` may be used, but its `validate()` caps `canaryCapWeth ≤ 0.001
WETH` and requires `controller.code.length > 0` (the Safe qualifies). Broadcasting is done by the operator,
> not by any repo script (`DeployGuardedSettlement.s.sol` is broadcast-free).

## 4. Configure — 2-of-3 Safe transactions (executor is paused)

Each is a Safe tx signed by ≥ 2 owners, `to = executor`, value 0:

1. `setPriceGuard(<deployed ChainlinkSettlementPriceGuard>)`
2. `setApprovedRouterCode(0xa7041268d6f20802f420b5c71e84a991dc797f27cb474265598b89e43ef27611, 0x77963966)`
3. `setMaxSellAmount(WETH, 1000000000000000)` // 0.001 WETH
4. `setTokenPairAllowed(WETH, NVDA, true)`

## 5. Read-only preflight (must pass before unpause)

Run the read-only canary preflight with the deployed executor:

```bash
CANARY_RPC_URL=<read-only rpc> GS_CONTROLLER=0x62Ae5b22Dd28Ee338E5A447ed849f9C7008A5E62 \
CANARY_EXECUTOR_ADDRESS=<deployed executor> GS_CANARY_CAP_WEI=1000000000000000 \
GS_MAX_WETH_FEED_AGE_SEC=900 GS_MAX_NVDA_FEED_AGE_SEC=900 \
node --loader ts-node/esm packages/rialto/src/canary-preflight-cli.ts
```

Require: controller present; router code-hash matches pin; selector/pairing OK; WETH/NVDA symbols+decimals;
both feeds fresh (< 900 s), positive, complete round, correct description/decimals; NVDA `oraclePaused=false`;
cap ≤ 0.001 WETH; executor **paused** (`EXECUTION_LOCKED`). The NVDA feed is fresh **only during an open
trading session** — do not proceed off-hours.

## 6. Fund — ≤ $130 all-inclusive

Transfer **≤ 0.001 WETH** to the executor (exactly the single acquisition amount). Ensure the Safe signer /
deployer has enough native gas. **Total (WETH + gas) ≤ $130.** No other assets, no approvals set by hand.

## 7. Unpause + execute ONE cycle — Safe txs, requires the go-signal

1. **`unpause()`** (Safe tx) — reverts `ConfigIncomplete` unless all of §4 is set. Only under the separate
   explicit execute go-signal.
2. Operator fetches a **live Rialto allowance-mode quote** for WETH→NVDA, amount ≤ cap; obtains
   `tx.to`/`tx.data`, `minBuyAmount`, `deadline` (≤ now+300 s), `slippage_bps` (≤ 100).
3. Build `SettlementParams` (nonce = 1; `calldataHash = keccak256(callData)`; `selector = 0x77963966`;
   `platformFeeBps ≤ 5`; `integratorFeePresent = false`; `slippageBps ≤ 100`; `intentDigest =
computeIntentDigest(...)`).
4. **`executeSettlement(params)`** (Safe tx) — the executor enforces the full envelope (registry lock +
   code-hash pin + selector + exact allowance + own-balance NVDA delta ≥ min + allowance reset + single-use
   digest/nonce + atomic revert). **This is the one and only cycle.**

## 8. Verify the cycle

- `SettlementExecuted` event emitted once; received NVDA ≥ `minBuyAmount`; executor NVDA balance increased by
  the received amount; router WETH allowance back to **0**; nonce 1 consumed; digest consumed.

## 9. MANDATORY pause + recovery (PCE-1 requirement)

1. **`pause()`** (Safe tx) — immediately after the single cycle.
2. **`recover(NVDA, type(uint256).max)`** then **`recover(WETH, type(uint256).max)`** (Safe txs) — move all
   residual NVDA and any leftover WETH from the executor to the Safe. (`recover` moves at most the contract's
   own balance to the owner Safe.)
3. Confirm executor WETH + NVDA balances are **0** and it remains **paused**.

## 10. Post-canary

- Do **not** run a second cycle, raise the cap, add public users, or reuse this executor for production.
- Record the on-chain results in a sanitized evidence artifact (addresses, tx hashes, received amount,
  balances-zeroed, paused) — no secrets, no raw calldata, no quote IDs.
- **B-1 and B-2/D-23 remain INCOMPLETE**; production remains gated by **D-24**.

## Prohibited (unchanged)

No production reuse; no second cycle; no cap increase; no public users; no module/guard/delegate/plugin on
the Safe or executor; no arbitrary-call/approval path (none exists); no private key / mnemonic / authenticated
RPC in any file, log, or commit; no auto-broadcast.
