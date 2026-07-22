// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Solidity compatibility test against the audited TASK 3 canonical vector. This does NOT
///         call the deployed manager: the audited root is deliberately bound to the fictional
///         claim-manager address 0x…c1a1, so it is used only to prove the frozen leaf formula and
///         OpenZeppelin sorted-pair proof verification match the off-chain generator exactly.
contract LeafVectorTest {
    uint256 internal constant CHAIN_ID = 987654;
    address internal constant CLAIM_MANAGER = address(0xc1a1);
    uint256 internal constant CYCLE_ID = 42;
    address internal constant CLAIMANT = address(0x1001);
    address internal constant ASSET = address(0xa006);
    uint256 internal constant AMOUNT = 111111111111;

    bytes32 internal constant EXPECTED_LEAF =
        0xac90578a19c27ce2da8491889e35c371cef25ffa7bda44aa7294259a8ce0cb21;
    bytes32 internal constant EXPECTED_ROOT =
        0x9b85d4fffa825ad596f5a4062131d90a38eb432dbbe169ee752890170092217d;

    function _leaf(
        uint256 chainId,
        address manager,
        uint256 cycleId,
        address claimant,
        address asset,
        uint256 amount
    ) internal pure returns (bytes32) {
        return keccak256(
            bytes.concat(keccak256(abi.encode(chainId, manager, cycleId, claimant, asset, amount)))
        );
    }

    function _auditedProof() internal pure returns (bytes32[] memory proof) {
        proof = new bytes32[](4);
        proof[0] = 0xa7bff4535f1ae3dd1fb3b42d7bede9934805653d28ff1a4e88821fcd1787c465;
        proof[1] = 0x0e4e4b92a45a86207f1e80cf328f7b6735004a8c794a0e4487f2f17ecc8d14f5;
        proof[2] = 0xf3e75f64697b2d9e076848f13b0090aa93c996ab7cf367aa741a72e524d7bd0c;
        proof[3] = 0x63d791a7a11070ed00565e44dd503515bdc39b212a8035e2c42bca649109d9ab;
    }

    /// Requirement 53: recompute the audited leaf with abi.encode + double hash; assert equality.
    function testCanonicalLeafEqualsAudited() public pure {
        bytes32 leaf = _leaf(CHAIN_ID, CLAIM_MANAGER, CYCLE_ID, CLAIMANT, ASSET, AMOUNT);
        require(leaf == EXPECTED_LEAF, "audited leaf mismatch");
    }

    /// Requirement 54: verify the audited proof against the audited root via OZ MerkleProof.
    function testCanonicalProofVerifiesAgainstAuditedRoot() public pure {
        require(
            MerkleProof.verify(_auditedProof(), EXPECTED_ROOT, EXPECTED_LEAF),
            "audited proof failed"
        );
    }

    /// Requirement 55: changing any one of the six bound fields must invalidate verification.
    function testTamperingEachBoundFieldFails() public pure {
        bytes32[] memory proof = _auditedProof();
        require(MerkleProof.verify(proof, EXPECTED_ROOT, EXPECTED_LEAF), "baseline must verify");

        require(
            !MerkleProof.verify(
                proof,
                EXPECTED_ROOT,
                _leaf(CHAIN_ID + 1, CLAIM_MANAGER, CYCLE_ID, CLAIMANT, ASSET, AMOUNT)
            ),
            "chainId tamper"
        );
        require(
            !MerkleProof.verify(
                proof,
                EXPECTED_ROOT,
                _leaf(CHAIN_ID, address(0xBEEF), CYCLE_ID, CLAIMANT, ASSET, AMOUNT)
            ),
            "manager tamper"
        );
        require(
            !MerkleProof.verify(
                proof,
                EXPECTED_ROOT,
                _leaf(CHAIN_ID, CLAIM_MANAGER, CYCLE_ID + 1, CLAIMANT, ASSET, AMOUNT)
            ),
            "cycle tamper"
        );
        require(
            !MerkleProof.verify(
                proof,
                EXPECTED_ROOT,
                _leaf(CHAIN_ID, CLAIM_MANAGER, CYCLE_ID, address(0x1002), ASSET, AMOUNT)
            ),
            "claimant tamper"
        );
        require(
            !MerkleProof.verify(
                proof,
                EXPECTED_ROOT,
                _leaf(CHAIN_ID, CLAIM_MANAGER, CYCLE_ID, CLAIMANT, address(0xa007), AMOUNT)
            ),
            "asset tamper"
        );
        require(
            !MerkleProof.verify(
                proof,
                EXPECTED_ROOT,
                _leaf(CHAIN_ID, CLAIM_MANAGER, CYCLE_ID, CLAIMANT, ASSET, AMOUNT + 1)
            ),
            "amount tamper"
        );
    }
}
