// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IStockAcquisitionVaultView
/// @notice The read-only slice of the frozen `StockAcquisitionVault` that the concrete Rialto adapter
///         and the distribution coordinator depend on. Declared as a narrow interface so those new
///         components never modify or import the frozen vault's implementation — they only observe its
///         approved basket and its cumulative released-distribution accounting as the source of truth.
interface IStockAcquisitionVaultView {
    /// @notice Whether `token` is in the vault's frozen approved stock basket.
    function isApprovedStockToken(address token) external view returns (bool);

    /// @notice Cumulative distribution stock the vault has released to its coordinator for `token`.
    ///         Increases only inside the vault's own `releaseToDistributionCoordinator`, so it is a
    ///         trustworthy on-chain bound on how much the coordinator may fund (never donations).
    function distributionReleased(address token) external view returns (uint256);
}
