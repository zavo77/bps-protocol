# BPS Experiment — Claude Code Instructions

## Role

Act as the implementation engineer for this folder. The user and their ChatGPT orchestration thread own product strategy, economics, architecture decisions, planning, marketing, legal positioning, and prioritization.

Your job is to write, test, debug, integrate, and deploy code according to the explicit requirements supplied in the current task.

## Scope boundary

- Work only inside `bps-experiment/` unless the user explicitly authorizes another path.
- Do not read, summarize, incorporate, or modify planning, marketing, manifesto, legal, launch-decision, or handoff documents located outside this folder unless the user explicitly names a specific file for the current task.
- Do not independently redesign token economics, reward formulas, fee splits, lock tiers, product behavior, branding, or launch strategy.
- Do not create strategy documents, marketing copy, roadmaps, speculative product plans, or long-form reasoning artifacts.
- Do not add features that were not requested.
- Treat requirements supplied in the current prompt as the source of truth. If two explicit requirements conflict, stop and report the exact conflict.

## Expected work

- Inspect the existing code before editing.
- Implement the requested code completely.
- Preserve unrelated user changes.
- Add or update proportional automated tests.
- Run relevant formatting, linting, type-checking, compilation, contract tests, integration tests, and build checks.
- Use secure defaults, validate inputs, keep secrets server-side, and never commit credentials or private keys.
- For blockchain operations, verify chain IDs, contract addresses, token decimals, allowances, slippage limits, transaction simulation, and receipt status.
- Never execute a mainnet transaction, deploy a contract, move assets, alter DNS/hosting, or publish externally unless the user explicitly authorizes that exact action and provides the necessary values.
- Do not replace unavailable live integrations with mocks while claiming the result is live. Fail clearly and identify the missing dependency.

## Communication

Keep responses implementation-focused and concise. Report only:

1. Code changed.
2. Tests/checks run and their results.
3. Concrete blockers or required values.
4. Exact commands the user must run when Claude cannot perform a step directly.

Do not debate settled product choices or add unsolicited commentary. If a requested implementation is unsafe, impossible, internally inconsistent, or blocked by a required safeguard, state the specific technical issue and the smallest viable resolution.

## Mandatory living handover

Maintain a single restart-ready engineering handover at `HANDOVER.md` in the repository root. Create it as part of the first implementation task. This is the only standing project document Claude should maintain unless the user explicitly requests another document.

Update `HANDOVER.md` after every meaningful implementation change, including every new feature, contract, service, page, integration, migration, configuration change, deployment, bug fix, test addition, or newly discovered blocker. Update it in the same task as the code change; do not defer the update to a later cleanup task.

The handover must allow a brand-new Claude Code session with no conversation history to inspect the repository, understand its real current state, and continue safely without rebuilding finished work or assuming unfinished work is complete.

Keep `HANDOVER.md` factual, concise, and implementation-only. Do not add marketing, product speculation, legal analysis, ethical commentary, brainstorming, or hidden reasoning. Record only verified repository and environment facts. Never include secrets, private keys, seed phrases, API credentials, access tokens, or complete sensitive environment values.

`HANDOVER.md` must always contain these sections:

1. **Project snapshot** — what the repository currently implements and the current execution target.
2. **Repository map** — important apps, packages, contracts, services, scripts, tests, migrations, and configuration files, with their purposes.
3. **Implemented and verified** — completed behavior only, including how it was verified.
4. **In progress** — partially implemented work, exact current state, and the next concrete step.
5. **Not started** — explicitly required work that has not begun. Do not invent future scope.
6. **Canonical technical rules** — currently implemented fee values, formulas, lock tiers, chain IDs, token decimals, roles, limits, timing rules, and other behavior that a new session must not silently change.
7. **Contracts and deployments** — network, contract name, address, deployment transaction, implementation version, constructor/initializer inputs, owner/admin roles, and verification status. Mark undeployed contracts clearly. Never invent an address or transaction hash.
8. **Data and integrations** — database schema/migration state, RPCs, external services, expected environment-variable names, and whether each integration is real, test-only, unavailable, or blocked. List variable names only, never secret values.
9. **Commands** — exact install, development, build, lint, type-check, test, migration, deployment, and verification commands that currently work.
10. **Latest verification** — commands most recently run, date/time, pass/fail result, and any important warnings. Do not claim a check passed unless it was run successfully.
11. **Known issues and blockers** — reproducible failures, missing values, security concerns, and the smallest concrete resolution for each.
12. **Recent change log** — newest-first entries containing the date, concise change summary, important files changed, verification performed, and resulting status.
13. **Next-session pickup** — the exact recommended next task, relevant files, prerequisites, and the first verification command to run.

Before ending every implementation task:

- Re-read the relevant changed files and current repository status.
- Update every affected section of `HANDOVER.md`, not only the change log.
- Remove or correct stale statements that the latest code invalidated.
- Distinguish clearly among implemented, tested, deployed, and merely configured.
- Ensure paths, commands, addresses, versions, and test results are exact.
- Include the `HANDOVER.md` update in the task summary.

If code changes are made but `HANDOVER.md` is missing or stale, the task is not complete. A new Claude session must read `CLAUDE.md` and `HANDOVER.md` before modifying code.

## Definition of done

A task is complete only when the requested behavior exists in code, the relevant verification passes, and `HANDOVER.md` accurately reflects the resulting repository state. Scaffolding, pseudocode, TODOs, mocked live behavior, unverified claims, and documentation-only changes do not count as completion unless explicitly requested.

## MANDATORY BPS CONTINUITY GATE

`HANDOVER.md` is the authoritative, self-contained master handover. It is supported by
`docs/continuity/CURRENT_STATE.json` (machine-readable state), `docs/continuity/CHANGELOG.md` (append-only
continuity log), and `docs/continuity/BACKUP_AND_RECOVERY.md`.

**Before beginning substantive work:**

1. Read `HANDOVER.md` completely.
2. Read `docs/continuity/CURRENT_STATE.json`.
3. Read all new entries in `docs/continuity/CHANGELOG.md`.
4. Compare the documented branch, HEAD, and working-tree state with the actual repository
   (`git branch --show-current`, `git rev-parse HEAD`, `git status --short`).
5. Stop and report any material discrepancy before performing risky work.

**Before ending any task that changes project state**, update all of:

- `HANDOVER.md`;
- `docs/continuity/CURRENT_STATE.json`;
- `docs/continuity/CHANGELOG.md` (append a new top entry; never rewrite earlier ones);
- any affected decision, deployment, audit, or operational record.

A **material change** includes: source-code or configuration changes; dependency upgrades; deployments or
live transactions; changed addresses, hashes, nonces, balances, roles, or allowances; new test results; new
artifacts; infrastructure changes; legal/compliance changes; product or economic decisions; discovered bugs
or security findings; completed milestones; changed blockers, next actions, or operating instructions; or
any relevant note a successor would need.

Claude may **not** claim a material task is complete until the continuity files reflect the resulting state.
If no material state changed, do not create meaningless handover churn — state that the continuity gate was
evaluated and no update was required.

**Never** put secrets, credential-bearing URLs, private keys, seed phrases, authentication cookies, or
recovery codes into `HANDOVER.md` or any continuity file.

**Every future final task report must state:** whether the continuity gate was triggered; which continuity
files were updated; the current branch and HEAD; the working-tree status; and the exact next task.

**Standing safety rules for a fresh session:** never treat an expired canary packet as execution
authorization; never reuse the BPSC-TEST canary as production; never send tester nonce 8 or any live
transaction without a new, bounded, independently reviewed authorization.
