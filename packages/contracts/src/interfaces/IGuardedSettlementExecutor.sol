// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IGuardedSettlementExecutor
/// @notice Contract-ready interface (TASK 10K-3) for a future Safe-controlled guarded executor of the
///         Rialto WETH->stock-token settlement on Robinhood Chain (chain 4663, registry feature 2).
/// @dev SPECIFICATION ONLY — no implementation is shipped in this task. The concrete executor + Foundry
///      tests are DEFERRED because the Solidity test runner cannot run offline in this checkout:
///      `packages/contracts/lib/` (forge-std) is gitignored and absent, and installing it requires a
///      network dependency download, which TASK 10K-3 forbids. OpenZeppelin (via root node_modules) and
///      the repo-owned `IRialtoRouterRegistry` ABI ARE present. The invariants below mirror the audited
///      offline TypeScript guard in `packages/rialto/src/guarded-settlement.ts` one-to-one.
///
///      A concrete implementation MUST:
///      - be Safe/owner-only (OpenZeppelin access control) and support an emergency pause;
///      - be non-reentrant (OpenZeppelin ReentrancyGuard) and use SafeERC20 for all token movement;
///      - resolve the router ONLY via `IRialtoRouterRegistry.ownerOf(2)` at execution time (which reverts
///        when the feature is paused/uninitialized) and require `params.target == ownerOf(2)`;
///      - enforce the selector allow-list, token-pair allow-list, and per-token sell cap;
///      - enforce deadline + replay protection (unique intent digest AND per-taker nonce);
///      - approve EXACTLY `sellAmount`, call ONLY the verified router, require the measured buy-token
///        balance delta `>= minBuyAmount`, then reset the router allowance to zero;
///      - mark the intent consumed atomically and emit a sanitized event (NO calldata);
///      - REVERT THE ENTIRE OPERATION if the router call, the minimum-return check, the allowance reset,
///        or the replay-state update fails.
///
///      Deliberately disabled by default: the selector allow-list, token allow-list, per-token caps, and
///      final taker/beneficiary are unset until explicitly configured by the controlling Safe. D-24
///      stands — deploying, configuring, or invoking this executor authorizes no acquisition/execution.
interface IGuardedSettlementExecutor {
    /// @notice Sanitized settlement parameters. `callData` is passed for the router call but is NEVER
    ///         emitted in events or logs; only its selector (first 4 bytes) and hash are checked/recorded.
    struct SettlementParams {
        address sellToken; // must be an allow-listed sell token (WETH)
        address buyToken; // must be the allow-listed counterpart (stock token)
        uint256 sellAmount; // > 0 and <= per-token cap
        uint256 minBuyAmount; // > 0; enforced as a measured balance delta
        address target; // must equal registry.ownerOf(2) at execution time
        bytes4 selector; // must be in the allow-list; must equal the leading 4 bytes of callData
        bytes callData; // router calldata; not emitted
        uint256 deadline; // must be in the future and within the max intent lifetime
        uint256 nonce; // per-taker replay nonce
        bytes32 intentDigest; // domain-separated digest; single-use
    }

    // --- Errors (mirror the offline guard's GuardStatus values; do not collapse into a generic error) ---
    error Paused();
    error NotOwner();
    error RouterUnresolvedOrPaused();
    error RouterMismatch();
    error SelectorUnapproved();
    error SelectorCalldataMismatch();
    error TokenNotAllowed();
    error TakerUnresolved();
    error AmountInvalid();
    error AmountLimitUnresolved();
    error AmountExceedsLimit();
    error NonzeroValue();
    error DeadlineMissingOrPassed();
    error IntentLifetimeExcessive();
    error ReplayDetected();
    error NonceReused();
    error MinBuyNotMet();
    error AllowanceResetFailed();

    // --- Events (sanitized; never include calldata or credentials) ---
    event SelectorAllowanceSet(bytes4 indexed selector, bool allowed);
    event TokenPairAllowanceSet(address indexed sellToken, address indexed buyToken, bool allowed);
    event MaxSellAmountSet(address indexed sellToken, uint256 maxAmount);
    event PausedSet(bool paused);
    event SettlementExecuted(
        bytes32 indexed intentDigest,
        address indexed sellToken,
        address indexed buyToken,
        uint256 sellAmount,
        uint256 received,
        address target
    );

    // --- Owner/Safe-only configuration (deliberately unset by default => fail closed) ---
    function setPaused(bool paused) external;
    function setSelectorAllowed(bytes4 selector, bool allowed) external;
    function setTokenPairAllowed(address sellToken, address buyToken, bool allowed) external;
    function setMaxSellAmount(address sellToken, uint256 maxAmount) external;

    // --- Read-only views ---
    function registry() external view returns (address);
    function feature() external view returns (uint256);
    function paused() external view returns (bool);
    function isSelectorAllowed(bytes4 selector) external view returns (bool);
    function isTokenPairAllowed(address sellToken, address buyToken) external view returns (bool);
    function maxSellAmount(address sellToken) external view returns (uint256);
    function isIntentConsumed(bytes32 intentDigest) external view returns (bool);
    function isNonceUsed(address taker, uint256 nonce) external view returns (bool);

    /// @notice Execute one guarded settlement. Owner/Safe-only, non-reentrant, whenNotPaused. Verifies the
    ///         registry, selector, token pair, cap, deadline and replay state; approves exactly
    ///         `sellAmount`; calls ONLY `registry.ownerOf(2)`; requires the measured buy delta
    ///         `>= minBuyAmount`; resets the allowance to zero; marks the intent consumed; emits a
    ///         sanitized event. Reverts the entire operation on ANY failure. Returns the received amount.
    function executeSettlement(SettlementParams calldata params) external returns (uint256 received);
}
