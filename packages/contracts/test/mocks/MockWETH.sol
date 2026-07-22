// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only fictional 18-decimal WETH. Open minting for local test setup only; never a
///         production or deployment asset.
contract MockWETH is ERC20 {
    constructor() ERC20("Wrapped Ether (mock)", "WETH") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
