// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IStockAcquisitionAdapter} from "../interfaces/IStockAcquisitionAdapter.sol";
import {IStockAcquisitionVaultView} from "../interfaces/IStockAcquisitionVaultView.sol";
import {IRialtoRouterRegistry} from "../interfaces/IRialtoRouterRegistry.sol";

/// @title RialtoStockAcquisitionAdapter
/// @notice The production `IStockAcquisitionAdapter` for BPS v1: converts the vault's custodied WETH
///         into an approved stock token by executing a Rialto **allowance-settlement** quote against
///         the current registry-locked taker-submitted swap router (feature ID 2), then forwards the
///         acquired stock to the vault. Non-upgradeable, no owner/setter/pause/sweep/rescue/withdrawal,
///         no proxy/delegatecall/upgrade, no Permit2, no gasless relay, no Universal Router.
/// @dev Trust model. Rialto instructs integrations NOT to modify the returned `tx.data`, so the adapter
///      forwards the unmodified quote calldata via a low-level `call` — but ONLY to the address the
///      registry currently returns for feature 2, and with WETH approved to exactly that router for
///      exactly the input. Safety comes from strict, venue-agnostic invariants that hold regardless of
///      what the calldata encodes: registry-locked target, exact-input WETH consumption, observed
///      stock-delta >= minimum, no new net residual WETH/stock custody at the adapter, cleared
///      approval, and atomic revert on any mismatch. A malicious quote can therefore only reduce output
///      (caught by the minimum) or fail (reverts) — it can never redirect the vault's WETH or credit
///      the wrong asset. There is NO stable settlement selector pinned: the official router ABI/selector
///      was not independently verified in this task, so per the spec the design relies on the
///      registry-locked target plus these invariants rather than guessing a selector (recorded as a
///      config blocker — pin the exact selector once the deployed router ABI is verified).
///
///      DEPLOYMENT IS NOT AUTHORIZED here and the constructor does NOT prove production wiring. The
///      vault↔adapter immutability is circular (the frozen vault stores this adapter immutably and this
///      adapter stores the vault immutably), so the vault address must be a pre-computed
///      (deterministic / nonce-predicted) address bound through a later reviewed deployment procedure
///      that constructs the second contract at exactly the predicted address and verifies both
///      immutables on-chain. The constructor code-checks WETH and the registry (already-deployed
///      dependencies) but intentionally does NOT code-check the vault. The registry ABI, the current
///      feature-2 router, the WETH address, and the approved stock-token addresses are later deployment
///      gates, not construction guarantees. There is NO native-ETH receive/fallback; forced ETH (e.g.
///      via selfdestruct/coinbase) cannot be prevented and, with no recovery path, would remain stuck.
///
///      All assets, addresses, and executions exercised in this repository's tests are fictional and
///      local; nothing here is deployed or connected to any network, and no Rialto API is called.
contract RialtoStockAcquisitionAdapter is IStockAcquisitionAdapter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The frozen StockAcquisitionVault — the only permitted caller and the acquired-stock
    ///         recipient. Also the source of the approved stock basket.
    address public immutable stockAcquisitionVault;
    IERC20 public immutable weth;
    IRialtoRouterRegistry public immutable routerRegistry;
    /// @notice Rialto registry feature ID for the active taker-submitted swap router.
    uint256 public constant SWAP_ROUTER_FEATURE_ID = 2;

    /// @notice The minimal adapter-specific execution payload carried in `executionData`. It contains
    ///         only the Rialto quote's target and unmodified calldata plus the quote's own expiry —
    ///         no caller-selected value, approval spender, secondary target, or callback.
    struct RialtoExecution {
        address target; // must equal routerRegistry.ownerOf(2)
        bytes callData; // the unmodified Rialto quote tx.data
        uint256 quoteDeadline; // the quote's own expiry (stale quote reverts)
    }

    error ZeroAddress();
    error InvalidSystemAddress();
    error NotAContract(address target);
    error NotVault();
    error StockNotApproved(address stockToken);
    error InvalidStock();
    error ZeroAmountIn();
    error ZeroMinimumOutput();
    error ExpiredDeadline();
    error ExpiredQuote();
    error EmptyCallData();
    error RouterFeatureUninitialized();
    error StaleOrWrongRouter(address quoted, address current);
    error InvalidRouterTarget(address target);
    error FundingMismatch(uint256 expected, uint256 actual);
    error RouterCallFailed();
    error MinimumStockOutNotMet(uint256 minimum, uint256 observed);
    error ResidualWethInAdapter(uint256 before, uint256 afterBalance);
    error ResidualStockInAdapter(uint256 before, uint256 afterBalance);
    error ApprovalNotCleared(uint256 remaining);

    /// @param vault_ Immutable StockAcquisitionVault (may be a pre-computed address without code yet —
    ///        see the circular-deployment note in the contract NatSpec).
    /// @param weth_ Immutable WETH token (must already have code).
    /// @param registry_ Immutable Rialto Router Registry (must already have code).
    constructor(address vault_, address weth_, address registry_) {
        if (vault_ == address(0) || weth_ == address(0) || registry_ == address(0)) {
            revert ZeroAddress();
        }
        if (weth_ == vault_ || weth_ == registry_ || vault_ == registry_) {
            revert InvalidSystemAddress();
        }
        if (weth_.code.length == 0) revert NotAContract(weth_);
        if (registry_.code.length == 0) revert NotAContract(registry_);

        stockAcquisitionVault = vault_;
        weth = IERC20(weth_);
        routerRegistry = IRialtoRouterRegistry(registry_);
    }

    // Intermediate state held in memory to keep the function within the stack limit.
    struct AcquireVars {
        uint256 adapterWethBefore;
        uint256 adapterStockBefore;
        address router;
        uint256 acquired;
    }

    /// @inheritdoc IStockAcquisitionAdapter
    function acquireStock(
        address stockToken,
        uint256 wethAmountIn,
        uint256 minStockOut,
        uint256 deadline,
        bytes calldata executionData
    ) external nonReentrant returns (uint256) {
        if (msg.sender != stockAcquisitionVault) revert NotVault();
        if (!IStockAcquisitionVaultView(stockAcquisitionVault).isApprovedStockToken(stockToken)) {
            revert StockNotApproved(stockToken);
        }
        if (stockToken == address(weth)) revert InvalidStock();
        if (wethAmountIn == 0) revert ZeroAmountIn();
        if (minStockOut == 0) revert ZeroMinimumOutput();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert ExpiredDeadline();

        RialtoExecution memory ex = abi.decode(executionData, (RialtoExecution));
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > ex.quoteDeadline) revert ExpiredQuote();
        if (ex.callData.length < 4) revert EmptyCallData(); // must carry at least a selector

        AcquireVars memory v;
        // Registry target lock: accept ONLY the current feature-2 router (never prev/next/staged).
        v.router = routerRegistry.ownerOf(SWAP_ROUTER_FEATURE_ID);
        if (v.router == address(0)) revert RouterFeatureUninitialized();
        if (ex.target != v.router) revert StaleOrWrongRouter(ex.target, v.router);
        if (v.router.code.length == 0) revert NotAContract(v.router);
        if (
            v.router == address(routerRegistry) || v.router == stockAcquisitionVault
                || v.router == address(this) || v.router == address(weth) || v.router == stockToken
        ) {
            revert InvalidRouterTarget(v.router);
        }

        v.adapterWethBefore = weth.balanceOf(address(this));
        v.adapterStockBefore = IERC20(stockToken).balanceOf(address(this));

        // Pull exactly `wethAmountIn` from the vault and verify exact receipt (rejects fee-on-transfer).
        weth.safeTransferFrom(stockAcquisitionVault, address(this), wethAmountIn);
        if (weth.balanceOf(address(this)) - v.adapterWethBefore != wethAmountIn) {
            revert FundingMismatch(
                wethAmountIn, weth.balanceOf(address(this)) - v.adapterWethBefore
            );
        }

        v.acquired = _executeQuote(stockToken, wethAmountIn, minStockOut, v, ex);

        // Forward exactly the observed acquired stock to the vault; the adapter must end at baseline.
        IERC20(stockToken).safeTransfer(stockAcquisitionVault, v.acquired);
        uint256 adapterStockAfter = IERC20(stockToken).balanceOf(address(this));
        if (adapterStockAfter != v.adapterStockBefore) {
            revert ResidualStockInAdapter(v.adapterStockBefore, adapterStockAfter);
        }

        return v.acquired; // only the vault-observed acquired amount
    }

    /// @dev Approve only the registry-locked router for exactly `wethAmountIn`, execute the unmodified
    ///      quote calldata with zero native value, clear the approval, and verify exact WETH
    ///      consumption + minimum stock. Extracted to keep `acquireStock` within the stack limit.
    function _executeQuote(
        address stockToken,
        uint256 wethAmountIn,
        uint256 minStockOut,
        AcquireVars memory v,
        RialtoExecution memory ex
    ) internal returns (uint256 acquired) {
        weth.forceApprove(v.router, wethAmountIn);
        // Unmodified Rialto quote calldata, forwarded ONLY to the registry-locked router, zero value.
        (bool ok,) = v.router.call(ex.callData);
        if (!ok) revert RouterCallFailed();
        weth.forceApprove(v.router, 0);

        // Observed acquired stock is authoritative; never trust router return data.
        acquired = IERC20(stockToken).balanceOf(address(this)) - v.adapterStockBefore;
        if (acquired < minStockOut) revert MinimumStockOutNotMet(minStockOut, acquired);
        // WETH must be fully consumed by the swap (adapter back to its pre-call baseline).
        uint256 adapterWethAfter = weth.balanceOf(address(this));
        if (adapterWethAfter != v.adapterWethBefore) {
            revert ResidualWethInAdapter(v.adapterWethBefore, adapterWethAfter);
        }
        uint256 remaining = weth.allowance(address(this), v.router);
        if (remaining != 0) revert ApprovalNotCleared(remaining);
    }
}
