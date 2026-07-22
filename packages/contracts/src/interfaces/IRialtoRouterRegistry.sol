// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IRialtoRouterRegistry
/// @notice Minimal read-only view of the Rialto Router Registry used to resolve the current active
///         taker-submitted swap router (feature ID 2) on Robinhood Chain.
/// @dev VERIFIED against the official Rialto router-registry documentation
///      (https://docs.rialto.xyz/developers/router-registries): the registry address is
///      `0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E`; feature ID 2 = the taker-submitted (normal)
///      swap router; and `ownerOf(uint256 featureId)` returns the current active router and **REVERTS
///      when the feature is paused or uninitialized** (it does NOT return a sentinel zero address). The
///      registry also exposes `prev`/`next`/`getFeature(...) -> (previous, current, next, paused)`; the
///      adapter deliberately does NOT use them and accepts ONLY `ownerOf(2)` as an execution target, so
///      a paused/uninitialized feature makes the acquisition **fail closed** (the `ownerOf` call
///      reverts) and a migration to a new router makes a stale quote's target mismatch and revert. The
///      adapter therefore does not need to distinguish paused from uninitialized — both fail closed.
///      (Only `ownerOf` is declared here since it is the only accessor the adapter calls.)
interface IRialtoRouterRegistry {
    /// @notice The current active router for `featureId` (feature ID 2 = taker-submitted swap router).
    ///         REVERTS when the feature is paused or uninitialized. Never returns a sentinel address.
    function ownerOf(uint256 featureId) external view returns (address);
}
