// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BPSCanaryToken} from "../../src/canary/BPSCanaryToken.sol";
import {BPSToken} from "../../src/BPSToken.sol";
import {BPSLockingVault} from "../../src/BPSLockingVault.sol";
import {BPSTradeRouter} from "../../src/BPSTradeRouter.sol";
import {IBPSBurnable} from "../../src/interfaces/IBPSBurnable.sol";

/// @dev Minimal Foundry cheatcode surface (no forge-std), matching the repository pattern.
interface Vm {
    function prank(address msgSender) external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
}

/// @notice Isolated canary-token tests. Proves BPSC-TEST identity, fixed supply, no-mint, self-burn, and
///         interface compatibility with the FROZEN router/vault — without importing or modifying any frozen
///         source. Also documents that the production BPSToken is unchanged and distinct.
contract BPSCanaryTokenTest {
    Vm private constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    uint256 private constant SUPPLY = 1_000_000_000 * 10 ** 18;
    address private constant RECIPIENT = address(0xCA2A11); // canary recipient
    address private constant ALICE = address(0xA11CE);
    address private constant SPENDER = address(0x59E4DE7);

    BPSCanaryToken private token;

    function setUp() public {
        token = new BPSCanaryToken(RECIPIENT);
    }

    // --- Identity (distinct from canonical BPS) ---------------------------

    function testName() public view {
        require(
            keccak256(bytes(token.name())) == keccak256(bytes(unicode"BPS Canary — TEST ONLY")),
            "wrong name"
        );
    }

    function testSymbol() public view {
        require(keccak256(bytes(token.symbol())) == keccak256(bytes("BPSC-TEST")), "wrong symbol");
    }

    function testDecimals() public view {
        require(token.decimals() == 18, "decimals");
    }

    function testCanaryMarker() public view {
        require(token.IS_CANARY(), "not marked canary");
    }

    function testDistinctFromCanonicalBPS() public {
        BPSToken bps = new BPSToken(RECIPIENT);
        require(
            keccak256(bytes(bps.symbol())) != keccak256(bytes(token.symbol())),
            "symbol collides with BPS"
        );
        require(
            keccak256(bytes(bps.name())) != keccak256(bytes(token.name())), "name collides with BPS"
        );
        // Canonical BPS is unchanged/distinct.
        require(keccak256(bytes(bps.symbol())) == keccak256(bytes("BPS")), "BPS symbol changed");
        require(
            keccak256(bytes(bps.name())) == keccak256(bytes("BPS Protocol")), "BPS name changed"
        );
    }

    // --- Fixed supply / no mint -------------------------------------------

    function testFixedSupplyMintedOnceToRecipient() public view {
        require(token.totalSupply() == SUPPLY, "total supply");
        require(token.MAX_SUPPLY() == SUPPLY, "max supply const");
        require(token.balanceOf(RECIPIENT) == SUPPLY, "recipient balance");
    }

    function testZeroRecipientReverts() public {
        vm.expectRevert(BPSCanaryToken.ZeroRecipient.selector);
        new BPSCanaryToken(address(0));
    }

    // --- Self-burn surface (IBPSBurnable) required by the frozen router ----

    function testSelfBurnReducesBalanceAndTotalSupply() public {
        vm.prank(RECIPIENT);
        token.burn(1000);
        require(token.totalSupply() == SUPPLY - 1000, "supply not reduced");
        require(token.balanceOf(RECIPIENT) == SUPPLY - 1000, "balance not reduced");
    }

    function testBurnViaIBPSBurnableInterface() public {
        vm.prank(RECIPIENT);
        IBPSBurnable(address(token)).burn(500);
        require(token.totalSupply() == SUPPLY - 500, "IBPSBurnable burn failed");
    }

    function testBurnFromWithAllowance() public {
        vm.prank(RECIPIENT);
        token.approve(SPENDER, 2000);
        vm.prank(SPENDER);
        token.burnFrom(RECIPIENT, 2000);
        require(token.totalSupply() == SUPPLY - 2000, "burnFrom supply");
    }

    // --- Compatibility with the FROZEN contracts (no frozen change) --------

    function testFrozenLockingVaultAcceptsCanaryToken() public {
        BPSLockingVault vault = new BPSLockingVault(address(token), address(this));
        require(address(vault.bpsToken()) == address(token), "vault did not accept canary");
    }

    function testFrozenTradeRouterAcceptsCanaryToken() public {
        // Dummy, non-zero, non-aliasing infra addresses (constructor performs no code call).
        address weth = address(0x1111000000000000000000000000000000000001);
        address adapter = address(0x2222000000000000000000000000000000000002);
        address stockRecipient = address(0x3333000000000000000000000000000000000003);
        BPSTradeRouter router =
            new BPSTradeRouter(address(this), address(token), weth, adapter, stockRecipient);
        require(address(router.bpsToken()) == address(token), "router did not accept canary");
    }
}
