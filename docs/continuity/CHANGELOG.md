# BPS Protocol — Continuity Changelog (append-only)

> **Append-only.** Never rewrite or delete earlier entries. Add a new dated entry at the TOP for every
> material project-state change (source/config change, dependency upgrade, deployment or live transaction,
> changed addresses/hashes/nonces/balances/roles/allowances, new test results, new artifacts,
> infrastructure change, legal/compliance change, product/economic decision, discovered bug or security
> finding, completed milestone, or changed blockers/next actions). Never record secrets or credential-bearing
> URLs here. This file complements the fuller narrative in `HANDOVER.md` "Historical change log".

## 2026-07-26 — TASK 10K-9: executor activation gate review + external review packet

- **Type:** Documentation/review only — repository inspection, read-only verification, test/rehearsal
  execution, sanitized documentation, one documentation-only commit. **NO mainnet or Safe transaction, NO
  deployment, NO funding, NO approval/transfer, NO ownership action (transferOwnership/acceptOwnership), NO
  swap/settlement/canary, NO external communication.** No private key/mnemonic/RPC/API secret read or
  exposed. **Claude's own review is explicitly NOT an independent audit.** D-24 not weakened/replaced/
  reinterpreted. Start HEAD b4d7eb3 (10K-8).
- **Frozen executor candidate:** commit 5181f1b (unchanged; tree clean). Source SHA-256:
  GuardedSettlementExecutor.sol 14d8e7ed3f5bbe66d9856e8c61c10d1cbefdbd26e2196b71755c5631b750fe2f;
  ChainlinkSettlementPriceGuard.sol 92b774c31cdc34ec017f8b5c7b1840dee5f20a83ae3f3d87580046c41543c670; plus
  interfaces + GuardedSettlementConfig.sol + DeployGuardedSettlement.s.sol (all hashes in the evidence JSON).
  solc 0.8.26, optimizer 200, evm_version NOT pinned (KL-1), OZ 5.6.1, forge-std 1.9.7 (test-only).
- **Verification (from clean checkout):** forge test --offline 513/513 (51 suites, incl. fuzz + invariants);
  rialto vitest 252/252; typecheck/lint/build clean; forge fmt + prettier clean; deployment rehearsal green.
  One documented skip: `cast run` full-tx fork replay (Arbitrum-Nitro encoding, KL-2) — substituted with
  read-only JSON-RPC. Safe read-only re-check: 0x62Ae5b22...5E62 v1.4.1, 3 approved owners, threshold 2,
  nonce 0, singleton/fallback match, no modules, no guard, native/WETH/NVDA balances zero, runtime 171 B hash
  0xd7d408...fb4c — verified CANDIDATE controller, not active.
- **Packet produced:** docs/audit/BPS_EXECUTOR_ACTIVATION_READINESS_2026-07-26.{md,evidence.json} — scope,
  frozen identifiers, build/test evidence, 20-row threat/control matrix, deployment/ownership design,
  external-integration trust, known limitations KL-1..KL-5, unresolved decisions UD-1..UD-10, exact evidence
  still needed from auditor/counsel/founder, and NOT-AUTHORIZED deployment + canary checklists.
- **Gate status (authoritative Rialto decision pack D-1..D-24; every row PROPOSED; ballot never returned):**
  repo D-3 = server-env key-scope policy ('never'), honored, NOT an audit gate — flagged the task's 'D-3 =
  independent review' framing as a naming divergence; the real independent-audit gate is B-1. B-1 OPEN (no
  audit performed). D-23 COUNSEL-PENDING (B-2 unresolved; no counsel opinion). D-24 FULLY IN FORCE (requires
  D-1..D-23 approved + selector pinned + audit B-1 + legal B-2 + fresh independently-reviewed authorization).
  D-22 unresolved; D-8/D-16/D-17/D-18/D-20 deferred; D-9/D-10 verified-live-but-unratified; no funded deployer.
  QEX-1 consumed.
- Status EXECUTOR_EXTERNAL_REVIEW_PACKET_READY — activation prohibited; Safe remains a candidate controller.
  Commit `ops(executor): prepare activation gate packet` (evidence + continuity only; no code change).

## 2026-07-26 — TASK 10K-8: deploy the canonical 2-of-3 Safe controller only

- **Type:** One founder-signed on-chain Safe creation + Claude read-only verification + sanitized evidence +
  continuity. **Claude did NOT sign, broadcast, fund, retry, approve, deploy the executor, transfer control,
  swap, settle, or run a canary.** No private key or mnemonic read; no authenticated RPC URL exposed
  (verification via the public official endpoint). In the prior turn Claude produced the complete unsigned
  packet (`UNSIGNED_SAFE_CREATION_READY`) because this headless environment has no interactive signer; the
  founder then signed/broadcast the single authorized transaction through Owner 1's Rabby wallet. Start HEAD
  be682e8 (10K-7).
- **Deployed Safe:** `0x62Ae5b22Dd28Ee338E5A447ed849f9C7008A5E62` — Gnosis Safe v1.4.1 SafeL2, 2-of-3. Owners
  `0x7116F2998e625651D310E97919a1c638a7F82ba2`, `0x006024ff3b9b707ad0779eD3586546440fAAC49f`,
  `0xd5Bb1534Efc88400f34A832D85D0939c0e2F1759`; threshold 2; nonce 0; master copy = SafeL2 singleton
  `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`; proxy factory `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`;
  fallback handler `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99`; **no modules, no guard**; native/WETH/NVDA
  balances all zero; runtime 171 B hash `0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c`;
  salt nonce `0x87893661a8fb3d315b0be111a0c6d3512fb3b901318f9b5b97f85ca9452c8cf9`.
- **Deploy tx:** `0x09a4b2c179da9b1ab2abfc0c2b8067a07fe5850f026d8f8aa89af4d5451ccbb0`, block 19831992 (hash
  `0x304d994ffc9a9a853371d9349984258305c9654dd8b2b325c357a5ca721e77b2`, 2026-07-26T11:23:46Z), receipt status
  1, chainId 4663, sender Owner 1, to the canonical proxy factory, value 0, gas used 306172
  (0.00001661289272 ETH), exactly one `ProxyCreation` (proxy = Safe, singleton = SafeL2).
- **Independent read-only verification: 29/29 checks pass** — receipt/chain/block/timestamp; sender=Owner 1;
  destination=factory; value 0; gas + native cost; single ProxyCreation with correct proxy+singleton; Safe
  VERSION 1.4.1; getOwners = exactly the three approved owners; getThreshold 2; nonce 0; slot-0 master copy =
  SafeL2; fallback-handler slot correct; guard slot zero; getModulesPaginated empty; native/WETH/NVDA
  balances zero; runtime length 171 + hash match; no token Transfer/Approval logs; only factory ProxyCreation
  - Safe SafeSetup creation logs; no executor/controller-transfer/swap/settlement/canary. (The verify script
    printed owners 2/3 in EIP-1191 casing due to `Array.map(getAddress)` passing the index as chainId; the
    addresses are byte-identical to the canonical EIP-55 owners recorded above.)
- **Controller status:** recorded as the **verified candidate contract controller**; **NOT activated** — no
  `GuardedSettlementExecutor` is deployed, so the Safe owns/controls nothing. Continuity `safeController`
  block added.
- **Governance:** the one-time Safe-creation authorization is **CONSUMED**; **D-24 remains fully effective**
  for the executor, settlement, and canary. D-6 controller now exists (candidate); activation still gated on
  D-3/D-23 (audit/counsel) + a new bounded authorization replacing D-24. Register row D-019 added.
- Evidence `docs/audit/BPS_SAFE_CONTROLLER_DEPLOYMENT_2026-07-26.{md,evidence.json}`. Commit `ops(safe):
record canonical controller deployment` (evidence + continuity only; no code change). Status
  SAFE_DEPLOYED_AND_VERIFIED.

## 2026-07-26 — TASK 10K-7: close the live oracle, Safe, and preflight evidence gaps

- **Type:** Read-only live-chain verification + TS preflight hardening + evidence + continuity. NO Rialto
  request, NO API key read, NO private key/mnemonic read, NO signing/funding/approval/deployment/broadcast,
  NO mainnet state change — read-only JSON-RPC only. Authenticated RPC endpoints were used only via ephemeral
  process env and were NEVER written to the repository, evidence, docs, or this changelog. QEX-1 remains
  consumed. Start HEAD 5181f1b (10K-6).
- **Feed resolution (official directory):** Chainlink reference-data directory `feeds-robinhood-mainnet.json`
  (56 feeds) resolved ETH/USD `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` (8dp, heartbeat 86400s, 0.5% dev,
  crypto 24/7) and NVDA/USD `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` (8dp, us_equities_24/5; directory
  name 'Robinhood NVDA / USD'). Sources: docs.robinhood.com/chain/oracles-and-price-feeds,
  docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood,
  docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood.
- **Live pinned observation:** block 19761208, hash 0x71d860...cf2d08, ts 1785057923 (2026-07-26T09:25:23Z),
  chain 4663, primary private relay served block-tagged state (no fallback). ETH/USD on-chain description
  'ETH / USD', 8dp, version 6, answer 188500086357 (~$1885), age 16823s (STALE<900s). NVDA/USD on-chain
  description **'RHNVDA / USD'** (NOT the directory label), 8dp, version 6, answer 20637470000 (~$206.37),
  age 134887s (STALE<900s, market-closed). WETH 0x0Bd7...AD73 symbol 'WETH' 18dp. NVDA token 0xd060...9EEC
  symbol 'NVDA' 18dp, oraclePaused=false, uiMultiplier=newUIMultiplier=1e18, effectiveAt=0. Router ownerOf(2)
  =0xC94135b6...359bD, code hash 0xa7041268...27611 (matches pin).
- **Config-vs-live: MATCH.** Every production-facing feed/token/router identity, on-chain description, and
  decimals already equaled the officially resolved + live-verified value. No placeholder/zero/test-only/
  inferred/wrong-feed/identity-mismatch value in a production path; NO address/description/decimals fix was
  required (the 10K-6 'RHNVDA / USD' pin was correct; the directory display name simply differs).
- **Sequencer:** NO official Chainlink L2 Sequencer Uptime Feed for Robinhood Chain (none among 56 feeds).
  Strict dual-feed 900s freshness retained; Robinhood's WebSocket 'Sequencer Feed' RPC is not a Chainlink
  on-chain feed and is not used. Absence does not block the guard.
- **Preflight hardening** (packages/rialto/src/canary-preflight.ts + canary-preflight-cli.ts): missing
  controller reported as one CONTROLLER_REQUIRED failure while all controller-independent live checks still
  run (never invents a controller); stale classifications NVDA_FEED_STALE_MARKET_CLOSED / ETH_USD_FEED_STALE;
  token-symbol + selector/code-hash-pairing checks; and full RPC-URL redaction (redactRpc) so no endpoint URL
  can leak through any error/log/report. Controller type is now Hex|null.
- **Real read-only preflight** (NETWORKED READ-ONLY PREFLIGHT, missing-controller mode) = CANARY_NOT_READY;
  failed eth-usd-feed-fresh, nvda-usd-feed-fresh, controller; flags ETH_USD_FEED_STALE,
  NVDA_FEED_STALE_MARKET_CLOSED, CONTROLLER_REQUIRED; every controller-independent check passed; no RPC leak.
- **Safe investigation** (safe-deployments manifests + live eth_getCode): CANONICAL_SAFE_STACK_AVAILABLE —
  Safe v1.4.1 SafeL2 0x29fcB4...C762, ProxyFactory 0x4e1DCf...ec67, FallbackHandler 0xfd0732...Ec99, MultiSend
  0x38869b...B526, MultiSendCallOnly 0x9641d7...02e2 all listed for 4663 with live code hashes matching the
  official manifest. Sanitized non-broadcast creation packet added (deploy/SAFE_CONTROLLER_SETUP.md; owners/
  threshold unresolved). No Safe deployed.
- **Tests:** Foundry unchanged (513/513, no Solidity change). Rialto vitest 252/252 (canary-preflight core
  +7: CONTROLLER_REQUIRED, stale-classification flags, symbol/pairing, live-identity regression pin;
  canary-preflight-cli +redactRpc + missing-controller + endpoint-redaction). typecheck/lint/build clean;
  forge fmt + prettier clean; secret scan + RPC-hostname scan of tracked and generated files clean.
- **Decision states:** D-22B ENGINEERING-COMPLETE (identities/addresses/decimals/descriptions/live behavior
  match); RPC 'not configured' blocker eliminated; D-5/D-8/D-21 unchanged; D-6 only final controller +
  activation remain (Safe stack confirmed available); D-3/D-23 counsel/audit-pending; D-24 stands; D-17
  untouched; QEX-1 consumed. Register row D-018 added.
- Two independent conclusions: technical build = CANARY_BUILD_READY_EXECUTION_LOCKED; live runtime =
  CANARY_NOT_READY. Evidence docs/audit/BPS_RIALTO_LIVE_ORACLE_2026-07-26.{md,evidence.json}. Commit
  `fix(settlement): verify live oracle and canary preflight`.

## 2026-07-26 — TASK 10K-6: final canary-ready build (Chainlink price guard, controller gate, rehearsal)

- **Type:** Solidity (price guard + executor gate) + broadcast-free deploy tooling + tracked forge-std
  bootstrap + read-only TS canary preflight + runbook + evidence + continuity. NO Rialto request, NO API
  key read, NO signing/funding/approval/simulation/deployment/broadcast. All Foundry offline (no fork/RPC).
  QEX-1 remains consumed. **Reconciliation note:** the prior CURRENT_STATE recorded head `164bec0` with
  10K-5 "uncommitted"; actual HEAD at the start of this task was `fc896f7` (10K-5 committed). Corrected here.
- **Price guard:** added `packages/contracts/src/ChainlinkSettlementPriceGuard.sol` (+ interfaces
  `AggregatorV3Interface.sol`, `IStockTokenOracleState.sol`), replacing the placeholder. Dual-feed over the
  verified Robinhood Chain Chainlink proxies (ETH/USD `0x78F3…d3A9` "ETH / USD" 8dp; NVDA/USD `0x379E…9F15`
  "RHNVDA / USD" 8dp). Reverts unless `minBuyAmount` ≥ Chainlink fair output reduced by ≤100 bps; fails
  closed on wrong chain/pair, zero amount, feed decimals/identity change, non-positive answer, zero/future
  timestamp, incomplete round, stale feed (ceiling 900 s), globally paused stock oracle, and (if configured)
  sequencer down/grace. NVDA feed is multiplier-adjusted Total Return Value/USD — `uiMultiplier` NOT
  re-applied. No official sequencer feed published → strict 15-min dual-feed freshness.
- **Executor gate:** `GuardedSettlementExecutor.unpause()` now reverts `ConfigIncomplete` unless the price
  guard, approved code hash, approved selector, WETH cap, and WETH/NVDA pair are all set; deploys **paused**;
  `transferOwnership` is a two-step `Ownable2Step` transfer rejecting zero/dead/self (`InvalidController`).
- **Deploy tooling (broadcast-free):** `script/settlement/GuardedSettlementConfig.sol` (pinned identities +
  fail-closed `validate` + `deployPaused`) and `script/settlement/DeployGuardedSettlement.s.sol` (writes a
  sanitized manifest; no `vm.broadcast`, no key, no API key). Config template
  `deploy/guarded-settlement.env.example`; runbook `deploy/GUARDED_SETTLEMENT_RUNBOOK.md` (phases A/B/C).
- **Reproducible toolchain:** tracked `tool/bootstrap-forge-std.{sh,ps1}` pin forge-std v1.9.7
  (`77041d2ce690e692d6e03cc812b57d1ddaa4d505`), verify commit + version, refuse on mismatch, never
  overwrite. Both parse-checked (`bash -n` / PowerShell parser).
- **Read-only TS preflight:** `packages/rialto/src/canary-preflight.ts` (pure DI core) +
  `canary-preflight-cli.ts` (viem read-only client; **refuses to run if any key/secret env is present**;
  emits `CANARY_BUILD_READY_EXECUTION_LOCKED`/`CANARY_NOT_READY`). Exported via `@bps/rialto/server`.
- **Tests:** Foundry `forge test --offline` **513 pass / 0 fail** (new: price guard 26, deploy/rehearsal 9;
  executor 60 incl. config-gate + two-step transfer). Rialto vitest **245 pass** (new: canary-preflight core
  15 fail-closed cases + happy + report + network tripwire; CLI secret-abort + missing-RPC + green/failing
  exit codes + tripwire). `npm run typecheck/lint/build` clean; `forge fmt --check` + `prettier --check .`
  clean; secret scan + broadcast-path scan of changed files clean.
- **Rehearsal receipt (sanitized):** `test/GuardedSettlementDeploy.t.sol::test_rehearsal_fullLifecycle`
  (mock code etched at pinned addresses) proves paused-by-default, config-gate unpause, fresh-feed
  0.001 WETH→NVDA settlement returning the exact oracle-floor NVDA delta, stale-feed failure leaving zero
  allowance + unconsumed digest + unused nonce, and two-step controller transfer.
- **Controller/Safe check:** NOT performed — no controller address supplied and no read-only RPC configured;
  `eth_getCode` on the controller is enforced at run time by the deploy preflight (`validate`) and the TS
  preflight. No Safe deployed.
- **Governance:** closes no decision. **D-22B** guard is now real but the trusted production source is still
  a separate decision; **D-6** Safe/controller open; **D-8** cap ≤ 0.001 WETH enforced but production cap
  unapproved; **D-5/D-21** enforced, deployment-review pending; **D-3/D-23** counsel-pending; **D-24 stands
  and is expired** — a new bounded authorization is required before any live step. Register row **D-017**
  added; ballot **D-17 unchanged**. Evidence `docs/audit/BPS_RIALTO_CANARY_BUILD_2026-07-26.{md,evidence.json}`.
- Status `CANARY_BUILD_READY_EXECUTION_LOCKED`; UNDEPLOYED. Commit `feat(settlement): add chainlink price
guard and canary preflight`.

## 2026-07-26 — TASK 10K-5: remove the Rialto-ABI blocker via opaque-call validation

- **Type:** Solidity refactor + read-only on-chain investigation + TS quote boundary + docs. NO Rialto
  request, NO API key read, NO signing/funding/approval/simulation/deployment/broadcast. Read-only PUBLIC
  Robinhood Chain RPC used for investigation only. QEX-1 remains consumed. Commit `164bec0` (10K-4)
  preserved.
- **Design:** the executor now treats Rialto's returned calldata as an OPAQUE, quote-bound payload (per
  Rialto's "submit tx.to/tx.data/tx.value unmodified" docs). Removed the per-selector ABI-decoding
  calldata validator (deleted `ISettlementCalldataValidator.sol` + `MockGuardedCalldataValidator.sol`) and
  the evidence-only hard-block. Added `setApprovedRouterCode(codeHash, selector)`: at settlement the
  executor requires `router.codehash == approvedRouterCodeHash` and the calldata's leading selector ==
  `approvedSelector`, then low-level-calls the UNMODIFIED calldata. Safety is the envelope (registry lock +
  approved code hash + exact WETH allowance + own-balance NVDA min-delta + allowance reset + digest/nonce
  replay + atomic revert), not payload comprehension. `0x77963966` is approvable ONLY paired with the
  observed code hash; a router rotation/upgrade changes the code hash and halts settlement.
- **On-chain evidence (block 19674173):** router `0xc94135b63772b91d79d0a2daab2a8801f32359bd` runtime code
  hash `0xa7041268d6f20802f420b5c71e84a991dc797f27cb474265598b89e43ef27611` (24,232 bytes; stable at the
  example-tx block), **direct implementation** (no EIP-1967 slots; creation tx `to: null`),
  `registry.ownerOf(2)`==router, selector `0x77963966` in the dispatcher, router = target + allowance
  spender, and (older selector `0x8fb4309b`) delivering NVDA to the original taker. Full `cast run` replay
  UNAVAILABLE (Arbitrum-Nitro block/tx encoding vs foundry 1.7.1); archive STATE reads used instead — not
  a blocker. Evidence: `docs/audit/BPS_RIALTO_ROUTER_OPAQUE_CALL_2026-07-26.{md,evidence.json}`.
- **TS:** added `validateOpaqueQuoteForIntent` (pure/offline; validates the fetched allowance-mode quote;
  never modifies `tx.data`; returns only the calldata hash).
- **Tests:** 55 Foundry (unit + malicious routers: output-elsewhere, no-output, overpull-allowance,
  wrong/rotated code hash; + fuzz + allowance-zero invariant) all offline; rialto vitest 219/219
  (opaque-quote boundary + digest parity unchanged). `forge fmt` + repo format:check clean.
- **Governance:** the missing ABI is no longer a technical blocker; `0x77963966` approvable only with the
  observed code hash; rotation halts; **D-6 open only for production Safe/taker approval + activation** (not
  because Rialto support is unavailable); trusted price source separate (D-22B); D-5/D-8/D-21 candidate;
  D-3/D-23 counsel-pending; **D-24 stands**; D-17 unchanged.
- Commit `feat(rialto): validate opaque settlement calldata`.

## 2026-07-25 — TASK 10K-4: Solidity GuardedSettlementExecutor + offline Foundry tests

- **Type:** Solidity contract + local Foundry tests + TS digest parity + docs. NO deployment, signing,
  funding, live approval, simulation, submission, broadcast, quote request, or API-key read. All Foundry
  testing local/offline (`forge test --offline`, no fork, no RPC). QEX-1 remains consumed. Commit
  `ac70118` (10K-3) preserved.
- **Dependency:** installed **forge-std v1.9.7** (commit `77041d2ce690e692d6e03cc812b57d1ddaa4d505`) by
  cloning the pinned tag into the gitignored `packages/contracts/lib/` (the repo's deps-on-demand
  convention; not tracked). OZ 5.6.1 via root node_modules. No other dependency added.
- **Contract:** `packages/contracts/src/GuardedSettlementExecutor.sol` (UNDEPLOYED, starts paused,
  disabled until configured). `Ownable2Step` Safe controller (rejects zero/dead/self); executor-as-taker
  - purchased-token recipient; `Pausable`; `ReentrancyGuard`; `SafeERC20`. Registry `ownerOf(2)` lock
    (never prev/next/quote/env/override); per-selector COMPLETE-calldata validator; required price guard
    (D-22B); WETH→NVDA only; per-token cap ≤ 0.01 WETH; non-payable (msg.value 0); platform fee ≤ 5 bps; no
    integrator fee; slippage ≤ 100 bps; domain-separated `keccak256(abi.encode(DigestInput))` digest with
    single-use digest+nonce marked before the external call (atomic revert restores); exact-allowance →
    verified router call → min received-delta → allowance reset to zero; sanitized events; narrow
    owner-only own-balance-only `recover`. Interfaces `IGuardedSettlementExecutor` (rewritten to the
    concrete surface), `ISettlementPriceGuard`, `ISettlementCalldataValidator`.
- **Selector proof:** `0x77963966` is **NOT authoritatively proven** (no repo-owned/vendored Rialto router
  ABI proves its signature/layout). It is **hard-blocked on-chain** (`EvidenceOnlySelectorDisabled`) and
  stays disabled — recorded as the first canary blocker.
- **Tests:** 50 Foundry tests (constructor/config, starts-paused, controller-only, registry lock incl.
  paused/zero/mismatch/previous-router, selector+validator, token/amount/fee/value, price guard,
  min-delta, fee-on-transfer fail-safe, allowance-clear failure, deadline/replay/digest, reentrancy,
  emergency pause, sanitized events, recovery, fuzz, and a stateful invariant — router allowance always
  zero across 128,000 handler calls). `forge fmt` clean; executor runtime ~9.05 KB.
- **TS parity:** added `computeOnchainIntentDigest` (viem) to `packages/rialto/src/guarded-settlement.ts`;
  a shared cross-language vector proves TS and Solidity compute the same digest
  (`0x99edf1c9…8c06`) — asserted in `guarded-settlement.test.ts` and `test_digestParityVector`. rialto
  vitest **202/202**; typecheck/lint clean.
- **Governance (candidates only; nothing closed):** D-5 exact-allowance implemented locally
  (approval/deployment-pending); D-6 executor-as-taker implemented, OPEN (selector proof, Safe, dated
  registry strategy); D-8 0.01/100-bps candidate (no production authorization); D-21 replay+allowance
  implemented/tested (deployment-review pending); D-22B price-guard with mocks (trusted source
  unresolved); D-3/D-23 counsel-pending; **D-24 stands**; D-17 unchanged.
- Commit `feat(rialto): implement guarded settlement executor`.

## 2026-07-25 — TASK 10K-3: guarded-settlement core (production-shaped, deliberately DISABLED)

- **Type:** offline code + tests + concise docs. NO Rialto request, API key use/read, RPC/website/
  registry/external API, network client, signing/funding/approval/simulation/deployment/submission/
  broadcast, enabled execution path, QEX-1 re-enable, or push/PR. Zero network requests (network tripwire
  in every test). Continuity gate followed; commit `46c9855` (10K-2) preserved.
- **Core:** `packages/rialto/src/guarded-settlement.ts` — pure, deterministic, integer-safe (bigint;
  floor deviation rounding), no import-time side effects, DI for registry/price/replay/clock. Typed
  `SettlementPolicy`, domain-separated `computeIntentDigest`, and `evaluateGuardedSettlement` with
  registry/selector/taker/token/amount/fee/value/price(D-22B)/replay+expiry guards and a full non-generic
  `GuardStatus` set. Returns a sanitized immutable settlement plan (reverify → exact-approve → verified
  router call → min-return → clear allowance → consume → record) ONLY as `READY_OFFLINE_ONLY`, which is
  never execution authorization. Deliberately disabled: empty production selector list, unresolved
  taker/caps/ages/price source ⇒ fail closed.
- **Replay demo:** `replayQex1Evidence` shows the sanitized QEX-1 evidence is NOT production-ready
  (SELECTOR_UNAPPROVED, TAKER_UNRESOLVED, AMOUNT_LIMIT_UNRESOLVED, PRICE_SOURCE_UNRESOLVED,
  REGISTRY_OBSERVATION_STALE, …) and lists the remaining gates. No calldata/credentials printed.
- **Solidity:** DEFERRED — `forge-std` is not vendored (`packages/contracts/lib/` gitignored/absent) so
  the Foundry test runner cannot run offline and installing it needs a forbidden network download. Added
  the contract-ready interface `packages/contracts/src/interfaces/IGuardedSettlementExecutor.sol` mirroring
  the TS invariants. Missing prerequisite: vendored forge-std + confirmed offline `forge build`/`forge test`.
- **Governance (candidates only; nothing closed):** D-5 candidate exact-allowance (approval required);
  D-6 open (selector/taker/dated-registry unresolved); D-8 candidate 50/100 bps (approval-pending); D-21
  replay+exact-allowance offline (executor verification open); D-22B price interface+offline enforcement
  (trusted source unresolved); D-3 counsel-pending; D-23 counsel-pending; **D-24 stands**; D-17 unchanged.
  QEX-1 remains CONSUMED.
- **Verification:** OFFLINE only — `@bps/rialto` typecheck + build + eslint clean, vitest **201/201**;
  format:check + JSON validation clean; no `rialto_live_` key body in tracked files. Commit
  `feat(rialto): add guarded settlement core`.

## 2026-07-25 — TASK 10K-2: record QEX-1 quote evidence + offline structural replay

- **Type:** offline evidence recording + validation only. NO Rialto request, NO API key use/read, NO
  RPC/website/external API, NO network client, NO signing/simulation/approval/funding/deploy/submit/
  broadcast, NO transaction-execution path, NO change to any production approval or acquisition boundary,
  NO push/PR. Zero network requests (tests carry a network tripwire). Continuity gate followed. Commit
  `851a816` (10K-1A) preserved (not amended).
- **QEX-1:** CONSUMED / COMPLETE — exactly one authenticated GET /quote on 2026-07-25; no retry or
  additional quote authorized.
- **Evidence artifact:** `docs/audit/BPS_RIALTO_QEX1_QUOTE_EVIDENCE_2026-07-25.{md,evidence.json}`
  (flat `docs/audit/BPS_RIALTO_*` convention; no `docs/audit/rialto/` subtree). Records the sanitized
  quote response (raw sell/buy/min-buy, settlement `allowance`, platform fee 5 bps, tx.to
  `0xc94135b63772b91d79d0a2daab2a8801f32359bd`, selector `0x77963966`, calldata byte length 804, tx.value
  0, one all-null route leg, SHA-256 of quote_id only), the original structural result
  (`ROUTER_UNRESOLVED`, preserved unchanged), a SEPARATE read-only UNDATED registry observation, the
  derived offline replay, governance limitations, and fields omitted for security.
- **Offline evaluator:** `packages/rialto/src/registry-structural.ts` assesses the registry observation
  SEPARATELY from selector approval; fails closed on malformed addr/selector, zero current router, paused
  feature, target != current, previous/next-only match, missing fields, wrong chain. Derived result for
  this evidence: router reconciled against the undated snapshot only -> `SELECTOR_UNAPPROVED`; selector
  evidence-only (not approved/pinned); production structural approval false; D-6 open. One observed
  selector cannot self-approve or close D-6.
- **QEX-1 retired:** the live CLI now stops with `QEX1_CONSUMED` before any env read or network call; no
  environment variable bypasses the guard; the reviewed quote client is not deleted; a future live quote
  needs a separately reviewed source change + new founder authorization.
- **Governance (unchanged by this evidence):** D-2 read-only preference preserved; D-3 counsel-pending;
  D-5 open (`allowance` was evaluation input only); D-6 open (selector/final taker/production pinning
  unresolved); D-8 open (50 bps was a test value); D-21 open; D-22B open; D-23 counsel-pending; D-24
  stands; ballot D-17 untouched.
- **Verification:** OFFLINE only — `@bps/rialto` typecheck + build + eslint clean, vitest **150/150**;
  format:check + JSON validation clean; no `rialto_live_` key body in tracked files. Commit
  `chore(rialto): record QEX-1 quote evidence`.

## 2026-07-25 — TASK 10K-1A: correct quote-eval units, official origin, and governance

- **Type:** corrective code + documentation. NO live GET /quote, NO credential used, NO acquisition,
  execution, signing, funding, allowance, Permit2 signature, or submission. The TASK 10K-1 commit
  (`1d580e3`) is preserved (not amended/reset). Continuity gate followed.
- **Units:** `GET /quote` `sell_amount` is a HUMAN-DECIMAL token amount, not raw base units. Runtime input
  renamed to `RIALTO_SELL_AMOUNT_DECIMAL` (validated positive decimal, <=18 fractional digits); the
  request transmits the decimal (e.g. `0.01`), and the returned RAW sell amount is validated against the
  decimal converted at WETH's 18 decimals. **D-7 records no exact usable quantity** ("minimum
  venue-accepted amount" only) so NO default amount was invented — the operator must supply one.
- **Origin:** official origin `https://rialto-trade-api.rialto.xyz` enforced; any other
  protocol/host/credentials/port/path/fragment/query fails closed (BAD_ORIGIN) before any network I/O.
- **Report:** expanded sanitized report — chain id, tokens, requested decimal, returned raw sell/buy/
  min-buy, settlement mode, platform-fee breakdown, integrator-fee-not-requested, network-fee estimate,
  issues, route legs, tx target, selector + byte length (never full calldata), tx value, quote created/
  expiry, and a SHA-256 digest of `quote_id` (never the raw id).
- **Governance:** decision renamed **QEX-1 — Isolated Rialto Quote-Evaluation Exception** (the label
  `D-017` was ambiguous with ballot D-17, which is unchanged). **D-2's read-only preference is restored/
  preserved**, recorded as currently unavailable via Rialto's dashboard with QEX-1 as a bounded exception
  (NOT an erasure). D-3 counsel-pending; **D-5, D-6, D-8, D-21, D-22B, D-23, D-24 remain open**; the
  observed router/selector are candidates only (reconcile against official registry
  `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E`).
- **Run docs:** replaced the unsafe PowerShell example with a masked `Read-Host -AsSecureString` method
  that clears `RIALTO_API_KEY` after the process exits (HANDOVER §P).
- **Verification:** OFFLINE only — `@bps/rialto` typecheck + build + eslint clean, vitest **129/129**;
  repo format:check + JSON validation clean; no `rialto_live_` value in tracked files. Commit
  `fix(rialto): correct quote-eval units and governance`.

## 2026-07-25 — TASK 10K-1: isolated non-executing GET /quote eval harness + Quote-Evaluation Exception

- **Type:** code (test harness) + governance decision. NO live GET /quote, NO acquisition, execution,
  signing, funding, allowance, Permit2 signature, or swap submission. Continuity gate followed.
- **Governance (decision D-017):** founder issued a **Quote-Evaluation Exception** superseding ballot
  **D-2**. Rialto confirmed it issues **no** `quote:read`-only key (every key bundles `quote:read` +
  `swap:create` + `swap:integrator`), so the mandatory bundled key may be used **only** in an isolated,
  non-executing quote-evaluation environment (no signing key, funded wallet, allowance, Permit2 signature,
  or swap-submission route); it authorizes **GET /quote testing only** and does **not** authorize
  acquisition/execution (**D-24 stands**). Verbatim wording recorded in the audit decision-register
  amendment and `CURRENT_STATE.json.quoteEvaluation.exceptionVerbatim`.
- **Security:** the bundled key carries execution-capable scopes broader than D-2 requested; **D-3**
  (never a broader-scope key outside a reviewed settlement runbook) remains **COUNSEL-PENDING** and the key
  must stay isolated from any signing key / on-chain allowance. The key value pasted into the working chat
  is treated as **exposed/compromised** — revoke and reissue; store only in a secret manager (D-4).
- **Code:** new `packages/rialto/src/quote-eval-cli.ts` (exported via `@bps/rialto/server`) reuses the
  hardened `fetchRialtoAllowanceQuote` (key from `RIALTO_API_KEY`, never logged/returned; no signer,
  wallet, allowance, or submission path), runs fail-closed `validateQuoteExecution` + `classifyBoundary`,
  and prints only sanitized fields (target, selector = calldata[0:10], min-buy, expiry). New
  `quote-eval-cli.test.ts` (+18 tests). Barrel updated in `server.ts`.
- **Verification:** OFFLINE only — `@bps/rialto` typecheck + build clean, eslint clean, vitest
  **107/107**. **No live GET /quote executed** (blocked on Rialto API base URL, taker, sell amount,
  slippage, and a rotated key). Commit `feat(rialto): isolated non-executing quote-eval harness`.
- **Next:** founder rotates the exposed key + provides runtime inputs, runs the harness locally, returns
  the sanitized report; then pin the venue selector (D-6) from the observed calldata.

## 2026-07-25 — TASK 10J-3: persist oracle/feed evidence + founder decision register

- **Type:** documentation/evidence persistence only. NO oracle/contract implementation, feed/risk
  configuration, Rialto access, quote, credential, wallet action, signature, allowance, simulation,
  transaction, deployment, activation, dependency/lockfile change, push, or PR. Continuity gate
  followed; existing uncommitted continuity content preserved.
- **Discovery persisted (from TASK 10J-1 through 10J-2B, reproduced in memory this task):** official
  Chainlink feed-directory provenance PROVEN (addresses page references
  `feeds-robinhood-mainnet.json` + embeds proxies); official Robinhood asset endpoint
  `https://api.robinhood.com/rhj/assets` documented on the Stock Token API page; fixed inspection
  block 19223939 (hash `0xe94b855b7973b78c1fb6611de5f41c421a69bc80f24d6631a89925270bccdb8c`, chain
  4663).
- **Candidates (all CANDIDATE — NOT APPROVED / NOT CONFIGURED):** WETH
  `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`; ETH/USD proxy
  `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` / aggregator
  `0x6091E64eb7138EEF066a80FD3A0d7427B91f2721`; NVDA/USD proxy
  `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` / aggregator
  `0xC9d16E4f2569b9E3ea0468fD85844953713DC2a2`; NVDA token
  `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` (token `uid()` equals the endpoint asset id — canonical
  binding beyond ticker). **D-9 / D-10 = OFFICIALLY IDENTIFIED CANDIDATE — NOT APPROVED / NOT
  CONFIGURED; D-13 = UNRESOLVED — NO ROBINHOOD CHAIN ADDRESS IN CURRENT OFFICIAL CHAINLINK LIST.**
- **D-12:** strict-freshness approach founder-directed; exact maximum-staleness value deferred; the
  86400-second catalog heartbeat is evidence only, not an approved ceiling.
- **Founder register:** Group A founder-approved/ratified (D-1, D-2, D-4, D-7, D-11 conditional
  direction, D-14, D-15, D-17=USD 250, D-18=USD 250/day, D-22B architectural direction, plus access
  request = SEND MANUALLY); D-22B is direction-only (implementation NOT authorized); D-23
  counsel-pending; D-24 no acquisition authorized.
- **Process deviation disclosed:** TASK 10J-2 wrote seven non-repository response files via `curl -o`
  (its "no file occurred" line was imprecise); 10J-2A/10J-2B made no filesystem change.
- New files: `docs/audit/BPS_RIALTO_FEED_METADATA_2026-07-25.{md,evidence.json}`,
  `docs/audit/BPS_FOUNDER_DECISION_REGISTER_2026-07-25.md`. Commit
  `docs(audit): record oracle evidence and founder decisions`.

## 2026-07-25 — TASK 10I-2: oracle correction review + founder ballot (commit `535e7534`)

- **Type:** review + policy consolidation. NO quote, credential, wallet, signature, broadcast,
  allowance, selector/feed/policy/legal approval, contract/economic/deployment/dependency/lockfile
  change, push, or PR. Continuity gate followed (full 10I-1 diff reviewed from the repo; parent
  `6cb33745…`; all superseded-history hashes preserved).
- **Structural corrections to `price-guard.ts` (10I-1 review findings):** the caller could stamp
  observation `semantics`; now the POLICY pins `inputFeedIdentity` / `outputFeedIdentity` /
  `outputSemantics` and each observation must match `{feedIdentity, semantics, asset}` (else
  FEED_IDENTITY_MISMATCH / SEMANTICS_MISMATCH / ASSET_BINDING_MISMATCH; empty identity =>
  FEED_BINDING_MISSING). Added `roundId>0` (ZERO_ROUND), `updatedAt>0`, and uint256-domain bounds
  before exponentiation (AMOUNT_OUT_OF_DOMAIN). RAW_UNDERLYING reachable only via approved
  allowRawUnderlyingForEvidence + outputSemantics; never a silent fallback. Multiplier proven
  numerically inert in PER_TOKEN mode (1x..1000x sweep). rialto vitest **89/89**.
- **Enforcement boundary:** TS guard = trusted-server only; on-chain has NO price floor
  (operator-supplied minStockOut can bypass it) — surfaced as ballot D-22 (A trusted-server / B
  on-chain oracle floor / C disabled; conservative C). Neither A nor B implemented.
- **Wording fix:** removed unsupported 'NON-BINDING'; approved phrasing 'QUOTE RETRIEVAL ONLY —
  RETURNS A FIRM EXECUTABLE PAYLOAD; NO SIGNATURE OR BROADCAST OCCURS DURING RETRIEVAL'. Dated
  corrections appended to the 10I-1 semantics review + corrected-10H artifacts; superseded hashes
  preserved (10H boundary md 1e241a5f-line -> a38039a3…; boundary evidence -> 324bdaf6…; semantics
  md -> 88530e01…).
- **Ballot:** `docs/decisions/BPS_RIALTO_FOUNDER_APPROVAL_BALLOT_2026-07-25.md`
  (sha `db61b58f…`) — 24 decisions in 6 groups (A founder-now / B security-now / C awaiting
  Rialto-quote / D awaiting feed metadata / E counsel-legal / F go-no-go), each with options +
  conservative candidate + approver + missing evidence + can-approve-now, a compact single-message
  response template, and the DRAFT — NOT SENT access request. ALL PROPOSED — NOT APPROVED.
  Dependency/approver reclassifications: D-5/D-6 proposable-now-validate-on-quote, D-8 not anchored
  to docs' 50 bps, D-11 legal->price-risk/engineering, D-22 security/governance.
- **Suites:** rialto 89/89; boundary 2/2; focused Foundry 126/126; full forge (fork env) 418/418;
  npm run check PASS; scans clean; manifests/lockfile unchanged. Mainnet before/after IDENTICAL;
  fresh feature-2 re-resolution (block 19125889) identical router. Accepted canary/10F-1/10G-1/
  10H-1(semantics) hashes byte-identical. B-3 remains PARTIAL — RIALTO QUOTE ACCESS REQUIRED (+
  APPROVED PRICE AND RISK POLICY REQUIRED / VENUE SELECTOR UNVERIFIED / VENUE REPLAY SEMANTICS
  UNRESOLVED / LEGAL ELIGIBILITY UNRESOLVED / PRICE-GUARD TRUST MODEL NOT YET APPROVED).
- **Backup:** archive `bps-experiment-rialto-decision-review-2026-07-25-535e7534.tar.gz` (size/SHA
  in report; extraction-verified). Off-device: PENDING.
- **Next:** return the ballot for founder/counsel decisions; no selection implemented until then.

## 2026-07-25 — TASK 10I-1: oracle-semantics correction + decision pack (commit `6cb33745`)

- **Type:** critical correction + policy consolidation. NO quote, key operation, wallet,
  signature, broadcast, allowance, selector/feed/policy approval, deployment, mainnet mutation,
  nonce-8 use, dependency/lockfile change, push, or PR. Continuity gate followed exactly.
- **CRITICAL FIX:** official docs verified (Chainlink tokenized-equity + Robinhood oracle pages):
  Stock-Token Chainlink feeds return the PER-TOKEN USD price with uiMultiplier ALREADY included;
  REST /prices is raw-underlying. The 10H-1 guard multiplied by uiMultiplier (raw-underlying
  model) — in production configuration it would have DOUBLE-APPLIED the multiplier (a 10x split
  would loosen the price floor 10x). `price-guard.ts` rewritten: typed semantics
  (PER_TOKEN_CHAINLINK direct; RAW_UNDERLYING gated evidence-only, multiplier exactly once),
  two-feed expected-output model (WETH-USD in / NVDA-token-USD out), oraclePaused +
  pending-multiplier + L2-sequencer fail-closed machinery. 79/79 rialto tests (all 20 required
  arithmetic/corporate-action cases incl. split continuity + double-apply unrepresentability,
  independently hand-derived).
- **Enforcement boundary recorded:** TS guard = trusted-server only; on-chain has NO independent
  price check (operator-supplied minStockOut) — minimal future coordinator-level oracle floor
  documented, NOT made.
- **Rialto facts corrected:** /quote = NON-BINDING, NON-SIGNED, NON-BROADCAST QUOTE RETRIEVAL
  returning a firm executable payload + server-stored quote_id; feature 2 direct vs 3 gasless;
  allowance vs Permit2; no documented selector/ABI; replay semantics undocumented. Dated
  corrections appended to 10H artifacts; superseded hashes preserved (evidence 979f351d… ->
  63d94b7a…; report 7b0c88c6… -> ad298ebf…).
- **Decision pack:** `docs/decisions/BPS_RIALTO_ACCESS_AND_PRICE_RISK_DECISION_PACK_2026-07-25.md`
  — 24 decisions, ALL PROPOSED — NOT APPROVED, incl. drafted (NOT sent) quote:read access request.
- **Suites:** rialto 79/79; boundary 2/2; focused Foundry 126/126; full forge (fork env) 418/418;
  npm run check PASS; scans clean. Mainnet before/after IDENTICAL; fresh feature-2 re-resolution
  (block 19115535) identical router. B-3 remains PARTIAL — RIALTO QUOTE ACCESS REQUIRED (+
  APPROVED PRICE AND RISK POLICY REQUIRED / VENUE SELECTOR UNVERIFIED / VENUE REPLAY SEMANTICS
  UNRESOLVED / LEGAL ELIGIBILITY UNRESOLVED).
- **Backup:** archive `bps-experiment-oracle-semantics-2026-07-25-6cb33745.tar.gz` (size/SHA in
  report; extraction-verified). Off-device: PENDING.
- **Next:** founder/counsel decision-pack approvals + send access request; engineering resumes on
  approvals.

## 2026-07-25 — TASK 10H-2: review + checkpoint of the Rialto boundary (commit `adaddceb`)

- **Type:** review + preservation. NO wallet, secret, signature, quote, order, broadcast, trade,
  allowance change, deployment, root publication, mainnet mutation, nonce-8 use, dependency/lockfile
  change, push, or PR. Continuity gate followed (exact 5M+8?? tree reconciled; cycle 1 re-verified
  UNPUBLISHED; nonces 16 / 8/8; all accepted artifacts byte-identical).
- **Review findings:** rialto code diff confirmed to be exactly the intended 6 hardening lines;
  `docs/audit/rialto/2026-07-25/` correctly absent (no quote); no web caller of the quote client
  exists (no endpoint-injection path); cited Foundry settlement tests spot-verified substantive
  (hostile LIE_OVER + `_assertNoStateChange`; real re-entry attempt). **Corrections:** (1) 7-case
  decimal×multiplier arithmetic matrix added to `price-guard.test.ts` (18/6/8-decimal combinations,
  10x split, 0.5x reverse split, 2^200-scale inputs, conservative floor) — rialto suite now
  **76/76**; (2) trust-model clarification recorded: `nowSec`/`resolvedRouter` are injected only by
  the trusted server boundary, with on-chain adapter enforcement authoritative regardless; (3)
  re-affirmed expiry revalidation ≠ durable venue replay protection. Classification upheld:
  **`PARTIAL — RIALTO QUOTE ACCESS REQUIRED`** (price/risk policy + venue replay semantics
  independently recorded as unresolved).
- **Fresh external recheck (block 19078598):** feature-2 router identical
  (`0xc94135b63772b91d79d0a2daab2a8801f32359bd`, code hash `0xa7041268…7611`).
- **Evidence hashes:** submitted `e7bc7e6a…006e` / `2b87cde1…41df` → **final** evidence
  `979f351d9a88c8f0058628417da46a8809d4a394e4440ec42025f3dd87e8d1b8`, report
  `7b0c88c6b11a9bda072241378b5c289f62fbd64d846c43ce4b13a0dae4d75a87`.
- **Checkpoint commit:** `adaddceb09302db78e36fdb294494fe71df0e43b` —
  `feat(rialto): harden production venue boundary` (13 reviewed paths; staged list displayed and
  verified free of secrets/lockfile/production/registry changes).
- **Suites at checkpoint:** rialto 76/76; web boundary 2/2; focused Foundry 126/126; full forge
  (fork env) 418/418; `npm run check` PASS; prettier/diff-check/JSON/secret/manifest checks clean.
  Mainnet before/after IDENTICAL (zero acquisitions; publication state unchanged).
- **Backup:** new archive `bps-experiment-rialto-boundary-2026-07-25-adaddceb.tar.gz` outside the
  repo (size/SHA in task report; extraction-verified). **Off-device: PENDING.** Snapshot-pipeline
  archive status preserved as COMPLETE — USER VERIFIED 2026-07-25.
- **Next:** authorized Rialto API access + approved selector and price/risk decision pack, then
  rerun the boundary against a real read-only quote. B-1 audit not begun; B-2 legal unresolved.

## 2026-07-25 — TASK 10H-1: Rialto production boundary (B-3) — `PARTIAL — RIALTO QUOTE ACCESS REQUIRED`

- **Type:** production-boundary hardening. NO wallet, secret, signature, broadcast, trade, allowance
  change, deployment, mainnet mutation, root publication, nonce-8 use, dependency change, commit,
  push, or PR. Continuity gate followed (exact state match; cycle-1 verified UNPUBLISHED on-chain).
- **Backup:** snapshot-pipeline archive recorded **COMPLETE — USER VERIFIED 2026-07-25**
  (`bps-experiment-snapshot-pipeline-2026-07-25-9043476.tar.gz`, 149,996,786 B, SHA-256
  `5b45c966…e6d0`; user-verified destination-side evidence, not independently inspected).
- **External truth (read-only, block 19062620):** registry `0x71a120Cb…687E` live (hash matches);
  **feature 2 → router `0xc94135b63772b91d79d0a2daab2a8801f32359bd`** (24,232 B, hash
  `0xa7041268…7611`, initialized + not paused); WETH hash matches; NVDA identity verified by
  address + code hash vs the official-registry record (uiMultiplier 1e18, not halted) — labeled
  TECHNICAL VENUE VALIDATION ASSET, not a production basket.
- **Quote access:** RIALTO_API_URL/RIALTO_API_KEY unconfigured (booleans only) → no real quote, none
  fabricated → classification per instruction. **Hardening shipped (fail-closed, policy-neutral):**
  `quote-structural.ts` (live-router equality, EMPTY-default approved-selector schemas, forbidden
  multicalls, decode + canonical re-encode round-trip, role binding, expiry), `price-guard.ts`
  (integer-only independent price guard w/ uiMultiplier handling; missing policy/feed fails closed),
  `boundary-status.ts` (never-overstating consumer states; MAINNET_SETTLEMENT_CONFIRMED unproducible
  here), quote-client `redirect:"error"`. Settlement review: frozen contracts already satisfy every
  section-9 requirement — mapped to named Foundry tests; **no contract change**.
- **Suites:** rialto vitest **69/69** (39 new); web boundary 2/2; adapter/vault/coordinator Foundry
  126/126; full forge (fork env) 418/418; `npm run check` PASS; prettier/git-diff/JSON/secret scans
  clean; prior artifacts byte-identical. Mainnet before/after IDENTICAL (zero acquisitions).
- **Remaining B-3:** authorized API access; selector pinning from a real quote; approved
  price/staleness/deviation/cap policies; venue replay/nonce semantics. Legal eligibility (B-2)
  unresolved; audit (B-1) not begun; BPSC remains a canary. Changes left **uncommitted for review**.
- **Evidence:** `docs/audit/BPS_RIALTO_PRODUCTION_BOUNDARY_2026-07-25.{md,evidence.json}`.
- **Next:** authorized Rialto API access + real read-only quote rerun; audit (B-1) in parallel.

## 2026-07-25 — TASK 10G-2: review + checkpoint of the snapshot pipeline (commit `9043476`)

- **Type:** review, reproducibility hardening, preservation. NO wallet, secret, signature, broadcast,
  deployment, mainnet mutation, root publication, nonce-8 use, dependency VERSION change, push, or PR.
  Continuity gate followed (exact state match; tester nonce live 8/8; all artifact hashes exact;
  correct repository confirmed as `C:\Projects\bps-experiment` — the `bps-protocol` path was an error).
- **Review corrections:** (1) **dual-endpoint pinned-hash guard** (`LOGS_ENDPOINT_HASH_MISMATCH`) — a
  separate logs endpoint must agree on the pinned block hash, not only the chain id, before scan
  results are combined; exercised live in the reproduction runs. (2) **Dependency-metadata hardening**
  (not an upgrade): `@bps/indexer` explicitly declares `@bps/shared 0.0.0`,
  `@openzeppelin/merkle-tree 1.0.8`, `viem 2.55.8`; lockfile updated offline (`--package-lock-only
--offline`) — diff is exactly the apps/indexer dependency edge, ZERO external
  version/resolved/integrity changes.
- **Reproduction:** two fresh CLI runs byte-identical to each other AND the committed artifacts.
  Values reproduced exactly: candidates 1, included 1, total weight `523101036779224972875501`,
  distribution `230074787421624000`, entitlement total `230074787421624000`, dust 0. Root
  `0xbf4a88b5ca7b12117c8fb9df350017c6c42ba27dc16d0dfad1499536a529aebb`; canonical digest
  `0x893042b8b6c7ed1466958ce7f38964ffb6826597607431229183dd3ffef4c0c0`; proof-bundle digest
  `0xbd8a1a7184b2c519341781fecaae8abd8176df7639decf347aab3d69081d7fa3`.
- **Coverage validated:** all 31 map entries point to named tests/guards or justified INAPPLICABLE;
  `LockingVaultWeight.testWeightBoundariesUnwithdrawn` inspected — asserts bonus at unlockTime−1,
  base 1.00x at exactly unlockTime (exact expiry boundary genuinely exercised). Classification
  **`SNAPSHOT PIPELINE PASS` upheld**. Scope: INF-3 closed for deterministic block-pinned snapshot
  enumeration ONLY; persistent DB indexing = INF-1; provider (archival + wide-logs) config remains an
  operational prerequisite; NOT a continuous production indexer.
- **Evidence hashes:** superseded (pre-review) `3935c05a…9e22` / `81569855…3ef1`; **final**
  evidence `aa7aa1f709bc323eaeecf73849bbf53f6df6b3ffcddcbf0c2ea83f71623a98f8`, report
  `4b6089c653c0622db979cd328a721926ae3b07817f81a6e90f19db9c9265ba07`.
- **Checkpoint commit:** `9043476509a9c7f662c5cf580f50e5ae1e0a382d` —
  `feat(indexer): checkpoint production snapshot pipeline` (25 reviewed paths; staged list verified
  free of secrets/deps/caches/canary/production changes).
- **Suites at checkpoint:** indexer vitest 37/37; `npm run check` PASS; forge (fork env) 418/418;
  prettier clean; `git diff --check` clean; all JSON parses; secret scan clean; mainnet before/after
  IDENTICAL (16/16, 8/8, no nonce-8 tx).
- **Backup:** new archive `bps-experiment-snapshot-pipeline-2026-07-25-9043476.tar.gz` outside the
  repo (size/SHA in the task report; extraction-verified). **Off-device: PENDING.** All earlier
  archive statuses preserved unchanged.
- **Next:** production Rialto venue integration and settlement hardening (B-3) — not begun.

## 2026-07-25 — TASK 10G-1: production snapshot pipeline — `SNAPSHOT PIPELINE PASS`

- **Type:** production-hardening implementation (indexer + artifacts). NO wallet, key, signer,
  signature, broadcast, eth_sendTransaction/eth_sendRawTransaction, deployment, mainnet mutation,
  nonce-8 use, dependency change, commit, push, or PR. Read-only RPC only. Continuity gate followed.
- **Prompt-path discrepancy recorded:** the task named `C:\Projects\bps-protocol` — a different, older
  repository (HEAD `d03458ba…`, superseded doc copies). The expected branch/HEAD/tree exist uniquely in
  `C:\Projects\bps-experiment` (also the CLAUDE.md scope), where the task executed.
- **Off-device backup:** rehearsal archive `bps-experiment-rehearsal-2026-07-25-d699f7ae.tar.gz`
  (149,833,975 B, SHA-256 `6e685258…1039`) recorded **COMPLETE — USER VERIFIED 2026-07-25**
  (user-verified; destination copy not independently inspected). The earlier checkpoint archive's
  historical status remains unchanged.
- **Built (closes the two 10F-1 limitations):** `apps/indexer/src/lock-snapshot/` — fail-closed,
  deterministic, indexer-backed candidate enumeration (LockCreated scan from the vault deployment
  block) + authoritative block-pinned effective weights (`lockCount`/`positionWeightAt` via pinned
  `eth_call`) + approved floor-rule entitlements + canonical StandardMerkleTree/LEAF_ABI_TYPES leaves
  - chain-bound artifacts (canonical snapshot, proof bundle, evidence envelope, UNSIGNED publication
    payload whose content hashes are the REAL canonical digests — placeholder hashes retired) + read-only
    consumer boundary + `snapshot-cli`. All artifacts labeled `TECHNICAL CANDIDATE SNAPSHOT — LEGAL
ELIGIBILITY UNVERIFIED — NOT AUTHORIZED FOR PUBLICATION`.
- **Pinned mainnet demonstration (block 18791290, hash `0x2d332bb0…516f`):** 1 candidate discovered
  (the live tester lock), total effective weight `523101036779224972875501` (matches canary + 10F-1
  values, independently re-derived), entitlement + dust reconcile exactly, Merkle root
  `0xbf4a88b5…aebb`, **on-chain `leafFor` parity 1/1 against the deployed DistributionClaimManager**,
  **two-run byte-identical** canonical artifacts (a first-cut determinism defect — live chain head
  embedded in the canonical artifact — was caught by this check and fixed). Artifacts under
  `docs/audit/snapshots/robinhood-4663-block18791290/`.
- **Infrastructure finding (INF-2 evidence):** archival provider caps `eth_getLogs` to 10-block
  ranges; public fallback RPC has pruned historical state. Pipeline supports a split-endpoint mode
  (archival primary + wide-range logs endpoint, chain-id cross-verified).
- **Suites:** indexer vitest **37/37** (6 files incl. 19 fail-closed negatives + 5 parity + 4
  consumer); full `forge test` (fork env) **418/418**; `npm run check` PASS. 31-condition negative
  coverage map (each → named test/guard or INAPPLICABLE with reason) in the evidence manifest.
- **Statuses:** INF-3 **CLOSED** for pinned-snapshot generation (persistent-DB indexer remains
  INF-1); legal eligibility (B-2) UNRESOLVED; Rialto (B-3) UNADDRESSED; audit (B-1) not begun; NO
  root published; production readiness NOT established. Mainnet non-mutation proven (before/after
  identical; nonces 16/16, 8/8). All 10G-1 changes left **uncommitted for review**.
- **Evidence:** `docs/audit/BPS_PRODUCTION_SNAPSHOT_PIPELINE_2026-07-25.{md,evidence.json}`.
- **Next:** production Rialto venue integration and settlement hardening (B-3) — not begun.

## 2026-07-25 — TASK 10F-1 review + checkpoint (commit `d699f7ae`)

- **Type:** review, preservation and backup only. NO wallet, secret, live signature, broadcast,
  deployment, mainnet transaction, nonce-8 use, dependency change, push, or PR. Continuity gate
  followed (state matched the expected branch/HEAD/tree exactly; tester nonce live-confirmed 8/8).
- **Review findings/corrections:** all 10F-1 changes verified in scope (no production contract,
  registry, or operator change; `foundry.toml` + `.prettierignore` additions narrow; the
  `mainnet-snapshot-check.mjs` helper proven strictly read-only, never printing the RPC URL;
  `rehearsal-evidence/` holds only the 1,220-byte raw evidence JSON; canary artifacts byte-identical,
  `exec/` MANIFEST 5/5). **Corrections during review:** (a) `ForkLifecycleProbe.t.sol` classified as
  intentionally RETAINED with a recorded justification (regression guard for the NVDA storage-slot +
  transferability assumptions); (b) an explicit one-to-one **`negativeCoverageMap`** (all 21 required
  negative/boundary conditions → exact fork assertion or named unit test; none UNPROVEN) was added to
  the evidence manifest, changing its SHA-256 to
  `2557a3d782bd38b2c679902578f7bc5519b7b0e5f82f9fdea85e28a77d5cb065` (the pre-review hash `b934289c…`
  appeared only in then-uncommitted text and was corrected before any commit).
- **Evidence re-verified independently:** claim sum 230,074,787,421,623,997 + 3 dust ==
  230,074,787,421,624,000 distribution; distribution + reserve == 287,593,484,277,030,000 acquired;
  custody conservation, weights total, per-wallet floor formula, fork pin block/hash + chainId 4663 —
  all recomputed and matching across the raw JSON, report, and manifest.
- **Checkpoint commit:** `d699f7aea2d8ec7ebf47de8a9d2789791b8da92f` —
  `test(contracts): checkpoint distribution lifecycle rehearsal` (11 reviewed paths; staged list
  verified free of secrets/deps/caches/canary modifications).
- **Suites at checkpoint:** focused fork tests PASS; full `forge test` (fork env) 418/418;
  `npm run check` PASS; prettier clean; `git diff --check` clean; all JSON parses.
- **Backup:** prior checkpoint archive status preserved as **COMPLETE — USER VERIFIED 2026-07-25**
  (historical; not overwritten). NEW dated recovery archive
  `bps-experiment-rehearsal-2026-07-25-d699f7ae.tar.gz` created outside the repository (includes
  `.git` at the new checkpoint + uncommitted continuity metadata + all rehearsal evidence/tests;
  excludes secrets/deps/build output); size + SHA-256 in the task report; extraction-verified.
  **Off-device encrypted transfer: PENDING** until the user independently copies and verifies it.
- **Next milestone:** production hardening + independent security review (NOT begun).

## 2026-07-25 — TASK 10F-1: distribution-lifecycle fork rehearsal — `REHEARSAL PASS`

- **Type:** fork-only rehearsal. NO wallet, key, signature, broadcast, deployment, live transaction,
  nonce-8 use, dependency change, commit, or push. Continuity gate followed (state matched exactly;
  all four canonical artifact values re-verified before work).
- **Off-device backup:** recorded **COMPLETE — USER VERIFIED 2026-07-25** (user confirmation of the
  encrypted off-device copy of `bps-experiment-checkpoint-2026-07-25-6ace4803.tar.gz`, 149,713,634 B,
  SHA-256 `a971760fa0748b6eeebb8f8ee3a196735e4163890fa3d673c8c8ddf8136f374d`; not independently
  inspected by Claude).
- **Rehearsal:** Foundry in-process fork of Robinhood Chain pinned at block **18791290** (hash
  `0x2d332bb0…516f`, verified vs the canary evidence manifest AND upstream). Exercised the REAL
  deployed canary contracts end-to-end: 3 official buys + 1 sell with exact 2%/1% and 2%/2% fee
  reconciliation; acquisition of the full vault custody (287,593,484,277,030 wei WETH — canary
  accrual + rehearsal accrual, conservation exact); **simulated** RWA settlement (dev-only
  `MockRialtoRouter` substituted for the Rialto venue via fork-local `vm.mockCall` of
  `registry.ownerOf(2)`; real adapter code ran; real NVDA delivered); exact 80/20 split; locks
  7d/14d/21d + the live tester lock; deterministic snapshot; canonical Merkle root
  `0xefcc033c…2cee`; publication via the authorized coordinator path; 4/4 exact claims; 14 negative
  tests (auth, proof, replay, deadline, pause, under-delivery atomic rollback); dust (3 units)
  recovered; manager ends at zero residue.
- **Mainnet non-mutation PROVEN:** before/after read-only snapshots identical — deployer 16/16,
  tester 8/8 (no nonce-8 tx), vault WETH, supply, lock, allowances, pool/LP unchanged. Primary
  control: no signing/broadcast-capable command existed in the flow.
- **Suites:** focused fork test PASS; `forge test` (fork env) **418/418** (47 suites); `npm run
check` PASS. New files: `packages/contracts/test/ForkDistributionLifecycle.t.sol`,
  `test/ForkLifecycleProbe.t.sol`, `packages/contracts/canary-packet/mainnet-snapshot-check.mjs`,
  `docs/audit/BPS_DISTRIBUTION_LIFECYCLE_FORK_REHEARSAL_2026-07-25.{md,evidence.json}` (evidence
  SHA-256 `2557a3d782bd38b2c679902578f7bc5519b7b0e5f82f9fdea85e28a77d5cb065`); config:
  `foundry.toml` fs_permissions += `./rehearsal-evidence`, `.prettierignore` += that output dir.
- **NOT proven:** real Rialto venue settlement (quote/selector/eligibility — B-3), indexer-backed
  wallet enumeration, TS PoD artifacts bound to chain state, legal eligibility, production
  readiness. BPSC remains a canary. All 10F-1 changes left **uncommitted for review**.
- **Next:** production hardening + independent security review (HANDOVER.md §O step 3).

## 2026-07-25 — Post-canary local git + backup checkpoint (commit `6ace4803`)

- **Type:** preservation only. No push, PR, deployment, transaction, wallet action, approval change,
  dependency change, or TASK 10F-1 work. Continuity gate followed (documented vs actual state matched
  exactly before work).
- **Commit:** `6ace4803b5b637a58c122e2c89d5216a76dfe48d` — `docs(continuity): checkpoint completed BPSC
canary` on `master` (parent `7428f7470ad9805f1563ca3be57573e4257a05d4`). **182 files** committed: the
  master handover + continuity files, `CLAUDE.md` gate, canary completion evidence
  (`docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.{md,evidence.json}`), the full
  `packages/contracts/canary-packet/` deliverable set (14 accepted ZIPs incl. v9 + `exec/` bundle +
  scripts), lint-config exclusions, and a new `.gitattributes` pinning
  `packages/contracts/canary-packet/**` + `docs/audit/*.evidence.json` to `-text` so future checkouts
  restore byte-identical evidence (staged blobs verified: v9 ZIP `0c958a58…b74d`, evidence JSON
  `d6005083…8ec3`).
- **Pre-commit verification:** v9 ZIP SHA-256 + size (578,871) exact; recovery authorization digest
  `0xc50d97d7…8314` proven via offline verifier 61/61; delivered `exec/` MANIFEST integrity 5/5
  (105/105 files byte-identical); `CURRENT_STATE.json` parses; `git diff --check` clean; secret scan of
  all 181 staged paths + text contents clean (no keys, credentials, RPC URLs; only prohibition text and
  scanner regexes matched); no `.env` present (only `.env.example`); `node_modules`/build caches excluded
  by `.gitignore`.
- **Backup:** dated recovery archive created OUTSIDE the repository (includes `.git`; excludes
  node_modules, build output, logs, any `.env`); path/size/SHA-256 recorded in the task report.
  **Encrypted off-device transfer: PENDING** — the archive exists only on this machine until the owner
  copies it to encrypted external storage per `docs/continuity/BACKUP_AND_RECOVERY.md`.
- **Status after change:** working tree clean at `6ace4803` except these post-checkpoint continuity
  updates (intentionally uncommitted). Next task: **TASK 10F-1 distribution-lifecycle fork rehearsal**
  (not started).

## 2026-07-25 — TASK 10F: authoritative master handover + continuity system created

- **Type:** documentation / continuity-control only. No code, contract, deployment, transaction, wallet,
  dependency, commit, or push action occurred. Working tree left uncommitted.
- **Branch / HEAD at time of change:** `master` / `7428f7470ad9805f1563ca3be57573e4257a05d4`.
- Restructured `HANDOVER.md` into the authoritative, self-contained master handover: prominent verified
  SNAPSHOT, "START HERE — FRESH CLAUDE CODE TAKEOVER", full sections A–Q, decision register, blocker tables,
  bounded next-milestone spec, command cookbook (classified READ-ONLY/LOCAL/FORK/LIVE), disaster-recovery
  checklist. Preserved the prior detailed change log verbatim under "PART III — PRESERVED HISTORY".
- Created `docs/continuity/CURRENT_STATE.json` (machine-readable state; validated as parseable),
  `docs/continuity/CHANGELOG.md` (this file), `docs/continuity/BACKUP_AND_RECOVERY.md`.
- Added the **MANDATORY BPS CONTINUITY GATE** to `CLAUDE.md` (preserving all existing instructions).
- **Facts re-verified live (read-only, block 18821299, chainId 4663):** deployer nonce 16/16, tester nonce
  8/8 (no nonce-8 tx). Artifact hashes re-checked on disk: v9 ZIP `0c958a58…b74d`, evidence manifest
  `d6005083…8ec3`.
- **Conflicts recorded (not silently resolved):** DOC-1 — deploy registry `predicted` addresses are offset
  vs actual on-chain deployment and its `actual` map is null (on-chain + evidence manifest are
  authoritative); DOC-2 — historical test counts (TASK 9: forge 398 / web 129) vs current re-run
  (416 / 177), current authoritative with the older labeled as baseline.
- **Status after change:** canary COMPLETE + reconciled; production NOT deployed (NO-GO stands); next
  milestone = distribution-lifecycle fork rehearsal.

## 2026-07-25 — TASK 10E-1: post-canary mainnet reconciliation + evidence checkpoint (milestone)

- **Type:** read-only reconciliation + evidence artifacts + docs. No mainnet write; nothing committed.
- All 19 BPSC-TEST canary transactions confirmed COMPLETE on Robinhood Chain mainnet; tester nonces 2–7
  (original steps 14–19) independently reconstructed on chain and verified byte-exactly against the v9
  canonical. Final nonces deployer 16/16, tester 8/8 (no nonce-8). Full protocol state, fee accrual, burns,
  lock (lockId 0, unlock 2026-07-31T23:02:26Z), balances, and allowances verified.
- Created `docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.md` and
  `docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.evidence.json` (SHA-256 `d6005083…8ec3`), plus the
  read-only `packages/contracts/canary-packet/post-canary-reconcile.mjs`.
- Config: excluded `packages/contracts/canary-packet/` from repo prettier/eslint. Suites re-run without
  dependency changes: canary VERIFY-ALL PASS (9 suites); `npm run check` PASS (web vitest 177/177, forge
  416/416).

## Prior history

Detailed engineering history for TASK 10D-8 and earlier (canary recovery operator v5→v9, TASK 9 release
review, TASK 8 application, contract layer, PoD pipeline) is preserved in `HANDOVER.md` under
"PART III — PRESERVED HISTORY". This continuity changelog begins at TASK 10E-1; earlier entries were not
retroactively fabricated here.
