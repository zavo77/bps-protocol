// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IGuardedSettlementExecutor
/// @notice Interface for the Safe-controlled guarded executor of the Rialto feature-2 WETH->stock-token
///         settlement on Robinhood Chain (chain 4663). Implemented by `GuardedSettlementExecutor`
///         (TASK 10K-4). Production-shaped but undeployed, paused by default, unconfigured for the
///         observed selector, and unusable until a per-selector calldata validator + price guard are set.
///         The executor is itself the settlement taker and purchased-token recipient; a future Safe (the
///         controller = owner) is the only account that may configure, pause, or settle. D-24 stands.
interface IGuardedSettlementExecutor {
    /// @notice Controller-supplied settlement request. `callData` is the router calldata; it is validated
    ///         by the per-selector validator and NEVER emitted/persisted. `taker` is implicitly the
    ///         executor. `intentDigest` and `calldataHash` are checked against on-chain recomputation.
    struct SettlementParams {
        address sellToken;
        address buyToken;
        uint256 sellAmount;
        uint256 minBuyAmount;
        address target; // must equal registry.ownerOf(2) at execution time
        bytes4 selector; // must have a registered validator; must lead callData
        bytes callData; // router calldata (not emitted)
        uint16 platformFeeBps; // <= MAX_PLATFORM_FEE_BPS
        bool integratorFeePresent; // must be false
        uint16 slippageBps; // <= MAX_SLIPPAGE_BPS
        uint256 nonce; // single-use per controller
        uint256 deadline; // future, within MAX_DEADLINE_HORIZON_SEC
        bytes32 intentDigest; // must equal computeIntentDigest(...)
        bytes32 calldataHash; // must equal keccak256(callData)
    }

    /// @notice Explicit, domain-separated digest inputs (pure; enables cross-language parity vectors).
    struct DigestInput {
        bytes32 domain;
        uint256 chainId;
        address executor;
        address registryAddr;
        uint256 featureId;
        address target;
        bytes4 selector;
        address sellToken;
        address buyToken;
        uint256 sellAmount;
        uint256 minBuyAmount;
        uint16 platformFeeBps;
        uint16 slippageBps;
        address taker;
        uint256 nonce;
        uint256 deadline;
        bytes32 calldataHash;
    }

    // --- Errors (distinct; never collapsed) ---
    error ZeroAddress();
    error InvalidController();
    error InvalidSystemAddress();
    error NotAContract(address target);
    error WrongChain(uint256 chainId);
    error PriceGuardUnset();
    error PairNotAllowed();
    error WrongTokenOrDirection();
    error ZeroAmount();
    error AmountCapUnset();
    error AmountExceedsCap();
    error CapCeilingExceeded();
    error FeeTooHigh();
    error IntegratorFeeForbidden();
    error SlippageTooHigh();
    error NonzeroValue();
    error CalldataHashMismatch();
    error DigestMismatch();
    error MissingOrExpiredDeadline();
    error DeadlineTooFar();
    error NonceUsed();
    error DigestUsed();
    error ZeroCodeHash();
    error ZeroSelector();
    error RouterCodeUnset();
    error ConfigIncomplete();
    error SelectorUnapproved();
    error CodeHashMismatch(bytes32 actual, bytes32 approved);
    error RouterFeatureUninitialized();
    error ZeroRouter();
    error RouterMismatch(address target, address current);
    error InvalidRouterTarget(address router);
    error AllowanceNotZeroBefore(uint256 current);
    error RouterCallFailed();
    error MinBuyNotMet(uint256 minimum, uint256 received);
    error AllowanceNotCleared(uint256 remaining);
    error ResidualSellToken(uint256 before, uint256 afterBalance);

    // --- Events (sanitized; never contain calldata/credentials/quote ids) ---
    event ApprovedRouterCodeSet(bytes32 indexed codeHash, bytes4 indexed selector);
    event TokenPairAllowedSet(address indexed sellToken, address indexed buyToken, bool allowed);
    event MaxSellAmountSet(address indexed sellToken, uint256 maxAmount);
    event PriceGuardSet(address indexed priceGuard);
    event SettlementExecuted(
        bytes32 indexed intentDigest,
        uint256 indexed nonce,
        address indexed router,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 received,
        bytes4 selector
    );
    event TokensRecovered(address indexed token, address indexed to, uint256 amount);

    // --- Controller-only configuration (starts unset => fail closed) ---
    function setApprovedRouterCode(bytes32 codeHash, bytes4 selector) external;
    function setTokenPairAllowed(address sellToken, address buyToken, bool allowed) external;
    function setMaxSellAmount(address sellToken, uint256 maxAmount) external;
    function setPriceGuard(address priceGuard) external;
    function pause() external;
    function unpause() external;
    function recover(address token, uint256 amount) external;

    // --- Settlement (controller-only, whenNotPaused, nonReentrant) ---
    function executeSettlement(SettlementParams calldata params) external returns (uint256 received);

    // --- Views ---
    function weth() external view returns (address);
    function stockToken() external view returns (address);
    function registry() external view returns (address);
    function priceGuard() external view returns (address);
    function approvedRouterCodeHash() external view returns (bytes32);
    function approvedSelector() external view returns (bytes4);
    function isTokenPairAllowed(address sellToken, address buyToken) external view returns (bool);
    function maxSellAmount(address sellToken) external view returns (uint256);
    function isDigestConsumed(bytes32 intentDigest) external view returns (bool);
    function isNonceUsed(uint256 nonce) external view returns (bool);
    function computeIntentDigest(DigestInput calldata input) external pure returns (bytes32);
}
