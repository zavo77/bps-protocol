// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {RouterBase} from "./RouterBase.t.sol";
import {BPSTradeRouter} from "../src/BPSTradeRouter.sol";
import {HostileSwapAdapter} from "./mocks/HostileSwapAdapter.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract RouterSecurityTest is RouterBase {
    uint256 internal constant G = 1000e18;
    uint256 internal constant USER_BPS = 970_000e18;
    uint256 internal constant Q = 10_000_000e18;

    function setUp() public {
        _deployAll();
    }

    // --- Pause authority -------------------------------------------------------------------------

    function testPauseBlocksBuy() public {
        vm.prank(OWNER);
        router.pause();
        _giveWethApprove(ALICE, G);
        vm.prank(ALICE);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        router.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
    }

    function testPauseBlocksSell() public {
        vm.prank(OWNER);
        router.pause();
        _giveBpsApprove(ALICE, Q);
        vm.prank(ALICE);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        router.sellExactBpsForWeth(Q, 0, 0, 0, ALICE, DEADLINE);
    }

    function testUnpauseRestoresTrading() public {
        vm.prank(OWNER);
        router.pause();
        vm.prank(OWNER);
        router.unpause();
        _giveWethApprove(ALICE, G);
        vm.prank(ALICE);
        router.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
        _eq(bps.balanceOf(ALICE), USER_BPS, "trading restored after unpause");
    }

    function testOnlyOwnerCanPause() public {
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, ALICE));
        router.pause();
    }

    function testOnlyOwnerCanUnpause() public {
        vm.prank(OWNER);
        router.pause();
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, ALICE));
        router.unpause();
    }

    // --- Ownership: two-step, renounce disabled --------------------------------------------------

    function testRenounceOwnershipReverts() public {
        vm.prank(OWNER);
        vm.expectRevert(BPSTradeRouter.RenounceDisabled.selector);
        router.renounceOwnership();
        _eq(router.owner(), OWNER, "owner unchanged");
    }

    function testTwoStepOwnershipTransfer() public {
        vm.prank(OWNER);
        router.transferOwnership(BOB);
        _eq(router.owner(), OWNER, "owner unchanged until accepted");
        _eq(router.pendingOwner(), BOB, "pending owner set");
        vm.prank(BOB);
        router.acceptOwnership();
        _eq(router.owner(), BOB, "ownership transferred");
    }

    function testOldOwnerLosesPauseAfterTransfer() public {
        vm.prank(OWNER);
        router.transferOwnership(BOB);
        vm.prank(BOB);
        router.acceptOwnership();
        vm.prank(OWNER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OWNER));
        router.pause();
    }

    function testPendingOwnerOnlyAcceptedBySelf() public {
        vm.prank(OWNER);
        router.transferOwnership(BOB);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, ALICE));
        router.acceptOwnership();
    }

    // --- Native ETH rejection --------------------------------------------------------------------

    function testDirectNativeTransferReverts() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(router).call{value: 1}("");
        _false(ok, "native transfer must revert");
        _eq(address(router).balance, 0, "router holds no ETH");
    }

    // --- Reentrancy ------------------------------------------------------------------------------

    function testReentrancyBlockedOnBuy() public {
        (HostileSwapAdapter h, BPSTradeRouter r) = _deployHostileRouter();
        weth.mint(ALICE, G);
        vm.prank(ALICE);
        weth.approve(address(r), G);
        h.setMode(HostileSwapAdapter.Mode.REENTER);
        h.setReenter(
            address(r),
            abi.encodeWithSelector(r.buyExactWethForBps.selector, G, 0, 0, ALICE, DEADLINE)
        );
        vm.prank(ALICE);
        vm.expectRevert(); // guard blocks the re-entry -> adapter propagates a full trade revert
        r.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
        _eq(r.tradeCount(), 0, "no trade recorded");
    }

    function testReentrancyBlockedOnSell() public {
        (HostileSwapAdapter h, BPSTradeRouter r) = _deployHostileRouter();
        _donateBpsTo(ALICE, Q);
        vm.prank(ALICE);
        bps.approve(address(r), Q);
        h.setMode(HostileSwapAdapter.Mode.REENTER);
        h.setReenter(
            address(r),
            abi.encodeWithSelector(r.sellExactBpsForWeth.selector, Q, 0, 0, 0, ALICE, DEADLINE)
        );
        vm.prank(ALICE);
        vm.expectRevert();
        r.sellExactBpsForWeth(Q, 0, 0, 0, ALICE, DEADLINE);
        _eq(r.tradeCount(), 0, "no trade recorded");
    }

    // --- Cumulative accounting across mixed trades ----------------------------------------------

    function testAccountingAccumulatesAcrossTrades() public {
        // Two buys.
        _giveWethApprove(ALICE, 2 * G);
        vm.prank(ALICE);
        router.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
        vm.prank(ALICE);
        router.buyExactWethForBps(G, 0, 0, ALICE, DEADLINE);
        // One sell.
        _giveBpsApprove(BOB, Q);
        vm.prank(BOB);
        router.sellExactBpsForWeth(Q, 0, 0, 0, BOB, DEADLINE);

        _eq(router.tradeCount(), 3, "three trades");
        _eq(router.totalBuys(), 2, "two buys");
        _eq(router.totalSells(), 1, "one sell");
        _eq(router.totalGrossWethInFromBuys(), 2 * G, "gross weth in");
        _eq(router.totalGrossBpsInFromSells(), Q, "gross bps in");
        // Stock: 2 buys * 20e18 + 1 sell * 200e18.
        _eq(router.totalStockBudgetDelivered(), 2 * 20e18 + 200e18, "cumulative stock");
        // Burn budget WETH: 2 buys * 10e18 + 1 sell * 200e18.
        _eq(router.totalBurnBudgetConsumed(), 2 * 10e18 + 200e18, "cumulative burn budget");
        // Burned BPS: 2 buys * 10_000e18 + 1 sell * 200_000e18.
        _eq(router.totalBpsBurned(), 2 * 10_000e18 + 200_000e18, "cumulative bps burned");
    }
}
