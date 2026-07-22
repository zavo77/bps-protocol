// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {LockingVaultBase} from "./LockingVaultBase.t.sol";
import {BPSLockingVault} from "../src/BPSLockingVault.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";
import {FailingERC20Mock} from "./mocks/FailingERC20Mock.sol";
import {ReentrantBPSMock} from "./mocks/ReentrantBPSMock.sol";

/// @notice Adversarial-token tests: exact-funding rejection, failed-transfer atomicity, and
///         reentrancy resistance. Each deploys a vault backed by a hostile mock token.
contract LockingVaultHostileTest is LockingVaultBase {
    uint256 internal constant AMT = 100_000;

    function setUp() public {
        vm.warp(T0);
    }

    // 18 & 19
    function testFeeOnTransferFundingFailsAtomically() public {
        MockFeeOnTransferERC20 fee = new MockFeeOnTransferERC20("Fee", "FEE", 100); // 1% fee
        BPSLockingVault v = new BPSLockingVault(address(fee), OWNER);
        fee.mint(ALICE, AMT);
        vm.prank(ALICE);
        fee.approve(address(v), AMT);
        vm.prank(ALICE);
        vm.expectRevert(); // FundingAmountMismatch: received < declared
        v.createLock(AMT, D7);
        _eq(v.lockCount(ALICE), 0, "no lock counter");
        _eq(v.totalLockedPrincipal(), 0, "no liability");
        _false(v.getPosition(ALICE, 0).exists, "no position");
    }

    // 39
    function testWithdrawRevertsOnFailedOutgoingTransfer() public {
        FailingERC20Mock tok = new FailingERC20Mock();
        BPSLockingVault v = new BPSLockingVault(address(tok), OWNER);
        tok.mint(ALICE, AMT);
        vm.prank(ALICE);
        tok.approve(address(v), AMT);
        vm.prank(ALICE);
        v.createLock(AMT, D7);

        vm.warp(T0 + D7);
        tok.setFailTransfers(true);
        vm.prank(ALICE);
        vm.expectRevert(); // outgoing transfer reverts
        v.withdraw(0);

        // Full rollback: nothing consumed.
        _false(v.getPosition(ALICE, 0).withdrawn, "position not withdrawn");
        _eq(v.lockedPrincipal(ALICE), AMT, "wallet principal intact");
        _eq(v.totalLockedPrincipal(), AMT, "global principal intact");
    }

    // 76
    function testReentrantCreateLockBlocked() public {
        ReentrantBPSMock tok = new ReentrantBPSMock();
        BPSLockingVault v = new BPSLockingVault(address(tok), OWNER);
        tok.mint(ALICE, 2 * AMT);
        vm.prank(ALICE);
        tok.approve(address(v), 2 * AMT);
        tok.armCreate(v, AMT, D7); // re-enter createLock during funding transferFrom

        vm.prank(ALICE);
        v.createLock(AMT, D7);

        _true(tok.reentryAttempted(), "reentry attempted");
        _true(tok.reentryReverted(), "reentry blocked by guard");
        _eq(v.lockCount(ALICE), 1, "only one lock created");
        _eq(v.getPosition(ALICE, 0).principal, AMT, "single position principal");
    }

    // 77 & 38
    function testReentrantWithdrawBlockedNoDuplication() public {
        ReentrantBPSMock tok = new ReentrantBPSMock();
        BPSLockingVault v = new BPSLockingVault(address(tok), OWNER);
        tok.mint(ALICE, AMT);
        vm.prank(ALICE);
        tok.approve(address(v), AMT);
        vm.prank(ALICE);
        v.createLock(AMT, D7);

        vm.warp(T0 + D7);
        tok.armWithdraw(v, 0); // re-enter withdraw during payout transfer

        vm.prank(ALICE);
        v.withdraw(0);

        _true(tok.reentryAttempted(), "reentry attempted");
        _true(tok.reentryReverted(), "reentry blocked by guard");
        _eq(tok.balanceOf(ALICE), AMT, "principal paid exactly once (no duplication)");
        _eq(tok.balanceOf(address(v)), 0, "vault emptied exactly once");
        _true(v.getPosition(ALICE, 0).withdrawn, "state consumed before transfer (CEI)");
    }
}
