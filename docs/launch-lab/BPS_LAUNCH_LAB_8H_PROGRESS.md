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
