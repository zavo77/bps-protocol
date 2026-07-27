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
- [ ] Hard gate: Doppler/GOOGL integration proof (build + exact simulation)
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

### 2026-07-27 — build start

- Recon (prior session turns): Doppler officially on 4663 via `@whetstone-research/doppler-sdk` 1.0.33; standard/scheduled/decay multicurve initializers NOT on 4663 — rehype multicurve (DopplerHookInitializer `0x4e3468951D49f2EEa976eD0D6e75fFCb44a9a544`) or LockableUniswapV3Initializer (`0xde8886A0019Ea060B8378Ee37b8A23b8117F29A3`) are the viable paths; NoOpMigrator/NoOpGovernanceFactory/StreamableFeesLockerV2 all present. Canonical GOOGL VERIFIED at `0x2e0847E8910a9732eb3fb1bb4b70a580ADAD4FE3` (API + Blockscout agree; multiplier 1.0).
- Committed Stage-A continuity checkpoint `06ff34b` on master (dedicated, unmixed, exact).
- Verified `.env.local` readiness (names only).
- Next: commit planning docs, branch, then the integration spike.
