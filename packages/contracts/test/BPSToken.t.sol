// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BPSToken} from "../src/BPSToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Minimal Foundry cheatcode surface. Declared inline to keep the contracts project
///      free of git submodules / forge-std, matching the established repository pattern.
interface Vm {
    function prank(address msgSender) external;
    function expectRevert() external;
}

/// @notice Deterministic tests for the canonical fixed-supply BPSToken.
/// @dev Uses `require`-based assertions (no forge-std), consistent with BuildProbe.t.sol.
contract BPSTokenTest {
    Vm private constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    uint256 private constant INITIAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    address private constant RECIPIENT = address(0xBEEF);
    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant CAROL = address(0xCA201);
    address private constant SPENDER = address(0x59E4DE7);

    BPSToken private token;

    function setUp() public {
        token = new BPSToken(RECIPIENT);
    }

    // --- Metadata ---------------------------------------------------------

    function testName() public view {
        require(keccak256(bytes(token.name())) == keccak256(bytes("BPS Protocol")), "wrong name");
    }

    function testSymbol() public view {
        require(keccak256(bytes(token.symbol())) == keccak256(bytes("BPS")), "wrong symbol");
    }

    function testDecimals() public view {
        require(token.decimals() == 18, "wrong decimals");
    }

    // --- Supply and initial distribution ----------------------------------

    function testInitialTotalSupply() public view {
        require(token.totalSupply() == INITIAL_SUPPLY, "wrong total supply");
        require(INITIAL_SUPPLY == 1_000_000_000 * 10 ** 18, "supply constant drift");
        require(token.MAX_SUPPLY() == INITIAL_SUPPLY, "MAX_SUPPLY mismatch");
    }

    function testEntireSupplyBelongsToRecipient() public view {
        require(token.balanceOf(RECIPIENT) == INITIAL_SUPPLY, "recipient missing supply");
    }

    function testDeployerHasNoSupplyWhenNotRecipient() public view {
        // The test contract is the deployer; RECIPIENT != address(this).
        require(address(this) != RECIPIENT, "precondition: deployer must differ");
        require(token.balanceOf(address(this)) == 0, "deployer unexpectedly holds supply");
    }

    function testDeployerHoldsSupplyWhenSelectedAsRecipient() public {
        BPSToken selfHeld = new BPSToken(address(this));
        require(selfHeld.balanceOf(address(this)) == INITIAL_SUPPLY, "recipient=deployer failed");
    }

    function testConstructorRevertsOnZeroRecipient() public {
        vm.expectRevert();
        new BPSToken(address(0));
    }

    // --- Transfers --------------------------------------------------------

    function testTransferSucceeds() public {
        uint256 amount = 1_000 * 10 ** 18;
        vm.prank(RECIPIENT);
        bool ok = token.transfer(ALICE, amount);
        require(ok, "transfer returned false");
        require(token.balanceOf(ALICE) == amount, "recipient of transfer wrong balance");
        require(token.balanceOf(RECIPIENT) == INITIAL_SUPPLY - amount, "sender wrong balance");
    }

    function testTransferToZeroReverts() public {
        vm.prank(RECIPIENT);
        vm.expectRevert();
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        token.transfer(address(0), 1);
    }

    function testTransferExceedingBalanceReverts() public {
        // ALICE holds nothing; any transfer must revert.
        vm.prank(ALICE);
        vm.expectRevert();
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        token.transfer(BOB, 1);
    }

    // --- Approve / transferFrom -------------------------------------------

    function testApproveAndTransferFrom() public {
        uint256 amount = 500 * 10 ** 18;
        vm.prank(RECIPIENT);
        token.approve(SPENDER, amount);
        require(token.allowance(RECIPIENT, SPENDER) == amount, "allowance not set");

        vm.prank(SPENDER);
        bool ok = token.transferFrom(RECIPIENT, BOB, amount);
        require(ok, "transferFrom returned false");
        require(token.balanceOf(BOB) == amount, "transferFrom did not credit destination");
        require(token.balanceOf(RECIPIENT) == INITIAL_SUPPLY - amount, "source not debited");
    }

    function testTransferFromDecreasesAllowance() public {
        uint256 allowanceAmount = 800 * 10 ** 18;
        uint256 spend = 300 * 10 ** 18;
        vm.prank(RECIPIENT);
        token.approve(SPENDER, allowanceAmount);

        vm.prank(SPENDER);
        require(token.transferFrom(RECIPIENT, BOB, spend), "transferFrom failed");
        require(
            token.allowance(RECIPIENT, SPENDER) == allowanceAmount - spend,
            "allowance not decreased correctly"
        );
    }

    function testTransferFromExceedingAllowanceReverts() public {
        uint256 allowanceAmount = 100 * 10 ** 18;
        vm.prank(RECIPIENT);
        token.approve(SPENDER, allowanceAmount);

        vm.prank(SPENDER);
        vm.expectRevert();
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        token.transferFrom(RECIPIENT, BOB, allowanceAmount + 1);
    }

    // --- Voluntary burning (ERC20Burnable) --------------------------------

    function testHolderCanBurnOwnBalance() public {
        uint256 amount = 250 * 10 ** 18;
        vm.prank(RECIPIENT);
        require(token.transfer(ALICE, amount), "transfer failed");

        vm.prank(ALICE);
        token.burn(amount);
        require(token.balanceOf(ALICE) == 0, "burn did not zero holder balance");
    }

    function testBurnReducesBalanceAndTotalSupply() public {
        uint256 amount = 1_234 * 10 ** 18;
        uint256 supplyBefore = token.totalSupply();

        vm.prank(RECIPIENT);
        token.burn(amount);

        require(token.balanceOf(RECIPIENT) == INITIAL_SUPPLY - amount, "holder balance wrong");
        require(token.totalSupply() == supplyBefore - amount, "totalSupply not reduced exactly");
    }

    function testBurnFromSucceedsWithSufficientAllowance() public {
        uint256 amount = 400 * 10 ** 18;
        vm.prank(RECIPIENT);
        token.approve(SPENDER, amount);

        vm.prank(SPENDER);
        token.burnFrom(RECIPIENT, amount);
        require(token.balanceOf(RECIPIENT) == INITIAL_SUPPLY - amount, "source not debited");
    }

    function testBurnFromReducesAllowanceBalanceAndSupply() public {
        uint256 allowanceAmount = 900 * 10 ** 18;
        uint256 burnAmount = 350 * 10 ** 18;
        uint256 supplyBefore = token.totalSupply();

        vm.prank(RECIPIENT);
        token.approve(SPENDER, allowanceAmount);

        vm.prank(SPENDER);
        token.burnFrom(RECIPIENT, burnAmount);

        require(
            token.allowance(RECIPIENT, SPENDER) == allowanceAmount - burnAmount,
            "allowance not reduced"
        );
        require(token.balanceOf(RECIPIENT) == INITIAL_SUPPLY - burnAmount, "source balance wrong");
        require(
            token.totalSupply() == supplyBefore - burnAmount, "totalSupply wrong after burnFrom"
        );
    }

    function testBurnFromExceedingAllowanceReverts() public {
        uint256 allowanceAmount = 100 * 10 ** 18;
        vm.prank(RECIPIENT);
        token.approve(SPENDER, allowanceAmount);

        vm.prank(SPENDER);
        vm.expectRevert();
        token.burnFrom(RECIPIENT, allowanceAmount + 1);
    }

    // --- Fixed-supply invariants ------------------------------------------

    /// @dev Requirement: no mint path after deployment. There is no mint selector to call
    ///      (that would fail to compile). This asserts the observable consequence: ordinary
    ///      transfers never change totalSupply. Definitive absence of a mint function is
    ///      confirmed by ABI/selector inspection outside this test.
    function testTotalSupplyConstantAcrossTransfers() public {
        vm.prank(RECIPIENT);
        require(token.transfer(ALICE, 10 * 10 ** 18), "transfer failed");
        vm.prank(ALICE);
        require(token.transfer(BOB, 4 * 10 ** 18), "transfer failed");
        vm.prank(BOB);
        require(token.transfer(CAROL, 1 * 10 ** 18), "transfer failed");

        require(token.totalSupply() == INITIAL_SUPPLY, "transfers must not change supply");
    }

    function testSumOfBalancesEqualsTotalSupply() public {
        uint256 toAlice = 5_000 * 10 ** 18;
        uint256 toBob = 3_000 * 10 ** 18;
        uint256 toCarol = 2_000 * 10 ** 18;

        vm.prank(RECIPIENT);
        require(token.transfer(ALICE, toAlice), "transfer failed");
        vm.prank(RECIPIENT);
        require(token.transfer(BOB, toBob), "transfer failed");
        vm.prank(RECIPIENT);
        require(token.transfer(CAROL, toCarol), "transfer failed");

        uint256 sum = token.balanceOf(RECIPIENT) + token.balanceOf(ALICE) + token.balanceOf(BOB)
            + token.balanceOf(CAROL);
        require(sum == token.totalSupply(), "sum of balances != totalSupply");
        require(token.totalSupply() == INITIAL_SUPPLY, "supply drifted");
    }

    function testTotalSupplyAfterBurnsEqualsInitialMinusBurned() public {
        uint256 burn1 = 111 * 10 ** 18;
        uint256 burn2 = 222 * 10 ** 18;

        vm.prank(RECIPIENT);
        require(token.transfer(ALICE, burn2), "transfer failed");

        vm.prank(RECIPIENT);
        token.burn(burn1);
        vm.prank(ALICE);
        token.burn(burn2);

        uint256 cumulativeBurned = burn1 + burn2;
        require(
            token.totalSupply() == INITIAL_SUPPLY - cumulativeBurned,
            "totalSupply != initial - cumulative burned"
        );
    }

    /// @dev Sanity: the token exposes the standard ERC-20 interface for integrations.
    function testSupportsStandardErc20Interface() public view {
        IERC20 erc20 = IERC20(address(token));
        require(erc20.totalSupply() == INITIAL_SUPPLY, "IERC20 view mismatch");
        require(erc20.balanceOf(RECIPIENT) == INITIAL_SUPPLY, "IERC20 balanceOf mismatch");
    }
}
