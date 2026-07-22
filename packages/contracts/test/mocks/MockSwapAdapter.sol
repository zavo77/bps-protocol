// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IBPSSwapAdapter} from "../../src/interfaces/IBPSSwapAdapter.sol";

/// @notice Test-only honest deterministic swap adapter for the fictional BPS/WETH pair with seeded
///         local liquidity and fixed integer exchange rates. Pulls exactly `amountIn` of `tokenIn`
///         from the caller (the router) and delivers the exact computed output of `tokenOut` to
///         `recipient`. Test-only; never a production or deployment asset.
contract MockSwapAdapter is IBPSSwapAdapter {
    address public immutable bps;
    address public immutable weth;
    uint256 public immutable wethToBpsRate; // BPS out = WETH in * rate
    uint256 public immutable bpsToWethDiv; // WETH out = BPS in / div

    error BadPair();
    error MinOut();

    constructor(address bps_, address weth_, uint256 wethToBpsRate_, uint256 bpsToWethDiv_) {
        bps = bps_;
        weth = weth_;
        wethToBpsRate = wethToBpsRate_;
        bpsToWethDiv = bpsToWethDiv_;
    }

    function quote(address tokenIn, address tokenOut, uint256 amountIn)
        public
        view
        returns (uint256)
    {
        if (tokenIn == weth && tokenOut == bps) return amountIn * wethToBpsRate;
        if (tokenIn == bps && tokenOut == weth) return amountIn / bpsToWethDiv;
        revert BadPair();
    }

    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumAmountOut,
        address recipient,
        uint256 /* deadline */
    ) external returns (uint256 amountOut) {
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        amountOut = quote(tokenIn, tokenOut, amountIn);
        if (amountOut < minimumAmountOut) revert MinOut();
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(tokenOut).transfer(recipient, amountOut);
    }
}
