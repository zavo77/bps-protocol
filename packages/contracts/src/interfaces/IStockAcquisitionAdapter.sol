// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IStockAcquisitionAdapter
/// @notice Narrow, production-shaped boundary the StockAcquisitionVault uses to convert its custodied
///         WETH into an approved stock token. The vault binds a single adapter address at
///         construction; the caller into the vault can never supply an execution target — the
///         concrete adapter is the only contract the vault ever approves or calls. The vault pulls
///         nothing back and trusts nothing the adapter reports: it independently verifies the exact
///         WETH spent and the actual stock balance delta it observes, and rejects any mismatch.
/// @dev An implementer of `acquireStock` MUST:
///      - perform an exact-input acquisition: consume exactly `wethAmountIn` of WETH pulled from
///        `msg.sender` (the vault) via the allowance the vault grants for exactly that amount;
///      - acquire only the single requested, vault-approved `stockToken` — never a different asset;
///      - deliver the entire acquired output to `msg.sender` (the StockAcquisitionVault);
///      - deliver actual output of at least `minStockOut`;
///      - return `reportedStockOut` equal to the amount the vault will observe as its own
///        `stockToken` balance increase (the vault reverts the whole call if they differ);
///      - never accept, request, or move native ETH;
///      - retain no residual WETH and no residual acquired stock after the call (pass-through custody
///        only — the vault verifies it holds no unexpected residue via its own balance checks);
///      - fail atomically: any shortfall, over/under report, wrong/no delivery, or downstream error
///        must revert the entire call so the vault's WETH is never spent without matching stock.
///
///      `executionData` is an opaque, per-call payload for a later concrete adapter (for example a
///      quote/route blob obtained off-chain). A concrete adapter MUST lock its external execution
///      target to an immutable/registry-resolved address and MUST NOT let `executionData` designate
///      an arbitrary target, recipient, or asset. This generic interface intentionally carries no
///      registry, router, or venue-specific parameters; those belong to the concrete adapter task.
interface IStockAcquisitionAdapter {
    function acquireStock(
        address stockToken,
        uint256 wethAmountIn,
        uint256 minStockOut,
        uint256 deadline,
        bytes calldata executionData
    ) external returns (uint256 reportedStockOut);
}
