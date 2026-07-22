// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BPSLockingVault} from "../src/BPSLockingVault.sol";
import {BPSToken} from "../src/BPSToken.sol";

/// @dev Minimal Foundry cheatcode surface, declared inline (no forge-std / submodules), matching
///      the established repository pattern.
interface Vm {
    function warp(uint256 newTimestamp) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function expectEmit(bool a, bool b, bool c, bool d) external;
    function assume(bool condition) external pure;
}

/// @notice Shared setup and helpers for BPSLockingVault tests. Abstract, so Foundry does not run it
///         as a suite. Uses the real BPSToken so the production token/vault interaction is proven.
///         All addresses and actions are fictional and local-only.
abstract contract LockingVaultBase {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    // Mirror the vault events for vm.expectEmit matching.
    event LockCreated(
        address indexed account,
        uint256 indexed lockId,
        uint256 principal,
        uint64 startTime,
        uint32 duration,
        uint64 unlockTime,
        uint16 multiplierBps,
        uint16 policyVersion
    );
    event LockWithdrawn(
        address indexed account,
        uint256 indexed lockId,
        uint256 principal,
        uint64 withdrawnAt,
        bool emergency
    );
    event EmergencyExitEnabled(address indexed caller, uint64 timestamp);

    address internal constant OWNER = address(0x0A11);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA201);

    uint32 internal constant D7 = 7 days;
    uint32 internal constant D14 = 14 days;
    uint32 internal constant D21 = 21 days;
    uint32 internal constant D30 = 30 days;

    uint16 internal constant M_UNLOCKED = 10_000;
    uint16 internal constant M_7D = 11_000;
    uint16 internal constant M_14D = 12_500;
    uint16 internal constant M_21D = 15_000;
    uint16 internal constant M_30D = 17_500;

    // A comfortable non-zero starting timestamp so "one second before start/expiry" is expressible.
    // Typed uint64 so event-field comparisons need no truncating cast.
    uint64 internal constant T0 = 1_000_000;

    BPSToken internal bps;
    BPSLockingVault internal vault;

    function _deploy() internal {
        vm.warp(T0);
        bps = new BPSToken(address(this)); // this test contract holds the full fixed supply
        vault = new BPSLockingVault(address(bps), OWNER);
    }

    /// @dev Move `amount` BPS to `user` from the test contract's holdings.
    function _give(address user, uint256 amount) internal {
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(user, amount);
    }

    /// @dev Give `amount` BPS to `user` and approve the vault to pull it.
    function _giveAndApprove(address user, uint256 amount) internal {
        _give(user, amount);
        vm.prank(user);
        bps.approve(address(vault), amount);
    }

    /// @dev Full happy-path lock for `user`; returns the new lock id.
    function _lock(address user, uint256 amount, uint32 duration)
        internal
        returns (uint256 lockId)
    {
        _giveAndApprove(user, amount);
        vm.prank(user);
        lockId = vault.createLock(amount, duration);
    }

    // --- Assertions (require-based; no forge-std) ------------------------------------------------

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function _eq(address a, address b, string memory m) internal pure {
        require(a == b, m);
    }

    function _eq(bool a, bool b, string memory m) internal pure {
        require(a == b, m);
    }

    function _true(bool c, string memory m) internal pure {
        require(c, m);
    }

    function _false(bool c, string memory m) internal pure {
        require(!c, m);
    }
}
