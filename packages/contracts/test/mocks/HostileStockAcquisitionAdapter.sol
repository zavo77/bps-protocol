// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IStockAcquisitionAdapter} from "../../src/interfaces/IStockAcquisitionAdapter.sol";

/// @notice Test-only stock-acquisition adapter that can misbehave to prove the vault's independent
///         WETH-spend, stock-delta, minimum, and net-residual-custody verification plus its reentrancy
///         guard reject every dishonest adapter. Like the honest mock it is shaped as a pass-through
///         (routes WETH to `wethSink` and stock from `stockSource`), so HONEST leaves its own balances
///         unchanged; the misbehavior modes each violate exactly one guarantee.
///
///         Modes: HONEST; LIE_OVER / LIE_UNDER (report != delivered); UNDER_MIN (deliver & report below
///         minStockOut); PARTIAL_SPEND (consume less WETH); EXCESS_SPEND (attempt to consume more than
///         approved — reverts on allowance); WRONG_TOKEN (deliver a different token); NO_DELIVERY
///         (consume WETH, deliver nothing); RETAIN_STOCK (deliver less than reported, keep the rest);
///         RETAIN_WETH (pull the full input into the adapter and keep it — retained WETH residual);
///         SKIM_STOCK (consume WETH and deliver honestly, but also pull extra stock into the adapter —
///         retained stock residual); REENTER (call back into the vault); REVERT. Test-only; never a
///         production asset.
contract HostileStockAcquisitionAdapter is IStockAcquisitionAdapter {
    enum Mode {
        HONEST,
        LIE_OVER,
        LIE_UNDER,
        UNDER_MIN,
        PARTIAL_SPEND,
        EXCESS_SPEND,
        WRONG_TOKEN,
        NO_DELIVERY,
        RETAIN_STOCK,
        RETAIN_WETH,
        SKIM_STOCK,
        REENTER,
        REVERT
    }

    address public immutable weth;
    address public immutable wethSink;
    address public immutable stockSource;
    uint256 public immutable wethToStockRate;

    Mode public mode;
    address public wrongToken;
    uint256 public skimAmount = 1e18;
    address public reenterTarget;
    bytes public reenterCalldata;

    error ForcedFailure();
    error ReentrancyNotBlocked();

    constructor(address weth_, address wethSink_, address stockSource_, uint256 wethToStockRate_) {
        weth = weth_;
        wethSink = wethSink_;
        stockSource = stockSource_;
        wethToStockRate = wethToStockRate_;
    }

    function setMode(Mode m) external {
        mode = m;
    }

    function setWrongToken(address token) external {
        wrongToken = token;
    }

    function setSkimAmount(uint256 amount) external {
        skimAmount = amount;
    }

    function setReenter(address target, bytes calldata data) external {
        reenterTarget = target;
        reenterCalldata = data;
    }

    function _quote(uint256 wethAmountIn) internal view returns (uint256) {
        return wethAmountIn * wethToStockRate;
    }

    function acquireStock(
        address stockToken,
        uint256 wethAmountIn,
        uint256 minStockOut,
        uint256, /* deadline */
        bytes calldata /* executionData */
    ) external returns (uint256) {
        if (mode == Mode.REVERT) revert ForcedFailure();
        if (mode == Mode.REENTER) {
            // Re-enter the vault mid-acquisition; the guard must block it, so this must fail. If it
            // unexpectedly succeeds, surface it so the test fails loudly.
            (bool ok,) = reenterTarget.call(reenterCalldata);
            if (ok) revert ReentrancyNotBlocked();
            revert ForcedFailure();
        }

        uint256 out = _quote(wethAmountIn);

        // --- WETH consumption leg -----------------------------------------------------------------
        if (mode == Mode.RETAIN_WETH) {
            // Pull the full exact input INTO the adapter and keep it (retained WETH residual). The
            // vault still observes exactly `wethAmountIn` leaving its own balance.
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(weth).transferFrom(msg.sender, address(this), wethAmountIn);
        } else if (mode == Mode.PARTIAL_SPEND) {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(weth).transferFrom(msg.sender, wethSink, wethAmountIn - 1);
        } else if (mode == Mode.EXCESS_SPEND) {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(weth).transferFrom(msg.sender, wethSink, wethAmountIn + 1); // allowance reverts
        } else {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(weth).transferFrom(msg.sender, wethSink, wethAmountIn); // honest consumption
        }

        // --- Stock delivery leg -------------------------------------------------------------------
        if (mode == Mode.NO_DELIVERY) {
            return out; // consume WETH, deliver no stock, report positive
        }
        if (mode == Mode.WRONG_TOKEN) {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(wrongToken).transferFrom(stockSource, msg.sender, out); // wrong asset to the vault
            return out;
        }
        if (mode == Mode.UNDER_MIN) {
            uint256 belowMin = minStockOut == 0 ? 0 : minStockOut - 1;
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(stockToken).transferFrom(stockSource, msg.sender, belowMin);
            return belowMin; // honest report, but below the vault minimum
        }
        if (mode == Mode.RETAIN_STOCK) {
            uint256 delivered = out == 0 ? 0 : out - 1;
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(stockToken).transferFrom(stockSource, msg.sender, delivered);
            return out; // report > observed
        }

        // Deliver the honest amount to the vault.
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(stockToken).transferFrom(stockSource, msg.sender, out);

        if (mode == Mode.SKIM_STOCK) {
            // Also pull extra stock into the adapter and keep it (retained stock residual). The vault
            // still observes exactly `out` delivered and the report matches, but the adapter's own
            // stock balance grew.
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(stockToken).transferFrom(stockSource, address(this), skimAmount);
            return out;
        }
        if (mode == Mode.LIE_OVER) return out + 1;
        if (mode == Mode.LIE_UNDER) return out == 0 ? 1 : out - 1;
        return out; // HONEST
    }
}
