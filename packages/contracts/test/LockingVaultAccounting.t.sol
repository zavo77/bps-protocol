// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {LockingVaultBase} from "./LockingVaultBase.t.sol";

contract LockingVaultAccountingTest is LockingVaultBase {
    uint256 internal constant AMT = 100_000;

    function setUp() public {
        _deploy();
    }

    function _donate(uint256 amount) internal {
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(address(vault), amount); // unsolicited transfer straight to the vault
    }

    // 71
    function testMaturedWithdrawalWorksAfterRenounce() public {
        _lock(ALICE, AMT, D7);
        vm.prank(OWNER);
        vault.renounceOwnership();
        _eq(vault.owner(), address(0), "ownership renounced");

        vm.warp(T0 + D7);
        vm.prank(ALICE);
        vault.withdraw(0); // still permissionless / self-service
        _eq(bps.balanceOf(ALICE), AMT, "matured withdrawal still works");
    }

    // 72
    function testDonationDoesNotCreatePositionOrAccounting() public {
        _donate(500);
        _eq(bps.balanceOf(address(vault)), 500, "donation held (stranded)");
        _eq(vault.totalLockedPrincipal(), 0, "no global principal");
        _eq(vault.lockedPrincipal(ALICE), 0, "no wallet principal");
        _eq(vault.lockCount(ALICE), 0, "no lock counter");
        _false(vault.getPosition(ALICE, 0).exists, "no position");
    }

    // 73 & 74
    function testDonationDoesNotInflateWithdrawalAndLiabilityIsCovered() public {
        _lock(ALICE, AMT, D7);
        _true(bps.balanceOf(address(vault)) >= vault.totalLockedPrincipal(), "covered after lock");

        _donate(5000); // unsolicited donation
        _true(
            bps.balanceOf(address(vault)) >= vault.totalLockedPrincipal(), "covered after donation"
        );
        _eq(vault.lockedPrincipal(ALICE), AMT, "donation did not change recorded principal");

        vm.warp(T0 + D7);
        vm.prank(ALICE);
        vault.withdraw(0);
        _eq(bps.balanceOf(ALICE), AMT, "withdrawal returns only recorded principal, not donation");
        _eq(bps.balanceOf(address(vault)), 5000, "donation remains stranded in vault");
        _true(
            bps.balanceOf(address(vault)) >= vault.totalLockedPrincipal(),
            "covered after withdrawal"
        );
    }

    // 74 (multi-wallet liability coverage across concurrent locks)
    function testLiabilityCoveredAcrossConcurrentLocks() public {
        _lock(ALICE, AMT, D7);
        _lock(BOB, 3 * AMT, D14);
        _lock(CAROL, 2 * AMT, D30);
        _eq(vault.totalLockedPrincipal(), 6 * AMT, "global liability");
        _eq(bps.balanceOf(address(vault)), 6 * AMT, "vault holds exactly liability");
        _true(
            bps.balanceOf(address(vault)) >= vault.totalLockedPrincipal(),
            "balance covers liability"
        );

        vm.warp(T0 + D14);
        vm.prank(BOB);
        vault.withdraw(0);
        _eq(vault.totalLockedPrincipal(), 3 * AMT, "liability after bob");
        _true(bps.balanceOf(address(vault)) >= vault.totalLockedPrincipal(), "still covered");
    }
}
