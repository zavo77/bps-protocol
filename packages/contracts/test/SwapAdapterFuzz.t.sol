// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SwapAdapterBase} from "./SwapAdapterBase.t.sol";

/// @notice Property checks: for arbitrary bounded inputs in both directions, the adapter delivers the
///         exact venue output to the recipient, returns the observed delta, keeps no residual custody,
///         and clears its venue approval — even with pre-existing adapter donations.
contract SwapAdapterFuzzTest is SwapAdapterBase {
    function setUp() public {
        _deployUnit();
        // Pre-existing donations at the adapter must never affect the outcome.
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(address(adapter), 7e18);
        weth.mint(address(adapter), 9e18);
    }

    function testFuzzWethToBps(uint256 amountIn) public {
        amountIn = bound(amountIn, 1, 100_000e18);
        uint256 out = amountIn * RATE;
        _routerHasWethApprove(address(adapter), amountIn);

        uint256 got =
            adapter.swapExactInput(address(weth), address(bps), amountIn, out, RECIP, DEADLINE);

        _eq(got, out, "observed output");
        _eq(bps.balanceOf(RECIP), out, "recipient received output");
        _eq(bps.balanceOf(address(adapter)), 7e18, "BPS donation baseline unchanged");
        _eq(weth.balanceOf(address(adapter)), 9e18, "WETH donation baseline unchanged");
        _eq(weth.allowance(address(adapter), address(venue)), 0, "approval cleared");
    }

    function testFuzzBpsToWeth(uint256 amountIn) public {
        amountIn = bound(amountIn, DIV, 100_000_000e18);
        uint256 out = amountIn / DIV;
        _routerHasBpsApprove(address(adapter), amountIn);

        uint256 got =
            adapter.swapExactInput(address(bps), address(weth), amountIn, out, RECIP, DEADLINE);

        _eq(got, out, "observed output");
        _eq(weth.balanceOf(RECIP), out, "recipient received WETH output");
        _eq(bps.balanceOf(address(adapter)), 7e18, "BPS donation baseline unchanged");
        _eq(weth.balanceOf(address(adapter)), 9e18, "WETH donation baseline unchanged");
        _eq(bps.allowance(address(adapter), address(venue)), 0, "approval cleared");
    }

    // Minimal bound helper (no forge-std): map x into [min, max] inclusive.
    function bound(uint256 x, uint256 min, uint256 max) internal pure returns (uint256) {
        require(max >= min, "bad bound");
        uint256 span = max - min + 1;
        return min + (x % span);
    }
}
