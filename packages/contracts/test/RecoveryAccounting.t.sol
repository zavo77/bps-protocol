// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ClaimManagerBase} from "./ClaimManagerBase.t.sol";
import {DistributionClaimManager} from "../src/DistributionClaimManager.sol";

contract RecoveryAccountingTest is ClaimManagerBase {
    uint64 internal constant START = 1000;
    uint64 internal constant DEADLINE = 2000;
    bytes32 internal constant ACH = bytes32(uint256(0xA11CE));
    bytes32 internal constant MEH = bytes32(uint256(0xE7E10));

    uint256 internal constant AA = 1000e6; // alice, t6, cycle 1
    uint256 internal constant BB = 2000e6; // bob, t6, cycle 1

    bytes32[][] internal proofs; // 0 alice, 1 bob (cycle 1, t6)

    function setUp() public {
        _deploy();
        proofs = _publishT6(1, AA, BB);
    }

    /// @dev Publish a 2-leaf t6 cycle funded exactly (alice, bob); returns index proofs.
    function _publishT6(uint256 cid, uint256 aa, uint256 bb)
        internal
        returns (bytes32[][] memory p)
    {
        bytes32 r;
        (r, p) = _tree2(
            mgr.leafFor(cid, ALICE, address(t6), aa), mgr.leafFor(cid, BOB, address(t6), bb)
        );
        uint256 funded = aa + bb;
        _fund(t6, funded);
        vm.prank(OWNER);
        mgr.publishCycle(cid, r, ACH, MEH, START, DEADLINE, _addrArr(address(t6)), _uintArr(funded));
    }

    function _donate(uint256 amount) internal {
        t6.mint(address(this), amount);
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        t6.transfer(address(mgr), amount);
    }

    // 24
    function testRecoveryAtDeadlineFails() public {
        vm.warp(DEADLINE); // deadline is inclusive for claims; recovery requires strictly after
        vm.expectRevert(DistributionClaimManager.RecoveryTooEarly.selector);
        mgr.recoverExpired(1, address(t6));
    }

    // 25
    function testRecoveryAfterDeadlineSucceeds() public {
        vm.warp(DEADLINE + 1);
        mgr.recoverExpired(1, address(t6));
        _eq(t6.balanceOf(RECOVERY), AA + BB, "all unclaimed recovered");
        (, uint256 funded, uint256 claimed, uint256 recovered, bool closed) =
            mgr.assetFunding(1, address(t6));
        _eq(funded, AA + BB, "funded");
        _eq(claimed, 0, "claimed");
        _eq(recovered, AA + BB, "recovered");
        _true(closed, "closed");
        _eq(mgr.remaining(1, address(t6)), 0, "remaining zero");
        _eq(mgr.totalOutstanding(address(t6)), 0, "outstanding zero");
    }

    // 44
    function testRecoveryDestinationIsImmutableRecipient() public {
        _eq(mgr.recoveryRecipient(), RECOVERY, "immutable recipient");
        vm.warp(DEADLINE + 1);
        vm.prank(CAROL); // arbitrary caller cannot change destination
        mgr.recoverExpired(1, address(t6));
        _eq(t6.balanceOf(RECOVERY), AA + BB, "funds went to immutable recipient");
        _eq(t6.balanceOf(CAROL), 0, "caller receives nothing");
    }

    // 45
    function testRecoveryTransfersOnlyUnclaimedFunds() public {
        vm.warp(START);
        vm.prank(ALICE);
        mgr.claim(1, address(t6), AA, proofs[0]); // alice claims her share
        _donate(5000e6); // unrelated donation
        vm.warp(DEADLINE + 1);
        mgr.recoverExpired(1, address(t6));
        _eq(t6.balanceOf(RECOVERY), BB, "only unclaimed BB recovered");
        _eq(t6.balanceOf(address(mgr)), 5000e6, "donation left untouched");
    }

    // 46
    function testRecoveryCannotOccurTwice() public {
        vm.warp(DEADLINE + 1);
        mgr.recoverExpired(1, address(t6));
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionClaimManager.AlreadyRecovered.selector, uint256(1), address(t6)
            )
        );
        mgr.recoverExpired(1, address(t6));
    }

    // 47
    function testAnyoneCanTriggerRecovery() public {
        vm.warp(DEADLINE + 1);
        vm.prank(BOB);
        mgr.recoverExpired(1, address(t6));
        _eq(t6.balanceOf(RECOVERY), AA + BB, "recovery succeeded for arbitrary caller");
    }

    // 48
    function testDonationsDoNotAffectRecovery() public {
        _donate(1234);
        vm.warp(DEADLINE + 1);
        _eq(mgr.remaining(1, address(t6)), AA + BB, "remaining from accounting only");
        mgr.recoverExpired(1, address(t6));
        _eq(t6.balanceOf(RECOVERY), AA + BB, "donation not recovered");
        _eq(t6.balanceOf(address(mgr)), 1234, "donation stays in manager");
    }

    // zero-remaining recovery closes without a token transfer
    function testRecoveryWithZeroRemainingClosesQuietly() public {
        vm.warp(START);
        vm.prank(ALICE);
        mgr.claim(1, address(t6), AA, proofs[0]);
        vm.prank(BOB);
        mgr.claim(1, address(t6), BB, proofs[1]);
        vm.warp(DEADLINE + 1);
        mgr.recoverExpired(1, address(t6)); // remaining is zero
        (,,, uint256 recovered, bool closed) = mgr.assetFunding(1, address(t6));
        _eq(recovered, 0, "nothing to recover");
        _true(closed, "still marked closed");
        _eq(t6.balanceOf(RECOVERY), 0, "no transfer");
    }

    // 49
    function testSameAssetTwoCyclesIndependent() public {
        _publishT6(2, 500e6, 700e6); // cycle 2 also funds t6
        vm.warp(START);
        vm.prank(ALICE);
        mgr.claim(1, address(t6), AA, proofs[0]); // claim only affects cycle 1

        (, uint256 f2, uint256 c2,,) = mgr.assetFunding(2, address(t6));
        _eq(f2, 1200e6, "cycle 2 funded intact");
        _eq(c2, 0, "cycle 2 unclaimed");
        (, uint256 f1, uint256 c1,,) = mgr.assetFunding(1, address(t6));
        _eq(f1, AA + BB, "cycle 1 funded");
        _eq(c1, AA, "cycle 1 claimed");
        _eq(mgr.totalOutstanding(address(t6)), BB + 1200e6, "global outstanding across cycles");
    }

    // 50
    function testGlobalLiabilityUpdatesOnFundClaimRecover() public {
        _eq(mgr.totalOutstanding(address(t6)), AA + BB, "outstanding after funding");
        vm.warp(START);
        vm.prank(ALICE);
        mgr.claim(1, address(t6), AA, proofs[0]);
        _eq(mgr.totalOutstanding(address(t6)), BB, "outstanding after claim");
        vm.warp(DEADLINE + 1);
        mgr.recoverExpired(1, address(t6));
        _eq(mgr.totalOutstanding(address(t6)), 0, "outstanding after recovery");
    }

    // 51
    function testClaimedPlusRecoveredNeverExceedsFunded() public {
        vm.warp(START);
        vm.prank(ALICE);
        mgr.claim(1, address(t6), AA, proofs[0]);
        vm.warp(DEADLINE + 1);
        mgr.recoverExpired(1, address(t6));
        (, uint256 funded, uint256 claimed, uint256 recovered,) = mgr.assetFunding(1, address(t6));
        _true(claimed + recovered <= funded, "claimed + recovered <= funded");
        _eq(claimed + recovered, funded, "fully accounted (AA claimed + BB recovered)");
    }

    // 52
    function testManagerBalanceCoversOutstanding() public {
        _true(
            t6.balanceOf(address(mgr)) >= mgr.totalOutstanding(address(t6)), "covered after funding"
        );
        vm.warp(START);
        vm.prank(ALICE);
        mgr.claim(1, address(t6), AA, proofs[0]);
        _true(
            t6.balanceOf(address(mgr)) >= mgr.totalOutstanding(address(t6)), "covered after claim"
        );
        _donate(999);
        _true(
            t6.balanceOf(address(mgr)) >= mgr.totalOutstanding(address(t6)),
            "covered after donation"
        );
        vm.warp(DEADLINE + 1);
        mgr.recoverExpired(1, address(t6));
        _true(
            t6.balanceOf(address(mgr)) >= mgr.totalOutstanding(address(t6)),
            "covered after recovery"
        );
    }
}
