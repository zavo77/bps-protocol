// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IStockAcquisitionVaultView} from "./interfaces/IStockAcquisitionVaultView.sol";
import {IDistributionClaimManagerFunding} from "./interfaces/IDistributionClaimManagerFunding.sol";

/// @title DistributionFundingCoordinator
/// @notice The smallest immutable layer that connects a completed stock acquisition to the frozen
///         `DistributionClaimManager` funding boundary. The frozen `StockAcquisitionVault` releases its
///         accounted 80% distribution stock to this coordinator (its immutable
///         `distributionFundingCoordinator`); the coordinator then, under a governed root publisher,
///         publishes-and-funds a claim cycle with exactly that stock. It never fabricates or alters
///         user allocations: the Merkle root, content hashes, and claim window are governed inputs
///         from the off-chain Proof-of-Distribution boundary, and the coordinator only funds the exact
///         amount, verified against the vault's own on-chain accounting.
/// @dev Non-upgradeable and minimal in authority: NO owner, NO mutable setter, NO arbitrary recipient,
///      NO withdrawal/sweep/rescue, NO generic call, NO custody beyond same-transaction transit, and no
///      support for tokens outside the vault's frozen approved basket. The coordinator is the frozen
///      claim manager's owner (so it may call the manager's `onlyOwner` `publishCycle`); ownership is
///      established at deployment (the manager is constructed with this coordinator as `initialOwner`
///      via a predicted address — there is no one-time setter).
///
///      Source of truth. The coordinator never trusts a caller-reported amount. It bounds cumulative
///      funding per token by the vault's cumulative `distributionReleased(token)` — which increases
///      only inside the vault's own `releaseToDistributionCoordinator` and only up to the vault's
///      recorded 80% allocation — so donations to the coordinator can never be funded and reserve
///      allocation (which never flows here) can never be released through it. Each `cycleId` funds
///      once. The frozen vault exposes cumulative accounting (not per-acquisition IDs), so the
///      `cycleId` is the distribution identifier and cumulative `distributionReleased`/`totalFunded`
///      are the anti-over-funding invariant — the smallest safe linkage compatible with the frozen
///      contracts.
///
///      DEPLOYMENT IS NOT AUTHORIZED here. The vault↔coordinator immutability is circular (the frozen
///      vault stores this coordinator immutably and this coordinator stores the vault immutably), so
///      the vault address must be a pre-computed address bound through a later reviewed deployment
///      procedure. The constructor code-checks the claim manager (already deployed) but intentionally
///      not the vault (its predicted address may not host code yet). There is NO native-ETH
///      receive/fallback. All assets/addresses/cycles in this repository's tests are fictional and
///      local; nothing is deployed and no Proof-of-Distribution root is fabricated on-chain.
contract DistributionFundingCoordinator is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IStockAcquisitionVaultView public immutable stockAcquisitionVault;
    IDistributionClaimManagerFunding public immutable distributionClaimManager;
    /// @notice The only address permitted to publish-and-fund cycles (governed PoD root publisher).
    address public immutable rootPublisher;

    /// @notice Whether a cycle id has already been funded through this coordinator.
    mapping(uint256 cycleId => bool) public cycleFunded;
    /// @notice The stock token funded for a cycle id.
    mapping(uint256 cycleId => address) public cycleStockToken;
    /// @notice The exact amount funded for a cycle id.
    mapping(uint256 cycleId => uint256) public cycleFundedAmount;
    /// @notice Cumulative amount funded per stock token (bounded by the vault's released distribution).
    mapping(address stockToken => uint256) public totalFunded;

    event CycleFunded(
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
    error NotRootPublisher();
    error StockNotApproved(address stockToken);
    error ZeroAmount();
    error CycleAlreadyFunded(uint256 cycleId);
    error ExceedsReleasedDistribution(uint256 requestedTotal, uint256 released);
    error CoordinatorSpendMismatch(uint256 expected, uint256 actual);
    error ManagerReceiptMismatch(uint256 expected, uint256 actual);

    // Governed Proof-of-Distribution publication inputs, packed to keep the entry within the stack.
    struct PublishInputs {
        uint256 cycleId;
        bytes32 merkleRoot;
        bytes32 allocationsContentHash;
        bytes32 manifestEnvelopeHash;
        uint64 claimStart;
        uint64 claimDeadline;
    }

    /// @param vault_ Immutable StockAcquisitionVault (may be a pre-computed address without code yet).
    /// @param claimManager_ Immutable DistributionClaimManager (must already have code; this
    ///        coordinator must be its owner, set at deployment via the manager's `initialOwner`).
    /// @param rootPublisher_ Immutable governed publisher authorized to fund cycles.
    constructor(address vault_, address claimManager_, address rootPublisher_) {
        if (vault_ == address(0) || claimManager_ == address(0) || rootPublisher_ == address(0)) {
            revert ZeroAddress();
        }
        if (vault_ == claimManager_ || vault_ == rootPublisher_ || claimManager_ == rootPublisher_)
        {
            revert InvalidSystemAddress();
        }
        if (claimManager_.code.length == 0) revert NotAContract(claimManager_);

        stockAcquisitionVault = IStockAcquisitionVaultView(vault_);
        distributionClaimManager = IDistributionClaimManagerFunding(claimManager_);
        rootPublisher = rootPublisher_;
    }

    /// @notice Publish and fund one claim cycle with the exact distribution stock released by the vault.
    /// @dev Root publisher only, `nonReentrant`. The root/hashes/window are governed PoD inputs; the
    ///      coordinator only funds `amount` of `stockToken`, bounded by the vault's cumulative released
    ///      distribution, funding each `cycleId` once. Verifies both the coordinator's exact decrease
    ///      and the manager's exact increase (the manager also enforces its own exact-funding check).
    function fundAndPublishCycle(
        uint256 cycleId,
        bytes32 merkleRoot,
        bytes32 allocationsContentHash,
        bytes32 manifestEnvelopeHash,
        uint64 claimStart,
        uint64 claimDeadline,
        address stockToken,
        uint256 amount
    ) external nonReentrant {
        if (msg.sender != rootPublisher) revert NotRootPublisher();
        if (!stockAcquisitionVault.isApprovedStockToken(stockToken)) {
            revert StockNotApproved(stockToken);
        }
        if (amount == 0) revert ZeroAmount();
        if (cycleFunded[cycleId]) revert CycleAlreadyFunded(cycleId);

        // Source of truth: cumulative funding per token can never exceed what the vault actually
        // released as distribution stock (donations and reserve allocation are excluded).
        uint256 newTotal = totalFunded[stockToken] + amount;
        uint256 released = stockAcquisitionVault.distributionReleased(stockToken);
        if (newTotal > released) revert ExceedsReleasedDistribution(newTotal, released);

        // Effects before interaction.
        cycleFunded[cycleId] = true;
        cycleStockToken[cycleId] = stockToken;
        cycleFundedAmount[cycleId] = amount;
        totalFunded[stockToken] = newTotal;

        _fundCycle(
            PublishInputs({
                cycleId: cycleId,
                merkleRoot: merkleRoot,
                allocationsContentHash: allocationsContentHash,
                manifestEnvelopeHash: manifestEnvelopeHash,
                claimStart: claimStart,
                claimDeadline: claimDeadline
            }),
            stockToken,
            amount
        );
    }

    /// @dev Approve the manager for exactly `amount`, publish-and-fund the cycle, clear the approval,
    ///      and verify both the coordinator's exact decrease and the manager's exact increase.
    ///      Extracted to keep `fundAndPublishCycle` within the stack limit.
    function _fundCycle(PublishInputs memory p, address stockToken, uint256 amount) internal {
        address[] memory assets = new address[](1);
        assets[0] = stockToken;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        uint256 coordBefore = IERC20(stockToken).balanceOf(address(this));
        uint256 mgrBefore = IERC20(stockToken).balanceOf(address(distributionClaimManager));

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

        uint256 coordSpent = coordBefore - IERC20(stockToken).balanceOf(address(this));
        uint256 mgrReceived =
            IERC20(stockToken).balanceOf(address(distributionClaimManager)) - mgrBefore;
        if (coordSpent != amount) revert CoordinatorSpendMismatch(amount, coordSpent);
        if (mgrReceived != amount) revert ManagerReceiptMismatch(amount, mgrReceived);

        emit CycleFunded(p.cycleId, stockToken, amount, p.merkleRoot, p.claimStart, p.claimDeadline);
    }
}
