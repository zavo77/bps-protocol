# BPS Guarded-Settlement — Live Oracle / Safe / Preflight Acceptance — 2026-07-26 (TASK 10K-7)

Machine-readable evidence: [`BPS_RIALTO_LIVE_ORACLE_2026-07-26.evidence.json`](./BPS_RIALTO_LIVE_ORACLE_2026-07-26.evidence.json).

This closes the live-chain acceptance gaps left open by TASK 10K-6. All observations are **read-only**. **No
Rialto quote, no API key, no private key/mnemonic read, no signing, no funding, no approval, no deployment,
no broadcast, no state change.** QEX-1 remains consumed. **D-24 stands.** Authenticated RPC endpoints were
used only via ephemeral process env and were never written to the repository, evidence, or this report.

## Two independent conclusions

- **Technical build readiness: `CANARY_BUILD_READY_EXECUTION_LOCKED`.** The implementation and every
  controller-independent technical check pass; configured feed/token/router identities match live chain.
- **Live runtime preflight readiness: `CANARY_NOT_READY`.** The controller is missing and both feeds exceed
  the strict 900 s freshness window at the observation time (NVDA market-closed Sunday; ETH low-volatility
  within its heartbeat). These are runtime-availability states, not code/config defects.

## P0 — Authoritative feed resolution

Primary authority: the Chainlink reference-data directory (`feeds-robinhood-mainnet.json`, 56 feeds), which
the [Chainlink addresses page](https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood)
consumes and to which the [Robinhood oracle docs](https://docs.robinhood.com/chain/oracles-and-price-feeds/)
and the [tokenized-equity docs](https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood) defer.

| Feed     | Directory name       | On-chain `description()` | Proxy                                        | dp  | Heartbeat | Dev  | Market hours     |
| -------- | -------------------- | ------------------------ | -------------------------------------------- | --- | --------- | ---- | ---------------- |
| ETH/USD  | ETH / USD            | `ETH / USD`              | `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` | 8   | 86400 s   | 0.5% | Crypto 24/7      |
| NVDA/USD | Robinhood NVDA / USD | `RHNVDA / USD`           | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` | 8   | 86400 s   | 0.5% | us_equities_24/5 |

- **No separate WETH/USD feed exists** — only ETH/USD (assetName "Ethereum"). Canonical WETH
  (`0x0Bd7…AD73`) is 1:1 wrapped native ETH, so ETH/USD prices one WETH directly; **no multiplier** applies.
- The NVDA feed's **directory display name** ("Robinhood NVDA / USD") differs from its **on-chain
  `description()`** ("RHNVDA / USD"). The implementation pins the on-chain string — **verified correct**.
- **Code-vs-config: MATCH.** Every production-facing feed address, on-chain description, and decimals in
  TASK 10K-6 (Solidity config + guard, deploy template, TS preflight, runbook, evidence) equals the
  officially resolved and live-verified value. **No placeholder / zero / test-only / inferred / wrong-feed /
  identity-mismatch value was found in any production path; no address/description/decimals fix was needed.**

## P0 — Live pinned observations

Pinned block **19761208**, hash `0x71d860751bfd22692441a8e3d53603a4738f0d5fe7f700c3e9a4d6ee40cf2d08`,
timestamp `1785057923` (**2026-07-26T09:25:23Z**), chainId **4663**. Provider: **primary private Robinhood
Chain relay** (authenticated; URL redacted). The **primary endpoint served block-tagged state** at the
pinned block — no fallback was required. Max feed age = 900 s.

**ETH/USD** `0x78F3…d3A9` — code 9571 B, codeHash `0xbd6f52…66c2`, `description()` "ETH / USD", `decimals`
8, `version` 6, aggregator `0x6091E6…2721`. `latestRoundData`: answer `188500086357` ($1885.00), updatedAt
`1785041100`, round complete, answer > 0. Age **16823 s → STALE under 900 s** (crypto 24/7, within its
86400 s heartbeat; `ETH_USD_FEED_STALE`).

**NVDA/USD** `0x379E…9F15` — code 9571 B, codeHash `0xbd6f52…66c2` (same EACAggregatorProxy bytecode),
`description()` "RHNVDA / USD", `decimals` 8, `version` 6, aggregator `0xC9d16E…C2a2`. `latestRoundData`:
answer `20637470000` ($206.37), updatedAt `1784923036`, round complete, answer > 0. Age **134887 s → STALE
under 900 s** (`NVDA_FEED_STALE_MARKET_CLOSED`; us_equities_24/5, observed Sunday — expected off-hours).

**Canonical WETH** `0x0Bd7…AD73` — code 2202 B, codeHash `0x5706be…5353`, symbol "WETH", decimals 18. One
WETH = one native ETH for pricing; no multiplier.

**NVIDIA Stock Token** `0xd060…9EEC` — code 283 B, codeHash `0x6c1fdd…5630`, symbol "NVDA", decimals 18,
`oraclePaused()` **false**, `uiMultiplier()` `1e18`, `newUIMultiplier()` `1e18`, `effectiveAt()` `0`. The
Chainlink feed already represents the multiplier-adjusted Total Return Value, so the guard **must not**
re-apply `uiMultiplier` — and does not.

**Router** — registry `0x71a1…687E` (code 4968 B); `ownerOf(2)` = `0xC94135b63772b91D79d0A2DaAb2a8801f32359bD`
(feature 2 active/unpaused); router code 24232 B, codeHash `0xa7041268…27611` (**matches pin**). Selector
`0x77963966` is approvable only paired with this code hash.

## Sequencer feed

**No official Chainlink L2 Sequencer Uptime Feed is published for Robinhood Chain** (none among the 56
directory feeds). The approved **strict dual-feed freshness (900 s)** mitigation is retained. Robinhood's
WebSocket "Sequencer Feed" RPC endpoint is **not** a Chainlink on-chain sequencer uptime feed and is not
used. No address was invented and no other chain's sequencer feed was used. This absence does **not** block
the price guard.

## Safe infrastructure — `CANONICAL_SAFE_STACK_AVAILABLE`

The full Safe **v1.4.1** stack is explicitly listed for chain 4663 in the official `safe-deployments`
manifests, and each component's **live runtime code hash equals the manifest code hash**:

| Component                    | Address                                      | Live code | Hash matches manifest |
| ---------------------------- | -------------------------------------------- | --------- | --------------------- |
| SafeL2 singleton             | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` | 24421 B   | ✅                    |
| Safe singleton               | `0x41675C099F32341bf84BFc5382aF534df5C7461a` | 23579 B   | ✅                    |
| SafeProxyFactory             | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` | 3054 B    | ✅                    |
| CompatibilityFallbackHandler | `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99` | 5637 B    | ✅                    |
| MultiSend                    | `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526` | 629 B     | ✅                    |
| MultiSendCallOnly            | `0x9641d764fc13c8B624c04430C7356C1C7C8102e2` | 410 B     | ✅                    |

(Safe v1.3.0 canonical addresses also carry matching live code but are not chain-listed; v1.4.1 is
chain-listed and recommended for the L2.) A sanitized, non-broadcast Safe creation packet — owners and
threshold left as explicit unresolved founder inputs — is at
[`SAFE_CONTROLLER_SETUP.md`](../../packages/contracts/deploy/SAFE_CONTROLLER_SETUP.md). **No Safe was
deployed.**

## Real read-only production preflight — `NETWORKED READ-ONLY PREFLIGHT`

`node packages/rialto/dist/canary-preflight-cli.js` (missing-controller mode, live primary RPC) →
**`CANARY_NOT_READY`** (exit 1). Failing checks: `eth-usd-feed-fresh`, `nvda-usd-feed-fresh`, `controller`.
Flags: `ETH_USD_FEED_STALE`, `NVDA_FEED_STALE_MARKET_CLOSED`, `CONTROLLER_REQUIRED`. **Every
controller-independent live check passed** (chain id, selector, registry code, router owner + code-hash +
pairing, WETH/NVDA symbols + decimals, both feed identities + decimals + descriptions + positive answer +
complete round, NVDA oracle not paused, sequencer policy, cap, feed-age policy, execution-locked,
QEX-1 consumed). The missing controller did **not** skip any live check, and the CLI never invented a
controller. No RPC endpoint appeared in any output.

## Configuration audit (all confirmed)

Production feed addresses verified; descriptions/decimals match live; the test-only `expectedRouterCodeHash`
override is unreachable from the production CLI/env; the CLI cannot read keys/mnemonics, sign, construct, or
broadcast; missing controller is one explicit `CONTROLLER_REQUIRED` failure that does not skip live checks;
router code-hash uses the real runtime hash; selector `0x77963966` is paired only with the approved code
hash; the price guard runs before approval and a guard failure leaves allowance zero and the nonce
unconsumed; deployments start paused and unpausing requires the controller; no automatic broadcast, no
arbitrary-call/approval/delegatecall path; raw calldata and quote IDs are absent from events and evidence;
RPC URLs are redacted from all error output.

## Decision states

- **D-5** exact temporary allowance enforced; activation approval remains.
- **D-6** router/selector/code-hash envelope implemented and live-verified; final deployed-contract
  controller + formal activation remain (the Safe v1.4.1 stack is now confirmed available on 4663).
- **D-8** candidate config unchanged: 50-bps default quote slippage, 100-bps max quote slippage, 100-bps
  oracle deviation, 0.001-WETH canary cap.
- **D-21** replay + allowance mitigations implemented and tested.
- **D-22B ENGINEERING-COMPLETE** — official feed identities, addresses, decimals, on-chain descriptions and
  live behavior all match the implementation. Current staleness is runtime availability, not an unresolved
  price-source design.
- **D-3 / D-23** external security review and counsel remain.
- **D-24 UNCHANGED** — prohibits deployment/execution; a new bounded authorization is required first.
- **D-17** untouched. **QEX-1** consumed. The supplied RPC access **eliminates "no RPC configured"** as a
  blocker.

## Remaining external inputs

Final Safe owners + threshold (or another audited deployed-contract controller); independent security
review; counsel; explicit deployment authorization; explicit execution authorization replacing D-24.
