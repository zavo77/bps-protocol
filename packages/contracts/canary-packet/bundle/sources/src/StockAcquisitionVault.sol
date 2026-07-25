// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IStockAcquisitionAdapter} from "./interfaces/IStockAcquisitionAdapter.sol";

/// @title StockAcquisitionVault
/// @notice Custodies the WETH stock-acquisition budget delivered by `BPSTradeRouter` (as the router's
///         immutable `stockBudgetRecipient`) and converts it, on the authority of a single immutable
///         executor, into an approved stock token through an immutable acquisition adapter. Each
///         successful acquisition applies the frozen 80/20 split: 80% (floored) is retained as the
///         distribution allocation (releasable only to the immutable DistributionFundingCoordinator),
///         and the remaining 20% plus the entire rounding remainder is delivered to the immutable
///         protocol reserve recipient.
/// @dev Non-upgradeable and deliberately minimal in authority. There is NO owner, NO pause, NO
///      arbitrary-recipient parameter, NO owner/executor withdrawal, NO generic sweep, NO arbitrary
///      call, NO proxy/initializer/delegatecall, and NO stock-token recovery to a discretionary
///      address. The only WETH outflow is `executeAcquisition`, which can only approve and call the
///      immutable adapter for the exact input and only credits an approved stock token verified by an
///      independent balance delta. The only stock outflow is the reserve delivery inside an
///      acquisition (to the immutable reserve recipient) and `releaseToDistributionCoordinator` (to
///      the immutable coordinator). The approved stock basket is frozen at construction with no
///      add/remove function.
///
///      DEPLOYMENT IS BLOCKED for now: the `DistributionFundingCoordinator` is a later task (6B-2 /
///      the coordinator task). This vault only implements the narrow immutable-recipient release
///      boundary — transferring the distribution allocation to the coordinator address. It does NOT
///      publish or fund `DistributionClaimManager` cycles; a bare transfer to the coordinator does
///      not complete any distribution. A production deployment must wait until the concrete
///      coordinator address and the full ownership/authorization sequence (executor = governance
///      keeper, reserve/coordinator = finalized destinations) are settled and independently verified.
///
///      All assets, addresses, adapters, and acquisitions exercised in this repository's tests are
///      fictional and local; nothing here is deployed or connected to any network.
contract StockAcquisitionVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Frozen 80/20 split (percent, denominator 100) ------------------------------------------

    uint256 public constant SPLIT_DENOMINATOR = 100;
    uint256 public constant DISTRIBUTION_PERCENT = 80; // 80% distribution; remainder (>=20%) reserve

    // --- Immutable configuration -----------------------------------------------------------------

    IERC20 public immutable weth;
    IStockAcquisitionAdapter public immutable acquisitionAdapter;
    /// @notice The only address allowed to execute acquisitions and release distribution stock.
    address public immutable acquisitionExecutor;
    /// @notice Immutable destination for the reserve (>=20%) portion of every acquisition.
    address public immutable reserveRecipient;
    /// @notice Immutable destination for released distribution stock. Placeholder until the concrete
    ///         DistributionFundingCoordinator exists (see contract-level NatSpec — deployment blocked).
    address public immutable distributionFundingCoordinator;

    /// @notice Frozen approved stock basket (set once at construction; no add/remove in v1).
    mapping(address stockToken => bool approved) public isApprovedStockToken;
    address[] private _approvedStockTokens;

    // --- Accounting (attributed protocol amounts; never raw balances) ---------------------------

    /// @notice Total WETH actually spent on acquisitions (declared input, verified as exact spend).
    uint256 public totalWethSpent;
    /// @notice Total stock actually acquired per token (verified balance delta), before the split.
    mapping(address stockToken => uint256) public totalStockAcquired;
    /// @notice Accounted distribution allocation per token (80%, floored), retained in the vault.
    mapping(address stockToken => uint256) public distributionAllocated;
    /// @notice Reserve allocation per token (remainder) delivered to the reserve recipient.
    mapping(address stockToken => uint256) public reserveAllocated;
    /// @notice Distribution stock per token released to the coordinator.
    mapping(address stockToken => uint256) public distributionReleased;

    // --- Events ----------------------------------------------------------------------------------

    event StockAcquired(
        address indexed executor,
        address indexed stockToken,
        uint256 wethAmountIn,
        uint256 actualStockOut,
        uint256 distributionAllocation,
        uint256 reserveAllocation,
        address adapter
    );
    event ReserveAllocated(
        address indexed stockToken, address indexed reserveRecipient, uint256 amount
    );
    event DistributionReleased(
        address indexed stockToken, address indexed coordinator, uint256 amount
    );

    // --- Errors ----------------------------------------------------------------------------------

    error ZeroAddress();
    error InvalidSystemAddress();
    error DuplicateStockToken(address stockToken);
    error EmptyBasket();
    error NotAuthorizedExecutor();
    error StockTokenNotApproved(address stockToken);
    error ZeroAmount();
    error ZeroMinimumOutput();
    error ExpiredDeadline();
    error InsufficientWethCustody(uint256 requested, uint256 available);
    error WethSpendMismatch(uint256 expected, uint256 actual);
    error MinimumStockOutNotMet(uint256 minimum, uint256 actual);
    error ReportedStockMismatch(uint256 reported, uint256 observed);
    error ReserveDeliveryMismatch(uint256 expected, uint256 received);
    error DistributionDeliveryMismatch(uint256 expected, uint256 received);
    error ReleaseExceedsAllocation(uint256 requested, uint256 releasable);
    error NativeTransferNotAllowed();
    /// @dev The adapter finished holding more WETH than it started with (retained input rather than
    ///      consuming it in the acquisition). `before`/`afterBalance` are the adapter's WETH balances.
    error ResidualWethInAdapter(uint256 before, uint256 afterBalance);
    /// @dev The adapter finished holding more of the selected stock token than it started with
    ///      (skimmed acquired stock instead of delivering all of it to the vault).
    error ResidualStockInAdapter(uint256 before, uint256 afterBalance);

    /// @param weth_ Immutable WETH token (the acquisition budget asset).
    /// @param acquisitionAdapter_ Immutable adapter that converts WETH into an approved stock token.
    /// @param acquisitionExecutor_ Immutable executor (future governance keeper) — sole authority.
    /// @param reserveRecipient_ Immutable reserve (>=20%) destination.
    /// @param distributionFundingCoordinator_ Immutable distribution-release destination (placeholder).
    /// @param approvedStockTokens_ Frozen approved basket (nonempty, unique, non-aliasing).
    constructor(
        address weth_,
        address acquisitionAdapter_,
        address acquisitionExecutor_,
        address reserveRecipient_,
        address distributionFundingCoordinator_,
        address[] memory approvedStockTokens_
    ) {
        if (
            weth_ == address(0) || acquisitionAdapter_ == address(0)
                || acquisitionExecutor_ == address(0) || reserveRecipient_ == address(0)
                || distributionFundingCoordinator_ == address(0)
        ) {
            revert ZeroAddress();
        }
        // The adapter must not alias WETH or this vault; the reserve and coordinator must be distinct
        // real destinations, not the vault/adapter/WETH or each other.
        if (acquisitionAdapter_ == weth_ || acquisitionAdapter_ == address(this)) {
            revert InvalidSystemAddress();
        }
        if (
            reserveRecipient_ == address(this) || reserveRecipient_ == acquisitionAdapter_
                || reserveRecipient_ == weth_
        ) {
            revert InvalidSystemAddress();
        }
        if (
            distributionFundingCoordinator_ == address(this)
                || distributionFundingCoordinator_ == acquisitionAdapter_
                || distributionFundingCoordinator_ == weth_
                || distributionFundingCoordinator_ == reserveRecipient_
        ) {
            revert InvalidSystemAddress();
        }
        if (approvedStockTokens_.length == 0) revert EmptyBasket();

        weth = IERC20(weth_);
        acquisitionAdapter = IStockAcquisitionAdapter(acquisitionAdapter_);
        acquisitionExecutor = acquisitionExecutor_;
        reserveRecipient = reserveRecipient_;
        distributionFundingCoordinator = distributionFundingCoordinator_;

        for (uint256 i = 0; i < approvedStockTokens_.length; i++) {
            address token = approvedStockTokens_[i];
            if (token == address(0)) revert ZeroAddress();
            if (
                token == weth_ || token == acquisitionAdapter_ || token == address(this)
                    || token == acquisitionExecutor_ || token == reserveRecipient_
                    || token == distributionFundingCoordinator_
            ) {
                revert InvalidSystemAddress();
            }
            if (isApprovedStockToken[token]) revert DuplicateStockToken(token);
            isApprovedStockToken[token] = true;
            _approvedStockTokens.push(token);
        }
    }

    /// @dev Reject direct native-ETH transfers; the vault only ever moves ERC-20 WETH and stock.
    receive() external payable {
        revert NativeTransferNotAllowed();
    }

    // --- Acquisition (executor only) -------------------------------------------------------------

    // Intermediate acquisition state held in memory to keep the function within the stack limit.
    struct AcquireVars {
        uint256 wethBefore; // vault WETH before the adapter call
        uint256 stockBefore; // vault selected-stock before the adapter call
        uint256 adapterWethBefore; // adapter WETH before the adapter call (donation-tolerant baseline)
        uint256 adapterStockBefore; // adapter selected-stock before the adapter call (baseline)
        uint256 reported;
        uint256 actualStockOut;
        uint256 distributionAllocation;
        uint256 reserveAllocation;
    }

    /// @notice Convert exactly `wethAmountIn` of custodied WETH into `stockToken` via the immutable
    ///         adapter, then split the verified output 80/20 (distribution retained, reserve sent).
    /// @dev Executor-only, nonReentrant. Approves the adapter for exactly the input and clears it
    ///      after; independently verifies the exact WETH spent, the actual stock delta, and that the
    ///      adapter's report equals the observed delta; reverts atomically on any mismatch. No target,
    ///      recipient, asset, or call is caller-controlled beyond the approved `stockToken`.
    function executeAcquisition(
        address stockToken,
        uint256 wethAmountIn,
        uint256 minStockOut,
        uint256 deadline,
        bytes calldata executionData
    ) external nonReentrant returns (uint256 actualStockOut) {
        if (msg.sender != acquisitionExecutor) {
            revert NotAuthorizedExecutor();
        }
        if (!isApprovedStockToken[stockToken]) revert StockTokenNotApproved(stockToken);
        if (wethAmountIn == 0) revert ZeroAmount();
        if (minStockOut == 0) revert ZeroMinimumOutput();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert ExpiredDeadline();

        AcquireVars memory v;
        v.wethBefore = weth.balanceOf(address(this));
        if (v.wethBefore < wethAmountIn) {
            revert InsufficientWethCustody(wethAmountIn, v.wethBefore);
        }
        v.stockBefore = IERC20(stockToken).balanceOf(address(this));
        // Donation-tolerant baselines: the adapter's own WETH and selected-stock balances at entry.
        // A correct pass-through adapter finishes with these UNCHANGED; any new net residual means it
        // retained input WETH or skimmed acquired stock. Comparing to the pre-call balance (not zero)
        // means pre-existing unsolicited balances at the adapter never brick execution.
        v.adapterWethBefore = weth.balanceOf(address(acquisitionAdapter));
        v.adapterStockBefore = IERC20(stockToken).balanceOf(address(acquisitionAdapter));

        // Approve only the immutable adapter, only for the exact input, then clear after the call.
        weth.forceApprove(address(acquisitionAdapter), wethAmountIn);
        v.reported = acquisitionAdapter.acquireStock(
            stockToken, wethAmountIn, minStockOut, deadline, executionData
        );
        weth.forceApprove(address(acquisitionAdapter), 0);

        // Independent verification: exact WETH spend, actual stock delta, report == observed.
        uint256 spent = v.wethBefore - weth.balanceOf(address(this));
        if (spent != wethAmountIn) revert WethSpendMismatch(wethAmountIn, spent);

        v.actualStockOut = IERC20(stockToken).balanceOf(address(this)) - v.stockBefore;
        if (v.actualStockOut != v.reported) {
            revert ReportedStockMismatch(v.reported, v.actualStockOut);
        }
        if (v.actualStockOut < minStockOut) {
            revert MinimumStockOutNotMet(minStockOut, v.actualStockOut);
        }

        // No NEW net residual custody at the adapter: it must not finish holding more WETH (retained
        // input) or more selected stock (skimmed output) than it held before the call. This closes the
        // gap where exact-spend, report==observed, and minimum checks all pass yet the adapter kept
        // WETH or extra stock. Pre-existing donations are tolerated (compared to the pre-call balance).
        uint256 adapterWethAfter = weth.balanceOf(address(acquisitionAdapter));
        if (adapterWethAfter != v.adapterWethBefore) {
            revert ResidualWethInAdapter(v.adapterWethBefore, adapterWethAfter);
        }
        uint256 adapterStockAfter = IERC20(stockToken).balanceOf(address(acquisitionAdapter));
        if (adapterStockAfter != v.adapterStockBefore) {
            revert ResidualStockInAdapter(v.adapterStockBefore, adapterStockAfter);
        }

        // Frozen 80/20 split: floor to distribution, entire remainder to reserve.
        v.distributionAllocation =
            Math.mulDiv(v.actualStockOut, DISTRIBUTION_PERCENT, SPLIT_DENOMINATOR);
        v.reserveAllocation = v.actualStockOut - v.distributionAllocation;

        totalWethSpent += wethAmountIn;
        totalStockAcquired[stockToken] += v.actualStockOut;
        distributionAllocated[stockToken] += v.distributionAllocation;
        reserveAllocated[stockToken] += v.reserveAllocation;

        emit StockAcquired(
            msg.sender,
            stockToken,
            wethAmountIn,
            v.actualStockOut,
            v.distributionAllocation,
            v.reserveAllocation,
            address(acquisitionAdapter)
        );

        // Deliver the reserve portion immediately to the immutable reserve recipient, verifying BOTH
        // sides of the transfer: the vault's stock balance decreases by exactly the reserve amount and
        // the recipient's balance increases by exactly the reserve amount.
        if (v.reserveAllocation > 0) {
            uint256 vaultBefore = IERC20(stockToken).balanceOf(address(this));
            uint256 rBefore = IERC20(stockToken).balanceOf(reserveRecipient);
            IERC20(stockToken).safeTransfer(reserveRecipient, v.reserveAllocation);
            uint256 vaultSent = vaultBefore - IERC20(stockToken).balanceOf(address(this));
            uint256 rReceived = IERC20(stockToken).balanceOf(reserveRecipient) - rBefore;
            if (vaultSent != v.reserveAllocation) {
                revert ReserveDeliveryMismatch(v.reserveAllocation, vaultSent);
            }
            if (rReceived != v.reserveAllocation) {
                revert ReserveDeliveryMismatch(v.reserveAllocation, rReceived);
            }
            emit ReserveAllocated(stockToken, reserveRecipient, v.reserveAllocation);
        }

        return v.actualStockOut;
    }

    // --- Distribution release (executor only, immutable recipient) -------------------------------

    /// @notice Release accounted distribution stock to the immutable DistributionFundingCoordinator.
    /// @dev Executor-only, nonReentrant, fixed recipient (no recipient parameter). Bounded by the
    ///      unreleased distribution allocation so unsolicited donations can never be released. This is
    ///      only the narrow custody-to-coordinator boundary: it does NOT publish or fund any
    ///      `DistributionClaimManager` cycle. Deployment stays blocked until the concrete coordinator
    ///      and the ownership/authorization sequence are finalized (see contract-level NatSpec).
    function releaseToDistributionCoordinator(address stockToken, uint256 amount)
        external
        nonReentrant
    {
        if (msg.sender != acquisitionExecutor) revert NotAuthorizedExecutor();
        if (!isApprovedStockToken[stockToken]) revert StockTokenNotApproved(stockToken);
        if (amount == 0) revert ZeroAmount();

        uint256 releasable = distributionAllocated[stockToken] - distributionReleased[stockToken];
        if (amount > releasable) revert ReleaseExceedsAllocation(amount, releasable);

        // Effects before interaction.
        distributionReleased[stockToken] += amount;

        // Verify BOTH sides: the vault's stock balance decreases by exactly `amount` and the
        // coordinator's balance increases by exactly `amount`.
        uint256 vaultBefore = IERC20(stockToken).balanceOf(address(this));
        uint256 before = IERC20(stockToken).balanceOf(distributionFundingCoordinator);
        IERC20(stockToken).safeTransfer(distributionFundingCoordinator, amount);
        uint256 vaultSent = vaultBefore - IERC20(stockToken).balanceOf(address(this));
        uint256 received = IERC20(stockToken).balanceOf(distributionFundingCoordinator) - before;
        if (vaultSent != amount) revert DistributionDeliveryMismatch(amount, vaultSent);
        if (received != amount) revert DistributionDeliveryMismatch(amount, received);

        emit DistributionReleased(stockToken, distributionFundingCoordinator, amount);
    }

    // --- Views -----------------------------------------------------------------------------------

    /// @notice The frozen approved stock basket.
    function approvedStockTokens() external view returns (address[] memory) {
        return _approvedStockTokens;
    }

    function approvedStockTokenCount() external view returns (uint256) {
        return _approvedStockTokens.length;
    }

    function approvedStockTokenAt(uint256 index) external view returns (address) {
        return _approvedStockTokens[index];
    }

    /// @notice Distribution stock still releasable to the coordinator for `stockToken`.
    function distributionReleasable(address stockToken) external view returns (uint256) {
        return distributionAllocated[stockToken] - distributionReleased[stockToken];
    }

    /// @notice Unattributed WETH custody balance (may include unsolicited donations as well as
    ///         router-delivered budget; the vault does not claim all WETH is protocol-generated).
    function availableWethCustody() external view returns (uint256) {
        return weth.balanceOf(address(this));
    }

    /// @notice Unsolicited (donated) `stockToken` balance beyond the accounted, unreleased
    ///         distribution allocation. Derived from the donation-safe inequality
    ///         `balanceOf(vault) + released >= allocated` (equality only when there are no donations).
    function unsolicitedStockBalance(address stockToken) external view returns (uint256) {
        uint256 accountedInVault =
            distributionAllocated[stockToken] - distributionReleased[stockToken];
        uint256 balance = IERC20(stockToken).balanceOf(address(this));
        return balance > accountedInVault ? balance - accountedInVault : 0;
    }
}
