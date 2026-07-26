// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ChainlinkSettlementPriceGuard} from "../../src/ChainlinkSettlementPriceGuard.sol";
import {GuardedSettlementExecutor} from "../../src/GuardedSettlementExecutor.sol";

/// @title GuardedSettlementConfig
/// @notice Shared, fail-closed configuration + deployment helper for the BPS private-canary guarded
///         settlement stack (TASK 10K-6). Pins the verified Robinhood Chain identities and the
///         conservative canary policy; `validate` reverts on any invalid input; `deployPaused` deploys
///         the Chainlink price guard + the (paused, unconfigured) executor. It NEVER broadcasts, signs,
///         or reads a private key — deployment scripts remain broadcast-free and configuration/unpause is
///         performed by the controller per the runbook. D-24 stands.
library GuardedSettlementConfig {
    uint256 internal constant ROBINHOOD_CHAIN_ID = 4663;
    uint256 internal constant FEATURE_ID = 2;
    address internal constant OFFICIAL_REGISTRY = 0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E;
    address internal constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address internal constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    // Verified official Chainlink Robinhood-mainnet feed proxies (reference-data directory, 2026-07-26).
    address internal constant ETH_USD_FEED = 0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9;
    address internal constant NVDA_USD_FEED = 0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15;
    // Pinned observed feature-2 router runtime code hash (TASK 10K-5 investigation).
    bytes32 internal constant ROUTER_CODE_HASH =
        0xa7041268d6f20802f420b5c71e84a991dc797f27cb474265598b89e43ef27611;
    bytes4 internal constant SETTLEMENT_SELECTOR = 0x77963966;
    uint256 internal constant CANARY_MAX_SELL_WETH = 1_000_000_000_000_000; // 0.001 WETH
    uint256 internal constant ABSOLUTE_CAP_WETH = 10_000_000_000_000_000; // 0.01 WETH (contract ceiling)
    uint16 internal constant MAX_DEVIATION_BPS = 100;
    uint256 internal constant MAX_FEED_AGE_SEC = 900; // 15 minutes (stricter than 86400 heartbeat)
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    struct GSConfig {
        address controller; // final deployed-contract controller/Safe (must have code)
        address sequencerFeed; // OPTIONAL; zero because none is officially published (2026-07-26)
        uint256 sequencerGraceSec; // used only with a sequencer feed
        uint256 maxWethFeedAgeSec; // <= MAX_FEED_AGE_SEC
        uint256 maxNvdaFeedAgeSec; // <= MAX_FEED_AGE_SEC
        uint256 canaryCapWeth; // > 0 and <= CANARY_MAX_SELL_WETH
    }

    error WrongChain(uint256 chainId);
    error ControllerNotContract(address controller);
    error ControllerInvalid(address controller);
    error CapTooHigh(uint256 cap);
    error CapZero();
    error FeedAgeTooHigh(uint256 age);
    error MissingCode(address target);

    /// @notice Fail-closed validation of the full canary configuration + pinned identities.
    function validate(GSConfig memory c) internal view {
        if (block.chainid != ROBINHOOD_CHAIN_ID) revert WrongChain(block.chainid);
        // Controller must be a real deployed contract (no EOA / zero / dead).
        if (c.controller == address(0) || c.controller == DEAD) {
            revert ControllerInvalid(c.controller);
        }
        if (c.controller.code.length == 0) revert ControllerNotContract(c.controller);
        // Pinned externals must have code.
        if (WETH.code.length == 0) revert MissingCode(WETH);
        if (NVDA.code.length == 0) revert MissingCode(NVDA);
        if (ETH_USD_FEED.code.length == 0) revert MissingCode(ETH_USD_FEED);
        if (NVDA_USD_FEED.code.length == 0) revert MissingCode(NVDA_USD_FEED);
        if (OFFICIAL_REGISTRY.code.length == 0) revert MissingCode(OFFICIAL_REGISTRY);
        // Policy bounds.
        if (c.canaryCapWeth == 0) revert CapZero();
        if (c.canaryCapWeth > CANARY_MAX_SELL_WETH) revert CapTooHigh(c.canaryCapWeth);
        if (c.maxWethFeedAgeSec == 0 || c.maxWethFeedAgeSec > MAX_FEED_AGE_SEC) {
            revert FeedAgeTooHigh(c.maxWethFeedAgeSec);
        }
        if (c.maxNvdaFeedAgeSec == 0 || c.maxNvdaFeedAgeSec > MAX_FEED_AGE_SEC) {
            revert FeedAgeTooHigh(c.maxNvdaFeedAgeSec);
        }
    }

    /// @notice Deploy the price guard (immutable-configured) and the executor (paused, unconfigured).
    ///         Callers must configure + unpause AS the controller afterwards. Does not broadcast.
    function deployPaused(GSConfig memory c)
        internal
        returns (ChainlinkSettlementPriceGuard guard, GuardedSettlementExecutor executor)
    {
        validate(c);
        guard = new ChainlinkSettlementPriceGuard(
            WETH,
            NVDA,
            ETH_USD_FEED,
            NVDA_USD_FEED,
            c.sequencerFeed,
            c.sequencerGraceSec,
            c.maxWethFeedAgeSec,
            c.maxNvdaFeedAgeSec
        );
        executor = new GuardedSettlementExecutor(c.controller, WETH, NVDA, OFFICIAL_REGISTRY);
    }
}
