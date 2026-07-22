// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {LockingVaultBase} from "./LockingVaultBase.t.sol";

contract LockingVaultWeightTest is LockingVaultBase {
    uint256 internal constant AMT = 100_000;

    function setUp() public {
        _deploy();
    }

    // 45-49 + current weight (unwithdrawn position; queried by timestamp param)
    function testWeightBoundariesUnwithdrawn() public {
        uint256 id = _lock(ALICE, AMT, D7); // start T0, unlock T0 + D7
        _eq(vault.positionWeightAt(ALICE, id, T0 - 1), 0, "before start zero"); // 45
        _eq(vault.positionWeightAt(ALICE, id, T0), 110_000, "start bonus"); // 46
        _eq(vault.positionWeightAt(ALICE, id, T0 + D7 - 1), 110_000, "pre-unlock bonus"); // 47
        _eq(vault.positionWeightAt(ALICE, id, T0 + D7), 100_000, "unlock base 1.00x"); // 48
        _eq(vault.positionWeightAt(ALICE, id, T0 + D7 + 5000), 100_000, "post-unlock base"); // 49
        _eq(vault.positionWeight(ALICE, id), 110_000, "current weight at T0 = bonus");
    }

    // 50-51 (withdrawn position)
    function testWeightAfterWithdrawal() public {
        _lock(ALICE, AMT, D7);
        vm.warp(T0 + D7);
        vm.prank(ALICE);
        vault.withdraw(0);
        _eq(vault.positionWeightAt(ALICE, 0, T0 + D7), 0, "at withdrawnAt zero"); // 50
        _eq(vault.positionWeightAt(ALICE, 0, T0 + D7 + 100), 0, "after withdrawnAt zero"); // 50
        _eq(vault.positionWeight(ALICE, 0), 0, "current zero after withdrawal");
        _eq(vault.positionWeightAt(ALICE, 0, T0), 110_000, "historical start bonus reproducible"); // 51
        _eq(vault.positionWeightAt(ALICE, 0, T0 + D7 - 1), 110_000, "historical pre-unlock bonus"); // 51
    }

    // 52-56 canonical 100,000 BPS results
    function testCanonicalWeights() public {
        _lock(ALICE, 100_000, D7);
        _eq(vault.positionWeightAt(ALICE, 0, T0), 110_000, "7d -> 110000"); // 53
        _lock(BOB, 100_000, D14);
        _eq(vault.positionWeightAt(BOB, 0, T0), 125_000, "14d -> 125000"); // 54
        _lock(CAROL, 100_000, D21);
        _eq(vault.positionWeightAt(CAROL, 0, T0), 150_000, "21d -> 150000"); // 55
        address dan = address(0xDA7);
        _lock(dan, 100_000, D30);
        _eq(vault.positionWeightAt(dan, 0, T0), 175_000, "30d -> 175000"); // 56
        // 52 unlocked/base 1.00x = principal (matured position weight)
        _eq(vault.positionWeightAt(ALICE, 0, T0 + D7), 100_000, "unlocked 1.00x -> 100000");
    }

    // 57 fractional multiplier floors exactly once after multiplication
    function testFractionalMultiplierFloorsOnce() public {
        _lock(ALICE, 3, D30); // floor(3 * 17500 / 10000) = floor(5.25) = 5
        _eq(vault.positionWeightAt(ALICE, 0, T0), 5, "floor(3*17500/10000)=5");
        _lock(BOB, 7, D14); // floor(7 * 12500 / 10000) = floor(8.75) = 8
        _eq(vault.positionWeightAt(BOB, 0, T0), 8, "floor(7*12500/10000)=8");
        _lock(CAROL, 9, D7); // floor(9 * 11000 / 10000) = floor(9.9) = 9
        _eq(vault.positionWeightAt(CAROL, 0, T0), 9, "floor(9*11000/10000)=9");
    }
}
