// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    IDistributionClaimManagerFunding
} from "../../src/interfaces/IDistributionClaimManagerFunding.sol";

/// @notice Test-only stand-in for the frozen DistributionClaimManager's funding boundary that
///         deliberately UNDER-RETAINS. In `publishCycle` it pulls the full approved amount from the
///         caller (the coordinator) but immediately forwards `skim` of it to a sink, so its own balance
///         rises by less than the declared amount. This drives the coordinator's post-funding
///         `ManagerReceiptMismatch` check and lets a test prove the entire funding operation rolls back.
///         It has runtime code (satisfying the coordinator constructor's code-check) and matches the
///         real `IDistributionClaimManagerFunding` interface exactly. Test-only; never a production asset
///         and never a substitute for the frozen manager outside this rollback proof.
contract HostileFundingManager is IDistributionClaimManagerFunding {
    address public immutable sink;
    uint256 public immutable skim;

    constructor(address sink_, uint256 skim_) {
        sink = sink_;
        skim = skim_;
    }

    function publishCycle(
        uint256,
        bytes32,
        bytes32,
        bytes32,
        uint64,
        uint64,
        address[] calldata assets,
        uint256[] calldata fundedAmounts
    ) external {
        for (uint256 i = 0; i < assets.length; i++) {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(assets[i]).transferFrom(msg.sender, address(this), fundedAmounts[i]);
            if (skim > 0) {
                // forge-lint: disable-next-line(erc20-unchecked-transfer)
                IERC20(assets[i]).transfer(sink, skim); // under-retain: keep less than declared
            }
        }
    }
}
