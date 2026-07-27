# BPS RWA Launch Lab — Desktop App Build Intake (Prefilled)

> **Security rule:** Do not paste RPC URLs, API tokens, passwords, private keys, or seed phrases into this tracked document. For secret fields, write only `ready locally`, `ready in Vercel`, `ready in Railway`, or `not ready`.

## A. Repository and local machine

- Local repository path: `C:\Projects\bps-protocol`
- GitHub repository URL: `FILL FROM git remote -v`
- Current production branch: `FILL AFTER REPO INSPECTION`
- Current working branch: `FILL AFTER REPO INSPECTION`
- Is the working tree clean? `FILL yes/no`
- Package manager: `FILL AFTER REPO INSPECTION`
- Is Claude Desktop updated to the latest version? `FILL yes/no`
- Is the **Code** tab available? `yes`
- Is `C:\Projects\bps-protocol` selected and approved as the Code session working folder? `FILL yes/no`
- Will Claude Desktop remain open while local repository work is running? `yes`
- Is Computer Use enabled for browser/login assistance if needed? `FILL yes/no` (optional)
- Is `git` authenticated for push? `FILL yes/no`
- Is `gh auth status` working? `FILL yes/no`
- Is Vercel CLI authenticated? `FILL yes/no`
- Is Railway CLI authenticated and linked to the correct project? `FILL yes/no`

## B. Production application

- Production URL: `https://rwabps.com`
- Vercel team/account: `FILL`
- Vercel project name: `FILL`
- Does `rwabps.com` already point to this Vercel project? `FILL yes/no`
- Existing production deployment branch: `FILL`
- Existing preview deployment policy: `FILL`
- Existing build command (if known): `FILL AFTER REPO/VERCEL INSPECTION`
- Existing root directory setting (if monorepo): `FILL AFTER VERCEL INSPECTION`

## C. Railway and database

- Railway project name: `FILL`
- Railway production environment name: `FILL`
- Web/API service name (if any): `FILL or none`
- Indexer service name: `FILL`
- PostgreSQL service name: `FILL`
- Does the web app already use Railway Postgres? `FILL yes/no`
- Are backups enabled? `FILL yes/no`
- Existing migration command (if known): `FILL AFTER REPO INSPECTION`
- Railway deployment method: `FILL GitHub/CLI/Dockerfile/Nixpacks`

## D. Robinhood Chain and wallets

- Creator/admin allowlist wallet address(es): `FILL PUBLIC ADDRESS(ES)`
- BPS platform fee beneficiary address: `FILL PUBLIC ADDRESS — prefer Safe/multisig; dedicated canary EOA only if necessary`
- Canary creator wallet address: `FILL PUBLIC ADDRESS`
- Canary trader wallet address (can be same): `FILL PUBLIC ADDRESS`
- Wallet has Robinhood Chain ETH for gas: `FILL yes/no`
- Wallet has a small amount of canonical NVDA Stock Token for canary buy: `FILL yes/no`
- Maximum canary capital permitted: `$250 total economic exposure; canary buy target $25–$50`
- Mainnet broadcast authorised after tests: `yes, after successful simulation, build/tests, and manual user review`

Never provide a seed phrase or private key. The launch transaction must be signed in the connected browser wallet.

## E. Infrastructure credentials

Set these securely. Mark each `ready locally`, `ready in Vercel`, `ready in Railway`, or `not ready`.

### RPC — build blocking
- `ROBINHOOD_RPC_URL`: `FILL readiness only`
- `ROBINHOOD_WS_URL`: `FILL readiness only; may be deferred if current indexer does not require WSS`
- Optional archive endpoint if different: `FILL readiness only or not ready`
- Alchemy app domain restrictions configured: `FILL yes/no/not available`

### Metadata / IPFS — build blocking for live token metadata
- `PINATA_JWT`: `FILL readiness only`
- `PINATA_GATEWAY`: `FILL readiness only`

### 0x / trading — not blocking for canary
- `ZEROX_API_KEY`: `not ready` or `ready in Vercel`
- Use integrated 0x swap in alpha if feasible: `no`
- Otherwise use an external trade link: `yes`

### Sentry — useful, not blocking
- `NEXT_PUBLIC_SENTRY_DSN`: `FILL readiness only`
- `SENTRY_AUTH_TOKEN`: `FILL readiness only`
- `SENTRY_ORG`: `FILL non-secret slug or readiness`
- `SENTRY_PROJECT`: `FILL non-secret slug or readiness`

### Better Stack — useful, not blocking
- `BETTERSTACK_SOURCE_TOKEN`: `FILL readiness only`
- `BETTERSTACK_INGESTING_HOST`: `FILL readiness only`
- Optional `BETTERSTACK_UPTIME_API_TOKEN`: `FILL readiness only`
- Alert destination email/app configured: `FILL yes/no`

### Vercel automation
- If Vercel CLI is authenticated: write `not required — CLI authenticated` for all three.
- `VERCEL_TOKEN`: `FILL readiness only if required`
- `VERCEL_ORG_ID`: `FILL if required`
- `VERCEL_PROJECT_ID`: `FILL if required`

### Railway automation
- If Railway CLI is authenticated and linked: write `not required — CLI authenticated`.
- `RAILWAY_TOKEN`: `FILL readiness only if required`
- Railway project/environment/service IDs if required: `FILL if required`

### GitHub automation
- If `gh auth status` works: `not required — gh authenticated`
- Otherwise: `FILL readiness only for a fine-grained token`

## F. Product decisions for the live canary

- Public route: `https://rwabps.com/lab`
- Create route public but wallet-allowlisted: `yes`
- Token/pool pages public: `yes`
- Initial anchor: `NVDA`
- Fixed total supply: `1,000,000,000`
- Starting FDV for canary: `$20,500`
- Canary fee preset: `static 1%`  
  `Architect support for dynamic decay, but do not enable it for the first canary.`
- Creator fee-pot share: `85%`
- BPS fee-pot share: `10%`
- Doppler/protocol fee-pot share: `5%`
- Creator token allocation: `0%`
- No separate graduation: `yes`
- Permanent/no-op market intended: `yes, only after exact module and exit-path verification`
- Canary name/ticker: `BPS Lab Canary 01 / LAB01`
- Integrated 0x swap is: `defer`
- External chart provider preference: `auto, prefer the first provider that indexes the live pool correctly`

## G. Deployment gates

- May Claude deploy web to Vercel production automatically? `yes, after tests and preview verification`
- May Claude deploy Railway indexer/database migrations automatically? `yes, only after backup and migration preview; stop for destructive changes`
- May Claude enable the production `/lab` feature flag automatically? `yes, after production deployment health checks pass`
- May Claude proceed up to, but not sign, the token launch? `yes`
- Who will connect the browser wallet and sign the mainnet canary transaction? `USER`

## H. Existing secrets location

- Local development env file path: `FILL exact ignored path, e.g. C:\Projects\bps-protocol\.env.local or existing repo-specific path`
- Vercel env already configured: `FILL yes/no/partial`
- Railway shared/service variables already configured: `FILL yes/no/partial`
- Secret manager used, if any: `FILL or none`

## I. Desktop session permissions and stopping rules

- May Claude create/switch branches and commit locally? `yes`
- May Claude push the feature branch to GitHub? `yes`
- May Claude open browser login pages for Vercel/Railway/GitHub? `yes`
- May Claude run package installation commands after checking compatibility? `yes`
- May Claude apply database migrations in Railway production? `yes, only additive/non-destructive after backup and preview; otherwise stop`
- May Claude deploy the web app to Vercel production? `yes`
- May Claude deploy/restart Railway services? `yes`
- Must Claude stop before every irreversible mainnet transaction? `yes`
- Who will remain available to approve desktop permission prompts and wallet signatures? `USER`

## Final readiness rule

The build may begin when all of the following are true:

- Repository opens successfully in Claude Desktop Code.
- GitHub push works.
- Vercel project/domain are identified and deployment access works.
- Railway project/services/database are identified and deployment access works.
- Private Robinhood HTTP RPC is ready.
- Pinata metadata credentials are ready.
- Creator/allowlist and fee-beneficiary public addresses are supplied.
- Canary wallet has Robinhood ETH and a small amount of canonical NVDA.
- Broadcast remains disabled and kill switch remains enabled until manual approval.
