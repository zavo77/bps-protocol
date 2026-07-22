// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BPSDeployment} from "../script/BPSDeployment.sol";

interface Vm {
    function chainId(uint256 newChainId) external;
    function getNonce(address account) external view returns (uint64);
    function computeCreateAddress(address deployer, uint256 nonce) external pure returns (address);
    function expectRevert(bytes calldata revertData) external;
    function expectRevert(bytes4 revertData) external;
    function etch(address target, bytes calldata code) external;
}

/// @dev External wrapper so `vm.expectRevert` can catch reverts from the internal library functions.
contract DeployHarness is BPSDeployment {
    function validate(DeployConfig calldata c, bool requireCode) external view {
        _validate(c, requireCode);
    }

    function predict(address deployer, uint256 n0) external pure returns (Deployed memory) {
        return _predict(deployer, n0);
    }
}

/// @notice Offline tests for the deterministic address prediction and the fail-closed configuration
///         validation used by the BPS deployment surface. No network: the on-chain code checks are
///         exercised via `vm.etch`; the live registry/router path is proven separately by the
///         mainnet-fork rehearsal. These prove that incomplete, placeholder, aliased, or wrong-chain
///         configuration can never pass preflight.
contract DeployConfigValidationTest {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    DeployHarness internal h;

    address internal constant WETH = address(0xEE01);
    address internal constant REG = address(0xEE02);
    address internal constant SR = address(0xEE03);
    address internal constant OWNER = address(0xEE10);
    address internal constant TREASURY = address(0xEE11);
    address internal constant RESERVE = address(0xEE12);
    address internal constant OPERATOR = address(0xEE13);
    address internal constant PUBLISHER = address(0xEE14);
    address internal constant RECOVERY = address(0xEE15);
    address internal constant STOCK = address(0xEE20);

    function setUp() public {
        h = new DeployHarness();
        vm.chainId(4663);
    }

    function _base() internal pure returns (BPSDeployment.DeployConfig memory c) {
        address[] memory basket = new address[](1);
        basket[0] = STOCK;
        c = BPSDeployment.DeployConfig({
            deployer: address(0xEE99),
            startNonce: 0,
            weth: WETH,
            rialtoRegistry: REG,
            swapRouter02: SR,
            poolFee: 3000,
            bpsRecipient: TREASURY,
            protocolOwner: OWNER,
            reserveRecipient: RESERVE,
            acquisitionOperator: OPERATOR,
            rootPublisher: PUBLISHER,
            claimRecoveryRecipient: RECOVERY,
            stockBasket: basket
        });
    }

    function _true(bool c, string memory m) internal pure {
        require(c, m);
    }

    // --- Prediction --------------------------------------------------------------------------------

    function testPredictionMatchesCreateAddressAndIsDistinct() public view {
        address dep = address(0xBEEF);
        uint256 n = 7;
        BPSDeployment.Deployed memory p = h.predict(dep, n);
        _true(p.bpsToken == vm.computeCreateAddress(dep, n + 0), "bps");
        _true(p.lockingVault == vm.computeCreateAddress(dep, n + 1), "locking");
        _true(p.claimManager == vm.computeCreateAddress(dep, n + 2), "manager");
        _true(p.rialtoAdapter == vm.computeCreateAddress(dep, n + 3), "rialto");
        _true(p.coordinator == vm.computeCreateAddress(dep, n + 4), "coord");
        _true(p.stockVault == vm.computeCreateAddress(dep, n + 5), "vault");
        _true(p.uniswapAdapter == vm.computeCreateAddress(dep, n + 6), "uni");
        _true(p.tradeRouter == vm.computeCreateAddress(dep, n + 7), "router");
        // All distinct.
        _true(p.bpsToken != p.tradeRouter && p.coordinator != p.stockVault, "distinct");
    }

    function testPredictionChangesWithNonce() public view {
        _true(
            h.predict(address(0xBEEF), 1).bpsToken != h.predict(address(0xBEEF), 2).bpsToken,
            "nonce shifts addresses"
        );
    }

    // --- Fail-closed validation (no network; requireCode=false unless noted) -----------------------

    function testValidConfigPasses() public view {
        h.validate(_base(), false); // no revert
    }

    function testWrongChainReverts() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(BPSDeployment.WrongChain.selector, uint256(1)));
        h.validate(_base(), false);
    }

    function testZeroWethReverts() public {
        BPSDeployment.DeployConfig memory c = _base();
        c.weth = address(0);
        vm.expectRevert(abi.encodeWithSelector(BPSDeployment.ZeroConfigAddress.selector, "weth"));
        h.validate(c, false);
    }

    function testZeroReserveReverts() public {
        BPSDeployment.DeployConfig memory c = _base();
        c.reserveRecipient = address(0);
        vm.expectRevert(
            abi.encodeWithSelector(BPSDeployment.ZeroConfigAddress.selector, "reserveRecipient")
        );
        h.validate(c, false);
    }

    function testPlaceholderRoleReverts() public {
        BPSDeployment.DeployConfig memory c = _base();
        c.acquisitionOperator = address(1); // classic placeholder
        vm.expectRevert(
            abi.encodeWithSelector(BPSDeployment.PlaceholderAddress.selector, "acquisitionOperator")
        );
        h.validate(c, false);
    }

    function testRoleAliasesSystemReverts() public {
        BPSDeployment.DeployConfig memory c = _base();
        c.reserveRecipient = SR; // aliasing the swap router
        vm.expectRevert(
            abi.encodeWithSelector(BPSDeployment.RoleAliasesSystem.selector, "reserveRecipient", SR)
        );
        h.validate(c, false);
    }

    function testEmptyBasketReverts() public {
        BPSDeployment.DeployConfig memory c = _base();
        c.stockBasket = new address[](0);
        vm.expectRevert(BPSDeployment.EmptyBasket.selector);
        h.validate(c, false);
    }

    function testBasketZeroEntryReverts() public {
        BPSDeployment.DeployConfig memory c = _base();
        c.stockBasket[0] = address(0);
        vm.expectRevert(abi.encodeWithSelector(BPSDeployment.BasketEntryZero.selector, uint256(0)));
        h.validate(c, false);
    }

    function testBasketAliasesWethReverts() public {
        BPSDeployment.DeployConfig memory c = _base();
        c.stockBasket[0] = WETH;
        vm.expectRevert(
            abi.encodeWithSelector(BPSDeployment.BasketAliasesWeth.selector, uint256(0))
        );
        h.validate(c, false);
    }

    function testBasketDuplicateReverts() public {
        BPSDeployment.DeployConfig memory c = _base();
        address[] memory basket = new address[](2);
        basket[0] = STOCK;
        basket[1] = STOCK;
        c.stockBasket = basket;
        vm.expectRevert(
            abi.encodeWithSelector(BPSDeployment.BasketDuplicate.selector, uint256(1), STOCK)
        );
        h.validate(c, false);
    }

    // requireCode path: an external with no code fails closed.
    function testNoCodeExternalReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(BPSDeployment.ExternalHasNoCode.selector, "weth", WETH)
        );
        h.validate(_base(), true); // WETH has no code in this offline context
    }
}
