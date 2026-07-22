// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {StockVaultBase} from "./StockVaultBase.t.sol";
import {StockAcquisitionVault} from "../src/StockAcquisitionVault.sol";

contract StockVaultAccountingTest is StockVaultBase {
    uint256 internal constant W = 10_000e18;

    function setUp() public {
        _deploy();
    }

    function _donationSafeInvariant(address token) internal view {
        // balanceOf(vault) + released >= accounted distribution allocation (never an equality that a
        // donation could break).
        uint256 lhs = stockA_balance(token) + vault.distributionReleased(token);
        _true(lhs >= vault.distributionAllocated(token), "donation-safe invariant holds");
    }

    function stockA_balance(address token) internal view returns (uint256) {
        return token == address(stockA)
            ? stockA.balanceOf(address(vault))
            : stockB.balanceOf(address(vault));
    }

    function testMultiTokenAccountingIsolation() public {
        _acquire(address(stockA), W, 1); // A: acquired 10000e18, dist 8000e18, reserve 2000e18
        _acquire(address(stockB), 2 * W, 1); // B: acquired 20000e18, dist 16000e18, reserve 4000e18

        _eq(vault.totalStockAcquired(address(stockA)), 10_000e18, "A acquired");
        _eq(vault.totalStockAcquired(address(stockB)), 20_000e18, "B acquired");
        _eq(vault.distributionAllocated(address(stockA)), 8_000e18, "A distribution");
        _eq(vault.distributionAllocated(address(stockB)), 16_000e18, "B distribution");
        _eq(vault.reserveAllocated(address(stockA)), 2_000e18, "A reserve");
        _eq(vault.reserveAllocated(address(stockB)), 4_000e18, "B reserve");
        _eq(stockA.balanceOf(address(vault)), 8_000e18, "A retained");
        _eq(stockB.balanceOf(address(vault)), 16_000e18, "B retained");
        _eq(stockA.balanceOf(RESERVE), 2_000e18, "A reserve delivered");
        _eq(stockB.balanceOf(RESERVE), 4_000e18, "B reserve delivered");
        // WETH spend is global and additive across tokens.
        _eq(vault.totalWethSpent(), W + 2 * W, "weth spent global");
    }

    function testReserveGetsRoundingRemainder() public {
        // actualStockOut = 10000e18 + 3 (RATE = 1). floor(*80/100) = 8000e18 + 2; remainder -> reserve.
        uint256 wethIn = 10_000e18 + 3;
        _acquire(address(stockA), wethIn, 1);
        _eq(vault.distributionAllocated(address(stockA)), 8_000e18 + 2, "distribution floored");
        _eq(vault.reserveAllocated(address(stockA)), 2_000e18 + 1, "remainder to reserve");
        _eq(
            vault.distributionAllocated(address(stockA)) + vault.reserveAllocated(address(stockA)),
            wethIn,
            "split conserves"
        );
        _eq(stockA.balanceOf(RESERVE), 2_000e18 + 1, "reserve received remainder");
    }

    function testWethDonationIsUnattributedCustody() public {
        uint256 base = weth.balanceOf(address(vault));
        weth.mint(address(vault), 500e18); // unsolicited WETH donation
        _eq(vault.availableWethCustody(), base + 500e18, "custody reflects donation");
        _eq(vault.totalWethSpent(), 0, "donation not counted as spend");
        // Acquisition still spends exactly the declared input; the donation is simply extra custody.
        _acquire(address(stockA), W, 1);
        _eq(vault.totalWethSpent(), W, "spend is exactly the input");
        _eq(weth.balanceOf(address(vault)), base + 500e18 - W, "only the input left custody");
    }

    function testStockDonationDoesNotInflateAccounting() public {
        _acquire(address(stockA), W, 1); // distribution allocated 8000e18
        stockA.mint(address(vault), 1_234e18); // unsolicited stock donation
        _eq(vault.distributionAllocated(address(stockA)), 8_000e18, "allocation unchanged");
        _eq(vault.distributionReleasable(address(stockA)), 8_000e18, "releasable unchanged");
        _eq(vault.unsolicitedStockBalance(address(stockA)), 1_234e18, "donation surfaced as excess");
        _donationSafeInvariant(address(stockA));
    }

    function testDonationSafeInvariantAcrossReleaseAndDonation() public {
        _acquire(address(stockA), W, 1);
        stockA.mint(address(vault), 777e18); // donation
        vm.prank(EXECUTOR);
        vault.releaseToDistributionCoordinator(address(stockA), 3_000e18); // partial release
        _donationSafeInvariant(address(stockA));
        // balance = 8000e18 + 777e18 - 3000e18 = 5777e18; released = 3000e18; allocated = 8000e18.
        _eq(stockA.balanceOf(address(vault)), 5_777e18, "balance after release+donation");
        _true(
            stockA.balanceOf(address(vault)) + vault.distributionReleased(address(stockA))
                >= vault.distributionAllocated(address(stockA)),
            "invariant with donation and release"
        );
        _eq(vault.unsolicitedStockBalance(address(stockA)), 777e18, "excess still the donation");
    }
}
