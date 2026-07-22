// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {LockingVaultBase} from "./LockingVaultBase.t.sol";
import {BPSLockingVault} from "../src/BPSLockingVault.sol";

contract LockingVaultEmergencyTest is LockingVaultBase {
    uint256 internal constant AMT = 100_000;

    function setUp() public {
        _deploy();
    }

    // 58
    function testOnlyOwnerCanEnableEmergency() public {
        vm.prank(ALICE);
        vm.expectRevert();
        vault.enableEmergencyExit();
    }

    // 59
    function testEmergencyActivationTimestampAndEvent() public {
        vm.expectEmit(true, true, true, true);
        emit EmergencyExitEnabled(OWNER, T0);
        vm.prank(OWNER);
        vault.enableEmergencyExit();
        _true(vault.emergencyExitEnabled(), "enabled");
        _eq(uint256(vault.emergencyExitEnabledAt()), T0, "activation timestamp exact");
    }

    // 60 & 61
    function testEmergencyCannotBeEnabledTwiceOrDisabled() public {
        vm.prank(OWNER);
        vault.enableEmergencyExit();
        vm.prank(OWNER);
        vm.expectRevert(BPSLockingVault.EmergencyExitAlreadyEnabled.selector);
        vault.enableEmergencyExit();
        // No disable function exists; state remains enabled.
        _true(vault.emergencyExitEnabled(), "still enabled (no disable path)");
    }

    // 62
    function testNewLocksFailAfterEmergency() public {
        vm.prank(OWNER);
        vault.enableEmergencyExit();
        _giveAndApprove(ALICE, AMT);
        vm.prank(ALICE);
        vm.expectRevert(BPSLockingVault.NewLocksDisabled.selector);
        vault.createLock(AMT, D7);
    }

    // 63 & 64 & 65 & 66 & 67 & 68 & 69
    function testEmergencyEarlyWithdrawalAndWeightDemotion() public {
        _lock(ALICE, AMT, D30); // long lock, bonus 1.75x
        uint256 vaultBalBefore = bps.balanceOf(address(vault));

        vm.warp(T0 + 100);
        vm.prank(OWNER);
        vault.enableEmergencyExit(); // activatedAt = T0 + 100

        // 69: activation itself moves no funds.
        _eq(bps.balanceOf(address(vault)), vaultBalBefore, "activation transfers nothing");

        // 67: historical weight before activation keeps the original 1.75x multiplier.
        _eq(vault.positionWeightAt(ALICE, 0, T0 + 50), 175_000, "pre-activation bonus retained");
        // 65: at exact activation, bonus drops to 1.00x.
        _eq(vault.positionWeightAt(ALICE, 0, T0 + 100), 100_000, "activation demotes to base");
        // 66: after activation, still 1.00x while unwithdrawn.
        _eq(vault.positionWeightAt(ALICE, 0, T0 + 200), 100_000, "post-activation base");

        // 63 & 64: owner-independent early withdrawal returns exactly principal (before expiry).
        vm.prank(ALICE);
        vault.withdraw(0);
        _eq(bps.balanceOf(ALICE), AMT, "principal returned early");
        _eq(vault.totalLockedPrincipal(), 0, "liability cleared");

        // 68: after emergency withdrawal, weight is zero.
        _eq(vault.positionWeight(ALICE, 0), 0, "post-withdrawal weight zero");
        _eq(vault.positionWeightAt(ALICE, 0, T0 + 100), 0, "at withdrawnAt zero");
    }

    // 70
    function testOwnerCannotWithdrawParticipantPrincipal() public {
        _lock(ALICE, AMT, D7);
        vm.warp(T0 + D7);
        // The owner has no position and there is no owner-withdraw path.
        vm.prank(OWNER);
        vm.expectRevert(BPSLockingVault.LockNotFound.selector);
        vault.withdraw(0);
        _eq(bps.balanceOf(OWNER), 0, "owner received nothing");
        _eq(vault.lockedPrincipal(ALICE), AMT, "alice principal intact");

        // Even after enabling emergency, the owner still cannot take Alice's funds.
        vm.prank(OWNER);
        vault.enableEmergencyExit();
        vm.prank(OWNER);
        vm.expectRevert(BPSLockingVault.LockNotFound.selector);
        vault.withdraw(0);
        _eq(bps.balanceOf(OWNER), 0, "owner still received nothing");
    }
}
