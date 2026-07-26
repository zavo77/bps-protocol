// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISettlementCalldataValidator} from "../../src/interfaces/ISettlementCalldataValidator.sol";

/// @notice Test-only calldata validator for the fake `guardedSettle(address,address,uint256,uint256,
///         address,uint16,uint16)` selector. Confirms the calldata leads with `selector` and encodes
///         exactly the intent fields (sell/buy token, exact sell amount, minimum buy, recipient ==
///         executor, platform fee <= max, zero integrator fee). Reverts on ANY mismatch. It emits and
///         persists nothing. Test-only; never a production validator (the real 0x77963966 stays disabled).
contract MockGuardedCalldataValidator is ISettlementCalldataValidator {
    error ValidatorMismatch();

    function validate(bytes4 selector, bytes calldata routerCalldata, IntentView calldata intent)
        external
        pure
    {
        if (routerCalldata.length < 4) revert ValidatorMismatch();
        bytes4 got;
        assembly {
            got := calldataload(routerCalldata.offset)
        }
        if (got != selector) revert ValidatorMismatch();
        (
            address st,
            address bt,
            uint256 sa,
            uint256 mba,
            address rec,
            uint16 platformFeeBps,
            uint16 integratorFeeBps
        ) = abi.decode(
            routerCalldata[4:], (address, address, uint256, uint256, address, uint16, uint16)
        );
        if (st != intent.sellToken) revert ValidatorMismatch();
        if (bt != intent.buyToken) revert ValidatorMismatch();
        if (sa != intent.sellAmount) revert ValidatorMismatch();
        if (mba != intent.minBuyAmount) revert ValidatorMismatch();
        if (rec != intent.recipient) revert ValidatorMismatch();
        if (platformFeeBps > intent.maxPlatformFeeBps) revert ValidatorMismatch();
        if (integratorFeeBps != 0) revert ValidatorMismatch();
    }
}
