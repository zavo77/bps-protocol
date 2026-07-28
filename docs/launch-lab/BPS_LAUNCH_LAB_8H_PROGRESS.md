# BPS Launch Lab — 8H Build Progress Log

Authoritative spec: `docs/launch-lab/BPS_LAUNCH_LAB_8H_VERCEL_MASTER_PROMPT.md`.
Founder blocker answers received 2026-07-27 (chat). Build started immediately after.

Newest entries at the top. No secrets ever recorded here.

## Fixed decisions (from the founder's single blocker answer)

- Token: **PRINT / PRINT**, description fixed, image at `apps/web/public/lab/print-token.png` (Claude Design creates; 1024×1024 PNG spec in the design brief).
- Wallets: creator `0x29244A2309B703F82E292A3db7df0e95d0cdca72`, creator-fee `0x261Cda9dADdfDC9A0b8de887718af516FA7ee9C2`, BPS-fee `0xF7F2d76F6364c72ea860512d78ae07e54bBbF8A5`. Creator doubles as initial test trader unless replaced before the buy test.
- Secrets: `ROBINHOOD_CHAIN_RPC_URL`, `PINATA_JWT`, `PINATA_GATEWAY` verified PRESENT (non-empty) in `apps/web/.env.local` on 2026-07-27; values never printed/committed.
- Funding: creator ETH **not yet funded**; trader GOOGL **not yet funded** (both in parallel). Launch/test-buy hard-stop on insufficient gas/GOOGL/eligibility.
- Product: FDV $20,500; preset BALANCED_1 (1%); Dynamic Protection visibly disabled (decay initializer not deployed on 4663); supply 1,000,000,000 PRINT; no minting; creator allocation 0 unless technically unavoidable (must be surfaced); fees 85/10/5 (creator/BPS/Airlock-owner); no-op migration; locked market subject to on-chain verification.
- Vercel: login available; project `bps-launch-lab`; production authorized after tests + preview verification.
- Launch: authorized after final review; hard stops before broadcast-enable, kill-switch-disable, and every signature (create/buy/sell/fee-collection).
- Caps: $50 per canary trade; $250 total economic exposure.

## Deployment state (2026-07-27, commit b06eceb)

- **Public production LIVE (fail-closed): https://bps-launch-lab.vercel.app/lab** — access mode
  `public` (any wallet may create once broadcast is enabled), broadcast **disabled**, kill switch
  **active**, GOOGL anchor verifying live, launches list honest-empty, guardrails 2/wallet + 3600s
  cooldown + 25/day, commit provenance baked via `--build-env BPS_SOURCE_COMMIT`.
- Public access retrofit COMPLETE: ACCESS_MODE modes, terms acknowledgement (required, in signed
  payload), replay protection, per-wallet/IP limits, chain-reconstructed launch registry +
  `/api/lab/launches` + Postgres mirror awaiting `DATABASE_URL`. 44 package + 189 web tests green.
- Open founder inputs: Claude Design session (styling + print-token.png), wallet funding, then the
  launch-gate approval.
- **LL-1 CLOSED (2026-07-27):** healthy RPC configured locally + Vercel Preview/Production; full hard-gate
  re-run green (modules/whitelists, GOOGL verified mid ≈$325.4, PRINT rehype simulation OK gas 3,596,358;
  refreshed `SPIKE_LAUNCH_PROOF.json`). Public-RPC fallback retained as resilience.
- **LL-2 CLOSED (2026-07-27):** Railway `bps-production`/`bps-postgres` (PostgreSQL 18.4). Verified via
  `packages/launch-lab/scripts/verify-db.mjs`: connectivity OK; additive/idempotent schema (2× run);
  mirror write + duplicate idempotency (ON CONFLICT no-op, transaction rolled back); cross-instance
  replay protection (second connection rejected); broken-URL failure caught → chain reconstruction
  serves reads. `DATABASE_URL` set in .env.local + Vercel Preview/Production (value never printed).
  Note: the production mirror has nothing to write until the first confirmed launch — engaged but empty.

## Railway indexer (2026-07-27, commit 25ace63)

- New workspace `apps/lab-indexer` (separate from the Capital Engine's `apps/indexer` skeleton):
  HTTP-polling only (no WSS); streams = Airlock Create (GOOGL + lab initializer; poolId via
  `DopplerHookInitializer.getState` → `computePoolId`) and PoolManager Swap for known lab poolIds;
  per-stream Postgres cursors (restart-resume verified live); additive/idempotent migrations
  (`lab_launches.pool_id` column, `lab_swaps`, `lab_indexer_cursor`); `/health` 200 on `0.0.0.0:$PORT`;
  optional Sentry (`SENTRY_DSN`) with secret-redacting beforeSend; all logs redacted (verified 0 raw URLs).
- Local smoke against live chain + Railway Postgres: migrate OK; caught up ~460 blocks; restart resumed
  from persisted cursor (20686635 → 20686775); health 200 both runs. 6 unit tests; eslint/prettier clean.
- Deployment handoff values issued to founder (root /, workspace-scoped npm commands, /health path).
- **RAILWAY HEALTH GATE PASSED (2026-07-27, founder-verified):** production /health 200 (db ok, lag==confirmations==3, knownPools 0 pre-launch). **Production restart-resume VERIFIED**: redeploy via CLI; new instance (uptime 3s) continued cursors 20717152→20717549 from Postgres, no reset to start block. Indexed-history endpoint /api/lab/history/[address] live on production ({available:true, swaps:[], source: lab-indexer}); creation path has zero dependency on the indexer service.

## Embedded bidirectional trading — P0 (2026-07-27, commit a92b2b2)

- **bpsDirectV4 (mandatory):** `packages/launch-lab/src/swaps` — pool context via SDK
  `getMulticurvePool.getState` (token-order-resolved from the live PoolKey, GOOGL-market fail-closed →
  clean 404 NOT_A_LAB_MARKET), hook-aware V4 Quoter exact-input quotes both directions, Universal Router
  `execute` V4_SWAP (SWAP_EXACT_IN_SINGLE + SETTLE_ALL + TAKE_ALL) calldata, Permit2 approval targets,
  price-impact estimate, common RouteQuote shape.
- **zeroEx (optional best-route):** `apps/web/lib/lab/zeroex.ts` — 0x v2 allowance-holder, server-only key,
  allowance spender taken from the response, **Settler-approval rejected**; no 0x route ≠ market failure.
- **APIs:** `POST /api/lab/quote` (both routes + selected by better output; **no longer 501** — verified
  live 404 fail-closed on a non-lab token) and `POST /api/lab/trade/prepare` (signed envelope, server-side
  quote refresh, balance/allowance checks, exact-calldata simulation vs taker, unsigned tx out; no server
  signer). Origin/host/payload-hash/TTL/replay/rate-limit/secret-redaction all applied.
- **UI:** trade card on `/lab/token/[address]` (Buy/Sell, balance, Max + 25/50/75, expected/min output,
  price-impact warning, slippage presets, route label+switch, Permit2/ERC20 approvals, all wallet/chain/
  error states, Blockscout receipt); real-swap **PriceChart** from `/api/lab/history` (sqrtPriceX96 →
  price-in-GOOGL, 1H/6H/24H/All, honest "Collecting market data"); Matcha demoted to secondary.
- **Verify:** 208 web + 54 package tests green; lint/typecheck/prod build clean; client-bundle scan finds
  no secret values or names (incl. ZEROX_API_KEY, server-only). Production redeployed (broadcast OFF).
- **LIVE bidirectional proof (gate items 2–11) DEFERRED to the launch sequence** — a BPS market must
  exist on-chain to quote/buy/sell/index, and only the Genesis launch creates one. The first real market
  is the trading acceptance test, executed at the founder launch gate (broadcast enabled only then).

## Milestones

- [x] Consolidated blocker question asked and answered
- [x] Recon: Doppler-on-4663 feasibility, canonical GOOGL verified, web-app architecture mapped
- [x] Stage-A continuity checkpoint commit on master (`06ff34b`)
- [x] Launch Lab planning docs checkpoint commit on master
- [x] Feature branch `feature/bps-launch-lab-8h-vercel`
- [x] Hard gate: Doppler/GOOGL integration proof — **PASSED** (rehype multicurve; live-mainnet simulation OK; see `SPIKE_LAUNCH_PROOF.json`)
- [ ] Interface scaffold (stable TS contracts) committed
- [ ] Design worktree + brief + prompt ready
- [ ] packages/launch-lab core (anchor/config/doppler/fees/manifest/metadata/pricing/receipts/registry/simulation/swaps/types/validation)
- [ ] API routes /api/lab/* (signature-gated, fail-closed)
- [ ] /lab routes (design-integrated)
- [ ] Critical tests green (lint, typecheck, unit, build)
- [ ] Vercel preview deployed + QA
- [ ] Vercel production deployed (broadcast disabled, kill switch on)
- [ ] Final launch review card → founder approval
- [ ] Genesis PRINT launch via public /lab/create (founder signs)
- [ ] Test buy + partial sell (founder signs)
- [ ] /lab/proof complete; genesis registry updated; final redeploy

## Log

### 2026-07-27 — core package + API layer complete

- `@bps/launch-lab` modules landed: config (fail-closed flags/env), anchor (GOOGL fail-closed resolver, multiplier-aware), doppler (module+whitelist verification, 85/10/5 beneficiaries, rehype launch builder, exact simulation → unsigned tx), manifest (canonical hash), metadata (Pinata-only broadcastable, strict validation), receipts (decode + hard verify vs manifest), validation (zod), genesis registry. 42 unit tests green; typecheck + eslint + prettier clean.
- `/api/lab/*` routes: config, anchor/googl, metadata (multipart, EIP-191 envelope), prepare, simulate, token/[address], proof, quote(501 until trading phase). Same-origin + rate limits + allowlist + host/payload-hash binding; `server-only` enforced; `transpilePackages` added preserving the `bps-wagmi-active` alias.
- Non-secret dev flags committed in `apps/web/.env.development` (broadcast OFF, kill switch ON).
- In flight (parallel agents): client hooks/providers + functional /lab pages; trading + reserve-read research for the post-launch phase.

### 2026-07-27 — HARD GATE PASSED (Doppler/GOOGL integration proof)

- `packages/launch-lab` scaffolded; `@whetstone-research/doppler-sdk@1.0.33` pinned (single viem 2.55.8 instance; root `.npmrc` gains `legacy-peer-deps=true` for the SDK's React 18 peer on our React 19 tree).
- Spike `packages/launch-lab/scripts/spike-launch-proof.mjs` (read-only; RPC redacted) PASSED against live 4663:
  chainId OK; modules airlock/dopplerHookInitializer/rehypeDopplerHookInitializer/noOpMigrator/noOpGovernanceFactory/dopplerERC20V1Factory all have bytecode; Airlock owner `0x21E2ce70511e4FE542a97708e89520471DAa7A66`; whitelist states 3/4/2/1 as expected (rehype hook is whitelisted inside DopplerHookInitializer, not Airlock — state 0 there is correct); GOOGL re-verified (API+on-chain, mid ≈$323.9, multiplier 1.0); 85/10/5 beneficiaries sum==WAD.
- **Exact simulation OK (rehype multicurve, noOp governance + noOp migration, DopplerERC20V1 token, fee 10000 = 1%, FDV $20,500, two curves 60/40 to 'max')**: predicted token `0xC3Dab5aF881C69F8CfB0Fa3270b8529fC404817A` (placeholder tokenURI — final address will differ), poolId `0xef83d635e3b256368dceb8abcfc4e27a68d27928ff529aded68c20354bbe6808`, gasEstimate 3,577,075.
- `standard` multicurve mode fails on 4663 with "Multicurve initializer address not configured" — recorded as the documented reason the rehype path is used.
- Artifact: `docs/launch-lab/SPIKE_LAUNCH_PROOF.json` (redacted).

### 2026-07-27 — build start

- Recon (prior session turns): Doppler officially on 4663 via `@whetstone-research/doppler-sdk` 1.0.33; standard/scheduled/decay multicurve initializers NOT on 4663 — rehype multicurve (DopplerHookInitializer `0x4e3468951D49f2EEa976eD0D6e75fFCb44a9a544`) or LockableUniswapV3Initializer (`0xde8886A0019Ea060B8378Ee37b8A23b8117F29A3`) are the viable paths; NoOpMigrator/NoOpGovernanceFactory/StreamableFeesLockerV2 all present. Canonical GOOGL VERIFIED at `0x2e0847E8910a9732eb3fb1bb4b70a580ADAD4FE3` (API + Blockscout agree; multiplier 1.0).
- Committed Stage-A continuity checkpoint `06ff34b` on master (dedicated, unmixed, exact).
- Verified `.env.local` readiness (names only).
- Next: commit planning docs, branch, then the integration spike.

## 2026-07-27 — Rialto primary RWA routing + frozen V1 UI + final completion gate (commit 01c8cfd)

- Frozen V1 routing implemented and deployed: Rialto → 1inch → 0x one-step first, composed
  Rialto payment↔anchor + BPS Direct anchor↔token as the normal path, anchor-direct advanced only.
- 17-agent adversarial review before deploy; 13 confirmed findings all fixed (token/value binding in
  prepare-leg, server-side priority chain, 1inch spender fail-closed, sell one-step approvals, sell
  composed minimum, stale-quote refresh, simulation-required signing, re-entrancy guard, success-state
  quote retirement, tab locking, sell-recovery coverage, ACTUAL-delta pinning test, fee display test).
- Gate: 307 web + 53 pkg + 9 indexer tests, lint/typecheck/build clean, client-bundle secret scan clean.
- Preview + Production deployed fail-closed (public / broadcast false / kill true), health verified at
  commit 01c8cfd. BLOCKER LL-4: RIALTO_API_KEY not in Vercel → deployed Rialto dormant until founder adds it.

## 2026-07-27 — RIALTO_API_KEY activated: production Rialto routing live-verified (e3178a3, 48a7c8d)

- route-probe diagnostic added; all 8 founder pairs fill via Rialto in production (5 bps, exact spender,
  native ETH approval-free, ETH pairs simulate exact calldata). Trade-card BUY one-steps via Rialto on a
  live external GOOGL Doppler market; SELL surfaces honest NO_POOL_LIQUIDITY (empty anchor reserves in a
  fresh pool — market state, root-caused to nested NotEnoughLiquidity under UnexpectedRevertBytes).
- Deployed-asset secret scans clean. 312+56+9 tests green. LL-4 closed; posture unchanged
  (public / broadcast false / kill true).

## 2026-07-27 — route-probe gated + GENESIS LAUNCH CARD assembled (cc3e782)

- route-probe: flag-gated (BPS_LAUNCH_LAB_ROUTE_PROBE_ENABLED), 404 in production, takers stripped.
- 16-item final gate green. Card: docs/launch-lab/GENESIS_LAUNCH_CARD.json — final Pinata upload,
  predicted token 0xdfcd0343…129c / poolId 0xbdee8caa…4743, gas 3,576,414 (~0.000135 ETH),
  manifest 0xb54f8063…3f9d, calldata 0x123e339f…0776. Description PROPOSED, awaiting founder text.
- Broadcast off, kill switch on, no signature requested.

## 2026-07-27 — Genesis card v2 FROZEN (founder corrections)

- PRINT / GOOGL display + numeraire assertion; FINAL description; metadata re-uploaded
  (QmXLeDV8…3DoT); actor mode A (founder). New prediction: token 0x8B400Cab…D8C8,
  pool 0x48055552…3396, block 21012000. Prior hashes invalid. Broadcast off, kill on.

## 2026-07-28 — ⚠ LIVE acceptance-test posture enabled (founder-authorized)

- Production: public / broadcast TRUE / kill switch FALSE (health-verified, commit 418b3c6).
  Preview stays fail-closed. Genesis card demoted to rehearsal-only, execution_authorized=false.
  Zero pre-created state (0 manifests, 0 verified rows, no allowlist consulted in public mode).
  Advisor signs in-browser; engineering stopped before any signature.

## 2026-07-28 — P0 shell removal: full public product experience (commit af014cf)

- Production FIRST restored fail-closed (broadcast false / kill true) per founder P0 — live posture
  above SUPERSEDED pending fresh authorization. Restricted-beta shell removed from all public routes;
  / → /lab/tokens; legacy dashboard intact at /protocol. Public header Markets/Launch/Profile/Connect
  wallet; welcoming connect UX; compact stepper; "Launch market" action. Visual gate passed with real
  Production screenshots (1440×900 + 390×844) + identical-commit E2E connected capture; all pages:
  0 console errors, no overflow, no beta/debug wording. 314+56+9 tests, lint/typecheck/build/secret
  scans clean.

## 2026-07-28 — P0 wallet-scoped wizard + consumer review (27b71c1)

- Wallet identity boundary wipes all wizard state on address change/disconnect (root cause of the
  stale-MAG7 sighting); per-(chain,wallet) text drafts; Start over. Consumer review + collapsed
  Advanced contract details; server flags/gates/commit removed from UI; closed state = one plain line.
- REAL two-wallet production acceptance passed on deployed 27b71c1 (fail-closed): empty fresh Step 1,
  wallet A full flow to review, wallet B same-browser fully clean incl. reload. 6 screenshots.
