# BPS Protocol — Continuity Changelog (append-only)

> **Append-only.** Never rewrite or delete earlier entries. Add a new dated entry at the TOP for every
> material project-state change (source/config change, dependency upgrade, deployment or live transaction,
> changed addresses/hashes/nonces/balances/roles/allowances, new test results, new artifacts,
> infrastructure change, legal/compliance change, product/economic decision, discovered bug or security
> finding, completed milestone, or changed blockers/next actions). Never record secrets or credential-bearing
> URLs here. This file complements the fuller narrative in `HANDOVER.md` "Historical change log".

## 2026-07-28 — LAUNCH LAB LANE: final sell-path patch (web d5051611 deployed; SELLS STILL PAUSED)

- **Ingestion trigger generalized (d90f7537):** use-trade awaited ingestion now fires for ANY
  confirmed leg whose input OR output is the market token (`touchesMarket`) — one-step
  Rialto/0x/1inch MAG8 routes included; ETH↔GOOGL payment↔anchor composed legs excluded. attemptId
  travels with the ingest POST. NO_MARKET_SWAP on a confirmed tx never fails the trade: hash
  retained, single attempt (no retry storm), honest "Trade confirmed; market data is syncing."
  notice, background indexer reconciles. +6 tests (rialto sell, rialto/zeroEx/oneInch buys,
  composed payment-leg exclusion, NO_MARKET_SWAP soft-handling); txHash:logIndex idempotency
  already covered by lib/lab/ingest.test.ts.
- **ROOT-CAUSE COMPLETION — Rialto adapter bug (d5051611):** live probe proved Rialto returns
  `issues.allowance: null` for a taker whose allowance ALREADY covers the trade (the incident
  wallet, post-approval); rialto.ts fail-closed on that exact shape, silently demoting every
  post-approval sell to 0x — which demanded a DIFFERENT approval (AllowanceHolder) and a
  skipped-pending-approval simulation, so the old flow died before the swap prompt. This is why
  the live sell's prompt 4 never appeared. Fix: allowance:null (field present) = valid approval-free
  quote (allowanceTarget null); absent issues field still fails closed. rialto tests 9.
- **Read-only verification (local prod build, live chain + DB, no signatures/broadcast; production
  itself correctly refuses sell quotes with SELL_PAUSED):** sell 100 MAG8 → ETH for taker
  0x78B2…6024: venue **rialto**, walletActionCount **1**, planned wallet prompts exactly
  **"Sell MAG8 for ETH"** (leg allowanceTarget null → no approve step), approvals
  erc20/permit2 **false**, exact-calldata simulation **"ok"**, tx target = the already-approved
  Rialto router 0xC941…59bD, value 0, gas 1,282,066 (estimate+25%); structured log
  `{"tag":"lab-trade","attemptId":"readonly-verify-1",...,"venue":"rialto","simulation":"ok"}`.
- Gate: web 409 tests, tsc/lint/build clean. Production health d5051611cf18 — broadcast false,
  kill true, SELL_PAUSED **active** (live-verified), ETH→MAG8 buys quote via Rialto. **Stopped
  before lifting the brake, as directed.**

## 2026-07-28 — LAUNCH LAB LANE: P0 LIVE SELL FAILURE — forensics + signature-free trade UX shipped (web 94f0715; SELLS PAUSED)

- **Forensics (hash 0xf90fca7a…b77673):** SUCCESS, not a swap — it is the wallet 0x78b2…6024's
  UNLIMITED MAG8 `approve` to the Rialto spender 0xC941…59bD (nonce 10, block 21670300,
  14:39:21Z, gas 48,941; single Approval log; no PoolManager Swap, no transfers). Classification:
  **MAG8 ERC-20 approval** for a one-step Rialto MAG8→ETH sell. Full Rabby sequence reconstructed
  from chain + production logs: quote 200 (14:39:00) → prompt 1 EIP-191 prepare (offchain) →
  prepare-leg 200 (14:39:12, approval required) → prompt 2 approval tx (the supplied hash) →
  prompt 3 EIP-191 prepare again (offchain) → prepare-leg 200 (14:39:30) → prompt 4 (the swap)
  **never broadcast** — no nonce-11 transaction exists. Root cause: prompt-fatigue abandonment of
  the intentional sign→approve→sign→send flow. **No funds lost:** MAG8 891.428109766302671946
  (exactly what the buy delivered — the 901.79 Swap-event figure is pool-side; the router delivered
  891.43), GOOGL 0, ETH 0.000148. Allowances now: MAG8→Rialto spender UNLIMITED (this approval,
  retained per directive), MAG8→Permit2 UNLIMITED (token-constructor default), GOOGL→* 0.
- **Safety:** creation stays closed (broadcast false / kill true). NEW incident brake
  `BPS_LAUNCH_LAB_SELL_PAUSED=true` (Production env + code, commits bb7476a/c5e96cf) blocks NEW
  market-token sells in /api/lab/quote + prepare-leg with honest SELL_PAUSED copy; buys and the
  anchor→payment RECOVERY leg are unaffected (live-verified). Lift by removing/false-ing the env var
  + redeploy.
- **UX fix (deployed 94f0715, sells still paused):** trade preparation is now SIGNATURE-FREE
  (option A — the wallet transaction authenticates; server never signs/broadcasts; EIP-191 envelope
  removed from prepare-leg). EXACT-amount ERC20/Permit2 approvals (never unlimited). Automatic
  signature-free re-preparation after approvals (fresh quote window). Planned wallet prompts listed
  BEFORE execution from a signature-free allowance preflight. Recovery banner: "{TOKEN} was sold.
  Your {ANCHOR} remains in your wallet." Structured lab-trade JSON server logs keyed by a non-secret
  attemptId (venue, action, allowance state, quote timestamp, simulation, receipt outcome). Gas from
  estimateGas +25%. Tests: prepare-leg 12 (signature-free, sell-pause matrix, log line, gas buffer),
  trade +6 P0 regressions (never sign→approve→sign; one-confirmation; exact-amount; stale-window
  auto-refresh; concise revert + no pending record; double-click guard; planned steps) — web 402,
  tsc/lint/build/secret-scan clean. Live: health 94f0715b6f02 fail-closed, SELL_PAUSED active,
  ETH→MAG8 buy quote OK (rialto, 1 action).
- **User guidance:** the user was NOT asked to retry; local recovery state untouched; approvals not
  revoked. When the founder lifts SELL_PAUSED, the sell flow will request at most approve + swap.

## 2026-07-28 — LAUNCH LAB LANE: pre-canary provenance check PASSED (no redeploy)

- Branch `feature/bps-launch-lab-8h-vercel` pushed to origin (zavo77/bps-protocol) through `3b99a0c`
  (was local-only past `5bb2ff7`). Production /api/lab/health commit `60c344e51d4f` == the pushed feat
  commit; `1a894d2` (continuity) and `3b99a0c` (stray .gitignore) are documented docs/chore-only
  descendants — deployed code identical, NO redeploy. Posture verified live: accessMode=public,
  broadcastEnabled=false, killSwitchActive=true. MAG8 trading path live-verified with a read-only
  POST /api/lab/quote (ETH→MAG8 100000000000000 wei): one-step Rialto leg, 1 wallet action — no
  signature, no transaction. Market snapshot loads (price $0.00002067, pool reserve $0.018835,
  1 swap); indexer trackedMarkets=1, knownPools=1, MAG8 state=current (lag 3). Diagnostic finding
  (minor, not a defect): a request body failing zod validation on /api/lab/quote returns 500 INTERNAL
  instead of 400 — surfaced by a probe with a bad EIP-55 checksum; real clients send valid addresses.
  Ready for the human MAG8 canary buy+sell.

## 2026-07-28 — LAUNCH LAB LANE: P0.1 live market accuracy shipped (web 60c344e deployed fail-closed, indexer redeployed)

- Founder P0.1 items 1–6 complete and live-verified on the MAG8 production canary: awaited BPS-Direct-leg
  trade ingestion with market/history refetch (T1→T3 logged); immutable per-launch facts —
  `lab_launches.launch_manifest` JSONB, MAG8 backfilled proven-only (unproven values honestly absent),
  future registrations persist the manifest hash-gated against the prepare-time issued hash; separate
  "Pool reserve" / "Curve inventory value" stats (summed liquidity metric removed everywhere); the
  authoritative chart is now anchor-per-token "GOOGL per MAG8" (retroactive-USD history conversion
  removed; current USD is a separate stat); trader identity columns `event_sender` + `transaction_from`
  end-to-end (ingest + indexer + MAG8 backfill; UI "Wallet" column with router detail); new server-side
  token-metadata resolver + endpoint (MAG8 artwork resolves live; cross-token artwork fallback banned);
  DexScreener adapter bound to token-pairs/v1/robinhood with exact token+anchor+poolId matching
  (verified: DexScreener pairAddress IS the v4 poolId). Gate: 394 web + 56 pkg + 13 indexer tests,
  tsc/lint/build/secret-scan clean. Production health-verified at 60c344e51d4f, broadcast false, kill
  true; creation stays closed. Item 7 (MAG8 canary buy+sell) awaits founder/advisor trades — Claude
  cannot execute trades; verification harness ready. PRINT acceptance remains NOT complete.
- Ops note: deploy the web app from the REPO ROOT (`npx vercel deploy --prod`); `apps/web/.vercel`
  points at a stale "web" project whose partial upload fails npm install on `@bps/launch-lab`.

## 2026-07-28 — LAUNCH LAB LANE: P0 live market page + indexer recovery shipped (web 7a7ea73, indexer redeployed)

- First LIVE market mag8/MAG8-GOOGL launched by the public flow; creation immediately re-closed (broadcast false / kill true, health-verified). Forensics proved the test buy was indexed and poolIds match. Cursor-race fix (per-market catch-up + lab_pool_sync + regression test), instant trade ingestion endpoint, dynamic provenance-based snapshot, precision-safe orientation-tested price math, honest metric definitions, rebuilt market page with baseline chart + Recent trades + holders + DexScreener. Live acceptance green (see CURRENT_STATE.launchLab.liveMarketRecovery). Audit history untouched.

## 2026-07-28 — ⚠ LAUNCH LAB LANE: advisor session REOPENED with the chain-gate fix live

- Founder accepted the wallet-network P0 fix and re-authorized the session. Production env set to
  public / broadcast TRUE / kill FALSE; redeployed; health-verified at commit 10bb2b097a63 — a verified
  git descendant of the 47032dd chain-gate fix. Preview remains fail-closed. /lab/launch 200.
- Engineering stopped at the live public site (no wallet/wizard/metadata/manifest/signature/trade).
- Standing post-session plan: immediate fail-closed restore + redeploy + full acceptance verification.

## 2026-07-28 — LAUNCH LAB LANE: P0 live wallet-chain failure fixed; production restored fail-closed (commit 47032dd)

- **Live failure (advisor session):** a connected wallet on Ethereum Mainnet (chainId 1) reached launch
  and got a raw viem ChainMismatchError. Root cause: wagmi useChainId() mirrors the app CONFIG chain
  (always 4663) and never the wallet's actual chain, so wrong-chain was undetectable. The attempt came
  from the founder-side inspection wallet 0x78b2…6024 with mag8/MAG8 calldata — its newly prepared
  manifest was retired audit-safely (consumed_at set, row retained; 0 active manifests afterwards).
- **Fix (deployed 47032dd):** wallet-chain gating via useAccount().chainId everywhere (wallet-ui-state,
  create-flow, trade hook); hard stops before metadata, envelope signing, simulation and launch; clean
  "Switch to Robinhood Chain / This market launches on Robinhood Chain / [Switch network]" state replaces
  the wizard on the wrong chain; wallet_addEthereumChain fallback with the founder-specified params
  (0x1237, Robinhood Chain, ETH/18, official RPC, Blockscout) and a retried switch; concise retry copy on
  rejection; account/chain change invalidates all prepared state (chain-only switch keeps the same
  account's typed form); errorMessage() sanitized — raw provider errors, request arguments and calldata
  can never reach the UI.
- **Verified:** 7 new founder-spec chain-gate tests; 326 web + 56 launch-lab + 9 indexer green; lint/
  typecheck/build/secret scans clean. LIVE replay on deployed production with a chain-1 wallet: clean
  switch card, wizard hidden, zero raw error text, switch restores the wizard, 0 console errors.
- **Posture:** production restored FAIL-CLOSED while deploying the fix (broadcast false / kill true,
  health-verified at 47032dd) per the founder's instruction; the advisor session needs a fresh go-signal.

## 2026-07-28 — LAUNCH LAB LANE: pre-session manifest cleanup (live posture unchanged)

- At founder direction, the active prepared manifest bound to the founder inspection wallet
  0x78b2…6024 (predicted token 0xa08e…63d1) was retired via the normal audit-safe mechanism
  (consumed_at set; row RETAINED; nothing deleted or rewritten).
- Confirmed clean pre-session state: **0 active/unconsumed prepared manifests, 0 provenance-verified
  BPS launches, indexer knownPools = 0** (5 audit rows retained).
- Production posture untouched and re-verified live: public / broadcast TRUE / kill FALSE at commit
  5d8dc7daa1d0. No redeploy, no wallet, no wizard input, no new manifest, no signature.

## 2026-07-28 — ⚠ LAUNCH LAB LANE: LIVE ADVISOR SESSION POSTURE ENABLED (fresh founder authorization)

- Founder visually approved the polished three-screen journey and re-authorized the acceptance session
  with explicit values. Production env set to public / broadcast TRUE / kill FALSE; redeployed;
  **health-verified live at commit 5d8dc7daa1d0** (accessMode public, broadcastEnabled true,
  killSwitchActive false, rpc+db ok). Preview remains fail-closed. Entry points /lab/launch and
  /lab/tokens 200; Railway indexer healthy (lag 3, knownPools 0 pre-launch).
- Engineering STOPPED at the live public site as directed: Claude connected no wallet, entered nothing,
  uploaded nothing, prepared nothing, signed nothing. The advisor runs the whole public flow personally
  (launch PRINT/GOOGL → buy with native ETH → partial sell back to ETH; no GOOGL needed beforehand).
- Pre-session state: 0 provenance-verified launches; one active wallet-bound prepared manifest exists
  for 0x78b2…6024 (founder-side inspection wallet, created 09:09Z via the public wizard before the
  posture change — not Claude-created; cannot affect the advisor's unknown wallet).
- Post-session plan (standing): full acceptance verification, then immediate restore to
  broadcast=false / kill=true, redeploy, fail-closed health verification.

## 2026-07-28 — LAUNCH LAB LANE: final review polish deployed; session-enable directive superseded (commit a580db7)

- Founder polish pass applied to the review screen (identity block, spacing, no step counter, Start over
  demoted, 'Creator fees — Connected/Custom wallet · 0x…', 'Contract details', dominant Launch button,
  plain footer disclaimer). Gate: 319+56+9 tests, lint/typecheck/build/secret scans clean.
- **Posture:** the earlier same-day directive to enable the advisor session (broadcast true / kill false)
  was SUPERSEDED mid-execution by the founder's 'Keep Production fail-closed'. The Production env values
  were flipped and then reverted BEFORE any redeploy — live Production NEVER left fail-closed
  (health-verified: broadcast false / kill true at commits 034e1fb and a580db7, now live at a580db7).
- Both review states captured on the identical commit via a local rendering with ALL mutation routes
  intercepted (no manifest created anywhere, no signature — personal_sign returned inert bytes, no
  Pinata/DB writes): fail-closed shows the single unavailable line; the enabled VISUAL state (config
  intercepted client-side only) shows the dominant 'Launch MAG8' action.

## 2026-07-28 — LAUNCH LAB LANE: simplified three-screen journey + QA-residue cleanup (commit 034e1fb)

- **Founder UX P0:** the whole launch journey rebuilt as three short screens in one centred 680px
  column — "Launch a token" (artwork/name/ticker/description/Continue; fillable while disconnected;
  Continue opens the normal wallet flow), "Choose the market" (five clean asset tiles, creator-fee
  destination, compact acknowledgement), "Review your market" (artwork, PRINT, PRINT/GOOGL, 1 billion
  supply, $20,500 starting value, 1% trading fee, 85% creator share, fee destination, network fee with
  Calculating…/real-estimate/wallet-fallback states — never a dash, one permanence sentence, Launch
  PRINT). Advanced details stay in one collapsed section; closed state is one plain line. Editorial
  slogan, wallet-status cards, helper panels, and ALL internal terminology removed from the wizard.
- **Production UX proof (deployed commit 034e1fb, fail-closed):** desktop 1440×900 (empty Step 1,
  completed Step 1, connect flow, Step 2 with GOOGL, Step 3 review) + mobile 390×844 (Step 1/2/3);
  normal interaction sequence recorded and stopped before preparing; the Step-3 captures additionally
  required prepare. **Wording per founder correction: an EIP-191 prepare-envelope signature was
  produced automatically during QA. No transaction signature or broadcast occurred.** Live network-fee
  estimate rendered (~0.00011 ETH); no horizontal overflow; review body free of technical terminology.
- **QA residue cleaned (audit-safe):** all QA/inspection prepared manifests retired by setting
  consumed_at (rows RETAINED — nothing deleted). Confirmed: **0 active prepared manifests,
  0 provenance-verified BPS launches, 0 BPS markets**, 4 audit rows retained, no state prepared for
  the advisor.
- **Gate:** 319 web + 56 launch-lab + 9 indexer tests; lint/typecheck/build/secret scans clean.
  Production health: commit 034e1fb44efa, public / broadcast FALSE / kill TRUE.

## 2026-07-28 — LAUNCH LAB LANE: P0 wallet-scoped wizard + consumer review, live-verified (commit 27b71c1)

- **Root cause of the founder's "stale MAG7 in Step 3":** wizard state was plain React state with NO
  wallet boundary — in a long-lived tab, wallet B connecting after wallet A saw A's form/manifest/review.
  Fixed: a wallet identity boundary in use-create-flow wipes ALL wizard state (form, metadata, manifest,
  prepared tx, errors) on address change or disconnect and returns to Step 1. Text-only drafts persist
  per (chainId, address) — never for disconnected visitors, never image bytes / acknowledgement /
  prepared state. Visible **Start over** clears the form and the persisted draft.
- **Consumer review screen:** artwork, name/$ticker, description, paired asset, supply, starting FDV,
  trading fee, 85/10/5 split, fee destination, estimated network fee, permanence warning, Launch market.
  All technical values (predicted address, pool id, hashes, modules, modes, chain id, simulation block,
  WAD shares) live in ONE collapsed "Advanced contract details". Removed from the UI entirely:
  deployment commit, server flags, pass/blocked gate checklist, capacity counter. Closed state shows
  only "Market launches are temporarily unavailable."
- **REAL production acceptance (deployed commit 27b71c1, fail-closed posture):** two throwaway wallets
  (keys generated in-memory, never persisted; genuine EIP-1193 provider; wallet A signed ONLY the
  EIP-191 prepare envelope — no transaction, nothing launched). Fresh visitor → empty Step 1; wallet A →
  PRINT details, artwork, GOOGL pair, connected-wallet fee destination, consumer review reached; wallet
  B in the SAME browser → zero wallet-A state, including after reload. 6 screenshots delivered.
  Side effect: one unconsumed, wallet-bound lab_prepared manifest row for throwaway wallet A (harmless,
  single-use).
- **Gate:** 319 web (incl. new draft-isolation suite) + 56 launch-lab + 9 indexer; lint/typecheck/build/
  secret scans clean. Production health: commit 27b71c1125aa, public / broadcast FALSE / kill TRUE.

## 2026-07-28 — LAUNCH LAB LANE: restricted-beta shell removed — full public product experience (commit af014cf)

- **P0 founder visual inspection failure fixed.** Production first restored FAIL-CLOSED (broadcast false,
  kill switch true — health-verified) before any UI work, per founder instruction; that posture remains
  after this deploy. The 2026-07-28 live acceptance posture below is therefore SUPERSEDED until the
  founder re-authorizes broadcast for the session.
- **Shell removal:** root layout is now minimal (no "BPS Protocol · Restricted Beta" chrome, no dark
  frame, no restricted-beta badge anywhere on public routes). `/` redirects to `/lab/tokens`. The legacy
  restricted-beta protocol dashboard moved INTACT to `/protocol` with its own shell (200 verified);
  its Playwright e2e retargeted.
- **One public product shell:** lab header = wordmark · Markets · Launch · Profile (when connected) ·
  **Connect wallet** (new ConnectWalletButton: friendly wallet-options menu, "Browser wallet" naming,
  connected short-address + disconnect; no connector jargon anywhere).
- **Wizard:** welcoming connect prompt ("Connect your wallet to launch a market."), compact
  1·Token — 2·Pair — 3·Review & launch stepper (light inactive pills), inline errors (wallet-state/
  flow-state chrome removed; hidden test-only marker retained), step-2 action "Continue to review →",
  final action **"Launch market"**; QA copy removed on launch + trade surfaces; "Launch a market" CTA.
- **Visual acceptance gate (actual Production screenshots, commit af014cf):** 1440×900 — /(→/lab/tokens),
  /lab/tokens, /lab/launch; 390×844 — /lab/tokens, /lab/launch; plus the connected wizard captured on the
  identical commit's E2E mock-wallet build (production cannot be wallet-connected without a human wallet).
  Automated checks per page: 0 console errors, no horizontal overflow, no restricted-beta/debug wording.
- **Gate:** 314 web + 56 launch-lab + 9 indexer tests; lint/typecheck clean; production build clean;
  client-bundle secret scan clean. Production health: commit af014cf, public / broadcast FALSE / kill TRUE.

## 2026-07-28 — ⚠ LAUNCH LAB LANE: LIVE ACCEPTANCE-TEST POSTURE ENABLED (founder-authorized)

- **Founder directive (final acceptance test):** a previously unknown random public wallet must launch
  PRINT/GOOGL through the normal public wizard and buy/sell with native ETH. NOT founder-prepared, NOT
  advisor-specific.
- **Production env changed (explicit founder values):** BPS_LAUNCH_LAB_BROADCAST_ENABLED=**true**,
  BPS_LAUNCH_LAB_KILL_SWITCH=**false**, access mode public. Redeployed; health-verified live
  (commit 418b3c6). **Preview remains fail-closed** (broadcast false, kill true — explicit values
  re-added after the combined env entries split).
- **Founder-bound Genesis card demoted:** GENESIS_LAUNCH_CARD.json now carries
  status=REHEARSAL-ONLY, **execution_authorized=false** — it must never be executed; the definitive
  card is generated by the public wizard only after the advisor connects and picks a fee destination.
- **No pre-created state for the advisor wallet (verified):** lab_prepared = 0 issued manifests;
  0 provenance-verified rows; public mode consults no allowlist; no predicted address or calldata bound
  to any wallet in any execution path.
- **Expected live routing for the fresh PRINT market:** BUY = ETH →(Rialto)→ GOOGL →(BPS Direct)→ PRINT;
  SELL = PRINT →(BPS Direct)→ GOOGL →(Rialto)→ ETH. The advisor never needs to hold GOOGL. The one-step
  aggregator attempt no-routes for a brand-new token and falls through to the composed path by design;
  the advisor's own buy seeds the anchor-side reserves that make the partial sell executable.
- **Engineering stops before any wallet signature.** The advisor signs in-browser. Acceptance criteria
  (launch confirms; provenance-verified=1; knownPools=1; Markets/token page/buy/partial-sell/history/
  chart/profile/fee-destination) are evaluated during the live session.

## 2026-07-27 — LAUNCH LAB LANE: Genesis card v2 FROZEN (founder corrections; prior hashes invalid)

- Founder corrections applied: (1) market display **PRINT / GOOGL** + hard assertion resolved-anchor ==
  canonical GOOGL (prior "PRINT / PRINT" confirmed display-only; the simulated numeraire was always
  canonical GOOGL); (2) FINAL founder-provided description verbatim → metadata re-uploaded
  (ipfs://QmXLeDV8mfzqaUvL11Ss1wyodTMRHTUgKeuBSzTGvn3DoT; image CID unchanged); (3) launch actor
  confirmed **mode A — founder wallet** from the standing authorization (mode B would void this card);
  (4) artwork verified byte-identical (sha256 8e646a45…59fd) to the Claude Design V4 delivery's sole
  1024×1024 PRINT asset — rendered artwork, not a placeholder.
- Fresh simulation block 21012000: predicted token `0x8B400Cab3a7F7C912B6Dd3Af9996B16F0847D8C8`,
  poolId `0x480555529cd58f9aca0c9cad2c56eca9eceee3e2ec8d98010141801ace533396`, gas 3,576,414
  ≈ 0.0001336 ETH; manifestHash `0x3aff314a…cf84`; calldataHash `0x8d4e20e1…6043`.
  **All previous predicted addresses and hashes are invalid.**
- Broadcast remains disabled; kill switch remains active; no signature requested.

## 2026-07-27 — LAUNCH LAB LANE: route-probe gated + FINAL GENESIS LAUNCH CARD assembled (commit cc3e782)

- **Route-probe cleanup (founder-directed):** GET /api/lab/route-probe now requires server-side
  `BPS_LAUNCH_LAB_ROUTE_PROBE_ENABLED=true` (fail-closed 404 default; verified 404 in Production).
  Response stripped of all taker addresses; remains read-only, rate-limited, fixed-matrix, no raw venue
  errors, no calldata or key material; never part of the product flow.
- **16-item final gate:** 314 web + 56 launch-lab + 9 indexer tests; lint/typecheck/build/secret scans
  clean; production health ok (commit cc3e782, public/broadcast-false/kill-true); Railway indexer health
  ok (head 21004493, lag 3, knownPools 0); fresh-visitor walkthrough of /lab/launch + /lab/tokens clean
  (no signature reachable while disconnected, honest empty states, zero console errors); all 5 anchors
  re-verified live (GOOGL mid ≈$326.43); DB/provenance clean (13 external rows, 0 provenance-verified,
  0 outstanding manifests, LL2_VERIFIED re-run).
- **GENESIS LAUNCH CARD assembled** via the production code path (scripts/genesis-launch-card.mts →
  docs/launch-lab/GENESIS_LAUNCH_CARD.json): FINAL Pinata upload (image
  QmVnCzLDvRUzLmSg1KdcRTYqFHSJgsgAG8xSm6htZYT6Bc; metadata ipfs://QmPMQp1QZsaSkFfTgyEoKGFMNcFX4KFAMDA7BnxZiEJzd8);
  exact rehype simulation at block 21007227 → predicted token `0xdfcd0343…129c`, poolId
  `0xbdee8caa…4743`, gas 3,576,414 ≈ 0.000135 ETH; manifestHash `0xb54f8063…3f9d`; calldataHash
  `0x123e339f…0776`; live Rialto ETH→GOOGL quote executable (5 bps, settlement=allowance).
  **Token description is PROPOSED** (never canonically recorded) — founder confirms/replaces at review;
  any change re-uploads metadata and re-hashes (predicted address + poolId change).
- **No broadcast enabled, kill switch untouched, no signature requested.** The founder signs in-browser
  via the public /lab/launch flow, which re-simulates fresh (3-minute staleness ceiling) before signing.

## 2026-07-27 — LAUNCH LAB LANE: RIALTO_API_KEY activated in Vercel — production Rialto routing live-verified (commits e3178a3 + 48a7c8d)

- **Type:** Lane source change + Preview/Production redeploys (fail-closed) + live production verification.
  No mainnet transaction; no launch/trade signature requested; broadcast disabled; kill switch active.
- **Founder action:** RIALTO_API_KEY added to Vercel Preview + Production (server-side, Sensitive) —
  closes LL-4. Value never seen, printed, or committed by Claude.
- **New diagnostic (e3178a3):** GET /api/lab/route-probe — read-only, tightly rate-limited, sanitized
  (venue, amounts, fee bps, exact returned spender, simulation status; never calldata or key material).
  Fixed founder matrix through the frozen priority chain on the DEPLOYED runtime; native-ETH pairs
  simulate the exact returned calldata via a funded public EOA (read-only eth_call) when the
  beneficiary is unfunded.
- **Production verification (commit 48a7c8d):** all 8 pairs (ETH→GOOGL, ETH→NVDA, WETH→NVDA,
  USDG→GOOGL + reverses) fill via **rialto**, chain 4663, fee **5 bps** read from each quote, spender
  `0xC94135b63772b91D79d0A2DaAb2a8801f32359bD` used exactly, native ETH needs no approval
  (spender null), ETH→GOOGL and ETH→NVDA **simulate ok**. Trade-card POST /api/lab/quote against the
  live external GOOGL Doppler market `0x0877…dBA3`: BUY one-steps via Rialto; advanced anchor-direct
  BUY quotes the live rehype pool (BPS Direct leg proven live).
- **Bug found & fixed during verification (48a7c8d):** market-token SELL returned INTERNAL 500 — the
  v4 Quoter wraps pool reverts in UnexpectedRevertBytes(0x6190b2b0); nested selector 0x7a5ed734 =
  NotEnoughLiquidity(poolId). Root cause is market state, not code: a freshly launched multicurve pool
  holds only the launched token until first buys seed anchor-side reserves. Added translateQuoterError
  (cause-chain revert-data walk) → honest 409 NO_POOL_LIQUIDITY / QUOTER_REVERTED in quote +
  prepare-leg + trade card; mapError now logs INTERNAL errors server-side (first line, URLs redacted).
- **Secret proof (deployed assets):** 0 hits for key names / venue URLs / Bearer material across
  production HTML, 6 JS chunks, and API responses.
- **Preview:** redeployed Ready with the key; external runtime QA still blocked by team deployment
  protection (LL-3) — identical build verified locally with the same key configured.
- **Verification:** 312 web + 56 launch-lab + 9 indexer tests; lint/typecheck/build clean.
- **Blockers:** LL-4 CLOSED. LL-5 (ONEINCH_API_KEY dormant by design) open. LL-3 unchanged.

## 2026-07-27 — LAUNCH LAB LANE: Rialto primary RWA routing + frozen V1 trade UI (commit 01c8cfd, deployed)

- **Type:** Lane source change + Vercel Preview/Production deployment (fail-closed). No mainnet transaction,
  no launch/trade signature requested, broadcast disabled, kill switch active. Branch
  `feature/bps-launch-lab-8h-vercel`, HEAD `01c8cfd02da6382d472d582b5a605018714f97fc`, pushed to origin.
- **Frozen V1 routing (founder gate):** BUY = payment (ETH/WETH/USDG) → Rialto → RWA anchor → BPS Direct →
  market token; SELL reversed. One-step aggregator routes attempted first through the frozen priority chain
  **Rialto → 1inch → 0x**; never depended on for brand-new BPS pools. New server-only adapters
  `apps/web/lib/lab/rialto.ts` (settlement=allowance enforced, chain-4663 guard, exact returned spender,
  human-decimal sell_amount, fail-closed, no integrator fee) and `apps/web/lib/lab/oneinch.ts` (dormant
  until ONEINCH_API_KEY; fails closed if /approve/spender yields no address). `trade-router.ts` rewritten
  around the priority chain; `RouteLeg.kind` widened to rialto|oneInch|zeroEx|bpsDirect.
- **Adversarial review (17-agent workflow) — 13 confirmed findings, ALL fixed pre-deploy:** prepare-leg now
  (a) always re-runs the priority chain server-side (client kind is only a hint; response reports the venue
  used — also fixes the sell-resume 0x pinning), (b) binds aggregator legs to the market token or its anchor
  (payment→payment and payment→arbitrary-token rejected), (c) binds venue tx value (native leg
  value===amountIn, ERC-20 leg value===0 → BAD_VALUE). Router: one-step SELL approves the MARKET token;
  composed SELL minimum uses the venue-enforced minimum (no double slippage). Hook: stale quotes are
  rejected + auto-refreshed before preparation; a wallet signature is NEVER requested without a successful
  exact-calldata simulation; re-entrancy guard on execute/resume; executed quotes retired after success.
  1inch spender fallback removed (fail closed).
- **Frozen V1 UI:** primary surface = Buy/Sell, You pay, You receive, balance, expected output, one primary
  action button. Collapsed "Trade details" holds slippage, minimum received, price impact, pool fee, venue
  fee, internal anchor, wallet-action count, route legs/venues, warnings, and the advanced anchor option.
  Runtime execution status and composed-trade recovery banners remain fully visible.
- **Live Rialto probe (authenticated, local key, 2026-07-27):** all 5 anchors × ETH/WETH/USDG executable in
  BOTH directions; settlement=allowance; platform fee 5 bps in quotes; router spender `0xc94135b6…59bd`;
  native ETH sells need no approval; WETH→NVDA fills on Rialto where 0x returns 422 — Rialto closes the
  payment↔RWA gap.
- **Verification:** 307 web vitest (40 files) + 53 launch-lab + 9 lab-indexer; monorepo lint/typecheck
  clean; production build clean; client bundles contain no RIALTO/ZEROX/ONEINCH key names and no venue base
  URLs (scan + strengthened rialto-boundary test enforcing server-only key referencing).
- **Deployment:** Vercel Preview (Ready) + Production (Ready) at commit 01c8cfd. Production health:
  status ok, accessMode public, broadcastEnabled false, killSwitchActive true, rpc ok, database ok,
  commit 01c8cfd02da6.
- **NEW BLOCKER LL-4:** `RIALTO_API_KEY` exists locally but is NOT configured in Vercel (Preview or
  Production) — deployed Rialto routing is dormant (fail-closed; composed payment routes 409 in production
  until the founder adds the key server-side/Sensitive and redeploys). LL-5 (dormant by design):
  ONEINCH_API_KEY not configured anywhere.

## 2026-07-27 — LAUNCH LAB LANE: 8H Vercel-first build (founder-authorized new product lane)

- **Type:** New separate product lane (BPS RWA Launch Lab) implemented on branch
  `feature/bps-launch-lab-8h-vercel` per the founder's 8H authorization (chat 2026-07-27) and
  `docs/launch-lab/BPS_LAUNCH_LAB_8H_VERCEL_MASTER_PROMPT.md`. **Capital Engine untouched** (no
  frozen-contract/app/page.tsx/canary/rialto changes). Stage-A canary lane state unchanged and preserved
  in a dedicated checkpoint commit `06ff34b` on master before branching.
- **Authoritative lane log:** `docs/launch-lab/BPS_LAUNCH_LAB_8H_PROGRESS.md` (running milestones).
- **Hard gate PASSED:** exact PRINT/GOOGL Doppler **rehype multicurve** creation simulated against live
  4663 via pinned `@whetstone-research/doppler-sdk@1.0.33` (standard/scheduled/decay multicurve
  initializers are NOT deployed on 4663 — recorded; rehype path proven; artifact
  `docs/launch-lab/SPIKE_LAUNCH_PROOF.json`).
- **Implemented:** `packages/launch-lab` (anchor fail-closed GOOGL resolver, module+whitelist
  verification, 85/10/5 WAD beneficiaries, launch builder, exact simulation → unsigned tx, canonical
  manifest hashing, Pinata-only metadata, receipt decode + hard manifest verification, on-chain launch
  registry) + `/api/lab/*` routes (EIP-191 envelopes, origin/host/payload-hash binding, rate limits,
  replay protection) + functional `/lab` routes (create flow with kill-switch/broadcast gates and honest
  "Awaiting indexed data" states). PUBLIC access-mode retrofit in progress:
  `BPS_LAUNCH_LAB_ACCESS_MODE=disabled|allowlist|public` (fail-closed default), per-wallet/day guardrail
  env knobs, terms acknowledgement, chain-reconstructed launch listing with optional Postgres mirror
  (`DATABASE_URL` — NOT yet provisioned).
- **Deployments (fail-closed):** Vercel project `bps-launch-lab` (team zavo1, root `apps/web`, Node
  24.x). Preview + Production deployed with `BPS_LAUNCH_LAB_BROADCAST_ENABLED=false` and
  `BPS_LAUNCH_LAB_KILL_SWITCH=true` (founder-configured env). **No mainnet transaction performed; no
  broadcast enabled; Genesis PRINT launch NOT executed** — it requires the founder-approved launch gate
  and founder wallet signatures only.
- **New env names (values never committed):** BPS_LAUNCH_LAB_{ENABLED,BROADCAST_ENABLED,KILL_SWITCH,
  ACCESS_MODE,CREATOR_ALLOWLIST,BPS_BENEFICIARY,START_FDV_USD,DEFAULT_FEE_PRESET,SESSION_SECRET,
  MAX_LAUNCHES_PER_WALLET,LAUNCH_COOLDOWN_SECONDS,PUBLIC_DAILY_LAUNCH_CAP,METADATA_MAX_BYTES,
  REQUEST_TTL_SECONDS}, PINATA_JWT, PINATA_GATEWAY, DATABASE_URL (pending).
- **Blockers recorded:** LL-1 private RPC quota exhausted ("Monthly capacity limit exceeded") —
  mitigated by viem fallback(private→public) for reads; founder must upgrade/replace the endpoint.
  LL-2 `DATABASE_URL` not provisioned — persistence runs on chain-reconstruction fallback (authority)
  until provided. LL-3 Vercel preview URLs sit behind team Deployment Protection — preview QA done
  against a local production server of the identical build; production URL is public.
- **Toolchain:** root `.npmrc` gains `legacy-peer-deps=true` (SDK React-18 peer vs repo React 19);
  `transpilePackages` added to next.config.mjs preserving the `bps-wagmi-active` alias byte-for-byte;
  apps/web gains pg/server-only/typescript/@types/node/vitest/@testing-library-dom declarations.
- **Verification:** 42 package unit tests + 182+ web vitest green; lint/typecheck/format clean; local
  prod build + secret-bundle scan clean (no secret names/values in client chunks).

## 2026-07-27 — STAGE A (step 1): guard deployment verified + executor runtime hash derived + launcher repaired

- **Type:** Read-only on-chain verification + offline bytecode analysis + repair of the ephemeral (out-of-repo)
  Rabby launcher. **NO signing, broadcast, deploy, fund, Safe transaction, approval, transfer, swap, settlement,
  unpause, or external contact by Claude; no private key/mnemonic/RPC/API secret read or exposed.** Repo change
  is continuity/docs ONLY (HANDOVER.md + these continuity files); NO source/contract/bundle change. Start HEAD 5f71acc.
- **Guard DEPLOYED + independently verified:** the founder broadcast the guard CREATE. ChainlinkSettlementPriceGuard
  live at **0x57538680194D9E15Ba78bf243B10B440f663078d**, tx **0xc3095c2ed7d4b8365dde2b6a7d76220a75806c552e4f3e17361fa2aedbb4256f**,
  deployer 0x7116...2ba2 nonce 1, block 20167604 (2026-07-26T20:44:17Z), gasUsed 1,121,401, value 0, to null,
  status success — all confirmed via read-only RPC.
- **CRITICAL CORRECTION (immutable-resolved vs template runtime hashes):** Foundry `deployedBytecode.object` is a
  TEMPLATE with zeroed immutable placeholders, so the bundle's `runtimeBytecodeHash` (guard 0x4c5859...92e8,
  executor 0x16c8af...0908) is the PRE-IMMUTABLE hash and can NEVER equal an on-chain runtime that has immutables.
  Immutable-RESOLVED runtime hashes: **guard 0xfcb2694b60737532d4d44ede77750068cfb0c0756263c1aaceede57fc74857f4**
  (== live), **executor 0xf864233b76b77d05fd95250a3641839941fc00fc4aed3ac736458be957273a8d** (derived; not yet deployed).
- **Guard live==frozen proof (offline):** paris rebuild reproduces the bundle exactly (guard creation 0x9385b6...0b34 /
  runtime template 0x4c5859...92e8 both match). Masked byte-compare of the paris template vs the live runtime: every
  difference is confined to the 14 solc immutable reference ranges (nothing else differs; equal length 4485 B). Each of
  the 14 immutables is consistent across all its reference sites and equals the independently-computed expected value —
  frozen constructor args (WETH/NVDA/ETH-feed/NVDA-feed, sequencer=0, grace=0, maxAges=900/900) plus live-read derived
  values (ETH/USD & RHNVDA/USD feed decimals=8, WETH/NVDA token decimals=18, feed description hashes
  keccak("ETH / USD")=0x62ddc8...1777, keccak("RHNVDA / USD")=0xf4d5d0...8b49). All 14 public immutable getters match.
  Reconstruct(template + expected immutables) hashes to exactly the live runtime.
- **Executor expected runtime hash derived offline (two agreeing methods):** (a) AST-splice — bundle template + solc
  immutableReferences with weth=0x0Bd7...AD73, stockToken=0xd060...9EEC, registry=0x71a1...687E (controller Safe is NOT
  immutable); (b) read-only eth_call in contract-creation form against live mainnet state. Both == 0xf864233b...273a8d
  (9256 B), differ from template 0x16c8af...0908. The simulation also confirms the executor constructor does not revert
  against live state.
- **Pre-executor chain recheck (read-only):** deployer latest nonce 2, pending nonce 2, guard code present, executor
  address 0x17e0...f84C empty, balance 427902428602000 wei (~0.000428 ETH), gasPrice 0.048972 gwei — sufficient for the
  executor deploy (~3x headroom).
- **Ephemeral launcher repaired** (OS temp %TEMP%/bps-stage-a-launcher/server.mjs; NOT in repo; sha256
  d2c5d5d3bfd18e5cd9cce160335af82f3ea85d6fac9d1ffa72dc1eb4d5ebe731): now EXECUTOR-ONLY (guard already deployed);
  post-deploy validation compares the deployed code hash to the immutable-RESOLVED hashes (was comparing to the
  pre-immutable template — would have failed every deploy and falsely disabled the executor); preflight enforces the
  founder recheck (latest & pending nonce==2, guard present AND live runtime hash==resolved guard hash, executor empty,
  balance>=gas*price); binds 127.0.0.1:8799, no key, single eth_sendTransaction, read-only RPC allowlist, server-side
  viem keccak, startup self-checks. Smoke-tested read-only (page + /keccak + negative paths) then STOPPED. Broadcast
  NOT performed — the human restarts it to broadcast the single executor CREATE.
- **Governance unchanged:** PCE-1 authorizes only guard+executor deploy+verify; NO Safe config/unpause/fund/approve/
  quote/settle (each later stage needs a separate go-signal). B-1 OPEN, B-2/D-23 COUNSEL-PENDING, D-24 in force for
  production. Executor will deploy PAUSED / fail-closed.
- **Continuity gate:** TRIGGERED (live deployment verified + corrected runtime-hash understanding + repaired execution
  tool). Updated HANDOVER.md, CURRENT_STATE.json, CHANGELOG.md. Branch master, HEAD 5f71acc (unchanged; docs uncommitted).

## 2026-07-26 — TASK 10K-10: private canary execution-bundle finalization (PCE-1)

- **Type:** Offline/read-only technical finalization + reproducible build-config pin + non-broadcast rehearsal
  - sanitized offline artifacts + continuity; one local commit. **NO signing, broadcast, deploy, fund, Safe
    transaction (created or uploaded), approval, transfer, swap, settlement, canary, or external contact; no
    private key/mnemonic/RPC/API secret read or exposed. Preparation only — NOT the EXECUTE authorization.**
    Start HEAD 02f1a21 (PCE-1).
- **KL-1 resolved:** pinned `evm_version = "paris"` in a narrow `[profile.canary]` in
  packages/contracts/foundry.toml (default profile unchanged; a project-wide paris pin breaks the test/script
  build because OZ 5.6.1's MCOPY-using Bytes.sol is pulled in via Strings). Basis: Robinhood Chain is an
  Arbitrum Dedicated Blockchain (Nitro/Orbit), "fully EVM-compatible" per official docs, exact ArbOS/hardfork
  unpublished; paris predates PUSH0/MCOPY/transient/blobs, the frozen contracts need none, so paris bytecode
  is executable on every EVM >= paris and solc emits no MCOPY in the executor. No contract-logic change.
- **Reproducible build (two clean builds byte-identical):** solc 0.8.26+commit.8a97fa7a, optimizer 200, evm
  paris. Executor creation 0xbf0d3bb70372c0ed6598d451c7967a0f83b40c92ad219b1826c51cbb0d350fa0 (10564 B) /
  runtime 0x16c8afa9344bcbef44ceb073368d723ba7fba6f87fb83b74db9a9efded770908 (9256 B); guard creation
  0x9385b6b4bb6a94d3d09a2cd23abf2d449ac481a2c9f62c66ebf900c3eea20b34 (6985 B) / runtime
  0x4c5859271a39e5e9b86cff9932b433e292d79ba749ae3e6d66b8403ca5ea92e8 (4485 B). Constructor-args + deploy-data
  hashes recorded in the evidence.
- **Deployer read-only:** 0x7116...2ba2 (Owner 1; not interchangeable with the Safe) nonce 1, balance
  0.000483387 ETH, no code; predicted CREATE guard 0x57538680194D9E15Ba78bf243B10B440f663078d (nonce 1) +
  executor 0x17e060c41d34E89147bBAa1C364f6A6e58d2f84C (nonce 2), both empty. VALID ONLY while nonce == 1
  (nonce change = hard abort + full bundle regeneration).
- **Offline unsigned bundle:** packages/contracts/deploy/canary-bundle/{unsigned-deployment.json (creation
  bytecode + ctor args + predicted addresses + gas), unsigned-safe-transactions.json (Safe TX Builder config/
  unpause/settle-template/pause-recover; settle unresolved pending live quote), verification-manifest.json
  (read-only checks + expected results per stage)}. Deploy Safe-as-owner (no temp owner). 12 human-confirmed
  execution stages with per-stage abort conditions.
- **Rehearsal + verification:** 18-step lifecycle mapped to existing passing tests (item 10 aggregate-cap =
  operator-side stop, not a single on-chain cap). forge test --offline 513/513; rialto vitest 252/252;
  typecheck/lint/build clean; forge fmt + prettier clean. One documented skip: cast run full-tx fork replay
  (Robinhood Chain Arbitrum-Nitro encoding not deserializable by foundry 1.7.1; substituted with read-only
  JSON-RPC — stated, not concealed). Safe re-checked read-only: unchanged, inactive.
- **Gas/exposure:** gasPrice 0.05183 gwei; deploy gas guard 1,119,595 + executor 2,161,377; max
  all-inclusive exposure ~0.001555 ETH ~ $2.93 at live $1885/ETH vs the $130 cap (~44x headroom) — $130
  SAFELY covers the complete lifecycle (deploy + Safe-op + funding + settlement + fees + recovery gas +
  reserve). Min deployer funding ~0.000340 ETH (deployer already sufficient).
- **Governance unchanged:** B-1 OPEN/INCOMPLETE; B-2/D-23 COUNSEL-PENDING/INCOMPLETE; D-24 FULLY IN FORCE for
  production; PCE-1 single-use, not yet consumed. Status PRIVATE_CANARY_EXECUTION_BUNDLE_READY. Evidence
  docs/audit/BPS_PRIVATE_CANARY_EXECUTION_BUNDLE_2026-07-26.{md,evidence.json}. Commit `ops(canary): finalize
private execution bundle`.

## 2026-07-26 — PCE-1: one-time private canary exception (governance amendment + deploy packet)

- **Type:** Documentation only — governance amendment + exact technical deployment packet + continuity. The
  founder authorized (via chat) preparation + commit of a bounded, one-time, private guarded-settlement
  canary. **Claude prepared documentation only: NO broadcast, NO fund, NO deploy, NO Safe transaction, NO
  canary, NO token approval/transfer, NO external communication. No private key/mnemonic/RPC/API secret read
  or exposed.** Start HEAD d660421 (10K-9).
- **PCE-1 bounds:** exactly one WETH->NVDA acquisition cycle; **<= $130 all-inclusive exposure** (acquisition
  - gas); no public users; no production reuse; **mandatory pause + recovery** immediately after; single-use.
- **Gate handling (per explicit founder instruction):** **B-1 (independent audit) remains OPEN/INCOMPLETE**
  and **B-2/D-23 (counsel) remains INCOMPLETE/COUNSEL-PENDING** — PCE-1 does NOT satisfy, close, or downgrade
  either. **D-24 remains fully in force for production**; PCE-1 is a narrow carve-out for this one canary
  only and does not replace/expire/weaken/reinterpret D-24. The founder explicitly accepts the security +
  legal risk of proceeding without B-1/B-2 for this bounded private canary. No auditor/counsel names,
  signatures, or opinions were fabricated.
- **Technical bounds (frozen):** controller = the verified 2-of-3 Safe 0x62Ae5b22...5E62 as executor owner;
  per-acquisition cap 0.001 WETH (reviewed GuardedSettlementConfig value; executor hard ceiling 0.01 WETH);
  slippage <= 100 bps; oracle deviation 100 bps; deadline <= 300 s; feeds ETH/USD 0x78F3...d3A9 + NVDA/USD
  0x379E...9F15; approved router code hash 0xa7041268...27611 + selector 0x77963966; executor source sha256
  14d8e7ed...fe2f (commit 5181f1b); solc 0.8.26/opt 200. KL-1 (evm_version) must be pinned + bytecode verified
  before any build.
- **Execution preconditions (all human-performed, not by Claude):** a separate founder EXECUTE go-signal; an
  open NVDA trading session (feeds fresh < 900 s); a live Rialto allowance-mode quote obtained by the
  operator; a funded deployer; 2-of-3 Safe signatures. Then ONE cycle -> verify -> mandatory pause + recover
  to the Safe. No auto-broadcast exists in the repo.
- **Artifacts:** docs/decisions/BPS_PRIVATE_CANARY_EXCEPTION_2026-07-26.md;
  packages/contracts/deploy/PRIVATE_CANARY_DEPLOY_PACKET_2026-07-26.md;
  docs/audit/BPS_PRIVATE_CANARY_EXCEPTION_2026-07-26.evidence.json. Commit `ops(canary): record private canary
exception and deploy packet` (docs only; no code change).

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
