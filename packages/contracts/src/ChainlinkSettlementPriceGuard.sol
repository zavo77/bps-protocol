// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ISettlementPriceGuard} from "./interfaces/ISettlementPriceGuard.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {IStockTokenOracleState} from "./interfaces/IStockTokenOracleState.sol";

/// @title ChainlinkSettlementPriceGuard
/// @notice Production-shaped settlement price guard for the BPS private canary (TASK 10K-6): validates a
///         WETH -> NVDA settlement's minimum output against Robinhood Chain's NATIVE Chainlink feeds —
///         ETH/USD (the official feed used to price the canonical 1:1 WETH per Robinhood's docs and the
///         founder's D-11 conditional mapping) and the Robinhood NVDA Stock Token Total Return Value/USD
///         feed ("RHNVDA / USD"), which is ALREADY multiplier-adjusted: `uiMultiplier()` is NEVER
///         re-applied here.
/// @dev Fail-closed everywhere: wrong chain, wrong pair/direction, zero amounts, codeless feeds, zero/
///      negative answers, zero or future `updatedAt`, incomplete rounds (`answeredInRound < roundId`),
///      stale feeds (strict per-feed maximum ages, ceiling 15 minutes — deliberately far stricter than
///      the published 86400 s heartbeat; when the 24/5 stock feed stops updating on weekends/closures,
///      settlement is simply UNAVAILABLE until fresh rounds publish), changed feed decimals or
///      description identity, NVDA `oraclePaused()`, and any minimum output below the oracle floor.
///      NO Robinhood Chain sequencer uptime feed is published in the official Chainlink directory at
///      build time (verified 2026-07-26); the constructor therefore accepts an OPTIONAL sequencer feed
///      (zero = officially absent, recorded honestly) and the strict dual-feed freshness window is the
///      documented mitigation: transactions cannot execute while the sequencer is down, so stale feeds
///      block post-recovery execution until new rounds publish. Integer-only full-precision math via the
///      audited OpenZeppelin `Math.mulDiv`, with CEILING rounding on the fair output and the floor so
///      rounding always favors the executor. Emits nothing and never sees calldata or quote ids.
///      Deploying/configuring this contract authorizes no execution — D-24 stands.
contract ChainlinkSettlementPriceGuard is ISettlementPriceGuard {
    uint256 public constant ROBINHOOD_CHAIN_ID = 4663;
    /// @notice Hard ceiling on any configured per-feed maximum age (15 minutes).
    uint256 public constant MAX_FEED_AGE_CEILING_SEC = 900;
    /// @notice Hard ceiling on the accepted deviation parameter (100 bps).
    uint16 public constant MAX_DEVIATION_CEILING_BPS = 100;

    address public immutable wethToken;
    address public immutable nvdaToken;
    AggregatorV3Interface public immutable wethUsdFeed; // official ETH/USD proxy (prices canonical WETH)
    AggregatorV3Interface public immutable nvdaUsdFeed; // official RHNVDA/USD Total Return Value proxy
    /// @notice Optional sequencer uptime feed. ZERO because none is officially published (recorded).
    AggregatorV3Interface public immutable sequencerUptimeFeed;
    uint256 public immutable sequencerRecoveryGraceSec;
    uint256 public immutable maxWethFeedAgeSec;
    uint256 public immutable maxNvdaFeedAgeSec;
    uint8 public immutable wethFeedDecimals;
    uint8 public immutable nvdaFeedDecimals;
    uint8 public immutable wethTokenDecimals;
    uint8 public immutable nvdaTokenDecimals;
    bytes32 public immutable wethFeedDescriptionHash; // keccak256("ETH / USD")
    bytes32 public immutable nvdaFeedDescriptionHash; // keccak256("RHNVDA / USD")

    error WrongChain(uint256 chainId);
    error ZeroAddress();
    error NotAContract(address target);
    error BadConfiguration();
    error WrongPair();
    error ZeroAmount();
    error FeedDecimalsChanged(address feed);
    error FeedIdentityChanged(address feed);
    error InvalidAnswer(address feed, int256 answer);
    error InvalidTimestamp(address feed, uint256 updatedAt);
    error IncompleteRound(address feed);
    error StaleFeed(address feed, uint256 age, uint256 maxAge);
    error StockOracleGloballyPaused();
    error SequencerDown();
    error SequencerGraceNotElapsed(uint256 sinceUp, uint256 grace);
    error MinBuyBelowOracleFloor(uint256 floorAmount, uint256 minBuyAmount);

    /// @param wethToken_ Canonical WETH (18 decimals; verified at construction).
    /// @param nvdaToken_ NVDA Stock Token (18 decimals; must expose `oraclePaused()`).
    /// @param wethUsdFeed_ Official ETH/USD proxy (verified description + decimals).
    /// @param nvdaUsdFeed_ Official RHNVDA/USD Total Return Value proxy (verified description+decimals).
    /// @param sequencerUptimeFeed_ OPTIONAL sequencer uptime feed; MUST be zero while none is officially
    ///        published (passing a nonzero address requires it to have code).
    /// @param sequencerRecoveryGraceSec_ Post-recovery grace period (only used with a sequencer feed).
    /// @param maxWethFeedAgeSec_ Strict ETH/USD maximum age (0 < age <= 900).
    /// @param maxNvdaFeedAgeSec_ Strict RHNVDA/USD maximum age (0 < age <= 900).
    constructor(
        address wethToken_,
        address nvdaToken_,
        address wethUsdFeed_,
        address nvdaUsdFeed_,
        address sequencerUptimeFeed_,
        uint256 sequencerRecoveryGraceSec_,
        uint256 maxWethFeedAgeSec_,
        uint256 maxNvdaFeedAgeSec_
    ) {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.chainid != ROBINHOOD_CHAIN_ID) revert WrongChain(block.chainid);
        if (
            wethToken_ == address(0) || nvdaToken_ == address(0) || wethUsdFeed_ == address(0)
                || nvdaUsdFeed_ == address(0)
        ) revert ZeroAddress();
        if (wethToken_.code.length == 0) revert NotAContract(wethToken_);
        if (nvdaToken_.code.length == 0) revert NotAContract(nvdaToken_);
        if (wethUsdFeed_.code.length == 0) revert NotAContract(wethUsdFeed_);
        if (nvdaUsdFeed_.code.length == 0) revert NotAContract(nvdaUsdFeed_);
        if (sequencerUptimeFeed_ != address(0) && sequencerUptimeFeed_.code.length == 0) {
            revert NotAContract(sequencerUptimeFeed_);
        }
        if (
            maxWethFeedAgeSec_ == 0 || maxWethFeedAgeSec_ > MAX_FEED_AGE_CEILING_SEC
                || maxNvdaFeedAgeSec_ == 0 || maxNvdaFeedAgeSec_ > MAX_FEED_AGE_CEILING_SEC
        ) revert BadConfiguration();
        if (
            wethToken_ == nvdaToken_ || wethUsdFeed_ == nvdaUsdFeed_ || wethToken_ == wethUsdFeed_
                || nvdaToken_ == nvdaUsdFeed_
        ) revert BadConfiguration();

        wethToken = wethToken_;
        nvdaToken = nvdaToken_;
        wethUsdFeed = AggregatorV3Interface(wethUsdFeed_);
        nvdaUsdFeed = AggregatorV3Interface(nvdaUsdFeed_);
        sequencerUptimeFeed = AggregatorV3Interface(sequencerUptimeFeed_);
        sequencerRecoveryGraceSec = sequencerRecoveryGraceSec_;
        maxWethFeedAgeSec = maxWethFeedAgeSec_;
        maxNvdaFeedAgeSec = maxNvdaFeedAgeSec_;

        // Pin the observed feed + token identities at construction; every check re-verifies them.
        wethFeedDecimals = AggregatorV3Interface(wethUsdFeed_).decimals();
        nvdaFeedDecimals = AggregatorV3Interface(nvdaUsdFeed_).decimals();
        wethTokenDecimals = IERC20Metadata(wethToken_).decimals();
        nvdaTokenDecimals = IERC20Metadata(nvdaToken_).decimals();
        wethFeedDescriptionHash =
            keccak256(bytes(AggregatorV3Interface(wethUsdFeed_).description()));
        nvdaFeedDescriptionHash =
            keccak256(bytes(AggregatorV3Interface(nvdaUsdFeed_).description()));
        if (wethFeedDecimals == 0 || wethFeedDecimals > 18) revert BadConfiguration();
        if (nvdaFeedDecimals == 0 || nvdaFeedDecimals > 18) revert BadConfiguration();
        if (wethTokenDecimals == 0 || wethTokenDecimals > 18) revert BadConfiguration();
        if (nvdaTokenDecimals == 0 || nvdaTokenDecimals > 18) revert BadConfiguration();
        // NVDA must actually expose oraclePaused() (reverts here otherwise).
        IStockTokenOracleState(nvdaToken_).oraclePaused();
    }

    /// @inheritdoc ISettlementPriceGuard
    /// @dev Reverts unless `minBuyAmount` is at least the Chainlink-derived fair output reduced by AT
    ///      MOST `min(maxDeviationBps, 100)` bps. All rounding favors the executor (ceiling on the fair
    ///      output and on the floor). The NVDA feed is Total Return Value — `uiMultiplier()` is NOT
    ///      re-applied. A minimum ABOVE the floor is accepted (the router simply reverts if it cannot
    ///      deliver it); a minimum BELOW the floor reverts here, before any allowance or router call.
    function check(
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 minBuyAmount,
        uint16 maxDeviationBps
    ) external view {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.chainid != ROBINHOOD_CHAIN_ID) revert WrongChain(block.chainid);
        if (sellToken != wethToken || buyToken != nvdaToken) revert WrongPair();
        if (sellAmount == 0 || minBuyAmount == 0) revert ZeroAmount();

        _checkSequencer();
        if (IStockTokenOracleState(nvdaToken).oraclePaused()) revert StockOracleGloballyPaused();

        uint256 wethUsd = _readFreshAnswer(
            wethUsdFeed, wethFeedDecimals, wethFeedDescriptionHash, maxWethFeedAgeSec
        );
        uint256 nvdaUsd = _readFreshAnswer(
            nvdaUsdFeed, nvdaFeedDecimals, nvdaFeedDescriptionHash, maxNvdaFeedAgeSec
        );

        // fairOut[nvda-wei] = sell[weth-wei] * P_weth * 10^(nvdaFeedDec + nvdaTokenDec)
        //                     / (10^(wethTokenDec + wethFeedDec) * P_nvda)
        // computed as two full-precision mulDivs with CEILING rounding (favors the executor).
        uint256 usdScaled =
            Math.mulDiv(sellAmount, wethUsd, 10 ** wethTokenDecimals, Math.Rounding.Ceil); // USD * 10^wethFeedDec
        uint256 fairOut = Math.mulDiv(
            usdScaled,
            10 ** (uint256(nvdaFeedDecimals) + uint256(nvdaTokenDecimals)),
            (10 ** wethFeedDecimals) * nvdaUsd,
            Math.Rounding.Ceil
        );

        uint16 dev = maxDeviationBps < MAX_DEVIATION_CEILING_BPS
            ? maxDeviationBps
            : MAX_DEVIATION_CEILING_BPS;
        // Oracle floor, rounded UP: any fractional smallest unit raises the requirement.
        uint256 floorAmount = Math.mulDiv(fairOut, 10_000 - dev, 10_000, Math.Rounding.Ceil);
        if (minBuyAmount < floorAmount) revert MinBuyBelowOracleFloor(floorAmount, minBuyAmount);
    }

    /// @dev Validate one feed's identity + round completely, returning the positive answer as uint256.
    function _readFreshAnswer(
        AggregatorV3Interface feed,
        uint8 expectedDecimals,
        bytes32 expectedDescriptionHash,
        uint256 maxAge
    ) internal view returns (uint256) {
        // Identity re-checks catch a proxy whose underlying aggregator was rotated to a different feed.
        if (feed.decimals() != expectedDecimals) revert FeedDecimalsChanged(address(feed));
        if (keccak256(bytes(feed.description())) != expectedDescriptionHash) {
            revert FeedIdentityChanged(address(feed));
        }
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            feed.latestRoundData();
        if (roundId == 0) revert IncompleteRound(address(feed));
        if (answer <= 0) revert InvalidAnswer(address(feed), answer);
        if (updatedAt == 0) revert InvalidTimestamp(address(feed), updatedAt);
        // forge-lint: disable-next-line(block-timestamp)
        if (updatedAt > block.timestamp) revert InvalidTimestamp(address(feed), updatedAt);
        if (answeredInRound < roundId) revert IncompleteRound(address(feed));
        // forge-lint: disable-next-line(block-timestamp)
        uint256 age = block.timestamp - updatedAt;
        if (age > maxAge) revert StaleFeed(address(feed), age, maxAge);
        // casting to 'uint256' is safe because `answer <= 0` already reverted above.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(answer);
    }

    /// @dev Sequencer uptime check — active ONLY when an officially published feed is configured.
    function _checkSequencer() internal view {
        if (address(sequencerUptimeFeed) == address(0)) return; // officially absent (recorded)
        (, int256 answer, uint256 startedAt,,) = sequencerUptimeFeed.latestRoundData();
        if (answer != 0) revert SequencerDown(); // per Chainlink semantics: 0 = up, 1 = down
        // forge-lint: disable-next-line(block-timestamp)
        uint256 sinceUp = block.timestamp - startedAt;
        if (sinceUp < sequencerRecoveryGraceSec) {
            revert SequencerGraceNotElapsed(sinceUp, sequencerRecoveryGraceSec);
        }
    }
}
