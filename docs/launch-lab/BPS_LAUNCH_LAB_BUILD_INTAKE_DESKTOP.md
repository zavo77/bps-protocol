# BPS RWA Launch Lab — Desktop App Build Intake

Fill this once before starting Claude Code. Put secret values directly into local/Vercel/Railway environment settings; do **not** paste private keys or seed phrases into chat.

> Intake inspection performed 2026-07-26 by a read-only Claude Code session at repo
> `C:\Projects\bps-experiment` (branch `master`, HEAD `5f71acc2ddc178a4aca95a8eae42bf08033389e3`).
> Entries below are marked **(confirmed)** when verified by a read-only command, or
> **(inferred)** when deduced but not directly verified. Unmarked/blank fields are for the user.

## A. Repository and local machine

- Local repository path: `C:\Projects\bps-experiment` **(confirmed — the pre-filled `C:\Projects\bps-protocol` does not match this repository; no such path was inspected)**
- GitHub repository URL: **none — no git remote is configured (confirmed via `git remote -v`)**
- Current production branch: **none — no remote exists; only local branch is `master` (no `main` branch) (confirmed)**
- Current working branch: `master` **(confirmed; HEAD `5f71acc2ddc178a4aca95a8eae42bf08033389e3`)**
- Is the working tree clean? **yes, except the untracked `docs/launch-lab/` folder containing this intake (confirmed via `git status --short`)**
- Package manager: **npm (confirmed — only lockfile is `package-lock.json`; npm workspaces monorepo; Node v24.18.0, npm 11.16.0; pnpm and yarn are not installed)**
- Is Claude Desktop updated to the latest version? `yes/no` (user to confirm)
- Is the **Code** tab available? `yes/no` (user to confirm)
- Is the repository folder selected and approved as the Code session working folder? **This inspection session ran against `C:\Projects\bps-experiment` (confirmed); user to confirm this is the intended folder going forward**
- Will Claude Desktop remain open while local repository work is running? `yes/no` (user to confirm)
- Is Computer Use enabled for browser/login assistance if needed? `yes/no` (optional; manual login is acceptable)
- Is `git` authenticated for push? **no — no remote is configured, so push is not currently possible (confirmed)**
- Is `gh auth status` working? **no — the GitHub CLI (`gh`) is not installed on this machine (confirmed 2026-07-26)**
- Is Vercel CLI authenticated? **no — the Vercel CLI is not installed on this machine (confirmed 2026-07-26)**
- Is Railway CLI authenticated and linked to the correct project? **Authenticated: yes (account `sonos2101@proton.me`, workspace "zavo77's Projects") (confirmed 2026-07-26). Linked project: `wonderful-emotion` with service `zavo` (deploys from GitHub `zavo77/zavo`) — this does not appear to be a BPS project. USER MUST CONFIRM whether this is the correct project or link the correct one.**

## B. Production application

- Production URL: `https://rwabps.com`
- Vercel team/account: (user to fill — Vercel CLI not installed, cannot inspect)
- Vercel project name: (user to fill)
- Does `rwabps.com` already point to this Vercel project? **no (inferred) — DNS A record resolves to `82.221.139.124`, which is not a Vercel edge IP (confirmed via DNS lookup 2026-07-26; `www.rwabps.com` CNAMEs to the apex). The domain does not currently appear to be served by Vercel.**
- Existing production deployment branch: (user to fill)
- Existing preview deployment policy: (user to fill)
- Existing build command (if known): **repo root: `npm run build` (builds `@bps/shared` then all workspaces); web app alone: `next build` in `apps/web` (confirmed from package.json). No `vercel.json` exists anywhere in the repo (confirmed).**
- Existing root directory setting (if monorepo): **no `vercel.json` or `.vercel/` directory exists in the repo (confirmed); `apps/web` is the Next.js app root (inferred as the likely Vercel root-directory setting — NOT a confirmed Vercel project setting)**

### B.1 OrangeWebsite VPS `82.221.139.124` (added by read-only inspection 2026-07-26)

- DNS: `rwabps.com` A `82.221.139.124`; `www.rwabps.com` CNAME to apex **(confirmed)**
- Front server: **Caddy (confirmed — `Server: Caddy` response header over HTTPS)**
- Current production content: a **19-byte `text/plain` stub responding "BPS server is ready"** at `/` **(confirmed by page fetch)** — this is NOT the Next.js app in `apps/web` of this repository
- Source repository for the VPS: **this repo contains NO deployment tooling for it — no Dockerfile, compose file, Caddyfile, deploy script, CI config, or git remote, and no reference to the VPS IP or `/opt/bps` outside `docs/launch-lab/` (confirmed)**; whatever serves the stub was not deployed from `C:\Projects\bps-experiment` (inferred, high confidence)
- SSH inspection status: **BLOCKED (2026-07-26).** A local key `C:\Users\Administrator\.ssh\bps_orange_deploy` (comment `bps-orange-deploy`) exists and the host is in `known_hosts` **(confirmed)**, but the private key is **passphrase-protected**, no ssh-agent is running, and the Windows `ssh-agent` service is **Stopped/Disabled** **(confirmed)** — so no non-interactive SSH auth is currently possible. Login attempts as `deploy`/`bps`/`root` were rejected, but the encrypted key was never actually offered, so the correct username remains **unknown**.
- Unverified until SSH access works (user clues, NOT confirmed): app root `/opt/bps`; compose file `/opt/bps/compose.yaml`; Caddy config `/opt/bps/caddy/Caddyfile`; container `bps-caddy`; VPS OS/CPU/RAM/disk; service names; app/container ports; env-file path; deployed image/tag/branch/commit; build location; deploy/rollback commands; volumes; database; health endpoints/logs.

## C. Railway and database

- Railway project name: **currently linked: `wonderful-emotion` (project ID `8210a40b-2706-467e-bb40-5a78d6808db5`) (confirmed 2026-07-26) — appears unrelated to BPS; user must confirm or relink**
- Railway production environment name: **`production` (environment ID `5b882b32-1274-402d-92f6-0e76ce4cfd03`) for the currently linked project (confirmed)**
- Web/API service name (if any): **`zavo` (Online; deploys from GitHub `zavo77/zavo`) in the linked project (confirmed present) — appears unrelated to this repository**
- Indexer service name: **none found in the linked Railway project (confirmed). This repo's `apps/indexer` is a health-check skeleton only and is not deployed anywhere (confirmed from repo).**
- PostgreSQL service name: **`zova-indexer` (Postgres, Online) in the linked project (confirmed)**
- Does the web app already use Railway Postgres? **no — `packages/db` in this repo is a placeholder; no database schema or migrations are implemented (confirmed from repo)**
- Are backups enabled? (user to fill — not inspectable read-only from this session)
- Existing migration command (if known): **none — no database migrations exist in this repository (confirmed)**
- Railway deployment method: **for the currently linked (possibly unrelated) service `zavo`: GitHub (inferred from `railway status` repo field). Nothing from this repository is deployed to Railway; no `railway.json`/`railway.toml`/`Procfile`/`nixpacks.toml`/Dockerfile exists in the repo (confirmed).**

## D. Robinhood Chain and wallets

- Creator/admin allowlist wallet address(es):
- BPS platform fee beneficiary address (preferably Safe/multisig):
- Canary creator wallet address:
- Canary trader wallet address (can be same):
- Wallet has Robinhood Chain ETH for gas: `yes/no`
- Wallet has a small amount of canonical NVDA Stock Token for canary buy: `yes/no`
- Maximum canary capital permitted:
- Mainnet broadcast authorised after tests: `yes/no`

Never provide a seed phrase or private key. The launch transaction must be signed in the connected browser wallet.

## E. Infrastructure credentials

Set these securely. Mark each `ready/not ready`.

### RPC
- `ROBINHOOD_RPC_URL` — Alchemy/private mainnet HTTP endpoint:
- `ROBINHOOD_WS_URL` — Alchemy/private mainnet WebSocket endpoint:
- Optional archive endpoint if different:
- Alchemy app domain restrictions configured: `yes/no/not available`

Note (confirmed): the existing repo `.env.example` uses the name `ROBINHOOD_CHAIN_RPC_URL` (HTTP only); `ROBINHOOD_RPC_URL` and `ROBINHOOD_WS_URL` do not currently exist as configured names in this repository.

### Metadata / IPFS
- `PINATA_JWT`:
- `PINATA_GATEWAY` (for example `your-gateway.mypinata.cloud`):

### 0x / trading
- `ZEROX_API_KEY`:
- Use integrated 0x swap in alpha if feasible: `yes/no`
- Otherwise use an external trade link: `yes/no`

### Sentry
- `NEXT_PUBLIC_SENTRY_DSN`:
- `SENTRY_AUTH_TOKEN`:
- `SENTRY_ORG`:
- `SENTRY_PROJECT`:

### Better Stack
- `BETTERSTACK_SOURCE_TOKEN`:
- `BETTERSTACK_INGESTING_HOST`:
- Optional `BETTERSTACK_UPTIME_API_TOKEN`:
- Alert destination email/app configured: `yes/no`

### Vercel automation (only if CLI login is unavailable)
- `VERCEL_TOKEN`:
- `VERCEL_ORG_ID`:
- `VERCEL_PROJECT_ID`:

Note (confirmed): the Vercel CLI is not installed, so CLI login is currently unavailable — either install/authenticate the CLI or provide these automation values.

### Railway automation (only if CLI login is unavailable)
- `RAILWAY_TOKEN`:
- Railway project/environment/service IDs if required:

Note (confirmed): Railway CLI login is active (2026-07-26), so `RAILWAY_TOKEN` is likely unnecessary — but the linked project must be confirmed/corrected first.

### GitHub automation (only if `gh auth` is unavailable)
- Fine-grained GitHub token with minimum repository permissions:

Note (confirmed): `gh` is not installed and no git remote exists — either install/authenticate `gh` and add a remote, or provide a token.

## F. Product decisions for the live canary

- Public route: `https://rwabps.com/lab`
- Create route public but wallet-allowlisted: `yes`
- Token/pool pages public: `yes`
- Initial anchor: `NVDA`
- Fixed total supply: `1,000,000,000`
- Starting FDV for canary: `$20,500 / $50,000 / custom`
- Canary fee preset:
  - `static 1%`
  - `dynamic 1% terminal, 80% start, 60 sec decay`
  - another tested preset
- Creator fee-pot share: `85%` (confirm/change)
- BPS fee-pot share: `10%` (confirm/change)
- Doppler/protocol fee-pot share: `5%`
- Creator token allocation: `0%` for canary
- No separate graduation: `yes`
- Permanent/no-op market intended: `yes`, but only after exact module/exit-path verification
- Canary name/ticker (must look like a test):
- Integrated 0x swap is `must/should/defer`
- External chart provider preference: `GeckoTerminal/Defined/Dexscreener/auto`

## G. Deployment gates

- May Claude deploy web to Vercel production automatically? `yes/no`
- May Claude deploy Railway indexer/database migrations automatically? `yes/no`
- May Claude enable the production `/lab` feature flag automatically? `yes/no`
- May Claude proceed up to, but not sign, the token launch? `yes`
- Who will connect the browser wallet and sign the mainnet canary transaction?

## H. Existing secrets location

Tell Claude only where secrets are stored, not their values:

- Local development env file path: **none exists — no `.env` file is present; only the names-only template `.env.example` at the repo root (confirmed 2026-07-26)**
- Vercel env already configured: (user to fill — Vercel CLI not installed, cannot inspect)
- Railway shared/service variables already configured: (user to fill — not inspected; the currently linked project appears unrelated to BPS)
- Secret manager used, if any:


## I. Desktop session permissions and stopping rules

- May Claude create/switch branches and commit locally? `yes/no`
- May Claude push the feature branch to GitHub? `yes/no`
- May Claude open browser login pages for Vercel/Railway/GitHub? `yes/no`
- May Claude run package installation commands after checking compatibility? `yes/no`
- May Claude apply database migrations in Railway production? `yes/no`
- May Claude deploy the web app to Vercel production? `yes/no`
- May Claude deploy/restart Railway services? `yes/no`
- Must Claude stop before every irreversible mainnet transaction? `yes`
- Who will remain available to approve desktop permission prompts and wallet signatures?

## J. Continuous handover and replacement-account readiness

- Continuous handover required after every meaningful progress step: `yes`
- Canonical live handover path: `docs/launch-lab/BPS_LAUNCH_LAB_LIVE_HANDOVER.md`
- Append-only worklog path: `docs/launch-lab/BPS_LAUNCH_LAB_WORKLOG.md`
- Machine-readable state path: `docs/launch-lab/BPS_LAUNCH_LAB_STATE.json`
- May Claude update and commit these files with every milestone? `yes/no`
- May Claude create sanitised service/credential inventories without secret values? `yes/no`
- Preferred replacement-account bootstrap owner/contact:
- Maximum acceptable handover staleness during active work: `one meaningful action`

For each external credential/integration, record only the non-secret metadata below. Do not paste values:

| Credential or variable | Required environments | Storage location | Status | Last validated | Notes/owner |
|---|---|---|---|---|---|
| `ROBINHOOD_RPC_URL` | local, Railway, Vercel if server reads require it | unknown | not ready — no local `.env` exists (confirmed) | 2026-07-26 (checked, absent) | repo currently names this `ROBINHOOD_CHAIN_RPC_URL` in `.env.example` |
| `ROBINHOOD_WS_URL` | Railway indexer | unknown | not ready — not present in repo config (confirmed) | 2026-07-26 (checked, absent) | no WS endpoint name exists in `.env.example` |
| `DATABASE_URL` | local, Railway services | unknown | not ready locally — no `.env` (confirmed); a Postgres service `zova-indexer` exists in the currently linked (unconfirmed) Railway project | 2026-07-26 | linked-project correctness unconfirmed |
| `PINATA_JWT` | local/server, Vercel | unknown | not ready — not present in repo config (confirmed) | 2026-07-26 (checked, absent) | user to provision |
| `PINATA_GATEWAY` | local/server/public retrieval | unknown | not ready — not present in repo config (confirmed) | 2026-07-26 (checked, absent) | user to provision |
| `ZEROX_API_KEY` | server/Vercel if enabled | unknown | not ready — not present in repo config (confirmed) | 2026-07-26 (checked, absent) | user to provision |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel | unknown | not ready — not present in repo config (confirmed) | 2026-07-26 (checked, absent) | user to provision |
| `SENTRY_AUTH_TOKEN` | local/CI/Vercel build only | unknown | not ready — not present in repo config (confirmed) | 2026-07-26 (checked, absent) | user to provision |
| `SENTRY_ORG` | local/CI/Vercel build | unknown | not ready | — | user to fill |
| `SENTRY_PROJECT` | local/CI/Vercel build | unknown | not ready | — | user to fill |
| `BETTERSTACK_SOURCE_TOKEN` | Railway/web service | unknown | not ready — not present in repo config (confirmed) | 2026-07-26 (checked, absent) | user to provision |
| `BETTERSTACK_INGESTING_HOST` | Railway/web service | unknown | not ready | — | user to fill |
| `VERCEL_TOKEN` if needed | local automation only | unknown | not ready — Vercel CLI not installed, no CLI login (confirmed) | 2026-07-26 | install CLI + login, or provide token |
| `RAILWAY_TOKEN` if needed | local automation only | n/a | likely not needed — Railway CLI login active (confirmed) | 2026-07-26 | linked project must be confirmed/corrected first |
| GitHub authentication | local Claude Desktop/CLI | n/a | not ready — `gh` not installed; no git remote configured (confirmed) | 2026-07-26 | install `gh` + auth, add remote |

The handover must state precisely where each value is stored and whether it has been validated, but must never contain the value itself, a seed phrase, private key, password, full private RPC URL, database password, session cookie, or API token.
