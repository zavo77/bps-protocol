// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ISettlementPriceGuard
/// @notice Price guard the GuardedSettlementExecutor MUST consult before any settlement (TASK 10K-4).
/// @dev The executor requires a configured, non-zero guard and calls `check` inside the settlement flow;
///      the guard MUST REVERT if the trade is not acceptable (stale reference, disallowed source, or the
///      requested minimum return deviating too far from its trusted reference). The guard owns its own
///      reference source and freshness policy; the executor treats a successful (non-reverting) call as a
///      pass. NO production price guard is authorized in this task — D-22B remains open; only local mocks
///      are used in tests.
interface ISettlementPriceGuard {
    /// @notice Revert if the trade is not acceptable against the guard's trusted, fresh reference.
    /// @param sellToken The token being sold (WETH).
    /// @param buyToken The token being bought (stock token).
    /// @param sellAmount Exact sell amount (raw base units).
    /// @param minBuyAmount Minimum acceptable buy amount (raw base units) the settlement will enforce.
    /// @param maxDeviationBps Maximum permitted deviation from the trusted reference, in basis points.
    function check(
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 minBuyAmount,
        uint16 maxDeviationBps
    ) external view;
}
