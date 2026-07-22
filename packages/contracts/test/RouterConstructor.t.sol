// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {RouterBase} from "./RouterBase.t.sol";
import {BPSTradeRouter} from "../src/BPSTradeRouter.sol";

contract RouterConstructorTest is RouterBase {
    function setUp() public {
        _deployAll();
    }

    function _new(address owner_, address bps_, address weth_, address adapter_, address stock_)
        internal
        returns (BPSTradeRouter)
    {
        return new BPSTradeRouter(owner_, bps_, weth_, adapter_, stock_);
    }

    function testZeroOwnerFails() public {
        vm.expectRevert(); // OwnableInvalidOwner
        _new(address(0), address(bps), address(weth), address(adapter), STOCK);
    }

    function testZeroBpsFails() public {
        vm.expectRevert(BPSTradeRouter.ZeroAddress.selector);
        _new(OWNER, address(0), address(weth), address(adapter), STOCK);
    }

    function testZeroWethFails() public {
        vm.expectRevert(BPSTradeRouter.ZeroAddress.selector);
        _new(OWNER, address(bps), address(0), address(adapter), STOCK);
    }

    function testZeroAdapterFails() public {
        vm.expectRevert(BPSTradeRouter.ZeroAddress.selector);
        _new(OWNER, address(bps), address(weth), address(0), STOCK);
    }

    function testZeroStockRecipientFails() public {
        vm.expectRevert(BPSTradeRouter.ZeroAddress.selector);
        _new(OWNER, address(bps), address(weth), address(adapter), address(0));
    }

    function testBpsEqualsWethFails() public {
        vm.expectRevert(BPSTradeRouter.InvalidTokenPair.selector);
        _new(OWNER, address(bps), address(bps), address(adapter), STOCK);
    }

    function testAdapterAliasFails() public {
        vm.expectRevert(BPSTradeRouter.InvalidSystemAddress.selector);
        _new(OWNER, address(bps), address(weth), address(bps), STOCK);
    }

    function testStockRecipientAliasFails() public {
        vm.expectRevert(BPSTradeRouter.InvalidSystemAddress.selector);
        _new(OWNER, address(bps), address(weth), address(adapter), address(weth));
    }

    function testDependenciesStoredExactly() public view {
        _eq(address(router.bpsToken()), address(bps), "bps immutable");
        _eq(address(router.weth()), address(weth), "weth immutable");
        _eq(address(router.swapAdapter()), address(adapter), "adapter immutable");
        _eq(router.stockBudgetRecipient(), STOCK, "stock recipient immutable");
        _eq(router.owner(), OWNER, "owner");
    }

    function testFeeConstantsAreExact() public view {
        _eq(router.BPS_DENOMINATOR(), 10_000, "denominator");
        _eq(router.BUY_STOCK_BPS(), 200, "buy stock 200");
        _eq(router.BUY_BURN_BPS(), 100, "buy burn 100");
        _eq(router.SELL_STOCK_BPS(), 200, "sell stock 200");
        _eq(router.SELL_BURN_BPS(), 200, "sell burn 200");
    }
}
