// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Test-only honest Rialto allowance-settlement swap-router stand-in. `settle` models the
///         allowance-settlement path Rialto's returned `tx.data` would invoke: it pulls exactly
///         `wethAmountIn` WETH from the caller (the adapter/taker) via the allowance the adapter
///         granted, and delivers `wethAmountIn * rate` of `stockToken` from its own seeded inventory
///         to the caller. The adapter forwards the (unmodified) encoded `settle` call as the quote
///         calldata. Test-only; never a production asset.
contract MockRialtoRouter {
    address public immutable weth;
    uint256 public immutable rate; // stockOut = wethIn * rate

    constructor(address weth_, uint256 rate_) {
        weth = weth_;
        rate = rate_;
    }

    function settle(address stockToken, uint256 wethAmountIn) external returns (uint256 stockOut) {
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(weth).transferFrom(msg.sender, address(this), wethAmountIn);
        stockOut = wethAmountIn * rate;
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(stockToken).transfer(msg.sender, stockOut);
    }
}
