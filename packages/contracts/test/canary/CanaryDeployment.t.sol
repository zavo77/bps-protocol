// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {CanaryDeployment} from "../../script/canary/CanaryDeployment.sol";
import {BPSCanaryToken} from "../../src/canary/BPSCanaryToken.sol";
import {BPSToken} from "../../src/BPSToken.sol";
import {MockWETH} from "../mocks/MockWETH.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockSwapRouter02} from "../mocks/MockSwapRouter02.sol";
import {MockRialtoRouterRegistry} from "../mocks/MockRialtoRouterRegistry.sol";
import {MockRialtoRouter} from "../mocks/MockRialtoRouter.sol";
import {BPSTradeRouter} from "../../src/BPSTradeRouter.sol";
import {BPSLockingVault} from "../../src/BPSLockingVault.sol";
import {DistributionClaimManager} from "../../src/DistributionClaimManager.sol";

interface DVm {
    function chainId(uint256 newChainId) external;
    function getNonce(address account) external view returns (uint64);
    function computeCreateAddress(address deployer, uint256 nonce) external pure returns (address);
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
}

/// @notice Canary deployment path: deploys BPSCanaryToken into a SEPARATE instance of the frozen topology,
///         proves fail-closed validation, and proves separation from the canonical BPS production token.
contract CanaryDeploymentTest is CanaryDeployment {
    DVm private constant vm = DVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    uint256 private constant RH = 4663;

    MockWETH private weth;
    MockERC20 private stock;
    MockSwapRouter02 private swap;
    MockRialtoRouterRegistry private registry;
    MockRialtoRouter private rialtoRouter;

    address private constant OWNER = address(0xC0FFEE01);
    address private constant RESERVE = address(0xC0FFEE02);
    address private constant OPERATOR = address(0xC0FFEE03);
    address private constant PUBLISHER = address(0xC0FFEE04);
    address private constant RECOVERY = address(0xC0FFEE05);
    address private constant RECIPIENT = address(0xC0FFEE06);

    function setUp() public {
        vm.chainId(RH); // the Rialto adapter (and validation) require Robinhood Chain
        weth = new MockWETH();
        stock = new MockERC20("Canary Stock", "cSTK", 18);
        swap = new MockSwapRouter02(address(0xB01), address(weth), 1, 1);
        registry = new MockRialtoRouterRegistry();
        rialtoRouter = new MockRialtoRouter(address(weth), 1);
        registry.setOwner(2, address(rialtoRouter));
    }

    function _cfg() internal view returns (CanaryConfig memory c) {
        address[] memory basket = new address[](1);
        basket[0] = address(stock);
        c = CanaryConfig({
            deployer: address(this),
            startNonce: 0, // set by caller immediately before deploy
            weth: address(weth),
            rialtoRegistry: address(registry),
            swapRouter02: address(swap),
            poolFee: 10000,
            canaryRecipient: RECIPIENT,
            canaryOwner: OWNER,
            reserveRecipient: RESERVE,
            acquisitionOperator: OPERATOR,
            rootPublisher: PUBLISHER,
            claimRecoveryRecipient: RECOVERY,
            stockBasket: basket
        });
    }

    // --- Full canary topology deploy --------------------------------------

    function testDeploysCanaryTokenIntoFrozenTopology() public {
        CanaryConfig memory c = _cfg();
        c.startNonce = uint256(vm.getNonce(address(this)));
        CanaryDeployed memory d = _deployCanary(c);

        // The deployed token IS the canary (BPSC-TEST), not canonical BPS.
        require(
            keccak256(bytes(BPSCanaryToken(d.canaryToken).symbol()))
                == keccak256(bytes("BPSC-TEST")),
            "deployed token is not BPSC-TEST"
        );
        require(BPSCanaryToken(d.canaryToken).IS_CANARY(), "not canary");
        // Frozen router/vault/manager wired to the canary instance.
        require(
            address(BPSTradeRouter(payable(d.tradeRouter)).bpsToken()) == d.canaryToken,
            "router not wired to canary"
        );
        require(
            address(BPSLockingVault(d.lockingVault).bpsToken()) == d.canaryToken, "vault not wired"
        );
        require(DistributionClaimManager(d.claimManager).owner() == d.coordinator, "manager owner");
    }

    // --- Fail-closed validation -------------------------------------------

    function testValidationRevertsOnWrongChain() public {
        vm.chainId(1);
        CanaryConfig memory c = _cfg();
        vm.expectRevert(); // WrongChain(1) — carries an arg
        this.validate(c);
    }

    function testValidationRevertsOnZeroAddress() public {
        CanaryConfig memory c = _cfg();
        c.canaryRecipient = address(0);
        vm.expectRevert(); // ZeroConfigAddress("canaryRecipient") — carries an arg
        this.validate(c);
    }

    function testValidationRevertsOnEmptyBasket() public {
        CanaryConfig memory c = _cfg();
        c.stockBasket = new address[](0);
        vm.expectRevert(CanaryDeployment.EmptyBasket.selector);
        this.validate(c);
    }

    /// @dev external wrapper so `expectRevert` targets the validation call frame.
    function validate(CanaryConfig calldata c) external view {
        _validateCanary(c, false);
    }

    // --- Separation from canonical BPS ------------------------------------

    function testProductionTokenIsDistinctAndUnchanged() public {
        BPSToken bps = new BPSToken(RECIPIENT); // what the production path deploys
        require(keccak256(bytes(bps.symbol())) == keccak256(bytes("BPS")), "BPS symbol changed");
        require(
            keccak256(bytes(bps.symbol())) != keccak256(bytes("BPSC-TEST")),
            "production token must not be canary"
        );
    }
}
