// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IBPSSwapAdapter} from "./interfaces/IBPSSwapAdapter.sol";
import {IBPSBurnable} from "./interfaces/IBPSBurnable.sol";

/// @title BPSTradeRouter
/// @notice The official BPS trade router implementing BPS-ECON-2.0. A buy applies a 3% protocol
///         allocation (2% WETH stock-acquisition budget + 1% BPS repurchase-and-burn, 97% to the
///         user); a sell applies a 4% allocation (2% stock + 2% burn, 96% to the user). The burn
///         is a true `totalSupply` reduction: the router repurchases BPS with the WETH burn budget
///         through the immutable adapter and burns the BPS it receives via the token's self-burn.
/// @dev Non-upgradeable. All economics and route dependencies are immutable; there is no fee/token/
///      adapter/recipient/trade-math/burn setter, no proxy/upgrade, no arbitrary call, no fund
///      sweep, and no third-party burn. The DEX liquidity-provider fee and price impact are the
///      adapter's concern and are NOT part of the protocol allocation. Only trades routed here fund
///      stock acquisition and BPS burning; direct-pool trades bypass the router entirely.
///      TASK 6A is local, deterministic testing only with fictional assets and a mock adapter;
///      nothing here is deployed or connected to a network.
contract BPSTradeRouter is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Frozen BPS-ECON-2.0 allocation (basis points, denominator 10_000) ----------------------

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant BUY_STOCK_BPS = 200; // 2% WETH stock-acquisition budget
    uint256 public constant BUY_BURN_BPS = 100; // 1% WETH BPS repurchase-and-burn
    uint256 public constant SELL_STOCK_BPS = 200; // 2% WETH stock-acquisition budget
    uint256 public constant SELL_BURN_BPS = 200; // 2% WETH BPS repurchase-and-burn

    // --- Immutable configuration -----------------------------------------------------------------

    IERC20 public immutable bpsToken;
    IERC20 public immutable weth;
    IBPSSwapAdapter public immutable swapAdapter;
    /// @notice Immutable destination for the WETH stock-acquisition budget (future acquisition vault).
    address public immutable stockBudgetRecipient;

    // --- Cumulative accounting (updated only inside a successful atomic trade) -------------------

    uint256 public tradeCount;
    uint256 public totalBuys;
    uint256 public totalSells;
    uint256 public totalGrossWethInFromBuys;
    uint256 public totalGrossBpsInFromSells;
    uint256 public totalStockBudgetDelivered; // WETH
    uint256 public totalBurnBudgetConsumed; // WETH
    uint256 public totalBpsBurned; // BPS

    // --- Events ----------------------------------------------------------------------------------

    event OfficialBuy(
        uint256 indexed tradeId,
        address indexed trader,
        address indexed recipient,
        uint256 grossWethInput,
        uint256 stockBudget,
        uint256 burnBudget,
        uint256 userWethBudget,
        uint256 userBpsOutput,
        uint256 bpsBurned,
        address adapter,
        address stockBudgetRecipient
    );
    event OfficialSell(
        uint256 indexed tradeId,
        address indexed trader,
        address indexed recipient,
        uint256 grossBpsInput,
        uint256 grossWethOutput,
        uint256 stockBudget,
        uint256 burnBudget,
        uint256 userWethOutput,
        uint256 bpsBurned,
        address adapter,
        address stockBudgetRecipient
    );
    event StockBudgetDelivered(uint256 indexed tradeId, address indexed recipient, uint256 amount);
    event BpsRepurchasedAndBurned(uint256 indexed tradeId, uint256 wethSpent, uint256 bpsBurned);

    // --- Errors ----------------------------------------------------------------------------------

    error ZeroAddress();
    error InvalidTokenPair();
    error InvalidSystemAddress();
    error ZeroInput();
    error InvalidRecipient();
    error ExpiredDeadline();
    error FundingMismatch(uint256 declared, uint256 received);
    error AdapterSpendMismatch(uint256 expected, uint256 actual);
    error AdapterOutputMismatch(uint256 reported, uint256 actual);
    error MinimumOutputNotMet();
    error StockBudgetDeliveryMismatch(uint256 expected, uint256 received);
    error BurnSupplyMismatch(uint256 expected, uint256 actual);
    error UnexpectedResidue();
    error InvalidZeroBudgetMinimum();
    error RenounceDisabled();
    error NativeTransferNotAllowed();

    /// @param initialOwner Security Safe (pause + two-step ownership authority only).
    /// @param bps Immutable BPS token.
    /// @param weth_ Immutable WETH token.
    /// @param adapter_ Immutable BPS/WETH swap adapter.
    /// @param stockRecipient_ Immutable WETH stock-acquisition budget recipient.
    constructor(
        address initialOwner,
        address bps,
        address weth_,
        address adapter_,
        address stockRecipient_
    ) Ownable(initialOwner) {
        if (
            bps == address(0) || weth_ == address(0) || adapter_ == address(0)
                || stockRecipient_ == address(0)
        ) {
            revert ZeroAddress();
        }
        if (bps == weth_) revert InvalidTokenPair();
        if (adapter_ == bps || adapter_ == weth_) revert InvalidSystemAddress();
        if (
            stockRecipient_ == address(this) || stockRecipient_ == bps || stockRecipient_ == weth_
                || stockRecipient_ == adapter_
        ) {
            revert InvalidSystemAddress();
        }
        bpsToken = IERC20(bps);
        weth = IERC20(weth_);
        swapAdapter = IBPSSwapAdapter(adapter_);
        stockBudgetRecipient = stockRecipient_;
    }

    // --- Owner: pause authority only (no economic or fund power) ---------------------------------

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev Renunciation is permanently disabled: the router must never lose its emergency pause
    ///      authority or be stranded ownerless.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    /// @dev Reject direct native-ETH transfers; the router only moves ERC-20 BPS and WETH.
    receive() external payable {
        revert NativeTransferNotAllowed();
    }

    // Intermediate trade state held in memory to keep the trade functions within the stack limit.
    struct BuyVars {
        uint256 tradeId;
        uint256 wethBaseline;
        uint256 bpsBaseline;
        uint256 stockBudget;
        uint256 burnBudget;
        uint256 userWethBudget;
        uint256 userBpsOutput;
        uint256 bpsBurned;
    }

    struct SellVars {
        uint256 tradeId;
        uint256 wethBaseline;
        uint256 bpsBaseline;
        uint256 grossWethOutput;
        uint256 stockBudget;
        uint256 burnBudget;
        uint256 userWethOutput;
        uint256 bpsBurned;
    }

    // --- Buy: WETH -> BPS with 200/100/9700 allocation -------------------------------------------

    function buyExactWethForBps(
        uint256 grossWethInput,
        uint256 minimumUserBpsOutput,
        uint256 minimumBurnBpsOutput,
        address recipient,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256, uint256) {
        if (grossWethInput == 0) revert ZeroInput();
        _validateRecipient(recipient);
        _checkDeadline(deadline);

        BuyVars memory v;
        v.wethBaseline = weth.balanceOf(address(this));
        v.bpsBaseline = bpsToken.balanceOf(address(this));

        _pullExact(weth, grossWethInput);

        v.stockBudget = Math.mulDiv(grossWethInput, BUY_STOCK_BPS, BPS_DENOMINATOR);
        v.burnBudget = Math.mulDiv(grossWethInput, BUY_BURN_BPS, BPS_DENOMINATOR);
        v.userWethBudget = grossWethInput - v.stockBudget - v.burnBudget; // remainder favors user
        v.tradeId = ++tradeCount;

        _deliverStockBudget(v.tradeId, v.stockBudget);
        // User leg: swap the user's WETH budget to BPS delivered straight to the recipient.
        v.userBpsOutput = _adapterSwap(
            address(weth),
            address(bpsToken),
            v.userWethBudget,
            minimumUserBpsOutput,
            recipient,
            deadline
        );
        // Protocol leg: repurchase BPS with the burn budget and truly burn it.
        v.bpsBurned = _buybackAndBurn(v.tradeId, v.burnBudget, minimumBurnBpsOutput, deadline);

        _assertNoResidue(v.wethBaseline, v.bpsBaseline);

        totalBuys += 1;
        totalGrossWethInFromBuys += grossWethInput;
        totalStockBudgetDelivered += v.stockBudget;
        totalBurnBudgetConsumed += v.burnBudget;
        totalBpsBurned += v.bpsBurned;

        _emitBuy(v, recipient, grossWethInput);
        return (v.userBpsOutput, v.bpsBurned);
    }

    // --- Sell: BPS -> WETH with 200/200/9600 allocation from ACTUAL proceeds ---------------------

    function sellExactBpsForWeth(
        uint256 grossBpsInput,
        uint256 minimumGrossWethOutput,
        uint256 minimumUserWethOutput,
        uint256 minimumBurnBpsOutput,
        address recipient,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256, uint256, uint256) {
        if (grossBpsInput == 0) revert ZeroInput();
        _validateRecipient(recipient);
        _checkDeadline(deadline);

        SellVars memory v;
        v.wethBaseline = weth.balanceOf(address(this));
        v.bpsBaseline = bpsToken.balanceOf(address(this));

        _pullExact(bpsToken, grossBpsInput);
        v.tradeId = ++tradeCount;

        // Sell the entire input for WETH into the router, then allocate from ACTUAL proceeds.
        v.grossWethOutput = _adapterSwap(
            address(bpsToken),
            address(weth),
            grossBpsInput,
            minimumGrossWethOutput,
            address(this),
            deadline
        );
        v.stockBudget = Math.mulDiv(v.grossWethOutput, SELL_STOCK_BPS, BPS_DENOMINATOR);
        v.burnBudget = Math.mulDiv(v.grossWethOutput, SELL_BURN_BPS, BPS_DENOMINATOR);
        v.userWethOutput = v.grossWethOutput - v.stockBudget - v.burnBudget; // remainder favors user
        if (v.userWethOutput < minimumUserWethOutput) revert MinimumOutputNotMet();

        _deliverStockBudget(v.tradeId, v.stockBudget);
        _deliverUserWeth(recipient, v.userWethOutput);
        v.bpsBurned = _buybackAndBurn(v.tradeId, v.burnBudget, minimumBurnBpsOutput, deadline);

        _assertNoResidue(v.wethBaseline, v.bpsBaseline);

        totalSells += 1;
        totalGrossBpsInFromSells += grossBpsInput;
        totalStockBudgetDelivered += v.stockBudget;
        totalBurnBudgetConsumed += v.burnBudget;
        totalBpsBurned += v.bpsBurned;

        _emitSell(v, recipient, grossBpsInput);
        return (v.grossWethOutput, v.userWethOutput, v.bpsBurned);
    }

    function _emitBuy(BuyVars memory v, address recipient, uint256 grossWethInput) internal {
        emit OfficialBuy(
            v.tradeId,
            msg.sender,
            recipient,
            grossWethInput,
            v.stockBudget,
            v.burnBudget,
            v.userWethBudget,
            v.userBpsOutput,
            v.bpsBurned,
            address(swapAdapter),
            stockBudgetRecipient
        );
    }

    function _emitSell(SellVars memory v, address recipient, uint256 grossBpsInput) internal {
        emit OfficialSell(
            v.tradeId,
            msg.sender,
            recipient,
            grossBpsInput,
            v.grossWethOutput,
            v.stockBudget,
            v.burnBudget,
            v.userWethOutput,
            v.bpsBurned,
            address(swapAdapter),
            stockBudgetRecipient
        );
    }

    // --- Internal helpers ------------------------------------------------------------------------

    function _validateRecipient(address recipient) internal view {
        if (recipient == address(0)) revert InvalidRecipient();
        if (
            recipient == address(this) || recipient == address(bpsToken)
                || recipient == address(weth) || recipient == address(swapAdapter)
        ) {
            revert InvalidRecipient();
        }
    }

    function _checkDeadline(uint256 deadline) internal view {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert ExpiredDeadline();
    }

    /// @dev Pull exactly `amount` of `token` from msg.sender and verify the received balance delta.
    function _pullExact(IERC20 token, uint256 amount) internal {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received != amount) revert FundingMismatch(amount, received);
    }

    /// @dev Deliver the WETH stock budget to the immutable recipient and verify the received delta.
    function _deliverStockBudget(uint256 tradeId, uint256 amount) internal {
        if (amount == 0) return;
        uint256 before = weth.balanceOf(stockBudgetRecipient);
        weth.safeTransfer(stockBudgetRecipient, amount);
        uint256 received = weth.balanceOf(stockBudgetRecipient) - before;
        if (received != amount) revert StockBudgetDeliveryMismatch(amount, received);
        emit StockBudgetDelivered(tradeId, stockBudgetRecipient, amount);
    }

    /// @dev Deliver the user's WETH output and verify the received delta.
    function _deliverUserWeth(address recipient, uint256 amount) internal {
        if (amount == 0) return;
        uint256 before = weth.balanceOf(recipient);
        weth.safeTransfer(recipient, amount);
        uint256 received = weth.balanceOf(recipient) - before;
        if (received != amount) revert StockBudgetDeliveryMismatch(amount, received);
    }

    /// @dev Swap exactly `amountIn` of `tokenIn` for `tokenOut` via the immutable adapter, using an
    ///      exact approval cleared after use, and independently verify the actual spend and output.
    ///      A zero budget performs no external call and requires a zero minimum.
    function _adapterSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        address recipient,
        uint256 deadline
    ) internal returns (uint256 received) {
        if (amountIn == 0) {
            if (minOut != 0) revert InvalidZeroBudgetMinimum();
            return 0;
        }
        IERC20 tin = IERC20(tokenIn);
        IERC20 tout = IERC20(tokenOut);
        uint256 inBefore = tin.balanceOf(address(this));
        uint256 outBefore = tout.balanceOf(recipient);

        tin.forceApprove(address(swapAdapter), amountIn);
        uint256 reported =
            swapAdapter.swapExactInput(tokenIn, tokenOut, amountIn, minOut, recipient, deadline);
        tin.forceApprove(address(swapAdapter), 0); // clear approval after use

        uint256 spent = inBefore - tin.balanceOf(address(this));
        if (spent != amountIn) revert AdapterSpendMismatch(amountIn, spent);
        received = tout.balanceOf(recipient) - outBefore;
        if (received != reported) revert AdapterOutputMismatch(reported, received);
        if (received < minOut) revert MinimumOutputNotMet();
    }

    /// @dev Repurchase BPS with `burnBudget` WETH into the router, then truly burn it, verifying the
    ///      router balance and BPS totalSupply each fall by exactly the burned amount.
    function _buybackAndBurn(
        uint256 tradeId,
        uint256 burnBudget,
        uint256 minBurnOut,
        uint256 deadline
    ) internal returns (uint256 burned) {
        burned = _adapterSwap(
            address(weth), address(bpsToken), burnBudget, minBurnOut, address(this), deadline
        );
        if (burned == 0) return 0; // zero budget: no swap, no zero-value burn

        uint256 balBefore = bpsToken.balanceOf(address(this));
        uint256 supplyBefore = bpsToken.totalSupply();
        IBPSBurnable(address(bpsToken)).burn(burned);
        uint256 balDrop = balBefore - bpsToken.balanceOf(address(this));
        uint256 supplyDrop = supplyBefore - bpsToken.totalSupply();
        if (balDrop != burned) revert BurnSupplyMismatch(burned, balDrop);
        if (supplyDrop != burned) revert BurnSupplyMismatch(burned, supplyDrop);

        emit BpsRepurchasedAndBurned(tradeId, burnBudget, burned);
    }

    /// @dev A successful trade must leave no new trade-derived BPS or WETH residue in the router;
    ///      preexisting donations (the baselines) are untouched and never counted.
    function _assertNoResidue(uint256 wethBaseline, uint256 bpsBaseline) internal view {
        if (weth.balanceOf(address(this)) != wethBaseline) revert UnexpectedResidue();
        if (bpsToken.balanceOf(address(this)) != bpsBaseline) revert UnexpectedResidue();
    }
}
