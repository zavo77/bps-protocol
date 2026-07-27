# BPS RWA Launch Lab — Claude Code Desktop App Edition

## How to start this in Claude Desktop

1. Update and open the Claude Desktop app.
2. Open the **Code** tab and start a new local Code session.
3. Select `C:\Projects\bps-protocol` as the working folder and approve access.
4. Save this file and `BPS_LAUNCH_LAB_BUILD_INTAKE_DESKTOP.md` inside the repository, preferably under `docs/launch-lab/`.
5. Complete the intake file with all non-secret details. Put secrets only in the existing ignored local env file, Vercel, Railway, or the relevant service dashboard.
6. Paste the short bootstrap message below into the Claude Code session. Do not paste the entire master prompt again if Claude can read this file from the repository.
7. Keep Claude Desktop open while Claude is reading or modifying the local repository. Review permission prompts, production deployments, database migrations, and irreversible actions.
8. Mainnet token launch and canary trades must still be signed manually with the connected browser wallet.

### Bootstrap message to paste into Claude Code Desktop

```text
You are working locally in the existing BPS repository selected as this session's working folder.

First read these files in full:
- docs/launch-lab/BPS_LAUNCH_LAB_BUILD_INTAKE_DESKTOP.md
- docs/launch-lab/BPS_LAUNCH_LAB_MASTER_PROMPT_DESKTOP.md
- docs/launch-lab/BPS_LAUNCH_LAB_LIVE_HANDOVER.md, if it already exists
- docs/launch-lab/BPS_LAUNCH_LAB_STATE.json, if it already exists
- the latest entries in docs/launch-lab/BPS_LAUNCH_LAB_WORKLOG.md, if it already exists

Treat the master prompt as the authoritative build specification, the intake as the authoritative environment/product configuration, and the live handover as the authoritative current project state. Inspect and reconcile the live repository and connected services before trusting any file's assumptions. Create or refresh the continuity files before substantive implementation.

Begin immediately. Ask only one consolidated blocker question containing every genuinely blocking missing item. After I answer once, continue autonomously through inspection, implementation, tests, preview deployment, production deployment where authorised, and live canary preparation. Do not stop for optional product questions. Do not reveal secrets. Do not request a private key or seed phrase. Stop only for manual browser-wallet signatures or an irreversible action not authorised in the intake.
```

---

You are the lead engineer responsible for shipping a minimal, production-visible BPS RWA Launch Lab at `https://rwabps.com/lab` on Robinhood Chain mainnet.

The priority is one honest, working Long-style launch flow that can be tested live in production immediately. Work continuously and autonomously. Do not stop for optional product questions. Ask at most one consolidated blocker question, and only if a missing fact makes safe implementation impossible.

## 0. Non-negotiable operating rules

1. Work in the existing BPS monorepo. Inspect the live repository; do not trust old chat descriptions.
2. Preserve the existing Capital Engine. Do not alter its contracts, accounting, distribution rules, routes, or production behaviour unless a shared-infrastructure change is strictly required and documented.
3. Never print, commit, echo, log, or expose secrets. Never request a seed phrase or private key.
4. Mainnet token creation must be signed by a connected browser wallet. Do not add a server-side deployer private key.
5. Use the official Doppler SDK already installed or install the current compatible version only after checking the lockfile and peer compatibility. Do not hardcode Doppler deployment addresses from chat or memory.
6. Resolve official Robinhood/Doppler addresses from authoritative package data and validate contracts onchain before enabling broadcast.
7. Resolve the canonical NVDA Stock Token from Robinhood’s official asset data/registry for chain ID 4663. Verify symbol, contract code, decimals, and active status. Do not accept arbitrary user-supplied anchors in V1.
8. Default to safe failure. If simulation, address validation, token ordering, curve math, beneficiary configuration, or migration/lock checks fail, broadcast must be blocked.
9. Use feature flags and a kill switch. Public pages may remain visible while token creation is disabled.
10. Do not create fake market data. Show `Pending indexing`, `Unavailable`, or exact onchain reads instead of fabricated zeros.
11. Commit in logical milestones. Do not rewrite unrelated code or upgrade broad dependency sets.
12. Keep a complete audit trail in `docs/launch-lab/`.

## 0A. Mandatory continuous handover and disaster-recovery protocol

This project must remain transferable to a completely new Claude account or engineer with no prior conversation context. Documentation continuity is a first-class deliverable, not end-of-session cleanup.

### Canonical continuity files

Create these files immediately at the beginning of the first session, before substantive implementation:

- `docs/launch-lab/BPS_LAUNCH_LAB_LIVE_HANDOVER.md` — authoritative current state and complete takeover guide
- `docs/launch-lab/BPS_LAUNCH_LAB_WORKLOG.md` — append-only chronological record of meaningful actions, commands, outcomes, failures, and fixes
- `docs/launch-lab/BPS_LAUNCH_LAB_STATE.json` — concise machine-readable current state for fast reconciliation

Use `docs/launch-lab/BPS_LAUNCH_LAB_LIVE_HANDOVER.md` as the single source of truth for a replacement account. The worklog and JSON state supplement it; they do not replace it.

### Update cadence

Update the live handover and state JSON **immediately after every meaningful state change**, including:

- Repository inspection or discovery that changes an assumption
- Branch, commit, tag, merge, push, PR, or working-tree change
- Adding, deleting, renaming, or materially changing files
- Installing, removing, pinning, or upgrading a dependency
- Adding or changing an environment-variable name, service integration, deployment setting, feature flag, or permission
- Running a test, build, migration, indexer, deployment, or production smoke test
- Any failed command, reverted transaction, deployment failure, bug, wrong assumption, or abandoned implementation
- Every root-cause finding and every fix attempted, whether successful or not
- Any product or architecture decision and any rejected alternative that could be reconsidered later
- Every external-state change in GitHub, Vercel, Railway, Alchemy, Pinata, Sentry, Better Stack, 0x, Blockscout, or Robinhood Chain
- Every production URL, service ID, deployment ID, contract address, transaction hash, block number, or canary result
- Before asking the user a blocker question
- Before waiting for a permission prompt, browser-wallet signature, deployment approval, or irreversible action
- Before stopping, yielding, compacting context, changing accounts, or ending a session

During uninterrupted active work, the handover must never be more than one meaningful action behind the repository and external services. As a backstop, refresh it at least every 20 minutes while work is ongoing.

No milestone, commit, deployment, or test phase is complete until the handover has been updated to reflect it. Whenever code is committed, include the corresponding handover/state update in the same commit unless doing so would expose sensitive data.

### Required contents of the live handover

Keep the document concise enough to navigate but comprehensive enough for a cold takeover. It must always contain:

1. **Document control**
   - Last updated timestamp in UTC
   - Updating agent/session identifier if available
   - Handover schema/version
   - Project phase and urgency/deadline

2. **One-paragraph project summary**
   - What BPS Launch Lab is
   - Current V1 scope
   - Explicitly deferred scope
   - Production target: `https://rwabps.com/lab`

3. **Current repository state**
   - Absolute local path
   - Repository URL and remotes
   - Current branch and commit SHA
   - Latest pushed commit and PR URL
   - `git status --short` summary
   - Uncommitted files and why they are uncommitted
   - Checkpoint tags/commits and rollback points

4. **Current milestone and progress**
   - Active milestone
   - Completed work with evidence
   - Work in progress
   - Exact percentage/status only when grounded
   - Definition of the next completion gate

5. **Architecture and boundaries**
   - Current package/app structure
   - Launch Lab modules and ownership
   - Capital Engine boundaries that must not be crossed
   - Data flow from create form to Doppler simulation, wallet signature, indexer, token page, fee reads, and claim
   - Current diagrams in text where useful

6. **Exact file map**
   - Every file added or materially changed
   - Purpose of each file
   - Key exported functions/classes/types
   - Known TODOs or fragile areas in each file
   - Generated files and how to regenerate them

7. **Dependencies and versions**
   - Node/package-manager versions
   - Important package versions, especially Next.js, viem, wagmi, Doppler SDK, database/indexer packages, Sentry, and 0x
   - Every dependency added/upgraded, reason, compatibility checks, and rollback command
   - Known advisories or peer-version caveats

8. **Contracts, chains, and onchain state**
   - Chain ID and network
   - Canonical anchor resolution method
   - Verified contract/module addresses and source of truth
   - Bytecode/whitelist validation status
   - Launch template values and tolerances
   - Deployed token/pool/registry/fee addresses if any
   - Transaction hashes, block numbers, verification status, and links
   - Anything not yet verified clearly labelled as unverified

9. **Database and indexer state**
   - Schema/tables and purpose
   - Migration names, checksums/IDs, applied environments, and rollback notes
   - Indexer service, start block, latest indexed block, lag, and health
   - Idempotency/replay rules
   - Known data gaps

10. **Deployments and external services**
    - Vercel project/team, production/preview URLs, deployment IDs, branch mapping, root/build settings, and latest status
    - Railway project/environment/service names and IDs, deployment IDs, health, and linked database
    - GitHub branch/PR/check status
    - Sentry project and verification status
    - Better Stack source/monitor names and verification status
    - Alchemy/Pinata/0x integration status
    - Exact rollback and kill-switch steps

11. **Sanitised credential and configuration inventory**
    - Variable/credential name
    - Purpose
    - Required environment(s)
    - Storage location, such as local ignored env, Vercel Production, Railway shared variables, GitHub Actions secret, or provider dashboard
    - Whether configured, missing, or last validation failed
    - Last validated timestamp
    - Owner/source to contact or dashboard path
    - Rotation/restriction notes

    **Never store actual secret values, seed phrases, private keys, passwords, API tokens, complete private RPC URLs, database passwords, or authentication cookies in any handover file, commit, log, or chat.** A new account must know precisely where each secret is stored and how to verify its presence without seeing or printing the value. Use masked fingerprints only when needed, such as the last four characters or a one-way checksum that cannot reconstruct the secret.

12. **Commands and operational procedures**
    - Exact install, dev, test, lint, typecheck, build, migration, indexer, preview, production deploy, rollback, health-check, and canary commands
    - Required working directory for each command
    - Which commands are safe/read-only versus state-changing or irreversible
    - Expected success indicators

13. **Testing and verification ledger**
    - Exact command and timestamp
    - Commit SHA tested
    - PASS/FAIL
    - Relevant output summary
    - Test gaps and why they remain
    - Production smoke-test results

14. **Mistakes, failures, and lessons learned**
    - What failed or was implemented incorrectly
    - Exact symptoms and error messages, sanitised as needed
    - Root cause
    - Attempts made
    - Final fix or current unresolved status
    - How to avoid repeating the mistake
    - Any reverted commits or discarded approaches

15. **Decisions and rejected alternatives**
    - Decision
    - Reason
    - Evidence/constraints
    - Alternatives rejected
    - Conditions that would justify reopening it

16. **Security and safety state**
    - Kill-switch and broadcast-flag values by environment, without secret values
    - Allowlist status
    - Wallet-signing boundary
    - Audit/review status
    - Open security risks
    - Irreversible actions already taken or awaiting approval

17. **Funds and canary accounting**
    - Approved maximum canary spend
    - Wallet addresses, never keys
    - Gas/anchor balances at last check
    - Amounts spent or committed
    - Buy/sell/fee-claim transactions
    - Recoverable versus nonrecoverable funds

18. **Blockers, risks, and open questions**
    - Severity
    - Owner
    - Exact information/action needed
    - Workaround if any
    - What can proceed in parallel

19. **Next exact actions**
    - Ordered numbered list
    - Exact files/commands/services involved
    - Expected result for each
    - First action a brand-new account should take

20. **Cold-takeover instructions**
    - The exact reading order for a new agent
    - Reconciliation commands to run before changing code
    - What assumptions must be revalidated against live repo and services
    - The last known safe rollback point

### Worklog rules

`BPS_LAUNCH_LAB_WORKLOG.md` is append-only. Each entry must include:

- UTC timestamp
- Objective/action
- Exact command or external action when relevant
- Result
- Files/services changed
- Errors or surprises
- Handover sections updated
- Next action

Do not rewrite or delete prior failure entries merely because the issue was later fixed. Add a resolution entry that links back to the original failure.

### Machine-readable state rules

Keep `BPS_LAUNCH_LAB_STATE.json` valid JSON and update it with at least:

- `lastUpdatedUtc`
- `repoPath`
- `branch`
- `headCommit`
- `latestPushedCommit`
- `workingTreeClean`
- `activeMilestone`
- `milestoneStatus`
- `featureFlags`
- `deployments`
- `services`
- `contracts`
- `databaseMigrations`
- `testStatus`
- `blockers`
- `nextActions`

Do not put secrets in the JSON file.

### Cold-account takeover rule

At the beginning of every new Claude account/session:

1. Read the intake, master prompt, live handover, state JSON, and latest worklog entries in full.
2. Run read-only reconciliation commands: repository path, branch, commit, remotes, `git status --short`, package versions, and relevant service status.
3. Compare live facts with the handover.
4. Update the handover immediately with any discrepancy before modifying code.
5. Continue from `Next exact actions`; do not restart planning or reopen settled product decisions unless live evidence invalidates them.

If the session is interrupted unexpectedly, the last saved handover must allow a new account to resume without access to prior chat history.


## 1. Delivery target

Ship these production routes inside the existing `rwabps.com` application:

- `/lab` — public Launch Lab landing/discovery page
- `/lab/create` — real production create page; access restricted by an environment-configured creator-wallet allowlist
- `/lab/token/[address]` — public token/market page
- `/lab/dashboard` — creator dashboard for the connected wallet’s launches and fees
- `/lab/proof` — transparent configuration, deployment, and contract proof page
- `/api/lab/health` — health endpoint with no secrets

The launch flow must be:

`Connect wallet → enter metadata → review fixed economics → simulate → sign → confirm → public token page → trade → view fees → claim fees`

## 2. V1 product scope

### Creator inputs

Only expose:

- Token name
- Ticker/symbol
- Image
- Short description
- Optional website/X links if existing metadata schema supports them safely
- Creator fee-recipient wallet, defaulting to connected wallet
- Fee preset only if the preset has dedicated tests and passes simulation

### Fixed V1 launch properties

- Robinhood Chain mainnet, chain ID `4663`
- Initial approved anchor: canonical `NVDA` Stock Token only
- Fixed supply: `1,000,000,000` tokens
- No post-launch minting
- No creator-provided NVDA liquidity
- Immediate Doppler/Uniswap v4 market
- No separate bonding-curve contract
- No visible graduation in V1
- Intended permanent/no-op market configuration, but enable only after verifying the exact production module, pool status, beneficiary collection path, and absence of unintended creator withdrawal/migration paths
- Creator signs the launch transaction
- No team/creator token allocation in the canary template unless the intake explicitly states otherwise
- One fixed, tested curve configuration for the live canary
- One fixed, tested starting-FDV configuration for the live canary

### Fee architecture

Design the typed schema and UI to support future presets:

- `feeMode: static | decay`
- `terminalFeeBps`
- `startFeeBps`
- `decayDurationSeconds`
- `creatorBeneficiaryShareWad`
- `bpsBeneficiaryShareWad`
- `protocolBeneficiaryShareWad`

Approved long-term terminal fee options may include 1%, 2%, and 3%, but **enable only the canary preset supplied in the intake**. Do not accept arbitrary fee numbers.

Rules:

- Show terminal fee, current fee, start fee, and decay end time clearly.
- Show the creator/BPS/protocol shares as percentages of the fee pot, not percentages of total trade value.
- Beneficiary shares must sum exactly to the required total.
- Reject duplicate beneficiary addresses.
- Resolve the mandatory protocol beneficiary through the Doppler/Airlock configuration rather than assuming an address.
- Use the environment-configured BPS fee-beneficiary address.
- Treat all launch settings as irreversible in the review UI.

## 3. Explicitly out of scope

Do not build or deploy any of the following in this milestone:

- PRINT or any permanent meme launch
- Cashcat airdrop
- Packet/Bell/gacha mechanics
- BPS Genesis distribution
- Market-mining rewards
- Creator BPS emissions
- Automated BPS buybacks/burns
- Automated RWA retention or Capital Engine forwarding
- Public permissionless creation
- Arbitrary anchor entry
- Leveraged long/short tokens
- Prediction markets
- Custom AMM contracts
- Separate bonding curve or graduation
- Bespoke onchain registry contract
- New proxy/upgrade framework
- New treasury contract
- Paid spins or chance mechanics
- Broad website redesign

Build clean extension points and documentation, but do not let these features delay the live canary.

## 4. Phase A — Inspect, checkpoint, and report

Before changing code:

1. Print repository path, branch, commit, remotes, and `git status --short`.
2. Identify package manager, Node version, workspace layout, current Next.js/wagmi/viem/indexer/database architecture, and existing deployment commands.
3. Identify uncommitted work and avoid overwriting it.
4. Create a safe checkpoint commit/tag if the tree and user authorisation permit it. Otherwise document why not.
5. Create/switch to `feature/bps-rwa-launch-lab-v1` or the approved branch name.
6. Inspect existing wallet connection, chain config, RPC abstraction, UI system, auth/allowlist patterns, IPFS upload, database, indexer, Sentry, logging, feature flags, CI, and deployment configuration.
7. Write `docs/launch-lab/BPS_LAUNCH_LAB_TAKEOVER_REPORT.md` with confirmed facts, exact paths, risks, and the implementation plan.
8. Continue directly into implementation; do not stop merely because the report is complete.

## 5. Phase B — Create an isolated launch-lab package

Prefer an isolated package such as `packages/launch-lab` if compatible with the existing monorepo. Otherwise use the nearest existing shared package without creating circular dependencies.

Create typed modules for:

- Chain and canonical-anchor validation
- Robinhood official asset resolution
- Anchor price resolution
- Corporate-action multiplier handling if using Robinhood REST prices
- Doppler address resolution and bytecode validation
- Launch-template configuration
- Token-ordering-safe price/tick conversion
- Starting-FDV calculation
- Multicurve/auction parameter construction
- Beneficiary construction and validation
- Simulation
- Transaction preparation
- Receipt/event decoding
- Fee/pool state reads
- Pending-fee reads
- Creator fee claiming
- External links
- Shared types and Zod schemas

No browser component should contain launch math or raw ABI encoding.

## 6. Phase C — Launch template and simulation laboratory

Build a reusable simulation service and a CLI/internal command, for example:

- `pnpm lab:simulate`
- `pnpm lab:validate-config`
- `pnpm lab:quote-scenarios`

The laboratory must:

1. Resolve canonical NVDA for chain 4663 from official data/registry.
2. Validate contract code, symbol, decimals, status, and chain.
3. Resolve Doppler contracts from the SDK and validate bytecode.
4. Confirm required modules are approved/usable by the production Airlock.
5. Build the exact launch create params.
6. Simulate the exact Airlock create call from the intended creator address.
7. Predict and verify token/pool identifiers when supported.
8. Calculate the actual starting token price and USD FDV using the multiplier-correct token price.
9. Quote sample buys and sells using exact available quoters or reliable simulation:
   - $25 buy
   - $100 buy
   - $500 buy
   - $1,000 cumulative buy
   - 25% sellback scenario
10. Verify the selected fee schedule and beneficiary shares.
11. Verify no unexpected creator token allocation.
12. Verify the selected no-op/permanent market behaviour and document exactly what is locked, who can collect fees, and what can/cannot migrate or withdraw.
13. Produce a machine-readable JSON simulation report and a human-readable Markdown report.
14. Block broadcast if predicted values differ from configured tolerances.

Add unit tests for token ordering, decimals, corporate-action multiplier handling, fee math, WAD shares, tick alignment, starting FDV, duplicate beneficiaries, and malformed config.

## 7. Phase D — Database and indexing

Reuse the existing Railway/Postgres and indexer patterns.

Add the minimum schema required for reliable production state, using migrations:

### `lab_launches`

- id
- chain_id
- token_address (unique)
- pool_id/pool_address/hook address as applicable
- deployment_tx_hash (unique)
- creator_address
- fee_recipient_address
- anchor_address
- anchor_symbol
- name
- symbol
- description
- metadata_uri
- image_uri
- initial_supply
- tokens_to_sell
- configured_starting_fdv_usd
- resolved_anchor_price_usd
- fee_mode
- terminal_fee_bps
- start_fee_bps
- decay_duration_seconds
- creator_share
- bps_share
- protocol_share
- pool_initializer
- liquidity_migrator
- governance_factory
- token_factory
- integrator
- config_hash
- status (`draft|simulated|submitted|confirmed|indexed|failed|disabled`)
- created_at/updated_at

### `lab_launch_events`

- launch_id
- block_number
- block_hash
- tx_hash
- log_index
- event_name
- decoded_payload
- unique event identity

### `lab_fee_snapshots` (only if required)

Store observations, not invented accounting. Onchain reads remain source of truth.

Requirements:

- Launches must be reconstructable from transaction receipts and events.
- Reorg handling must follow the existing indexer pattern.
- Store the complete immutable config snapshot/hash.
- Do not rely solely on the create form submission.
- Add indexes and idempotent upserts.
- Add a backfill/reconcile command for a token address or deployment tx.

If indexing cannot be safely completed before deployment, persist the confirmed launch after receipt and show onchain reads, while documenting the delayed indexer path. Do not block the entire canary on nonessential historical analytics.

## 8. Phase E — Metadata upload

Reuse existing Pinata/IPFS infrastructure where present.

Requirements:

- Server-side Pinata JWT only
- File type allowlist: PNG/JPEG/WebP/GIF only if already supported
- Strict file-size limit
- Image-dimension sanity checks where practical
- Sanitised filename and metadata
- JSON metadata includes name, symbol, description, image, website/X when supplied, chain ID, creator, anchor, and BPS Launch Lab provenance
- Store immutable content URI
- Never expose `PINATA_JWT` to the client
- Graceful errors and upload retry

## 9. Phase F — Production web routes

Use the existing BPS brand system, navigation, wallet stack, and responsive components.

### `/lab`

Show:

- Clear proposition: launch a fixed-supply token against an approved RWA anchor without providing anchor liquidity
- Public list of confirmed launches
- Create CTA visible only/primarily to allowed wallets
- Honest status when no launches exist
- Links to proof/configuration
- No claims about backing or redemption

### `/lab/create`

Steps:

1. Connect wallet and correct chain
2. Verify allowlist
3. Enter metadata
4. Upload image
5. Review immutable configuration
6. Run simulation
7. Display full simulation output and warnings
8. Require explicit confirmation checkbox
9. Prepare creator-signed transaction
10. Track wallet submission, confirmation, event decoding, DB/indexer state
11. Redirect to public token page

Broadcast requirements:

- `BPS_LAUNCH_LAB_ENABLED=true`
- `BPS_LAUNCH_LAB_BROADCAST_ENABLED=true`
- `BPS_LAUNCH_LAB_KILL_SWITCH=false`
- creator address in allowlist
- correct chain
- fresh successful simulation, not older than a short configured TTL
- exact config hash matches review
- sufficient wallet ETH for gas

### `/lab/token/[address]`

Show only verified/reconstructable data:

- Token name/symbol/image/description
- BPS Launch Lab verified badge
- Token address
- Anchor token and official status
- Pool ID/address/hook
- Creator and fee recipient
- Total supply
- Starting FDV and configured curve summary
- Current onchain price/FDV if reliably available
- Real NVDA reserve, labelled as pool reserve rather than backing
- Launched-token pool inventory
- Current fee, terminal fee, and decay countdown if applicable
- Fee-pot beneficiary split
- Migration/liquidity status
- Deployment transaction
- Blockscout links
- Trade action
- Chart link/status
- Indexing status

If the indexer has not discovered the pool, show `Indexing` and keep explorer links available.

### `/lab/dashboard`

For connected creator:

- Launches
- Status
- Pending fee amounts in both pair assets
- Historical claims when reconstructable
- Claim button using creator wallet and exact Doppler collection method
- Transaction status and explorer links

### `/lab/proof`

Show:

- Chain and official anchor source
- Exact launch preset
- Fee math
- Beneficiary addresses
- Doppler modules
- Contract code/verification links
- Kill-switch state
- Simulation methodology
- Source commit/deployment version
- Clear risk language

## 10. Phase G — Trading integration

Priority order:

1. Core launch and public token page must work.
2. If `ZEROX_API_KEY` is supplied and integration can be completed safely, add a minimal in-app swap widget using a server-side 0x quote proxy for Robinhood Chain 4663.
3. Keep 0x API keys server-side.
4. Show route, estimated output, price impact, gas, pool/protocol/0x fees where returned, allowance target, and slippage.
5. Do not add an undisclosed integrator fee.
6. Validate taker, sell token, buy token, amounts, chain ID, returned transaction target, and allowance spender.
7. If integrated swap risks delaying the canary, provide a reliable external trade CTA and document the deferred in-app swap.

At minimum, Blockscout and chart links must work. Do not invent a Matcha deep-link format; verify it or use an environment-configured template.

## 11. Phase H — Observability, operations, and safety

### Feature flags/environment

Support at minimum:

- `BPS_LAUNCH_LAB_ENABLED`
- `BPS_LAUNCH_LAB_BROADCAST_ENABLED`
- `BPS_LAUNCH_LAB_KILL_SWITCH`
- `BPS_LAUNCH_LAB_CREATOR_ALLOWLIST`
- `BPS_LAUNCH_LAB_BPS_BENEFICIARY`
- `BPS_LAUNCH_LAB_ANCHOR_SYMBOL=NVDA`
- `BPS_LAUNCH_LAB_START_FDV_USD`
- `BPS_LAUNCH_LAB_FEE_PRESET`
- `BPS_LAUNCH_LAB_SIMULATION_TTL_SECONDS`
- `ROBINHOOD_RPC_URL`
- `ROBINHOOD_WS_URL`
- `PINATA_JWT`
- `PINATA_GATEWAY`
- `ZEROX_API_KEY`
- Sentry variables already used by the repository
- Better Stack variables already used by the repository

Do not duplicate existing canonical variable names without reason.

### Sentry

- Capture create/simulate/index/claim errors
- Tag chain, route, launch status, token address, tx hash, and deployment version
- Never capture private keys, JWTs, RPC URLs with credentials, raw auth headers, or full wallet signatures
- Add meaningful breadcrumbs around launch steps
- Configure source maps using existing deployment pattern

### Better Stack

- Send structured server/indexer logs with correlation IDs
- Include level, service, environment, route/job, token address, tx hash, block, and error class
- Never log secrets
- Health monitor targets:
  - `https://rwabps.com/api/health` if existing
  - `https://rwabps.com/api/lab/health`
  - Railway indexer health URL
- Health response should include status, deployment version, DB connectivity, RPC latest block age, indexer lag, and kill-switch state, but no secrets

### Security controls

- Strict Zod validation
- Address checksum/normalisation
- Content Security Policy compatible with required providers
- Rate-limit metadata/upload/simulation APIs
- CSRF-safe server actions/API patterns
- No arbitrary contract addresses
- No arbitrary calldata from client
- No server-side wallet private key
- No unauthorised launch broadcast
- Clear recovery from dropped/replaced transactions
- Idempotent receipt handling
- Exact allowlist matching
- Kill switch tested in production preview before launch

## 12. Phase I — Testing and quality gates

Run and fix:

- Existing repo tests
- Launch Lab unit tests
- Integration tests with mocked RPC where appropriate
- Fork tests against a pinned Robinhood mainnet block using archive RPC if available
- Typecheck
- Lint
- Production build
- Database migration dry run
- Indexer build/start test

Mandatory scenarios:

- Wrong chain rejected
- Non-allowlisted creator rejected
- Kill switch blocks create
- Broadcast-disabled mode blocks create
- Stale simulation blocks create
- Config changed after simulation blocks create
- Canonical NVDA validation failure blocks create
- Malformed image/metadata rejected
- Invalid fee recipient rejected
- Duplicate beneficiary rejected
- Shares not summing correctly rejected
- Unsupported fee preset rejected
- Tick/price inversion test for both token orderings
- Starting FDV tolerance test
- Fee-decay schedule test if enabled
- Receipt/event reconstruction
- Repeated webhook/index event idempotency
- Claim from wrong wallet rejected/onchain-safe
- External API failure degrades gracefully

Write `docs/launch-lab/BPS_LAUNCH_LAB_TEST_REPORT.md` with commands and outputs.

## 13. Phase J — Deployment

### Git/GitHub

- Commit by milestone
- Push feature branch
- Open a draft PR if authentication permits
- Do not force-push or rewrite unrelated history
- Record final commit SHA

### Railway

- Apply database migration using the existing safe production process
- Deploy/redeploy indexer/service
- Set variables through Railway’s existing variables/shared-variable pattern
- Verify service health and indexer head

### Vercel

- Add required environment variables to Production and appropriate Preview environments
- Build preview first
- Run smoke tests
- Deploy production only if intake authorises automatic production deployment
- Ensure `rwabps.com/lab` resolves under the existing project; do not create a second domain/app unless repository architecture requires it

### Better Stack/Sentry

- Verify one test event/log reaches each service
- Produce exact monitor URLs and alert rules if API automation is unavailable

Write `docs/launch-lab/BPS_LAUNCH_LAB_DEPLOYMENT_RUNBOOK.md` with rollback and kill-switch procedures.

## 14. Phase K — Live canary acceptance

Do not use PRINT or another campaign token. Use an unmistakable canary name/ticker from intake, for example `BPS Lab Canary 01 / LAB01`.

Before creator signature, produce a final preflight card containing:

- Creator wallet
- Anchor address and official verification
- Supply
- Starting FDV
- Exact fee schedule
- Beneficiary split and addresses
- Doppler modules
- Predicted token/pool identifiers
- Simulation block/time
- Quote scenarios
- No-op/permanent-market findings
- Maximum intended canary capital

The connected user signs the launch transaction in the browser.

After confirmation, verify:

1. Token address and code
2. Supply and mint authority behaviour
3. Metadata
4. Pool configuration
5. NVDA anchor
6. Starting price/FDV tolerance
7. Fee schedule
8. Beneficiary configuration
9. Liquidity/migration status
10. Public token page
11. Small real buy
12. Small real sell
13. Fee accrual in both assets where applicable
14. Creator pending-fee read
15. Creator claim transaction if supported and economically sensible
16. BPS beneficiary accrual/read
17. Blockscout and chart/trade links
18. Sentry/Better Stack/health status

Write `docs/launch-lab/BPS_LAUNCH_LAB_CANARY_REPORT.md` with transaction hashes and PASS/FAIL only for sensitive endpoint checks.

## 15. Definition of done

The milestone is complete only when:

- `https://rwabps.com/lab` is live in production
- Public users can view Launch Lab and confirmed canary data
- Only allowed wallets can access/broadcast creation
- Exact canary launch simulates and can be signed from the browser
- The live canary is publicly tradeable
- A real buy and sell are verified
- Fee configuration and accrual are proven
- Creator fee read/claim path is proven or the exact blocker is documented from production contracts
- Capital Engine remains unchanged
- Tests/build/deploy health pass
- Kill switch works
- All final files, env names, commands, commits, deployments, tx hashes, and remaining blockers are reported

## 16. Final response format

Return:

1. Current branch and final commit SHA
2. PR URL if created
3. Production URL
4. Railway deployment/service status
5. Exact files changed
6. Exact migrations added/applied
7. Test/build results
8. Required env variables and whether each is set (never values)
9. Canary token/pool/tx links if launched
10. Buy/sell/fee verification
11. Sentry/Better Stack/health verification
12. Kill-switch procedure
13. Remaining blockers sorted by severity
14. Next recommended milestone, without implementing unrelated scope
15. Confirmation that the live handover, worklog, and state JSON are current through the final action

Proceed now. Prioritise core launch simulation and production create flow over optional polish. Downgrade optional features rather than stopping the build.
