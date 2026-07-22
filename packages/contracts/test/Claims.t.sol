// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ClaimManagerBase} from "./ClaimManagerBase.t.sol";
import {DistributionClaimManager} from "../src/DistributionClaimManager.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {ReentrancyProbeERC20} from "./mocks/ReentrancyProbeERC20.sol";

contract ClaimsTest is ClaimManagerBase {
    uint256 internal constant CID = 1;
    uint64 internal constant START = 1000;
    uint64 internal constant DEADLINE = 2000;
    bytes32 internal constant ACH = bytes32(uint256(0xA11CE));
    bytes32 internal constant MEH = bytes32(uint256(0xE7E10));

    uint256 internal constant A0 = 250_000e6; // alice, t6
    uint256 internal constant A1 = 300e18; // alice, t18
    uint256 internal constant A2 = 5e8; // bob, t8
    uint256 internal constant A3 = 700e18; // bob, t18

    bytes32 internal root;
    bytes32[][] internal proofs; // index-aligned: 0 alice/t6, 1 alice/t18, 2 bob/t8, 3 bob/t18

    function setUp() public {
        _deploy();
        bytes32[4] memory leaves;
        leaves[0] = mgr.leafFor(CID, ALICE, address(t6), A0);
        leaves[1] = mgr.leafFor(CID, ALICE, address(t18), A1);
        leaves[2] = mgr.leafFor(CID, BOB, address(t8), A2);
        leaves[3] = mgr.leafFor(CID, BOB, address(t18), A3);
        (root, proofs) = _tree4(leaves);

        _fund(t6, A0);
        _fund(t18, A1 + A3);
        _fund(t8, A2);

        address[] memory assets = new address[](3);
        assets[0] = address(t6);
        assets[1] = address(t18);
        assets[2] = address(t8);
        uint256[] memory amts = new uint256[](3);
        amts[0] = A0;
        amts[1] = A1 + A3;
        amts[2] = A2;

        vm.prank(OWNER);
        mgr.publishCycle(CID, root, ACH, MEH, START, DEADLINE, assets, amts);
    }

    // 20
    function testClaimBeforeStartFails() public {
        vm.warp(999);
        vm.prank(ALICE);
        vm.expectRevert(DistributionClaimManager.ClaimNotStarted.selector);
        mgr.claim(CID, address(t6), A0, proofs[0]);
    }

    // 21
    function testClaimAtExactStartSucceeds() public {
        vm.warp(START);
        vm.prank(ALICE);
        mgr.claim(CID, address(t6), A0, proofs[0]);
        _eq(t6.balanceOf(ALICE), A0, "alice received t6");
    }

    // 22
    function testClaimAtExactDeadlineSucceeds() public {
        vm.warp(DEADLINE);
        vm.prank(BOB);
        mgr.claim(CID, address(t8), A2, proofs[2]);
        _eq(t8.balanceOf(BOB), A2, "bob received t8 at deadline");
    }

    // 23
    function testClaimAfterDeadlineFails() public {
        vm.warp(DEADLINE + 1);
        vm.prank(ALICE);
        vm.expectRevert(DistributionClaimManager.ClaimExpired.selector);
        mgr.claim(CID, address(t6), A0, proofs[0]);
    }

    // 26
    function testInvalidProofFails() public {
        vm.warp(START);
        bytes32[] memory bad = _arr2(bytes32(uint256(1)), bytes32(uint256(2)));
        vm.prank(ALICE);
        vm.expectRevert(DistributionClaimManager.InvalidProof.selector);
        mgr.claim(CID, address(t6), A0, bad);
    }

    // 27
    function testWrongChainBindingFails() public {
        vm.warp(START);
        vm.chainId(111_111); // manager recomputes the leaf with a different block.chainid
        vm.prank(ALICE);
        vm.expectRevert(DistributionClaimManager.InvalidProof.selector);
        mgr.claim(CID, address(t6), A0, proofs[0]);
    }

    // 28
    function testWrongManagerBindingFails() public {
        DistributionClaimManager mgr2 = new DistributionClaimManager(OWNER, RECOVERY);
        _true(
            mgr.leafFor(CID, ALICE, address(t6), A0) != mgr2.leafFor(CID, ALICE, address(t6), A0),
            "leaf must bind to manager"
        );
        t6.mint(OWNER, A0);
        vm.prank(OWNER);
        t6.approve(address(mgr2), A0);
        vm.prank(OWNER);
        mgr2.publishCycle(CID, root, ACH, MEH, START, DEADLINE, _addrArr(address(t6)), _uintArr(A0));
        vm.warp(START);
        vm.prank(ALICE);
        vm.expectRevert(DistributionClaimManager.InvalidProof.selector);
        mgr2.claim(CID, address(t6), A0, proofs[0]);
    }

    // 29
    function testWrongCycleFails() public {
        uint256 cid2 = 2;
        _fund(t6, A0);
        vm.prank(OWNER);
        mgr.publishCycle(cid2, root, ACH, MEH, START, DEADLINE, _addrArr(address(t6)), _uintArr(A0));
        vm.warp(START);
        vm.prank(ALICE);
        vm.expectRevert(DistributionClaimManager.InvalidProof.selector);
        mgr.claim(cid2, address(t6), A0, proofs[0]); // proof is for cycle 1
    }

    // 30 & 36
    function testWrongClaimantFails() public {
        vm.warp(START);
        vm.prank(BOB); // BOB tries to use ALICE's entitlement
        vm.expectRevert(DistributionClaimManager.InvalidProof.selector);
        mgr.claim(CID, address(t6), A0, proofs[0]);
    }

    // 31
    function testWrongAssetFails() public {
        vm.warp(START);
        vm.prank(ALICE);
        vm.expectRevert(DistributionClaimManager.InvalidProof.selector);
        mgr.claim(CID, address(t18), A0, proofs[0]); // t18 is registered but proof is for t6
    }

    // 32
    function testWrongAmountFails() public {
        vm.warp(START);
        vm.prank(ALICE);
        vm.expectRevert(DistributionClaimManager.InvalidProof.selector);
        mgr.claim(CID, address(t6), A0 + 1, proofs[0]);
    }

    // 33
    function testZeroClaimAmountFails() public {
        vm.warp(START);
        vm.prank(ALICE);
        vm.expectRevert(DistributionClaimManager.ZeroClaimAmount.selector);
        mgr.claim(CID, address(t6), 0, proofs[0]);
    }

    // 34
    function testUnregisteredAssetFails() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        vm.warp(START);
        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionClaimManager.AssetNotRegistered.selector, CID, address(other)
            )
        );
        mgr.claim(CID, address(other), A0, proofs[0]);
    }

    // 35
    function testDoubleClaimFails() public {
        vm.warp(START);
        vm.prank(ALICE);
        mgr.claim(CID, address(t6), A0, proofs[0]);
        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionClaimManager.AlreadyClaimed.selector, CID, ALICE, address(t6)
            )
        );
        mgr.claim(CID, address(t6), A0, proofs[0]);
    }

    /// @dev Publish a 2-leaf t6 cycle deliberately underfunded by 1 unit; returns index proofs.
    function _publishUnderfundedT6(uint256 cid, uint256 aliceAmt, uint256 bobAmt)
        internal
        returns (bytes32[][] memory p)
    {
        bytes32 r;
        (r, p) = _tree2(
            mgr.leafFor(cid, ALICE, address(t6), aliceAmt),
            mgr.leafFor(cid, BOB, address(t6), bobAmt)
        );
        uint256 funded = aliceAmt + bobAmt - 1;
        _fund(t6, funded);
        vm.prank(OWNER);
        mgr.publishCycle(cid, r, ACH, MEH, START, DEADLINE, _addrArr(address(t6)), _uintArr(funded));
    }

    /// @dev Publish a 2-leaf probe-token cycle funded exactly; returns index proofs.
    function _publishProbe(
        uint256 cid,
        ReentrancyProbeERC20 probe,
        uint256 aliceAmt,
        uint256 bobAmt
    ) internal returns (bytes32[][] memory p) {
        bytes32 r;
        (r, p) = _tree2(
            mgr.leafFor(cid, ALICE, address(probe), aliceAmt),
            mgr.leafFor(cid, BOB, address(probe), bobAmt)
        );
        uint256 funded = aliceAmt + bobAmt;
        probe.mint(OWNER, funded);
        vm.prank(OWNER);
        probe.approve(address(mgr), funded);
        vm.prank(OWNER);
        mgr.publishCycle(
            cid, r, ACH, MEH, START, DEADLINE, _addrArr(address(probe)), _uintArr(funded)
        );
    }

    // 37
    function testClaimCannotExceedRemainingFunding() public {
        bytes32[][] memory p3 = _publishUnderfundedT6(3, 1000, 2000);
        vm.warp(START);
        vm.prank(ALICE);
        mgr.claim(3, address(t6), 1000, p3[0]);
        vm.prank(BOB);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionClaimManager.InsufficientCycleFunding.selector, uint256(3), address(t6)
            )
        );
        mgr.claim(3, address(t6), 2000, p3[1]);
    }

    // 38
    function testClaimStateUpdatesBeforeTokenInteraction() public {
        ReentrancyProbeERC20 probe = new ReentrancyProbeERC20();
        bytes32[][] memory p4 = _publishProbe(4, probe, 100e18, 200e18);
        probe.arm(mgr, 4, ALICE);
        vm.warp(START);
        vm.prank(ALICE);
        mgr.claim(4, address(probe), 100e18, p4[0]);

        _true(probe.sawClaimedTrue(), "claimed flag set before transfer");
        _true(probe.reentryReverted(), "reentrancy blocked");
        _eq(probe.balanceOf(ALICE), 100e18, "alice received probe tokens");
    }

    // 39
    function testSuccessfulSingleClaimTransfersExact() public {
        vm.warp(START);
        vm.prank(ALICE);
        mgr.claim(CID, address(t6), A0, proofs[0]);
        _eq(t6.balanceOf(ALICE), A0, "alice balance");
        _eq(t6.balanceOf(address(mgr)), 0, "manager t6 drained for that asset");
        (, uint256 funded, uint256 claimed,,) = mgr.assetFunding(CID, address(t6));
        _eq(funded, A0, "funded");
        _eq(claimed, A0, "claimed");
        _eq(mgr.remaining(CID, address(t6)), 0, "remaining zero");
        _eq(mgr.totalOutstanding(address(t6)), 0, "outstanding zero");
        _true(mgr.claimed(CID, ALICE, address(t6)), "claimed flag");
    }

    // 40
    function testMultiAssetBatchSucceeds() public {
        vm.warp(START);
        DistributionClaimManager.ClaimRequest[] memory reqs =
            new DistributionClaimManager.ClaimRequest[](2);
        reqs[0] = DistributionClaimManager.ClaimRequest({
            asset: address(t6), amount: A0, proof: proofs[0]
        });
        reqs[1] = DistributionClaimManager.ClaimRequest({
            asset: address(t18), amount: A1, proof: proofs[1]
        });
        vm.prank(ALICE);
        mgr.claimBatch(CID, reqs);
        _eq(t6.balanceOf(ALICE), A0, "alice t6");
        _eq(t18.balanceOf(ALICE), A1, "alice t18");
        _true(mgr.claimed(CID, ALICE, address(t6)), "t6 claimed");
        _true(mgr.claimed(CID, ALICE, address(t18)), "t18 claimed");
    }

    // 41
    function testEmptyBatchFails() public {
        vm.warp(START);
        vm.prank(ALICE);
        vm.expectRevert(DistributionClaimManager.EmptyBatch.selector);
        mgr.claimBatch(CID, new DistributionClaimManager.ClaimRequest[](0));
    }

    // 42
    function testInvalidBatchItemRevertsWholeBatch() public {
        vm.warp(START);
        DistributionClaimManager.ClaimRequest[] memory reqs =
            new DistributionClaimManager.ClaimRequest[](2);
        reqs[0] = DistributionClaimManager.ClaimRequest({
            asset: address(t6), amount: A0, proof: proofs[0]
        });
        // second item has a tampered amount -> invalid proof -> whole batch reverts
        reqs[1] = DistributionClaimManager.ClaimRequest({
            asset: address(t18), amount: A1 + 1, proof: proofs[1]
        });
        vm.prank(ALICE);
        vm.expectRevert(DistributionClaimManager.InvalidProof.selector);
        mgr.claimBatch(CID, reqs);
        _eq(t6.balanceOf(ALICE), 0, "first item rolled back");
        _false(mgr.claimed(CID, ALICE, address(t6)), "no claim recorded");
    }

    // 43
    function testDuplicateBatchEntitlementReverts() public {
        vm.warp(START);
        DistributionClaimManager.ClaimRequest[] memory reqs =
            new DistributionClaimManager.ClaimRequest[](2);
        reqs[0] = DistributionClaimManager.ClaimRequest({
            asset: address(t6), amount: A0, proof: proofs[0]
        });
        reqs[1] = DistributionClaimManager.ClaimRequest({
            asset: address(t6), amount: A0, proof: proofs[0]
        });
        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionClaimManager.AlreadyClaimed.selector, CID, ALICE, address(t6)
            )
        );
        mgr.claimBatch(CID, reqs);
        _eq(t6.balanceOf(ALICE), 0, "batch rolled back");
    }
}
