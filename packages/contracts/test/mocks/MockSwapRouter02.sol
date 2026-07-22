// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter02} from "../../src/interfaces/ISwapRouter02.sol";

/// @notice Test-only honest deterministic stand-in for Uniswap `SwapRouter02.exactInputSingle` for the
///         fictional BPS/WETH pair. Pulls exactly `amountIn` of `tokenIn` from the caller (the
///         adapter) via its allowance, computes the output at a fixed integer rate from its own seeded
///         inventory, enforces `amountOutMinimum` (like the real venue), and delivers the output to
///         `recipient`. Holds no allowance/target logic beyond the pair. Test-only; never a production
///         or deployment asset.
contract MockSwapRouter02 is ISwapRouter02 {
    address public immutable bps;
    address public immutable weth;
    uint256 public immutable wethToBpsRate; // BPS out = WETH in * rate
    uint256 public immutable bpsToWethDiv; // WETH out = BPS in / div

    // Recorded params of the most recent call, so tests can prove exactly what the adapter passed.
    address public lastTokenIn;
    address public lastTokenOut;
    uint24 public lastFee;
    address public lastRecipient;
    uint256 public lastAmountIn;
    uint256 public lastAmountOutMinimum;
    uint160 public lastSqrtPriceLimitX96;

    error BadPair();
    error TooLittleReceived();

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

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        lastTokenIn = params.tokenIn;
        lastTokenOut = params.tokenOut;
        lastFee = params.fee;
        lastRecipient = params.recipient;
        lastAmountIn = params.amountIn;
        lastAmountOutMinimum = params.amountOutMinimum;
        lastSqrtPriceLimitX96 = params.sqrtPriceLimitX96;
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        amountOut = quote(params.tokenIn, params.tokenOut, params.amountIn);
        if (amountOut < params.amountOutMinimum) revert TooLittleReceived();
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(params.tokenOut).transfer(params.recipient, amountOut);
    }
}
