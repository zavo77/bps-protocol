// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {CanaryDeployment} from "./CanaryDeployment.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface CSVm {
    function envAddress(string calldata name) external view returns (address);
    function envAddress(string calldata name, string calldata delim)
        external
        view
        returns (address[] memory);
    function envUint(string calldata name) external view returns (uint256);
    function writeFile(string calldata path, string calldata data) external;
}

/// @title DeployBPSCanary
/// @notice ISOLATED, BROADCAST-FREE canary deployment preflight. It loads canary-only `BPSC_*` env inputs,
///         FAILS CLOSED on any missing/zero/placeholder/aliased/wrong-chain value, resolves the live
///         feature-2 router, computes the deterministic predicted-address plan for a SEPARATE canary
///         instance, and writes a sanitized, unmistakably-non-production manifest to a CANARY-ONLY output
///         path. It never signs, never broadcasts, never reads a secret/RIALTO_API_KEY, and NEVER writes
///         the canonical production manifest (`deploy/manifest.out.json` / `deploy/robinhood-mainnet*.json`).
///         `broadcastReady` and `liveWritesApproved` are hardcoded false here; enabling a live canary is a
///         separate, explicitly-authorized step (see `docs/CANARY_RUNBOOK.md`).
contract DeployBPSCanary is CanaryDeployment {
    using Strings for address;
    using Strings for uint256;

    CSVm internal constant CSVM = CSVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    /// @notice Canary-only output path — deliberately distinct from every canonical/production manifest.
    string internal constant CANARY_OUT = "deploy/robinhood-mainnet.canary.out.json";

    function run() external {
        CanaryConfig memory c = _loadConfig();
        _validateCanary(c, true); // fail closed before anything is written
        CanaryDeployed memory p = _predictCanary(c.deployer, c.startNonce);
        CSVM.writeFile(CANARY_OUT, _manifest(c, p));
    }

    function _loadConfig() internal view returns (CanaryConfig memory c) {
        c.deployer = CSVM.envAddress("BPSC_DEPLOYER");
        c.startNonce = CSVM.envUint("BPSC_START_NONCE");
        c.weth = CSVM.envAddress("BPSC_WETH");
        c.rialtoRegistry = CSVM.envAddress("BPSC_RIALTO_REGISTRY");
        c.swapRouter02 = CSVM.envAddress("BPSC_SWAP_ROUTER_02");
        c.poolFee = uint24(CSVM.envUint("BPSC_POOL_FEE"));
        c.canaryRecipient = CSVM.envAddress("BPSC_RECIPIENT");
        c.canaryOwner = CSVM.envAddress("BPSC_OWNER");
        c.reserveRecipient = CSVM.envAddress("BPSC_RESERVE_RECIPIENT");
        c.acquisitionOperator = CSVM.envAddress("BPSC_ACQUISITION_OPERATOR");
        c.rootPublisher = CSVM.envAddress("BPSC_ROOT_PUBLISHER");
        c.claimRecoveryRecipient = CSVM.envAddress("BPSC_CLAIM_RECOVERY");
        c.stockBasket = CSVM.envAddress("BPSC_STOCK_BASKET", ",");
    }

    function _manifest(CanaryConfig memory c, CanaryDeployed memory p)
        internal
        view
        returns (string memory)
    {
        // Sanitized predicted-address plan only. Unmistakably non-production and write-disabled.
        return string.concat(
            '{\n  "schemaVersion": "1.0.0",\n  "canary": true,\n  "production": false,\n  "chainId": ',
            block.chainid.toString(),
            ',\n  "broadcastReady": false,\n  "liveWritesApproved": false,\n  "tokenName": "BPS Canary -- TEST ONLY",\n  "tokenSymbol": "BPSC-TEST",\n  "deployer": "',
            c.deployer.toHexString(),
            '",\n  "startNonce": ',
            c.startNonce.toString(),
            ',\n  "predicted": {\n    "canaryToken": "',
            p.canaryToken.toHexString(),
            '",\n    "lockingVault": "',
            p.lockingVault.toHexString(),
            '",\n    "claimManager": "',
            p.claimManager.toHexString(),
            '",\n    "tradeRouter": "',
            p.tradeRouter.toHexString(),
            '"\n  }\n}\n'
        );
    }
}
