// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {UniswapV3BPSSwapAdapter} from "../src/adapters/UniswapV3BPSSwapAdapter.sol";
import {BPSToken} from "../src/BPSToken.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockSwapRouter02} from "./mocks/MockSwapRouter02.sol";
import {HostileSwapRouter02} from "./mocks/HostileSwapRouter02.sol";

/// @dev Minimal inline Foundry cheatcode surface (no forge-std / submodules), per repo convention.
interface Vm {
    function warp(uint256 newTimestamp) external;
    function prank(address sender) external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function assume(bool condition) external pure;
    function deal(address to, uint256 give) external;
    function getNonce(address account) external view returns (uint64);
    function computeCreateAddress(address deployer, uint256 nonce) external pure returns (address);
}

/// @notice Shared setup and helpers for UniswapV3BPSSwapAdapter tests. Abstract, so Foundry does not
///         run it as a suite. Two harnesses: a unit harness where the TEST CONTRACT acts as the
///         immutable BPSTradeRouter (so `swapExactInput` is exercised directly and authorization is
///         never weakened), and an integration harness that closes the real router↔adapter immutable
///         cycle via a nonce-predicted CREATE address. All tokens/addresses/swaps are fictional and
///         local-only; nothing is deployed or connected to any network.
abstract contract SwapAdapterBase {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    address internal constant ROUTER_OWNER = address(0x0A11);
    address internal constant STOCK = address(0x570C);
    address internal constant USER = address(0xA11CE);
    address internal constant RECIP = address(0xBEEF); // a benign unit-test recipient
    address internal constant ATTACKER = address(0xBAD);

    // Fictional integer rates: 1 WETH <-> 1000 BPS.
    uint256 internal constant RATE = 1000;
    uint256 internal constant DIV = 1000;
    // Arbitrary TEST fee tier only — NOT a product selection (the real tier is a deployment decision).
    uint24 internal constant TEST_FEE = 3000;
    uint256 internal constant DEADLINE = type(uint64).max;

    BPSToken internal bps;
    MockWETH internal weth;
    MockSwapRouter02 internal venue;
    UniswapV3BPSSwapAdapter internal adapter;

    // --- Unit harness: the test contract IS the authorized BPSTradeRouter ------------------------

    function _deployUnit() internal {
        bps = new BPSToken(address(this)); // this contract holds the full BPS supply and acts as router
        weth = new MockWETH();
        venue = new MockSwapRouter02(address(bps), address(weth), RATE, DIV);
        adapter = new UniswapV3BPSSwapAdapter(
            address(this), address(bps), address(weth), address(venue), TEST_FEE
        );
        _seedVenue(address(venue));
    }

    function _deployHostileUnit()
        internal
        returns (HostileSwapRouter02 hv, UniswapV3BPSSwapAdapter ha)
    {
        hv = new HostileSwapRouter02(address(bps), address(weth), RATE, DIV);
        ha = new UniswapV3BPSSwapAdapter(
            address(this), address(bps), address(weth), address(hv), TEST_FEE
        );
        _seedVenue(address(hv));
    }

    function _seedVenue(address v) internal {
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(v, 200_000_000e18);
        weth.mint(v, 200_000_000e18);
    }

    /// @dev As the router (this contract), fund and approve `spender` (the adapter) to pull `amount`.
    function _routerHasWethApprove(address spender, uint256 amount) internal {
        weth.mint(address(this), amount);
        weth.approve(spender, amount);
    }

    function _routerHasBpsApprove(address spender, uint256 amount) internal {
        // this contract already holds the full BPS supply; just approve.
        bps.approve(spender, amount);
    }

    // --- Assertions (require-based; no forge-std) ------------------------------------------------

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function _eq(address a, address b, string memory m) internal pure {
        require(a == b, m);
    }

    function _true(bool c, string memory m) internal pure {
        require(c, m);
    }

    function _false(bool c, string memory m) internal pure {
        require(!c, m);
    }
}
