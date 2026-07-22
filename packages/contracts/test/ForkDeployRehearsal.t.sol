// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BPSDeployment} from "../script/BPSDeployment.sol";
import {BPSToken} from "../src/BPSToken.sol";
import {StockAcquisitionVault} from "../src/StockAcquisitionVault.sol";
import {BPSTradeRouter} from "../src/BPSTradeRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IRialtoRouterRegistry} from "../src/interfaces/IRialtoRouterRegistry.sol";

interface FVm {
    function envOr(string calldata name, string calldata defaultValue)
        external
        view
        returns (string memory);
    function createSelectFork(string calldata urlOrAlias) external returns (uint256);
    function getNonce(address account) external view returns (uint64);
}

/// @notice Ephemeral mainnet-fork DEPLOYMENT + immutable-wiring rehearsal of the full BPS stack against
///         the REAL, independently verified Robinhood Chain (4663) external dependencies. It executes the
///         exact production nonce plan from `BPSDeployment` and asserts every predicted address, every
///         immutable authorization relationship (including the coordinator occupying BOTH vault roles),
///         the frozen economics constants, the fixed BPS supply, and that every protocol contract starts
///         with zero balances/allowances. It performs NO Rialto quote (the live acquisition path is
///         proven separately in `RialtoEndToEnd.t.sol` with a local mocked router) and broadcasts nothing.
///
///         The fork runs only when `ROBINHOOD_FORK_RPC` is set (a read-only public RPC); otherwise the
///         test skips so the offline suite stays green. It never manufactures or mutates state at the
///         real Rialto registry, WETH, or Uniswap addresses.
contract ForkDeployRehearsalTest is BPSDeployment {
    FVm internal constant fvm = FVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    // Independently verified externals (see the deployment manifest and Task 7 report).
    address internal constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address internal constant REGISTRY = 0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E;
    address internal constant SWAP_ROUTER_02 = 0xCaf681a66D020601342297493863E78C959E5cb2;
    address internal constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;

    // Verified runtime code hashes (keccak256 of on-chain runtime code) at the verification block.
    bytes32 internal constant WETH_CODEHASH =
        0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353;
    bytes32 internal constant REGISTRY_CODEHASH =
        0xf8b9b92ca74f49f59f66ece51adb02dbefe254dcf967db586c4dda798268a01e;
    bytes32 internal constant SWAP_ROUTER_02_CODEHASH =
        0x6f36c378e272c6324c48f045182bcb54bd8ad654cf9ebd42e8893d52c4cb25dc;

    // Rehearsal-only ephemeral role addresses (never production values).
    address internal constant R_TREASURY = address(0xB0501);
    address internal constant R_OWNER = address(0x0117E9);
    address internal constant R_RESERVE = address(0x5E5E7E);
    address internal constant R_OPERATOR = address(0x0E9A70);
    address internal constant R_PUBLISHER = address(0x9AB115);
    address internal constant R_RECOVERY = address(0x4EC0F9);

    function _true(bool c, string memory m) internal pure {
        require(c, m);
    }

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function testForkDeployRehearsal() public {
        string memory rpc = fvm.envOr("ROBINHOOD_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) {
            return; // no RPC configured -> skip so the offline suite stays green
        }
        fvm.createSelectFork(rpc);

        // 1-3. Fork identity + external dependency verification (code presence + exact code hashes).
        _eq(block.chainid, ROBINHOOD_CHAIN_ID, "fork chainid == 4663");
        _true(WETH.code.length > 0, "WETH has code");
        _true(REGISTRY.code.length > 0, "registry has code");
        _true(SWAP_ROUTER_02.code.length > 0, "swapRouter02 has code");
        _true(AAPL.code.length > 0, "AAPL stock has code");
        _true(WETH.codehash == WETH_CODEHASH, "WETH code hash matches verified");
        _true(REGISTRY.codehash == REGISTRY_CODEHASH, "registry code hash matches verified");
        _true(SWAP_ROUTER_02.codehash == SWAP_ROUTER_02_CODEHASH, "swapRouter02 code hash matches");
        // Current feature-2 router resolves (fail-closed ownerOf) and has code.
        address router = IRialtoRouterRegistry(REGISTRY).ownerOf(2);
        _true(router != address(0) && router.code.length > 0, "feature-2 router live");

        // 4-6. Deploy the entire stack with the exact production nonce plan and assert every prediction
        //      and immutable relationship (done inside _deployAndVerify).
        address[] memory basket = new address[](1);
        basket[0] = AAPL;
        DeployConfig memory cfg = DeployConfig({
            deployer: address(this),
            startNonce: uint256(fvm.getNonce(address(this))),
            weth: WETH,
            rialtoRegistry: REGISTRY,
            swapRouter02: SWAP_ROUTER_02,
            poolFee: 3000, // placeholder tier; the BPS/WETH pool itself is a deployment gate
            bpsRecipient: R_TREASURY,
            protocolOwner: R_OWNER,
            reserveRecipient: R_RESERVE,
            acquisitionOperator: R_OPERATOR,
            rootPublisher: R_PUBLISHER,
            claimRecoveryRecipient: R_RECOVERY,
            stockBasket: basket
        });
        Deployed memory d = _deployAndVerify(cfg);

        // 7. Frozen economics constants on the deployed contracts.
        BPSTradeRouter tr = BPSTradeRouter(payable(d.tradeRouter));
        _eq(tr.BUY_STOCK_BPS(), 200, "buy 2% stock");
        _eq(tr.BUY_BURN_BPS(), 100, "buy 1% burn");
        _eq(tr.SELL_STOCK_BPS(), 200, "sell 2% stock");
        _eq(tr.SELL_BURN_BPS(), 200, "sell 2% burn");
        _eq(tr.BPS_DENOMINATOR(), 10_000, "bps denominator");
        StockAcquisitionVault vault = StockAcquisitionVault(payable(d.stockVault));
        _eq(vault.DISTRIBUTION_PERCENT(), 80, "80% distribution");
        _eq(vault.SPLIT_DENOMINATOR(), 100, "100 split denominator");

        // Fixed supply minted once to the treasury; nothing pre-minted elsewhere.
        BPSToken bps = BPSToken(d.bpsToken);
        _eq(bps.totalSupply(), bps.MAX_SUPPLY(), "fixed supply");
        _eq(bps.balanceOf(R_TREASURY), bps.MAX_SUPPLY(), "supply to treasury");

        // 8-9. Every protocol contract starts with zero token balances and zero deployment allowances.
        _assertZeroBalances(d);
    }

    function _assertZeroBalances(Deployed memory d) internal view {
        address[6] memory holders = [
            d.stockVault,
            d.coordinator,
            d.claimManager,
            d.tradeRouter,
            d.rialtoAdapter,
            d.uniswapAdapter
        ];
        for (uint256 i = 0; i < holders.length; i++) {
            _eq(IERC20(WETH).balanceOf(holders[i]), 0, "zero WETH balance");
            _eq(IERC20(AAPL).balanceOf(holders[i]), 0, "zero stock balance");
            _eq(IERC20(d.bpsToken).balanceOf(holders[i]), 0, "zero BPS balance");
        }
        // No allowances were created during deployment.
        _eq(
            IERC20(WETH).allowance(d.stockVault, d.rialtoAdapter),
            0,
            "vault->adapter WETH allowance 0"
        );
        _eq(
            IERC20(AAPL).allowance(d.coordinator, d.claimManager),
            0,
            "coordinator->manager stock allowance 0"
        );
        _eq(
            IERC20(d.bpsToken).allowance(d.tradeRouter, d.uniswapAdapter),
            0,
            "router->uniAdapter BPS allowance 0"
        );
    }
}
