// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {RouterBase} from "./RouterBase.t.sol";
import {BPSTradeRouter} from "../src/BPSTradeRouter.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";
import {MockSwapAdapter} from "./mocks/MockSwapAdapter.sol";
import {HostileSwapAdapter} from "./mocks/HostileSwapAdapter.sol";

contract RouterBuyTest is RouterBase {
    uint256 internal constant G = 1000e18;
    uint256 internal constant STOCK_B = 20e18; // 2%
    uint256 internal constant BURN_B = 10e18; // 1%
    uint256 internal constant USER_B = 970e18; // 97%
    uint256 internal constant USER_BPS = 970_000e18; // USER_B * RATE
    uint256 internal constant BURN_BPS = 10_000e18; // BURN_B * RATE

    function setUp() public {
        _deployAll();
    }

    // Clean divisible buy: exact arithmetic, exact delivery, true burn.
    function testBuyCleanArithmetic() public {
        _giveWethApprove(ALICE, G);
        uint256 supplyBefore = bps.totalSupply();
        vm.prank(ALICE);
        (uint256 userOut, uint256 burned) = router.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);

        _eq(userOut, USER_BPS, "user BPS out");
        _eq(burned, BURN_BPS, "burned");
        _eq(weth.balanceOf(STOCK), STOCK_B, "stock budget delivered");
        _eq(bps.balanceOf(ALICE), USER_BPS, "alice received BPS");
        _eq(supplyBefore - bps.totalSupply(), BURN_BPS, "totalSupply reduced by burn");
        _eq(weth.balanceOf(address(router)), 0, "no WETH residue");
        _eq(bps.balanceOf(address(router)), 0, "no BPS residue");
        _eq(router.totalGrossWethInFromBuys(), G, "cumulative gross weth");
        _eq(router.totalStockBudgetDelivered(), STOCK_B, "cumulative stock");
        _eq(router.totalBurnBudgetConsumed(), BURN_B, "cumulative burn budget");
        _eq(router.totalBpsBurned(), BURN_BPS, "cumulative bps burned");
        _eq(router.tradeCount(), 1, "trade count");
    }

    // Rounding: stock/burn floored, remainder to the user.
    function testBuyRoundingRemainderToUser() public {
        uint256 g = 10_001;
        _giveWethApprove(ALICE, g);
        vm.prank(ALICE);
        (uint256 userOut, uint256 burned) = router.buyExactWethForBps(g, 0, 0, ALICE, DEADLINE);
        // stock=floor(10001*200/10000)=200, burn=floor(10001*100/10000)=100, user=9701 (remainder).
        _eq(weth.balanceOf(STOCK), 200, "stock 200");
        _eq(burned, 100 * RATE, "burn 100*rate");
        _eq(userOut, 9701 * RATE, "user gets remainder");
        _eq(200 + 100 + 9701, g, "invariant stock+burn+user==gross");
    }

    function testZeroBuyInputFails() public {
        vm.prank(ALICE);
        vm.expectRevert(BPSTradeRouter.ZeroInput.selector);
        router.buyExactWethForBps(0, 0, 0, ALICE, DEADLINE);
    }

    function testZeroRecipientFails() public {
        _giveWethApprove(ALICE, G);
        vm.prank(ALICE);
        vm.expectRevert(BPSTradeRouter.InvalidRecipient.selector);
        router.buyExactWethForBps(G, 0, 0, address(0), DEADLINE);
    }

    function testExpiredDeadlineFails() public {
        vm.warp(1000);
        _giveWethApprove(ALICE, G);
        vm.prank(ALICE);
        vm.expectRevert(BPSTradeRouter.ExpiredDeadline.selector);
        router.buyExactWethForBps(G, 0, 0, ALICE, 999);
    }

    function testExactDeadlineSucceeds() public {
        vm.warp(1000);
        _giveWethApprove(ALICE, G);
        vm.prank(ALICE);
        router.buyExactWethForBps(G, 0, 0, ALICE, 1000); // deadline == now is valid
        _eq(bps.balanceOf(ALICE), USER_BPS, "succeeded at exact deadline");
    }

    function testInsufficientBalanceFailsAtomically() public {
        vm.prank(ALICE); // approve without any WETH balance
        weth.approve(address(router), G);
        vm.prank(ALICE);
        vm.expectRevert();
        router.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
        _eq(router.tradeCount(), 0, "no trade recorded");
    }

    function testInsufficientAllowanceFailsAtomically() public {
        weth.mint(ALICE, G); // balance but no approval
        vm.prank(ALICE);
        vm.expectRevert();
        router.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
        _eq(router.tradeCount(), 0, "no trade recorded");
    }

    function testShortFeeWethFundingFailsAtomically() public {
        MockFeeOnTransferERC20 feeWeth = new MockFeeOnTransferERC20("Fee WETH", "fWETH", 100); // 1%
        MockSwapAdapter a = new MockSwapAdapter(address(bps), address(feeWeth), RATE, DIV);
        BPSTradeRouter r =
            new BPSTradeRouter(OWNER, address(bps), address(feeWeth), address(a), STOCK);
        feeWeth.mint(ALICE, G);
        vm.prank(ALICE);
        feeWeth.approve(address(r), G);
        vm.prank(ALICE);
        vm.expectRevert(); // FundingMismatch: received < declared
        r.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
        _eq(r.tradeCount(), 0, "no trade recorded");
    }

    // The router independently enforces minimums against actual received amounts. Proven via the
    // hostile adapter in HONEST mode, which ignores the passed minimum, so the router's own check
    // (not the adapter's) is the one that fires.
    function testUserMinBpsEnforced() public {
        (, BPSTradeRouter r) = _deployHostileRouter(); // default mode HONEST, ignores min
        weth.mint(ALICE, G);
        vm.prank(ALICE);
        weth.approve(address(r), G);
        vm.prank(ALICE);
        vm.expectRevert(BPSTradeRouter.MinimumOutputNotMet.selector);
        r.buyExactWethForBps(G, USER_BPS + 1, 0, ALICE, DEADLINE);
    }

    function testBurnMinEnforced() public {
        (, BPSTradeRouter r) = _deployHostileRouter();
        weth.mint(ALICE, G);
        vm.prank(ALICE);
        weth.approve(address(r), G);
        vm.prank(ALICE);
        vm.expectRevert(BPSTradeRouter.MinimumOutputNotMet.selector);
        r.buyExactWethForBps(G, 0, BURN_BPS + 1, ALICE, DEADLINE);
    }

    function testPreexistingBpsDonationNotBurnedOrCounted() public {
        _donateBpsTo(address(router), 5e18); // unsolicited BPS donation
        _giveWethApprove(ALICE, G);
        uint256 supplyBefore = bps.totalSupply();
        vm.prank(ALICE);
        (, uint256 burned) = router.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
        _eq(burned, BURN_BPS, "burned only the repurchase amount");
        _eq(supplyBefore - bps.totalSupply(), BURN_BPS, "supply drop excludes donation");
        _eq(bps.balanceOf(address(router)), 5e18, "donation untouched");
    }

    function testPreexistingWethDonationNotAllocated() public {
        weth.mint(address(router), 7e18); // unsolicited WETH donation
        _giveWethApprove(ALICE, G);
        vm.prank(ALICE);
        router.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
        _eq(weth.balanceOf(STOCK), STOCK_B, "stock budget from trade only");
        _eq(weth.balanceOf(address(router)), 7e18, "donation untouched");
        _eq(router.totalGrossWethInFromBuys(), G, "donation not counted as input");
    }

    function testBuyEventExact() public {
        _giveWethApprove(ALICE, G);
        vm.expectEmit(true, true, true, true);
        emit OfficialBuy(
            1, ALICE, ALICE, G, STOCK_B, BURN_B, USER_B, USER_BPS, BURN_BPS, address(adapter), STOCK
        );
        vm.prank(ALICE);
        router.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
    }

    function testZeroBurnBudgetSkipsSwap() public {
        uint256 g = 99; // stock=floor(99*200/10000)=1, burn=floor(99*100/10000)=0, user=98
        _giveWethApprove(ALICE, g);
        uint256 supplyBefore = bps.totalSupply();
        vm.prank(ALICE);
        (uint256 userOut, uint256 burned) = router.buyExactWethForBps(g, 0, 0, ALICE, DEADLINE);
        _eq(burned, 0, "no burn for zero budget");
        _eq(supplyBefore, bps.totalSupply(), "supply unchanged when burn budget is zero");
        _eq(weth.balanceOf(STOCK), 1, "stock 1");
        _eq(userOut, 98 * RATE, "user output");
    }

    function testZeroBurnBudgetNonzeroMinFails() public {
        uint256 g = 99; // burn budget is zero
        _giveWethApprove(ALICE, g);
        vm.prank(ALICE);
        vm.expectRevert(BPSTradeRouter.InvalidZeroBudgetMinimum.selector);
        router.buyExactWethForBps(g, 0, 1, ALICE, DEADLINE);
    }

    // --- Hostile adapter: any misbehavior reverts the complete buy ------------------------------

    function _hostileBuySetup() internal returns (HostileSwapAdapter h, BPSTradeRouter r) {
        (h, r) = _deployHostileRouter();
        weth.mint(ALICE, G);
        vm.prank(ALICE);
        weth.approve(address(r), G);
    }

    function testBuyRevertsOnFailingSwap() public {
        (HostileSwapAdapter h, BPSTradeRouter r) = _hostileBuySetup();
        h.setMode(HostileSwapAdapter.Mode.FAIL);
        vm.prank(ALICE);
        vm.expectRevert();
        r.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
        _eq(r.tradeCount(), 0, "no trade recorded");
    }

    function testLyingAdapterRevertsBuy() public {
        (HostileSwapAdapter h, BPSTradeRouter r) = _hostileBuySetup();
        h.setMode(HostileSwapAdapter.Mode.LIE_OVER);
        vm.prank(ALICE);
        vm.expectRevert(); // AdapterOutputMismatch
        r.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
    }

    function testShortSpendingAdapterRevertsBuy() public {
        (HostileSwapAdapter h, BPSTradeRouter r) = _hostileBuySetup();
        h.setMode(HostileSwapAdapter.Mode.SHORT_SPEND);
        vm.prank(ALICE);
        vm.expectRevert(); // AdapterSpendMismatch
        r.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
    }
}
