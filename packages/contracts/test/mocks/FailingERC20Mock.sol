// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only ERC-20 whose (non-mint) transfers can be toggled to revert, used to prove the
///         vault's withdrawal reverts atomically on a failed outgoing token transfer. Test-only;
///         never a production or deployment asset.
contract FailingERC20Mock is ERC20 {
    bool public failTransfers;

    constructor() ERC20("Failing", "FAIL") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFailTransfers(bool value) external {
        failTransfers = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        // Minting (from == 0) is always allowed so balances can be set up before toggling.
        if (failTransfers && from != address(0)) revert("transfer disabled");
        super._update(from, to, value);
    }
}
