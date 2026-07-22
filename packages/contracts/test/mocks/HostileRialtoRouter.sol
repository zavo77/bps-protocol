// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Test-only misbehaving Rialto swap-router stand-in used to prove the adapter's venue-agnostic
///         invariants reject every dishonest allowance-settlement outcome. Note there is deliberately
///         no "false return data" mode: the adapter never trusts router return values (it uses its own
///         observed stock balance delta), so a lying return cannot fool it. Test-only; never a
///         production asset.
contract HostileRialtoRouter {
    enum Mode {
        HONEST,
        REVERT, // revert unconditionally
        PARTIAL_SPEND, // pull wethAmountIn - 1 (adapter retains input residual)
        NO_SPEND, // pull nothing (adapter retains the whole input)
        UNDER_DELIVER, // deliver rate*in - underBy (adapter minimum must reject)
        NO_OUTPUT, // pull WETH, deliver nothing
        WRONG_TOKEN, // deliver a different token
        OUTPUT_TO_ATTACKER, // deliver stock to an attacker address, not the caller
        EXCESS_PULL, // attempt to pull wethAmountIn + 1 (reverts on allowance)
        FALSE_RETURN, // deliver honestly but return a bogus amount (the adapter must ignore it)
        REENTER // call back into a target mid-settlement
    }

    address public immutable weth;
    uint256 public immutable rate;

    Mode public mode;
    address public wrongToken;
    address public attacker;
    uint256 public underBy = 1;
    address public reenterTarget;
    bytes public reenterCalldata;

    error ForcedFailure();
    error ReentrancyNotBlocked();

    constructor(address weth_, uint256 rate_) {
        weth = weth_;
        rate = rate_;
    }

    function setMode(Mode m) external {
        mode = m;
    }

    function setWrongToken(address token) external {
        wrongToken = token;
    }

    function setAttacker(address a) external {
        attacker = a;
    }

    function setUnderBy(uint256 amount) external {
        underBy = amount;
    }

    function setReenter(address target, bytes calldata data) external {
        reenterTarget = target;
        reenterCalldata = data;
    }

    function settle(address stockToken, uint256 wethAmountIn) external returns (uint256) {
        if (mode == Mode.REVERT) revert ForcedFailure();
        if (mode == Mode.REENTER) {
            (bool ok,) = reenterTarget.call(reenterCalldata);
            if (ok) revert ReentrancyNotBlocked();
            revert ForcedFailure();
        }

        uint256 out = wethAmountIn * rate;

        if (mode == Mode.NO_SPEND) {
            // pull nothing
        } else if (mode == Mode.PARTIAL_SPEND) {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(weth).transferFrom(msg.sender, address(this), wethAmountIn - 1);
        } else if (mode == Mode.EXCESS_PULL) {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(weth).transferFrom(msg.sender, address(this), wethAmountIn + 1); // allowance reverts
        } else {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(weth).transferFrom(msg.sender, address(this), wethAmountIn);
        }

        if (mode == Mode.NO_OUTPUT) {
            return out;
        }
        if (mode == Mode.WRONG_TOKEN) {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(wrongToken).transfer(msg.sender, out);
            return out;
        }
        if (mode == Mode.OUTPUT_TO_ATTACKER) {
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(stockToken).transfer(attacker, out);
            return out;
        }
        if (mode == Mode.UNDER_DELIVER) {
            uint256 delivered = out <= underBy ? 0 : out - underBy;
            // forge-lint: disable-next-line(erc20-unchecked-transfer)
            IERC20(stockToken).transfer(msg.sender, delivered);
            return delivered;
        }

        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(stockToken).transfer(msg.sender, out); // honest delivery
        if (mode == Mode.FALSE_RETURN) return type(uint256).max; // bogus return; adapter must ignore
        return out; // HONEST
    }
}
