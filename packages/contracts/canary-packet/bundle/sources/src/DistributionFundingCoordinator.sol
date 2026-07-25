// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IStockAcquisitionVaultOps} from "./interfaces/IStockAcquisitionVaultOps.sol";
import {IDistributionClaimManagerFunding} from "./interfaces/IDistributionClaimManagerFunding.sol";

/// @title DistributionFundingCoordinator
/// @notice Binds each stock acquisition to exactly one distribution cycle, sourcing every amount from
///         the frozen `StockAcquisitionVault`'s own on-chain accounting rather than any caller-reported
///         value. The coordinator occupies BOTH of the frozen vault's immutable roles — its
///         `acquisitionExecutor` and its `distributionFundingCoordinator` (the frozen constructor
///         permits `acquisitionExecutor == distributionFundingCoordinator`). As the sole executor it is
///         the ONLY contract that can move the vault's acquisition counters, so it records each
///         acquisition atomically from the vault's exact before/after cumulative deltas, assigns a
///         monotonic acquisition id, and later releases-and-funds exactly that recorded 80% once,
///         bound to one claim-cycle id. This preserves the frozen vault while closing the
///         per-acquisition acceptance gap.
/// @dev Non-upgradeable and minimal in authority: NO owner, NO mutable setter, NO arbitrary recipient,
///      NO withdrawal/sweep/rescue, NO generic call, NO custody beyond same-transaction transit, NO
///      caller-selected token or amount, and no support for tokens outside the vault's frozen approved
///      basket. Two trusted immutable roles remain a documented restricted-beta dependency:
///      `acquisitionOperator` (supplies the off-chain Rialto quote and `minStockOut` and initiates
///      acquisitions — safe permissionless minimum-price enforcement is not yet available) and
///      `rootPublisher` (supplies the governed Proof-of-Distribution root/window). The coordinator is
///      the frozen claim manager's owner (set at deployment via a predicted address — no setter).
///
///      State machine per acquisition id: NONE -> RECORDED (on `executeAndRecordAcquisition`) ->
///      FUNDED (on `fundRecordedAcquisition`). No state permits tokens to be withdrawn or redirected;
///      the RECORDED->FUNDED transition releases exactly the recorded amount to the coordinator and
///      immediately funds the claim manager in the same transaction, verified by exact balance deltas.
///
///      DEPLOYMENT IS NOT AUTHORIZED here. The vault<->coordinator immutability is circular (the frozen
///      vault stores this coordinator immutably for both roles and this coordinator stores the vault
///      immutably), resolved by nonce-predicted CREATE with on-chain immutable verification, no
///      one-time setter. The constructor code-checks the claim manager (already deployed) but not the
///      vault (predicted). There is NO native-ETH receive/fallback. All assets/addresses/cycles in this
///      repository's tests are fictional and local; nothing is deployed and no PoD root is fabricated.
contract DistributionFundingCoordinator is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IStockAcquisitionVaultOps public immutable stockAcquisitionVault;
    IDistributionClaimManagerFunding public immutable distributionClaimManager;
    /// @notice Trusted keeper that initiates acquisitions (supplies the off-chain quote + minStockOut).
    address public immutable acquisitionOperator;
    /// @notice Governed publisher that supplies the Proof-of-Distribution root/window and funds cycles.
    address public immutable rootPublisher;

    enum AcquisitionStatus {
        NONE,
        RECORDED,
        FUNDED
    }

    /// @notice The exact per-acquisition record, derived only from the vault's observed deltas.
    struct AcquisitionRecord {
        AcquisitionStatus status;
        address stockToken;
        uint256 wethSpent;
        uint256 acquiredStock;
        uint256 distributionAmount; // exact 80% (vault rule)
        uint256 reserveAmount; // exact 20% + remainder (delivered by the vault to its reserve recipient)
        uint256 cycleId; // set on funding
    }

    /// @notice Acquisition records by monotonic id (ids start at 1; 0 is never a valid acquisition).
    mapping(uint256 acquisitionId => AcquisitionRecord) public acquisitions;
    /// @notice The last assigned acquisition id (next id is `acquisitionCount + 1`).
    uint256 public acquisitionCount;
    /// @notice Whether a claim-cycle id has already been bound to an acquisition.
    mapping(uint256 cycleId => bool) public cycleUsed;
    /// @notice The acquisition id bound to a claim-cycle id (0 if unused).
    mapping(uint256 cycleId => uint256) public cycleAcquisitionId;

    event AcquisitionRecorded(
        uint256 indexed acquisitionId,
        address indexed stockToken,
        address indexed operator,
        uint256 wethSpent,
        uint256 acquiredStock,
        uint256 distributionAmount,
        uint256 reserveAmount
    );
    event AcquisitionFunded(
        uint256 indexed acquisitionId,
        uint256 indexed cycleId,
        address indexed stockToken,
        uint256 amount,
        bytes32 merkleRoot,
        uint64 claimStart,
        uint64 claimDeadline
    );

    error ZeroAddress();
    error InvalidSystemAddress();
    error NotAContract(address target);
    error NotAcquisitionOperator();
    error NotRootPublisher();
    error StockNotApproved(address stockToken);
    error ZeroAmountIn();
    error ZeroMinimumOutput();
    error ExpiredDeadline();
    error WethSpendMismatch(uint256 expected, uint256 actual);
    error ZeroAcquired();
    error DistributionRuleMismatch(uint256 expected, uint256 actual);
    error ReserveRuleMismatch(uint256 expected, uint256 actual);
    error UnexpectedRelease(uint256 delta);
    error AcquisitionNotRecorded(uint256 acquisitionId);
    error CycleAlreadyUsed(uint256 cycleId);
    error ReleaseDeltaMismatch(uint256 expected, uint256 actual);
    error CoordinatorReceiptMismatch(uint256 expected, uint256 actual);
    error ReserveAccountingChanged(uint256 before, uint256 afterBalance);
    error CoordinatorResidue(uint256 baseline, uint256 afterBalance);
    error ManagerReceiptMismatch(uint256 expected, uint256 actual);
    error AllowanceNotCleared(uint256 remaining);

    /// @param vault_ Immutable StockAcquisitionVault (may be a pre-computed address without code yet;
    ///        this coordinator must be BOTH its acquisitionExecutor and distributionFundingCoordinator).
    /// @param claimManager_ Immutable DistributionClaimManager (must already have code; this
    ///        coordinator must be its owner, set at deployment via the manager's `initialOwner`).
    /// @param acquisitionOperator_ Immutable trusted keeper authorized to initiate acquisitions.
    /// @param rootPublisher_ Immutable governed publisher authorized to fund cycles.
    constructor(
        address vault_,
        address claimManager_,
        address acquisitionOperator_,
        address rootPublisher_
    ) {
        if (
            vault_ == address(0) || claimManager_ == address(0)
                || acquisitionOperator_ == address(0) || rootPublisher_ == address(0)
        ) {
            revert ZeroAddress();
        }
        if (
            vault_ == claimManager_ || vault_ == acquisitionOperator_ || vault_ == rootPublisher_
                || claimManager_ == acquisitionOperator_ || claimManager_ == rootPublisher_
        ) {
            revert InvalidSystemAddress();
        }
        if (claimManager_.code.length == 0) revert NotAContract(claimManager_);

        stockAcquisitionVault = IStockAcquisitionVaultOps(vault_);
        distributionClaimManager = IDistributionClaimManagerFunding(claimManager_);
        acquisitionOperator = acquisitionOperator_;
        rootPublisher = rootPublisher_;
    }

    // Snapshot of the vault's cumulative counters, taken before and after a single executeAcquisition.
    struct Counters {
        uint256 wethSpent;
        uint256 acquired;
        uint256 distribution;
        uint256 reserve;
        uint256 released;
    }

    /// @notice Initiate a vault acquisition and record it atomically from the vault's exact deltas.
    /// @dev acquisitionOperator-only, `nonReentrant`. The coordinator is the vault's sole executor, so
    ///      no other party can move the counters and the before/after deltas are exactly this
    ///      acquisition's contribution. A hostile/reverting acquisition reverts the whole call — no
    ///      record is written and no id is consumed. Every recorded amount is derived from storage
    ///      deltas; no caller-reported acquired/distribution amount is trusted.
    function executeAndRecordAcquisition(
        address stockToken,
        uint256 wethAmountIn,
        uint256 minStockOut,
        uint256 deadline,
        bytes calldata executionData
    ) external nonReentrant returns (uint256 acquisitionId) {
        if (msg.sender != acquisitionOperator) {
            revert NotAcquisitionOperator();
        }
        if (!stockAcquisitionVault.isApprovedStockToken(stockToken)) {
            revert StockNotApproved(stockToken);
        }
        if (wethAmountIn == 0) revert ZeroAmountIn();
        if (minStockOut == 0) revert ZeroMinimumOutput();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert ExpiredDeadline();

        Counters memory b = _readCounters(stockToken);
        stockAcquisitionVault.executeAcquisition(
            stockToken, wethAmountIn, minStockOut, deadline, executionData
        );
        AcquisitionRecord memory rec =
            _deriveRecord(stockToken, wethAmountIn, b, _readCounters(stockToken));

        acquisitionId = ++acquisitionCount;
        acquisitions[acquisitionId] = rec;

        emit AcquisitionRecorded(
            acquisitionId,
            stockToken,
            msg.sender,
            rec.wethSpent,
            rec.acquiredStock,
            rec.distributionAmount,
            rec.reserveAmount
        );
    }

    /// @dev Validate the vault's before/after deltas against its frozen 80/20 rule and build the record.
    ///      Reverts unless the WETH spend matches exactly, some stock was acquired, the distribution
    ///      delta equals the vault's overflow-safe 80%, the reserve delta is the exact remainder, and no
    ///      release happened during the acquisition.
    function _deriveRecord(
        address stockToken,
        uint256 wethAmountIn,
        Counters memory b,
        Counters memory a
    ) internal view returns (AcquisitionRecord memory rec) {
        uint256 wethDelta = a.wethSpent - b.wethSpent;
        uint256 acquiredDelta = a.acquired - b.acquired;
        uint256 distDelta = a.distribution - b.distribution;
        uint256 resDelta = a.reserve - b.reserve;

        if (wethDelta != wethAmountIn) revert WethSpendMismatch(wethAmountIn, wethDelta);
        if (acquiredDelta == 0) revert ZeroAcquired();
        uint256 expectedDist = Math.mulDiv(
            acquiredDelta,
            stockAcquisitionVault.DISTRIBUTION_PERCENT(),
            stockAcquisitionVault.SPLIT_DENOMINATOR()
        );
        if (distDelta != expectedDist) revert DistributionRuleMismatch(expectedDist, distDelta);
        if (resDelta != acquiredDelta - expectedDist) {
            revert ReserveRuleMismatch(acquiredDelta - expectedDist, resDelta);
        }
        if (a.released - b.released != 0) revert UnexpectedRelease(a.released - b.released);

        rec = AcquisitionRecord({
            status: AcquisitionStatus.RECORDED,
            stockToken: stockToken,
            wethSpent: wethDelta,
            acquiredStock: acquiredDelta,
            distributionAmount: distDelta,
            reserveAmount: resDelta,
            cycleId: 0
        });
    }

    function _readCounters(address stockToken) internal view returns (Counters memory c) {
        c.wethSpent = stockAcquisitionVault.totalWethSpent();
        c.acquired = stockAcquisitionVault.totalStockAcquired(stockToken);
        c.distribution = stockAcquisitionVault.distributionAllocated(stockToken);
        c.reserve = stockAcquisitionVault.reserveAllocated(stockToken);
        c.released = stockAcquisitionVault.distributionReleased(stockToken);
    }

    // Governed Proof-of-Distribution publication inputs, packed to keep the entry within the stack.
    struct PublishInputs {
        uint256 cycleId;
        bytes32 merkleRoot;
        bytes32 allocationsContentHash;
        bytes32 manifestEnvelopeHash;
        uint64 claimStart;
        uint64 claimDeadline;
    }

    /// @notice Release and fund exactly the recorded 80% distribution for `acquisitionId`, bound to one
    ///         claim-cycle id. No caller-selected token or amount — both come from the stored record.
    /// @dev rootPublisher-only, `nonReentrant`. RECORDED -> FUNDED. Releases the exact recorded amount
    ///      from the vault to this coordinator (it is the vault's distributionFundingCoordinator), then
    ///      publishes-and-funds the cycle, verifying every balance delta and returning the coordinator
    ///      to its pre-release baseline (donations preserved). Reserve accounting must not change.
    function fundRecordedAcquisition(
        uint256 acquisitionId,
        bytes32 merkleRoot,
        bytes32 allocationsContentHash,
        bytes32 manifestEnvelopeHash,
        uint64 claimStart,
        uint64 claimDeadline,
        uint256 cycleId
    ) external nonReentrant {
        if (msg.sender != rootPublisher) revert NotRootPublisher();
        AcquisitionRecord storage rec = acquisitions[acquisitionId];
        if (rec.status != AcquisitionStatus.RECORDED) revert AcquisitionNotRecorded(acquisitionId);
        if (cycleUsed[cycleId]) revert CycleAlreadyUsed(cycleId);

        address stockToken = rec.stockToken;
        uint256 amount = rec.distributionAmount;

        // Effects before interaction (state machine advance + one-cycle-per-acquisition binding).
        rec.status = AcquisitionStatus.FUNDED;
        rec.cycleId = cycleId;
        cycleUsed[cycleId] = true;
        cycleAcquisitionId[cycleId] = acquisitionId;

        _releaseAndFund(
            PublishInputs({
                cycleId: cycleId,
                merkleRoot: merkleRoot,
                allocationsContentHash: allocationsContentHash,
                manifestEnvelopeHash: manifestEnvelopeHash,
                claimStart: claimStart,
                claimDeadline: claimDeadline
            }),
            acquisitionId,
            stockToken,
            amount
        );
    }

    function _releaseAndFund(
        PublishInputs memory p,
        uint256 acquisitionId,
        address stockToken,
        uint256 amount
    ) internal {
        uint256 coordBaseline = IERC20(stockToken).balanceOf(address(this));
        _releaseExact(stockToken, amount, coordBaseline);
        _publishExact(p, stockToken, amount, coordBaseline);

        emit AcquisitionFunded(
            acquisitionId,
            p.cycleId,
            stockToken,
            amount,
            p.merkleRoot,
            p.claimStart,
            p.claimDeadline
        );
    }

    /// @dev Release exactly `amount` from the vault to this coordinator (its immutable
    ///      distributionFundingCoordinator) and verify the vault released exactly that, the coordinator
    ///      received exactly that, and the vault's reserve accounting did not move.
    function _releaseExact(address stockToken, uint256 amount, uint256 coordBaseline) internal {
        uint256 relBefore = stockAcquisitionVault.distributionReleased(stockToken);
        uint256 resBefore = stockAcquisitionVault.reserveAllocated(stockToken);

        stockAcquisitionVault.releaseToDistributionCoordinator(stockToken, amount);

        uint256 relDelta = stockAcquisitionVault.distributionReleased(stockToken) - relBefore;
        if (relDelta != amount) revert ReleaseDeltaMismatch(amount, relDelta);
        uint256 coordReceived = IERC20(stockToken).balanceOf(address(this)) - coordBaseline;
        if (coordReceived != amount) revert CoordinatorReceiptMismatch(amount, coordReceived);
        uint256 resAfter = stockAcquisitionVault.reserveAllocated(stockToken);
        if (resAfter != resBefore) revert ReserveAccountingChanged(resBefore, resAfter);
    }

    /// @dev Publish-and-fund exactly `amount` into the claim manager, then verify the manager received
    ///      exactly that, the coordinator returned to its pre-release baseline (donations preserved),
    ///      and the manager's allowance is cleared.
    function _publishExact(
        PublishInputs memory p,
        address stockToken,
        uint256 amount,
        uint256 coordBaseline
    ) internal {
        uint256 mgrBefore = IERC20(stockToken).balanceOf(address(distributionClaimManager));

        address[] memory assets = new address[](1);
        assets[0] = stockToken;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        IERC20(stockToken).forceApprove(address(distributionClaimManager), amount);
        distributionClaimManager.publishCycle(
            p.cycleId,
            p.merkleRoot,
            p.allocationsContentHash,
            p.manifestEnvelopeHash,
            p.claimStart,
            p.claimDeadline,
            assets,
            amounts
        );
        IERC20(stockToken).forceApprove(address(distributionClaimManager), 0);

        uint256 coordAfter = IERC20(stockToken).balanceOf(address(this));
        if (coordAfter != coordBaseline) revert CoordinatorResidue(coordBaseline, coordAfter);
        uint256 mgrReceived =
            IERC20(stockToken).balanceOf(address(distributionClaimManager)) - mgrBefore;
        if (mgrReceived != amount) revert ManagerReceiptMismatch(amount, mgrReceived);
        uint256 remaining =
            IERC20(stockToken).allowance(address(this), address(distributionClaimManager));
        if (remaining != 0) revert AllowanceNotCleared(remaining);
    }
}
