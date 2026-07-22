// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter02} from "../../src/interfaces/ISwapRouter02.sol";

/// @notice Test-only misbehaving stand-in for `SwapRouter02.exactInputSingle` used to prove the BPS
///         adapter's independent verification and reentrancy guard reject every dishonest venue. Each
///         mode violates exactly one guarantee; none hide a failure by minting/moving tokens outside
///         the behavior under test. Test-only; never a production asset.
contract HostileSwapRouter02 is ISwapRouter02 {
    enum Mode {
        HONEST,
        REVERT, // revert unconditionally
        PARTIAL_SPEND, // pull amountIn - 1 (adapter retains input residual)
        NO_SPEND, // pull nothing (adapter retains the whole input)
        UNDER_DELIVER, // deliver & report amountOut - underBy (adapter minimum must catch it)
        NO_OUTPUT, // pull input, deliver nothing, report amountOut
        WRONG_TOKEN, // deliver a different token to recipient, report amountOut
        LIE_OVER, // deliver amountOut, report amountOut + 1
        LIE_UNDER, // deliver amountOut, report amountOut - 1
        OUTPUT_TO_ADAPTER, // deliver amountOut to the caller (adapter) instead of recipient
        EXCESS_PULL, // attempt to pull amountIn + 1 (reverts on allowance)
        REENTER // call back into the adapter mid-swap
    }

    address public immutable bps;
    address public immutable weth;
    uint256 public immutable wethToBpsRate;
    uint256 public immutable bpsToWethDiv;

    Mode public mode;
    address public wrongToken;
    uint256 public underBy = 1;
    address public reenterTarget;
    bytes public reenterCalldata;

    error BadPair();
    error ForcedFailure();
    error ReentrancyNotBlocked();

    constructor(address bps_, address weth_, uint256 wethToBpsRate_, uint256 bpsToWethDiv_) {
        bps = bps_;
        weth = weth_;
        wethToBpsRate = wethToBpsRate_;
        bpsToWethDiv = bpsToWethDiv_;
    }

    function setMode(Mode m) external {
        mode = m;
    }

    function setWrongToken(address token) external {
        wrongToken = token;
    }

    function setUnderBy(uint256 amount) external {
        underBy = amount;
    }

    function setReenter(address target, bytes calldata data) external {
        reenterTarget = target;
        reenterCalldata = data;
    }

    function _quote(address tokenIn, address tokenOut, uint256 amountIn)
        internal
        view
        returns (uint256)
    {
        if (tokenIn == weth && tokenOut == bps) return amountIn * wethToBpsRate;
        if (tokenIn == bps && tokenOut == weth) return amountIn / bpsToWethDiv;
        revert BadPair();
    }

    function exactInputSingle(ExactInputSingleParams calldata p)
        external
        payable
        returns (uint256)
    {
        if (mode == Mode.REVERT) revert ForcedFailure();
        if (mode == Mode.REENTER) {
            (bool ok,) = reenterTarget.call(reenterCalldata);
            if (ok) revert ReentrancyNotBlocked();
            revert ForcedFailure();
        }

        uint256 out = _quote(p.tokenIn, p.tokenOut, p.amountIn);

        // --- input-consumption leg ----------------------------------------------------------------
        if (mode == Mode.NO_SPEND) {
            // pull nothing
        } else if (mode == Mode.PARTIAL_SPEND) {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn - 1);
        } else if (mode == Mode.EXCESS_PULL) {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn + 1); // allowance reverts
        } else {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        }

        // --- output-delivery leg ------------------------------------------------------------------
        if (mode == Mode.NO_OUTPUT) {
            return out;
        }
        if (mode == Mode.WRONG_TOKEN) {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(wrongToken).transfer(p.recipient, out);
            return out;
        }
        if (mode == Mode.OUTPUT_TO_ADAPTER) {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(p.tokenOut).transfer(msg.sender, out); // to the adapter, not the recipient
            return out;
        }
        if (mode == Mode.UNDER_DELIVER) {
            uint256 delivered = out <= underBy ? 0 : out - underBy;
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(p.tokenOut).transfer(p.recipient, delivered);
            return delivered; // honest report of the short delivery; the adapter minimum must reject
        }

        // Honest delivery, then optionally misreport.
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(p.tokenOut).transfer(p.recipient, out);
        if (mode == Mode.LIE_OVER) return out + 1;
        if (mode == Mode.LIE_UNDER) return out == 0 ? 1 : out - 1;
        return out; // HONEST
    }
}
