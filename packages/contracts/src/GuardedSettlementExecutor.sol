// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IGuardedSettlementExecutor} from "./interfaces/IGuardedSettlementExecutor.sol";
import {IRialtoRouterRegistry} from "./interfaces/IRialtoRouterRegistry.sol";
import {ISettlementPriceGuard} from "./interfaces/ISettlementPriceGuard.sol";
import {ISettlementCalldataValidator} from "./interfaces/ISettlementCalldataValidator.sol";

/// @title GuardedSettlementExecutor
/// @notice Safe-controlled guarded executor for the Rialto feature-2 WETH->stock-token settlement on
///         Robinhood Chain (chain 4663). Production-shaped but UNDEPLOYED and DISABLED by default:
///         constructed paused, with no price guard, no per-selector calldata validator, the WETH->NVDA
///         pair not enabled, and the per-token cap unset — so it fails closed until the controller
///         explicitly configures every component. The executor is itself the settlement taker and the
///         purchased-token recipient; a future Safe (the controller = owner) is the ONLY account that
///         may configure, pause/unpause, settle, or recover. There is NO arbitrary-call path, NO
///         delegatecall, NO arbitrary approvals, and NO policy-bypassing rescue.
/// @dev The observed Rialto selector `0x77963966` is EVIDENCE-ONLY and unproven; registering a validator
///      for it is hard-blocked on-chain (`EvidenceOnlySelectorDisabled`) until its authoritative ABI is
///      proven and a specific validator is implemented and tested via a source change. D-24 stands:
///      deploying, configuring, or invoking this contract authorizes no acquisition/execution. All assets
///      and executions in this repository's tests are fictional and local; nothing is deployed or
///      connected to any network and no Rialto API is called.
contract GuardedSettlementExecutor is
    IGuardedSettlementExecutor,
    Ownable2Step,
    Pausable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    uint256 public constant ROBINHOOD_CHAIN_ID = 4663;
    uint256 public constant SWAP_ROUTER_FEATURE_ID = 2;
    uint16 public constant MAX_PLATFORM_FEE_BPS = 5;
    uint16 public constant MAX_SLIPPAGE_BPS = 100;
    uint16 public constant MAX_PRICE_DEVIATION_BPS = 100;
    /// @notice Candidate private-canary ceiling: no configured per-token cap may exceed 0.01 WETH.
    uint256 public constant CANARY_MAX_SELL_WETH = 10_000_000_000_000_000; // 0.01e18
    /// @notice Maximum permitted intent lifetime horizon (deadline no more than 5 minutes in the future).
    uint256 public constant MAX_DEADLINE_HORIZON_SEC = 300;
    bytes32 public constant GUARD_DOMAIN = keccak256("BPS-GUARDED-SETTLEMENT/1");
    address internal constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    bytes4 internal constant EVIDENCE_ONLY_SELECTOR = 0x77963966;

    address public immutable weth;
    address public immutable stockToken;
    address public immutable registry;
    address public priceGuard;

    mapping(bytes4 => address) public selectorValidator;
    mapping(address => uint256) public maxSellAmount;
    mapping(address => mapping(address => bool)) private _pairAllowed;
    mapping(bytes32 => bool) private _consumedDigest;
    mapping(uint256 => bool) private _usedNonce;

    /// @notice The observed selector is disabled at the contract level until authoritative proof exists.
    error EvidenceOnlySelectorDisabled();

    /// @param controller_ Future Safe controller (owner). Must be nonzero, not the dead address, and not
    ///        the executor itself.
    /// @param weth_ WETH token (must already have code).
    /// @param stock_ Stock token — NVDA (must already have code).
    /// @param registry_ Rialto Router Registry (must already have code).
    constructor(address controller_, address weth_, address stock_, address registry_)
        Ownable(controller_)
    {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.chainid != ROBINHOOD_CHAIN_ID) revert WrongChain(block.chainid);
        if (weth_ == address(0) || stock_ == address(0) || registry_ == address(0)) {
            revert ZeroAddress();
        }
        if (controller_ == DEAD_ADDRESS || controller_ == address(this)) {
            revert InvalidController();
        }
        if (
            weth_ == stock_ || weth_ == registry_ || stock_ == registry_ || controller_ == weth_
                || controller_ == stock_ || controller_ == registry_
        ) {
            revert InvalidSystemAddress();
        }
        if (weth_.code.length == 0) revert NotAContract(weth_);
        if (stock_.code.length == 0) revert NotAContract(stock_);
        if (registry_.code.length == 0) revert NotAContract(registry_);

        weth = weth_;
        stockToken = stock_;
        registry = registry_;
        _pause(); // start paused / fail closed
    }

    // --- Controller-only configuration ---

    /// @inheritdoc IGuardedSettlementExecutor
    function setSelectorValidator(bytes4 selector, address validator) external onlyOwner {
        if (selector == EVIDENCE_ONLY_SELECTOR) revert EvidenceOnlySelectorDisabled();
        if (validator != address(0) && validator.code.length == 0) revert NotAContract(validator);
        selectorValidator[selector] = validator;
        emit SelectorValidatorSet(selector, validator);
    }

    /// @inheritdoc IGuardedSettlementExecutor
    function setTokenPairAllowed(address sellToken, address buyToken, bool allowed)
        external
        onlyOwner
    {
        // Only the WETH->NVDA direction is ever configurable.
        if (sellToken != weth || buyToken != stockToken) revert WrongTokenOrDirection();
        _pairAllowed[sellToken][buyToken] = allowed;
        emit TokenPairAllowedSet(sellToken, buyToken, allowed);
    }

    /// @inheritdoc IGuardedSettlementExecutor
    function setMaxSellAmount(address sellToken, uint256 maxAmount) external onlyOwner {
        if (sellToken != weth) revert WrongTokenOrDirection();
        if (maxAmount > CANARY_MAX_SELL_WETH) revert CapCeilingExceeded();
        maxSellAmount[sellToken] = maxAmount;
        emit MaxSellAmountSet(sellToken, maxAmount);
    }

    /// @inheritdoc IGuardedSettlementExecutor
    function setPriceGuard(address priceGuard_) external onlyOwner {
        if (priceGuard_ == address(0)) revert ZeroAddress();
        if (priceGuard_.code.length == 0) revert NotAContract(priceGuard_);
        priceGuard = priceGuard_;
        emit PriceGuardSet(priceGuard_);
    }

    /// @inheritdoc IGuardedSettlementExecutor
    function pause() external onlyOwner {
        _pause();
    }

    /// @inheritdoc IGuardedSettlementExecutor
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @inheritdoc IGuardedSettlementExecutor
    /// @dev Narrow recovery: moves at most the contract's existing balance of `token` to the controller.
    ///      Cannot target an arbitrary recipient, cannot call an arbitrary contract, cannot alter replay
    ///      state, and is `nonReentrant` so it is unavailable during an active settlement.
    function recover(address token, uint256 amount) external onlyOwner nonReentrant {
        uint256 bal = IERC20(token).balanceOf(address(this));
        uint256 amt = amount > bal ? bal : amount;
        IERC20(token).safeTransfer(owner(), amt);
        emit TokensRecovered(token, owner(), amt);
    }

    // --- Views ---

    /// @inheritdoc IGuardedSettlementExecutor
    function isTokenPairAllowed(address sellToken, address buyToken) external view returns (bool) {
        return _pairAllowed[sellToken][buyToken];
    }

    /// @inheritdoc IGuardedSettlementExecutor
    function isDigestConsumed(bytes32 intentDigest) external view returns (bool) {
        return _consumedDigest[intentDigest];
    }

    /// @inheritdoc IGuardedSettlementExecutor
    function isNonceUsed(uint256 nonce) external view returns (bool) {
        return _usedNonce[nonce];
    }

    /// @inheritdoc IGuardedSettlementExecutor
    /// @dev Pure, explicit-input digest for cross-language parity. All fields are static, so
    ///      `abi.encode(input)` equals the concatenation of the individually-encoded fields.
    function computeIntentDigest(DigestInput calldata input) external pure returns (bytes32) {
        return keccak256(abi.encode(input));
    }

    // --- Settlement ---

    // Intermediate state kept in memory to stay within the stack limit.
    struct SettleVars {
        bytes32 digest;
        address router;
        uint256 stockBefore;
        uint256 received;
    }

    /// @inheritdoc IGuardedSettlementExecutor
    /// @dev Controller-only, whenNotPaused, nonReentrant, and non-payable (so `msg.value` is always 0).
    function executeSettlement(SettlementParams calldata p)
        external
        onlyOwner
        whenNotPaused
        nonReentrant
        returns (uint256 received)
    {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.chainid != ROBINHOOD_CHAIN_ID) revert WrongChain(block.chainid);
        if (priceGuard == address(0)) revert PriceGuardUnset();

        // Token + direction.
        if (p.sellToken != weth || p.buyToken != stockToken) revert WrongTokenOrDirection();
        if (!_pairAllowed[weth][stockToken]) revert PairNotAllowed();

        // Amounts + per-token cap.
        if (p.sellAmount == 0 || p.minBuyAmount == 0) revert ZeroAmount();
        uint256 cap = maxSellAmount[weth];
        if (cap == 0) revert AmountCapUnset();
        if (p.sellAmount > cap) revert AmountExceedsCap();

        // Fees + slippage.
        if (p.platformFeeBps > MAX_PLATFORM_FEE_BPS) revert FeeTooHigh();
        if (p.integratorFeePresent) revert IntegratorFeeForbidden();
        if (p.slippageBps > MAX_SLIPPAGE_BPS) revert SlippageTooHigh();

        // Deadline window.
        // forge-lint: disable-next-line(block-timestamp)
        if (p.deadline == 0 || block.timestamp > p.deadline) revert MissingOrExpiredDeadline();
        // forge-lint: disable-next-line(block-timestamp)
        if (p.deadline - block.timestamp > MAX_DEADLINE_HORIZON_SEC) revert DeadlineTooFar();

        // Calldata hash + digest binding.
        if (p.callData.length < 4) revert CalldataHashMismatch();
        if (keccak256(p.callData) != p.calldataHash) revert CalldataHashMismatch();

        SettleVars memory v;
        v.digest = _digestFor(p);
        if (v.digest != p.intentDigest) revert DigestMismatch();
        if (_consumedDigest[v.digest]) revert DigestUsed();
        if (_usedNonce[p.nonce]) revert NonceUsed();

        // Selector must have a registered validator (a selector allow-list alone is insufficient).
        address validator = selectorValidator[p.selector];
        if (validator == address(0)) revert SelectorNoValidator();

        // Registry lock: the current feature-2 router (reverts if paused/uninitialized). Never accept the
        // previous/next router, a quote-supplied router, an env value, or an operator override.
        v.router = IRialtoRouterRegistry(registry).ownerOf(SWAP_ROUTER_FEATURE_ID);
        if (v.router == address(0)) revert ZeroRouter();
        if (p.target != v.router) revert RouterMismatch(p.target, v.router);
        if (v.router.code.length == 0) revert NotAContract(v.router);
        if (
            v.router == registry || v.router == weth || v.router == stockToken
                || v.router == address(this) || v.router == priceGuard || v.router == validator
        ) {
            revert InvalidRouterTarget(v.router);
        }

        // EFFECTS before the external call: mark replay state (atomic revert restores it on any failure).
        _consumedDigest[v.digest] = true;
        _usedNonce[p.nonce] = true;

        // Selector-specific COMPLETE-calldata validation against the exact intent (recipient = executor).
        ISettlementCalldataValidator(validator)
            .validate(
                p.selector,
                p.callData,
                ISettlementCalldataValidator.IntentView({
                sellToken: weth,
                buyToken: stockToken,
                sellAmount: p.sellAmount,
                minBuyAmount: p.minBuyAmount,
                recipient: address(this),
                maxPlatformFeeBps: MAX_PLATFORM_FEE_BPS
            })
            );

        // Price guard (D-22B): reverts unless acceptable against a trusted, fresh reference.
        ISettlementPriceGuard(priceGuard)
            .check(weth, stockToken, p.sellAmount, p.minBuyAmount, MAX_PRICE_DEVIATION_BPS);

        // Atomic settlement: exact allowance -> verified router call -> min received-delta -> reset.
        v.stockBefore = IERC20(stockToken).balanceOf(address(this));
        uint256 existing = IERC20(weth).allowance(address(this), v.router);
        if (existing != 0) revert AllowanceNotZeroBefore(existing);
        IERC20(weth).forceApprove(v.router, p.sellAmount);

        (bool ok,) = v.router.call(p.callData); // zero native value (non-payable function)
        if (!ok) revert RouterCallFailed();

        v.received = IERC20(stockToken).balanceOf(address(this)) - v.stockBefore;
        if (v.received < p.minBuyAmount) revert MinBuyNotMet(p.minBuyAmount, v.received);

        IERC20(weth).forceApprove(v.router, 0);
        uint256 remaining = IERC20(weth).allowance(address(this), v.router);
        if (remaining != 0) revert AllowanceNotCleared(remaining);

        emit SettlementExecuted(
            v.digest, p.nonce, v.router, weth, stockToken, p.sellAmount, v.received, p.selector
        );
        return v.received;
    }

    function _digestFor(SettlementParams calldata p) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DigestInput({
                    domain: GUARD_DOMAIN,
                    chainId: block.chainid,
                    executor: address(this),
                    registryAddr: registry,
                    featureId: SWAP_ROUTER_FEATURE_ID,
                    target: p.target,
                    selector: p.selector,
                    sellToken: p.sellToken,
                    buyToken: p.buyToken,
                    sellAmount: p.sellAmount,
                    minBuyAmount: p.minBuyAmount,
                    platformFeeBps: p.platformFeeBps,
                    slippageBps: p.slippageBps,
                    taker: address(this),
                    nonce: p.nonce,
                    deadline: p.deadline,
                    calldataHash: p.calldataHash
                })
            )
        );
    }
}
