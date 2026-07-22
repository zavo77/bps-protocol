// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SwapAdapterBase} from "./SwapAdapterBase.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SwapAdapterSwapTest is SwapAdapterBase {
    function setUp() public {
        _deployUnit();
    }

    // WETH -> BPS delivered to an external user recipient (the frozen buy user leg).
    function testWethToBpsToUser() public {
        uint256 amountIn = 1e18;
        uint256 out = amountIn * RATE; // 1000e18
        _routerHasWethApprove(address(adapter), amountIn);
        uint256 routerWethBefore = weth.balanceOf(address(this));

        uint256 got =
            adapter.swapExactInput(address(weth), address(bps), amountIn, out, RECIP, DEADLINE);

        _eq(got, out, "returns observed output");
        _eq(bps.balanceOf(RECIP), out, "user received BPS directly");
        _eq(weth.balanceOf(address(this)) - 0, routerWethBefore - amountIn, "exact input pulled");
        _eq(bps.balanceOf(address(adapter)), 0, "no BPS residual");
        _eq(weth.balanceOf(address(adapter)), 0, "no WETH residual");
        _eq(weth.allowance(address(adapter), address(venue)), 0, "adapter->venue approval cleared");
        // The adapter passed exactly the frozen params to the venue.
        _eq(venue.lastRecipient(), RECIP, "venue recipient == requested");
        _true(venue.lastFee() == TEST_FEE, "immutable fee used");
        _true(venue.lastSqrtPriceLimitX96() == 0, "sqrtPriceLimitX96 == 0");
        _eq(venue.lastAmountIn(), amountIn, "exact amountIn to venue");
        _eq(venue.lastAmountOutMinimum(), out, "exact minimum to venue");
    }

    // WETH -> BPS delivered to the router itself (the frozen buyback-and-burn leg shape).
    function testWethToBpsToRouter() public {
        uint256 amountIn = 2e18;
        uint256 out = amountIn * RATE;
        _routerHasWethApprove(address(adapter), amountIn);
        uint256 selfBpsBefore = bps.balanceOf(address(this));

        uint256 got = adapter.swapExactInput(
            address(weth), address(bps), amountIn, out, address(this), DEADLINE
        );

        _eq(got, out, "returns observed output");
        _eq(bps.balanceOf(address(this)) - selfBpsBefore, out, "router received BPS");
        _eq(bps.balanceOf(address(adapter)), 0, "no BPS residual");
        _eq(weth.balanceOf(address(adapter)), 0, "no WETH residual");
        _eq(weth.allowance(address(adapter), address(venue)), 0, "approval cleared");
    }

    // BPS -> WETH delivered to the router itself (the frozen sell leg shape).
    function testBpsToWethToRouter() public {
        uint256 amountIn = 1000e18;
        uint256 out = amountIn / DIV; // 1e18
        _routerHasBpsApprove(address(adapter), amountIn);
        uint256 selfWethBefore = weth.balanceOf(address(this));
        uint256 selfBpsBefore = bps.balanceOf(address(this));

        uint256 got = adapter.swapExactInput(
            address(bps), address(weth), amountIn, out, address(this), DEADLINE
        );

        _eq(got, out, "returns observed output");
        _eq(weth.balanceOf(address(this)) - selfWethBefore, out, "router received WETH");
        _eq(selfBpsBefore - bps.balanceOf(address(this)), amountIn, "exact BPS input pulled");
        _eq(bps.balanceOf(address(adapter)), 0, "no BPS residual");
        _eq(weth.balanceOf(address(adapter)), 0, "no WETH residual");
        _eq(weth.allowance(address(adapter), address(venue)), 0, "weth approval cleared");
        _eq(bps.allowance(address(adapter), address(venue)), 0, "bps approval cleared");
        _eq(venue.lastRecipient(), address(this), "venue recipient == router");
    }

    // The minimum is forwarded to the venue: a minimum above the achievable output reverts at the
    // venue (proving passthrough), and the whole swap rolls back.
    function testMinimumForwardedToVenue() public {
        uint256 amountIn = 1e18;
        uint256 out = amountIn * RATE;
        _routerHasWethApprove(address(adapter), amountIn);
        vm.expectRevert(); // MockSwapRouter02.TooLittleReceived (out < minimum)
        adapter.swapExactInput(address(weth), address(bps), amountIn, out + 1, RECIP, DEADLINE);
        _eq(bps.balanceOf(RECIP), 0, "no delivery on venue min revert");
    }

    function testDeadlineEqualToNowSucceeds() public {
        vm.warp(1000);
        uint256 amountIn = 1e18;
        uint256 out = amountIn * RATE;
        _routerHasWethApprove(address(adapter), amountIn);
        uint256 got =
            adapter.swapExactInput(address(weth), address(bps), amountIn, out, RECIP, 1000);
        _eq(got, out, "deadline == now is valid");
    }
}
