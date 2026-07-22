// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title BPSToken
/// @notice Canonical fixed-supply BPS Protocol ERC-20 token.
/// @dev The entire fixed supply is minted exactly once in the constructor to a
///      deployment recipient. There is no additional mint path, no owner, no admin,
///      no role system, and no fee/tax/rebase/reflection/blacklist/whitelist/pause/
///      limit/upgrade/confiscation behavior. It is a conventional ERC-20 that also
///      supports voluntary holder burning via OpenZeppelin's ERC20Burnable. The
///      voluntary burn here is unrelated to any future protocol buy-and-burn mechanism.
contract BPSToken is ERC20, ERC20Burnable {
    /// @notice Fixed total supply: 1,000,000,000 BPS with 18 decimals.
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18;

    /// @param recipient Address that receives the entire fixed supply at deployment.
    /// @dev Reverts if `recipient` is the zero address (OpenZeppelin `_mint` rejects
    ///      the zero receiver). The supply is minted exactly once here; no other mint
    ///      path exists.
    constructor(address recipient) ERC20("BPS Protocol", "BPS") {
        _mint(recipient, MAX_SUPPLY);
    }
}
