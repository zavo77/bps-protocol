// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IBPSBurnable
/// @notice Minimal interface for a token that lets the caller permanently burn its own balance,
///         reducing `totalSupply`. Satisfied by BPSToken via OpenZeppelin `ERC20Burnable.burn`.
/// @dev Only the caller's own balance may be burned; there is no third-party/allowance burn in
///      this interface. The router calls this on the BPS token to burn BPS it repurchased and
///      holds itself, so the reduction is a true `totalSupply` decrease.
interface IBPSBurnable {
    function burn(uint256 amount) external;
}
