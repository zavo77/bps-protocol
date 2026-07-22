// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {StockVaultBase} from "./StockVaultBase.t.sol";
import {StockAcquisitionVault} from "../src/StockAcquisitionVault.sol";

contract StockVaultReleaseTest is StockVaultBase {
    uint256 internal constant W = 10_000e18;
    uint256 internal constant DIST = 8_000e18; // distribution retained after one acquisition

    function setUp() public {
        _deploy();
        _acquire(address(stockA), W, 1); // vault now holds DIST of stockA, all releasable
    }

    function testReleasePartialToCoordinator() public {
        vm.prank(EXECUTOR);
        vault.releaseToDistributionCoordinator(address(stockA), 5_000e18);
        _eq(stockA.balanceOf(COORD), 5_000e18, "coordinator received");
        _eq(stockA.balanceOf(address(vault)), DIST - 5_000e18, "vault retains remainder");
        _eq(vault.distributionReleased(address(stockA)), 5_000e18, "released accounted");
        _eq(vault.distributionReleasable(address(stockA)), DIST - 5_000e18, "releasable reduced");
    }

    function testReleaseFullThenOverReleaseReverts() public {
        vm.prank(EXECUTOR);
        vault.releaseToDistributionCoordinator(address(stockA), DIST);
        _eq(stockA.balanceOf(COORD), DIST, "coordinator received all");
        _eq(vault.distributionReleasable(address(stockA)), 0, "nothing left");
        vm.prank(EXECUTOR);
        vm.expectRevert(
            abi.encodeWithSelector(StockAcquisitionVault.ReleaseExceedsAllocation.selector, 1, 0)
        );
        vault.releaseToDistributionCoordinator(address(stockA), 1);
    }

    function testReleaseEventExact() public {
        vm.expectEmit(true, true, true, true);
        emit DistributionReleased(address(stockA), COORD, 1_000e18);
        vm.prank(EXECUTOR);
        vault.releaseToDistributionCoordinator(address(stockA), 1_000e18);
    }

    function testReleaseOnlyExecutor() public {
        vm.prank(ATTACKER);
        vm.expectRevert(StockAcquisitionVault.NotAuthorizedExecutor.selector);
        vault.releaseToDistributionCoordinator(address(stockA), 1_000e18);
    }

    function testReleaseUnapprovedStockReverts() public {
        vm.prank(EXECUTOR);
        vm.expectRevert(
            abi.encodeWithSelector(StockAcquisitionVault.StockTokenNotApproved.selector, ATTACKER)
        );
        vault.releaseToDistributionCoordinator(ATTACKER, 1);
    }

    function testReleaseZeroReverts() public {
        vm.prank(EXECUTOR);
        vm.expectRevert(StockAcquisitionVault.ZeroAmount.selector);
        vault.releaseToDistributionCoordinator(address(stockA), 0);
    }

    function testReleaseExceedsAllocationReverts() public {
        vm.prank(EXECUTOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                StockAcquisitionVault.ReleaseExceedsAllocation.selector, DIST + 1, DIST
            )
        );
        vault.releaseToDistributionCoordinator(address(stockA), DIST + 1);
    }

    // A stock donation raises the raw balance but never the releasable (accounted) allocation, so it
    // can never be routed out through releaseToDistributionCoordinator.
    function testDonationCannotBeReleased() public {
        stockA.mint(address(vault), 1_000e18); // unsolicited donation
        _eq(vault.distributionReleasable(address(stockA)), DIST, "releasable unchanged by donation");
        _eq(vault.unsolicitedStockBalance(address(stockA)), 1_000e18, "donation tracked as excess");
        vm.prank(EXECUTOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                StockAcquisitionVault.ReleaseExceedsAllocation.selector, DIST + 1, DIST
            )
        );
        vault.releaseToDistributionCoordinator(address(stockA), DIST + 1);
    }
}
