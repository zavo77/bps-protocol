# BPS Protocol — Backup and Recovery

> **HANDOVER.md AND THESE CONTINUITY FILES ARE NOT A BACKUP OF THE REPOSITORY OR SECRETS.** They describe
> the project; they cannot restore it. This document defines exactly what to preserve off-account and how to
> restore on a new machine without exposing secrets. It contains **no secret values**.

## 1. Exact backup set (preserve OUTSIDE any Claude/ChatGPT account)

Store an encrypted, versioned copy of all of the following:

1. **Full git repository including `.git`** — complete history through the current HEAD
   (`7428f7470ad9805f1563ca3be57573e4257a05d4` or a documented later commit).
2. **Uncommitted working tree** — currently modified `.prettierignore`, `eslint.config.mjs`, `HANDOVER.md`;
   untracked `docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.{md,evidence.json}`, `docs/continuity/`,
   and the entire `packages/contracts/canary-packet/` directory.
3. **Required untracked evidence + canary ZIPs** — `packages/contracts/canary-packet/` in full, especially:
   - `canary-rabby-recovery-execution-review-v9.zip` — 578,871 bytes, SHA-256
     `0c958a58b8684878c4dfce4a15cdba3b2fc0e39680d46902430ab6e78a09b74d`
   - the `exec/` bundle (operator, verifier, policy, recovery artifacts) and `post-canary-reconcile.mjs`.
4. **Deployment registry** — `packages/contracts/deploy/*` (canary + dryrun manifests, schema, runbook).
5. **Audit reports** — `docs/audit/*` (release readiness, disclosure reconciliation, founder decision pack,
   canary completion checkpoint).
6. **On-chain evidence manifest** — `docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.evidence.json`,
   SHA-256 `d6005083b20e5188ce783cde5b30159b56228398d5bf204746b536e9e36b8ec3`.
7. **Database backups** — once a database exists (not yet; `@bps/db` is a placeholder, no schema).
8. **Domain / hosting / account-ownership records** — registrar, hosting platform, RPC provider account,
   explorer/verification account, Safe signer set (records only — not secrets).
9. **Environment-variable-name inventory** — from `.env.example` (names only; see §4).

## 2. Stored SEPARATELY in an encrypted password manager / secret store (NEVER in the repo)

- Robinhood Chain production **RPC URL** (`ROBINHOOD_CHAIN_RPC_URL`) and any provider API key.
- `RIALTO_API_KEY`, `RIALTO_API_URL` (if non-public).
- `WALLET_AUTH_SESSION_SECRET`.
- `DATABASE_URL` / `DATABASE_MIGRATION_URL` (once a DB exists).
- Deployer and controlled-tester **private keys / seed phrases** (hardware wallet or secure store).
- Registrar, hosting, RPC-provider, and Safe **recovery codes** — stored securely and separately from the
  primary credentials.

Never paste any of these into chat, commits, logs, `HANDOVER.md`, or any continuity file.

## 3. Restore sequence (Windows, new machine)

1. Install prerequisites: Git; Node **v24.18.0** (match `package.json` engines); Foundry via `foundryup`
   (ensure `~/.foundry/bin` is on PATH); a POSIX shell (Git Bash) for the canary scripts.
2. Restore the repository (with `.git`) and all untracked evidence/canary directories from §1 into
   `C:\Projects\bps-experiment`.
3. Run the integrity checks in §4 **before** trusting or acting on anything.
4. `npm ci` (installs exactly from `package-lock.json`; do **not** upgrade). Copy `.env.example` → `.env`
   and populate values from the encrypted secret store only.
5. Sanity-run: `npm run check` (Foundry on PATH) and, in `packages/contracts/canary-packet/exec/`,
   `node verify-all.mjs`.
6. Read `CLAUDE.md`, `HANDOVER.md`, and `docs/continuity/*`; then follow HANDOVER "START HERE" before any
   work. Do not treat any expired canary packet as execution authorization.

## 4. Integrity verification procedure

```bash
# 1. Repo identity
git rev-parse HEAD          # expect 7428f7470ad9805f1563ca3be57573e4257a05d4 (or a documented later commit)
git status --short
git diff --check

# 2. Artifact hashes (must match exactly)
sha256sum packages/contracts/canary-packet/canary-rabby-recovery-execution-review-v9.zip
#   -> 0c958a58b8684878c4dfce4a15cdba3b2fc0e39680d46902430ab6e78a09b74d
sha256sum docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25.evidence.json
#   -> d6005083b20e5188ce783cde5b30159b56228398d5bf204746b536e9e36b8ec3

# 3. Machine-readable state parses
node -e "JSON.parse(require('fs').readFileSync('docs/continuity/CURRENT_STATE.json','utf8'));console.log('OK')"

# 4. On-chain source of truth (read-only; RPC from env, never printed)
node packages/contracts/canary-packet/post-canary-reconcile.mjs
#   -> confirms chainId 4663, deployer nonce 16/16, tester nonce 8/8, all 19 transactions
```

The on-chain reconciliation in step 4 is the ultimate integrity check: it is independent of any local file
and re-derives the canary's final state directly from Robinhood Chain. If nonces read 16/8 and all 19
transactions verify, the canary plan is complete and **no** packet is executable.

## 5. What NOT to do during recovery

- Do not upgrade dependencies (use `npm ci` against the committed lockfile).
- Do not send any transaction, including the tester **nonce-8** withdrawal, without a new, bounded,
  independently reviewed authorization task.
- Do not reuse the BPSC-TEST canary contracts or any expired packet for a production launch.
- Do not print or commit any secret value or RPC URL.
