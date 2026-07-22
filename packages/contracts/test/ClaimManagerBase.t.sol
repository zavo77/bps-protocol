// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DistributionClaimManager} from "../src/DistributionClaimManager.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Minimal Foundry cheatcode surface, declared inline to keep the contracts project free of
///      git submodules / forge-std (the established repository pattern).
interface Vm {
    function warp(uint256 newTimestamp) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function expectEmit(bool a, bool b, bool c, bool d) external;
    function chainId(uint256 newChainId) external;
    function assume(bool condition) external pure;
}

/// @notice Shared setup and helpers for DistributionClaimManager tests. Abstract, so Foundry does
///         not run it as a suite. All addresses and assets are fictional and local-only.
abstract contract ClaimManagerBase {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    // Event signatures mirrored for vm.expectEmit matching.
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

    address internal constant OWNER = address(0xA11);
    address internal constant RECOVERY = address(0x6EC0);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA201);

    DistributionClaimManager internal mgr;
    MockERC20 internal t6;
    MockERC20 internal t8;
    MockERC20 internal t18;

    function _deploy() internal {
        mgr = new DistributionClaimManager(OWNER, RECOVERY);
        t6 = new MockERC20("Fictional Six", "T6", 6);
        t8 = new MockERC20("Fictional Eight", "T8", 8);
        t18 = new MockERC20("Fictional Eighteen", "T18", 18);
    }

    // --- Merkle helpers (OZ sorted-pair commutative node hashing) ------------------------------

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(bytes.concat(a, b)) : keccak256(bytes.concat(b, a));
    }

    function _arr1(bytes32 a) internal pure returns (bytes32[] memory arr) {
        arr = new bytes32[](1);
        arr[0] = a;
    }

    function _arr2(bytes32 a, bytes32 b) internal pure returns (bytes32[] memory arr) {
        arr = new bytes32[](2);
        arr[0] = a;
        arr[1] = b;
    }

    /// @dev Balanced 4-leaf tree; returns root and index-aligned proofs.
    function _tree4(bytes32[4] memory leaves)
        internal
        pure
        returns (bytes32 root, bytes32[][] memory proofs)
    {
        bytes32 n01 = _hashPair(leaves[0], leaves[1]);
        bytes32 n23 = _hashPair(leaves[2], leaves[3]);
        root = _hashPair(n01, n23);
        proofs = new bytes32[][](4);
        proofs[0] = _arr2(leaves[1], n23);
        proofs[1] = _arr2(leaves[0], n23);
        proofs[2] = _arr2(leaves[3], n01);
        proofs[3] = _arr2(leaves[2], n01);
    }

    /// @dev 2-leaf tree; returns root and index-aligned proofs.
    function _tree2(bytes32 l0, bytes32 l1)
        internal
        pure
        returns (bytes32 root, bytes32[][] memory proofs)
    {
        root = _hashPair(l0, l1);
        proofs = new bytes32[][](2);
        proofs[0] = _arr1(l1);
        proofs[1] = _arr1(l0);
    }

    function _addrArr(address a) internal pure returns (address[] memory arr) {
        arr = new address[](1);
        arr[0] = a;
    }

    function _addrArr(address a, address b) internal pure returns (address[] memory arr) {
        arr = new address[](2);
        arr[0] = a;
        arr[1] = b;
    }

    function _uintArr(uint256 a) internal pure returns (uint256[] memory arr) {
        arr = new uint256[](1);
        arr[0] = a;
    }

    function _uintArr(uint256 a, uint256 b) internal pure returns (uint256[] memory arr) {
        arr = new uint256[](2);
        arr[0] = a;
        arr[1] = b;
    }

    /// @dev Mint `amount` of `token` to OWNER and approve the manager to pull it.
    function _fund(MockERC20 token, uint256 amount) internal {
        token.mint(OWNER, amount);
        vm.prank(OWNER);
        token.approve(address(mgr), amount);
    }

    // --- Assertions (require-based; no forge-std) ----------------------------------------------

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function _eq(bytes32 a, bytes32 b, string memory m) internal pure {
        require(a == b, m);
    }

    function _eq(address a, address b, string memory m) internal pure {
        require(a == b, m);
    }

    function _true(bool c, string memory m) internal pure {
        require(c, m);
    }

    function _false(bool c, string memory m) internal pure {
        require(!c, m);
    }
}
