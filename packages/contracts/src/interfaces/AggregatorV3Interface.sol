// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title AggregatorV3Interface
/// @notice Minimal, locally defined Chainlink V3 aggregator interface (TASK 10K-6). Defined here so the
///         price guard does not pull a large external dependency for three view functions; matches the
///         official published Chainlink signature set used by Robinhood Chain feed proxies.
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}
