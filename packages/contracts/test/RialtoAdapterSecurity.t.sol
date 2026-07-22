// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {RialtoAdapterBase} from "./RialtoAdapterBase.t.sol";
import {RialtoStockAcquisitionAdapter} from "../src/adapters/RialtoStockAcquisitionAdapter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract RialtoAdapterSecurityTest is RialtoAdapterBase {
    uint256 internal constant W = 20e18;

    function setUp() public {
        _deployHonest();
    }

    // --- Constructor validation ------------------------------------------------------------------

    function testConstructorZeroVault() public {
        vm.expectRevert(RialtoStockAcquisitionAdapter.ZeroAddress.selector);
        new RialtoStockAcquisitionAdapter(address(0), address(weth), address(registry));
    }

    function testConstructorZeroWeth() public {
        vm.expectRevert(RialtoStockAcquisitionAdapter.ZeroAddress.selector);
        new RialtoStockAcquisitionAdapter(address(this), address(0), address(registry));
    }

    function testConstructorZeroRegistry() public {
        vm.expectRevert(RialtoStockAcquisitionAdapter.ZeroAddress.selector);
        new RialtoStockAcquisitionAdapter(address(this), address(weth), address(0));
    }

    function testConstructorWethAliasesVault() public {
        vm.expectRevert(RialtoStockAcquisitionAdapter.InvalidSystemAddress.selector);
        new RialtoStockAcquisitionAdapter(address(weth), address(weth), address(registry));
    }

    function testConstructorWethAliasesRegistry() public {
        vm.expectRevert(RialtoStockAcquisitionAdapter.InvalidSystemAddress.selector);
        new RialtoStockAcquisitionAdapter(address(this), address(registry), address(registry));
    }

    function testConstructorWethNotAContract() public {
        vm.expectRevert(
            abi.encodeWithSelector(RialtoStockAcquisitionAdapter.NotAContract.selector, ATTACKER)
        );
        new RialtoStockAcquisitionAdapter(address(this), ATTACKER, address(registry));
    }

    function testConstructorRegistryNotAContract() public {
        vm.expectRevert(
            abi.encodeWithSelector(RialtoStockAcquisitionAdapter.NotAContract.selector, ATTACKER)
        );
        new RialtoStockAcquisitionAdapter(address(this), address(weth), ATTACKER);
    }

    function testImmutablesStored() public view {
        _eq(adapter.stockAcquisitionVault(), address(this), "vault");
        _eq(address(adapter.weth()), address(weth), "weth");
        _eq(address(adapter.routerRegistry()), address(registry), "registry");
        _true(adapter.SWAP_ROUTER_FEATURE_ID() == 2, "feature id 2");
    }

    // --- Runtime authorization and input validation ----------------------------------------------

    function testUnauthorizedCaller() public {
        _fundVaultWeth(W);
        vm.prank(ATTACKER);
        vm.expectRevert(RialtoStockAcquisitionAdapter.NotVault.selector);
        adapter.acquireStock(address(stockA), W, W * RATE, DEADLINE, _honestExec(W));
    }

    function testUnapprovedStock() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        vm.expectRevert(
            abi.encodeWithSelector(
                RialtoStockAcquisitionAdapter.StockNotApproved.selector, address(other)
            )
        );
        adapter.acquireStock(address(other), W, W * RATE, DEADLINE, _honestExec(W));
    }

    function testStockEqualsWeth() public {
        _approved[address(weth)] = true; // even if approved, WETH-as-stock is rejected
        vm.expectRevert(RialtoStockAcquisitionAdapter.InvalidStock.selector);
        adapter.acquireStock(address(weth), W, W * RATE, DEADLINE, _honestExec(W));
    }

    function testZeroAmountIn() public {
        vm.expectRevert(RialtoStockAcquisitionAdapter.ZeroAmountIn.selector);
        adapter.acquireStock(address(stockA), 0, 1, DEADLINE, _honestExec(0));
    }

    function testZeroMinimum() public {
        _fundVaultWeth(W);
        vm.expectRevert(RialtoStockAcquisitionAdapter.ZeroMinimumOutput.selector);
        adapter.acquireStock(address(stockA), W, 0, DEADLINE, _honestExec(W));
    }

    function testExpiredDeadline() public {
        vm.warp(1000);
        vm.expectRevert(RialtoStockAcquisitionAdapter.ExpiredDeadline.selector);
        adapter.acquireStock(address(stockA), W, W * RATE, 999, _honestExec(W));
    }

    function testExpiredQuote() public {
        vm.warp(1000);
        _fundVaultWeth(W);
        bytes memory ex = _execData(address(router), _settleCall(address(stockA), W), 999);
        vm.expectRevert(RialtoStockAcquisitionAdapter.ExpiredQuote.selector);
        adapter.acquireStock(address(stockA), W, W * RATE, DEADLINE, ex);
    }

    function testEmptyCallData() public {
        _fundVaultWeth(W);
        bytes memory ex = _execData(address(router), hex"", DEADLINE);
        vm.expectRevert(RialtoStockAcquisitionAdapter.EmptyCallData.selector);
        adapter.acquireStock(address(stockA), W, W * RATE, DEADLINE, ex);
    }

    // Verified real behavior: a paused/uninitialized feature makes `ownerOf(2)` REVERT, so the
    // acquisition fails closed (the revert propagates through the adapter).
    function testRegistryPausedOrUninitializedReverts() public {
        registry.pause(2);
        _fundVaultWeth(W);
        vm.expectRevert(); // MockRialtoRouterRegistry.FeaturePausedOrUninitialized (fail closed)
        adapter.acquireStock(address(stockA), W, W * RATE, DEADLINE, _honestExec(W));
    }

    // Defensive guard: if a (non-conformant) registry ever returned address(0) instead of reverting,
    // the adapter still rejects it.
    function testRegistryReturnsZeroRejected() public {
        registry.forceReturnZero(2);
        _fundVaultWeth(W);
        vm.expectRevert(RialtoStockAcquisitionAdapter.RouterFeatureUninitialized.selector);
        adapter.acquireStock(address(stockA), W, W * RATE, DEADLINE, _honestExec(W));
    }

    // The adapter is deployable ONLY on Robinhood Chain (block.chainid == 4663).
    function testConstructorWrongChainReverts() public {
        vm.chainId(1);
        vm.expectRevert(
            abi.encodeWithSelector(RialtoStockAcquisitionAdapter.WrongChain.selector, 1)
        );
        new RialtoStockAcquisitionAdapter(address(this), address(weth), address(registry));
    }

    function testMalformedExecutionDataReverts() public {
        _fundVaultWeth(W);
        vm.expectRevert(); // abi.decode of non-conformant bytes reverts
        adapter.acquireStock(address(stockA), W, W * RATE, DEADLINE, hex"deadbeef");
    }

    function testTruncatedExecutionDataReverts() public {
        _fundVaultWeth(W);
        bytes memory full = _honestExec(W);
        bytes memory truncated = new bytes(full.length - 32); // drop the trailing word
        for (uint256 i = 0; i < truncated.length; i++) {
            truncated[i] = full[i];
        }
        vm.expectRevert(); // decode out-of-bounds
        adapter.acquireStock(address(stockA), W, W * RATE, DEADLINE, truncated);
    }

    function testWrongTargetRejected() public {
        _fundVaultWeth(W);
        // executionData names a target that is not the current registry router.
        bytes memory ex = _execData(ATTACKER, _settleCall(address(stockA), W), DEADLINE);
        vm.expectRevert(
            abi.encodeWithSelector(
                RialtoStockAcquisitionAdapter.StaleOrWrongRouter.selector, ATTACKER, address(router)
            )
        );
        adapter.acquireStock(address(stockA), W, W * RATE, DEADLINE, ex);
    }

    function testStaleRouterAfterMigration() public {
        // A quote was built for the old router; the registry then migrates to a new router.
        address oldRouter = address(router);
        MockERC20 dummy = new MockERC20("New Router Placeholder", "NRP", 18); // just needs code
        registry.setOwner(2, address(dummy));
        _fundVaultWeth(W);
        bytes memory ex = _execData(oldRouter, _settleCall(address(stockA), W), DEADLINE);
        vm.expectRevert(
            abi.encodeWithSelector(
                RialtoStockAcquisitionAdapter.StaleOrWrongRouter.selector, oldRouter, address(dummy)
            )
        );
        adapter.acquireStock(address(stockA), W, W * RATE, DEADLINE, ex);
    }

    function testTargetWithoutCode() public {
        // Registry points feature 2 at an address with no code.
        registry.setOwner(2, ATTACKER);
        _fundVaultWeth(W);
        bytes memory ex = _execData(ATTACKER, _settleCall(address(stockA), W), DEADLINE);
        vm.expectRevert(
            abi.encodeWithSelector(RialtoStockAcquisitionAdapter.NotAContract.selector, ATTACKER)
        );
        adapter.acquireStock(address(stockA), W, W * RATE, DEADLINE, ex);
    }

    function testRouterAliasingWethRejected() public {
        // If the registry ever returned WETH as the router, the adapter must reject it.
        registry.setOwner(2, address(weth));
        _fundVaultWeth(W);
        bytes memory ex = _execData(address(weth), _settleCall(address(stockA), W), DEADLINE);
        vm.expectRevert(
            abi.encodeWithSelector(
                RialtoStockAcquisitionAdapter.InvalidRouterTarget.selector, address(weth)
            )
        );
        adapter.acquireStock(address(stockA), W, W * RATE, DEADLINE, ex);
    }

    function testNoNativeEthPath() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(adapter).call{value: 1}("");
        _false(ok, "adapter has no payable receive/fallback");
    }
}
