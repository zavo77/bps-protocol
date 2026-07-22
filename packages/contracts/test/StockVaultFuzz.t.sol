// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {StockVaultBase} from "./StockVaultBase.t.sol";

/// @notice Property-based checks that the frozen 80/20 split conserves the acquired output, floors
///         the distribution allocation, and always assigns the rounding remainder to the reserve.
///         Honest adapter (RATE = 1 -> actualStockOut == wethIn).
contract StockVaultFuzzTest is StockVaultBase {
    function setUp() public {
        _deploy();
    }

    function testFuzzSplitConservationAndRemainderToReserve(uint256 wethIn) public {
        // Fundable from the vault's WETH budget and the adapter's stock inventory.
        wethIn = bound(wethIn, 1, 1_000_000e18);
        uint256 as_ = wethIn; // RATE = 1

        uint256 expectedDist = (as_ * 80) / 100; // floor
        uint256 expectedReserve = as_ - expectedDist;

        uint256 got = _acquire(address(stockA), wethIn, 1);

        _eq(got, as_, "returns actual stock out");
        _eq(vault.distributionAllocated(address(stockA)), expectedDist, "distribution floored");
        _eq(vault.reserveAllocated(address(stockA)), expectedReserve, "reserve = remainder");
        _eq(expectedDist + expectedReserve, as_, "split conserves");
        // Remainder-to-reserve: reserve is never below the nominal 20% floor.
        _true(expectedReserve >= (as_ * 20) / 100, "reserve >= 20%");
        _eq(stockA.balanceOf(address(vault)), expectedDist, "distribution retained exactly");
        _eq(stockA.balanceOf(RESERVE), expectedReserve, "reserve delivered exactly");
        // Donation-safe invariant with no donation: equality holds.
        _eq(
            stockA.balanceOf(address(vault)) + vault.distributionReleased(address(stockA)),
            vault.distributionAllocated(address(stockA)),
            "invariant equality without donation"
        );
    }

    // Minimal bound helper (no forge-std): map x into [min, max] inclusive.
    function bound(uint256 x, uint256 min, uint256 max) internal pure returns (uint256) {
        require(max >= min, "bad bound");
        uint256 span = max - min + 1;
        return min + (x % span);
    }
}
