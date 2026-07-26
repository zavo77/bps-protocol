// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Test-only honest guarded-settlement router. `guardedSettle` models the (fake) approved
///         selector's ABI: it pulls exactly `sellAmount` of `sellToken` from the caller (the executor)
///         via the granted allowance and delivers `deliverOverride` (or `minBuyAmount` when unset) of
///         `buyToken` to `recipient` from its seeded inventory. Records the allowance it observed so a
///         test can prove the executor approved EXACTLY the sell amount. Test-only; never production.
contract MockGuardedRouter {
    address public immutable weth;
    address public immutable stock;
    uint256 public deliverOverride; // 0 => deliver exactly minBuyAmount
    bool public shouldRevert;
    bool public noOutput; // deliver nothing (malicious: success with no output)
    address public outputRecipient; // 0 => deliver to the caller; else route output elsewhere (malicious)
    uint256 public overpull; // extra sell token to attempt to pull beyond sellAmount (malicious)
    uint256 public seenAllowance;

    constructor(address weth_, address stock_) {
        weth = weth_;
        stock = stock_;
    }

    function setDeliver(uint256 d) external {
        deliverOverride = d;
    }

    function setRevert(bool r) external {
        shouldRevert = r;
    }

    function setNoOutput(bool n) external {
        noOutput = n;
    }

    function setOutputRecipient(address r) external {
        outputRecipient = r;
    }

    function setOverpull(uint256 x) external {
        overpull = x;
    }

    function guardedSettle(
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 minBuyAmount,
        address recipient,
        uint16,
        uint16
    ) external returns (uint256 delivered) {
        if (shouldRevert) revert("router revert");
        seenAllowance = IERC20(sellToken).allowance(msg.sender, address(this));
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(sellToken).transferFrom(msg.sender, address(this), sellAmount + overpull);
        if (noOutput) return 0;
        delivered = deliverOverride == 0 ? minBuyAmount : deliverOverride;
        address to = outputRecipient == address(0) ? recipient : outputRecipient;
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(buyToken).transfer(to, delivered);
    }
}
