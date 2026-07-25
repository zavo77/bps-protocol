# Canary LIVE Review Packet — FINAL v2 (Task 10C-R2 refresh; deployment start nonce read live)

Fresh, **live**, **unsigned** BPSC-TEST canary review packet for Robinhood Chain mainnet (chainId **4663**),
generated against a freshly captured provider block and verified by independent clean-fork replay.

> **This is packet preparation only. It is NOT funding authorization and NOT transaction authorization.**
> All four authorization flags are and remain false:
> `broadcastReady=false  liveWritesApproved=false  executionAuthorized=false  fundingAuthorized=false`
>
> The approved economics ($2,000 implied FDV, 50,000,000 BPSC LP, 0.25×–4× range, ≤ $130 all-inclusive
> exposure) apply to **this isolated BPSC-TEST canary only** — never to canonical BPS production economics.

## Requirements

- Node.js ≥ 20 (viem and solc 0.8.26 are **vendored** — no install, no network fetch)
- `anvil` (Foundry) on `PATH`
- The provider RPC, supplied **only** through an environment variable:

```bash
export ROBINHOOD_CHAIN_RPC_URL="<your provider HTTPS endpoint>"
```

The URL is read from the environment at runtime and is **never** printed, logged, serialized, or stored
in this bundle. Every artifact references it by variable name only.

## Exact verification command

```bash
node run-verification.mjs
```

Runs four stages, all of which must pass:

1. **Compilation** — recompiles all 37 bundled sources with vendored **solc 0.8.26** from
   `compiler/standard-json-input.json` (remapping `@openzeppelin/contracts/=../../node_modules/@openzeppelin/contracts/`,
   optimizer runs 200, evmVersion cancun) and requires all **eight** creation *and* runtime bytecodes to
   equal the bundled artifacts.
2. **Offline verifier** — both digests (execution-packet over normalized signable fields; full-review over
   the whole artifact minus itself), mutation tests (including nonce / signer / chainId / tx-type),
   exact init-code reconstruction, independent decode of every transaction, integer-ceiling gas,
   canonical-address guards, funding plan, caps, and full ETH/WETH/BPSC reconciliation.
3. **Independent clean-fork replay** — starts its **own** clean Anvil fork pinned to the captured block
   (fork URL from the env var), replays the exact recorded calldata with the recorded nonce and
   `type=0x2`, and compares receipts, tx/block hashes, gas, deployed code (immutables masked), pool
   creation/initialization, LP NFT (`ownerOf` + `positions`), roles/wiring, balances, buy/sell
   allocations and the delayed withdrawal — all read from replay state.
4. **Git provenance** — only when run inside the source repo; N/A in an extracted bundle, where
   provenance is instead established by the source/artifact/bytecode hashes in stage 1–2.

## MANDATORY execution-time preflight

Immediately before any signing or broadcast (which is **not** authorized by this bundle), run:

```bash
node preflight-check.mjs
```

It enforces eight gates and exits non-zero — **execution must stop** — if any fails:
packet not expired; signer nonces still equal packet nonces; balances sufficient; external dependency
code hashes unchanged; no expected deployment address already has code; current base fee within the
packet's fee bounds; aggregate exposure ≤ $130; all four authorization flags still false.

At packaging time all eight gates **pass** (the canary wallets have been reconciled and both nonces match
the packet). A passing preflight is **still not an authorization to execute** — all four authorization
flags remain false, so nothing may be signed or broadcast.

## Contents

| Path | Purpose |
|---|---|
| `canary-unsigned-packet.json` | the fresh live unsigned packet |
| `block-snapshot.json` | fresh live block snapshot (block/hash/timestamp/base fee, nonces, balances, dependency code hashes) |
| `price-snapshot.json` | live ETH/USD observations with raw responses, SHA-256, request/response timestamps |
| `capture-live-snapshot.mjs` | live input capture step |
| `collect-prices.mjs` | price-collection step (live mode, string/BigInt fixed point, ≤300 s) |
| `generate-packet.mjs` | packet generator |
| `compile-verify.mjs` | solc 0.8.26 recompilation + bytecode match |
| `verify-packet.mjs` | offline verifier |
| `replay-verify.mjs` | independent clean-fork replay verifier |
| `preflight-check.mjs` | mandatory execution-time preflight |
| `run-verification.mjs` | one-command runner |
| `verification-transcript.txt` | full compile + offline + replay transcript |
| `replay-report.txt` | clean-fork replay report |
| `preflight-report.txt` | preflight result at packaging time |
| `review-policy.json` | pinned snapshot, caps, gas, validity window, safety flags, RPC **env-var name** |
| `manifests/` | canonical canary + dryrun deployment manifests |
| `artifacts/` | the eight exact compiled contract artifacts |
| `sources/` | every Solidity source and imported source (37 files) |
| `compiler/` | Standard JSON compiler input + source index |
| `node_modules/` | vendored viem + solc 0.8.26 |

Nothing in this bundle funds, signs, broadcasts, deploys, approves, trades, or writes to any live chain.
