// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SwapAdapterBase} from "./SwapAdapterBase.t.sol";
import {UniswapV3BPSSwapAdapter} from "../src/adapters/UniswapV3BPSSwapAdapter.sol";
import {HostileSwapRouter02} from "./mocks/HostileSwapRouter02.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";
import {MockSwapRouter02} from "./mocks/MockSwapRouter02.sol";

contract SwapAdapterHostileTest is SwapAdapterBase {
    uint256 internal constant AMT = 1e18;
    uint256 internal constant OUT = 1e18 * RATE; // 1000e18

    HostileSwapRouter02 internal hv;
    UniswapV3BPSSwapAdapter internal ha;

    function setUp() public {
        _deployUnit();
        (hv, ha) = _deployHostileUnit();
    }

    // Fund the router (this contract), set the mode, expect an atomic revert, and assert full rollback
    // of router/recipient/adapter balances and the venue approval.
    function _run(HostileSwapRouter02.Mode m, uint256 minOut) internal {
        weth.mint(address(this), AMT);
        weth.approve(address(ha), AMT);
        uint256 routerBefore = weth.balanceOf(address(this));
        hv.setMode(m);

        vm.expectRevert();
        ha.swapExactInput(address(weth), address(bps), AMT, minOut, RECIP, DEADLINE);

        _eq(weth.balanceOf(address(this)), routerBefore, "router WETH intact");
        _eq(bps.balanceOf(RECIP), 0, "recipient got no BPS");
        _eq(bps.balanceOf(address(ha)), 0, "no BPS residual in adapter");
        _eq(weth.balanceOf(address(ha)), 0, "no WETH residual in adapter");
        _eq(weth.allowance(address(ha), address(hv)), 0, "venue approval cleared");
    }

    function testVenueRevertRollsBack() public {
        _run(HostileSwapRouter02.Mode.REVERT, 0);
    }

    function testPartialInputSpendRollsBack() public {
        _run(HostileSwapRouter02.Mode.PARTIAL_SPEND, 0); // adapter retains 1 wei -> ResidualWeth
    }

    function testNoInputSpendRollsBack() public {
        _run(HostileSwapRouter02.Mode.NO_SPEND, 0); // adapter retains full input -> ResidualWeth
    }

    function testUnderDeliveryRollsBack() public {
        _run(HostileSwapRouter02.Mode.UNDER_DELIVER, OUT); // observed < minimum -> MinimumOutputNotMet
    }

    function testNoOutputRollsBack() public {
        _run(HostileSwapRouter02.Mode.NO_OUTPUT, 0); // observed 0 != reported -> OutputMismatch
    }

    function testWrongTokenDeliveryRollsBack() public {
        hv.setWrongToken(address(weth)); // deliver WETH, not the requested BPS
        _run(HostileSwapRouter02.Mode.WRONG_TOKEN, 0); // requested-token delta 0 != reported
    }

    function testLieOverRollsBack() public {
        _run(HostileSwapRouter02.Mode.LIE_OVER, 0); // reported > observed -> OutputMismatch
    }

    function testLieUnderRollsBack() public {
        _run(HostileSwapRouter02.Mode.LIE_UNDER, 0); // reported < observed -> OutputMismatch
    }

    function testOutputToAdapterRollsBack() public {
        _run(HostileSwapRouter02.Mode.OUTPUT_TO_ADAPTER, 0); // recipient delta 0 != reported
    }

    function testExcessPullRollsBack() public {
        _run(HostileSwapRouter02.Mode.EXCESS_PULL, 0); // pulls amountIn+1 -> allowance revert
    }

    function testReentrancyBlocked() public {
        weth.mint(address(this), AMT);
        weth.approve(address(ha), AMT);
        uint256 routerBefore = weth.balanceOf(address(this));
        hv.setMode(HostileSwapRouter02.Mode.REENTER);
        hv.setReenter(
            address(ha),
            abi.encodeWithSelector(
                ha.swapExactInput.selector,
                address(weth),
                address(bps),
                AMT,
                uint256(0),
                RECIP,
                DEADLINE
            )
        );
        vm.expectRevert();
        ha.swapExactInput(address(weth), address(bps), AMT, 0, RECIP, DEADLINE);
        _eq(weth.balanceOf(address(this)), routerBefore, "router WETH intact");
        _eq(bps.balanceOf(RECIP), 0, "no delivery");
    }

    // A fee-on-transfer input token makes the adapter's pull land short, so exact-input verification
    // reverts before any venue interaction.
    function testFeeOnTransferInputReverts() public {
        MockFeeOnTransferERC20 feeWeth = new MockFeeOnTransferERC20("Fee WETH", "fWETH", 100); // 1%
        MockSwapRouter02 fv = new MockSwapRouter02(address(bps), address(feeWeth), RATE, DIV);
        UniswapV3BPSSwapAdapter fa = new UniswapV3BPSSwapAdapter(
            address(this), address(bps), address(feeWeth), address(fv), TEST_FEE
        );
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(address(fv), 100_000_000e18);
        feeWeth.mint(address(fv), 100_000_000e18);
        feeWeth.mint(address(this), AMT);
        feeWeth.approve(address(fa), AMT);

        vm.expectRevert(); // FundingMismatch: received (net of fee) < amountIn
        fa.swapExactInput(address(feeWeth), address(bps), AMT, 0, RECIP, DEADLINE);
    }
}
