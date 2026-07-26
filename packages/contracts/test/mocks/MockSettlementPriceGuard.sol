// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISettlementPriceGuard} from "../../src/interfaces/ISettlementPriceGuard.sol";

/// @notice Test-only settlement price guard. Reverts when set to reject (models a stale/unapproved/
///         rejecting source) or, when a reference is configured, when the minimum buy amount exceeds the
///         permitted deviation from the trusted reference (floor rounding = conservative ceiling).
///         Test-only; NO production price source is approved (D-22B remains open).
contract MockSettlementPriceGuard is ISettlementPriceGuard {
    bool public accept = true;
    uint256 public refSell;
    uint256 public refBuy;

    error PriceRejected();
    error PriceDeviation();

    function setAccept(bool a) external {
        accept = a;
    }

    function setReference(uint256 sell, uint256 buy) external {
        refSell = sell;
        refBuy = buy;
    }

    function check(
        address,
        address,
        uint256 sellAmount,
        uint256 minBuyAmount,
        uint16 maxDeviationBps
    ) external view {
        if (!accept) revert PriceRejected();
        if (refSell > 0) {
            uint256 refBuyForSell = (refBuy * sellAmount) / refSell;
            uint256 permittedMax = (refBuyForSell * (10_000 + maxDeviationBps)) / 10_000;
            if (minBuyAmount > permittedMax) revert PriceDeviation();
        }
    }
}
