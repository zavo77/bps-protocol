// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ISwapRouter02 (minimal)
/// @notice The single Uniswap SwapRouter02 function and struct the BPS adapter needs — hand-written to
///         match the deployed `SwapRouter02` (`IV3SwapRouter`) ABI exactly, with no broad Uniswap
///         dependency and no copied implementation. Deliberately excludes Universal Router commands,
///         `multicall`, Permit2, v2 swaps, exact-output, and multi-hop functions.
/// @dev Note vs. v3-periphery `ISwapRouter`: SwapRouter02's `ExactInputSingleParams` has **no
///      `deadline` field** (SwapRouter02 exposes deadline only through its `multicall(uint256
///      deadline, bytes[])` wrapper). The BPS adapter therefore enforces the deadline itself before
///      calling this. `exactInputSingle` is `payable` in the deployed ABI; the adapter calls it with
///      zero value. Recipient sentinels in this SwapRouter02: `address(1)` = msg.sender,
///      `address(2)` = the router itself — the adapter rejects both (and `address(0)`).
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}
