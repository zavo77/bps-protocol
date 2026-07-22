// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IDistributionClaimManagerFunding
/// @notice The single frozen `DistributionClaimManager` entry point the coordinator calls to publish
///         and fund a cycle. Declared as a narrow interface so the coordinator never modifies or
///         imports the frozen manager's implementation. `publishCycle` is `onlyOwner` on the manager
///         and pulls the funded amounts from `msg.sender` (the coordinator) with its own exact
///         balance-delta check, so the coordinator must be the manager's owner and hold/approve the
///         exact stock. The Merkle root, content hashes, and window are governed inputs supplied by
///         the off-chain Proof-of-Distribution boundary; the coordinator never fabricates them.
interface IDistributionClaimManagerFunding {
    function publishCycle(
        uint256 cycleId,
        bytes32 merkleRoot,
        bytes32 allocationsContentHash,
        bytes32 manifestEnvelopeHash,
        uint64 claimStart,
        uint64 claimDeadline,
        address[] calldata assets,
        uint256[] calldata fundedAmounts
    ) external;
}
