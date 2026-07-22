// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {RialtoAdapterBase} from "./RialtoAdapterBase.t.sol";
import {RialtoStockAcquisitionAdapter} from "../src/adapters/RialtoStockAcquisitionAdapter.sol";
import {HostileRialtoRouter} from "./mocks/HostileRialtoRouter.sol";
import {MockRialtoRouter} from "./mocks/MockRialtoRouter.sol";
import {MockRialtoRouterRegistry} from "./mocks/MockRialtoRouterRegistry.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";

contract RialtoAdapterHostileTest is RialtoAdapterBase {
    uint256 internal constant W = 20e18;
    uint256 internal constant OUT = 20e18 * RATE;

    HostileRialtoRouter internal h;

    function setUp() public {
        _deployHonest();
        h = _deployHostileRouter(); // registry now points feature 2 at the hostile router
    }

    function _hostileExec(uint256 wethIn) internal view returns (bytes memory) {
        return _execData(address(h), _settleCall(address(stockA), wethIn), DEADLINE);
    }

    function _run(HostileRialtoRouter.Mode m, uint256 minOut) internal {
        _fundVaultWeth(W);
        uint256 vaultWethBefore = weth.balanceOf(address(this));
        h.setMode(m);

        vm.expectRevert();
        adapter.acquireStock(address(stockA), W, minOut, DEADLINE, _hostileExec(W));

        _eq(weth.balanceOf(address(this)), vaultWethBefore, "vault WETH intact");
        _eq(stockA.balanceOf(address(this)), 0, "vault got no stock");
        _eq(weth.balanceOf(address(adapter)), 0, "no WETH residual");
        _eq(stockA.balanceOf(address(adapter)), 0, "no stock residual");
        _eq(weth.allowance(address(adapter), address(h)), 0, "router allowance cleared");
    }

    function testVenueRevert() public {
        _run(HostileRialtoRouter.Mode.REVERT, OUT);
    }

    function testPartialSpend() public {
        _run(HostileRialtoRouter.Mode.PARTIAL_SPEND, 1); // adapter retains WETH -> ResidualWeth
    }

    function testNoSpend() public {
        _run(HostileRialtoRouter.Mode.NO_SPEND, 1); // adapter retains full input -> ResidualWeth
    }

    function testUnderDeliver() public {
        _run(HostileRialtoRouter.Mode.UNDER_DELIVER, OUT); // observed < min -> MinimumStockOutNotMet
    }

    function testNoOutput() public {
        _run(HostileRialtoRouter.Mode.NO_OUTPUT, 1); // observed 0 -> MinimumStockOutNotMet
    }

    function testOutputToAttacker() public {
        h.setAttacker(ATTACKER);
        _run(HostileRialtoRouter.Mode.OUTPUT_TO_ATTACKER, 1); // requested-stock delta 0
        _eq(stockA.balanceOf(ATTACKER), 0, "attacker delivery rolled back");
    }

    function testWrongTokenDelivery() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        other.mint(address(h), 1_000_000e18);
        h.setWrongToken(address(other));
        _run(HostileRialtoRouter.Mode.WRONG_TOKEN, 1); // requested-stock delta 0
    }

    function testExcessPull() public {
        _run(HostileRialtoRouter.Mode.EXCESS_PULL, 1); // pulls amountIn+1 -> allowance revert
    }

    function testReentrancyBlocked() public {
        _fundVaultWeth(W);
        h.setMode(HostileRialtoRouter.Mode.REENTER);
        h.setReenter(
            address(adapter),
            abi.encodeWithSelector(
                adapter.acquireStock.selector,
                address(stockA),
                W,
                uint256(1),
                DEADLINE,
                _hostileExec(W)
            )
        );
        vm.expectRevert();
        adapter.acquireStock(address(stockA), W, 1, DEADLINE, _hostileExec(W));
        _eq(weth.balanceOf(address(this)), W, "vault WETH intact");
        _eq(stockA.balanceOf(address(this)), 0, "no stock");
    }

    // A fee-on-transfer WETH makes the adapter's pull land short of amountIn -> FundingMismatch, before
    // any router interaction.
    function testFeeOnTransferWethInputReverts() public {
        MockFeeOnTransferERC20 feeWeth = new MockFeeOnTransferERC20("Fee WETH", "fWETH", 100); // 1%
        MockRialtoRouterRegistry reg = new MockRialtoRouterRegistry();
        MockRialtoRouter r = new MockRialtoRouter(address(feeWeth), RATE);
        RialtoStockAcquisitionAdapter fa =
            new RialtoStockAcquisitionAdapter(address(this), address(feeWeth), address(reg));
        reg.setOwner(2, address(r));
        _approved[address(stockA)] = true;
        stockA.mint(address(r), 1_000_000e18);
        feeWeth.mint(address(this), W);
        feeWeth.approve(address(fa), W);

        bytes memory ex = _execData(address(r), _settleCall(address(stockA), W), DEADLINE);
        vm.expectRevert(); // FundingMismatch: received (net of fee) < amountIn
        fa.acquireStock(address(stockA), W, 1, DEADLINE, ex);
    }
}
