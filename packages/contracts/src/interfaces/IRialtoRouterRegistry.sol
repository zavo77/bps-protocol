// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IRialtoRouterRegistry
/// @notice Minimal read-only view of the Rialto Router Registry used to resolve the current active
///         taker-submitted swap router (feature ID 2) on Robinhood Chain.
/// @dev The registry address (`0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E`) and the "feature ID 2 =
///      active taker-submitted swap router" semantics are per the official Rialto router-registry
///      documentation. The exact accessor name (`ownerOf`) follows the interface stated in the BPS
///      task specification for reading the current feature owner; it, and that the registry returns
///      the zero address for a paused/uninitialized feature, MUST be independently verified against
///      the deployed registry's real ABI before any deployment (recorded as a config blocker). The
///      adapter accepts ONLY `ownerOf(2)` as an execution target — never a previous or staged router —
///      so a router migration between quote and execution reverts and forces a fresh quote.
interface IRialtoRouterRegistry {
    /// @notice The current router registered for `featureId` (feature ID 2 = taker-submitted swap
    ///         router). Returns the zero address if the feature is paused, missing, or uninitialized.
    function ownerOf(uint256 featureId) external view returns (address);
}
