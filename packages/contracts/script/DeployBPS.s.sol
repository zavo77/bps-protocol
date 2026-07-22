// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BPSDeployment} from "./BPSDeployment.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface SVm {
    function envAddress(string calldata name) external view returns (address);
    function envAddress(string calldata name, string calldata delim)
        external
        view
        returns (address[] memory);
    function envUint(string calldata name) external view returns (uint256);
    function writeFile(string calldata path, string calldata data) external;
}

/// @title DeployBPS
/// @notice Operator-facing deployment preflight for the BPS protocol on Robinhood Chain (chain 4663).
///         It is intentionally BROADCAST-FREE in this repository: `run()` loads every input from
///         environment variables, FAILS CLOSED on any missing/zero/placeholder/aliased/incomplete value
///         or wrong chain, resolves the live feature-2 Rialto router, computes the full deterministic
///         predicted-address plan, and writes a sanitized manifest. It never signs, never broadcasts,
///         never prints a secret, and never reads RIALTO_API_KEY. The actual authorized broadcast is a
///         separate, explicitly authorized step described in `deploy/RUNBOOK.md`; wiring a private key
///         into this process is deliberately NOT provided here.
///
///         Required environment variables (addresses; see `.env.example`):
///           BPS_DEPLOYER, BPS_START_NONCE, BPS_WETH, BPS_RIALTO_REGISTRY, BPS_SWAP_ROUTER_02,
///           BPS_POOL_FEE, BPS_TREASURY, BPS_PROTOCOL_OWNER, BPS_RESERVE_RECIPIENT,
///           BPS_ACQUISITION_OPERATOR, BPS_ROOT_PUBLISHER, BPS_CLAIM_RECOVERY,
///           BPS_STOCK_BASKET (comma-separated). Any missing variable reverts the preflight.
contract DeployBPS is BPSDeployment {
    using Strings for address;
    using Strings for uint256;

    SVm internal constant SVM = SVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    /// @notice Load config from the environment, fail closed on any invalid input, and write a
    ///         sanitized predicted-address manifest to `deploy/manifest.out.json`. Broadcast-free.
    function run() external {
        DeployConfig memory c = _loadConfig();

        // Fail closed: wrong chain, zero/placeholder/aliased roles, no-code externals, unresolved
        // feature-2 router, or a bad basket all revert here before anything is written.
        _validate(c, true);

        Deployed memory p = _predict(c.deployer, c.startNonce);
        SVM.writeFile("deploy/manifest.out.json", _manifest(c, p));
    }

    function _loadConfig() internal view returns (DeployConfig memory c) {
        c.deployer = SVM.envAddress("BPS_DEPLOYER");
        c.startNonce = SVM.envUint("BPS_START_NONCE");
        c.weth = SVM.envAddress("BPS_WETH");
        c.rialtoRegistry = SVM.envAddress("BPS_RIALTO_REGISTRY");
        c.swapRouter02 = SVM.envAddress("BPS_SWAP_ROUTER_02");
        c.poolFee = uint24(SVM.envUint("BPS_POOL_FEE"));
        c.bpsRecipient = SVM.envAddress("BPS_TREASURY");
        c.protocolOwner = SVM.envAddress("BPS_PROTOCOL_OWNER");
        c.reserveRecipient = SVM.envAddress("BPS_RESERVE_RECIPIENT");
        c.acquisitionOperator = SVM.envAddress("BPS_ACQUISITION_OPERATOR");
        c.rootPublisher = SVM.envAddress("BPS_ROOT_PUBLISHER");
        c.claimRecoveryRecipient = SVM.envAddress("BPS_CLAIM_RECOVERY");
        c.stockBasket = SVM.envAddress("BPS_STOCK_BASKET", ",");
    }

    function _manifest(DeployConfig memory c, Deployed memory p)
        internal
        view
        returns (string memory)
    {
        // Sanitized: addresses and the nonce plan only. No secrets, no RPC, no key material. Transaction
        // hashes are intentionally empty (broadcastReady=false until an authorized broadcast fills them).
        string memory head = string.concat(
            '{\n  "schemaVersion": "1.0.0",\n  "chainId": ',
            block.chainid.toString(),
            ',\n  "broadcastReady": false,\n  "deployer": "',
            c.deployer.toHexString(),
            '",\n  "startNonce": ',
            c.startNonce.toString(),
            ',\n  "external": {\n    "weth": "',
            c.weth.toHexString(),
            '",\n    "rialtoRegistry": "',
            c.rialtoRegistry.toHexString(),
            '",\n    "swapRouter02": "',
            c.swapRouter02.toHexString(),
            '"\n  },\n  "predicted": {\n'
        );
        string memory addrs = string.concat(
            '    "bpsToken": "',
            p.bpsToken.toHexString(),
            '",\n    "lockingVault": "',
            p.lockingVault.toHexString(),
            '",\n    "claimManager": "',
            p.claimManager.toHexString(),
            '",\n    "rialtoAdapter": "',
            p.rialtoAdapter.toHexString(),
            '",\n    "coordinator": "',
            p.coordinator.toHexString(),
            '",\n    "stockVault": "',
            p.stockVault.toHexString(),
            '",\n    "uniswapAdapter": "',
            p.uniswapAdapter.toHexString(),
            '",\n    "tradeRouter": "',
            p.tradeRouter.toHexString(),
            '"\n  }\n}\n'
        );
        return string.concat(head, addrs);
    }
}
