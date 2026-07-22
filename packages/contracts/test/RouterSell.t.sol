// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {RouterBase} from "./RouterBase.t.sol";
import {BPSTradeRouter} from "../src/BPSTradeRouter.sol";
import {HostileSwapAdapter} from "./mocks/HostileSwapAdapter.sol";

contract RouterSellTest is RouterBase {
    uint256 internal constant Q = 10_000_000e18; // gross BPS input
    uint256 internal constant W = 10_000e18; // gross WETH out (Q / DIV)
    uint256 internal constant STOCK_B = 200e18; // 2%
    uint256 internal constant BURN_B = 200e18; // 2%
    uint256 internal constant USER_W = 9600e18; // 96%
    uint256 internal constant BURN_BPS = 200_000e18; // BURN_B * RATE

    function setUp() public {
        _deployAll();
    }

    function testSellCleanArithmetic() public {
        _giveBpsApprove(ALICE, Q);
        uint256 supplyBefore = bps.totalSupply();
        vm.prank(ALICE);
        (uint256 gross, uint256 userW, uint256 burned) =
            router.sellExactBpsForWeth(Q, 0, 0, 0, ALICE, DEADLINE);

        _eq(gross, W, "gross WETH out");
        _eq(userW, USER_W, "user WETH out");
        _eq(burned, BURN_BPS, "burned");
        _eq(weth.balanceOf(STOCK), STOCK_B, "stock budget delivered");
        _eq(weth.balanceOf(ALICE), USER_W, "alice received WETH");
        _eq(supplyBefore - bps.totalSupply(), BURN_BPS, "totalSupply reduced by burn only");
        _eq(bps.balanceOf(ALICE), 0, "all input BPS swapped");
        _eq(weth.balanceOf(address(router)), 0, "no WETH residue");
        _eq(bps.balanceOf(address(router)), 0, "no BPS residue");
        _eq(router.totalGrossBpsInFromSells(), Q, "cumulative gross bps");
        _eq(router.totalStockBudgetDelivered(), STOCK_B, "cumulative stock");
        _eq(router.totalBpsBurned(), BURN_BPS, "cumulative bps burned");
        _eq(router.tradeCount(), 1, "trade count");
    }

    // Rounding: allocation floored from actual WETH, remainder to the user.
    function testSellRoundingRemainderToUser() public {
        uint256 q = W * DIV + DIV; // -> actual WETH out = W + 1 (not divisible by 10000)
        _giveBpsApprove(ALICE, q);
        vm.prank(ALICE);
        (uint256 gross, uint256 userW,) = router.sellExactBpsForWeth(q, 0, 0, 0, ALICE, DEADLINE);
        _eq(gross, W + 1, "gross W+1");
        // stock=floor((W+1)*200/10000)=200e18, burn=200e18, user=(W+1)-400e18 gets remainder.
        _eq(weth.balanceOf(STOCK), STOCK_B, "stock floored");
        _eq(userW, (W + 1) - STOCK_B - BURN_B, "user gets remainder");
        _eq(STOCK_B + BURN_B + userW, gross, "invariant stock+burn+user==gross");
    }

    function testZeroSellInputFails() public {
        vm.prank(ALICE);
        vm.expectRevert(BPSTradeRouter.ZeroInput.selector);
        router.sellExactBpsForWeth(0, 0, 0, 0, ALICE, DEADLINE);
    }

    function testZeroRecipientFails() public {
        _giveBpsApprove(ALICE, Q);
        vm.prank(ALICE);
        vm.expectRevert(BPSTradeRouter.InvalidRecipient.selector);
        router.sellExactBpsForWeth(Q, 0, 0, 0, address(0), DEADLINE);
    }

    function testExpiredDeadlineFails() public {
        vm.warp(1000);
        _giveBpsApprove(ALICE, Q);
        vm.prank(ALICE);
        vm.expectRevert(BPSTradeRouter.ExpiredDeadline.selector);
        router.sellExactBpsForWeth(Q, 0, 0, 0, ALICE, 999);
    }

    function testExactDeadlineSucceeds() public {
        vm.warp(1000);
        _giveBpsApprove(ALICE, Q);
        vm.prank(ALICE);
        router.sellExactBpsForWeth(Q, 0, 0, 0, ALICE, 1000);
        _eq(weth.balanceOf(ALICE), USER_W, "succeeded at exact deadline");
    }

    function testInsufficientBpsBalanceFailsAtomically() public {
        vm.prank(ALICE);
        bps.approve(address(router), Q); // approve without balance
        vm.prank(ALICE);
        vm.expectRevert();
        router.sellExactBpsForWeth(Q, 0, 0, 0, ALICE, DEADLINE);
        _eq(router.tradeCount(), 0, "no trade recorded");
    }

    function testInsufficientBpsAllowanceFailsAtomically() public {
        _donateBpsTo(ALICE, Q); // balance but no approval
        vm.prank(ALICE);
        vm.expectRevert();
        router.sellExactBpsForWeth(Q, 0, 0, 0, ALICE, DEADLINE);
        _eq(router.tradeCount(), 0, "no trade recorded");
    }

    // Router independently enforces the user-WETH minimum (a router-only check).
    function testUserWethMinEnforced() public {
        _giveBpsApprove(ALICE, Q);
        vm.prank(ALICE);
        vm.expectRevert(BPSTradeRouter.MinimumOutputNotMet.selector);
        router.sellExactBpsForWeth(Q, 0, USER_W + 1, 0, ALICE, DEADLINE);
    }

    // Router independently enforces gross-WETH and burn minimums (proven via min-ignoring adapter).
    function testGrossWethMinEnforced() public {
        (, BPSTradeRouter r) = _deployHostileRouter(); // HONEST, ignores passed min
        _bpsApproveTo(r, Q);
        vm.prank(ALICE);
        vm.expectRevert(BPSTradeRouter.MinimumOutputNotMet.selector);
        r.sellExactBpsForWeth(Q, W + 1, 0, 0, ALICE, DEADLINE);
    }

    function testBurnMinEnforced() public {
        (, BPSTradeRouter r) = _deployHostileRouter();
        _bpsApproveTo(r, Q);
        vm.prank(ALICE);
        vm.expectRevert(BPSTradeRouter.MinimumOutputNotMet.selector);
        r.sellExactBpsForWeth(Q, 0, 0, BURN_BPS + 1, ALICE, DEADLINE);
    }

    function testSellersOriginalBpsNotLabeledBurned() public {
        _giveBpsApprove(ALICE, Q);
        uint256 supplyBefore = bps.totalSupply();
        vm.prank(ALICE);
        (,, uint256 burned) = router.sellExactBpsForWeth(Q, 0, 0, 0, ALICE, DEADLINE);
        // Only the WETH-funded buyback is burned, not the seller's input.
        _eq(burned, BURN_BPS, "burn is the buyback amount");
        _true(burned < Q, "burn is not the seller input");
        _eq(supplyBefore - bps.totalSupply(), BURN_BPS, "supply drop is the buyback only");
    }

    function testDonationsNotInSellAccounting() public {
        _donateBpsTo(address(router), 3e18);
        weth.mint(address(router), 4e18);
        _giveBpsApprove(ALICE, Q);
        vm.prank(ALICE);
        router.sellExactBpsForWeth(Q, 0, 0, 0, ALICE, DEADLINE);
        _eq(bps.balanceOf(address(router)), 3e18, "BPS donation untouched");
        _eq(weth.balanceOf(address(router)), 4e18, "WETH donation untouched");
        _eq(router.totalStockBudgetDelivered(), STOCK_B, "accounting from trade only");
    }

    function testSellEventExact() public {
        _giveBpsApprove(ALICE, Q);
        vm.expectEmit(true, true, true, true);
        emit OfficialSell(
            1, ALICE, ALICE, Q, W, STOCK_B, BURN_B, USER_W, BURN_BPS, address(adapter), STOCK
        );
        vm.prank(ALICE);
        router.sellExactBpsForWeth(Q, 0, 0, 0, ALICE, DEADLINE);
    }

    function testZeroBudgetSell() public {
        uint256 q = 49 * DIV; // actual WETH out = 49 -> stock=0, burn=0, user=49
        _giveBpsApprove(ALICE, q);
        uint256 supplyBefore = bps.totalSupply();
        vm.prank(ALICE);
        (uint256 gross, uint256 userW, uint256 burned) =
            router.sellExactBpsForWeth(q, 0, 0, 0, ALICE, DEADLINE);
        _eq(gross, 49, "gross 49");
        _eq(userW, 49, "user gets all (zero budgets)");
        _eq(burned, 0, "no burn for zero budget");
        _eq(weth.balanceOf(STOCK), 0, "no stock delivery");
        _eq(supplyBefore, bps.totalSupply(), "supply unchanged");
    }

    function testZeroBurnBudgetNonzeroMinFails() public {
        uint256 q = 49 * DIV; // burn budget is zero
        _giveBpsApprove(ALICE, q);
        vm.prank(ALICE);
        vm.expectRevert(BPSTradeRouter.InvalidZeroBudgetMinimum.selector);
        router.sellExactBpsForWeth(q, 0, 0, 1, ALICE, DEADLINE);
    }

    // --- Hostile adapter: any misbehavior reverts the complete sell ----------------------------

    function _bpsApproveTo(BPSTradeRouter r, uint256 amount) internal {
        _donateBpsTo(ALICE, amount);
        vm.prank(ALICE);
        bps.approve(address(r), amount);
    }

    function testSellRevertsOnFailingSwap() public {
        (HostileSwapAdapter h, BPSTradeRouter r) = _deployHostileRouter();
        _bpsApproveTo(r, Q);
        h.setMode(HostileSwapAdapter.Mode.FAIL);
        vm.prank(ALICE);
        vm.expectRevert();
        r.sellExactBpsForWeth(Q, 0, 0, 0, ALICE, DEADLINE);
        _eq(r.tradeCount(), 0, "no trade recorded");
    }

    function testLyingAdapterRevertsSell() public {
        (HostileSwapAdapter h, BPSTradeRouter r) = _deployHostileRouter();
        _bpsApproveTo(r, Q);
        h.setMode(HostileSwapAdapter.Mode.LIE_OVER);
        vm.prank(ALICE);
        vm.expectRevert();
        r.sellExactBpsForWeth(Q, 0, 0, 0, ALICE, DEADLINE);
    }

    function testShortSpendingAdapterRevertsSell() public {
        (HostileSwapAdapter h, BPSTradeRouter r) = _deployHostileRouter();
        _bpsApproveTo(r, Q);
        h.setMode(HostileSwapAdapter.Mode.SHORT_SPEND);
        vm.prank(ALICE);
        vm.expectRevert();
        r.sellExactBpsForWeth(Q, 0, 0, 0, ALICE, DEADLINE);
    }
}
