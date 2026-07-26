// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IGuardedSettlementExecutor} from "../../src/interfaces/IGuardedSettlementExecutor.sol";

/// @notice Test-only hostile router that re-enters the executor mid-settlement to prove the reentrancy
///         guard blocks it. The nested `executeSettlement` reverts at the `nonReentrant` modifier before
///         any body logic; the router captures that revert (so the OUTER settlement still completes) and
///         a test asserts the captured error is `ReentrancyGuardReentrantCall`. Test-only.
contract ReentrantGuardedRouter {
    address public immutable weth;
    address public immutable stock;
    IGuardedSettlementExecutor public executor;
    IGuardedSettlementExecutor.SettlementParams internal reentryParams;
    bytes public reentryError;

    constructor(address weth_, address stock_) {
        weth = weth_;
        stock = stock_;
    }

    function setReentry(
        IGuardedSettlementExecutor executor_,
        IGuardedSettlementExecutor.SettlementParams calldata p
    ) external {
        executor = executor_;
        reentryParams = p;
    }

    /// @notice Initiate a settlement as the executor's controller (this router is deployed as the owner),
    ///         so the nested re-entry from `guardedSettle` reaches the `nonReentrant` guard (not
    ///         `onlyOwner`). Used to prove the reentrancy guard, not merely access control.
    function kickoff(
        IGuardedSettlementExecutor executor_,
        IGuardedSettlementExecutor.SettlementParams calldata p
    ) external returns (uint256) {
        return executor_.executeSettlement(p);
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
        try executor.executeSettlement(reentryParams) returns (
            uint256
        ) {
        // Should never reach here: the reentrancy guard must revert the nested call.
        }
        catch (bytes memory err) {
            reentryError = err;
        }
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(sellToken).transferFrom(msg.sender, address(this), sellAmount);
        delivered = minBuyAmount;
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(buyToken).transfer(recipient, delivered);
    }
}
