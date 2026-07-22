// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IStockAcquisitionAdapter} from "../../src/interfaces/IStockAcquisitionAdapter.sol";

/// @notice Test-only honest deterministic stock-acquisition adapter shaped like a real pass-through
///         venue adapter: it holds NO inventory and NO residual custody. On each call it routes the
///         vault's WETH straight to an external `wethSink` (the "venue" that consumes it) and routes
///         the acquired stock straight from an external `stockSource` (which holds inventory and has
///         approved this adapter) to the vault — so the adapter's own WETH and selected-stock balances
///         are never touched. `stockOut = wethAmountIn * rate`. It deliberately does NOT self-enforce
///         `minStockOut` (the vault is the sole minimum authority). Test-only; never a production or
///         deployment asset.
contract MockStockAcquisitionAdapter is IStockAcquisitionAdapter {
    address public immutable weth;
    address public immutable wethSink; // where consumed WETH goes (a mock venue)
    address public immutable stockSource; // holds stock inventory; has approved this adapter
    uint256 public immutable wethToStockRate; // stockOut = wethIn * rate

    error ZeroRate();

    constructor(address weth_, address wethSink_, address stockSource_, uint256 wethToStockRate_) {
        if (wethToStockRate_ == 0) revert ZeroRate();
        weth = weth_;
        wethSink = wethSink_;
        stockSource = stockSource_;
        wethToStockRate = wethToStockRate_;
    }

    function quote(uint256 wethAmountIn) public view returns (uint256) {
        return wethAmountIn * wethToStockRate;
    }

    function acquireStock(
        address stockToken,
        uint256 wethAmountIn,
        uint256, /* minStockOut */
        uint256, /* deadline */
        bytes calldata /* executionData */
    ) external returns (uint256 reportedStockOut) {
        reportedStockOut = quote(wethAmountIn);
        // Route the vault's WETH straight to the sink and the stock straight from the source to the
        // vault; the adapter never custodies either asset, so it holds no new net residual.
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(weth).transferFrom(msg.sender, wethSink, wethAmountIn);
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(stockToken).transferFrom(stockSource, msg.sender, reportedStockOut);
    }
}
