// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IStockTokenOracleState
/// @notice Minimal read-only view of a Robinhood Stock Token's oracle state (TASK 10K-6). Per the
///         official Robinhood tokenized-equity documentation, consumers must halt when the token
///         reports `oraclePaused() == true` (corporate actions / multiplier transitions).
interface IStockTokenOracleState {
    function oraclePaused() external view returns (bool);
}
