// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {LockingVaultBase} from "./LockingVaultBase.t.sol";
import {BPSLockingVault} from "../src/BPSLockingVault.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract LockingVaultFuzzTest is LockingVaultBase {
    uint256 internal constant MAX_AMT = 1e24; // well within BPS supply (1e27)

    function setUp() public {
        _deploy();
    }

    function _tier(uint256 sel) internal pure returns (uint32 duration, uint16 mult) {
        uint256 i = sel % 4;
        if (i == 0) return (D7, M_7D);
        if (i == 1) return (D14, M_14D);
        if (i == 2) return (D21, M_21D);
        return (D30, M_30D);
    }

    /// Any nonzero amount locks with exact principal and exact accounting.
    function testFuzz_CreateLockAccounting(uint256 amount) public {
        amount = 1 + (amount % MAX_AMT); // bound to [1, MAX_AMT] without forge-std
        _giveAndApprove(ALICE, amount);
        vm.prank(ALICE);
        uint256 id = vault.createLock(amount, D7);
        _eq(vault.getPosition(ALICE, id).principal, amount, "principal exact");
        _eq(vault.lockedPrincipal(ALICE), amount, "wallet principal exact");
        _eq(vault.totalLockedPrincipal(), amount, "global principal exact");
        _eq(bps.balanceOf(address(vault)), amount, "vault funded exactly");
        _true(bps.balanceOf(address(vault)) >= vault.totalLockedPrincipal(), "liability covered");
    }

    /// Any duration that is neither the unlocked tier nor one of the four lock terms reverts.
    function testFuzz_UnsupportedDurationReverts(uint32 duration) public {
        vm.assume(
            duration != 0 && duration != D7 && duration != D14 && duration != D21 && duration != D30
        );
        vm.expectRevert(
            abi.encodeWithSelector(BPSLockingVault.UnsupportedPolicyDuration.selector, duration)
        );
        vault.policyMultiplierBps(duration);
    }

    /// Bonus weight is exactly floor(principal * tierMultiplierBps / 10_000) — floored once.
    function testFuzz_WeightFloorsOnce(uint256 principal, uint256 sel) public {
        principal = 1 + (principal % MAX_AMT); // bound to [1, MAX_AMT]
        (uint32 duration, uint16 mult) = _tier(sel);
        _giveAndApprove(ALICE, principal);
        vm.prank(ALICE);
        vault.createLock(principal, duration);
        uint256 expected = Math.mulDiv(principal, mult, 10_000);
        _eq(vault.positionWeightAt(ALICE, 0, T0), expected, "bonus weight floored once");
    }

    /// Timing boundary holds across arbitrary timestamps for an unwithdrawn 7-day position.
    function testFuzz_WeightTimingBoundary(uint64 queryTs) public {
        _lock(ALICE, 100_000, D7); // start T0, unlock T0 + D7, bonus 1.10x
        uint256 expected;
        if (queryTs < T0) {
            expected = 0;
        } else if (queryTs < T0 + D7) {
            expected = 110_000;
        } else {
            expected = 100_000;
        }
        _eq(vault.positionWeightAt(ALICE, 0, queryTs), expected, "weight matches timing rule");
    }
}
