// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BPSToken} from "../src/BPSToken.sol";
import {BPSLockingVault} from "../src/BPSLockingVault.sol";
import {DistributionClaimManager} from "../src/DistributionClaimManager.sol";
import {DistributionFundingCoordinator} from "../src/DistributionFundingCoordinator.sol";
import {StockAcquisitionVault} from "../src/StockAcquisitionVault.sol";
import {RialtoStockAcquisitionAdapter} from "../src/adapters/RialtoStockAcquisitionAdapter.sol";
import {BPSTradeRouter} from "../src/BPSTradeRouter.sol";
import {UniswapV3BPSSwapAdapter} from "../src/adapters/UniswapV3BPSSwapAdapter.sol";
import {IRialtoRouterRegistry} from "../src/interfaces/IRialtoRouterRegistry.sol";

/// @dev Minimal inline cheatcode surface (no forge-std), per repo convention.
interface DVm {
    function computeCreateAddress(address deployer, uint256 nonce) external pure returns (address);
    function getNonce(address account) external view returns (uint64);
}

/// @title BPSDeployment
/// @notice Shared, broadcast-free deployment logic for the full BPS protocol on Robinhood Chain
///         (chain id 4663). It is consumed BOTH by the operator deployment script (`DeployBPS.s.sol`,
///         for validation + a sanitized dry-run manifest) and by the mainnet-fork rehearsal
///         (`ForkDeployRehearsal.t.sol`, which actually executes the sequence against real external
///         dependencies and asserts every prediction, immutable role, and economics constant).
///
///         The protocol has three circular immutable-address dependencies that are resolved by a single
///         deterministic CREATE-nonce plan with NO setter:
///           - StockAcquisitionVault <-> RialtoStockAcquisitionAdapter (each stores the other);
///           - StockAcquisitionVault <-> DistributionFundingCoordinator, where the coordinator occupies
///             BOTH vault roles (acquisitionExecutor AND distributionFundingCoordinator);
///           - DistributionFundingCoordinator <-> DistributionClaimManager (coordinator is the manager's
///             owner, set via the manager's constructor `initialOwner`);
///           - BPSTradeRouter <-> UniswapV3BPSSwapAdapter (each stores the other), and the router also
///             stores the vault as its immutable `stockBudgetRecipient`.
///
///         Fixed deploy order from a single deployer at a known starting nonce n0 (no gaps):
///           n0+0 BPSToken            n0+4 DistributionFundingCoordinator (== vault executor+coordinator)
///           n0+1 BPSLockingVault     n0+5 StockAcquisitionVault
///           n0+2 DistributionClaimManager   n0+6 UniswapV3BPSSwapAdapter
///           n0+3 RialtoStockAcquisitionAdapter   n0+7 BPSTradeRouter
///
///         This contract deploys NOTHING on import and adds no owner/setter/upgrade surface; it only
///         constructs the frozen production contracts with caller-supplied, verified inputs. It never
///         reads a secret and never broadcasts. All role/deployer addresses are supplied by the caller.
abstract contract BPSDeployment {
    DVm internal constant DVM = DVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    uint256 internal constant ROBINHOOD_CHAIN_ID = 4663;
    // The native-ETH sentinel used by Rialto's token list; never a valid ERC-20 role/asset here.
    address internal constant NATIVE_SENTINEL = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    struct DeployConfig {
        address deployer; // the account whose CREATE nonces produce every address
        uint256 startNonce; // deployer nonce at n0 (the BPSToken deploy)
        // External, independently verified Robinhood Chain dependencies (must have code):
        address weth;
        address rialtoRegistry;
        address swapRouter02;
        uint24 poolFee; // BPS/WETH v3 pool fee tier (deployment gate: pool unverified)
        // Protocol roles / recipients (user-supplied; a Safe is recommended for owner/operator/publisher):
        address bpsRecipient; // initial full-supply holder (treasury)
        address protocolOwner; // owner of BPSLockingVault + BPSTradeRouter (pause/two-step only)
        address reserveRecipient; // vault reserve (>=20%) destination
        address acquisitionOperator; // trusted keeper that initiates acquisitions
        address rootPublisher; // governed PoD root publisher / cycle funder
        address claimRecoveryRecipient; // immutable post-deadline recovery destination
        address[] stockBasket; // approved stock tokens (each must have code)
    }

    struct Deployed {
        address bpsToken;
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
    error BasketEntryNoCode(uint256 index, address token);
    error BasketDuplicate(uint256 index, address token);
    error BasketAliasesWeth(uint256 index);
    error NonceMismatch(uint256 expected, uint256 actual);
    error PredictionMismatch(string what, address predicted, address actual);
    error ImmutableMismatch(string what);

    /// @dev Pure address prediction from the deployer + starting nonce. Used to fill a manifest and to
    ///      assert the executed sequence. No state, no deployment.
    function _predict(address deployer, uint256 n0) internal pure returns (Deployed memory p) {
        p.bpsToken = DVM.computeCreateAddress(deployer, n0 + 0);
        p.lockingVault = DVM.computeCreateAddress(deployer, n0 + 1);
        p.claimManager = DVM.computeCreateAddress(deployer, n0 + 2);
        p.rialtoAdapter = DVM.computeCreateAddress(deployer, n0 + 3);
        p.coordinator = DVM.computeCreateAddress(deployer, n0 + 4);
        p.stockVault = DVM.computeCreateAddress(deployer, n0 + 5);
        p.uniswapAdapter = DVM.computeCreateAddress(deployer, n0 + 6);
        p.tradeRouter = DVM.computeCreateAddress(deployer, n0 + 7);
    }

    /// @dev Fail-closed configuration validation. `requireCode` gates the on-chain code checks so a
    ///      no-network dry run can still validate addresses/aliases/placeholders while a fork run also
    ///      proves the external dependencies actually have code.
    function _validate(DeployConfig memory c, bool requireCode) internal view {
        if (block.chainid != ROBINHOOD_CHAIN_ID) revert WrongChain(block.chainid);

        _requireAddr(c.deployer, "deployer");
        _requireAddr(c.weth, "weth");
        _requireAddr(c.rialtoRegistry, "rialtoRegistry");
        _requireAddr(c.swapRouter02, "swapRouter02");
        _requireAddr(c.bpsRecipient, "bpsRecipient");
        _requireAddr(c.protocolOwner, "protocolOwner");
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
            // The current feature-2 router must resolve (ownerOf reverts if paused/uninitialized) and
            // must have code. This is a live, dynamic value — never hardcoded into the adapter.
            address router = IRialtoRouterRegistry(c.rialtoRegistry).ownerOf(2);
            if (router == address(0) || router.code.length == 0) {
                revert ExternalHasNoCode("feature2Router", router);
            }
        }

        // Role addresses must not alias the external system contracts.
        _requireNotSystem(c, c.reserveRecipient, "reserveRecipient");
        _requireNotSystem(c, c.acquisitionOperator, "acquisitionOperator");
        _requireNotSystem(c, c.rootPublisher, "rootPublisher");
        _requireNotSystem(c, c.protocolOwner, "protocolOwner");
        _requireNotSystem(c, c.bpsRecipient, "bpsRecipient");
        _requireNotSystem(c, c.claimRecoveryRecipient, "claimRecoveryRecipient");

        // Approved stock basket.
        if (c.stockBasket.length == 0) revert EmptyBasket();
        for (uint256 i = 0; i < c.stockBasket.length; i++) {
            address t = c.stockBasket[i];
            if (t == address(0) || t == NATIVE_SENTINEL) revert BasketEntryZero(i);
            if (t == c.weth) revert BasketAliasesWeth(i);
            if (requireCode && t.code.length == 0) revert BasketEntryNoCode(i, t);
            for (uint256 j = 0; j < i; j++) {
                if (c.stockBasket[j] == t) revert BasketDuplicate(i, t);
            }
        }
    }

    function _requireAddr(address a, string memory field) private pure {
        if (a == address(0)) revert ZeroConfigAddress(field);
        // Obvious placeholders that must never reach a real deployment.
        if (
            a == address(1) || a == address(0xdEaD) || a == NATIVE_SENTINEL
                || a == 0x1111111111111111111111111111111111111111
        ) revert PlaceholderAddress(field);
    }

    function _requireNotSystem(DeployConfig memory c, address a, string memory field) private pure {
        if (a == c.weth || a == c.rialtoRegistry || a == c.swapRouter02) {
            revert RoleAliasesSystem(field, a);
        }
    }

    /// @dev Execute the deterministic deploy sequence from THIS contract (so `msg.sender` for every
    ///      CREATE is address(this)); `c.deployer` must therefore equal address(this) and `c.startNonce`
    ///      the current nonce. Asserts every actual address equals its prediction and every immutable
    ///      wiring is correct. Broadcast-free: callers that broadcast must instead predict from their EOA.
    function _deployAndVerify(DeployConfig memory c) internal returns (Deployed memory d) {
        _validate(c, true);
        if (c.deployer != address(this)) {
            revert PredictionMismatch("deployer", c.deployer, address(this));
        }
        uint256 n0 = uint256(DVM.getNonce(address(this)));
        if (n0 != c.startNonce) revert NonceMismatch(c.startNonce, n0);

        Deployed memory p = _predict(address(this), n0);

        BPSToken bps = new BPSToken(c.bpsRecipient); // n0+0
        BPSLockingVault locking = new BPSLockingVault(address(bps), c.protocolOwner); // n0+1
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
            p.tradeRouter, address(bps), c.weth, c.swapRouter02, c.poolFee
        ); // n0+6
        BPSTradeRouter router =
            new BPSTradeRouter(c.protocolOwner, address(bps), c.weth, address(uni), address(vault)); // n0+7

        d = Deployed({
            bpsToken: address(bps),
            lockingVault: address(locking),
            claimManager: address(manager),
            rialtoAdapter: address(rialto),
            coordinator: address(coord),
            stockVault: address(vault),
            uniswapAdapter: address(uni),
            tradeRouter: address(router)
        });

        _assertPredictions(p, d);
        _assertImmutables(c, d);
    }

    function _assertPredictions(Deployed memory p, Deployed memory d) private pure {
        if (p.bpsToken != d.bpsToken) {
            revert PredictionMismatch("bpsToken", p.bpsToken, d.bpsToken);
        }
        if (p.lockingVault != d.lockingVault) {
            revert PredictionMismatch("lockingVault", p.lockingVault, d.lockingVault);
        }
        if (p.claimManager != d.claimManager) {
            revert PredictionMismatch("claimManager", p.claimManager, d.claimManager);
        }
        if (p.rialtoAdapter != d.rialtoAdapter) {
            revert PredictionMismatch("rialtoAdapter", p.rialtoAdapter, d.rialtoAdapter);
        }
        if (p.coordinator != d.coordinator) {
            revert PredictionMismatch("coordinator", p.coordinator, d.coordinator);
        }
        if (p.stockVault != d.stockVault) {
            revert PredictionMismatch("stockVault", p.stockVault, d.stockVault);
        }
        if (p.uniswapAdapter != d.uniswapAdapter) {
            revert PredictionMismatch("uniswapAdapter", p.uniswapAdapter, d.uniswapAdapter);
        }
        if (p.tradeRouter != d.tradeRouter) {
            revert PredictionMismatch("tradeRouter", p.tradeRouter, d.tradeRouter);
        }
    }

    function _assertImmutables(DeployConfig memory c, Deployed memory d) private view {
        StockAcquisitionVault vault = StockAcquisitionVault(payable(d.stockVault));
        // Coordinator occupies BOTH vault roles.
        if (vault.acquisitionExecutor() != d.coordinator) {
            revert ImmutableMismatch("vault.executor");
        }
        if (vault.distributionFundingCoordinator() != d.coordinator) {
            revert ImmutableMismatch("vault.coordinator");
        }
        if (address(vault.acquisitionAdapter()) != d.rialtoAdapter) {
            revert ImmutableMismatch("vault.adapter");
        }
        if (vault.reserveRecipient() != c.reserveRecipient) {
            revert ImmutableMismatch("vault.reserve");
        }
        if (address(vault.weth()) != c.weth) revert ImmutableMismatch("vault.weth");

        // Adapter <-> vault.
        RialtoStockAcquisitionAdapter rialto = RialtoStockAcquisitionAdapter(d.rialtoAdapter);
        if (rialto.stockAcquisitionVault() != d.stockVault) {
            revert ImmutableMismatch("rialto.vault");
        }
        if (address(rialto.routerRegistry()) != c.rialtoRegistry) {
            revert ImmutableMismatch("rialto.registry");
        }

        // Coordinator wiring + manager ownership.
        DistributionFundingCoordinator coord = DistributionFundingCoordinator(d.coordinator);
        if (address(coord.stockAcquisitionVault()) != d.stockVault) {
            revert ImmutableMismatch("coord.vault");
        }
        if (address(coord.distributionClaimManager()) != d.claimManager) {
            revert ImmutableMismatch("coord.manager");
        }
        if (coord.acquisitionOperator() != c.acquisitionOperator) {
            revert ImmutableMismatch("coord.operator");
        }
        if (coord.rootPublisher() != c.rootPublisher) revert ImmutableMismatch("coord.publisher");
        if (DistributionClaimManager(d.claimManager).owner() != d.coordinator) {
            revert ImmutableMismatch("manager.owner");
        }

        // Router <-> uniswap adapter, router -> vault.
        BPSTradeRouter router = BPSTradeRouter(payable(d.tradeRouter));
        if (address(router.swapAdapter()) != d.uniswapAdapter) {
            revert ImmutableMismatch("router.adapter");
        }
        if (router.stockBudgetRecipient() != d.stockVault) {
            revert ImmutableMismatch("router.stockRecipient");
        }
        if (address(router.bpsToken()) != d.bpsToken) revert ImmutableMismatch("router.bps");
        if (UniswapV3BPSSwapAdapter(payable(d.uniswapAdapter)).bpsTradeRouter() != d.tradeRouter) {
            revert ImmutableMismatch("uni.router");
        }

        // Approved-stock state matches the basket.
        for (uint256 i = 0; i < c.stockBasket.length; i++) {
            if (!vault.isApprovedStockToken(c.stockBasket[i])) {
                revert ImmutableMismatch("vault.approvedStock");
            }
        }
    }
}
