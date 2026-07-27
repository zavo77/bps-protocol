# BPS Launch Lab — Claude Design Brief

You are designing the public frontend of the **BPS RWA Launch Lab** inside an
existing Next.js 16 app. Claude Code builds all logic in parallel; this brief
defines the strict boundary so the two lanes never edit the same files.

## Worktree and branch

- Work ONLY in the worktree at `C:\Projects\bps-lab-design`.
- Commit ONLY to branch `feature/bps-launch-lab-claude-design`.
- Run `npm run lint` and `npm run typecheck` from `apps/web` for your changes
  before each commit (route-level checks are enough; do not run the full suite).

## File ownership — Claude Design owns ONLY

```text
apps/web/app/lab/**            (pages, lab layout, lab.css)
apps/web/components/lab/**     (presentational components)
apps/web/public/lab/**         (static assets, including the token image)
```

Component tests you write must live at `apps/web/app/lab/**/*.test.tsx`
(the vitest "dom" project only picks up tests under `app/`).

## Files you must NEVER touch

`apps/web/app/layout.tsx`, `app/page.tsx`, `app/providers.tsx`, `app/wagmi-*.ts`,
`app/AppDashboard.tsx`, `app/CanaryApp.tsx`, `app/CanaryBanner.tsx`, `app/demo.ts`,
`app/globals.css`, everything under `apps/web/lib/` outside `lib/lab/`,
`next.config.mjs`, `vitest.config.ts`, anything outside `apps/web`, and all
Capital Engine/canary/rialto files. If a change seems to require one of these,
stop and leave a note in your commit message instead.

Never put the literal strings `RIALTO_API_KEY`, `quote-client`,
`@bps/rialto/server`, or `fetchRialtoAllowanceQuote` in any non-test file
(a repo-wide scan test fails the build).

## Data contract

All data shapes come from `@bps/launch-lab` (`packages/launch-lab/src/types/index.ts`):
`LaunchFormData`, `AnchorVerification`, `FeePreset`, `LaunchManifest`,
`LaunchSimulation`, `PreparedLaunchTransaction`, `LaunchReceiptResult`,
`MarketSnapshot` (note `MarketDatum<T>` — render `available:false` as
"Awaiting indexed data", NEVER as a fabricated zero), `ProofRecord`,
and the UI enums `WalletUiState`, `CreateFlowState`, `MarketUiState`,
`TradeUiState`. Design every enum state.

Claude Code will deliver functional unstyled pages under `app/lab/` first; your
job is to replace their presentation while keeping props/state wiring intact
(hooks from `apps/web/hooks/lab/` are the integration points and are Code-owned).

## Routes

1. `/lab` — premium landing: hero ("Create community markets paired with
   real-world assets"), Genesis market status card, GOOGL anchor card with
   canonical contract verification, exact 85/10/5 fee economics, fee-preset
   showcase, 3-step "How it works", create CTA (allowlisted) + public market CTA,
   permanent-market explanation, and the disclosure (below). No fake volume,
   users, holders, TVL, or testimonials — ever.
2. `/lab/create` — 4-step flow (Token → Market → Review → Launch) per the state
   enums. The Review step must make every irreversible value unmistakable
   (beneficiaries, supply, fee, manifest + calldata hashes, simulation age).
3. `/lab/token/[address]` — token identity, GOOGL pairing, actual reserve,
   market status, fee transparency, locked status, trade action, Blockscout
   links. Missing data → "Awaiting indexed data".
4. `/lab/proof` — advisor-facing evidence trail (pending checklist before
   launch; full manifest/simulation/receipt/buy/sell links after).

## Visual direction

Warm off-white canvas; peach/orange highlights; deep near-black ink; premium
editorial typography; subtle glass/clay depth; restrained playful details;
crisp spacing; strong hierarchy; excellent mobile (no horizontal overflow);
visible transaction trust cues. Avoid: purple crypto gradients, casino styling,
neon, fake charts, meaningless stats, cramped dashboards, tiny legal copy,
generic component-library look. Do not restyle any non-lab page. The existing
site chrome is dark; give `/lab` its own self-contained light theme via
`app/lab/lab.css` scoped under the lab layout.

Fee-preset cards are a product differentiator: Balanced 1% / Creator 2% /
Degen 3% / Dynamic Protection (visibly disabled — "requires the decay
initializer, not yet deployed on Robinhood Chain").

## Token image (required deliverable)

Create `apps/web/public/lab/print-token.png`:
1024×1024 PNG; warm cream background; peach-orange dimensional print/stamp
symbol; deep-ink detailing; premium, playful, minimal; readable at 40×40;
NO Google/Alphabet/Robinhood/Uniswap/Doppler logos; no small text in the art.

## Mandatory language

Pairing: always "Paired with Alphabet Class A • Robinhood Token (GOOGL)".
Never "backed by Google", "Google-backed", "Alphabet-backed", "sponsored by",
or "affiliated with". Show this disclosure visibly on every lab page footer:

> Experimental independent market. BPS is not affiliated with or endorsed by
> Alphabet, Google, Robinhood, Doppler or Uniswap. GOOGL refers to the canonical
> Alphabet Class A Robinhood Stock Token used as the market's quote asset.
