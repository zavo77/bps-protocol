// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SwapAdapterBase} from "./SwapAdapterBase.t.sol";
import {BPSTradeRouter} from "../src/BPSTradeRouter.sol";
import {UniswapV3BPSSwapAdapter} from "../src/adapters/UniswapV3BPSSwapAdapter.sol";
import {BPSToken} from "../src/BPSToken.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockSwapRouter02} from "./mocks/MockSwapRouter02.sol";
import {HostileSwapRouter02} from "./mocks/HostileSwapRouter02.sol";

/// @notice End-to-end integration of the FROZEN BPSTradeRouter with the real UniswapV3BPSSwapAdapter
///         over a mock SwapRouter02. The circular router<->adapter immutability is closed with a
///         nonce-predicted CREATE address (no production authorization is weakened). Proves the frozen
///         BPS-ECON-2.0 economics and true totalSupply-reducing burns hold across all three legs, and
///         that a misbehaving venue reverts the whole trade.
contract RouterUniswapIntegrationTest is SwapAdapterBase {
    BPSTradeRouter internal router;

    // Buy expectations for G = 1000e18 (2% stock / 1% burn / 97% user; RATE = 1000).
    uint256 internal constant G = 1000e18;
    uint256 internal constant BUY_STOCK = 20e18;
    uint256 internal constant BUY_BURN_BPS = 10_000e18;
    uint256 internal constant BUY_USER_BPS = 970_000e18;

    // Sell expectations for Q = 10_000_000e18 (W = 10_000e18; 2% stock / 2% burn / 96% user).
    uint256 internal constant Q = 10_000_000e18;
    uint256 internal constant SELL_STOCK = 200e18;
    uint256 internal constant SELL_USER_WETH = 9_600e18;
    uint256 internal constant SELL_BURN_BPS = 200_000e18;

    function setUp() public {
        bps = new BPSToken(address(this));
        weth = new MockWETH();
        venue = new MockSwapRouter02(address(bps), address(weth), RATE, DIV);
        (adapter, router) = _deployCycle(address(venue));
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(address(venue), 500_000_000e18);
        weth.mint(address(venue), 1_000_000_000e18);
    }

    /// @dev Deploy the adapter bound to the router's predicted CREATE address, then the router bound to
    ///      the adapter — closing the immutable cycle without any one-time setter.
    function _deployCycle(address venueAddr)
        internal
        returns (UniswapV3BPSSwapAdapter a, BPSTradeRouter r)
    {
        uint256 nextNonce = uint256(vm.getNonce(address(this)));
        address predictedRouter = vm.computeCreateAddress(address(this), nextNonce + 1);
        a = new UniswapV3BPSSwapAdapter(
            predictedRouter, address(bps), address(weth), venueAddr, TEST_FEE
        );
        r = new BPSTradeRouter(ROUTER_OWNER, address(bps), address(weth), address(a), STOCK);
        require(address(r) == predictedRouter, "predicted router address mismatch");
        require(address(r.swapAdapter()) == address(a), "router->adapter");
        require(a.bpsTradeRouter() == address(r), "adapter->router");
    }

    function testIntegrationBuy() public {
        weth.mint(USER, G);
        vm.prank(USER);
        weth.approve(address(router), G);
        uint256 supplyBefore = bps.totalSupply();

        vm.prank(USER);
        (uint256 userOut, uint256 burned) =
            router.buyExactWethForBps(G, BUY_USER_BPS, BUY_BURN_BPS, USER, DEADLINE);

        _eq(userOut, BUY_USER_BPS, "user BPS out");
        _eq(burned, BUY_BURN_BPS, "burned BPS");
        _eq(bps.balanceOf(USER), BUY_USER_BPS, "user received BPS");
        _eq(weth.balanceOf(STOCK), BUY_STOCK, "stock budget delivered");
        _eq(supplyBefore - bps.totalSupply(), BUY_BURN_BPS, "true totalSupply reduction");
        _assertNoResidue();
    }

    function testIntegrationSell() public {
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(USER, Q);
        vm.prank(USER);
        bps.approve(address(router), Q);
        uint256 supplyBefore = bps.totalSupply();

        vm.prank(USER);
        (uint256 grossWeth, uint256 userWeth, uint256 burned) =
            router.sellExactBpsForWeth(Q, 0, SELL_USER_WETH, SELL_BURN_BPS, USER, DEADLINE);

        _eq(grossWeth, 10_000e18, "gross WETH from actual proceeds");
        _eq(userWeth, SELL_USER_WETH, "user WETH out");
        _eq(burned, SELL_BURN_BPS, "burned BPS");
        _eq(weth.balanceOf(USER), SELL_USER_WETH, "user received WETH");
        _eq(weth.balanceOf(STOCK), SELL_STOCK, "stock budget delivered");
        _eq(
            supplyBefore - bps.totalSupply(),
            SELL_BURN_BPS,
            "true totalSupply reduction (sell burn)"
        );
        _assertNoResidue();
    }

    function testIntegrationEconomicsAndAllowances() public {
        weth.mint(USER, G);
        vm.prank(USER);
        weth.approve(address(router), G);
        vm.prank(USER);
        router.buyExactWethForBps(G, BUY_USER_BPS, BUY_BURN_BPS, USER, DEADLINE);

        // Frozen 2% stock / 1% buy-burn economics via router accounting.
        _eq(router.totalStockBudgetDelivered(), BUY_STOCK, "2% stock");
        _eq(router.totalBurnBudgetConsumed(), 10e18, "1% burn budget (WETH)");
        _eq(router.totalBpsBurned(), BUY_BURN_BPS, "burned BPS");
        // All allowances return to zero after the trade.
        _eq(
            weth.allowance(address(router), address(adapter)), 0, "router->adapter weth allowance 0"
        );
        _eq(weth.allowance(address(adapter), address(venue)), 0, "adapter->venue weth allowance 0");
        _assertNoResidue();
    }

    // A hostile venue that lies about output must revert the whole frozen-router trade atomically.
    function testIntegrationHostileVenueRollsBack() public {
        HostileSwapRouter02 hVenue = new HostileSwapRouter02(address(bps), address(weth), RATE, DIV);
        (UniswapV3BPSSwapAdapter hAdapter, BPSTradeRouter hRouter) = _deployCycle(address(hVenue));
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(address(hVenue), 500_000_000e18);
        weth.mint(address(hVenue), 1_000_000_000e18);
        hVenue.setMode(HostileSwapRouter02.Mode.LIE_OVER);

        weth.mint(USER, G);
        vm.prank(USER);
        weth.approve(address(hRouter), G);
        uint256 supplyBefore = bps.totalSupply();

        vm.prank(USER);
        vm.expectRevert(); // adapter OutputMismatch (or router AdapterOutputMismatch) -> full revert
        hRouter.buyExactWethForBps(G, 0, 0, USER, DEADLINE);

        _eq(hRouter.tradeCount(), 0, "no trade recorded");
        _eq(bps.balanceOf(USER), 0, "user got no BPS");
        _eq(weth.balanceOf(STOCK), 0, "no stock delivered");
        _eq(bps.totalSupply(), supplyBefore, "no burn");
        _eq(weth.balanceOf(address(hAdapter)), 0, "no adapter residual");
    }

    function _assertNoResidue() internal view {
        _eq(bps.balanceOf(address(router)), 0, "router BPS residue 0");
        _eq(weth.balanceOf(address(router)), 0, "router WETH residue 0");
        _eq(bps.balanceOf(address(adapter)), 0, "adapter BPS residue 0");
        _eq(weth.balanceOf(address(adapter)), 0, "adapter WETH residue 0");
    }
}
