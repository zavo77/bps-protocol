// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {StockVaultBase} from "./StockVaultBase.t.sol";
import {StockAcquisitionVault} from "../src/StockAcquisitionVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StockVaultAcquisitionTest is StockVaultBase {
    uint256 internal constant W = 10_000e18; // WETH in
    uint256 internal constant OUT = 10_000e18; // actual stock out (RATE = 1)
    uint256 internal constant DIST = 8_000e18; // 80%
    uint256 internal constant RESV = 2_000e18; // 20% + remainder

    function setUp() public {
        _deploy();
    }

    function testAcquisitionCleanSplit() public {
        uint256 wethBefore = weth.balanceOf(address(vault));
        uint256 got = _acquire(address(stockA), W, 9_000e18);

        _eq(got, OUT, "returns actual stock out");
        _eq(weth.balanceOf(address(vault)), wethBefore - W, "weth decreased by exactly input");
        _eq(stockA.balanceOf(address(vault)), DIST, "distribution retained in vault");
        _eq(stockA.balanceOf(RESERVE), RESV, "reserve delivered");
        _eq(vault.totalWethSpent(), W, "total weth spent");
        _eq(vault.totalStockAcquired(address(stockA)), OUT, "total stock acquired");
        _eq(vault.distributionAllocated(address(stockA)), DIST, "distribution allocated");
        _eq(vault.reserveAllocated(address(stockA)), RESV, "reserve allocated");
        _eq(vault.distributionReleased(address(stockA)), 0, "nothing released yet");
        _eq(vault.distributionReleasable(address(stockA)), DIST, "releasable == allocation");
        _eq(vault.unsolicitedStockBalance(address(stockA)), 0, "no donation");
        _eq(DIST + RESV, OUT, "split conserves");
    }

    function testAcquisitionEventsExact() public {
        vm.expectEmit(true, true, true, true);
        emit StockAcquired(EXECUTOR, address(stockA), W, OUT, DIST, RESV, address(adapter));
        vm.expectEmit(true, true, true, true);
        emit ReserveAllocated(address(stockA), RESERVE, RESV);
        _acquire(address(stockA), W, 9_000e18);
    }

    function testMultipleAcquisitionsAccumulate() public {
        _acquire(address(stockA), W, 1);
        _acquire(address(stockA), W, 1);
        _eq(vault.totalStockAcquired(address(stockA)), 2 * OUT, "acquired accumulates");
        _eq(vault.distributionAllocated(address(stockA)), 2 * DIST, "distribution accumulates");
        _eq(vault.reserveAllocated(address(stockA)), 2 * RESV, "reserve accumulates");
        _eq(stockA.balanceOf(RESERVE), 2 * RESV, "reserve received twice");
        _eq(vault.totalWethSpent(), 2 * W, "weth spent accumulates");
    }

    function testUnauthorizedExecutorReverts() public {
        vm.prank(ATTACKER);
        vm.expectRevert(StockAcquisitionVault.NotAuthorizedExecutor.selector);
        vault.executeAcquisition(address(stockA), W, 1, DEADLINE, "");
    }

    function testUnapprovedStockReverts() public {
        vm.prank(EXECUTOR);
        vm.expectRevert(
            abi.encodeWithSelector(StockAcquisitionVault.StockTokenNotApproved.selector, ATTACKER)
        );
        vault.executeAcquisition(ATTACKER, W, 1, DEADLINE, "");
    }

    function testZeroWethInputReverts() public {
        vm.prank(EXECUTOR);
        vm.expectRevert(StockAcquisitionVault.ZeroAmount.selector);
        vault.executeAcquisition(address(stockA), 0, 1, DEADLINE, "");
    }

    function testZeroMinimumReverts() public {
        vm.prank(EXECUTOR);
        vm.expectRevert(StockAcquisitionVault.ZeroMinimumOutput.selector);
        vault.executeAcquisition(address(stockA), W, 0, DEADLINE, "");
    }

    function testExpiredDeadlineReverts() public {
        vm.warp(1000);
        vm.prank(EXECUTOR);
        vm.expectRevert(StockAcquisitionVault.ExpiredDeadline.selector);
        vault.executeAcquisition(address(stockA), W, 1, 999, "");
    }

    function testExactDeadlineSucceeds() public {
        vm.warp(1000);
        vm.prank(EXECUTOR);
        vault.executeAcquisition(address(stockA), W, 1, 1000, "");
        _eq(stockA.balanceOf(address(vault)), DIST, "succeeded at exact deadline");
    }

    function testInsufficientWethCustodyReverts() public {
        uint256 have = weth.balanceOf(address(vault));
        vm.prank(EXECUTOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                StockAcquisitionVault.InsufficientWethCustody.selector, have + 1, have
            )
        );
        vault.executeAcquisition(address(stockA), have + 1, 1, DEADLINE, "");
    }

    function testMinimumEnforcedByVault() public {
        // Honest adapter ignores min and delivers OUT == W; the vault's own minimum must fire.
        vm.prank(EXECUTOR);
        vm.expectRevert(
            abi.encodeWithSelector(StockAcquisitionVault.MinimumStockOutNotMet.selector, W + 1, OUT)
        );
        vault.executeAcquisition(address(stockA), W, W + 1, DEADLINE, "");
    }

    function testApprovalClearedAfterAcquisition() public {
        _acquire(address(stockA), W, 1);
        _eq(weth.allowance(address(vault), address(adapter)), 0, "approval cleared");
    }

    function testNativeEthRejected() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(vault).call{value: 1}("");
        _false(ok, "native transfer path reverts");
        _eq(address(vault).balance, 0, "vault holds no ETH");
    }
}
