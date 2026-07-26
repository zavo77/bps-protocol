# Safe Controller Setup Packet — guarded-settlement controller (TASK 10K-7)

Sanitized, **non-broadcast** procedure for creating the deployed-contract controller (a Gnosis Safe) that
will own `GuardedSettlementExecutor` on **Robinhood Chain (chainId 4663)**. Conclusion of the live
investigation: **`CANONICAL_SAFE_STACK_AVAILABLE`** — the Safe **v1.4.1** stack is officially listed for
4663 and its live runtime code hashes match the official `safe-deployments` manifests (see
[`docs/audit/BPS_RIALTO_LIVE_ORACLE_2026-07-26.md`](../../../docs/audit/BPS_RIALTO_LIVE_ORACLE_2026-07-26.md)).

> **This packet constructs, signs, and broadcasts NOTHING.** It documents the verified components and the
> preparation/verification steps. Owners and threshold are **unresolved founder inputs**. D-24 stands: no
> deployment, funding, approval, or execution is authorized here. Do not assume Safe's web UI supports
> Robinhood Chain — treat Safe creation as a direct, separately reviewed contract interaction.

## Verified components (live on chain 4663; do not re-trust without re-verifying)

| Component                             | Address (v1.4.1)                             |
| ------------------------------------- | -------------------------------------------- |
| SafeL2 singleton (use this on the L2) | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` |
| SafeProxyFactory                      | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` |
| CompatibilityFallbackHandler          | `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99` |
| MultiSend                             | `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526` |
| MultiSendCallOnly                     | `0x9641d764fc13c8B624c04430C7356C1C7C8102e2` |

Re-verify each with read-only `eth_getCode` before use and compare the keccak256 to the manifest code hash.

## Unresolved founder inputs (fill before any preparation)

- `owners`: the list of owner addresses (each a real, controlled key/hardware wallet). **UNRESOLVED.**
- `threshold`: required signatures `m` of `n` (must be `1 <= m <= owners.length`). **UNRESOLVED.**
- `saltNonce`: a chosen uint256 for the deterministic proxy address. **UNRESOLVED.**

## Initializer shape (Safe v1.4.1 `setup`)

The proxy is created by `SafeProxyFactory.createProxyWithNonce(singleton, initializer, saltNonce)`, where
`initializer` = `Safe.setup(...)` calldata with:

```
setup(
  address[] owners,          // founder input
  uint256   threshold,       // founder input
  address   to,              // address(0) — no delegatecall module setup
  bytes     data,            // 0x — no setup module call
  address   fallbackHandler, // 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99
  address   paymentToken,    // address(0)
  uint256   payment,         // 0
  address   paymentReceiver  // address(0)
)
```

Keep `to`/`data` empty (no module delegatecall) unless a separately reviewed module is required.

## Deterministic address procedure (address known before deployment)

1. Compute `initializer` = the `setup(...)` calldata above from the resolved owners/threshold.
2. `salt = keccak256(abi.encodePacked(keccak256(initializer), saltNonce))`.
3. `deploymentData = SafeProxy.creationCode ++ abi.encode(uint256(uint160(SafeL2Singleton)))`.
4. `predicted = CREATE2(deployer = SafeProxyFactory, salt, keccak256(deploymentData))`.
5. Verify off-chain (e.g. with the official Safe SDK) that `predicted` is contract-free (`eth_getCode` == 0x)
   before any deployment, and re-derive it after any owners/threshold/salt change.

## Non-broadcast preparation + verification (no signing here)

1. Resolve owners, threshold, saltNonce.
2. Build the `initializer` and the `createProxyWithNonce` calldata **offline**; record the predicted address.
3. Independent review of owners, threshold, and the predicted address (this is a controller for a
   value-moving executor — treat it as security-critical).
4. Read-only re-verification of all five component code hashes on chain 4663.
5. **STOP.** Actual creation (signing + broadcast of `createProxyWithNonce`), funding, and any subsequent
   `GuardedSettlementExecutor` configuration/unpause require a **new, bounded, independently reviewed
   authorization** replacing the expired D-24. None is granted by this packet.

## After the Safe exists (still gated on authorization)

Set `GS_CONTROLLER` to the Safe address and re-run the read-only canary preflight (see
[`GUARDED_SETTLEMENT_RUNBOOK.md`](./GUARDED_SETTLEMENT_RUNBOOK.md) §4); the `CONTROLLER_REQUIRED` failure
must clear. Then follow the runbook §5 controller-driven deploy → configure → preflight → unpause. An
alternative to a Safe is any other **audited, deployed-contract** controller; an EOA is rejected by the
executor and by the preflight.
