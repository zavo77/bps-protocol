// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title BuildProbe
/// @notice Harmless probe contract proving the Foundry toolchain compiles and tests.
///         Contains no protocol logic and must never be deployed to a live network.
contract BuildProbe {
    /// @notice Returns a fixed marker value.
    function ping() external pure returns (bytes32) {
        return keccak256("bps.build-probe");
    }
}
