// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {StockVaultBase} from "./StockVaultBase.t.sol";
import {StockAcquisitionVault} from "../src/StockAcquisitionVault.sol";
import {HostileStockAcquisitionAdapter} from "./mocks/HostileStockAcquisitionAdapter.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StockVaultHostileTest is StockVaultBase {
    uint256 internal constant W = 10_000e18;

    HostileStockAcquisitionAdapter internal h;
    StockAcquisitionVault internal hv;

    function setUp() public {
        _deploy();
        (h, hv) = _deployHostile();
    }

    function _run(HostileStockAcquisitionAdapter.Mode m, uint256 minOut) internal {
        h.setMode(m);
        vm.prank(EXECUTOR);
        vm.expectRevert();
        hv.executeAcquisition(address(stockA), W, minOut, DEADLINE, "");
    }

    function _assertNoStateChange() internal view {
        _eq(hv.totalWethSpent(), 0, "no weth spent recorded");
        _eq(hv.totalStockAcquired(address(stockA)), 0, "no stock acquired recorded");
        _eq(hv.distributionAllocated(address(stockA)), 0, "no distribution recorded");
        _eq(weth.balanceOf(address(hv)), 10_000_000e18, "vault WETH intact");
        _eq(stockA.balanceOf(address(hv)), 0, "vault holds no stock");
        _eq(stockA.balanceOf(RESERVE), 0, "reserve untouched");
        _eq(weth.allowance(address(hv), address(h)), 0, "no lingering approval");
    }

    function testHonestHostileAdapterSucceeds() public {
        // Sanity: in HONEST mode the hostile adapter behaves and the vault accounts correctly.
        h.setMode(HostileStockAcquisitionAdapter.Mode.HONEST);
        vm.prank(EXECUTOR);
        uint256 got = hv.executeAcquisition(address(stockA), W, 1, DEADLINE, "");
        _eq(got, W, "honest acquisition");
        _eq(stockA.balanceOf(address(hv)), 8_000e18, "distribution retained");
    }

    function testUnderMinReverts() public {
        _run(HostileStockAcquisitionAdapter.Mode.UNDER_MIN, W);
        _assertNoStateChange();
    }

    function testLieOverReverts() public {
        _run(HostileStockAcquisitionAdapter.Mode.LIE_OVER, 1);
        _assertNoStateChange();
    }

    function testLieUnderReverts() public {
        _run(HostileStockAcquisitionAdapter.Mode.LIE_UNDER, 1);
        _assertNoStateChange();
    }

    function testPartialWethSpendReverts() public {
        _run(HostileStockAcquisitionAdapter.Mode.PARTIAL_SPEND, 1);
        _assertNoStateChange();
    }

    function testExcessWethSpendReverts() public {
        // Adapter tries to pull amountIn + 1, but the exact approval caps it -> allowance revert.
        _run(HostileStockAcquisitionAdapter.Mode.EXCESS_SPEND, 1);
        _assertNoStateChange();
    }

    function testWrongTokenDeliveryReverts() public {
        h.setWrongToken(address(stockB));
        _run(HostileStockAcquisitionAdapter.Mode.WRONG_TOKEN, 1);
        _assertNoStateChange();
        _eq(stockA.balanceOf(address(hv)), 0, "requested token not credited");
    }

    function testNoDeliveryReverts() public {
        _run(HostileStockAcquisitionAdapter.Mode.NO_DELIVERY, 1);
        _assertNoStateChange();
    }

    function testRetainStockReverts() public {
        _run(HostileStockAcquisitionAdapter.Mode.RETAIN_STOCK, 1);
        _assertNoStateChange();
    }

    function testRevertingAdapterReverts() public {
        _run(HostileStockAcquisitionAdapter.Mode.REVERT, 1);
        _assertNoStateChange();
    }

    function testReentrancyBlocked() public {
        h.setMode(HostileStockAcquisitionAdapter.Mode.REENTER);
        h.setReenter(
            address(hv),
            abi.encodeWithSelector(
                hv.executeAcquisition.selector, address(stockA), W, uint256(1), DEADLINE, bytes("")
            )
        );
        vm.prank(EXECUTOR);
        vm.expectRevert();
        hv.executeAcquisition(address(stockA), W, 1, DEADLINE, "");
        _assertNoStateChange();
    }

    // A fee-on-transfer stock token makes the adapter's honest delivery land short at the vault, so
    // the observed delta is less than the reported amount and the acquisition reverts atomically.
    function testFeeOnTransferStockReverts() public {
        MockFeeOnTransferERC20 feeStock = new MockFeeOnTransferERC20("Fee Stock", "fSTK", 100); // 1%
        address[] memory b = new address[](1);
        b[0] = address(feeStock);
        HostileStockAcquisitionAdapter fh =
            new HostileStockAcquisitionAdapter(address(weth), SINK, SOURCE, RATE);
        StockAcquisitionVault fv =
            new StockAcquisitionVault(address(weth), address(fh), EXECUTOR, RESERVE, COORD, b);
        feeStock.mint(SOURCE, 1_000_000e18);
        vm.prank(SOURCE);
        feeStock.approve(address(fh), type(uint256).max);
        weth.mint(address(fv), 1_000_000e18);
        fh.setMode(HostileStockAcquisitionAdapter.Mode.HONEST);

        vm.prank(EXECUTOR);
        vm.expectRevert(); // ReportedStockMismatch: observed (net of fee) < reported (gross)
        fv.executeAcquisition(address(feeStock), W, 1, DEADLINE, "");
        _eq(weth.balanceOf(address(fv)), 1_000_000e18, "fee-token acquisition rolled back");
    }
}
