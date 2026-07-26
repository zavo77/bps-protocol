# BPS Rialto Router Opaque-Call Evidence — 2026-07-26 (TASK 10K-5)

Machine-readable evidence:
[`BPS_RIALTO_ROUTER_OPAQUE_CALL_2026-07-26.evidence.json`](./BPS_RIALTO_ROUTER_OPAQUE_CALL_2026-07-26.evidence.json).

**The missing human-readable Rialto ABI is no longer a technical blocker.** Rialto's published execution
docs instruct allowance-mode integrators to submit the returned `tx.to` / `tx.data` / `tx.value`
UNMODIFIED, so the guarded executor treats `tx.data` as an **opaque, quote-bound payload** and enforces a
venue-agnostic safety envelope around it. Read-only public RPC was used; **no Rialto request, no API key,
no signing, no broadcast**. D-24 stands.

## Investigation (pinned block 19674173)

- **Router** `0xc94135b63772b91d79d0a2daab2a8801f32359bd` — runtime code hash
  `0xa7041268d6f20802f420b5c71e84a991dc797f27cb474265598b89e43ef27611` (24,232 bytes), **stable** at the
  example-tx block 19654333.
- **Proxy / upgradeability:** **direct implementation, not an EIP-1967 proxy** — implementation/admin/
  beacon slots are all zero and the creation tx (`0x516744e4…`) is a direct contract create
  (`to: null`, deployer `0xe794a9e9…`, block 52623). Upgrade path = redeploy + registry rotation, which
  the executor's approved-code-hash + registry checks halt automatically.
- **Registry** `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E` `ownerOf(2)` == the router at both the pinned
  and example-tx blocks.
- **Selector** `0x77963966` is present in the runtime dispatcher (function name **not guessed** — referred
  to as the "Rialto feature-2 allowance-settlement selector 0x77963966").
- **Historical calls:** example selector tx `0xe25bcc4e…` (block 19654333) — `to` = router, `value` 0,
  selector `0x77963966`, status success; the taker's sold token is pulled INTO the router (router is both
  target and allowance spender) and routed through pools. NVDA tx `0x6ebe4a01…` (block 10634440, an older
  selector `0x8fb4309b` on the same router) shows the router delivering NVDA to the ORIGINAL taker —
  supporting the executor's own-balance-delta minimum-output check. **Complete calldata is deliberately not
  recorded.**
- **Fork replay:** archive STATE reads succeeded (`eth_getCode` + `ownerOf(2)` at the example-tx block,
  code hash identical to the pinned block). A full `cast run` transaction replay is **UNAVAILABLE** —
  Robinhood Chain is an Arbitrum-Nitro L2 whose non-standard block/tx encoding (`l1BlockNumber`/`sendRoot`/
  tx type `0x6a`) foundry 1.7.1 cannot deserialize; deep-archive state at the very old block was also not
  served. This is a tooling limitation, not missing state, and is not a blocker.
- **Bytecode evidence (not an authoritative ABI, not relied upon):** the deployment bytecode contains the
  readable type strings `RialtoSwap(address recipient,address buyToken,uint256 minBuyAmount,uint64
deadline,address feeRecipient,uint16 srcBps,uint16 dstBps,bytes32 referralCode,bytes32 quoteId,bytes32
actionsHash)` and `TokenPermissions(address token,uint256 amount)`.

## Why the inner ABI is unnecessary

The executor never decodes or generates Rialto's inner action bytes. Safety holds regardless of what the
calldata encodes: registry-locked target **and** approved runtime code hash **and** approved leading
selector; WETH→NVDA only, `tx.value` 0, and only the exact sell amount approved to the router (it cannot
spend more); the executor's OWN measured NVDA balance delta must meet the minimum (output routed elsewhere
reverts); the allowance is cleared to zero and the digest+nonce consumed atomically, with a full revert on
any failure. A malicious quote can only reduce output (caught by the minimum) or fail (reverts) — it can
never redirect the executor's WETH or credit the wrong asset. See
[`GuardedSettlementExecutor.sol`](../../packages/contracts/src/GuardedSettlementExecutor.sol) and the
malicious-router tests in
[`GuardedSettlementExecutor.t.sol`](../../packages/contracts/test/GuardedSettlementExecutor.t.sol).

## Decision state

- The missing human-readable ABI is **no longer a technical blocker**.
- `0x77963966` may be approved **only** when paired with the observed router runtime code hash
  (`0xa7041268…27611`); the executor enforces this on-chain.
- Any router rotation or code-hash change **automatically halts** settlement pending review.
- **D-6** remains open only for final production Safe/taker approval and formal activation — not because
  Rialto support is unavailable.
- The trusted production **price-source** decision remains separate (**D-22B**).
- **D-24** continues to prohibit live execution.
