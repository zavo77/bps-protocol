// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title BPSCanaryToken
/// @notice ISOLATED, NON-PRODUCTION canary token for a visibly-labelled Robinhood-mainnet test of the
///         frozen BPS system. It is NOT canonical BPS and carries no official value. Its name and symbol
///         are deliberately distinct ("BPS Canary -- TEST ONLY" / "BPSC-TEST") so it is both technically
///         and visibly distinguishable from canonical BPS on any explorer or wallet.
/// @dev Interface-identical to the frozen `BPSToken` for the surfaces the frozen protocol uses: it is
///      `ERC20` + `ERC20Burnable`, so it satisfies the router's `IBPSBurnable.burn(uint256)` self-burn and
///      every `IERC20` operation the frozen router/vault perform. Fixed 1,000,000,000 supply (18 decimals)
///      is minted exactly once to the constructor recipient; there is NO post-deployment mint path and no
///      privileged control. This file does NOT import, modify, or extend any frozen source; it is a new
///      canary-only contract under `src/canary/`. The production `BPSDeployment` path deploys the concrete
///      `BPSToken` and can never instantiate this type.
contract BPSCanaryToken is ERC20, ERC20Burnable {
    /// @notice Fixed total supply: 1,000,000,000 BPSC-TEST with 18 decimals (matches the canonical size).
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18;

    /// @notice Immutable marker distinguishing this canary token from canonical BPS for tooling/tests.
    bool public constant IS_CANARY = true;

    error ZeroRecipient();

    /// @param recipient Non-zero address that receives the entire fixed supply exactly once.
    constructor(address recipient) ERC20(unicode"BPS Canary — TEST ONLY", "BPSC-TEST") {
        if (recipient == address(0)) revert ZeroRecipient();
        _mint(recipient, MAX_SUPPLY);
    }
}
