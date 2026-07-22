// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {StockAcquisitionVault} from "../src/StockAcquisitionVault.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockStockAcquisitionAdapter} from "./mocks/MockStockAcquisitionAdapter.sol";
import {HostileStockAcquisitionAdapter} from "./mocks/HostileStockAcquisitionAdapter.sol";

/// @dev Minimal inline Foundry cheatcode surface (no forge-std / submodules), per repo convention.
interface Vm {
    function warp(uint256 newTimestamp) external;
    function prank(address sender) external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function expectEmit(bool a, bool b, bool c, bool d) external;
    function assume(bool condition) external pure;
    function deal(address to, uint256 give) external;
}

/// @notice Shared setup and helpers for StockAcquisitionVault tests. Abstract, so Foundry does not
///         run it as a suite. All tokens, addresses, adapters, and acquisitions are fictional and
///         local-only; nothing is deployed or connected to any network.
abstract contract StockVaultBase {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    // Mirror vault events for vm.expectEmit matching.
    event StockAcquired(
        address indexed executor,
        address indexed stockToken,
        uint256 wethAmountIn,
        uint256 actualStockOut,
        uint256 distributionAllocation,
        uint256 reserveAllocation,
        address adapter
    );
    event ReserveAllocated(
        address indexed stockToken, address indexed reserveRecipient, uint256 amount
    );
    event DistributionReleased(
        address indexed stockToken, address indexed coordinator, uint256 amount
    );

    address internal constant EXECUTOR = address(0xE0EC);
    address internal constant RESERVE = address(0x5E5E);
    address internal constant COORD = address(0xC00D);
    address internal constant ATTACKER = address(0xBAD);
    // Pass-through plumbing for the mock adapters: consumed WETH flows to SINK (a mock venue) and
    // acquired stock flows from SOURCE (holds inventory, approves the adapter), so a correct adapter
    // never custodies either asset.
    address internal constant SINK = address(0x5171);
    address internal constant SOURCE = address(0x50C6);

    // Honest adapter delivers stockOut = wethIn * RATE. RATE = 1 keeps the 80/20 math easy to reason
    // about (actualStockOut == wethIn), so remainders come only from the split floor.
    uint256 internal constant RATE = 1;
    uint256 internal constant DEADLINE = type(uint64).max;

    MockWETH internal weth;
    MockERC20 internal stockA; // 18 decimals
    MockERC20 internal stockB; // 6 decimals
    MockStockAcquisitionAdapter internal adapter;
    StockAcquisitionVault internal vault;

    function _basket() internal view returns (address[] memory b) {
        b = new address[](2);
        b[0] = address(stockA);
        b[1] = address(stockB);
    }

    function _deploy() internal {
        weth = new MockWETH();
        stockA = new MockERC20("Stock A", "STKA", 18);
        stockB = new MockERC20("Stock B", "STKB", 6);
        adapter = new MockStockAcquisitionAdapter(address(weth), SINK, SOURCE, RATE);
        vault = new StockAcquisitionVault(
            address(weth), address(adapter), EXECUTOR, RESERVE, COORD, _basket()
        );
        // Seed the SOURCE with stock inventory, approve the adapter to pull it, and give the vault a
        // WETH budget. The adapter holds no inventory (pass-through), so nothing is minted to it.
        _seedSource();
        _approveSource(address(adapter));
        weth.mint(address(vault), 10_000_000e18);
    }

    /// @dev A vault wired to a configurable hostile adapter (same WETH, basket, sink, source), seeded.
    function _deployHostile()
        internal
        returns (HostileStockAcquisitionAdapter h, StockAcquisitionVault vlt)
    {
        h = new HostileStockAcquisitionAdapter(address(weth), SINK, SOURCE, RATE);
        vlt = new StockAcquisitionVault(
            address(weth), address(h), EXECUTOR, RESERVE, COORD, _basket()
        );
        _seedSource();
        _approveSource(address(h));
        weth.mint(address(vlt), 10_000_000e18);
    }

    /// @dev Mint a large stock inventory to SOURCE for both tokens (idempotent-safe to call twice).
    function _seedSource() internal {
        stockA.mint(SOURCE, 1_000_000_000e18);
        stockB.mint(SOURCE, 1_000_000_000e18);
    }

    /// @dev SOURCE approves `spender` (an adapter) to pull either stock token.
    function _approveSource(address spender) internal {
        vm.prank(SOURCE);
        stockA.approve(spender, type(uint256).max);
        vm.prank(SOURCE);
        stockB.approve(spender, type(uint256).max);
    }

    function _acquire(address token, uint256 wethIn, uint256 minOut)
        internal
        returns (uint256 actualStockOut)
    {
        vm.prank(EXECUTOR);
        return vault.executeAcquisition(token, wethIn, minOut, DEADLINE, "");
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
