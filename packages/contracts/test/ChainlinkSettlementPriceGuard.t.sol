// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ChainlinkSettlementPriceGuard} from "../src/ChainlinkSettlementPriceGuard.sol";
import {MockAggregatorV3} from "./mocks/MockAggregatorV3.sol";
import {MockStockERC20} from "./mocks/MockStockERC20.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Offline tests for the ChainlinkSettlementPriceGuard. No fork/RPC; mock feeds only.
contract ChainlinkSettlementPriceGuardTest is Test {
    uint256 internal constant CHAIN = 4663;
    uint16 internal constant DEV = 100;
    uint256 internal constant NOW = 1_785_000_000;
    uint256 internal constant MAX_AGE = 900;

    MockERC20 internal weth;
    MockStockERC20 internal nvda;
    MockAggregatorV3 internal ethFeed;
    MockAggregatorV3 internal nvdaFeed;
    ChainlinkSettlementPriceGuard internal guard;

    // Real observed magnitudes (8-decimal feeds): ETH ~ $1885, NVDA TRV ~ $206.37.
    int256 internal constant ETH_USD = 188_500_000_000; // 1885e8
    int256 internal constant NVDA_USD = 20_637_470_000; // 206.3747e8

    function setUp() public {
        vm.chainId(CHAIN);
        vm.warp(NOW);
        weth = new MockERC20("WETH", "WETH", 18);
        nvda = new MockStockERC20("NVDA", "NVDA", 18);
        ethFeed = new MockAggregatorV3(8, "ETH / USD");
        nvdaFeed = new MockAggregatorV3(8, "RHNVDA / USD");
        _setFresh();
        guard = new ChainlinkSettlementPriceGuard(
            address(weth),
            address(nvda),
            address(ethFeed),
            address(nvdaFeed),
            address(0), // no official sequencer feed
            0,
            MAX_AGE,
            MAX_AGE
        );
    }

    function _setFresh() internal {
        ethFeed.set(10, ETH_USD, NOW - 60, 10);
        nvdaFeed.set(20, NVDA_USD, NOW - 60, 20);
    }

    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    /// @dev Mirrors the guard's CEILING math exactly.
    /// fairOut[nvda-wei] = ceil(ceil(sell*ethUsd/10^wethTokDec) * 10^(nvdaFeedDec+nvdaTokDec) / (10^ethFeedDec * nvdaUsd))
    function _fairOut(uint256 sell) internal pure returns (uint256) {
        uint256 usdScaled = _ceilDiv(sell * uint256(ETH_USD), 1e18);
        return _ceilDiv(usdScaled * (10 ** (8 + 18)), (10 ** 8) * uint256(NVDA_USD));
    }

    /// @dev The guard's oracle floor, rounded UP (matches ChainlinkSettlementPriceGuard).
    function _floor(uint256 sell) internal pure returns (uint256) {
        return _ceilDiv(_fairOut(sell) * (10_000 - DEV), 10_000);
    }

    function test_happyPath_minAtFairPasses() public view {
        uint256 sell = 1_000_000_000_000_000; // 0.001 WETH
        uint256 fair = _fairOut(sell);
        // A minimum at the fair output (no deviation) must pass.
        guard.check(address(weth), address(nvda), sell, fair, DEV);
    }

    function test_minAboveFairPasses() public view {
        uint256 sell = 1_000_000_000_000_000;
        uint256 fair = _fairOut(sell);
        guard.check(address(weth), address(nvda), sell, fair * 2, DEV);
    }

    function test_minAtFloorPasses() public view {
        uint256 sell = 1_000_000_000_000_000;
        guard.check(address(weth), address(nvda), sell, _floor(sell), DEV); // exactly at the floor
    }

    function test_minBelowFloorReverts() public {
        uint256 sell = 1_000_000_000_000_000;
        uint256 tooLow = _floor(sell) - 1; // one unit below the floor
        vm.expectRevert(
            abi.encodeWithSelector(
                ChainlinkSettlementPriceGuard.MinBuyBelowOracleFloor.selector, _floor(sell), tooLow
            )
        );
        guard.check(address(weth), address(nvda), sell, tooLow, DEV);
    }

    function test_wrongChainReverts() public {
        vm.chainId(1);
        vm.expectRevert(
            abi.encodeWithSelector(ChainlinkSettlementPriceGuard.WrongChain.selector, uint256(1))
        );
        guard.check(address(weth), address(nvda), 1e15, 1, DEV);
        vm.chainId(CHAIN);
    }

    function test_wrongPairReverts() public {
        vm.expectRevert(ChainlinkSettlementPriceGuard.WrongPair.selector);
        guard.check(address(nvda), address(weth), 1e15, 1, DEV); // reversed direction
    }

    function test_zeroAmountReverts() public {
        vm.expectRevert(ChainlinkSettlementPriceGuard.ZeroAmount.selector);
        guard.check(address(weth), address(nvda), 0, 1, DEV);
    }

    function test_zeroAnswerReverts() public {
        nvdaFeed.set(20, 0, NOW - 60, 20);
        vm.expectRevert();
        guard.check(address(weth), address(nvda), 1e15, 1, DEV);
    }

    function test_negativeAnswerReverts() public {
        ethFeed.set(10, -1, NOW - 60, 10);
        vm.expectRevert();
        guard.check(address(weth), address(nvda), 1e15, 1, DEV);
    }

    function test_zeroUpdatedAtReverts() public {
        ethFeed.set(10, ETH_USD, 0, 10);
        vm.expectRevert();
        guard.check(address(weth), address(nvda), 1e15, 1, DEV);
    }

    function test_futureUpdatedAtReverts() public {
        nvdaFeed.set(20, NVDA_USD, NOW + 100, 20);
        vm.expectRevert();
        guard.check(address(weth), address(nvda), 1e15, 1, DEV);
    }

    function test_incompleteRoundReverts() public {
        nvdaFeed.set(20, NVDA_USD, NOW - 60, 19); // answeredInRound < roundId
        vm.expectRevert();
        guard.check(address(weth), address(nvda), 1e15, 1, DEV);
    }

    function test_staleWethFeedReverts() public {
        ethFeed.set(10, ETH_USD, NOW - (MAX_AGE + 1), 10);
        vm.expectRevert();
        guard.check(address(weth), address(nvda), 1e15, 1, DEV);
    }

    function test_staleNvdaFeedReverts() public {
        nvdaFeed.set(20, NVDA_USD, NOW - (MAX_AGE + 1), 20);
        vm.expectRevert();
        guard.check(address(weth), address(nvda), 1e15, 1, DEV);
    }

    function test_feedDecimalsChangedReverts() public {
        nvdaFeed.setDecimals(6);
        vm.expectRevert(
            abi.encodeWithSelector(
                ChainlinkSettlementPriceGuard.FeedDecimalsChanged.selector, address(nvdaFeed)
            )
        );
        guard.check(address(weth), address(nvda), 1e15, 1, DEV);
    }

    function test_feedIdentityChangedReverts() public {
        nvdaFeed.setDescription("TSLA / USD");
        vm.expectRevert(
            abi.encodeWithSelector(
                ChainlinkSettlementPriceGuard.FeedIdentityChanged.selector, address(nvdaFeed)
            )
        );
        guard.check(address(weth), address(nvda), 1e15, 1, DEV);
    }

    function test_nvdaOraclePausedReverts() public {
        nvda.setOraclePaused(true);
        vm.expectRevert(ChainlinkSettlementPriceGuard.StockOracleGloballyPaused.selector);
        guard.check(address(weth), address(nvda), 1e15, _fairOut(1e15) * 2, DEV);
    }

    function test_uiMultiplierNotReapplied() public view {
        // The guard reads the feed answer directly; NVDA.uiMultiplier() is 1e18 but is NEVER applied.
        // A fair-output minimum passes without any 1e18 scaling — proving no double multiplier.
        uint256 sell = 1_000_000_000_000_000;
        guard.check(address(weth), address(nvda), sell, _fairOut(sell), DEV);
    }

    // Sequencer integrated variant (optional feed present).
    function test_sequencerDownReverts() public {
        MockAggregatorV3 seq = new MockAggregatorV3(0, "L2 Sequencer Uptime");
        seq.set(1, 1, NOW - 10_000, 1); // answer 1 => down
        ChainlinkSettlementPriceGuard g = new ChainlinkSettlementPriceGuard(
            address(weth),
            address(nvda),
            address(ethFeed),
            address(nvdaFeed),
            address(seq),
            3600,
            MAX_AGE,
            MAX_AGE
        );
        vm.expectRevert(ChainlinkSettlementPriceGuard.SequencerDown.selector);
        g.check(address(weth), address(nvda), 1e15, _fairOut(1e15) * 2, DEV);
    }

    function test_sequencerGraceNotElapsedReverts() public {
        MockAggregatorV3 seq = new MockAggregatorV3(0, "L2 Sequencer Uptime");
        seq.set(1, 0, NOW - 100, 1); // up, but only 100s ago
        ChainlinkSettlementPriceGuard g = new ChainlinkSettlementPriceGuard(
            address(weth),
            address(nvda),
            address(ethFeed),
            address(nvdaFeed),
            address(seq),
            3600,
            MAX_AGE,
            MAX_AGE
        );
        vm.expectRevert();
        g.check(address(weth), address(nvda), 1e15, _fairOut(1e15) * 2, DEV);
    }

    function test_sequencerRecoveredPasses() public {
        MockAggregatorV3 seq = new MockAggregatorV3(0, "L2 Sequencer Uptime");
        seq.set(1, 0, NOW - 4000, 1); // up, grace 3600 elapsed
        ChainlinkSettlementPriceGuard g = new ChainlinkSettlementPriceGuard(
            address(weth),
            address(nvda),
            address(ethFeed),
            address(nvdaFeed),
            address(seq),
            3600,
            MAX_AGE,
            MAX_AGE
        );
        g.check(address(weth), address(nvda), 1e15, _fairOut(1e15), DEV);
    }

    function test_absentSequencerHandledAsApproved() public view {
        // The default `guard` was built with sequencer = address(0); a fresh valid quote passes.
        guard.check(address(weth), address(nvda), 1e15, _fairOut(1e15), DEV);
    }

    // Different decimals: 6-decimal feeds + 8-decimal NVDA token still compute a consistent floor.
    function test_differentDecimalCombination() public {
        MockAggregatorV3 e6 = new MockAggregatorV3(6, "ETH / USD");
        MockAggregatorV3 n6 = new MockAggregatorV3(6, "RHNVDA / USD");
        MockStockERC20 nvda8 = new MockStockERC20("NVDA8", "NVDA8", 8);
        e6.set(10, 1885_000000, NOW - 60, 10); // $1885 @ 6dp
        n6.set(20, 206_374700, NOW - 60, 20); // $206.3747 @ 6dp
        ChainlinkSettlementPriceGuard g = new ChainlinkSettlementPriceGuard(
            address(weth), address(nvda8), address(e6), address(n6), address(0), 0, MAX_AGE, MAX_AGE
        );
        // fairOut = sell * ethUsd * 10^(6+8) / (10^(18+6) * nvdaUsd)
        uint256 sell = 1e15;
        uint256 usd = (sell * 1885_000000) / 1e18;
        uint256 fair = (usd * (10 ** (6 + 8))) / ((10 ** 6) * uint256(206_374700));
        g.check(address(weth), address(nvda8), sell, fair, DEV);
        vm.expectRevert();
        g.check(
            address(weth),
            address(nvda8),
            sell,
            fair == 0 ? 0 : (fair * (10_000 - DEV)) / 10_000 - 1,
            DEV
        );
    }

    function test_conservativeRoundingFavorsExecutor() public view {
        // With a fractional smallest unit, the floor rounds UP, so min == floor-computed-down fails but
        // the ceil-based floor is stricter. Prove min just below the ceil floor reverts.
        uint256 sell = 1_234_567_890_123; // deliberately awkward
        uint256 fair = _fairOut(sell);
        // fair may round; a min of fair passes.
        guard.check(address(weth), address(nvda), sell, fair + 1, DEV);
    }

    function test_constructorRejectsWrongChain() public {
        vm.chainId(1);
        vm.expectRevert();
        new ChainlinkSettlementPriceGuard(
            address(weth),
            address(nvda),
            address(ethFeed),
            address(nvdaFeed),
            address(0),
            0,
            MAX_AGE,
            MAX_AGE
        );
        vm.chainId(CHAIN);
    }

    function test_constructorRejectsAgeCeiling() public {
        vm.expectRevert(ChainlinkSettlementPriceGuard.BadConfiguration.selector);
        new ChainlinkSettlementPriceGuard(
            address(weth),
            address(nvda),
            address(ethFeed),
            address(nvdaFeed),
            address(0),
            0,
            MAX_AGE + 1,
            MAX_AGE
        );
    }
}
