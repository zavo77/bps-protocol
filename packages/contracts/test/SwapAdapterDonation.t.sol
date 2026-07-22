// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SwapAdapterBase} from "./SwapAdapterBase.t.sol";

/// @notice Pre-existing token balances at the adapter (donations) and at the recipient must not break
///         the adapter's residual checks or its recipient balance-delta accounting.
contract SwapAdapterDonationTest is SwapAdapterBase {
    function setUp() public {
        _deployUnit();
    }

    function testAdapterTokenDonationsTolerated() public {
        uint256 dBps = 123e18;
        uint256 dWeth = 45e18;
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(address(adapter), dBps);
        weth.mint(address(adapter), dWeth);

        uint256 amountIn = 1e18;
        uint256 out = amountIn * RATE;
        _routerHasWethApprove(address(adapter), amountIn);

        uint256 got =
            adapter.swapExactInput(address(weth), address(bps), amountIn, out, RECIP, DEADLINE);

        _eq(got, out, "swap succeeds despite donations");
        _eq(bps.balanceOf(address(adapter)), dBps, "BPS donation untouched (baseline compared)");
        _eq(weth.balanceOf(address(adapter)), dWeth, "WETH donation untouched (baseline compared)");
        _eq(bps.balanceOf(RECIP), out, "recipient received exactly the output");
    }

    function testRecipientPreexistingBalanceDoesNotBreakDelta() public {
        uint256 prior = 500e18;
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(RECIP, prior); // recipient already holds BPS

        uint256 amountIn = 1e18;
        uint256 out = amountIn * RATE;
        _routerHasWethApprove(address(adapter), amountIn);

        uint256 got =
            adapter.swapExactInput(address(weth), address(bps), amountIn, out, RECIP, DEADLINE);

        _eq(got, out, "returns the delta, not the absolute balance");
        _eq(bps.balanceOf(RECIP), prior + out, "recipient balance = prior + output");
    }
}
