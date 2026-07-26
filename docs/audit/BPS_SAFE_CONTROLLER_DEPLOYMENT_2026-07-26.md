# Canonical 2-of-3 Safe Controller — Deployment Record & Verification — 2026-07-26 (TASK 10K-8)

Machine-readable evidence: [`BPS_SAFE_CONTROLLER_DEPLOYMENT_2026-07-26.evidence.json`](./BPS_SAFE_CONTROLLER_DEPLOYMENT_2026-07-26.evidence.json).

**Result: `SAFE_DEPLOYED_AND_VERIFIED`.** The founder signed and broadcast the single authorized Safe-creation
transaction through Owner 1's Rabby wallet. Claude performed **only** independent read-only verification and
this sanitized record — **no signing, no broadcast, no funding, no executor action.** D-24 remains fully
effective for the executor, settlement, and canary; the one-time Safe-creation authorization is **consumed.**

## Safe

- **Address:** `0x62Ae5b22Dd28Ee338E5A447ed849f9C7008A5E62` (Gnosis Safe **v1.4.1**, SafeL2, 2-of-3)
- **Owners (canonical EIP-55):** `0x7116F2998e625651D310E97919a1c638a7F82ba2`,
  `0x006024ff3b9b707ad0779eD3586546440fAAC49f`, `0xd5Bb1534Efc88400f34A832D85D0939c0e2F1759`
- **Threshold:** 2 · **Nonce:** 0 · **Modules:** none · **Guard:** none
- **Master copy / singleton:** `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` (SafeL2 v1.4.1)
- **Proxy factory:** `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` · **Fallback handler:**
  `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99`
- **Salt nonce:** `0x87893661a8fb3d315b0be111a0c6d3512fb3b901318f9b5b97f85ca9452c8cf9`
- **Runtime:** 171 bytes, keccak `0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c`

## Deployment transaction

- **Hash:** `0x09a4b2c179da9b1ab2abfc0c2b8067a07fe5850f026d8f8aa89af4d5451ccbb0`
- **Sender:** Owner 1 `0x7116F2998e625651D310E97919a1c638a7F82ba2` · **To:** the canonical proxy factory ·
  **Method:** `createProxyWithNonce(address,bytes,uint256)` · **Value:** 0
- **Block:** 19831992 · **Hash:** `0x304d994ffc9a9a853371d9349984258305c9654dd8b2b325c357a5ca721e77b2` ·
  **Timestamp:** 2026-07-26T11:23:46Z
- **Receipt status:** 1 · **Gas used:** 306172 · **Native cost:** 0.00001661289272 ETH (effGasPrice 54.26 Mwei)
- **`ProxyCreation`:** exactly one — proxy = the Safe address, singleton = the reviewed SafeL2.

## Independent post-deployment verification — 29/29 pass

Receipt status 1 ✓; chainId 4663 ✓; block number/hash/timestamp match ✓; sender = Owner 1 ✓; destination =
canonical proxy factory ✓; value 0 ✓; gas used 306172 ✓; native cost 0.00001661289272 ETH ✓; exactly one
`ProxyCreation` ✓ (proxy = Safe, singleton = SafeL2); Safe VERSION() = 1.4.1 ✓; `getOwners()` = exactly the
three approved owners ✓; `getThreshold()` = 2 ✓; nonce = 0 ✓; slot-0 master copy = SafeL2 singleton ✓;
fallback-handler slot = canonical handler ✓; guard slot = zero ✓; `getModulesPaginated` = no modules ✓; Safe
native / WETH / NVDA balances all zero ✓; runtime length 171 ✓; runtime hash matches reviewed SafeProxy ✓; no
token Transfer/Approval logs ✓; only the factory `ProxyCreation` + the new Safe `SafeSetup` creation logs (no
foreign logs) ✓; no executor deployment / controller transfer / approval / swap / settlement / canary ✓.

## Confirmations

- **No private key or mnemonic** was read or requested by Claude; **no authenticated RPC URL** was exposed
  (verification used the public official endpoint).
- **Claude did not sign, broadcast, retry, fund, approve, deploy the executor, transfer control, swap,
  settle, or execute a canary.**
- **No funds were sent to the Safe** (native/WETH/NVDA balances all zero); the **Safe has executed no
  transaction** (nonce 0).
- The **one-time Safe-creation authorization is consumed.** **D-24 remains fully in force** for the executor,
  settlement, and canary.

## Controller status

The Safe is recorded as the **verified candidate contract controller** for the guarded-settlement executor.
It is **NOT** activated as the executor controller — **no `GuardedSettlementExecutor` is deployed**, so the
Safe currently owns and controls nothing. Activation remains gated on independent audit (D-3), counsel
(D-23), a new bounded founder authorization replacing the expired D-24, and the controller-driven
deploy → configure → `transferOwnership(Safe)` → `acceptOwnership` flow in
[`GUARDED_SETTLEMENT_RUNBOOK.md`](../../packages/contracts/deploy/GUARDED_SETTLEMENT_RUNBOOK.md) §5.
