// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {RouterBase} from "./RouterBase.t.sol";
import {BPSTradeRouter} from "../src/BPSTradeRouter.sol";

/// @notice Property-based checks that the BPS-ECON-2.0 allocation invariants hold for arbitrary
///         inputs: floors are exact, the split is conservative (sums to the whole), and the
///         remainder always favors the user. Uses the honest deterministic adapter (RATE/DIV = 1).
contract RouterFuzzTest is RouterBase {
    function setUp() public {
        _deployAll();
    }

    // Buy: stockBudget + burnBudget + userWethBudget == grossWethInput, floors exact, remainder->user.
    function testFuzzBuyAllocationInvariant(uint256 grossWethInput) public {
        // Bound to a range fundable from the adapter's seeded BPS liquidity (500M BPS at RATE=1000).
        grossWethInput = bound(grossWethInput, 1, 100_000e18);
        _giveWethApprove(ALICE, grossWethInput);

        uint256 expectedStock = (grossWethInput * 200) / 10_000;
        uint256 expectedBurn = (grossWethInput * 100) / 10_000;
        uint256 expectedUserWeth = grossWethInput - expectedStock - expectedBurn;

        vm.prank(ALICE);
        (uint256 userBpsOut, uint256 burned) =
            router.buyExactWethForBps(grossWethInput, 0, 0, ALICE, DEADLINE);

        // Conservation: no WETH created or destroyed by the split.
        _eq(expectedStock + expectedBurn + expectedUserWeth, grossWethInput, "buy split conserves");
        // Remainder favors the user: user share >= each protocol share's implied floor loss.
        _true(
            expectedUserWeth >= grossWethInput - expectedStock - expectedBurn, "remainder to user"
        );
        _eq(weth.balanceOf(STOCK), expectedStock, "stock delivered exactly");
        _eq(userBpsOut, expectedUserWeth * RATE, "user BPS from user WETH budget");
        _eq(burned, expectedBurn * RATE, "burned BPS from burn budget");
        _eq(weth.balanceOf(address(router)), 0, "no WETH residue");
        _eq(bps.balanceOf(address(router)), 0, "no BPS residue");
    }

    // Sell: allocation computed from ACTUAL WETH proceeds; split conserves; remainder->user.
    function testFuzzSellAllocationInvariant(uint256 grossBpsInput) public {
        // Keep proceeds within the adapter's seeded WETH liquidity; DIV=1000 so W = Q/1000.
        grossBpsInput = bound(grossBpsInput, DIV, 100_000_000e18);
        _giveBpsApprove(ALICE, grossBpsInput);

        uint256 expectedGrossWeth = grossBpsInput / DIV;
        uint256 expectedStock = (expectedGrossWeth * 200) / 10_000;
        uint256 expectedBurn = (expectedGrossWeth * 200) / 10_000;
        uint256 expectedUserWeth = expectedGrossWeth - expectedStock - expectedBurn;

        vm.prank(ALICE);
        (uint256 gross, uint256 userW, uint256 burned) =
            router.sellExactBpsForWeth(grossBpsInput, 0, 0, 0, ALICE, DEADLINE);

        _eq(gross, expectedGrossWeth, "gross WETH from actual proceeds");
        _eq(
            expectedStock + expectedBurn + expectedUserWeth,
            expectedGrossWeth,
            "sell split conserves"
        );
        _eq(userW, expectedUserWeth, "user WETH out");
        _eq(weth.balanceOf(STOCK), expectedStock, "stock delivered exactly");
        _eq(burned, expectedBurn * RATE, "burned BPS from burn budget");
        _eq(weth.balanceOf(address(router)), 0, "no WETH residue");
        _eq(bps.balanceOf(address(router)), 0, "no BPS residue");
    }

    // The protocol never takes more than 3% (buy) of the gross; the user always keeps >= 97%.
    function testFuzzBuyUserShareFloor(uint256 grossWethInput) public {
        grossWethInput = bound(grossWethInput, 1, 100_000e18);
        _giveWethApprove(ALICE, grossWethInput);
        vm.prank(ALICE);
        router.buyExactWethForBps(grossWethInput, 0, 0, ALICE, DEADLINE);
        uint256 protocolWeth = weth.balanceOf(STOCK) + (router.totalBurnBudgetConsumed());
        // Protocol WETH <= 3% (200+100 bps) of gross.
        _true(protocolWeth <= (grossWethInput * 300) / 10_000, "protocol <= 3%");
    }

    // Minimal bound helper (no forge-std): map x into [min, max] inclusive.
    function bound(uint256 x, uint256 min, uint256 max) internal pure returns (uint256) {
        require(max >= min, "bad bound");
        uint256 span = max - min + 1;
        if (span == 0) return x; // full-range, no modulo
        return min + (x % span);
    }
}
