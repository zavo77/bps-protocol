// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IBPSSwapAdapter} from "../../src/interfaces/IBPSSwapAdapter.sol";

/// @notice Test-only adapter that can misbehave to prove the router's independent balance-delta
///         verification and reentrancy guard reject every dishonest adapter. Modes: HONEST,
///         LIE_OVER / LIE_UNDER (return != delivered), SHORT_SPEND (pull less than amountIn), FAIL
///         (revert), REENTER (call back into the router). Test-only; never a production asset.
contract HostileSwapAdapter is IBPSSwapAdapter {
    enum Mode {
        HONEST,
        LIE_OVER,
        LIE_UNDER,
        SHORT_SPEND,
        FAIL,
        REENTER
    }

    address public immutable bps;
    address public immutable weth;
    uint256 public immutable wethToBpsRate;
    uint256 public immutable bpsToWethDiv;

    Mode public mode;
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

    function setReenter(address target, bytes calldata data) external {
        reenterTarget = target;
        reenterCalldata = data;
    }

    function _out(address tokenIn, address tokenOut, uint256 amountIn)
        internal
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
        uint256, /* minimumAmountOut */
        address recipient,
        uint256 /* deadline */
    ) external returns (uint256) {
        if (mode == Mode.FAIL) revert ForcedFailure();
        if (mode == Mode.REENTER) {
            // Attempt to re-enter the router mid-trade; the guard must block it, so this call must
            // fail. If it unexpectedly succeeds, surface it so the test fails loudly.
            (bool ok,) = reenterTarget.call(reenterCalldata);
            if (ok) revert ReentrancyNotBlocked();
            revert ForcedFailure(); // propagate the blocked re-entry as a full trade revert
        }

        uint256 pulled = mode == Mode.SHORT_SPEND ? amountIn - 1 : amountIn;
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(tokenIn).transferFrom(msg.sender, address(this), pulled);

        uint256 delivered = _out(tokenIn, tokenOut, pulled);
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(tokenOut).transfer(recipient, delivered);

        if (mode == Mode.LIE_OVER) return delivered + 1; // report more than delivered
        if (mode == Mode.LIE_UNDER) return delivered == 0 ? 1 : delivered - 1; // report less
        return delivered;
    }
}
