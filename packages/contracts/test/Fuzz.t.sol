// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ClaimManagerBase} from "./ClaimManagerBase.t.sol";
import {DistributionClaimManager} from "../src/DistributionClaimManager.sol";

/// @notice Property/fuzz tests that strengthen the fixed-vector coverage: any wrong claimant or
///         amount must fail, and the claim-window boundaries hold across arbitrary timestamps.
contract FuzzTest is ClaimManagerBase {
    uint256 internal constant CID = 1;
    uint64 internal constant START = 1000;
    uint64 internal constant DEADLINE = 2000;
    bytes32 internal constant ACH = bytes32(uint256(0xA11CE));
    bytes32 internal constant MEH = bytes32(uint256(0xE7E10));
    uint256 internal constant A0 = 1000e6; // alice, t6
    uint256 internal constant B0 = 2000e6; // bob, t6

    bytes32[][] internal proofs; // 0 alice, 1 bob

    function setUp() public {
        _deploy();
        bytes32 r;
        (r, proofs) = _tree2(
            mgr.leafFor(CID, ALICE, address(t6), A0), mgr.leafFor(CID, BOB, address(t6), B0)
        );
        _fund(t6, A0 + B0);
        vm.prank(OWNER);
        mgr.publishCycle(
            CID, r, ACH, MEH, START, DEADLINE, _addrArr(address(t6)), _uintArr(A0 + B0)
        );
    }

    /// A proof is bound to its claimant: no other address can use ALICE's entitlement.
    function testFuzz_WrongClaimantFails(address who) public {
        vm.assume(who != ALICE);
        vm.warp(START);
        vm.prank(who);
        vm.expectRevert(DistributionClaimManager.InvalidProof.selector);
        mgr.claim(CID, address(t6), A0, proofs[0]);
    }

    /// A proof is bound to its amount: no other amount verifies for ALICE's entitlement.
    function testFuzz_WrongAmountFails(uint256 amount) public {
        vm.assume(amount != A0 && amount != 0);
        vm.warp(START);
        vm.prank(ALICE);
        vm.expectRevert(DistributionClaimManager.InvalidProof.selector);
        mgr.claim(CID, address(t6), amount, proofs[0]);
    }

    /// Inside the inclusive [start, deadline] window a valid claim always succeeds exactly once.
    function testFuzz_ClaimInsideWindowSucceeds(uint64 ts) public {
        vm.assume(ts >= START && ts <= DEADLINE);
        vm.warp(ts);
        vm.prank(ALICE);
        mgr.claim(CID, address(t6), A0, proofs[0]);
        _eq(t6.balanceOf(ALICE), A0, "claim succeeds inside window");
    }

    /// Outside the window a valid claim always reverts (not-started before, expired after).
    function testFuzz_ClaimOutsideWindowFails(uint64 ts) public {
        vm.assume(ts < START || ts > DEADLINE);
        vm.warp(ts);
        vm.prank(ALICE);
        vm.expectRevert();
        mgr.claim(CID, address(t6), A0, proofs[0]);
    }
}
