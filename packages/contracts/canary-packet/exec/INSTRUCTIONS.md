# Canary Rabby Execution Operator — BPSC-TEST (Task 10D / v8 RECOVERY)

## v8 RECOVERY (Task 10D-7) — READ FIRST

**Original steps 1-13 are complete on mainnet** (all 8 contracts deployed, pool created + initialized, LP
position minted — 13 verified anchors recorded in the digest-bound authorization). Only the FINAL SIX tester
transactions remain (original steps 14-19; tester nonces 2-7). The v7 operator terminally halted on the
accountSelected pre-check with the deployer still selected; in v8 that cannot recur: the operator refuses to
CONNECT with any account other than the tester, and a wrong-account pre-check is a NON-HALTING refusal
(nothing was sent; switch accounts in Rabby and re-run). No deployer transaction is actionable at all.

```bash
node recovery-preflight.mjs          # read-only 9-gate live preflight (incl. all 13 anchors re-verified)
node operator/recovery-serve.mjs     # http://127.0.0.1:8740/  (v8 port; canaryv8 storage namespace)
```

The accepted v7 gas policy is preserved unchanged (per-step cost ceiling exactly 1.25x reviewed; priority
ceiling exactly 50,000,000 wei; maxFee + 2x gasLimit ceilings unchanged; $130 all-inclusive cap). The
accepted deadline-refresh mechanism applies to the remaining deadline-bearing steps 15 and 17 only (source
deadline must equal the bound v7 value 1784946528; strict ABI decode/re-encode; byte-diff proof limited to
the single 32-byte deadline word; the other four calldatas byte-identical to v7). Delayed tester-nonce-8
withdrawal remains disabled; canonical BPS production remains excluded.

v8 verification: `node recovery-test.mjs` (13 anchors imported + final 6/6 tester replay on a post-step-13
fork using REAL on-chain state, per-step restart, account-gate/gas-policy/deadline/chainId/isolation/
storage-fault adversarial, canonical-leaf + source-input mutation suites) and
`node recovery-browser-smoke.mjs` (port 8740). Both run in `verify-all.mjs`.

---

## v7 RECOVERY (Task 10D-6) — superseded by v8 above

**Original steps 1 AND 2 are complete on mainnet** and are permanently non-actionable anchors here:
step 1 `0x36acf3e3…12c2c` → BPSCanaryToken `0x2E6C3dC1…A5d7` (nonce 3); step 2 `0x4569523a…d758` →
BPSLockingVault `0xeFA9d1C4…8A42` (nonce 4). The v7 recovery operator authorizes ONLY the remaining
**17 transactions (original steps 3–19)**: deployer nonces 5–15, tester nonces 2–7; manual Rabby switch to
the tester after original step 13; delayed tester-nonce-8 withdrawal disabled.

```bash
node recovery-preflight.mjs          # read-only 8-gate live preflight for the v7 RECOVERY packet
node operator/recovery-serve.mjs     # http://127.0.0.1:8739/  (v7 port; canaryv7 storage namespace)
```

Two EXPLICITLY AUTHORIZED narrow changes vs the accepted v6 policy (recorded verbatim in the digest-bound
`operator/recovery-authorization.json`):

1. **Gas policy** — for original steps 3–19 only, each per-step maximum gas-cost ceiling =
   **exactly 1.25× its accepted reviewed maxGasCostWei** (both values recorded per step);
   `maxPriorityFeePerGas` ceiling = **exactly 50,000,000 wei (0.05 gwei)**; `maxFeePerGas` ceiling and the
   2× `gasLimit` ceiling unchanged; a returned tx must satisfy `gasLimit×maxFeePerGas ≤ 1.25× reviewed`
   AND keep the all-inclusive recovery exposure ≤ **$130** at the higher fresh Coinbase/Kraken price.
   The observed step-2 Rabby envelope (1901820 / 186000000 / 50000000) passes; every breach fails.
2. **Deadline refresh** — the ABI-encoded `deadline` argument of original steps **13 (NPM.mint),
   15 (buyExactWethForBps), 17 (sellExactBpsForWeth)** was refreshed from the expired accepted value
   (1784916327) to the canonical v7 packet expiry (pinned ts + 21600) via strict ABI decode/re-encode.
   A byte-diff proof (in generation, canonical binding, AND tests) restricts the change to the single
   32-byte deadline word; the other 14 remaining calldatas are byte-identical to the accepted versions.
   Runtime gates require the provider block timestamp strictly before the packet expiry and the bound
   calldata deadline to equal the bound expiry.

v7 verification: `node recovery-test.mjs` (steps 1+2 imported/verified + remaining 17/17 on a post-step-2
fork, per-step restart, gas-policy/deadline/chainId/isolation/storage-fault adversarial, canonical-leaf +
source-input mutation suites) and `node recovery-browser-smoke.mjs` (port 8739). Both run in `verify-all.mjs`.

---

## v6 RECOVERY (Task 10D-5) — superseded by v7 above

**Original step 1 (BPSCanaryToken deploy) executed successfully on mainnet** —
tx `0x36acf3e3752e0cfc2688c280680c4a9a100e3fcb2520bf41ae723f1a05612e2c`, created
`0x2E6C3dC1e04C45d4B9d40BeE392a135beA50A5d7` (deployer nonce 3). The v5 operator halted fail-closed during
post-transaction verification (Robinhood omitted `chainId` from `eth_getTransactionByHash`; Rabby adjusted
the EIP-1559 gas envelope within the reviewed cost cap). **Do not use the v5 operator or the original
19-step packet — the original preflight now correctly FAILS (nonce moved to 4; token address has code).**

Use the **v6 recovery operator** instead:

```bash
node recovery-preflight.mjs          # read-only 8-gate live preflight for the RECOVERY packet
node operator/recovery-serve.mjs     # http://127.0.0.1:8738/  (distinct port; distinct storage namespace)
```

The recovery operator anchors original step 1 as VERIFIED COMPLETE ON CHAIN (no precheck/confirm/send path
exists for it — it is not a dispatchable step at all), authorizes ONLY the remaining 18 transactions
(original steps 2–19; deployer nonces 4–15, tester nonces 2–7), shows both counters ("Original step N of 19"
/ "Remaining transaction M of 18"), requires a manual Rabby switch to the tester after original step 13, and
enforces: `eth_chainId==4663` at every boundary (connection, before intent persistence, before send, after
the hash returns, at verify, before the next step); tx-response `chainId` absent → acceptable only because
the provider chain is independently 4663, present → must equal 4663; **bounded Rabby gas adjustments** —
`from/nonce/to|create/value/calldata/type/access-list` stay EXACT, while `gasLimit ≤ 2× reviewed`,
`maxFeePerGas`/`maxPriorityFeePerGas ≤ reviewed maxima`, `priority ≤ maxFee`, and
`gasLimit×maxFeePerGas ≤ the step's reviewed maxGasCostWei` (the observed step-1 envelope
900128/126100000/6196000 passes). The $130 all-inclusive recovery cap = actual step-1 gas cost
(65693784716000 wei) + remaining principal + remaining maximum gas, at the higher fresh Coinbase/Kraken
price. v6 storage uses the `canaryv6:` namespace keyed by the recovery digest — the halted v5 records are
never read, mutated, cleared or migrated. `resolveUncertainSend` journals first and stays halted unless every
durable write round-trips (no blind retry, ever).

Recovery verification: `node recovery-test.mjs` (step-1 imported/verified + remaining 18/18 on a post-step-1
fork, per-step restart, bounded-gas + chainId + isolation + storage-fault adversarial, canonical-leaf +
source-input mutation suites) and `node recovery-browser-smoke.mjs` (port 8738). Both run inside
`verify-all.mjs`.

---

## Original v5 operator documentation (historical — superseded by the v6 recovery operator above)

**BPSC-TEST — CANARY — NOT PRODUCTION.** Robinhood Chain mainnet, chainId **4663 (0x1237)**.
Authorization scope: *BPSC-TEST canary only; Robinhood Chain mainnet; maximum all-inclusive exposure $130;
individual Rabby approvals; canonical BPS production excluded.*

This bundle contains an **execution-enabled** unsigned packet and a **localhost-only** operator that lets you
approve each transaction, one at a time, in your **Rabby** extension. The operator **never** sees a key, seed,
or keystore, **never** builds a signer, and **never** broadcasts on its own — it hands one `eth_sendTransaction`
to Rabby only after you click, and Rabby does the signing.

## Requirements
- Node.js ≥ 20; `anvil` (Foundry) for the replay/operator steps.
- `node_modules` is **excluded** from this ZIP. Install the exact pinned dependencies from the lockfile:
  `npm ci --ignore-scripts`.
- Provider RPC supplied **only** via the environment variable (never printed/stored):
  `export ROBINHOOD_CHAIN_RPC_URL="<your provider HTTPS endpoint>"`
- A browser with the **Rabby** extension installed and your deployer/tester accounts imported (by you, in Rabby).

## One-command re-verification

This is an **execution-enabled** BPSC-TEST canary packet (not a historical fixture). Re-verify everything
with the documented one command:

```bash
npm ci --ignore-scripts
node verify-all.mjs
```

`verify-all.mjs` runs and requires all of: compilation **7/7**, offline verifier **61/61**, manifest
integrity **5/5**, static safety scan **7/7** (adds the raw-input-isolation and HTML-injection-sink checks),
clean-fork replay **19/19**, the operator engine test **46/46**, and the real localhost-server browser/HTTP
smoke test **7/7**. The operator engine test covers the success path (all 19 txs on a fork via a mock
provider, with per-step restart reconciliation) **plus** the fail-closed / durable-halt / forged-storage /
uncertain-send / binding-mutation and gate adversarial tests, the canonical reviewed-authorization mutation
suite (a generic every-leaf sweep, the 14 v3 regressions, structural mutations, and single-anchor-recompute
attacks), the **source-input** mutation suite (every packet/policy/snapshot leaf either changes the digest or
is provably unused after binding), the **exact indexed-event adversarial** tests (wrong Approval owner, wrong
buy trader/recipient/adapter, wrong lockId/duration/policy), and the **storage crash-window** fault tests.
It never touches Rabby or mainnet.

The **browser/HTTP smoke** test starts `operator/serve.mjs`, drives it over HTTP, and proves every
allowlisted module + data asset (including `/canonical.mjs` and `/reviewed-authorization.json`) returns 200,
the full module+fetch graph reachable from `index.html` resolves without a 403/404, non-allowlisted and
path-traversal requests are 403, the served `app.js` completes canonical binding with no console/import/fetch
error, Connect is the only enabled initial control, precheck/send stay disabled until connection +
reconciliation, and HTML/handler text renders only as inert text.

## Canonical reviewed-authorization binding (single bound data source)

Every security-relevant input — chain, wallets, starting nonces, block snapshot, all infrastructure /
token / pool / oracle addresses, predicted deployment addresses, all 19 signable transactions, per-tx gas /
fees, principal / maximum-gas / aggregate exposure inputs, the exact $130 cap, generated time / expiry,
authorization + safety flags, provenance hashes, executionPacketDigest, and the delayed-withdrawal-disabled
state — is a leaf of ONE canonical object (`operator/canonical.mjs`). Its `reviewedAuthorizationDigest` is
anchored independently in the packet, the review policy, and the packaged `operator/reviewed-authorization.json`.
Before Connect is enabled the browser reconstructs the canonical object from the runtime inputs and requires
all three anchors to agree; any single-field mutation shifts the reconstruction digest, and recomputing one
adjacent digest cannot make the others agree. After binding, ALL runtime values (cap, exposure components,
infrastructure/wallet/nonce/pool/deployment addresses, expiry, authorization state) come ONLY from the bound
object — never re-read from a second mutable path. Fresh pre-send Coinbase/Kraken prices and live latest/pending
nonces are still fetched and checked, but their expected configuration comes from the bound object.

## Execution (per-transaction, in your Rabby)

1. **Immediately before execution, run the 8-gate mainnet preflight** (read-only):
   ```bash
   node preflight-check.mjs
   ```
   If any gate fails — expiry, nonce drift off deployer 3 / tester 2, insufficient balances, changed
   dependency code, an occupied predicted address, base fee out of bounds, exposure > $130 — **STOP** and
   regenerate. Do not execute a stale packet.
3. **Start the localhost operator** (bound to 127.0.0.1 only) and open it in the Rabby browser:
   ```bash
   node operator/serve.mjs          # http://127.0.0.1:8737/
   ```
4. In the page: **Connect Rabby** (approves a connection only — no signing). The operator then **reconciles**
   its journal against chain and only THEN enables controls. It stays fully disabled (fail-closed) until the
   `bound → connected → reconciled` states are all true. Ensure Rabby is on **Robinhood Chain 4663 / 0x1237**
   and the **exact packet signer** is selected — the operator will not add or switch networks; switch manually
   and it fails closed if wrong.
5. For **each** transaction, in packet order:
   - Click **(1) Run pre-transaction checks** — re-verifies chain, account, **both latest and pending nonce**,
     prior receipts, dependency hashes, next predicted CREATE address empty, base fee, balances, a no-revert
     simulation, gas estimate ≤ packet limit, a **fresh Coinbase+Kraken (no-cache) exposure** ≤ $130, and non-expiry.
   - Click **(2) Confirm this transaction**, then **(3) Open Rabby approval** — Rabby prompts you to sign **one**
     transaction. Approve it in Rabby.
   - The operator persists a pending record on the returned hash, then a **shared verifier** compares every
     field (incl. chainId with no default, empty access list, no blob fields) and the receipt, verifies a
     receipt-event postcondition and a cumulative current-state checkpoint, journals the step, and advances.
   - Any mismatch/revert/timeout **halts permanently** — no automatic retry. If the wallet errors **after** the
     send was invoked, the operator records a **durable uncertain-send halt** (survives reload); resolve it only
     by supplying the real tx hash for exact reconciliation, or regenerate under review. Restart is always safe:
     on reload the operator re-validates every journalled tx + receipt and a cumulative checkpoint before enabling.

## What is NOT executable here
The **delayed tester withdrawal (nonce 8)** is intentionally **disabled** in this operator. It requires a
separately regenerated packet and a fresh preflight after the lock's unlock time.

## Safety properties (verified in this bundle)
- Signing occurs only in Rabby, per transaction, after your explicit click. No key/seed/keystore is ever
  requested or handled. No `eth_sendRawTransaction`, no local signer, no session keys / AA, no batching, no
  automatic sends, no automatic retries (all enforced structurally and checked by `static-scan.mjs`).
- The operator only issues a fixed read set plus one `eth_sendTransaction` per step (proven by
  `operator-test.mjs`, which drives all 19 txs on a fork with a mock provider and never touches Rabby or
  mainnet).
- The provider RPC URL is read from the environment only and never printed, serialized, or stored.
