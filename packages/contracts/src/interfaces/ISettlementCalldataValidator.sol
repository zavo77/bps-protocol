// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ISettlementCalldataValidator
/// @notice Per-selector validator that proves the COMPLETE router calldata matches the settlement intent
///         (TASK 10K-4). A selector allow-list alone is insufficient: each approved selector MUST have a
///         validator that decodes the exact ABI for that selector and confirms every settlement-critical
///         field. The executor rejects any selector with no registered validator.
/// @dev The validator MUST REVERT on any mismatch. It is registered per-selector by the controller. The
///      real Rialto selector `0x77963966` has NO validator until its authoritative ABI/source is proven,
///      so it stays disabled. Only a fake test selector + mock validator are exercised in this task.
interface ISettlementCalldataValidator {
    /// @notice The exact intent fields the router calldata must encode. `recipient` is the executor.
    struct IntentView {
        address sellToken;
        address buyToken;
        uint256 sellAmount;
        uint256 minBuyAmount;
        address recipient; // MUST equal the executor (the taker + purchased-token recipient)
        uint16 maxPlatformFeeBps; // platform fee encoded in calldata MUST be <= this
    }

    /// @notice Revert unless `routerCalldata` (a) begins with `selector` and (b) encodes exactly the
    ///         fields in `intent`: sell/buy token, exact sell amount, minimum buy amount, recipient ==
    ///         executor, platform fee <= max, and zero integrator fee. Implementations MUST NOT emit or
    ///         persist the complete calldata.
    function validate(bytes4 selector, bytes calldata routerCalldata, IntentView calldata intent)
        external
        view;
}
