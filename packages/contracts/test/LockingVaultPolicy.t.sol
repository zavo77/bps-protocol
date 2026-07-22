// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {LockingVaultBase} from "./LockingVaultBase.t.sol";
import {BPSLockingVault} from "../src/BPSLockingVault.sol";

contract LockingVaultPolicyTest is LockingVaultBase {
    function setUp() public {
        _deploy();
    }

    // 1
    function testConstructorRejectsZeroOwner() public {
        vm.expectRevert();
        new BPSLockingVault(address(bps), address(0));
    }

    // 2
    function testConstructorRejectsZeroBpsToken() public {
        vm.expectRevert(BPSLockingVault.ZeroAddress.selector);
        new BPSLockingVault(address(0), OWNER);
    }

    // 3
    function testBpsTokenStoredExactly() public view {
        _eq(address(vault.bpsToken()), address(bps), "bps token immutable");
    }

    // 4
    function testTwoStepOwnershipTransfer() public {
        vm.prank(OWNER);
        vault.transferOwnership(ALICE);
        _eq(vault.owner(), OWNER, "owner unchanged before accept");
        _eq(vault.pendingOwner(), ALICE, "pending set");
        vm.prank(ALICE);
        vault.acceptOwnership();
        _eq(vault.owner(), ALICE, "owner transferred");
        _eq(vault.pendingOwner(), address(0), "pending cleared");
    }

    // 5
    function testPolicyVersionIsOne() public view {
        _eq(vault.POLICY_VERSION(), 1, "policy version");
    }

    // 6
    function testPolicyNameIsVebps1() public view {
        _true(
            keccak256(bytes(vault.POLICY_NAME())) == keccak256(bytes("vebps-1")),
            "policy name vebps-1"
        );
    }

    // 7-11
    function testPolicyMultiplierTable() public view {
        _eq(uint256(vault.policyMultiplierBps(0)), M_UNLOCKED, "unlocked 10000");
        _eq(uint256(vault.policyMultiplierBps(D7)), M_7D, "7d 11000");
        _eq(uint256(vault.policyMultiplierBps(D14)), M_14D, "14d 12500");
        _eq(uint256(vault.policyMultiplierBps(D21)), M_21D, "21d 15000");
        _eq(uint256(vault.policyMultiplierBps(D30)), M_30D, "30d 17500");
    }

    // 12
    function testPolicyMultiplierRejectsUnsupportedDurations() public {
        uint32[9] memory bad = [
            uint32(1), 6 days, 8 days, 13 days, 15 days, 22 days, 29 days, 31 days, type(uint32).max
        ];
        for (uint256 i = 0; i < bad.length; i++) {
            vm.expectRevert(
                abi.encodeWithSelector(BPSLockingVault.UnsupportedPolicyDuration.selector, bad[i])
            );
            vault.policyMultiplierBps(bad[i]);
        }
    }
}
