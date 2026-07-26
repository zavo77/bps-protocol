// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {GuardedSettlementConfig} from "../script/settlement/GuardedSettlementConfig.sol";
import {ChainlinkSettlementPriceGuard} from "../src/ChainlinkSettlementPriceGuard.sol";
import {GuardedSettlementExecutor} from "../src/GuardedSettlementExecutor.sol";
import {IGuardedSettlementExecutor} from "../src/interfaces/IGuardedSettlementExecutor.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockStockERC20} from "./mocks/MockStockERC20.sol";
import {MockAggregatorV3} from "./mocks/MockAggregatorV3.sol";
import {MockRialtoRouterRegistry} from "./mocks/MockRialtoRouterRegistry.sol";
import {MockGuardedRouter} from "./mocks/MockGuardedRouter.sol";

/// @notice Offline deployment-config validation + full local lifecycle rehearsal (TASK 10K-6). Etches
///         mock code at the pinned official addresses so the config library's pinned identities are
///         exercised without any fork/RPC. No broadcast, no signing.
contract GuardedSettlementDeployTest is Test {
    using GuardedSettlementConfig for GuardedSettlementConfig.GSConfig;

    address internal constant WETH = GuardedSettlementConfig.WETH;
    address internal constant NVDA = GuardedSettlementConfig.NVDA;
    address internal constant ETHF = GuardedSettlementConfig.ETH_USD_FEED;
    address internal constant NVDAF = GuardedSettlementConfig.NVDA_USD_FEED;
    address internal constant REG = GuardedSettlementConfig.OFFICIAL_REGISTRY;
    uint256 internal constant NOW = 1_785_000_000;
    int256 internal constant ETH_USD = 188_500_000_000;
    int256 internal constant NVDA_USD = 20_637_470_000;

    MockRialtoRouterRegistry internal controllerContract; // any deployed contract as controller

    function setUp() public {
        vm.chainId(4663);
        vm.warp(NOW);
        // Etch mock code at the pinned official addresses.
        vm.etch(WETH, address(new MockERC20("WETH", "WETH", 18)).code);
        vm.etch(NVDA, address(new MockStockERC20("NVDA", "NVDA", 18)).code);
        vm.etch(ETHF, address(new MockAggregatorV3(8, "ETH / USD")).code);
        vm.etch(NVDAF, address(new MockAggregatorV3(8, "RHNVDA / USD")).code);
        vm.etch(REG, address(new MockRialtoRouterRegistry()).code);
        // Feed storage (decimals/description/rounds) must be set post-etch.
        MockAggregatorV3(ETHF).setDecimals(8);
        MockAggregatorV3(ETHF).setDescription("ETH / USD");
        MockAggregatorV3(ETHF).set(10, ETH_USD, NOW - 60, 10);
        MockAggregatorV3(NVDAF).setDecimals(8);
        MockAggregatorV3(NVDAF).setDescription("RHNVDA / USD");
        MockAggregatorV3(NVDAF).set(20, NVDA_USD, NOW - 60, 20);
        controllerContract = new MockRialtoRouterRegistry();
    }

    function _cfg() internal view returns (GuardedSettlementConfig.GSConfig memory) {
        return GuardedSettlementConfig.GSConfig({
            controller: address(controllerContract),
            sequencerFeed: address(0),
            sequencerGraceSec: 0,
            maxWethFeedAgeSec: 900,
            maxNvdaFeedAgeSec: 900,
            canaryCapWeth: 1_000_000_000_000_000
        });
    }

    // ---- config validation ----
    // `validate` is an internal library fn; wrap it in an external call so `vm.expectRevert` sees the
    // revert at a lower call depth than the cheatcode.

    function validateExt(GuardedSettlementConfig.GSConfig memory c) external view {
        GuardedSettlementConfig.validate(c);
    }

    function test_validate_happy() public view {
        GuardedSettlementConfig.validate(_cfg());
    }

    function test_validate_rejectsEoaController() public {
        GuardedSettlementConfig.GSConfig memory c = _cfg();
        c.controller = address(0xE0A); // no code
        vm.expectRevert(
            abi.encodeWithSelector(
                GuardedSettlementConfig.ControllerNotContract.selector, address(0xE0A)
            )
        );
        this.validateExt(c);
    }

    function test_validate_rejectsZeroAndDeadController() public {
        GuardedSettlementConfig.GSConfig memory c = _cfg();
        c.controller = address(0);
        vm.expectRevert(
            abi.encodeWithSelector(GuardedSettlementConfig.ControllerInvalid.selector, address(0))
        );
        this.validateExt(c);
        c.controller = 0x000000000000000000000000000000000000dEaD;
        vm.expectRevert(
            abi.encodeWithSelector(
                GuardedSettlementConfig.ControllerInvalid.selector,
                0x000000000000000000000000000000000000dEaD
            )
        );
        this.validateExt(c);
    }

    function test_validate_rejectsCapAboveCanaryCeiling() public {
        GuardedSettlementConfig.GSConfig memory c = _cfg();
        c.canaryCapWeth = 1_000_000_000_000_000 + 1; // > 0.001 WETH
        vm.expectRevert(
            abi.encodeWithSelector(GuardedSettlementConfig.CapTooHigh.selector, c.canaryCapWeth)
        );
        this.validateExt(c);
    }

    function test_validate_rejectsZeroCap() public {
        GuardedSettlementConfig.GSConfig memory c = _cfg();
        c.canaryCapWeth = 0;
        vm.expectRevert(GuardedSettlementConfig.CapZero.selector);
        this.validateExt(c);
    }

    function test_validate_rejectsFeedAgeAboveCeiling() public {
        GuardedSettlementConfig.GSConfig memory c = _cfg();
        c.maxWethFeedAgeSec = 901;
        vm.expectRevert(
            abi.encodeWithSelector(GuardedSettlementConfig.FeedAgeTooHigh.selector, uint256(901))
        );
        this.validateExt(c);
    }

    function test_validate_rejectsWrongChain() public {
        vm.chainId(1);
        vm.expectRevert(
            abi.encodeWithSelector(GuardedSettlementConfig.WrongChain.selector, uint256(1))
        );
        this.validateExt(_cfg());
        vm.chainId(4663);
    }

    // ---- deployPaused ----

    function test_deployPaused_startsPausedWithPinnedIdentities() public {
        (ChainlinkSettlementPriceGuard guard, GuardedSettlementExecutor executor) =
            GuardedSettlementConfig.deployPaused(_cfg());
        assertTrue(executor.paused());
        assertEq(executor.owner(), address(controllerContract));
        assertEq(executor.weth(), WETH);
        assertEq(executor.stockToken(), NVDA);
        assertEq(executor.registry(), REG);
        assertEq(address(guard.wethUsdFeed()), ETHF);
        assertEq(address(guard.nvdaUsdFeed()), NVDAF);
        assertEq(address(guard.sequencerUptimeFeed()), address(0)); // none official
        assertEq(guard.wethFeedDescriptionHash(), keccak256(bytes("ETH / USD")));
        assertEq(guard.nvdaFeedDescriptionHash(), keccak256(bytes("RHNVDA / USD")));
    }

    // ---- full local lifecycle rehearsal ----

    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    function _floor(uint256 sell) internal pure returns (uint256) {
        uint256 usd = _ceilDiv(sell * uint256(ETH_USD), 1e18);
        uint256 fair = _ceilDiv(usd * (10 ** (8 + 18)), (10 ** 8) * uint256(NVDA_USD));
        return _ceilDiv(fair * (10_000 - 100), 10_000);
    }

    function test_rehearsal_fullLifecycle() public {
        // Deploy guard + executor (controller = this so the rehearsal can configure).
        GuardedSettlementConfig.GSConfig memory c = _cfg();
        c.controller = address(this);
        (ChainlinkSettlementPriceGuard guard, GuardedSettlementExecutor executor) =
            GuardedSettlementConfig.deployPaused(c);
        assertTrue(executor.paused()); // (3) starts paused

        // The feature-2 router (mock) + funding.
        MockGuardedRouter router = new MockGuardedRouter(WETH, NVDA);
        MockRialtoRouterRegistry(REG).setOwner(2, address(router));
        MockERC20(WETH).mint(address(executor), 1e18);
        MockStockERC20(NVDA).mint(address(router), 1000e18);
        bytes4 selector = MockGuardedRouter.guardedSettle.selector;

        // (4) configure + (controller gate) unpause.
        executor.setTokenPairAllowed(WETH, NVDA, true);
        executor.setMaxSellAmount(WETH, 1_000_000_000_000_000); // 0.001 WETH cap
        executor.setPriceGuard(address(guard));
        executor.setApprovedRouterCode(address(router).codehash, selector);
        executor.unpause();
        assertFalse(executor.paused());

        // (5) fresh-feed successful settlement returning the expected NVDA delta.
        uint256 sell = 1_000_000_000_000_000; // 0.001 WETH
        uint256 minBuy = _floor(sell); // exactly the Chainlink oracle floor
        IGuardedSettlementExecutor.SettlementParams memory p =
            _params(executor, router, selector, sell, minBuy, 1);
        uint256 received = executor.executeSettlement(p);
        assertEq(received, minBuy);
        assertEq(MockStockERC20(NVDA).balanceOf(address(executor)), minBuy);
        assertEq(MockERC20(WETH).allowance(address(executor), address(router)), 0);

        // (6) stale-feed failure rehearsal.
        MockAggregatorV3(NVDAF).set(21, NVDA_USD, NOW - 1000, 21); // stale
        IGuardedSettlementExecutor.SettlementParams memory p2 =
            _params(executor, router, selector, sell, minBuy, 2);
        vm.expectRevert();
        executor.executeSettlement(p2);
        // (8) failure leaves no residual approval or consumed replay state.
        assertEq(MockERC20(WETH).allowance(address(executor), address(router)), 0);
        assertFalse(executor.isDigestConsumed(p2.intentDigest));
        assertFalse(executor.isNonceUsed(2));

        // (4) controller transition rehearsal (two-step).
        address next = address(new MockRialtoRouterRegistry());
        executor.transferOwnership(next);
        assertEq(executor.pendingOwner(), next);
        vm.prank(next);
        executor.acceptOwnership();
        assertEq(executor.owner(), next);
    }

    function _params(
        GuardedSettlementExecutor executor,
        MockGuardedRouter router,
        bytes4 selector,
        uint256 sell,
        uint256 minBuy,
        uint256 nonce
    ) internal view returns (IGuardedSettlementExecutor.SettlementParams memory p) {
        p.sellToken = WETH;
        p.buyToken = NVDA;
        p.sellAmount = sell;
        p.minBuyAmount = minBuy;
        p.target = address(router);
        p.selector = selector;
        p.callData = abi.encodeWithSelector(
            selector, WETH, NVDA, sell, minBuy, address(executor), uint16(5), uint16(0)
        );
        p.platformFeeBps = 5;
        p.integratorFeePresent = false;
        p.slippageBps = 50;
        p.nonce = nonce;
        p.deadline = block.timestamp + 100;
        p.calldataHash = keccak256(p.callData);
        IGuardedSettlementExecutor.DigestInput memory d = IGuardedSettlementExecutor.DigestInput({
            domain: keccak256("BPS-GUARDED-SETTLEMENT/1"),
            chainId: 4663,
            executor: address(executor),
            registryAddr: REG,
            featureId: 2,
            target: address(router),
            selector: selector,
            sellToken: WETH,
            buyToken: NVDA,
            sellAmount: sell,
            minBuyAmount: minBuy,
            platformFeeBps: 5,
            slippageBps: 50,
            taker: address(executor),
            nonce: nonce,
            deadline: block.timestamp + 100,
            calldataHash: p.calldataHash
        });
        p.intentDigest = executor.computeIntentDigest(d);
    }
}
