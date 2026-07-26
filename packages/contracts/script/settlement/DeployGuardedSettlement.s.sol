// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {GuardedSettlementConfig} from "./GuardedSettlementConfig.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface SVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function writeFile(string calldata path, string calldata data) external;
}

/// @title DeployGuardedSettlement
/// @notice BROADCAST-FREE deployment preflight for the guarded-settlement canary stack (TASK 10K-6).
///         `run()` loads config from the environment, FAILS CLOSED on any invalid value or wrong chain
///         via `GuardedSettlementConfig.validate`, and writes a sanitized manifest of the exact
///         constructor/configuration values a controller will use. It NEVER signs, broadcasts, reads a
///         private key, or reads RIALTO_API_KEY. Actual deployment + configuration + unpause is a
///         separate, explicitly authorized controller-driven step (see GUARDED_SETTLEMENT_RUNBOOK.md).
///         D-24 stands: this preflight authorizes no deployment or execution.
///
///         Required environment variables (addresses/uints; see deploy/guarded-settlement.env.example):
///           GS_CONTROLLER (deployed-contract Safe/controller), GS_SEQUENCER_FEED (zero if none),
///           GS_SEQUENCER_GRACE_SEC, GS_MAX_WETH_FEED_AGE_SEC, GS_MAX_NVDA_FEED_AGE_SEC, GS_CANARY_CAP_WEI.
contract DeployGuardedSettlement {
    using Strings for address;
    using Strings for uint256;

    SVm internal constant SVM = SVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    function run() external {
        GuardedSettlementConfig.GSConfig memory c = GuardedSettlementConfig.GSConfig({
            controller: SVM.envAddress("GS_CONTROLLER"),
            sequencerFeed: SVM.envAddress("GS_SEQUENCER_FEED"),
            sequencerGraceSec: SVM.envUint("GS_SEQUENCER_GRACE_SEC"),
            maxWethFeedAgeSec: SVM.envUint("GS_MAX_WETH_FEED_AGE_SEC"),
            maxNvdaFeedAgeSec: SVM.envUint("GS_MAX_NVDA_FEED_AGE_SEC"),
            canaryCapWeth: SVM.envUint("GS_CANARY_CAP_WEI")
        });
        // Fail closed on wrong chain, EOA/zero/dead controller, missing externals, or bad policy bounds.
        GuardedSettlementConfig.validate(c);
        SVM.writeFile("deploy/guarded-settlement.manifest.out.json", _manifest(c));
    }

    function _manifest(GuardedSettlementConfig.GSConfig memory c)
        internal
        view
        returns (string memory)
    {
        // Sanitized: addresses + policy values only. No secrets, RPC, or key material.
        return string.concat(
            '{\n  "schemaVersion": "1.0.0",\n  "task": "TASK 10K-6",\n  "broadcastReady": false,\n  "chainId": ',
            block.chainid.toString(),
            ',\n  "controller": "',
            c.controller.toHexString(),
            '",\n  "weth": "',
            GuardedSettlementConfig.WETH.toHexString(),
            '",\n  "nvda": "',
            GuardedSettlementConfig.NVDA.toHexString(),
            '",\n  "ethUsdFeed": "',
            GuardedSettlementConfig.ETH_USD_FEED.toHexString(),
            '",\n  "nvdaUsdFeed": "',
            GuardedSettlementConfig.NVDA_USD_FEED.toHexString(),
            '",\n  "registry": "',
            GuardedSettlementConfig.OFFICIAL_REGISTRY.toHexString(),
            '",\n  "featureId": 2,\n  "sequencerFeed": "',
            c.sequencerFeed.toHexString(),
            '",\n',
            _manifestTail(c)
        );
    }

    function _manifestTail(GuardedSettlementConfig.GSConfig memory c)
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            '  "routerCodeHash": "0xa7041268d6f20802f420b5c71e84a991dc797f27cb474265598b89e43ef27611",\n',
            '  "settlementSelector": "0x77963966",\n  "maxDeviationBps": 100,\n  "canaryCapWei": ',
            c.canaryCapWeth.toString(),
            ',\n  "maxWethFeedAgeSec": ',
            c.maxWethFeedAgeSec.toString(),
            ',\n  "maxNvdaFeedAgeSec": ',
            c.maxNvdaFeedAgeSec.toString(),
            ',\n  "startsPaused": true,\n  "note": "broadcast-free preflight; deploy + configure + unpause is a separate controller-driven step; D-24 stands"\n}\n'
        );
    }
}
