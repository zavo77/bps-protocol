// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ClaimManagerBase} from "./ClaimManagerBase.t.sol";
import {DistributionClaimManager} from "../src/DistributionClaimManager.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";

contract PublicationTest is ClaimManagerBase {
    uint64 internal constant START = 1000;
    uint64 internal constant DEADLINE = 2000;
    bytes32 internal constant ROOT = bytes32(uint256(0xC0FFEE));
    bytes32 internal constant ACH = bytes32(uint256(0xA11CE));
    bytes32 internal constant MEH = bytes32(uint256(0xE7E10));
    uint256 internal constant AMT6 = 100e6;
    uint256 internal constant AMT18 = 200e18;

    function setUp() public {
        _deploy();
    }

    function _publishValid() internal {
        _fund(t6, AMT6);
        _fund(t18, AMT18);
        vm.prank(OWNER);
        mgr.publishCycle(
            1,
            ROOT,
            ACH,
            MEH,
            START,
            DEADLINE,
            _addrArr(address(t6), address(t18)),
            _uintArr(AMT6, AMT18)
        );
    }

    // 1
    function testConstructorRejectsZeroOwner() public {
        vm.expectRevert();
        new DistributionClaimManager(address(0), RECOVERY);
    }

    // 2
    function testConstructorRejectsZeroRecovery() public {
        vm.expectRevert(DistributionClaimManager.ZeroAddress.selector);
        new DistributionClaimManager(OWNER, address(0));
    }

    // 3
    function testTwoStepOwnershipTransfer() public {
        vm.prank(OWNER);
        mgr.transferOwnership(ALICE);
        _eq(mgr.owner(), OWNER, "owner unchanged before accept");
        _eq(mgr.pendingOwner(), ALICE, "pending set");
        vm.prank(ALICE);
        mgr.acceptOwnership();
        _eq(mgr.owner(), ALICE, "owner transferred");
        _eq(mgr.pendingOwner(), address(0), "pending cleared");
    }

    // 4
    function testNonOwnerPublicationFails() public {
        _fund(t6, AMT6);
        vm.prank(ALICE);
        vm.expectRevert();
        mgr.publishCycle(1, ROOT, ACH, MEH, START, DEADLINE, _addrArr(address(t6)), _uintArr(AMT6));
    }

    // 5 & 6
    function testValidPublicationStoresExactState() public {
        _publishValid();
        (bytes32 root, bytes32 ach, bytes32 meh, uint64 start, uint64 deadline, bool published) =
            mgr.cycles(1);
        _true(published, "published");
        _eq(root, ROOT, "root");
        _eq(ach, ACH, "allocationsContentHash");
        _eq(meh, MEH, "manifestEnvelopeHash");
        _eq(uint256(start), START, "start");
        _eq(uint256(deadline), DEADLINE, "deadline");

        (bool reg6, uint256 funded6, uint256 claimed6, uint256 rec6, bool closed6) =
            mgr.assetFunding(1, address(t6));
        _true(reg6, "t6 registered");
        _eq(funded6, AMT6, "t6 funded");
        _eq(claimed6, 0, "t6 claimed 0");
        _eq(rec6, 0, "t6 recovered 0");
        _false(closed6, "t6 not closed");

        (bool reg18,,,,) = mgr.assetFunding(1, address(t18));
        _true(reg18, "t18 registered");
        _eq(mgr.totalOutstanding(address(t6)), AMT6, "outstanding t6");
        _eq(mgr.totalOutstanding(address(t18)), AMT18, "outstanding t18");
        _eq(t6.balanceOf(address(mgr)), AMT6, "mgr t6 balance");
        _eq(t18.balanceOf(address(mgr)), AMT18, "mgr t18 balance");
    }

    // 7
    function testDuplicateCyclePublicationFails() public {
        _publishValid();
        _fund(t6, AMT6);
        vm.prank(OWNER);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionClaimManager.CycleAlreadyPublished.selector, uint256(1)
            )
        );
        mgr.publishCycle(1, ROOT, ACH, MEH, START, DEADLINE, _addrArr(address(t6)), _uintArr(AMT6));
    }

    // 8
    function testZeroRootFails() public {
        _fund(t6, AMT6);
        vm.prank(OWNER);
        vm.expectRevert(DistributionClaimManager.ZeroRoot.selector);
        mgr.publishCycle(
            1, bytes32(0), ACH, MEH, START, DEADLINE, _addrArr(address(t6)), _uintArr(AMT6)
        );
    }

    // 9
    function testZeroContentHashFails() public {
        _fund(t6, AMT6);
        vm.prank(OWNER);
        vm.expectRevert(DistributionClaimManager.ZeroContentHash.selector);
        mgr.publishCycle(
            1, ROOT, bytes32(0), MEH, START, DEADLINE, _addrArr(address(t6)), _uintArr(AMT6)
        );

        vm.prank(OWNER);
        vm.expectRevert(DistributionClaimManager.ZeroContentHash.selector);
        mgr.publishCycle(
            1, ROOT, ACH, bytes32(0), START, DEADLINE, _addrArr(address(t6)), _uintArr(AMT6)
        );
    }

    // 10
    function testNonFutureClaimStartFails() public {
        _fund(t6, AMT6);
        vm.prank(OWNER);
        vm.expectRevert(DistributionClaimManager.InvalidClaimWindow.selector);
        // block.timestamp is 1 in the test VM; a start of 1 is not strictly in the future.
        mgr.publishCycle(1, ROOT, ACH, MEH, 1, DEADLINE, _addrArr(address(t6)), _uintArr(AMT6));
    }

    // 11
    function testDeadlineNotAfterStartFails() public {
        _fund(t6, AMT6);
        vm.prank(OWNER);
        vm.expectRevert(DistributionClaimManager.InvalidClaimWindow.selector);
        mgr.publishCycle(1, ROOT, ACH, MEH, START, START, _addrArr(address(t6)), _uintArr(AMT6));
    }

    // 12
    function testEmptyAssetListFails() public {
        vm.prank(OWNER);
        vm.expectRevert(DistributionClaimManager.EmptyAssetList.selector);
        mgr.publishCycle(1, ROOT, ACH, MEH, START, DEADLINE, new address[](0), new uint256[](0));
    }

    // 13
    function testArrayLengthMismatchFails() public {
        vm.prank(OWNER);
        vm.expectRevert(DistributionClaimManager.ArrayLengthMismatch.selector);
        mgr.publishCycle(
            1, ROOT, ACH, MEH, START, DEADLINE, _addrArr(address(t6)), _uintArr(AMT6, AMT18)
        );
    }

    // 14
    function testZeroAssetFails() public {
        vm.prank(OWNER);
        vm.expectRevert(DistributionClaimManager.ZeroAsset.selector);
        mgr.publishCycle(1, ROOT, ACH, MEH, START, DEADLINE, _addrArr(address(0)), _uintArr(AMT6));
    }

    // 15
    function testZeroFundingAmountFails() public {
        vm.prank(OWNER);
        vm.expectRevert(DistributionClaimManager.ZeroFundingAmount.selector);
        mgr.publishCycle(1, ROOT, ACH, MEH, START, DEADLINE, _addrArr(address(t6)), _uintArr(0));
    }

    // 16
    function testDuplicateAssetFails() public {
        t6.mint(OWNER, AMT6 * 2);
        vm.prank(OWNER);
        t6.approve(address(mgr), AMT6 * 2);
        vm.prank(OWNER);
        vm.expectRevert(
            abi.encodeWithSelector(DistributionClaimManager.DuplicateAsset.selector, address(t6))
        );
        mgr.publishCycle(
            1,
            ROOT,
            ACH,
            MEH,
            START,
            DEADLINE,
            _addrArr(address(t6), address(t6)),
            _uintArr(AMT6, AMT6)
        );
    }

    // 17
    function testInsufficientAllowanceFailsAtomically() public {
        t6.mint(OWNER, AMT6); // minted but not approved
        vm.prank(OWNER);
        vm.expectRevert();
        mgr.publishCycle(1, ROOT, ACH, MEH, START, DEADLINE, _addrArr(address(t6)), _uintArr(AMT6));
        (,,,,, bool published) = mgr.cycles(1);
        _false(published, "cycle must not be published");
    }

    // 18
    function testFeeOnTransferFundingFailsAtomically() public {
        MockFeeOnTransferERC20 fee = new MockFeeOnTransferERC20("Fee Token", "FEE", 100); // 1% fee
        fee.mint(OWNER, AMT6);
        vm.prank(OWNER);
        fee.approve(address(mgr), AMT6);
        vm.prank(OWNER);
        vm.expectRevert(); // FundingAmountMismatch (received < declared)
        mgr.publishCycle(1, ROOT, ACH, MEH, START, DEADLINE, _addrArr(address(fee)), _uintArr(AMT6));
        (,,,,, bool published) = mgr.cycles(1);
        _false(published, "cycle must not be published");
    }

    // 19
    function testNoPartialStateAfterFailedMultiAssetPublish() public {
        MockFeeOnTransferERC20 fee = new MockFeeOnTransferERC20("Fee", "FEE", 100);
        _fund(t6, AMT6);
        fee.mint(OWNER, AMT18);
        vm.prank(OWNER);
        fee.approve(address(mgr), AMT18);
        vm.prank(OWNER);
        vm.expectRevert(); // second asset (fee token) mismatches, reverting the whole call
        mgr.publishCycle(
            1,
            ROOT,
            ACH,
            MEH,
            START,
            DEADLINE,
            _addrArr(address(t6), address(fee)),
            _uintArr(AMT6, AMT18)
        );
        (,,,,, bool published) = mgr.cycles(1);
        _false(published, "cycle not published");
        (bool reg6,,,,) = mgr.assetFunding(1, address(t6));
        _false(reg6, "t6 not registered after rollback");
        _eq(mgr.totalOutstanding(address(t6)), 0, "no outstanding after rollback");
        _eq(t6.balanceOf(address(mgr)), 0, "no tokens held after rollback");
    }
}
