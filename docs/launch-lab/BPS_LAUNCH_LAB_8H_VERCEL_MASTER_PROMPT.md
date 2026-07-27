# BPS RWA Launch Lab — 8-Hour Vercel-First Master Build Prompt

## Mission

You are working in Claude Code Desktop on the existing BPS repository:

```text
C:\Projects\bps-experiment
```

We have a strict eight-hour deadline to deliver a real, publicly accessible BPS RWA Launch Lab demo.

Delivery is successful only when:

1. A production-quality BPS Launch Lab is publicly accessible on Vercel.
2. The public `/lab/create` interface itself constructs, simulates and submits the Genesis launch.
3. The connected creator wallet manually signs the launch transaction through the browser.
4. A real token is created on Robinhood Chain mainnet and paired with the canonical Alphabet Class A • Robinhood Token (`GOOGL`).
5. The Launch Lab decodes the receipt and automatically opens the resulting public market page.
6. A small real GOOGL buy and partial sell prove the market works.
7. A public proof page links the launch, buy and sell evidence.
8. The frontend is fully designed through Claude Design and does not resemble a developer prototype.

A token created by a script, CLI, Blockscout, Long.xyz, another frontend or direct manual contract call and later imported into BPS **does not count**.

The Launch Lab must create the token.

---

# 0. Operating rules

Proceed continuously and prioritise the hardest, most uncertain engineering first.

Do not spend the deadline on:

- OrangeWebsite VPS or SSH
- Railway
- PostgreSQL
- indexer infrastructure
- GitHub remote setup
- Sentry
- Better Stack
- Capital Engine changes
- PRINT
- Cashcat airdrops
- Genesis packets
- BPS reward emissions
- automated buybacks
- multiple RWA anchors
- public permissionless creation
- long/short markets
- prediction markets
- unrelated BPS redesigns

Do not request or reveal:

- seed phrases
- private keys
- wallet backup files
- SSH passphrases
- actual RPC secrets in chat
- actual Pinata JWTs in chat

All mainnet transactions must be signed manually through the connected browser wallet.

Use local git even though there is no remote.

Keep a running progress log at:

```text
docs/launch-lab/BPS_LAUNCH_LAB_8H_PROGRESS.md
```

Update it after every milestone without stopping work.

Maintain the project continuity files required by the repository whenever the project’s existing continuity gate requires them. Do not churn continuity files for trivial changes.

---

# 1. First response: one consolidated blocker question only

Before implementation, inspect the repository and existing environment setup. Then ask **one** consolidated question containing only information that genuinely blocks the eight-hour delivery.

Do not ask optional product questions one at a time.

The consolidated question must request the following missing values, while explicitly telling the user not to paste secrets:

```text
TOKEN_NAME=
TOKEN_SYMBOL=
TOKEN_DESCRIPTION=
TOKEN_IMAGE_PATH=

CREATOR_WALLET_ADDRESS=
CREATOR_FEE_WALLET_ADDRESS=
BPS_FEE_WALLET_ADDRESS=

ROBINHOOD_CHAIN_RPC_URL=ready locally / not ready
PINATA_JWT_AND_GATEWAY=ready locally / not ready

CREATOR_WALLET_HAS_ROBINHOOD_ETH=yes / no
TRADER_WALLET_HAS_GOOGL=yes / no
APPROXIMATE_GOOGL_AVAILABLE=

STARTING_FDV_USD=20500
LIVE_FEE_PRESET=BALANCED_1 / CREATOR_2 / DEGEN_3
DYNAMIC_LAUNCH_PROTECTION=defer unless verified / requested

VERCEL_ACCOUNT_LOGIN_AVAILABLE=yes / no
VERCEL_PROJECT_NAME=bps-launch-lab or another name
VERCEL_PRODUCTION_DEPLOYMENT_AUTHORISED=yes / no

MAINNET_LAUNCH_AUTHORISED_AFTER_FINAL_REVIEW=yes / no
MAXIMUM_CANARY_TRADE_VALUE_USD=50
```

Actual RPC URLs and Pinata credentials must be placed only in the local ignored environment file and Vercel Environment Variables.

If the repository already contains any value, confirm it without printing the secret.

Once the user answers this one consolidated question, continue autonomously. Do not return for optional decisions.

---

# 2. Repository checkpoint

Immediately inspect:

```text
git status --short
git branch --show-current
git rev-parse HEAD
git remote -v
node --version
npm --version
```

Read in full:

```text
docs/launch-lab/BPS_LAUNCH_LAB_BUILD_INTAKE_DESKTOP.md
docs/launch-lab/BPS_LAUNCH_LAB_MASTER_PROMPT_DESKTOP.md
HANDOVER.md
CURRENT_STATE.json
CHANGELOG.md
```

Where a continuity document does not exist, note that rather than inventing it.

Correct all stale path references. The authoritative repository path is:

```text
C:\Projects\bps-experiment
```

Preserve all unrelated BPS work.

If the working tree permits:

1. Commit the current Launch Lab planning documents as a checkpoint.
2. Create and switch to:

```text
feature/bps-launch-lab-8h-vercel
```

3. Record the starting branch and commit in the progress log.

Do not require a GitHub remote.

Run the fastest existing baseline checks before major changes, but do not spend more than 15 minutes diagnosing unrelated pre-existing failures. Record pre-existing failures separately.

---

# 3. Hard engineering gate: prove the launch path first

The first intensive task is not the frontend. It is proving that the current official Doppler SDK and current Robinhood deployment can construct and simulate the required GOOGL multicurve launch.

Within the first 90 minutes, produce a working internal integration spike that:

1. Creates a Robinhood Chain public client using the server-side RPC.
2. Resolves Doppler’s current chain deployment for chain ID `4663`.
3. Verifies required contract bytecode exists.
4. Resolves the Airlock owner onchain.
5. Verifies the required initializer, token factory, migrator and governance modules.
6. Verifies module whitelisting where Airlock requires it.
7. Resolves and validates canonical GOOGL.
8. Builds the fixed one-billion-token launch template.
9. Encodes lockable beneficiaries.
10. Encodes no-op migration.
11. Derives deterministic ticks and prices.
12. Simulates the exact creation transaction.
13. Returns the exact transaction target, data, value and calldata hash.
14. Predicts token and pool identifiers where supported.
15. Decodes a fixture or simulation response into the Launch Lab result type.

If current SDK defaults do not include chain `4663`, inspect the installed SDK source and current primary Doppler deployment sources. Use explicit module overrides only when every address is verified onchain and the rationale is documented.

Do not silently copy old addresses from chat history.

If this hard gate fails, continue the parallel design work but report the exact blocker and the smallest technically honest remedy. Do not fake a launch adapter.

---

# 4. Parallel Claude Design workflow

The frontend must be fully designed by Claude Design while Claude Code builds the launch integration.

Within the first 30 minutes:

1. Define stable TypeScript contracts for:
   - `LaunchFormData`
   - `AnchorVerification`
   - `FeePreset`
   - `LaunchManifest`
   - `LaunchSimulation`
   - `PreparedLaunchTransaction`
   - `LaunchReceiptResult`
   - `MarketSnapshot`
   - `ProofRecord`
   - all UI state enums

2. Commit the interface scaffold.

3. Create a design worktree and branch:

```text
C:\Projects\bps-lab-design
feature/bps-launch-lab-claude-design
```

4. Create:

```text
docs/launch-lab/CLAUDE_DESIGN_BRIEF.md
docs/launch-lab/CLAUDE_DESIGN_PROMPT.md
```

5. The brief must specify exact route and component boundaries so Claude Design and Claude Code do not edit the same files.

Recommended ownership:

## Claude Code owns

```text
packages/launch-lab/**
apps/web/app/api/lab/**
apps/web/lib/lab/**
apps/web/hooks/lab/**
apps/web/providers/**
apps/web chain/wallet configuration where required
tests for launch logic and data adapters
```

## Claude Design owns

```text
apps/web/app/lab/**
apps/web/components/lab/**
apps/web/public/lab/**
lab-specific CSS/modules only
```

If the repository structure differs, adapt the paths but keep strict ownership.

6. Output this status once:

```text
DESIGN WORKTREE READY:
C:\Projects\bps-lab-design

DESIGN PROMPT:
docs/launch-lab/CLAUDE_DESIGN_PROMPT.md
```

7. Continue core engineering immediately without waiting for Claude Design.

When the design branch is complete, review and cherry-pick its commit into the core branch. Resolve conflicts without discarding the finished design.

---

# 5. Canonical GOOGL anchor

The Genesis market uses:

```text
Alphabet Class A • Robinhood Token
Symbol: GOOGL
Chain ID: 4663
```

A currently observed candidate contract is:

```text
0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3
```

This is a candidate only. Resolve and validate it at build time and again immediately before launch.

## Official resolution

Use Robinhood’s read-only Stock Token APIs:

```text
GET https://api.robinhood.com/rhj/assets
GET https://api.robinhood.com/rhj/prices/GOOGL
```

From `/assets`, require:

- `tokenSymbol === "GOOGL"`
- active status
- a deployment with `chainId === 4663`
- a checksummed contract address
- a valid `currentMultiplier`
- no unresolved mismatch with a configured address

Onchain, require:

- non-empty contract bytecode
- token name consistent with Alphabet Class A • Robinhood Token
- symbol `GOOGL`
- decimals `18`, unless current canonical official data proves otherwise
- successful ERC-20 reads

Fail closed on every mismatch.

Robinhood’s REST price is the raw underlying-equity price. Apply `currentMultiplier` where required to derive Stock Token-equivalent display values. Do not mix raw REST prices with multiplier-adjusted onchain prices.

Cache official API responses within their documented cache windows. Do not hammer the API.

## Public language

Use:

```text
Paired with Alphabet Class A • Robinhood Token (GOOGL)
```

Never use:

- backed by Google
- Google-backed
- Alphabet-backed
- sponsored by Google
- affiliated with Alphabet, Google or Robinhood

Display a visible disclosure:

```text
Experimental independent market. BPS is not affiliated with or endorsed by
Alphabet, Google, Robinhood, Doppler or Uniswap. GOOGL refers to the canonical
Alphabet Class A Robinhood Stock Token used as the market’s quote asset.
```

---

# 6. Genesis token configuration

Use the user-supplied:

- token name
- symbol
- description
- image
- creator wallet
- creator fee wallet
- BPS fee wallet

The Genesis template is otherwise fixed.

## Token

```text
Initial supply: 1,000,000,000 tokens
Post-launch minting: none
Creator token allocation: 0 unless technically unavoidable
Hidden team allocation: none
Token metadata: IPFS
```

If the chosen Doppler token implementation or sale inventory requires a retained balance, expose the exact amount before launch and obtain approval. Do not conceal it.

## Anchor

```text
Numeraire: canonical GOOGL
Creator supplies no GOOGL at launch
Buyers introduce GOOGL to the market
```

## Market

```text
Doppler multicurve
Immediate live market
No user-visible graduation
Lockable beneficiaries
No-op migration
Locked/permanent liquidity configuration
Starting FDV: user-confirmed, default USD 20,500
```

Verify the precise lifecycle and exit status from the deployed contracts and simulation. Do not describe liquidity as permanent until the encoded configuration and resulting status support that statement.

## Beneficiaries

Resolve the current Airlock owner onchain.

Use:

```text
Airlock/Doppler owner: 5%
BPS fee beneficiary: 10%
Creator fee beneficiary: 85%
Total: 100%
```

Shares must sum exactly to WAD.

Reject:

- zero address
- malformed addresses
- duplicate beneficiary addresses
- protocol owner below the required minimum
- total shares not equal to WAD

Beneficiaries are immutable and must be prominent in the final review screen.

---

# 7. Pool-fee customisation

Pool customisation is a visible Launch Lab feature, but only tested presets are allowed.

Define typed presets:

## BALANCED

```text
Mode: static
Pool fee: 1%
```

## CREATOR

```text
Mode: static
Pool fee: 2%
```

## DEGEN

```text
Mode: static
Pool fee: 3%
```

## DYNAMIC_PROTECTION

```text
Mode: decay
Opening fee: approved tested value
Terminal fee: one approved terminal fee
Decay duration: approved tested duration
```

Do not permit arbitrary numerical fee input.

The real Genesis launch defaults to `BALANCED` unless the user explicitly selects another preset that has successfully passed chain-specific simulation.

Dynamic Protection must remain disabled unless:

1. the current Robinhood decay initializer is resolved,
2. the module has code,
3. the module is whitelisted where required,
4. the fee schedule is readable,
5. the exact launch simulates successfully,
6. representative quotes pass,
7. the UI can display the live and terminal fee honestly.

Convert percentage presets to the exact fee units expected by the selected Doppler/Uniswap implementation. Do not assume that `1%` means the same integer across every initializer.

Derive or validate tick spacing for each enabled preset.

---

# 8. Isolated Launch Lab package

Create an isolated package or the closest architecture compatible with the monorepo:

```text
packages/launch-lab/
  src/
    anchor/
    config/
    doppler/
    fees/
    manifest/
    metadata/
    pricing/
    receipts/
    registry/
    simulation/
    swaps/
    types/
    validation/
```

Required capabilities:

- current Robinhood chain definition
- server-only public client
- current Doppler address resolution
- module bytecode checks
- module whitelist checks
- Airlock owner resolution
- canonical GOOGL resolution
- multiplier-aware price conversion
- fixed launch-template construction
- fee-preset conversion
- beneficiary construction
- deterministic supply and inventory encoding
- token-order-aware price conversion
- deterministic tick derivation and rounding
- no-op migration encoding
- launch simulation
- gas estimate
- predicted token/pool information when available
- unsigned transaction preparation
- deterministic calldata hash
- receipt decoding
- token address recovery
- pool key/ID recovery
- creator/numeraire verification
- locked/migration status reads
- GOOGL reserve reads
- token inventory reads
- fee schedule reads
- fee collection reads/actions only where exactly supported
- representative buy and sell quotes

Use current official SDK builders rather than reimplementing protocol encoding.

Use `bigint` and explicit fixed-point utilities for every financial value. Never use JavaScript floating point for onchain calculations.

Document any SDK/viem compatibility change.

---

# 9. Launch Manifest and provenance

Before simulation, create a canonical typed `LaunchManifest`.

It must include:

```text
platform: "BPS Launch Lab"
appVersion
sourceCommit
chainId
creatorAddress
creatorFeeAddress
bpsFeeAddress
protocolFeeAddress
tokenName
tokenSymbol
tokenDescriptionHash
tokenImageCid
tokenUri
anchorSymbol
anchorAddress
anchorDecimals
anchorMultiplier
initialSupply
saleInventory
startingFdvUsdFixed
feePreset
exactPoolFeeUnits
beneficiaries
migrationMode
resolvedDopplerModules
transactionTarget
transactionValue
calldataHash
createdAt
```

Canonicalise and hash the manifest deterministically.

The successful simulation must be tied to:

- manifest hash
- transaction target
- calldata hash
- simulation block
- simulation timestamp

Immediately before signing:

1. Re-resolve GOOGL.
2. Re-check all module code.
3. Re-check beneficiaries.
4. Recreate the transaction from the manifest.
5. Re-simulate if older than 180 seconds.
6. Compare the exact target, value and calldata hash.
7. Reject any mismatch.

After confirmation, create a `LaunchReceiptResult` containing:

- launch transaction hash
- confirmation block
- token address
- pool key/ID/address where applicable
- creator
- anchor
- resulting status
- decoded configuration evidence

The public proof page must show the non-secret manifest and evidence.

---

# 10. Metadata and Pinata

Create a metadata-provider interface.

## Production provider

Use Pinata through a server-only Next.js route.

Required environment:

```text
PINATA_JWT
PINATA_GATEWAY
```

Never expose `PINATA_JWT` through a `NEXT_PUBLIC_` variable or client bundle.

Validate:

- PNG, JPEG or WebP only
- sensible file-size limit
- image dimensions where practical
- token-name length
- ticker format and length
- description length
- filename sanitisation
- no HTML/script injection

The production launch must have a valid IPFS image and metadata URI.

## Local preview provider

A local preview provider may be used for design and unit tests, but broadcast must fail closed unless the production Pinata provider returned a valid IPFS URI.

## API abuse protection

Because there is no database or full authentication system, require an EIP-191 wallet signature from an allowlisted creator for metadata uploads and launch preparation.

The signed message must include:

- action
- connected wallet
- chain ID
- payload hash
- issued timestamp
- short expiry
- domain/host

Recover the signer server-side and verify the configured allowlist.

Rate-limit metadata upload and prepare endpoints conservatively.

---

# 11. Vercel-safe architecture

The first public deployment is Vercel.

Do not depend on:

- a writable persistent filesystem
- an always-running process
- a local database
- Railway
- a long-running indexer

Use:

- Next.js server routes/functions
- direct onchain reads
- Robinhood official APIs
- receipt decoding
- static/generated Genesis configuration after launch

## Server-only secrets

Keep these server-side:

```text
ROBINHOOD_CHAIN_RPC_URL
PINATA_JWT
BPS_LAUNCH_LAB_SESSION_SECRET
```

Do not expose private RPC credentials to client bundles.

Use injected browser-wallet transport for signing. Use server routes for secret-backed reads, validation, simulation and preparation.

## No runtime registry writes

Vercel runtime files are not persistent.

Before launch, the homepage may show “Genesis market launching”.

After the launch:

1. Decode the result in the browser.
2. Redirect immediately to `/lab/token/[tokenAddress]`.
3. That route must reconstruct the market directly from onchain data.
4. Write public launch facts into:

```text
packages/launch-lab/src/registry/genesis-market.ts
```

5. Redeploy the app to make the Genesis market permanent on `/lab` and `/lab/proof`.

The app must not pretend a runtime file write is persistent.

---

# 12. Required routes

## `/lab`

Build a premium Launch Lab landing page with:

- strong hero
- “Markets paired with real-world assets”
- Genesis market status
- GOOGL anchor card
- canonical contract verification
- real GOOGL reserve after launch
- selected pool fee
- exact 85/10/5 fee economics
- create-market CTA for allowlisted creator
- public market CTA for everyone
- three-step “How it works”
- transparent permanent-market explanation
- visible experimental/unaffiliated disclosure

Do not show fake volume, users, holders, TVL or testimonials.

## `/lab/create`

Implement a polished multi-step creation flow.

### Step 1 — Token

- image
- name
- ticker
- description

### Step 2 — Market

- GOOGL anchor, fixed
- starting FDV
- fee-preset cards
- creator fee wallet
- clear creator/BPS/protocol fee split

### Step 3 — Review

- token preview
- token URI
- canonical GOOGL identity
- GOOGL multiplier
- supply
- market inventory
- starting FDV
- starting token price
- fee mode and exact pool fee
- beneficiaries
- no-op/locked configuration
- resolved modules
- predicted token/pool identifiers when available
- gas estimate
- manifest hash
- calldata hash
- simulation block and timestamp
- irreversible-configuration warning

### Step 4 — Launch

- connected wallet
- allowlist status
- chain status
- anchor verification status
- metadata status
- simulation status
- broadcast/kill-switch status
- launch button
- wallet-signing status
- confirmation status
- decoded success state
- automatic redirect

The connected browser wallet must submit the real creation transaction.

## `/lab/token/[tokenAddress]`

Show only real or clearly unavailable data:

- token identity
- image and description
- token address
- creator
- total supply
- canonical GOOGL anchor
- pool key/ID/address
- market status
- starting price
- current price where reliably readable
- starting/current FDV where reliable
- actual GOOGL reserve
- remaining token inventory
- selected fee preset
- exact beneficiary split
- live fee schedule where applicable
- launch transaction
- Blockscout links
- buy/sell interface or verified external fallback
- fee collection status where supported

For unavailable metrics, show:

```text
Awaiting indexed data
```

Never display fabricated zeroes.

## `/lab/proof`

Build a public advisor proof page showing:

- public deployment URL
- application source commit
- launch manifest and hash
- canonical GOOGL verification
- resolved Doppler modules
- simulation evidence
- launch transaction
- token address
- pool identifier
- resulting locked/migration status
- current GOOGL reserve
- test buy transaction
- test sell transaction
- fee-accrual evidence
- all explorer links

Before the launch it should show a polished pending checklist rather than fake data.

## `/lab/dashboard`

Time permitting, show:

- creator’s known launches
- real fee balances where readable
- collect-fees action only if the exact pool supports it
- no fabricated claimability

This route is lower priority than the four core routes above.

---

# 13. API routes

Implement Vercel-compatible server routes, adapting exact paths to the repo:

```text
GET  /api/lab/config
GET  /api/lab/anchor/googl
POST /api/lab/metadata
POST /api/lab/prepare
POST /api/lab/simulate
GET  /api/lab/token/[address]
GET  /api/lab/proof/[address]
POST /api/lab/quote
```

All mutation-like routes must:

- validate origin/host
- validate payload size
- verify wallet signature
- recover allowlisted signer
- validate chain ID
- fail closed on missing environment
- avoid logging secret values
- return safe structured errors

`prepare` and `simulate` must return the manifest hash and calldata hash.

The client must never be able to change beneficiary shares or hidden transaction fields after review.

---

# 14. Wallet and broadcast controls

Use the existing wagmi/viem stack.

Add or adapt:

```text
BPS_LAUNCH_LAB_ENABLED=true
BPS_LAUNCH_LAB_BROADCAST_ENABLED=false initially
BPS_LAUNCH_LAB_KILL_SWITCH=true initially
BPS_LAUNCH_LAB_CREATOR_ALLOWLIST=
BPS_LAUNCH_LAB_BPS_BENEFICIARY=
BPS_LAUNCH_LAB_START_FDV_USD=20500
BPS_LAUNCH_LAB_DEFAULT_FEE_PRESET=BALANCED
BPS_LAUNCH_LAB_SESSION_SECRET=
ROBINHOOD_CHAIN_RPC_URL=
PINATA_JWT=
PINATA_GATEWAY=
```

Fail closed if a required production variable is absent.

Local and preview deployments start with:

```text
BPS_LAUNCH_LAB_BROADCAST_ENABLED=false
BPS_LAUNCH_LAB_KILL_SWITCH=true
```

Only enable production broadcast after:

- lint passes
- typecheck passes
- critical tests pass
- production build passes
- public deployment is verified
- GOOGL validation passes
- exact launch simulation passes
- beneficiaries pass
- no-op/locked configuration is verified
- final review card is approved by the user

The launch sequence is:

1. Connect wallet.
2. Verify allowlist.
3. Switch to chain `4663`.
4. Sign the short-lived preparation request.
5. Upload metadata.
6. Resolve GOOGL.
7. Build manifest.
8. Simulate.
9. Display exact immutable review.
10. Revalidate freshness.
11. Check kill switch and broadcast flag.
12. Request browser-wallet signature.
13. Wait for receipt.
14. Decode token/pool.
15. Verify actual result.
16. Redirect to token page.

No server-side signer is allowed.

---

# 15. Trading

Priority order:

1. Launch creation works.
2. Market page and real reserve reads work.
3. A real buy and partial sell can be executed.
4. Integrated trading is desirable but must not endanger the launch deadline.

Attempt a safe integrated exact-input buy/sell implementation only after launch creation is proven.

Resolve current routing contracts from verified current packages/deployments. Never copy an old router address from memory.

Required integrated buy flow:

- GOOGL amount
- approval/Permit2 where required
- quote
- slippage
- minimum output
- simulation
- browser-wallet signature

Required integrated sell flow:

- launch-token amount
- approval/Permit2 where required
- quote
- slippage
- minimum GOOGL output
- simulation
- browser-wallet signature

If safe integrated routing is not complete by the launch gate:

- use a verified external Matcha/trading link,
- execute the small buy and sell externally,
- record both transaction hashes on `/lab/proof`,
- do not fake an integrated widget.

The token creation itself has no external fallback and must come from `/lab/create`.

---

# 16. Claude Design brief requirements

The frontend must look complete, branded and presentation-ready.

Use existing BPS assets and design tokens.

## Visual direction

- warm off-white canvas
- peach/orange highlights
- deep near-black ink
- premium editorial typography
- subtle glass/clay depth
- restrained playful details
- crisp spacing
- strong hierarchy
- excellent mobile layout
- visible transaction trust cues

Avoid:

- generic purple crypto gradients
- casino styling
- neon
- fake charts
- meaningless statistics
- cramped dashboards
- tiny unreadable legal copy
- generic component-library appearance
- redesigning unrelated BPS pages

## Required interface states

- disconnected wallet
- wrong chain
- unauthorised wallet
- incomplete form
- validation error
- image uploading
- metadata confirmed
- GOOGL verifying
- GOOGL verified
- GOOGL mismatch
- simulating
- simulation success
- simulation failure
- broadcast disabled
- kill switch active
- ready to launch
- awaiting wallet signature
- transaction pending
- confirmation pending
- receipt decoding
- launch success
- market data loading
- awaiting indexed data
- quote loading/failure
- trade pending/success/failure

## Core message

```text
Create community markets paired with real-world assets.
```

The Genesis anchor is:

```text
Alphabet Class A • Robinhood Token (GOOGL)
```

Use “Paired with GOOGL”, never “backed by Google”.

## Creation UX

The fee-preset cards must feel like a product differentiator:

- Balanced — 1%
- Creator — 2%
- Degen — 3%
- Dynamic Protection — decay schedule, disabled unless verified

Make irreversible values unmistakable on review.

## Token page UX

Prioritise:

- token identity
- GOOGL pairing
- actual reserve
- current market state
- fee transparency
- permanent/locked status
- trade action
- explorer verification

Do not fabricate missing data.

Claude Design must run route-level lint/typecheck for its changes and commit to:

```text
feature/bps-launch-lab-claude-design
```

---

# 17. Tests

Prioritise tests that protect the real transaction.

## Anchor

- official GOOGL deployment resolves for chain `4663`
- wrong address rejected
- missing bytecode rejected
- inactive asset rejected
- symbol mismatch rejected
- decimals mismatch rejected
- multiplier parses deterministically
- raw price/multiplier conversion is correct

## Configuration

- one-billion supply encoded correctly
- inventory encoded correctly
- starting FDV fixed-point conversion correct
- token ordering handled correctly
- tick rounding deterministic
- fee presets convert to exact chain units
- fee/tick-spacing compatibility validated
- beneficiary shares sum to WAD
- Airlock owner included at required minimum
- duplicate beneficiaries rejected
- no-op migration encoded

## Safety

- wrong chain rejected
- non-allowlisted creator rejected
- invalid metadata rejected
- invalid signature rejected
- expired signature rejected
- simulation failure blocks preparation
- stale simulation blocks launch
- changed calldata blocks launch
- broadcast-disabled blocks launch
- kill switch blocks launch
- missing environment fails closed
- server secrets absent from client bundles

## Receipt

- token address recovered
- pool key/ID recovered
- creator recovered
- numeraire recovered
- decoded result matches manifest
- mismatch produces hard failure

## UI

- every major state renders
- unauthorised wallet cannot reach signing
- review shows all irreversible parameters
- unavailable data is not displayed as zero
- explorer links are correct
- mobile layout has no horizontal overflow

Run:

```text
lint
typecheck
critical unit tests
integration tests
production build
```

Do not waste the deadline maximising low-value coverage.

---

# 18. Vercel deployment

Vercel is the first public hosting target.

There is no installed global Vercel CLI, so use:

```text
npx vercel@latest
```

Do not require a GitHub remote.

Inspect the monorepo and determine whether the correct deploy root is:

```text
C:\Projects\bps-experiment
```

or:

```text
C:\Projects\bps-experiment\apps\web
```

Configure the Vercel project correctly for the existing workspace and build commands.

## Deployment sequence

1. Run the local production build.
2. Authenticate interactively once if required:

```text
npx vercel@latest login
```

3. Link or create the Vercel project:

```text
npx vercel@latest link
```

Recommended project name:

```text
bps-launch-lab
```

4. Configure Preview environment variables through Vercel without printing values.
5. Deploy a preview:

```text
npx vercel@latest
```

6. Verify:

```text
/
/lab
/lab/create
/lab/proof
```

7. Inspect deployment logs and browser console.
8. Fix all blocking errors.
9. Configure Production environment variables.
10. Deploy production:

```text
npx vercel@latest --prod
```

11. Verify production routes and server functions.
12. Keep broadcast disabled during preview.
13. Enable broadcast only in Production after the final launch gate.

Do not pass secrets directly on the command line if they would appear in shell history. Use the Vercel dashboard or interactive environment-variable commands.

## Public URL

The first acceptable public URL is:

```text
https://<vercel-project>.vercel.app/lab
```

If DNS access is readily available, optionally attach:

```text
lab.rwabps.com
```

Do not delay the demo for DNS.

Do not attempt to make Vercel own only `rwabps.com/lab` while the root domain remains on the OrangeWebsite VPS. That later requires either moving the main application/domain or configuring the VPS reverse proxy.

The Genesis token may only be launched after the exact public Vercel application that generated the transaction is reachable and verified.

---

# 19. Final live-launch gate

Stop immediately before the real Genesis launch signature.

Present one concise launch card with:

```text
Public Launch Lab URL
Application source commit
Token name
Token symbol
Token image
Token description
Token URI
Creator wallet
Creator fee wallet
BPS fee wallet
Airlock/Doppler owner
Canonical GOOGL address
GOOGL name/symbol/decimals
GOOGL current multiplier
Initial supply
Sale inventory
Starting FDV
Starting token price
Fee preset
Exact pool fee units
Beneficiary shares
Migration mode
Resolved Doppler modules
Predicted token address
Predicted pool identifier
Transaction target
Transaction value
Calldata hash
Manifest hash
Gas estimate
Simulation block
Simulation timestamp
Broadcast flag
Kill-switch state
```

Wait for explicit user approval.

After approval:

1. Enable production broadcast and disable the kill switch through Vercel variables.
2. Redeploy production.
3. Reopen the public production `/lab/create`.
4. Recreate and re-simulate the exact launch.
5. Confirm the manifest/calldata hashes.
6. Request browser-wallet signature.
7. Do not use a private key.
8. Decode the receipt.
9. Verify every result against the manifest.
10. Hard-stop on any mismatch.
11. Redirect to the generated public token page.

The transaction must originate from the public BPS Launch Lab interface.

---

# 20. Live proof

After the launch:

1. Verify the token contract.
2. Verify canonical GOOGL pairing.
3. Verify pool status.
4. Verify exact pool fee.
5. Verify 85/10/5 beneficiaries.
6. Execute a small GOOGL buy.
7. Execute a partial token sell.
8. Read the resulting GOOGL reserve.
9. Verify fee accrual where readable.
10. Update `genesis-market.ts`.
11. Add the launch, buy and sell transaction hashes.
12. Redeploy production.
13. Verify `/lab` and `/lab/proof`.
14. Confirm mobile and desktop presentation.

Do not claim volume, holders or fee values that cannot be proven.

---

# 21. Eight-hour milestone schedule

Use this schedule as a prioritisation tool, not as a reason to stop work.

## 0:00–0:30

- inspect/checkpoint
- one consolidated blocker question
- stable interfaces
- design worktree/brief
- Vercel feasibility check

## 0:30–1:30

- canonical GOOGL resolver
- Doppler module resolution
- launch builder
- no-op/beneficiary configuration
- first exact simulation
- Claude Design working in parallel

## 1:30–3:30

- server API routes
- metadata upload
- wallet-signature verification
- manifest/calldata binding
- receipt decoder
- direct market reads
- designed pages/components

## 3:30–5:00

- design integration
- end-to-end local flow
- critical tests
- production build
- preview deployment

## 5:00–6:00

- preview QA
- production Vercel deployment
- production environment
- final simulation
- launch gate

## 6:00–7:00

- real launch from public `/lab/create`
- receipt verification
- token page
- small buy and partial sell

## 7:00–8:00

- GOOGL reserve/fee verification
- Genesis registry update
- final redeploy
- `/lab/proof`
- mobile/desktop QA
- advisor handover

---

# 22. Acceptance criteria

Delivery succeeds only when:

1. A public Vercel `/lab` route loads.
2. The interface is production-quality and responsive.
3. `/lab/create` is the real creation interface, not a mock.
4. An allowlisted wallet can construct and simulate the launch.
5. The public Launch Lab requests the real browser-wallet signature.
6. A token exists on Robinhood Chain mainnet.
7. The token was created by the public BPS Launch Lab flow.
8. Its market is paired with canonical GOOGL.
9. The pool uses the intended locked/no-op configuration.
10. The selected pool fee is visible and verified.
11. The 85/10/5 fee-beneficiary configuration is visible and verified.
12. The public token page displays the actual GOOGL reserve.
13. A small buy succeeds.
14. A partial sell succeeds.
15. `/lab/proof` links the complete evidence trail.
16. No unrelated BPS functionality is broken.
17. No secret is present in source, logs, browser bundles or committed files.

---

# 23. Final report

At completion, report:

```text
Branch:
Starting commit:
Final commit:
Vercel project:
Preview URL:
Production URL:

Files changed:
Dependencies changed:
Environment variable names:
Design branch commit:
Design files integrated:

Lint:
Typecheck:
Tests:
Production build:

GOOGL resolution evidence:
Doppler modules verified:
Launch simulation:
Genesis launch transaction:
Token address:
Pool identifier:
Buy transaction:
Sell transaction:
Current GOOGL reserve:
Fee verification:

Working features:
Deferred features:
Known limitations:
Rollback instructions:
Advisor demo script:
```

Be precise. Never claim success without direct evidence.

Begin now.
