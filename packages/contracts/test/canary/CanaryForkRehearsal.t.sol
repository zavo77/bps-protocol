// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {CanaryDeployment} from "../../script/canary/CanaryDeployment.sol";
import {BPSCanaryToken} from "../../src/canary/BPSCanaryToken.sol";
import {StockAcquisitionVault} from "../../src/StockAcquisitionVault.sol";
import {BPSTradeRouter} from "../../src/BPSTradeRouter.sol";
import {BPSLockingVault} from "../../src/BPSLockingVault.sol";
import {DistributionClaimManager} from "../../src/DistributionClaimManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IRialtoRouterRegistry} from "../../src/interfaces/IRialtoRouterRegistry.sol";

interface FVm {
    function envOr(string calldata name, string calldata defaultValue)
        external
        view
        returns (string memory);
    function createSelectFork(string calldata urlOrAlias) external returns (uint256);
    function getNonce(address account) external view returns (uint64);
}

/// @notice Ephemeral mainnet-fork rehearsal of the ISOLATED CANARY deployment against the REAL Robinhood
///         Chain (4663) externals, with a genuine, verified Robinhood Stock Token (NVDA) as the one-token
///         basket. It proves the previous EmptyBasket revert is removed, the frozen contracts accept the
///         BPSC-TEST token, every prediction/immutable holds, and the frozen economics constants are intact.
///         Runs only when `ROBINHOOD_FORK_RPC` is set (read-only public RPC); otherwise it skips so the
///         offline suite stays green. Broadcasts nothing and mutates no real external state.
contract CanaryForkRehearsalTest is CanaryDeployment {
    FVm internal constant fvm = FVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    address internal constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address internal constant REGISTRY = 0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E;
    address internal constant SWAP_ROUTER_02 = 0xCaf681a66D020601342297493863E78C959E5cb2;
    // Genuine Robinhood Stock Token NVDA ("NVIDIA • Robinhood Token"), resolved from the authoritative
    // Rialto public token whitelist (chain_id 4663) and verified on-chain (symbol/name/decimals,
    // oraclePaused()=false, uiMultiplier()=1e18). NOT a mock.
    address internal constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;

    bytes32 internal constant WETH_CODEHASH =
        0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353;
    bytes32 internal constant NVDA_CODEHASH =
        0x6c1fdd40002dcb440c7fff6a84171404d279ccb057803b65826f7546acd65630;

    // Rehearsal-only ephemeral role addresses (never production/canary wallet values).
    address internal constant R_RECIPIENT = address(0xCA2A0101);
    address internal constant R_OWNER = address(0xCA2A0102);
    address internal constant R_RESERVE = address(0xCA2A0103);
    address internal constant R_OPERATOR = address(0xCA2A0104);
    address internal constant R_PUBLISHER = address(0xCA2A0105);
    address internal constant R_RECOVERY = address(0xCA2A0106);

    function _true(bool c, string memory m) internal pure {
        require(c, m);
    }

    function testCanaryForkRehearsalWithNvdaBasket() public {
        string memory rpc = fvm.envOr("ROBINHOOD_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return; // skip offline
        fvm.createSelectFork(rpc);

        _true(block.chainid == ROBINHOOD_CHAIN_ID, "fork chainid == 4663");
        _true(WETH.code.length > 0 && WETH.codehash == WETH_CODEHASH, "WETH verified");
        _true(NVDA.code.length > 0 && NVDA.codehash == NVDA_CODEHASH, "NVDA verified");
        _true(REGISTRY.code.length > 0 && SWAP_ROUTER_02.code.length > 0, "infra has code");
        address router = IRialtoRouterRegistry(REGISTRY).ownerOf(2);
        _true(router != address(0) && router.code.length > 0, "feature-2 router live");

        // One genuine Stock Token removes the EmptyBasket blocker.
        address[] memory basket = new address[](1);
        basket[0] = NVDA;
        CanaryConfig memory cfg = CanaryConfig({
            deployer: address(this),
            startNonce: uint256(fvm.getNonce(address(this))),
            weth: WETH,
            rialtoRegistry: REGISTRY,
            swapRouter02: SWAP_ROUTER_02,
            poolFee: 10000, // 1% BPSC/WETH canary pool tier
            canaryRecipient: R_RECIPIENT,
            canaryOwner: R_OWNER,
            reserveRecipient: R_RESERVE,
            acquisitionOperator: R_OPERATOR,
            rootPublisher: R_PUBLISHER,
            claimRecoveryRecipient: R_RECOVERY,
            stockBasket: basket
        });
        CanaryDeployed memory d = _deployCanary(cfg); // reverts on EmptyBasket / any mismatch

        // Deployed token IS the canary; frozen contracts wired to it; economics intact.
        _true(
            keccak256(bytes(BPSCanaryToken(d.canaryToken).symbol()))
                == keccak256(bytes("BPSC-TEST")),
            "token is BPSC-TEST"
        );
        _true(
            BPSCanaryToken(d.canaryToken).totalSupply() == 1_000_000_000 * 10 ** 18, "fixed supply"
        );
        BPSTradeRouter tr = BPSTradeRouter(payable(d.tradeRouter));
        _true(tr.BUY_STOCK_BPS() == 200 && tr.BUY_BURN_BPS() == 100, "buy 3%");
        _true(tr.SELL_STOCK_BPS() == 200 && tr.SELL_BURN_BPS() == 200, "sell 4%");
        _true(address(tr.bpsToken()) == d.canaryToken, "router->canary");
        _true(address(BPSLockingVault(d.lockingVault).bpsToken()) == d.canaryToken, "vault->canary");
        StockAcquisitionVault vault = StockAcquisitionVault(payable(d.stockVault));
        _true(vault.isApprovedStockToken(NVDA), "NVDA approved in basket");
        _true(vault.DISTRIBUTION_PERCENT() == 80, "80/20 split");
        _true(DistributionClaimManager(d.claimManager).owner() == d.coordinator, "manager owner");
    }
}
