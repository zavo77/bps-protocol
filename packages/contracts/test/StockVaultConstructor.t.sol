// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {StockVaultBase} from "./StockVaultBase.t.sol";
import {StockAcquisitionVault} from "../src/StockAcquisitionVault.sol";

contract StockVaultConstructorTest is StockVaultBase {
    function setUp() public {
        _deploy();
    }

    function _new(address weth_, address adapter_, address exec_, address reserve_, address coord_)
        internal
        returns (StockAcquisitionVault)
    {
        return new StockAcquisitionVault(weth_, adapter_, exec_, reserve_, coord_, _basket());
    }

    function testZeroWethFails() public {
        vm.expectRevert(StockAcquisitionVault.ZeroAddress.selector);
        _new(address(0), address(adapter), EXECUTOR, RESERVE, COORD);
    }

    function testZeroAdapterFails() public {
        vm.expectRevert(StockAcquisitionVault.ZeroAddress.selector);
        _new(address(weth), address(0), EXECUTOR, RESERVE, COORD);
    }

    function testZeroExecutorFails() public {
        vm.expectRevert(StockAcquisitionVault.ZeroAddress.selector);
        _new(address(weth), address(adapter), address(0), RESERVE, COORD);
    }

    function testZeroReserveFails() public {
        vm.expectRevert(StockAcquisitionVault.ZeroAddress.selector);
        _new(address(weth), address(adapter), EXECUTOR, address(0), COORD);
    }

    function testZeroCoordinatorFails() public {
        vm.expectRevert(StockAcquisitionVault.ZeroAddress.selector);
        _new(address(weth), address(adapter), EXECUTOR, RESERVE, address(0));
    }

    function testAdapterAliasingWethFails() public {
        vm.expectRevert(StockAcquisitionVault.InvalidSystemAddress.selector);
        _new(address(weth), address(weth), EXECUTOR, RESERVE, COORD);
    }

    function testReserveEqualsCoordinatorFails() public {
        vm.expectRevert(StockAcquisitionVault.InvalidSystemAddress.selector);
        _new(address(weth), address(adapter), EXECUTOR, RESERVE, RESERVE);
    }

    function testReserveAliasingAdapterFails() public {
        vm.expectRevert(StockAcquisitionVault.InvalidSystemAddress.selector);
        _new(address(weth), address(adapter), EXECUTOR, address(adapter), COORD);
    }

    function testEmptyBasketFails() public {
        address[] memory empty = new address[](0);
        vm.expectRevert(StockAcquisitionVault.EmptyBasket.selector);
        new StockAcquisitionVault(address(weth), address(adapter), EXECUTOR, RESERVE, COORD, empty);
    }

    function testZeroStockInBasketFails() public {
        address[] memory b = new address[](2);
        b[0] = address(stockA);
        b[1] = address(0);
        vm.expectRevert(StockAcquisitionVault.ZeroAddress.selector);
        new StockAcquisitionVault(address(weth), address(adapter), EXECUTOR, RESERVE, COORD, b);
    }

    function testStockAliasingWethFails() public {
        address[] memory b = new address[](1);
        b[0] = address(weth);
        vm.expectRevert(StockAcquisitionVault.InvalidSystemAddress.selector);
        new StockAcquisitionVault(address(weth), address(adapter), EXECUTOR, RESERVE, COORD, b);
    }

    function testStockAliasingReserveFails() public {
        address[] memory b = new address[](1);
        b[0] = RESERVE;
        vm.expectRevert(StockAcquisitionVault.InvalidSystemAddress.selector);
        new StockAcquisitionVault(address(weth), address(adapter), EXECUTOR, RESERVE, COORD, b);
    }

    function testDuplicateStockInBasketFails() public {
        address[] memory b = new address[](2);
        b[0] = address(stockA);
        b[1] = address(stockA);
        vm.expectRevert(
            abi.encodeWithSelector(
                StockAcquisitionVault.DuplicateStockToken.selector, address(stockA)
            )
        );
        new StockAcquisitionVault(address(weth), address(adapter), EXECUTOR, RESERVE, COORD, b);
    }

    function testDependenciesStoredExactly() public view {
        _eq(address(vault.weth()), address(weth), "weth");
        _eq(address(vault.acquisitionAdapter()), address(adapter), "adapter");
        _eq(vault.acquisitionExecutor(), EXECUTOR, "executor");
        _eq(vault.reserveRecipient(), RESERVE, "reserve");
        _eq(vault.distributionFundingCoordinator(), COORD, "coordinator");
    }

    function testApprovedBasketStoredExactly() public view {
        _eq(vault.approvedStockTokenCount(), 2, "count");
        _eq(vault.approvedStockTokenAt(0), address(stockA), "basket[0]");
        _eq(vault.approvedStockTokenAt(1), address(stockB), "basket[1]");
        _true(vault.isApprovedStockToken(address(stockA)), "A approved");
        _true(vault.isApprovedStockToken(address(stockB)), "B approved");
        _false(vault.isApprovedStockToken(ATTACKER), "unknown not approved");
        address[] memory b = vault.approvedStockTokens();
        _eq(b.length, 2, "array length");
        _eq(b[0], address(stockA), "array[0]");
    }

    function testSplitConstantsAreExact() public view {
        _eq(vault.SPLIT_DENOMINATOR(), 100, "denominator");
        _eq(vault.DISTRIBUTION_PERCENT(), 80, "distribution percent");
    }

    // The frozen basket has no owner-controlled add/remove: no such function exists on the ABI, so
    // there is nothing to call. This test documents that the approval mapping is construction-only.
    function testNoBasketMutationSurface() public view {
        // isApprovedStockToken is a plain getter (write-once in the constructor); an attacker address
        // is and stays unapproved with no path to change it.
        _false(vault.isApprovedStockToken(ATTACKER), "attacker never approvable");
    }
}
