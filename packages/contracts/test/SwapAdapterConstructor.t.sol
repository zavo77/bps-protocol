// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SwapAdapterBase} from "./SwapAdapterBase.t.sol";
import {UniswapV3BPSSwapAdapter} from "../src/adapters/UniswapV3BPSSwapAdapter.sol";

contract SwapAdapterConstructorTest is SwapAdapterBase {
    address internal constant NOCODE = address(0xDEAD); // an address with no code

    function setUp() public {
        _deployUnit();
    }

    function _new(address router_, address bps_, address weth_, address venue_, uint24 fee_)
        internal
        returns (UniswapV3BPSSwapAdapter)
    {
        return new UniswapV3BPSSwapAdapter(router_, bps_, weth_, venue_, fee_);
    }

    function testZeroRouterFails() public {
        vm.expectRevert(UniswapV3BPSSwapAdapter.ZeroAddress.selector);
        _new(address(0), address(bps), address(weth), address(venue), TEST_FEE);
    }

    function testZeroBpsFails() public {
        vm.expectRevert(UniswapV3BPSSwapAdapter.ZeroAddress.selector);
        _new(address(this), address(0), address(weth), address(venue), TEST_FEE);
    }

    function testZeroWethFails() public {
        vm.expectRevert(UniswapV3BPSSwapAdapter.ZeroAddress.selector);
        _new(address(this), address(bps), address(0), address(venue), TEST_FEE);
    }

    function testZeroVenueFails() public {
        vm.expectRevert(UniswapV3BPSSwapAdapter.ZeroAddress.selector);
        _new(address(this), address(bps), address(weth), address(0), TEST_FEE);
    }

    function testBpsEqualsWethFails() public {
        vm.expectRevert(UniswapV3BPSSwapAdapter.InvalidTokenPair.selector);
        _new(address(this), address(bps), address(bps), address(venue), TEST_FEE);
    }

    function testVenueAliasesBpsFails() public {
        vm.expectRevert(UniswapV3BPSSwapAdapter.InvalidSystemAddress.selector);
        _new(address(this), address(bps), address(weth), address(bps), TEST_FEE);
    }

    function testVenueAliasesWethFails() public {
        vm.expectRevert(UniswapV3BPSSwapAdapter.InvalidSystemAddress.selector);
        _new(address(this), address(bps), address(weth), address(weth), TEST_FEE);
    }

    function testVenueAliasesRouterFails() public {
        vm.expectRevert(UniswapV3BPSSwapAdapter.InvalidSystemAddress.selector);
        _new(address(this), address(bps), address(weth), address(this), TEST_FEE);
    }

    function testRouterAliasesBpsFails() public {
        vm.expectRevert(UniswapV3BPSSwapAdapter.InvalidSystemAddress.selector);
        _new(address(bps), address(bps), address(weth), address(venue), TEST_FEE);
    }

    function testRouterAliasesWethFails() public {
        vm.expectRevert(UniswapV3BPSSwapAdapter.InvalidSystemAddress.selector);
        _new(address(weth), address(bps), address(weth), address(venue), TEST_FEE);
    }

    function testZeroPoolFeeFails() public {
        vm.expectRevert(UniswapV3BPSSwapAdapter.ZeroPoolFee.selector);
        _new(address(this), address(bps), address(weth), address(venue), 0);
    }

    function testBpsNotAContractFails() public {
        vm.expectRevert(
            abi.encodeWithSelector(UniswapV3BPSSwapAdapter.NotAContract.selector, NOCODE)
        );
        _new(address(this), NOCODE, address(weth), address(venue), TEST_FEE);
    }

    function testWethNotAContractFails() public {
        vm.expectRevert(
            abi.encodeWithSelector(UniswapV3BPSSwapAdapter.NotAContract.selector, NOCODE)
        );
        _new(address(this), address(bps), NOCODE, address(venue), TEST_FEE);
    }

    function testVenueNotAContractFails() public {
        vm.expectRevert(
            abi.encodeWithSelector(UniswapV3BPSSwapAdapter.NotAContract.selector, NOCODE)
        );
        _new(address(this), address(bps), address(weth), NOCODE, TEST_FEE);
    }

    // The router is intentionally NOT code-checked, so a predicted (codeless) router address is
    // accepted — this is what lets the circular router<->adapter immutability be constructed.
    function testCodelessRouterAccepted() public {
        UniswapV3BPSSwapAdapter a =
            _new(NOCODE, address(bps), address(weth), address(venue), TEST_FEE);
        _eq(a.bpsTradeRouter(), NOCODE, "codeless predicted router bound");
    }

    function testImmutablesStoredExactly() public view {
        _eq(adapter.bpsTradeRouter(), address(this), "router");
        _eq(address(adapter.bps()), address(bps), "bps");
        _eq(address(adapter.weth()), address(weth), "weth");
        _eq(address(adapter.swapRouter02()), address(venue), "venue");
        _true(adapter.poolFee() == TEST_FEE, "fee");
    }
}
