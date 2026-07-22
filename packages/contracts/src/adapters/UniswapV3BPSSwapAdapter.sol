// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IBPSSwapAdapter} from "../interfaces/IBPSSwapAdapter.sol";
import {ISwapRouter02} from "../interfaces/ISwapRouter02.sol";

/// @title UniswapV3BPSSwapAdapter
/// @notice The production `IBPSSwapAdapter` for BPS v1: a narrow, non-upgradeable adapter that routes
///         the frozen `BPSTradeRouter`'s BPS↔WETH legs through exactly one Uniswap v3 pool via a
///         single `SwapRouter02.exactInputSingle` call. Everything is immutable — the calling router,
///         the BPS/WETH pair, the SwapRouter02 target, and the pool fee tier. There is no arbitrary
///         path, calldata, target, or fee; no owner, setter, pause, sweep, rescue, withdrawal,
///         delegatecall, proxy, or upgrade; and no multi-hop, Universal Router, or v4 surface.
/// @dev Trust model mirrors the router↔adapter and vault↔adapter hardening already in this repo: the
///      adapter pulls exactly the input, approves only SwapRouter02 for exactly that input and clears
///      it, delivers output straight to the caller-supplied recipient, and independently verifies the
///      recipient's observed balance delta (== the venue's report and >= the minimum) plus that it
///      keeps no new net residual BPS or WETH custody. The frozen `BPSTradeRouter` then repeats its
///      own spend / reported-output / minimum checks, so a lying, short-spending, or misbehaving venue
///      reverts the whole trade atomically.
///
///      DEPLOYMENT IS NOT AUTHORIZED HERE and the constructor does NOT prove production wiring. The
///      router↔adapter immutability is circular: `BPSTradeRouter` stores this adapter immutably and
///      this adapter stores the router immutably, so the router address must be a pre-computed
///      (deterministic / nonce-predicted) address bound through a later reviewed deployment procedure
///      that constructs the second contract at exactly the predicted address and then verifies both
///      immutables on-chain. The constructor code-checks BPS/WETH/SwapRouter02 (already-deployed
///      dependencies) but intentionally does NOT code-check the router, or the cycle could never be
///      constructed. The constructor does NOT verify that `swapRouter02` is the official SwapRouter02,
///      that its factory is official, that a BPS/WETH pool exists, is initialized, uses `poolFee`, or
///      holds liquidity — those are later deployment gates, not construction guarantees.
///
///      All assets, addresses, and swaps exercised in this repository's tests are fictional and local;
///      nothing here is deployed or connected to any network.
contract UniswapV3BPSSwapAdapter is IBPSSwapAdapter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Immutable configuration -----------------------------------------------------------------

    /// @notice The only address permitted to call `swapExactInput` (the frozen BPSTradeRouter).
    address public immutable bpsTradeRouter;
    IERC20 public immutable bps;
    IERC20 public immutable weth;
    ISwapRouter02 public immutable swapRouter02;
    /// @notice Constructor-frozen v3 pool fee tier. The specific tier is a later product/deployment
    ///         decision; deployment must verify the official factory enables it and that
    ///         `factory.getPool(BPS, WETH, poolFee)` returns the intended pool.
    uint24 public immutable poolFee;

    // SwapRouter02 recipient sentinels (this deployment): address(1) = msg.sender, address(2) = the
    // router itself. Both must be rejected so output can never be silently redirected.
    address private constant MSG_SENDER_SENTINEL = address(1);
    address private constant ROUTER_SELF_SENTINEL = address(2);

    // --- Errors ----------------------------------------------------------------------------------

    error ZeroAddress();
    error InvalidTokenPair();
    error InvalidSystemAddress();
    error ZeroPoolFee();
    error NotAContract(address target);
    error NotBpsTradeRouter();
    error UnsupportedPair(address tokenIn, address tokenOut);
    error SameToken();
    error ZeroAmountIn();
    error ExpiredDeadline();
    error InvalidRecipient(address recipient);
    error FundingMismatch(uint256 expected, uint256 actual);
    error OutputMismatch(uint256 reported, uint256 observed);
    error MinimumOutputNotMet(uint256 minimum, uint256 observed);
    error ResidualBpsInAdapter(uint256 before, uint256 afterBalance);
    error ResidualWethInAdapter(uint256 before, uint256 afterBalance);
    error ApprovalNotCleared(uint256 remaining);
    error NativeTransferNotAllowed();

    /// @param bpsTradeRouter_ Immutable authorized caller (the frozen BPSTradeRouter; may be a
    ///        pre-computed address without code yet — see contract NatSpec on the deployment cycle).
    /// @param bps_ Immutable BPS token (must already have code).
    /// @param weth_ Immutable WETH token (must already have code).
    /// @param swapRouter02_ Immutable Uniswap SwapRouter02 (must already have code).
    /// @param poolFee_ Immutable v3 pool fee tier (nonzero).
    constructor(
        address bpsTradeRouter_,
        address bps_,
        address weth_,
        address swapRouter02_,
        uint24 poolFee_
    ) {
        if (
            bpsTradeRouter_ == address(0) || bps_ == address(0) || weth_ == address(0)
                || swapRouter02_ == address(0)
        ) {
            revert ZeroAddress();
        }
        if (bps_ == weth_) revert InvalidTokenPair();
        // No dangerous aliasing among the system addresses.
        if (swapRouter02_ == bps_ || swapRouter02_ == weth_ || swapRouter02_ == bpsTradeRouter_) {
            revert InvalidSystemAddress();
        }
        if (bpsTradeRouter_ == bps_ || bpsTradeRouter_ == weth_) revert InvalidSystemAddress();
        if (poolFee_ == 0) revert ZeroPoolFee();
        // Code-presence checks for already-deployed dependencies only. The router is intentionally
        // NOT checked (the circular immutability means its predicted address may not host code yet).
        if (bps_.code.length == 0) revert NotAContract(bps_);
        if (weth_.code.length == 0) revert NotAContract(weth_);
        if (swapRouter02_.code.length == 0) revert NotAContract(swapRouter02_);

        bpsTradeRouter = bpsTradeRouter_;
        bps = IERC20(bps_);
        weth = IERC20(weth_);
        swapRouter02 = ISwapRouter02(swapRouter02_);
        poolFee = poolFee_;
    }

    /// @dev Reject direct native-ETH transfers. NOTE: this cannot prevent forced ETH (e.g. via
    ///      `selfdestruct` or a coinbase payment); since there is deliberately no sweep/withdrawal
    ///      path, any such forced balance would remain stuck. The contract's ETH balance is therefore
    ///      not guaranteed to be zero — only that no ordinary transfer or call can add to it here.
    receive() external payable {
        revert NativeTransferNotAllowed();
    }

    // Intermediate swap state held in memory to keep the function within the stack limit.
    struct SwapVars {
        uint256 adapterBpsBefore;
        uint256 adapterWethBefore;
        uint256 recipientOutBefore;
        uint256 reported;
    }

    /// @inheritdoc IBPSSwapAdapter
    /// @dev Exact-input single-pool swap. Only the immutable router may call; only the immutable
    ///      BPS/WETH pair may execute; the deadline is enforced here (SwapRouter02's params carry
    ///      none). Output goes straight to `recipient`; the observed recipient delta is authoritative
    ///      and must equal both the venue's return and (at least) `minimumAmountOut`. The adapter must
    ///      end holding no new net BPS/WETH residual (donation-tolerant) with its venue approval cleared.
    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumAmountOut,
        address recipient,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        if (msg.sender != bpsTradeRouter) revert NotBpsTradeRouter();

        bool bpsToWeth = tokenIn == address(bps) && tokenOut == address(weth);
        bool wethToBps = tokenIn == address(weth) && tokenOut == address(bps);
        if (!bpsToWeth && !wethToBps) revert UnsupportedPair(tokenIn, tokenOut);
        if (tokenIn == tokenOut) revert SameToken(); // defensive; unreachable given the pair check
        if (amountIn == 0) revert ZeroAmountIn(); // reject SwapRouter02's contract-balance sentinel
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert ExpiredDeadline();
        _validateRecipient(recipient);

        SwapVars memory v;
        v.adapterBpsBefore = bps.balanceOf(address(this));
        v.adapterWethBefore = weth.balanceOf(address(this));
        v.recipientOutBefore = IERC20(tokenOut).balanceOf(recipient);

        // Pull exactly `amountIn` of tokenIn from the router and verify exact receipt (this rejects
        // fee-on-transfer or otherwise incompatible token behavior).
        IERC20 tin = IERC20(tokenIn);
        uint256 tinBefore = tin.balanceOf(address(this));
        tin.safeTransferFrom(bpsTradeRouter, address(this), amountIn);
        if (tin.balanceOf(address(this)) - tinBefore != amountIn) {
            revert FundingMismatch(amountIn, tin.balanceOf(address(this)) - tinBefore);
        }

        // Approve only SwapRouter02 for exactly `amountIn`, execute one exact-input single swap
        // delivering directly to `recipient`, then clear the approval (extracted to fit the stack).
        v.reported = _venueSwap(tin, tokenIn, tokenOut, amountIn, minimumAmountOut, recipient);

        // The recipient's observed balance delta is authoritative: it must equal the venue's report
        // and meet the minimum. (The frozen router independently repeats both checks.)
        amountOut = IERC20(tokenOut).balanceOf(recipient) - v.recipientOutBefore;
        if (amountOut != v.reported) revert OutputMismatch(v.reported, amountOut);
        if (amountOut < minimumAmountOut) revert MinimumOutputNotMet(minimumAmountOut, amountOut);

        // No new net residual custody at the adapter (compared to pre-call baselines, so pre-existing
        // donations are tolerated but retained input / mis-routed output revert).
        uint256 adapterBpsAfter = bps.balanceOf(address(this));
        if (adapterBpsAfter != v.adapterBpsBefore) {
            revert ResidualBpsInAdapter(v.adapterBpsBefore, adapterBpsAfter);
        }
        uint256 adapterWethAfter = weth.balanceOf(address(this));
        if (adapterWethAfter != v.adapterWethBefore) {
            revert ResidualWethInAdapter(v.adapterWethBefore, adapterWethAfter);
        }

        // The venue approval must be fully cleared.
        uint256 remaining = tin.allowance(address(this), address(swapRouter02));
        if (remaining != 0) revert ApprovalNotCleared(remaining);

        return amountOut;
    }

    /// @dev Approve SwapRouter02 for exactly `amountIn`, perform the single exact-input swap to
    ///      `recipient`, and clear the approval. Extracted to keep `swapExactInput` within the stack
    ///      limit; carries no independent authority (only `swapExactInput` reaches it).
    function _venueSwap(
        IERC20 tin,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumAmountOut,
        address recipient
    ) internal returns (uint256 reported) {
        tin.forceApprove(address(swapRouter02), amountIn);
        reported = swapRouter02.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: poolFee,
                recipient: recipient,
                amountIn: amountIn,
                amountOutMinimum: minimumAmountOut,
                sqrtPriceLimitX96: 0
            })
        );
        tin.forceApprove(address(swapRouter02), 0);
    }

    /// @dev Reject unsafe recipients: the zero address, both SwapRouter02 sentinels (`address(1)` =
    ///      msg.sender, `address(2)` = router self), this adapter, the SwapRouter02, and either token.
    ///      The immutable BPSTradeRouter IS a valid recipient (the frozen buyback and sell legs use it).
    function _validateRecipient(address recipient) internal view {
        if (
            recipient == address(0) || recipient == MSG_SENDER_SENTINEL
                || recipient == ROUTER_SELF_SENTINEL || recipient == address(this)
                || recipient == address(swapRouter02) || recipient == address(bps)
                || recipient == address(weth)
        ) {
            revert InvalidRecipient(recipient);
        }
    }
}
