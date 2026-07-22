// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IStockAcquisitionVaultOps
/// @notice The exact slice of the frozen `StockAcquisitionVault` the DistributionFundingCoordinator
///         calls and reads when it occupies BOTH the vault's immutable `acquisitionExecutor` and
///         `distributionFundingCoordinator` roles. Declared as a narrow interface so the coordinator
///         never modifies or imports the frozen vault's implementation. The coordinator derives every
///         recorded amount from the vault's own before/after cumulative-counter deltas — never from a
///         caller-reported value — and executeAcquisition/release are `acquisitionExecutor`-gated, so
///         only the coordinator can move these counters (guaranteeing clean per-acquisition deltas).
interface IStockAcquisitionVaultOps {
    function executeAcquisition(
        address stockToken,
        uint256 wethAmountIn,
        uint256 minStockOut,
        uint256 deadline,
        bytes calldata executionData
    ) external returns (uint256 actualStockOut);

    function releaseToDistributionCoordinator(address stockToken, uint256 amount) external;

    function isApprovedStockToken(address token) external view returns (bool);
    function totalWethSpent() external view returns (uint256);
    function totalStockAcquired(address token) external view returns (uint256);
    function distributionAllocated(address token) external view returns (uint256);
    function reserveAllocated(address token) external view returns (uint256);
    function distributionReleased(address token) external view returns (uint256);
    function DISTRIBUTION_PERCENT() external view returns (uint256);
    function SPLIT_DENOMINATOR() external view returns (uint256);
}
