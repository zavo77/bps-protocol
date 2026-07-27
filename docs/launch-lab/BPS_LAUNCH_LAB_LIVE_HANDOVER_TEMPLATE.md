# BPS RWA Launch Lab — Live Handover

> **Purpose:** Authoritative current state for a completely new Claude account or engineer with no chat history. Keep this file current after every meaningful action. Never store secret values.

## 1. Document control

- Last updated UTC:
- Updated by/session:
- Handover schema version: `1.0`
- Urgency/deadline:
- Current phase:

## 2. Project summary

- Product:
- Production target: `https://rwabps.com/lab`
- Current V1 scope:
- Explicitly deferred scope:
- One-sentence current objective:

## 3. Cold-start reading order

A new account must read, in order:

1. `docs/launch-lab/BPS_LAUNCH_LAB_BUILD_INTAKE_DESKTOP.md`
2. `docs/launch-lab/BPS_LAUNCH_LAB_MASTER_PROMPT_DESKTOP.md`
3. This file
4. `docs/launch-lab/BPS_LAUNCH_LAB_STATE.json`
5. Latest entries in `docs/launch-lab/BPS_LAUNCH_LAB_WORKLOG.md`
6. Relevant test, deployment, canary, and incident reports linked below

Before changing code, run the reconciliation commands in Section 22 and update any discrepancy here.

## 4. Repository state

- Local path:
- GitHub repository:
- Remotes:
- Current branch:
- HEAD commit:
- Latest pushed commit:
- PR URL/status:
- Working tree status:
- Uncommitted files and reasons:
- Latest safe checkpoint/tag:
- Rollback point:

## 5. Active milestone

- Milestone name:
- Objective:
- Status:
- Completed with evidence:
- In progress:
- Not started:
- Completion gate:

## 6. Architecture and protected boundaries

### Current architecture

```text
Describe the current web, package, indexer, database, RPC, Doppler, wallet-signing, and deployment flow.
```

### Capital Engine boundary

- Shared components Launch Lab may reuse:
- Files/contracts Launch Lab must not modify:
- Current integration boundary:
- Future integration extension points:

## 7. File map

| Path | Purpose | Key exports/behaviour | Status/TODOs | Last changed commit |
|---|---|---|---|---|

## 8. Dependencies and toolchain

- Node:
- Package manager/version:
- Next.js:
- React:
- viem:
- wagmi:
- Doppler SDK:
- Indexer framework:
- Database client/ORM:
- Sentry:
- 0x:

### Dependency changes

| Package | Old | New | Reason | Compatibility/tests | Rollback |
|---|---:|---:|---|---|---|

### Known advisories/caveats

- 

## 9. Launch template and economics

- Chain/network:
- Anchor and canonical-resolution method:
- Supply:
- Starting FDV:
- Curve/positions:
- Fee mode:
- Fee schedule:
- Beneficiary split:
- Migration/liquidity mode:
- Creator allocation:
- Tolerances:
- Irreversible settings:

## 10. Contracts and onchain state

| Role | Address | Network | Source of truth | Bytecode/whitelist verified | Verification link/status |
|---|---|---|---|---|---|

### Transactions

| Purpose | Tx hash | Block | Status | Notes |
|---|---|---:|---|---|

### Unverified assumptions

- 

## 11. Database and indexer

- PostgreSQL service:
- Schema/ORM:
- Current migrations:
- Applied environments:
- Rollback procedure:
- Indexer service:
- Start block:
- Latest indexed block:
- Lag/health:
- Idempotency/replay rules:
- Known data gaps:

### Tables

| Table | Purpose | Key columns | Migration |
|---|---|---|---|

## 12. Deployments and external services

### Vercel

- Team/account:
- Project:
- Production URL:
- Preview URL:
- Deployment ID/status:
- Branch mapping:
- Root/build settings:
- Rollback:

### Railway

- Project/environment:
- Services and IDs:
- Latest deployments/status:
- Linked PostgreSQL:
- Health endpoints:
- Rollback/restart:

### GitHub

- Branch:
- PR:
- Checks:
- Required approvals:

### Alchemy/RPC

- Provider/app name:
- Environments configured:
- HTTP/WSS/archive readiness:
- Last validation:

### Pinata

- Project/gateway:
- Upload/retrieval status:
- Last validation:

### Sentry

- Org/project:
- Environments:
- Test event status:

### Better Stack

- Source/monitor names:
- Alert destination:
- Test log/monitor status:

### 0x/trading

- Enabled/deferred:
- API integration status:
- Fallback link/route:

## 13. Sanitised credential/configuration inventory

> Never record values. Record only names, location, status, and validation metadata.

| Variable/credential | Purpose | Environments | Storage location | Status | Last validated | Notes/owner |
|---|---|---|---|---|---|---|

## 14. Feature flags and permissions

| Flag/permission | Local | Preview | Production | Last verified | Notes |
|---|---|---|---|---|---|
| `BPS_LAUNCH_LAB_ENABLED` |  |  |  |  |  |
| `BPS_LAUNCH_LAB_BROADCAST_ENABLED` |  |  |  |  |  |
| `BPS_LAUNCH_LAB_KILL_SWITCH` |  |  |  |  |  |
| Creator allowlist |  |  |  |  |  |

## 15. Commands and runbooks

### Safe/read-only

```text
Exact commands, working directories, and expected output.
```

### State-changing

```text
Exact commands and required approvals.
```

### Irreversible/manual wallet actions

```text
Exact sequence, maximum approved spend, and stopping point.
```

## 16. Testing and verification ledger

| UTC time | Commit | Command/check | Environment | Result | Evidence/gaps |
|---|---|---|---|---|---|

## 17. Mistakes, failures, incidents, and lessons

| ID/time | Symptom/error | Root cause | Attempts | Resolution/status | Avoid repeating |
|---|---|---|---|---|---|

Do not delete resolved failures. Mark them resolved and link the fixing commit or deployment.

## 18. Decisions and rejected alternatives

| Decision | Reason/evidence | Rejected alternatives | Reopen only if |
|---|---|---|---|

## 19. Security and audit state

- Wallet-signing boundary:
- Server-side key status:
- Kill-switch status:
- Allowlist status:
- Contract review status:
- Open security risks:
- Secrets scanning status:
- Irreversible actions completed:
- Irreversible actions awaiting approval:

## 20. Funds and canary accounting

- Approved maximum canary spend:
- Creator wallet address:
- Trader wallet address:
- Last checked gas balance:
- Last checked anchor balance:

| Asset/action | Amount | Recoverable? | Tx/status | Notes |
|---|---:|---|---|---|

## 21. Blockers, risks, and open questions

| Severity | Blocker/risk | Owner | Exact action/info needed | Parallel work/workaround |
|---|---|---|---|---|

## 22. Reconciliation commands for a new account

Run from the repository root before changing anything:

```powershell
pwd
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git remote -v
git status --short
node --version
npm --version
# Add the repository's package-manager, test, Vercel, Railway, and health-status commands once confirmed.
```

Then compare results with Sections 4, 8, 11, and 12. Update this handover before implementing.

## 23. Next exact actions

1. 
2. 
3. 

### First action for a brand-new account

- 

## 24. Linked reports and artefacts

- Takeover report:
- Test report:
- Deployment runbook:
- Canary report:
- Simulation reports:
- Incident reports:
- Relevant PRs/issues:
