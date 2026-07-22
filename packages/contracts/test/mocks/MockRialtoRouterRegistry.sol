// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IRialtoRouterRegistry} from "../../src/interfaces/IRialtoRouterRegistry.sol";

/// @notice Test-only Rialto Router Registry stand-in matching the VERIFIED official semantics:
///         `ownerOf(featureId)` returns the current router for a feature and **reverts** when the
///         feature is paused or uninitialized (it does NOT return a sentinel). `setOwner` configures a
///         feature (a migration is simulated by re-pointing feature 2); `pause`/`unset` makes `ownerOf`
///         revert like a paused/uninitialized feature; `forceReturnZero` makes it return `address(0)`
///         without reverting so the adapter's defensive zero-router guard can be exercised. Test-only.
contract MockRialtoRouterRegistry is IRialtoRouterRegistry {
    mapping(uint256 => bool) private _configured;
    mapping(uint256 => address) private _current;
    mapping(uint256 => bool) private _returnZero;

    error FeaturePausedOrUninitialized(uint256 featureId);

    function setOwner(uint256 featureId, address router) external {
        _configured[featureId] = true;
        _returnZero[featureId] = false;
        _current[featureId] = router;
    }

    /// @dev Simulate a paused or uninitialized feature: `ownerOf` reverts (verified real behavior).
    function pause(uint256 featureId) external {
        _configured[featureId] = false;
    }

    /// @dev Simulate a (non-conformant) registry that returns address(0) instead of reverting, to
    ///      exercise the adapter's defensive zero-router guard.
    function forceReturnZero(uint256 featureId) external {
        _configured[featureId] = true;
        _returnZero[featureId] = true;
    }

    function ownerOf(uint256 featureId) external view returns (address) {
        if (!_configured[featureId]) revert FeaturePausedOrUninitialized(featureId);
        return _returnZero[featureId] ? address(0) : _current[featureId];
    }
}
