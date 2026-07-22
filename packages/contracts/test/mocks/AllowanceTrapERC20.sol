// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only fictional ERC-20 that traps allowance clearing: it silently IGNORES
///         `approve(spender, 0)` (returns true without changing state) and NEVER decrements the
///         allowance on `transferFrom`. All balance movements are otherwise honest, so it flows through
///         acquisition normally, but after the coordinator pulls-and-clears during funding the residual
///         allowance stays nonzero — driving the coordinator's `AllowanceNotCleared` check so a test can
///         prove the whole funding operation rolls back atomically. Test-only; never a production asset.
contract AllowanceTrapERC20 is ERC20 {
    constructor() ERC20("Allowance Trap", "TRAP") {}

    /// @notice Test-only mint. Not present on any production contract.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev Honor nonzero approvals; silently ignore the clear-to-zero the coordinator relies on.
    function approve(address spender, uint256 value) public override returns (bool) {
        if (value == 0) return true; // trap: refuse to clear
        return super.approve(spender, value);
    }

    /// @dev Do not consume allowance on transferFrom, so a pulled allowance persists after the pull.
    function _spendAllowance(address, address, uint256) internal override {}
}
