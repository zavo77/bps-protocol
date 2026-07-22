// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {RialtoStockAcquisitionAdapter} from "../src/adapters/RialtoStockAcquisitionAdapter.sol";
import {IStockAcquisitionVaultView} from "../src/interfaces/IStockAcquisitionVaultView.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockRialtoRouterRegistry} from "./mocks/MockRialtoRouterRegistry.sol";
import {MockRialtoRouter} from "./mocks/MockRialtoRouter.sol";
import {HostileRialtoRouter} from "./mocks/HostileRialtoRouter.sol";

/// @dev Minimal inline Foundry cheatcode surface (no forge-std / submodules), per repo convention.
interface Vm {
    function warp(uint256 newTimestamp) external;
    function prank(address sender) external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function deal(address to, uint256 give) external;
    function chainId(uint256 newChainId) external;
}

/// @notice Shared setup for RialtoStockAcquisitionAdapter unit tests. The TEST CONTRACT itself acts as
///         the immutable StockAcquisitionVault: it implements the vault-view the adapter reads
///         (`isApprovedStockToken`), holds WETH, approves the adapter, and calls `acquireStock`
///         directly — so authorization is never weakened. All tokens/addresses/swaps are fictional and
///         local-only; nothing is deployed and no Rialto API is called.
abstract contract RialtoAdapterBase is IStockAcquisitionVaultView {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    uint256 internal constant RATE = 100; // stockOut = wethIn * 100
    uint256 internal constant DEADLINE = type(uint64).max;
    uint256 internal constant RH_CHAIN = 4663; // the adapter deploys only on Robinhood Chain
    address internal constant ATTACKER = address(0xBAD);

    MockWETH internal weth;
    MockERC20 internal stockA;
    MockRialtoRouterRegistry internal registry;
    MockRialtoRouter internal router;
    RialtoStockAcquisitionAdapter internal adapter;

    mapping(address => bool) internal _approved;

    // --- Vault-view the adapter reads (this contract IS the vault) --------------------------------

    function isApprovedStockToken(address token) external view returns (bool) {
        return _approved[token];
    }

    function distributionReleased(address) external pure returns (uint256) {
        return 0; // unused by the adapter
    }

    // --- Setup helpers ---------------------------------------------------------------------------

    function _deployHonest() internal {
        vm.chainId(RH_CHAIN); // the adapter's constructor requires block.chainid == 4663
        weth = new MockWETH();
        stockA = new MockERC20("Stock A", "STKA", 18);
        registry = new MockRialtoRouterRegistry();
        router = new MockRialtoRouter(address(weth), RATE);
        adapter = new RialtoStockAcquisitionAdapter(address(this), address(weth), address(registry));
        registry.setOwner(2, address(router));
        _approved[address(stockA)] = true;
        stockA.mint(address(router), 1_000_000_000e18); // router inventory
    }

    function _deployHostileRouter() internal returns (HostileRialtoRouter h) {
        h = new HostileRialtoRouter(address(weth), RATE);
        registry.setOwner(2, address(h));
        stockA.mint(address(h), 1_000_000_000e18);
    }

    /// @dev Fund this contract (the vault) with WETH and approve the adapter to pull it.
    function _fundVaultWeth(uint256 amount) internal {
        weth.mint(address(this), amount);
        weth.approve(address(adapter), amount);
    }

    function _settleCall(address stockToken, uint256 wethAmountIn)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(MockRialtoRouter.settle.selector, stockToken, wethAmountIn);
    }

    function _execData(address target, bytes memory callData, uint256 quoteDeadline)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(
            RialtoStockAcquisitionAdapter.RialtoExecution({
                target: target, callData: callData, quoteDeadline: quoteDeadline
            })
        );
    }

    /// @dev The standard honest execution payload for `stockA`, targeting the current registry router.
    function _honestExec(uint256 wethAmountIn) internal view returns (bytes memory) {
        return _execData(address(router), _settleCall(address(stockA), wethAmountIn), DEADLINE);
    }

    // --- Assertions ------------------------------------------------------------------------------

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function _eq(address a, address b, string memory m) internal pure {
        require(a == b, m);
    }

    function _true(bool c, string memory m) internal pure {
        require(c, m);
    }

    function _false(bool c, string memory m) internal pure {
        require(!c, m);
    }
}
