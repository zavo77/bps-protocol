// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {LockingVaultBase} from "./LockingVaultBase.t.sol";
import {BPSLockingVault} from "../src/BPSLockingVault.sol";

contract LockingVaultLifecycleTest is LockingVaultBase {
    uint256 internal constant AMT = 100_000;
    uint32 internal constant D8 = 8 days; // an unsupported (non-tier) duration

    function setUp() public {
        _deploy();
    }

    // --- Creation validation -------------------------------------------------------------------

    // 13
    function testCreateRejectsZeroAmount() public {
        vm.prank(ALICE);
        vm.expectRevert(BPSLockingVault.ZeroAmount.selector);
        vault.createLock(0, D7);
    }

    // 14
    function testCreateRejectsZeroDuration() public {
        vm.prank(ALICE);
        vm.expectRevert(BPSLockingVault.ZeroDurationLock.selector);
        vault.createLock(AMT, 0);
    }

    // 15
    function testCreateRejectsUnsupportedDuration() public {
        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(BPSLockingVault.UnsupportedPolicyDuration.selector, D8)
        );
        vault.createLock(AMT, D8);
    }

    function _assertNoState(address user) internal view {
        _eq(vault.lockCount(user), 0, "no lock counter");
        _eq(vault.lockedPrincipal(user), 0, "no wallet principal");
        _eq(vault.totalLockedPrincipal(), 0, "no global principal");
        _false(vault.getPosition(user, 0).exists, "no position");
        _eq(bps.balanceOf(address(vault)), 0, "vault holds nothing");
    }

    // 16 & 19
    function testInsufficientBalanceFailsAtomically() public {
        vm.prank(ALICE); // ALICE approves but holds no BPS
        bps.approve(address(vault), AMT);
        vm.prank(ALICE);
        vm.expectRevert();
        vault.createLock(AMT, D7);
        _assertNoState(ALICE);
    }

    // 17 & 19
    function testInsufficientAllowanceFailsAtomically() public {
        _give(ALICE, AMT); // has balance, no approval
        vm.prank(ALICE);
        vm.expectRevert();
        vault.createLock(AMT, D7);
        _assertNoState(ALICE);
    }

    // --- Creation success ----------------------------------------------------------------------

    // 20 & 28 & 29
    function testSevenDayLockSucceeds() public {
        uint256 lockId = _lock(ALICE, AMT, D7);
        _eq(lockId, 0, "first lock id 0");
        _eq(bps.balanceOf(address(vault)), AMT, "vault funded exactly");
        _eq(bps.balanceOf(ALICE), 0, "alice principal moved");
        _eq(vault.lockedPrincipal(ALICE), AMT, "wallet principal");
        _eq(vault.totalLockedPrincipal(), AMT, "global principal");
    }

    // 21
    function testAllLockTermsSucceed() public {
        _lock(ALICE, AMT, D14);
        _lock(BOB, AMT, D21);
        _lock(CAROL, AMT, D30);
        _eq(uint256(vault.getPosition(ALICE, 0).multiplierBps), M_14D, "14d mult");
        _eq(uint256(vault.getPosition(BOB, 0).multiplierBps), M_21D, "21d mult");
        _eq(uint256(vault.getPosition(CAROL, 0).multiplierBps), M_30D, "30d mult");
    }

    // 22 & 23
    function testPositionFieldsStoredExactly() public {
        _lock(ALICE, AMT, D7);
        BPSLockingVault.LockPosition memory p = vault.getPosition(ALICE, 0);
        _eq(p.principal, AMT, "principal");
        _eq(uint256(p.startTime), T0, "start");
        _eq(uint256(p.duration), D7, "duration");
        _eq(uint256(p.unlockTime), T0 + D7, "unlock = start + duration");
        _eq(uint256(p.multiplierBps), M_7D, "multiplier");
        _eq(uint256(p.policyVersion), 1, "policy version");
        _false(p.withdrawn, "not withdrawn");
        _eq(uint256(p.withdrawnAt), 0, "no withdrawal time");
        _true(p.exists, "exists");
    }

    // 24 & 25 & 27 & 28
    function testSequentialIndependentPositions() public {
        _give(ALICE, AMT * 4);
        vm.startPrank(ALICE);
        bps.approve(address(vault), AMT * 4);
        uint256 id0 = vault.createLock(AMT, D7);
        uint256 id1 = vault.createLock(2 * AMT, D14);
        uint256 id2 = vault.createLock(AMT, D30);
        vm.stopPrank();
        _eq(id0, 0, "id0");
        _eq(id1, 1, "id1");
        _eq(id2, 2, "id2");
        _eq(vault.lockCount(ALICE), 3, "count 3");
        // independent, not merged
        _eq(vault.getPosition(ALICE, 0).principal, AMT, "p0 principal");
        _eq(vault.getPosition(ALICE, 1).principal, 2 * AMT, "p1 principal");
        _eq(vault.getPosition(ALICE, 2).principal, AMT, "p2 principal");
        _eq(uint256(vault.getPosition(ALICE, 1).multiplierBps), M_14D, "p1 mult independent");
        _eq(vault.lockedPrincipal(ALICE), 4 * AMT, "wallet principal summed");
        _eq(vault.totalLockedPrincipal(), 4 * AMT, "global principal");
    }

    // 26
    function testDifferentWalletsIndependent() public {
        _lock(ALICE, AMT, D7);
        _lock(BOB, 3 * AMT, D14);
        _eq(vault.lockCount(ALICE), 1, "alice count");
        _eq(vault.lockCount(BOB), 1, "bob count");
        _eq(vault.getPosition(ALICE, 0).principal, AMT, "alice principal");
        _eq(vault.getPosition(BOB, 0).principal, 3 * AMT, "bob principal");
        _eq(vault.lockedPrincipal(ALICE), AMT, "alice recorded");
        _eq(vault.lockedPrincipal(BOB), 3 * AMT, "bob recorded");
        _eq(vault.totalLockedPrincipal(), 4 * AMT, "global");
    }

    // 30
    function testLockCreatedEventExact() public {
        _giveAndApprove(ALICE, AMT);
        vm.expectEmit(true, true, true, true);
        emit LockCreated(ALICE, 0, AMT, T0, D7, T0 + D7, M_7D, 1);
        vm.prank(ALICE);
        vault.createLock(AMT, D7);
    }

    // --- Withdrawal ----------------------------------------------------------------------------

    // 31
    function testWithdrawBeforeExpiryFails() public {
        _lock(ALICE, AMT, D7);
        vm.warp(T0 + 1);
        vm.prank(ALICE);
        vm.expectRevert(BPSLockingVault.LockNotExpired.selector);
        vault.withdraw(0);
    }

    // 32
    function testWithdrawOneSecondBeforeExpiryFails() public {
        _lock(ALICE, AMT, D7);
        vm.warp(T0 + D7 - 1);
        vm.prank(ALICE);
        vm.expectRevert(BPSLockingVault.LockNotExpired.selector);
        vault.withdraw(0);
    }

    // 33 & 35 & 42 & 43
    function testWithdrawAtExactUnlockSucceeds() public {
        _lock(ALICE, AMT, D7);
        vm.warp(T0 + D7);
        vm.prank(ALICE);
        vault.withdraw(0);
        _eq(bps.balanceOf(ALICE), AMT, "principal returned exactly");
        _eq(bps.balanceOf(address(vault)), 0, "vault emptied");
        _eq(vault.lockedPrincipal(ALICE), 0, "wallet principal cleared");
        _eq(vault.totalLockedPrincipal(), 0, "global principal cleared");
        _true(vault.getPosition(ALICE, 0).withdrawn, "marked withdrawn");
        _eq(uint256(vault.getPosition(ALICE, 0).withdrawnAt), T0 + D7, "withdrawnAt exact");
    }

    // 34
    function testWithdrawAfterUnlockSucceeds() public {
        _lock(ALICE, AMT, D7);
        vm.warp(T0 + D7 + 100);
        vm.prank(ALICE);
        vault.withdraw(0);
        _eq(bps.balanceOf(ALICE), AMT, "principal returned");
    }

    // 36
    function testOtherWalletCannotWithdraw() public {
        _lock(ALICE, AMT, D7);
        vm.warp(T0 + D7);
        vm.prank(BOB);
        vm.expectRevert(BPSLockingVault.LockNotFound.selector);
        vault.withdraw(0); // BOB has no position 0
    }

    // 40
    function testDoubleWithdrawFails() public {
        _lock(ALICE, AMT, D7);
        vm.warp(T0 + D7);
        vm.prank(ALICE);
        vault.withdraw(0);
        vm.prank(ALICE);
        vm.expectRevert(BPSLockingVault.LockAlreadyWithdrawn.selector);
        vault.withdraw(0);
    }

    // 41
    function testNonexistentWithdrawFails() public {
        _lock(ALICE, AMT, D7);
        vm.warp(T0 + D7);
        vm.prank(ALICE);
        vm.expectRevert(BPSLockingVault.LockNotFound.selector);
        vault.withdraw(99);
    }

    // 44
    function testLockWithdrawnEventExact() public {
        _lock(ALICE, AMT, D7);
        vm.warp(T0 + D7);
        vm.expectEmit(true, true, true, true);
        emit LockWithdrawn(ALICE, 0, AMT, T0 + D7, false);
        vm.prank(ALICE);
        vault.withdraw(0);
    }

    // 75
    function testMultipleLocksWithdrawnInDifferentOrders() public {
        _give(ALICE, 6 * AMT);
        vm.startPrank(ALICE);
        bps.approve(address(vault), 6 * AMT);
        vault.createLock(AMT, D7); // id 0
        vault.createLock(2 * AMT, D14); // id 1
        vault.createLock(3 * AMT, D21); // id 2
        vm.stopPrank();
        _eq(vault.totalLockedPrincipal(), 6 * AMT, "all locked");

        vm.warp(T0 + D21); // all matured

        vm.prank(ALICE);
        vault.withdraw(1); // middle first
        _eq(vault.lockedPrincipal(ALICE), 4 * AMT, "after id1");
        _eq(vault.totalLockedPrincipal(), 4 * AMT, "global after id1");

        vm.prank(ALICE);
        vault.withdraw(0);
        _eq(vault.lockedPrincipal(ALICE), 3 * AMT, "after id0");

        vm.prank(ALICE);
        vault.withdraw(2);
        _eq(vault.lockedPrincipal(ALICE), 0, "after id2");
        _eq(vault.totalLockedPrincipal(), 0, "global cleared");
        _eq(bps.balanceOf(ALICE), 6 * AMT, "all principal returned");
    }
}
