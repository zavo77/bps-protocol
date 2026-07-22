// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BuildProbe} from "../src/BuildProbe.sol";

/// @notice Verifies the Foundry test runner works. Uses no external test library
///         so the project has zero submodule dependencies.
contract BuildProbeTest {
    function testPing() public {
        BuildProbe probe = new BuildProbe();
        require(probe.ping() == keccak256("bps.build-probe"), "BuildProbe.ping mismatch");
    }
}
