// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only fee-on-transfer ERC-20: a transfer delivers less than the sent amount (the
///         fee is burned), so a recipient's received balance delta is strictly less than the sent
///         value. Used to prove the claim manager's exact-funding check rejects short/fee funding.
///         Test-only; never a production or deployment asset.
contract MockFeeOnTransferERC20 is ERC20 {
    uint256 public immutable feeBps;

    constructor(string memory name_, string memory symbol_, uint256 feeBps_) ERC20(name_, symbol_) {
        feeBps = feeBps_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev On plain transfers (not mint/burn) the recipient receives `value - fee`; `fee` is burned
    ///      from the sender. Total debited from the sender is exactly `value`.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && feeBps > 0) {
            uint256 fee = (value * feeBps) / 10_000;
            super._update(from, to, value - fee);
            if (fee > 0) super._update(from, address(0), fee);
        } else {
            super._update(from, to, value);
        }
    }
}
