// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IRialtoRouterRegistry} from "../../src/interfaces/IRialtoRouterRegistry.sol";

/// @notice Test-only Rialto Router Registry stand-in. `ownerOf(featureId)` returns the configured
///         active router for a feature (address(0) simulates a paused/uninitialized feature). A
///         migration is simulated by changing `ownerOf(2)` between quote construction and execution.
///         Test-only; never a production asset.
contract MockRialtoRouterRegistry is IRialtoRouterRegistry {
    mapping(uint256 => address) private _current;

    function setOwner(uint256 featureId, address router) external {
        _current[featureId] = router;
    }

    function ownerOf(uint256 featureId) external view returns (address) {
        return _current[featureId];
    }
}
