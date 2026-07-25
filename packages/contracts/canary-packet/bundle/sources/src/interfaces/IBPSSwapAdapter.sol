// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IBPSSwapAdapter
/// @notice Narrow swap boundary the router uses for the immutable BPS/WETH pair only. The router
///         binds a single adapter address at construction; callers can never supply a target, pool,
///         path, selector, or calldata. The router pulls the input via an exact, post-use-cleared
///         approval and independently verifies actual balance deltas — it never trusts `amountOut`
///         alone.
/// @dev `swapExactInput` must pull exactly `amountIn` of `tokenIn` from `msg.sender` (the router),
///      deliver the output of `tokenOut` to `recipient`, and return the amount delivered. A lying,
///      short-spending, over/under-reporting, or failing adapter causes the whole trade to revert.
interface IBPSSwapAdapter {
    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumAmountOut,
        address recipient,
        uint256 deadline
    ) external returns (uint256 amountOut);
}
