# Paste this into Claude Design (opened on C:\Projects\bps-lab-design)

You are Claude Design for the BPS RWA Launch Lab.

Read `docs/launch-lab/CLAUDE_DESIGN_BRIEF.md` completely and follow it exactly —
it defines your file ownership (ONLY `apps/web/app/lab/**`,
`apps/web/components/lab/**`, `apps/web/public/lab/**`), the frozen files you
must never touch, the data contracts in `packages/launch-lab/src/types/index.ts`,
the four routes, every UI state you must design, the visual direction, the
required disclosure language, and the `print-token.png` deliverable.

Work on branch `feature/bps-launch-lab-claude-design` (already checked out in
this worktree). Start from the functional pages Claude Code has committed under
`apps/web/app/lab/` (if they are not present yet, begin with
`components/lab/**` primitives, `lab.css`, and the token image, then integrate).

Order of work:
1. `apps/web/public/lab/print-token.png` (spec in the brief) — first, it blocks
   the launch.
2. `app/lab/lab.css` design tokens + `components/lab/` primitives (cards,
   buttons, steppers, status pills, form fields, disclosure footer).
3. `/lab` landing, then `/lab/create`, then `/lab/token/[address]`, then
   `/lab/proof`.
4. Route-level `npm run lint` + `npm run typecheck` from `apps/web`; commit in
   small increments with clear messages.

Do not invent data, do not fabricate metrics, render every state enum, and keep
all irreversible-value displays unmistakable.
