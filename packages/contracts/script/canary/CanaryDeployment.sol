// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BPSCanaryToken} from "../../src/canary/BPSCanaryToken.sol";
import {BPSLockingVault} from "../../src/BPSLockingVault.sol";
import {DistributionClaimManager} from "../../src/DistributionClaimManager.sol";
import {DistributionFundingCoordinator} from "../../src/DistributionFundingCoordinator.sol";
import {StockAcquisitionVault} from "../../src/StockAcquisitionVault.sol";
import {RialtoStockAcquisitionAdapter} from "../../src/adapters/RialtoStockAcquisitionAdapter.sol";
import {BPSTradeRouter} from "../../src/BPSTradeRouter.sol";
import {UniswapV3BPSSwapAdapter} from "../../src/adapters/UniswapV3BPSSwapAdapter.sol";
import {IRialtoRouterRegistry} from "../../src/interfaces/IRialtoRouterRegistry.sol";

interface CVm {
    function computeCreateAddress(address deployer, uint256 nonce) external pure returns (address);
    function getNonce(address account) external view returns (uint64);
}

/// @title CanaryDeployment
/// @notice ISOLATED, broadcast-free deployment logic for a SEPARATE instance of the frozen BPS topology
///         wired to the non-production `BPSCanaryToken` (BPSC-TEST). It is a canary-only near-mirror of the
///         frozen `BPSDeployment` (which this file does NOT import or modify): the ONLY structural change is
///         that slot n0+0 deploys `BPSCanaryToken` instead of the concrete `BPSToken`. Every other frozen
///         contract, wiring, prediction, and immutable relationship is identical, proving the frozen system
///         accepts the canary token with no frozen-source change. It deploys nothing on import, has no
///         owner/setter/upgrade surface, never broadcasts, never reads a secret, and never touches the
///         canonical BPS deployment or its manifest.
abstract contract CanaryDeployment {
    CVm internal constant CVM = CVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    uint256 internal constant ROBINHOOD_CHAIN_ID = 4663;
    address internal constant NATIVE_SENTINEL = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    struct CanaryConfig {
        address deployer;
        uint256 startNonce;
        address weth;
        address rialtoRegistry;
        address swapRouter02;
        uint24 poolFee;
        address canaryRecipient; // full BPSC-TEST supply holder (canary treasury/LP wallet)
        address canaryOwner; // owner of the canary vault + router (pause/two-step only)
        address reserveRecipient;
        address acquisitionOperator;
        address rootPublisher;
        address claimRecoveryRecipient;
        address[] stockBasket;
    }

    struct CanaryDeployed {
        address canaryToken;
        address lockingVault;
        address claimManager;
        address rialtoAdapter;
        address coordinator;
        address stockVault;
        address uniswapAdapter;
        address tradeRouter;
    }

    error WrongChain(uint256 chainId);
    error ZeroConfigAddress(string field);
    error PlaceholderAddress(string field);
    error ExternalHasNoCode(string field, address target);
    error RoleAliasesSystem(string field, address target);
    error EmptyBasket();
    error BasketEntryZero(uint256 index);
    error BasketDuplicate(uint256 index, address token);
    error BasketAliasesWeth(uint256 index);
    error NonceMismatch(uint256 expected, uint256 actual);
    error PredictionMismatch(string what, address predicted, address actual);
    error ImmutableMismatch(string what);

    /// @dev Deterministic prediction using the SAME nonce plan as the frozen production deployment.
    function _predictCanary(address deployer, uint256 n0)
        internal
        pure
        returns (CanaryDeployed memory p)
    {
        p.canaryToken = CVM.computeCreateAddress(deployer, n0 + 0);
        p.lockingVault = CVM.computeCreateAddress(deployer, n0 + 1);
        p.claimManager = CVM.computeCreateAddress(deployer, n0 + 2);
        p.rialtoAdapter = CVM.computeCreateAddress(deployer, n0 + 3);
        p.coordinator = CVM.computeCreateAddress(deployer, n0 + 4);
        p.stockVault = CVM.computeCreateAddress(deployer, n0 + 5);
        p.uniswapAdapter = CVM.computeCreateAddress(deployer, n0 + 6);
        p.tradeRouter = CVM.computeCreateAddress(deployer, n0 + 7);
    }

    /// @dev Fail-closed validation. `requireCode` gates on-chain code checks so a no-network dry run can
    ///      still validate addresses/aliases/placeholders. Wrong chain, zero/placeholder/aliased roles,
    ///      no-code externals, an unresolved feature-2 router, or a bad basket all revert.
    function _validateCanary(CanaryConfig memory c, bool requireCode) internal view {
        if (block.chainid != ROBINHOOD_CHAIN_ID) revert WrongChain(block.chainid);
        _requireAddr(c.deployer, "deployer");
        _requireAddr(c.weth, "weth");
        _requireAddr(c.rialtoRegistry, "rialtoRegistry");
        _requireAddr(c.swapRouter02, "swapRouter02");
        _requireAddr(c.canaryRecipient, "canaryRecipient");
        _requireAddr(c.canaryOwner, "canaryOwner");
        _requireAddr(c.reserveRecipient, "reserveRecipient");
        _requireAddr(c.acquisitionOperator, "acquisitionOperator");
        _requireAddr(c.rootPublisher, "rootPublisher");
        _requireAddr(c.claimRecoveryRecipient, "claimRecoveryRecipient");

        if (requireCode) {
            if (c.weth.code.length == 0) revert ExternalHasNoCode("weth", c.weth);
            if (c.rialtoRegistry.code.length == 0) {
                revert ExternalHasNoCode("rialtoRegistry", c.rialtoRegistry);
            }
            if (c.swapRouter02.code.length == 0) {
                revert ExternalHasNoCode("swapRouter02", c.swapRouter02);
            }
            address router = IRialtoRouterRegistry(c.rialtoRegistry).ownerOf(2);
            if (router == address(0) || router.code.length == 0) {
                revert ExternalHasNoCode("feature2Router", router);
            }
        }

        _requireNotSystem(c, c.reserveRecipient, "reserveRecipient");
        _requireNotSystem(c, c.acquisitionOperator, "acquisitionOperator");
        _requireNotSystem(c, c.rootPublisher, "rootPublisher");
        _requireNotSystem(c, c.canaryOwner, "canaryOwner");
        _requireNotSystem(c, c.canaryRecipient, "canaryRecipient");
        _requireNotSystem(c, c.claimRecoveryRecipient, "claimRecoveryRecipient");

        if (c.stockBasket.length == 0) revert EmptyBasket();
        for (uint256 i = 0; i < c.stockBasket.length; i++) {
            address t = c.stockBasket[i];
            if (t == address(0) || t == NATIVE_SENTINEL) revert BasketEntryZero(i);
            if (t == c.weth) revert BasketAliasesWeth(i);
            for (uint256 j = 0; j < i; j++) {
                if (c.stockBasket[j] == t) revert BasketDuplicate(i, t);
            }
        }
    }

    function _requireAddr(address a, string memory field) private pure {
        if (a == address(0)) revert ZeroConfigAddress(field);
        if (
            a == address(1) || a == address(0xdEaD) || a == NATIVE_SENTINEL
                || a == 0x1111111111111111111111111111111111111111
        ) revert PlaceholderAddress(field);
    }

    function _requireNotSystem(CanaryConfig memory c, address a, string memory field) private pure {
        if (a == c.weth || a == c.rialtoRegistry || a == c.swapRouter02) {
            revert RoleAliasesSystem(field, a);
        }
    }

    /// @dev Execute the deterministic canary deploy from THIS contract. Deploys `BPSCanaryToken` at n0+0
    ///      and the SAME frozen contracts for slots n0+1..n0+7, asserting predictions and key immutables.
    ///      Broadcast-free: a broadcasting caller must predict from its EOA instead.
    function _deployCanary(CanaryConfig memory c) internal returns (CanaryDeployed memory d) {
        _validateCanary(c, true);
        if (c.deployer != address(this)) {
            revert PredictionMismatch("deployer", c.deployer, address(this));
        }
        uint256 n0 = uint256(CVM.getNonce(address(this)));
        if (n0 != c.startNonce) revert NonceMismatch(c.startNonce, n0);

        CanaryDeployed memory p = _predictCanary(address(this), n0);

        BPSCanaryToken canary = new BPSCanaryToken(c.canaryRecipient); // n0+0 (canary, not BPSToken)
        BPSLockingVault locking = new BPSLockingVault(address(canary), c.canaryOwner); // n0+1
        DistributionClaimManager manager =
            new DistributionClaimManager(p.coordinator, c.claimRecoveryRecipient); // n0+2
        RialtoStockAcquisitionAdapter rialto =
            new RialtoStockAcquisitionAdapter(p.stockVault, c.weth, c.rialtoRegistry); // n0+3
        DistributionFundingCoordinator coord = new DistributionFundingCoordinator(
            p.stockVault, address(manager), c.acquisitionOperator, c.rootPublisher
        ); // n0+4
        StockAcquisitionVault vault = new StockAcquisitionVault(
            c.weth,
            address(rialto),
            address(coord),
            c.reserveRecipient,
            address(coord),
            c.stockBasket
        ); // n0+5
        UniswapV3BPSSwapAdapter uni = new UniswapV3BPSSwapAdapter(
            p.tradeRouter, address(canary), c.weth, c.swapRouter02, c.poolFee
        ); // n0+6
        BPSTradeRouter router = new BPSTradeRouter(
            c.canaryOwner, address(canary), c.weth, address(uni), address(vault)
        ); // n0+7

        d = CanaryDeployed({
            canaryToken: address(canary),
            lockingVault: address(locking),
            claimManager: address(manager),
            rialtoAdapter: address(rialto),
            coordinator: address(coord),
            stockVault: address(vault),
            uniswapAdapter: address(uni),
            tradeRouter: address(router)
        });

        // Predictions.
        if (p.canaryToken != d.canaryToken) {
            revert PredictionMismatch("canaryToken", p.canaryToken, d.canaryToken);
        }
        if (p.tradeRouter != d.tradeRouter) {
            revert PredictionMismatch("tradeRouter", p.tradeRouter, d.tradeRouter);
        }
        if (p.stockVault != d.stockVault) {
            revert PredictionMismatch("stockVault", p.stockVault, d.stockVault);
        }
        if (p.coordinator != d.coordinator) {
            revert PredictionMismatch("coordinator", p.coordinator, d.coordinator);
        }

        // Key immutables: the frozen router/vault/coordinator are wired to the CANARY token + topology.
        if (address(router.bpsToken()) != d.canaryToken) revert ImmutableMismatch("router.bps");
        if (router.stockBudgetRecipient() != d.stockVault) {
            revert ImmutableMismatch("router.stockRecipient");
        }
        if (address(locking.bpsToken()) != d.canaryToken) revert ImmutableMismatch("vault.bps");
        if (vault.acquisitionExecutor() != d.coordinator) {
            revert ImmutableMismatch("vault.executor");
        }
        if (vault.distributionFundingCoordinator() != d.coordinator) {
            revert ImmutableMismatch("vault.coordinator");
        }
        if (DistributionClaimManager(d.claimManager).owner() != d.coordinator) {
            revert ImmutableMismatch("manager.owner");
        }
    }
}
