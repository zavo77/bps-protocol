// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BPSTradeRouter} from "../src/BPSTradeRouter.sol";
import {BPSToken} from "../src/BPSToken.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockSwapAdapter} from "./mocks/MockSwapAdapter.sol";
import {HostileSwapAdapter} from "./mocks/HostileSwapAdapter.sol";

/// @dev Minimal inline Foundry cheatcode surface (no forge-std / submodules), per repo convention.
interface Vm {
    function warp(uint256 newTimestamp) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function expectEmit(bool a, bool b, bool c, bool d) external;
    function assume(bool condition) external pure;
    function deal(address to, uint256 give) external;
}

/// @notice Shared setup and helpers for BPSTradeRouter tests. Abstract, so Foundry does not run it
///         as a suite. Uses the real BPSToken and a deterministic mock adapter with seeded local
///         liquidity. All tokens, addresses, and actions are fictional and local-only.
abstract contract RouterBase {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    // Mirror router events for vm.expectEmit matching.
    event OfficialBuy(
        uint256 indexed tradeId,
        address indexed trader,
        address indexed recipient,
        uint256 grossWethInput,
        uint256 stockBudget,
        uint256 burnBudget,
        uint256 userWethBudget,
        uint256 userBpsOutput,
        uint256 bpsBurned,
        address adapter,
        address stockBudgetRecipient
    );
    event OfficialSell(
        uint256 indexed tradeId,
        address indexed trader,
        address indexed recipient,
        uint256 grossBpsInput,
        uint256 grossWethOutput,
        uint256 stockBudget,
        uint256 burnBudget,
        uint256 userWethOutput,
        uint256 bpsBurned,
        address adapter,
        address stockBudgetRecipient
    );
    event StockBudgetDelivered(uint256 indexed tradeId, address indexed recipient, uint256 amount);
    event BpsRepurchasedAndBurned(uint256 indexed tradeId, uint256 wethSpent, uint256 bpsBurned);

    address internal constant OWNER = address(0x0A11);
    address internal constant STOCK = address(0x570C); // fictional stock-budget recipient
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    // Fictional integer exchange rates: 1 WETH <-> 1000 BPS.
    uint256 internal constant RATE = 1000;
    uint256 internal constant DIV = 1000;
    uint256 internal constant DEADLINE = type(uint64).max;

    BPSToken internal bps;
    MockWETH internal weth;
    MockSwapAdapter internal adapter;
    BPSTradeRouter internal router;

    function _deployAll() internal {
        bps = new BPSToken(address(this)); // this contract holds the full BPS supply
        weth = new MockWETH();
        adapter = new MockSwapAdapter(address(bps), address(weth), RATE, DIV);
        router = new BPSTradeRouter(OWNER, address(bps), address(weth), address(adapter), STOCK);
        // Seed the adapter with local liquidity for both directions.
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(address(adapter), 500_000_000e18);
        weth.mint(address(adapter), 1_000_000_000e18);
    }

    function _giveWethApprove(address user, uint256 amount) internal {
        weth.mint(user, amount);
        vm.prank(user);
        weth.approve(address(router), amount);
    }

    function _giveBpsApprove(address user, uint256 amount) internal {
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(user, amount);
        vm.prank(user);
        bps.approve(address(router), amount);
    }

    /// @dev A second router wired to a configurable hostile adapter (same BPS/WETH), seeded.
    function _deployHostileRouter() internal returns (HostileSwapAdapter h, BPSTradeRouter r) {
        h = new HostileSwapAdapter(address(bps), address(weth), RATE, DIV);
        r = new BPSTradeRouter(OWNER, address(bps), address(weth), address(h), STOCK);
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(address(h), 200_000_000e18);
        weth.mint(address(h), 200_000_000e18);
    }

    function _donateBpsTo(address to, uint256 amount) internal {
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(to, amount);
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
