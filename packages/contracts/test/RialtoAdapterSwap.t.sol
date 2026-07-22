// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {RialtoAdapterBase} from "./RialtoAdapterBase.t.sol";

contract RialtoAdapterSwapTest is RialtoAdapterBase {
    function setUp() public {
        _deployHonest();
    }

    function testHonestAcquisition() public {
        uint256 wethIn = 20e18;
        uint256 out = wethIn * RATE; // 2000e18
        _fundVaultWeth(wethIn);
        uint256 vaultStockBefore = stockA.balanceOf(address(this));

        uint256 acquired =
            adapter.acquireStock(address(stockA), wethIn, out, DEADLINE, _honestExec(wethIn));

        _eq(acquired, out, "returns observed acquired amount");
        _eq(stockA.balanceOf(address(this)) - vaultStockBefore, out, "stock forwarded to vault");
        _eq(weth.balanceOf(address(this)), 0, "vault WETH fully spent");
        _eq(weth.balanceOf(address(adapter)), 0, "no WETH residual in adapter");
        _eq(stockA.balanceOf(address(adapter)), 0, "no stock residual in adapter");
        _eq(weth.allowance(address(adapter), address(router)), 0, "router approval cleared");
        _eq(weth.balanceOf(address(router)), wethIn, "router consumed exactly the input");
    }

    function testMinimumEnforcedByAdapter() public {
        uint256 wethIn = 20e18;
        uint256 out = wethIn * RATE;
        _fundVaultWeth(wethIn);
        vm.expectRevert(); // MinimumStockOutNotMet: out < out+1
        adapter.acquireStock(address(stockA), wethIn, out + 1, DEADLINE, _honestExec(wethIn));
    }

    function testDonationTolerance() public {
        // Pre-existing WETH and stock donations at the adapter must not brick an honest execution and
        // must be left exactly untouched (baselines compared, not absolute zero).
        weth.mint(address(adapter), 5e18);
        stockA.mint(address(adapter), 7e18);
        uint256 wethIn = 20e18;
        uint256 out = wethIn * RATE;
        _fundVaultWeth(wethIn);

        uint256 acquired =
            adapter.acquireStock(address(stockA), wethIn, out, DEADLINE, _honestExec(wethIn));

        _eq(acquired, out, "acquisition succeeds despite donations");
        _eq(weth.balanceOf(address(adapter)), 5e18, "WETH donation untouched");
        _eq(stockA.balanceOf(address(adapter)), 7e18, "stock donation untouched");
        _eq(stockA.balanceOf(address(this)), out, "vault received exactly the acquired output");
    }
}
