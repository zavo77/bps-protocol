// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {StockVaultBase} from "./StockVaultBase.t.sol";
import {StockAcquisitionVault} from "../src/StockAcquisitionVault.sol";
import {HostileStockAcquisitionAdapter} from "./mocks/HostileStockAcquisitionAdapter.sol";

/// @notice Focused tests for the net-residual-custody guarantee: an adapter that passes exact-spend,
///         report==observed, and minimum checks must STILL revert if it finishes holding new WETH
///         (retained input) or new selected stock (skimmed output); and pre-existing donations at the
///         adapter must be tolerated (compared to the pre-call balance, not zero).
contract StockVaultResidualTest is StockVaultBase {
    uint256 internal constant W = 10_000e18;
    uint256 internal constant VAULT_WETH = 10_000_000e18; // seeded by _deployHostile

    HostileStockAcquisitionAdapter internal h;
    StockAcquisitionVault internal hv;

    function setUp() public {
        _deploy();
        (h, hv) = _deployHostile();
    }

    /// @dev Full atomic-rollback assertion set for a reverted acquisition of stockA on the hostile
    ///      vault: vault balances, adapter balances, reserve, accounting, allowance, and (implicitly,
    ///      because the call reverted) any emitted acquisition state are all unwound.
    function _assertFullRollback() internal view {
        // Vault balances.
        _eq(weth.balanceOf(address(hv)), VAULT_WETH, "vault WETH restored");
        _eq(stockA.balanceOf(address(hv)), 0, "vault holds no stock");
        // Adapter balances (net residual unwound to zero).
        _eq(weth.balanceOf(address(h)), 0, "adapter WETH restored");
        _eq(stockA.balanceOf(address(h)), 0, "adapter stock restored");
        // Reserve recipient and the WETH sink untouched.
        _eq(stockA.balanceOf(RESERVE), 0, "reserve untouched");
        _eq(weth.balanceOf(SINK), 0, "sink untouched");
        // Accounting mappings.
        _eq(hv.totalWethSpent(), 0, "no weth spent recorded");
        _eq(hv.totalStockAcquired(address(stockA)), 0, "no stock acquired recorded");
        _eq(hv.distributionAllocated(address(stockA)), 0, "no distribution recorded");
        _eq(hv.reserveAllocated(address(stockA)), 0, "no reserve recorded");
        // Vault-to-adapter allowance cleared / never persisted.
        _eq(weth.allowance(address(hv), address(h)), 0, "no lingering approval");
    }

    // A. Retained WETH: adapter pulls the full exact input into itself and keeps it. Exact-spend (from
    //    the vault's view), report==observed, and minimum all pass, but the adapter holds new WETH.
    function testRetainedWethReverts() public {
        h.setMode(HostileStockAcquisitionAdapter.Mode.RETAIN_WETH);
        vm.prank(EXECUTOR);
        // Adapter WETH goes 0 -> W (it kept the pulled input).
        vm.expectRevert(
            abi.encodeWithSelector(StockAcquisitionVault.ResidualWethInAdapter.selector, 0, W)
        );
        hv.executeAcquisition(address(stockA), W, 1, DEADLINE, "");
        _assertFullRollback();
    }

    // B. Retained acquired stock: adapter consumes the exact WETH and delivers >= min honestly (report
    //    == observed), but also skims extra stock into itself.
    function testSkimmedStockReverts() public {
        h.setMode(HostileStockAcquisitionAdapter.Mode.SKIM_STOCK);
        vm.prank(EXECUTOR);
        // Adapter stock goes 0 -> skimAmount (default 1e18); it kept extra acquired stock.
        vm.expectRevert(
            abi.encodeWithSelector(
                StockAcquisitionVault.ResidualStockInAdapter.selector, 0, uint256(1e18)
            )
        );
        hv.executeAcquisition(address(stockA), W, 1, DEADLINE, "");
        _assertFullRollback();
    }

    // C. Donation tolerance: pre-existing WETH and stock donations at the adapter do not count as new
    //    residual and do not brick an otherwise-honest acquisition.
    function testDonationAtAdapterToleratedOnHonestAcquisition() public {
        weth.mint(address(h), 123e18); // unsolicited WETH donation at the adapter
        stockA.mint(address(h), 456e18); // unsolicited stock donation at the adapter
        uint256 adapterWethBefore = weth.balanceOf(address(h));
        uint256 adapterStockBefore = stockA.balanceOf(address(h));

        h.setMode(HostileStockAcquisitionAdapter.Mode.HONEST);
        vm.prank(EXECUTOR);
        uint256 got = hv.executeAcquisition(address(stockA), W, 1, DEADLINE, "");

        _eq(got, W, "honest acquisition succeeded despite donations");
        _eq(weth.balanceOf(address(h)), adapterWethBefore, "adapter WETH donation untouched");
        _eq(stockA.balanceOf(address(h)), adapterStockBefore, "adapter stock donation untouched");
        _eq(stockA.balanceOf(address(hv)), 8_000e18, "distribution retained");
        _eq(stockA.balanceOf(RESERVE), 2_000e18, "reserve delivered");
        _eq(weth.balanceOf(SINK), W, "consumed WETH routed to the venue sink");
    }

    // The net-residual check compares to the pre-call adapter balance, so a nonzero starting balance
    // is fine — but adding to it during the call (retained input) still reverts.
    function testDonationDoesNotMaskRetainedWeth() public {
        weth.mint(address(h), 777e18); // pre-existing donation
        h.setMode(HostileStockAcquisitionAdapter.Mode.RETAIN_WETH);
        vm.prank(EXECUTOR);
        // Adapter WETH goes 777e18 -> 777e18 + W; the pre-call baseline (not zero) is what's compared.
        vm.expectRevert(
            abi.encodeWithSelector(
                StockAcquisitionVault.ResidualWethInAdapter.selector, 777e18, 777e18 + W
            )
        );
        hv.executeAcquisition(address(stockA), W, 1, DEADLINE, "");
        // Rollback leaves only the pre-existing donation at the adapter.
        _eq(weth.balanceOf(address(h)), 777e18, "only the pre-existing donation remains");
        _eq(weth.balanceOf(address(hv)), VAULT_WETH, "vault WETH restored");
        _eq(hv.totalWethSpent(), 0, "no acquisition recorded");
    }
}
