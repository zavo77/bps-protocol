// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title DistributionClaimManager
/// @notice Funded, immutable, per-cycle Merkle distribution of already-acquired assets. Cycles are
///         published-and-funded atomically by the owner and are immutable thereafter: there is no
///         function to change a root, content hash, claim window, registered asset, or funded
///         amount. Participants claim their own entitlements against the frozen TASK 3 Merkle leaf
///         standard; after a cycle's deadline anyone may sweep the remaining unclaimed balance to a
///         single immutable recovery recipient. There is no pause, no arbitrary-recipient recovery,
///         no generic drain, and no upgrade surface.
/// @dev Frozen leaf (OpenZeppelin StandardMerkleTree double hash, sorted-pair tree):
///        keccak256(bytes.concat(keccak256(abi.encode(
///          block.chainid, address(this), cycleId, claimant, asset, amount))))
///      All assets, addresses, and claims exercised in this repository's tests are fictional and
///      local; nothing here is deployed or connected to any network.
contract DistributionClaimManager is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Cycle {
        bytes32 merkleRoot;
        bytes32 allocationsContentHash;
        bytes32 manifestEnvelopeHash;
        uint64 claimStart;
        uint64 claimDeadline;
        bool published;
    }

    struct AssetFunding {
        bool registered;
        uint256 funded;
        uint256 claimed;
        uint256 recovered;
        bool recoveryClosed;
    }

    /// @notice A single claim within a batch; the claimant is always msg.sender.
    struct ClaimRequest {
        address asset;
        uint256 amount;
        bytes32[] proof;
    }

    /// @notice Immutable destination for all post-deadline recoveries. Set once at construction.
    address public immutable recoveryRecipient;

    /// @notice Published cycles by id. Immutable once `published` is true.
    mapping(uint256 cycleId => Cycle) public cycles;

    /// @notice Per-cycle, per-asset funding and consumption accounting.
    mapping(uint256 cycleId => mapping(address asset => AssetFunding)) public assetFunding;

    /// @notice Whether a given (cycle, claimant, asset) entitlement has been consumed.
    mapping(uint256 cycleId => mapping(address claimant => mapping(address asset => bool))) public
        claimed;

    /// @notice Total outstanding participant liability per token across every cycle.
    mapping(address token => uint256) public totalOutstanding;

    event CyclePublished(
        uint256 indexed cycleId,
        bytes32 merkleRoot,
        bytes32 allocationsContentHash,
        bytes32 manifestEnvelopeHash,
        uint64 claimStart,
        uint64 claimDeadline,
        uint256 assetCount
    );
    event CycleAssetFunded(uint256 indexed cycleId, address indexed asset, uint256 amount);
    event Claimed(
        uint256 indexed cycleId, address indexed claimant, address indexed asset, uint256 amount
    );
    event ExpiredRecovered(
        uint256 indexed cycleId,
        address indexed asset,
        address indexed recoveryRecipient,
        uint256 amount
    );

    error ZeroAddress();
    error CycleAlreadyPublished(uint256 cycleId);
    error CycleNotFound(uint256 cycleId);
    error ZeroRoot();
    error ZeroContentHash();
    error InvalidClaimWindow();
    error EmptyAssetList();
    error ArrayLengthMismatch();
    error ZeroAsset();
    error ZeroFundingAmount();
    error DuplicateAsset(address asset);
    error FundingAmountMismatch(address asset, uint256 declared, uint256 received);
    error AssetNotRegistered(uint256 cycleId, address asset);
    error ClaimNotStarted();
    error ClaimExpired();
    error ZeroClaimAmount();
    error AlreadyClaimed(uint256 cycleId, address claimant, address asset);
    error InvalidProof();
    error InsufficientCycleFunding(uint256 cycleId, address asset);
    error EmptyBatch();
    error RecoveryTooEarly();
    error AlreadyRecovered(uint256 cycleId, address asset);

    /// @param initialOwner Two-step owner (represents future governance; fictional/local here).
    /// @param recoveryRecipient_ Immutable destination for post-deadline recoveries. Nonzero.
    constructor(address initialOwner, address recoveryRecipient_) Ownable(initialOwner) {
        if (recoveryRecipient_ == address(0)) revert ZeroAddress();
        recoveryRecipient = recoveryRecipient_;
    }

    // --- Leaf calculation (frozen TASK 3 standard) --------------------------------------------

    /// @notice The Merkle leaf for an entitlement, bound to this chain and this manager.
    function leafFor(uint256 cycleId, address claimant, address asset, uint256 amount)
        external
        view
        returns (bytes32)
    {
        return _leaf(cycleId, claimant, asset, amount);
    }

    function _leaf(uint256 cycleId, address claimant, address asset, uint256 amount)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            bytes.concat(
                keccak256(
                    abi.encode(block.chainid, address(this), cycleId, claimant, asset, amount)
                )
            )
        );
    }

    // --- Publication (owner only, atomic exact funding) ---------------------------------------

    /// @notice Publish and fully fund an immutable cycle in a single atomic transaction.
    /// @dev fundedAmounts are the TASK 3 `allocated` participant entitlements only — never the
    ///      strategic reserve, distribution dust, full participant pool, or other inventory. Each
    ///      asset is pulled from msg.sender via SafeERC20 and the received balance delta must equal
    ///      the declared amount exactly (fee-on-transfer / short transfers revert the whole call).
    function publishCycle(
        uint256 cycleId,
        bytes32 merkleRoot,
        bytes32 allocationsContentHash,
        bytes32 manifestEnvelopeHash,
        uint64 claimStart,
        uint64 claimDeadline,
        address[] calldata assets,
        uint256[] calldata fundedAmounts
    ) external onlyOwner nonReentrant {
        if (cycles[cycleId].published) {
            revert CycleAlreadyPublished(cycleId);
        }
        if (merkleRoot == bytes32(0)) revert ZeroRoot();
        if (allocationsContentHash == bytes32(0) || manifestEnvelopeHash == bytes32(0)) {
            revert ZeroContentHash();
        }
        // Claim windows are intentionally gated on block.timestamp; second-level validator drift
        // is negligible against multi-hour/day windows.
        // forge-lint: disable-next-line(block-timestamp)
        if (claimStart <= block.timestamp) revert InvalidClaimWindow();
        if (claimDeadline <= claimStart) revert InvalidClaimWindow();
        if (assets.length == 0) revert EmptyAssetList();
        if (assets.length != fundedAmounts.length) revert ArrayLengthMismatch();

        cycles[cycleId] = Cycle({
            merkleRoot: merkleRoot,
            allocationsContentHash: allocationsContentHash,
            manifestEnvelopeHash: manifestEnvelopeHash,
            claimStart: claimStart,
            claimDeadline: claimDeadline,
            published: true
        });

        emit CyclePublished(
            cycleId,
            merkleRoot,
            allocationsContentHash,
            manifestEnvelopeHash,
            claimStart,
            claimDeadline,
            assets.length
        );

        for (uint256 i = 0; i < assets.length; i++) {
            _fundAsset(cycleId, assets[i], fundedAmounts[i]);
        }
    }

    /// @dev Register and exactly fund one asset for a cycle. Extracted to keep `publishCycle`
    ///      within the stack limit. Pulls tokens from msg.sender (the owner publishing the cycle).
    function _fundAsset(uint256 cycleId, address asset, uint256 amount) internal {
        if (asset == address(0)) revert ZeroAsset();
        if (amount == 0) revert ZeroFundingAmount();

        AssetFunding storage af = assetFunding[cycleId][asset];
        if (af.registered) revert DuplicateAsset(asset);
        af.registered = true;
        af.funded = amount;

        IERC20 token = IERC20(asset);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - balanceBefore;
        if (received != amount) revert FundingAmountMismatch(asset, amount, received);

        totalOutstanding[asset] += amount;
        emit CycleAssetFunded(cycleId, asset, amount);
    }

    // --- Claims -------------------------------------------------------------------------------

    /// @notice Claim a single entitlement for msg.sender.
    function claim(uint256 cycleId, address asset, uint256 amount, bytes32[] calldata proof)
        external
        nonReentrant
    {
        _claim(cycleId, msg.sender, asset, amount, proof);
    }

    /// @notice Claim multiple entitlements for msg.sender within one cycle, atomically.
    function claimBatch(uint256 cycleId, ClaimRequest[] calldata claims_) external nonReentrant {
        if (claims_.length == 0) revert EmptyBatch();
        for (uint256 i = 0; i < claims_.length; i++) {
            _claim(cycleId, msg.sender, claims_[i].asset, claims_[i].amount, claims_[i].proof);
        }
    }

    function _claim(
        uint256 cycleId,
        address claimant,
        address asset,
        uint256 amount,
        bytes32[] calldata proof
    ) internal {
        if (amount == 0) revert ZeroClaimAmount();
        Cycle storage c = cycles[cycleId];
        if (!c.published) revert CycleNotFound(cycleId);
        AssetFunding storage af = assetFunding[cycleId][asset];
        if (!af.registered) revert AssetNotRegistered(cycleId, asset);
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < c.claimStart) revert ClaimNotStarted();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > c.claimDeadline) revert ClaimExpired();
        if (claimed[cycleId][claimant][asset]) revert AlreadyClaimed(cycleId, claimant, asset);

        bytes32 leaf = _leaf(cycleId, claimant, asset, amount);
        if (!MerkleProof.verify(proof, c.merkleRoot, leaf)) revert InvalidProof();

        // Remaining liability must cover this claim.
        if (amount > af.funded - af.claimed - af.recovered) {
            revert InsufficientCycleFunding(cycleId, asset);
        }

        // Effects before interaction: mark consumed, update accounting, then transfer.
        claimed[cycleId][claimant][asset] = true;
        af.claimed += amount;
        totalOutstanding[asset] -= amount;

        IERC20(asset).safeTransfer(claimant, amount);
        emit Claimed(cycleId, claimant, asset, amount);
    }

    // --- Post-deadline recovery (permissionless; fixed destination) ---------------------------

    /// @notice After a cycle's deadline, sweep the remaining unclaimed balance of one cycle asset
    ///         to the immutable recovery recipient. Callable by anyone; the caller cannot choose
    ///         the destination or the amount (both derive from recorded accounting).
    function recoverExpired(uint256 cycleId, address asset) external nonReentrant {
        Cycle storage c = cycles[cycleId];
        if (!c.published) revert CycleNotFound(cycleId);
        AssetFunding storage af = assetFunding[cycleId][asset];
        if (!af.registered) revert AssetNotRegistered(cycleId, asset);
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp <= c.claimDeadline) revert RecoveryTooEarly();
        if (af.recoveryClosed) revert AlreadyRecovered(cycleId, asset);

        uint256 remainingAmount = af.funded - af.claimed - af.recovered;

        // Effects before interaction.
        af.recovered += remainingAmount;
        af.recoveryClosed = true;
        totalOutstanding[asset] -= remainingAmount;

        emit ExpiredRecovered(cycleId, asset, recoveryRecipient, remainingAmount);
        if (remainingAmount > 0) {
            IERC20(asset).safeTransfer(recoveryRecipient, remainingAmount);
        }
    }

    // --- Views --------------------------------------------------------------------------------

    /// @notice Remaining unclaimed, unrecovered liability for a cycle asset.
    function remaining(uint256 cycleId, address asset) external view returns (uint256) {
        AssetFunding storage af = assetFunding[cycleId][asset];
        return af.funded - af.claimed - af.recovered;
    }
}
