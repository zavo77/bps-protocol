// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {BPSLockingVault} from "../../src/BPSLockingVault.sol";

/// @notice Test-only ERC-20 that, during a transfer touching the vault (lock funding in or
///         withdrawal payout out), attempts to re-enter the vault's `createLock` or `withdraw`.
///         Used to prove the vault's `nonReentrant` guard blocks same- and cross-function
///         reentrancy. Test-only; never a production or deployment asset.
contract ReentrantBPSMock is ERC20 {
    BPSLockingVault public vault;
    uint8 public mode; // 0 none, 1 re-enter createLock, 2 re-enter withdraw
    uint256 public attackLockId;
    uint256 public attackAmount;
    uint32 public attackDuration;
    bool public reentryAttempted;
    bool public reentryReverted;
    bool private _armed;

    constructor() ERC20("Reentrant BPS", "rBPS") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function armCreate(BPSLockingVault vault_, uint256 amount, uint32 duration) external {
        vault = vault_;
        mode = 1;
        attackAmount = amount;
        attackDuration = duration;
        _armed = true;
    }

    function armWithdraw(BPSLockingVault vault_, uint256 lockId) external {
        vault = vault_;
        mode = 2;
        attackLockId = lockId;
        _armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (!_armed || address(vault) == address(0)) return;
        if (to != address(vault) && from != address(vault)) return;

        _armed = false; // one attempt only
        reentryAttempted = true;
        if (mode == 1) {
            try vault.createLock(attackAmount, attackDuration) {
                reentryReverted = false;
            } catch {
                reentryReverted = true;
            }
        } else if (mode == 2) {
            try vault.withdraw(attackLockId) {
                reentryReverted = false;
            } catch {
                reentryReverted = true;
            }
        }
    }
}
