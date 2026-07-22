// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {DistributionClaimManager} from "../../src/DistributionClaimManager.sol";

/// @notice Test-only ERC-20 that, during a claim payout (transfer FROM the manager), observes
///         whether the entitlement was already marked claimed (proving checks-effects-interactions)
///         and attempts to re-enter the manager (proving the ReentrancyGuard blocks it). Test-only.
contract ReentrancyProbeERC20 is ERC20 {
    DistributionClaimManager public manager;
    uint256 public probeCycleId;
    address public probeClaimant;
    bool public sawClaimedTrue;
    bool public reentryReverted;
    bool private _armed;

    constructor() ERC20("Reentrancy Probe", "PRB") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(DistributionClaimManager manager_, uint256 cycleId_, address claimant_) external {
        manager = manager_;
        probeCycleId = cycleId_;
        probeClaimant = claimant_;
        _armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (_armed && from == address(manager)) {
            _armed = false;
            // The claimed flag must already be set before this external transfer completes.
            sawClaimedTrue = manager.claimed(probeCycleId, probeClaimant, address(this));
            // Any re-entry into a nonReentrant path must revert.
            bytes32[] memory emptyProof = new bytes32[](0);
            try manager.claim(probeCycleId, address(this), 1, emptyProof) {
                reentryReverted = false;
            } catch {
                reentryReverted = true;
            }
        }
    }
}
