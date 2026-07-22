// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SwapAdapterBase} from "./SwapAdapterBase.t.sol";
import {UniswapV3BPSSwapAdapter} from "../src/adapters/UniswapV3BPSSwapAdapter.sol";

contract SwapAdapterSecurityTest is SwapAdapterBase {
    function setUp() public {
        _deployUnit();
    }

    function testUnauthorizedCallerReverts() public {
        vm.prank(ATTACKER);
        vm.expectRevert(UniswapV3BPSSwapAdapter.NotBpsTradeRouter.selector);
        adapter.swapExactInput(address(weth), address(bps), 1e18, 0, RECIP, DEADLINE);
    }

    function testForeignTokenInReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                UniswapV3BPSSwapAdapter.UnsupportedPair.selector, ATTACKER, address(bps)
            )
        );
        adapter.swapExactInput(ATTACKER, address(bps), 1e18, 0, RECIP, DEADLINE);
    }

    function testForeignTokenOutReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                UniswapV3BPSSwapAdapter.UnsupportedPair.selector, address(weth), ATTACKER
            )
        );
        adapter.swapExactInput(address(weth), ATTACKER, 1e18, 0, RECIP, DEADLINE);
    }

    function testSameTokenReverts() public {
        // tokenIn == tokenOut can never be the BPS/WETH pair, so UnsupportedPair guards it.
        vm.expectRevert(
            abi.encodeWithSelector(
                UniswapV3BPSSwapAdapter.UnsupportedPair.selector, address(bps), address(bps)
            )
        );
        adapter.swapExactInput(address(bps), address(bps), 1e18, 0, RECIP, DEADLINE);
    }

    function testZeroAmountReverts() public {
        vm.expectRevert(UniswapV3BPSSwapAdapter.ZeroAmountIn.selector);
        adapter.swapExactInput(address(weth), address(bps), 0, 0, RECIP, DEADLINE);
    }

    function testExpiredDeadlineReverts() public {
        vm.warp(1000);
        vm.expectRevert(UniswapV3BPSSwapAdapter.ExpiredDeadline.selector);
        adapter.swapExactInput(address(weth), address(bps), 1e18, 0, RECIP, 999);
    }

    function _expectBadRecipient(address recipient) internal {
        vm.expectRevert(
            abi.encodeWithSelector(UniswapV3BPSSwapAdapter.InvalidRecipient.selector, recipient)
        );
        adapter.swapExactInput(address(weth), address(bps), 1e18, 0, recipient, DEADLINE);
    }

    function testRecipientZeroRejected() public {
        _expectBadRecipient(address(0));
    }

    function testRecipientAddressOneRejected() public {
        _expectBadRecipient(address(1)); // SwapRouter02 msg.sender sentinel
    }

    function testRecipientAddressTwoRejected() public {
        _expectBadRecipient(address(2)); // SwapRouter02 router-self sentinel
    }

    function testRecipientAdapterRejected() public {
        _expectBadRecipient(address(adapter));
    }

    function testRecipientVenueRejected() public {
        _expectBadRecipient(address(venue));
    }

    function testRecipientBpsRejected() public {
        _expectBadRecipient(address(bps));
    }

    function testRecipientWethRejected() public {
        _expectBadRecipient(address(weth));
    }

    // The immutable BPSTradeRouter (here, this contract) IS a valid recipient — required by the
    // frozen buyback and sell legs. (A full swap to it is covered in SwapAdapterSwapTest.)
    function testRouterRecipientAllowed() public {
        _routerHasWethApprove(address(adapter), 1e18);
        uint256 got =
            adapter.swapExactInput(address(weth), address(bps), 1e18, 0, address(this), DEADLINE);
        _eq(got, 1e18 * RATE, "router is a valid recipient");
    }

    function testDirectNativeEthRejected() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(adapter).call{value: 1}("");
        _false(ok, "native transfer reverts");
    }
}
