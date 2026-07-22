// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IStockAcquisitionVaultView} from "../../src/interfaces/IStockAcquisitionVaultView.sol";

/// @notice Test-only stand-in for the vault-view the coordinator reads: a configurable approved-stock
///         set and a configurable cumulative `distributionReleased` per token. Used to unit-test the
///         coordinator without the full StockAcquisitionVault (and its circular immutability). It does
///         NOT hold or move stock — the test transfers released stock directly to the coordinator to
///         model the vault's release. Test-only; never a production asset.
contract MockDistributionSource is IStockAcquisitionVaultView {
    mapping(address => bool) private _approved;
    mapping(address => uint256) private _released;

    function setApproved(address token, bool approved) external {
        _approved[token] = approved;
    }

    function setReleased(address token, uint256 amount) external {
        _released[token] = amount;
    }

    function isApprovedStockToken(address token) external view returns (bool) {
        return _approved[token];
    }

    function distributionReleased(address token) external view returns (uint256) {
        return _released[token];
    }
}
