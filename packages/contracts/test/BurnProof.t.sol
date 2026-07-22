// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BPSToken} from "../src/BPSToken.sol";

/// @dev Minimal inline Foundry cheatcode surface (no forge-std / submodules), per repo convention.
interface Vm {
    function prank(address sender) external;
    function expectRevert() external;
    function expectEmit(bool a, bool b, bool c, bool d) external;
}

/// @notice Proves the BPSToken self-burn used by BPSTradeRouter is a true, permissionless,
///         own-balance-only burn: it reduces the holder's balance and totalSupply by exactly the
///         amount, emits Transfer to the zero address, cannot exceed the holder's balance, and can
///         never burn another wallet's tokens without an explicit allowance. This file is additive
///         and does not touch the frozen BPSToken.t.sol suite.
contract BurnProofTest {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    event Transfer(address indexed from, address indexed to, uint256 value);

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    BPSToken internal bps;

    function setUp() public {
        bps = new BPSToken(address(this)); // full supply minted to this test contract
    }

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function testBurnReducesSupplyAndBalanceExactly() public {
        uint256 amount = 1_234e18;
        uint256 supplyBefore = bps.totalSupply();
        uint256 balBefore = bps.balanceOf(address(this));

        vm.expectEmit(true, true, true, true);
        emit Transfer(address(this), address(0), amount);
        bps.burn(amount);

        _eq(bps.totalSupply(), supplyBefore - amount, "totalSupply reduced exactly");
        _eq(bps.balanceOf(address(this)), balBefore - amount, "balance reduced exactly");
    }

    function testBurnIsPermissionlessForAnyHolder() public {
        uint256 amount = 500e18;
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(ALICE, amount);
        uint256 supplyBefore = bps.totalSupply();
        vm.prank(ALICE);
        bps.burn(amount);
        _eq(bps.balanceOf(ALICE), 0, "alice burned her own balance");
        _eq(bps.totalSupply(), supplyBefore - amount, "supply reduced by alice's burn");
    }

    function testCannotBurnMoreThanBalance() public {
        uint256 amount = 100e18;
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(ALICE, amount);
        vm.prank(ALICE);
        vm.expectRevert(); // ERC20InsufficientBalance
        bps.burn(amount + 1);
    }

    // No caller can burn another wallet's tokens without that wallet's explicit allowance.
    function testCannotBurnAnotherWalletWithoutAllowance() public {
        uint256 amount = 777e18;
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(ALICE, amount);
        vm.prank(BOB);
        vm.expectRevert(); // ERC20InsufficientAllowance
        bps.burnFrom(ALICE, amount);
        _eq(bps.balanceOf(ALICE), amount, "alice's balance untouched");
    }

    function testBurnFromRespectsAllowance() public {
        uint256 amount = 300e18;
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(ALICE, amount);
        vm.prank(ALICE);
        bps.approve(BOB, amount);
        uint256 supplyBefore = bps.totalSupply();
        vm.prank(BOB);
        bps.burnFrom(ALICE, amount);
        _eq(bps.balanceOf(ALICE), 0, "allowance-authorized burn reduced balance");
        _eq(bps.totalSupply(), supplyBefore - amount, "supply reduced by burnFrom");
    }

    function testBurnFromBeyondAllowanceReverts() public {
        uint256 amount = 300e18;
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(ALICE, amount);
        vm.prank(ALICE);
        bps.approve(BOB, amount - 1);
        vm.prank(BOB);
        vm.expectRevert(); // ERC20InsufficientAllowance
        bps.burnFrom(ALICE, amount);
    }
}
