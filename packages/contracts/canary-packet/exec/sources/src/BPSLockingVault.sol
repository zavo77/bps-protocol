// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title BPSLockingVault
/// @notice Minimal locking vault for the capped BPS pilot. Users lock real BPS for one of four
///         fixed terms and receive non-transferable internal reward weight (veBPS) under the frozen
///         `vebps-1` policy. The vault preserves principal exactly, exposes deterministic records
///         and events for the later epoch indexer, and has no discretionary economic or
///         token-withdrawal authority.
/// @dev veBPS is non-transferable internal reward power only: it is NOT a second ERC-20, a
///      transferable receipt, an NFT, a reserve claim, a guaranteed reward/yield/APY, or additional
///      BPS supply. There is no veBPS balance/allowance/approval/transfer/delegation surface. The
///      vault never mints, burns, or modifies BPSToken; it only holds and returns locked principal.
///      All tokens, owners, wallets, positions, and actions exercised in this repository's tests are
///      fictional and local; nothing here is deployed or connected to any network.
contract BPSLockingVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    // --- Frozen vebps-1 policy (no setters; a future policy needs a new reviewed deployment) -----

    /// @notice Human-readable policy identifier.
    string public constant POLICY_NAME = "vebps-1";
    /// @notice Numeric policy version (public marker).
    uint256 public constant POLICY_VERSION = 1;
    /// @dev Same version as the compact type stored in each position (avoids a truncating cast).
    uint16 internal constant POLICY_VERSION_U16 = 1;

    uint16 internal constant BPS_DENOMINATOR = 10_000;

    // Frozen tier durations (seconds). The unlocked/zero tier is a preview tier, not a valid lock.
    uint32 internal constant DURATION_7D = 7 days;
    uint32 internal constant DURATION_14D = 14 days;
    uint32 internal constant DURATION_21D = 21 days;
    uint32 internal constant DURATION_30D = 30 days;

    // Frozen tier multipliers (basis points, denominator 10_000).
    uint16 internal constant MULTIPLIER_UNLOCKED_BPS = 10_000; // 1.00x
    uint16 internal constant MULTIPLIER_7D_BPS = 11_000; // 1.10x
    uint16 internal constant MULTIPLIER_14D_BPS = 12_500; // 1.25x
    uint16 internal constant MULTIPLIER_21D_BPS = 15_000; // 1.50x
    uint16 internal constant MULTIPLIER_30D_BPS = 17_500; // 1.75x

    // --- Immutable configuration -----------------------------------------------------------------

    /// @notice The BPS token this vault locks. Immutable; the vault never mints/burns/modifies it.
    IERC20 public immutable bpsToken;

    // --- Position model --------------------------------------------------------------------------

    /// @notice A single independent lock position. Positions are never merged, extended, shortened,
    ///         renewed, split, transferred, or relocked. A later deposit creates a new position.
    struct LockPosition {
        uint256 principal;
        uint64 startTime;
        uint32 duration;
        uint64 unlockTime;
        uint16 multiplierBps;
        uint16 policyVersion;
        uint64 withdrawnAt; // 0 while unwithdrawn
        bool exists;
        bool withdrawn;
    }

    /// @notice Next lock id per wallet (also the wallet's lifetime lock count). Ids start at 0.
    mapping(address account => uint256) public lockCount;

    mapping(address account => mapping(uint256 lockId => LockPosition)) internal _positions;

    /// @notice Recorded unwithdrawn locked principal per wallet.
    mapping(address account => uint256) public lockedPrincipal;

    /// @notice Recorded total unwithdrawn locked principal across all wallets.
    uint256 public totalLockedPrincipal;

    // --- Emergency exit (one-way, terminal, participant-recovery only) ---------------------------

    /// @notice True once the owner has enabled the terminal emergency exit. Never reversible.
    bool public emergencyExitEnabled;
    /// @notice Timestamp at which emergency exit was enabled (0 while disabled).
    uint64 public emergencyExitEnabledAt;

    // --- Events ----------------------------------------------------------------------------------

    event LockCreated(
        address indexed account,
        uint256 indexed lockId,
        uint256 principal,
        uint64 startTime,
        uint32 duration,
        uint64 unlockTime,
        uint16 multiplierBps,
        uint16 policyVersion
    );
    event LockWithdrawn(
        address indexed account,
        uint256 indexed lockId,
        uint256 principal,
        uint64 withdrawnAt,
        bool emergency
    );
    event EmergencyExitEnabled(address indexed caller, uint64 timestamp);

    // --- Errors ----------------------------------------------------------------------------------

    error ZeroAddress();
    error ZeroAmount();
    error UnsupportedPolicyDuration(uint32 duration);
    error ZeroDurationLock();
    error FundingAmountMismatch(uint256 declared, uint256 received);
    error EmergencyExitAlreadyEnabled();
    error NewLocksDisabled();
    error LockNotFound();
    error LockNotExpired();
    error LockAlreadyWithdrawn();

    /// @param bpsToken_ Nonzero BPS token address (immutable).
    /// @param initialOwner Nonzero two-step owner (represents a future governance Safe).
    constructor(address bpsToken_, address initialOwner) Ownable(initialOwner) {
        if (bpsToken_ == address(0)) revert ZeroAddress();
        bpsToken = IERC20(bpsToken_);
    }

    // --- Policy (read-only, frozen) --------------------------------------------------------------

    /// @notice Exact frozen multiplier (basis points) for a policy duration. Returns 10_000 for the
    ///         zero/unlocked preview tier so clients can render the full table; reverts for any
    ///         duration that is not the unlocked tier or one of the four lock terms.
    function policyMultiplierBps(uint32 duration) public pure returns (uint16) {
        if (duration == 0) return MULTIPLIER_UNLOCKED_BPS;
        if (duration == DURATION_7D) return MULTIPLIER_7D_BPS;
        if (duration == DURATION_14D) return MULTIPLIER_14D_BPS;
        if (duration == DURATION_21D) return MULTIPLIER_21D_BPS;
        if (duration == DURATION_30D) return MULTIPLIER_30D_BPS;
        revert UnsupportedPolicyDuration(duration);
    }

    // --- Lock creation (self-only, exact funding, atomic) ----------------------------------------

    /// @notice Lock `amount` BPS for exactly one of the four fixed terms; returns the new lock id.
    /// @dev msg.sender is always the position owner and funding account. Zero duration is rejected
    ///      even though the policy helper exposes the unlocked 1.00x preview tier. The vault's
    ///      received balance delta must equal `amount` exactly, so short/fee/failed funding reverts
    ///      the entire creation with no surviving position, counter, accounting, or event.
    function createLock(uint256 amount, uint32 duration)
        external
        nonReentrant
        returns (uint256 lockId)
    {
        if (emergencyExitEnabled) revert NewLocksDisabled();
        if (amount == 0) revert ZeroAmount();
        if (duration == 0) revert ZeroDurationLock();
        uint16 multiplierBps = policyMultiplierBps(duration); // reverts for unsupported durations

        lockId = lockCount[msg.sender];

        uint256 balanceBefore = bpsToken.balanceOf(address(this));
        bpsToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = bpsToken.balanceOf(address(this)) - balanceBefore;
        if (received != amount) revert FundingAmountMismatch(amount, received);

        _recordLock(msg.sender, lockId, amount, duration, multiplierBps);
    }

    /// @dev Write the position and accounting after funding is confirmed. Extracted to keep
    ///      `createLock` within the stack limit.
    function _recordLock(
        address account,
        uint256 lockId,
        uint256 amount,
        uint32 duration,
        uint16 multiplierBps
    ) internal {
        uint64 startTime = block.timestamp.toUint64();
        uint64 unlockTime = startTime + uint64(duration);

        _positions[account][lockId] = LockPosition({
            principal: amount,
            startTime: startTime,
            duration: duration,
            unlockTime: unlockTime,
            multiplierBps: multiplierBps,
            policyVersion: POLICY_VERSION_U16,
            withdrawnAt: 0,
            exists: true,
            withdrawn: false
        });
        lockCount[account] = lockId + 1;
        lockedPrincipal[account] += amount;
        totalLockedPrincipal += amount;

        emit LockCreated(
            account,
            lockId,
            amount,
            startTime,
            duration,
            unlockTime,
            multiplierBps,
            POLICY_VERSION_U16
        );
    }

    // --- Withdrawal (self-only) ------------------------------------------------------------------

    /// @notice Withdraw the caller's own matured position (or any of their positions once emergency
    ///         exit is enabled). Returns exactly the recorded principal to msg.sender.
    function withdraw(uint256 lockId) external nonReentrant {
        LockPosition storage p = _positions[msg.sender][lockId];
        if (!p.exists) revert LockNotFound();
        if (p.withdrawn) revert LockAlreadyWithdrawn();
        if (!emergencyExitEnabled) {
            // forge-lint: disable-next-line(block-timestamp)
            if (block.timestamp < p.unlockTime) revert LockNotExpired();
        }

        uint256 principal = p.principal;
        uint64 withdrawnAt = block.timestamp.toUint64();

        // Effects before interaction.
        p.withdrawn = true;
        p.withdrawnAt = withdrawnAt;
        lockedPrincipal[msg.sender] -= principal;
        totalLockedPrincipal -= principal;

        bpsToken.safeTransfer(msg.sender, principal);
        emit LockWithdrawn(msg.sender, lockId, principal, withdrawnAt, emergencyExitEnabled);
    }

    // --- Emergency exit (owner-only, one-way, terminal) ------------------------------------------

    /// @notice Enable the terminal emergency exit: permanently blocks new locks and lets every
    ///         position owner withdraw their own principal early via {withdraw}. One-way and
    ///         irreversible; never transfers tokens by itself; the owner cannot withdraw, redirect,
    ///         seize, or assign participant principal. From activation, unwithdrawn positions carry
    ///         only 1.00x base weight; historical weight before activation is unchanged.
    function enableEmergencyExit() external onlyOwner {
        if (emergencyExitEnabled) revert EmergencyExitAlreadyEnabled();
        uint64 activatedAt = block.timestamp.toUint64();
        emergencyExitEnabled = true;
        emergencyExitEnabledAt = activatedAt;
        emit EmergencyExitEnabled(msg.sender, activatedAt);
    }

    // --- Read-only views (for UI and the future epoch indexer) -----------------------------------

    /// @notice A complete position by (account, lockId). `exists` is false for an unused id.
    function getPosition(address account, uint256 lockId)
        external
        view
        returns (LockPosition memory)
    {
        return _positions[account][lockId];
    }

    /// @notice Deterministic reward weight of a position at an arbitrary timestamp.
    /// @dev Boundary policy (frozen): zero before startTime; the stored tier multiplier while
    ///      startTime <= t < unlockTime and (emergency disabled or t < emergencyExitEnabledAt);
    ///      exactly 1.00x principal once expired-or-emergency-demoted while unwithdrawn; and zero at
    ///      and after withdrawnAt for a withdrawn position. Floor is applied once after multiplying.
    function positionWeightAt(address account, uint256 lockId, uint256 timestamp)
        public
        view
        returns (uint256)
    {
        LockPosition memory p = _positions[account][lockId];
        if (!p.exists) return 0;
        if (timestamp < p.startTime) return 0;
        if (p.withdrawn && timestamp >= p.withdrawnAt) return 0;

        bool bonusActive = timestamp < p.unlockTime;
        if (emergencyExitEnabled && timestamp >= emergencyExitEnabledAt) {
            bonusActive = false;
        }
        uint16 multiplierBps = bonusActive ? p.multiplierBps : MULTIPLIER_UNLOCKED_BPS;
        return Math.mulDiv(p.principal, multiplierBps, BPS_DENOMINATOR);
    }

    /// @notice Current reward weight of a position (at the current block timestamp).
    function positionWeight(address account, uint256 lockId) external view returns (uint256) {
        return positionWeightAt(account, lockId, block.timestamp);
    }
}
