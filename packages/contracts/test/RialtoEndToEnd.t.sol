// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BPSToken} from "../src/BPSToken.sol";
import {BPSTradeRouter} from "../src/BPSTradeRouter.sol";
import {BPSLockingVault} from "../src/BPSLockingVault.sol";
import {StockAcquisitionVault} from "../src/StockAcquisitionVault.sol";
import {DistributionClaimManager} from "../src/DistributionClaimManager.sol";
import {DistributionFundingCoordinator} from "../src/DistributionFundingCoordinator.sol";
import {UniswapV3BPSSwapAdapter} from "../src/adapters/UniswapV3BPSSwapAdapter.sol";
import {RialtoStockAcquisitionAdapter} from "../src/adapters/RialtoStockAcquisitionAdapter.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";
import {MockSwapRouter02} from "./mocks/MockSwapRouter02.sol";
import {MockRialtoRouterRegistry} from "./mocks/MockRialtoRouterRegistry.sol";
import {MockRialtoRouter} from "./mocks/MockRialtoRouter.sol";
import {HostileRialtoRouter} from "./mocks/HostileRialtoRouter.sol";

interface Vm {
    function warp(uint256 newTimestamp) external;
    function prank(address sender) external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function getNonce(address account) external view returns (uint64);
    function computeCreateAddress(address deployer, uint256 nonce) external pure returns (address);
    function chainId(uint256 newChainId) external;
}

/// @notice Complete local end-to-end proof of the beta flow with the acquisition-recording coordinator
///         occupying BOTH frozen vault roles (executor + distributionFundingCoordinator): router buy ->
///         vault 2% WETH budget -> trusted operator calls coordinator -> coordinator (as executor)
///         drives the vault acquisition through the Rialto adapter -> coordinator records the exact
///         acquisition from vault deltas -> reserve receives exact 20% -> rootPublisher funds exactly
///         that acquisition's 80% into one cycle -> eligible locker claims -> invalid/duplicate fail.
///         All fictional/local; nothing deployed; no Rialto API called. Circular immutability closed via
///         nonce-predicted CREATE; the test acts as the trusted acquisitionOperator and rootPublisher.
contract RialtoEndToEndTest {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    uint256 internal constant BW_RATE = 1000; // 1 WETH <-> 1000 BPS (buy legs)
    uint256 internal constant BW_DIV = 1000;
    uint256 internal constant STOCK_RATE = 100; // 1 WETH -> 100 stock (Rialto acquisition)
    uint24 internal constant TEST_FEE = 3000;
    uint256 internal constant DEADLINE = type(uint64).max;
    uint256 internal constant RH_CHAIN = 4663;

    address internal constant OWNER = address(0x0A11);
    address internal constant RESERVE = address(0x5E5E);
    address internal constant RECOVERY = address(0x4EC0);
    address internal constant USER = address(0xA11CE);
    address internal constant LOCKER = address(0x10C6);

    BPSToken internal bps;
    MockWETH internal weth;
    MockERC20 internal stockA;
    MockSwapRouter02 internal dexRouter;
    MockRialtoRouterRegistry internal registry;
    MockRialtoRouter internal rialtoRouter;

    UniswapV3BPSSwapAdapter internal swapAdapter;
    BPSTradeRouter internal tradeRouter;
    RialtoStockAcquisitionAdapter internal rialtoAdapter;
    DistributionClaimManager internal manager;
    DistributionFundingCoordinator internal coordinator;
    StockAcquisitionVault internal vault;
    BPSLockingVault internal lockingVault;

    uint256 internal constant G = 1000e18;
    uint256 internal constant STOCK_BUDGET_WETH = 20e18; // 2%
    uint256 internal constant BURNED_BPS = 10_000e18; // 1% * BW_RATE
    uint256 internal constant ACQUIRED = 2000e18; // 20e18 * STOCK_RATE
    uint256 internal constant DISTRIBUTION = 1600e18; // 80%
    uint256 internal constant RESERVE_ALLOC = 400e18; // 20%

    function setUp() public {
        vm.chainId(RH_CHAIN); // the Rialto adapter deploys only on Robinhood Chain
        bps = new BPSToken(address(this));
        weth = new MockWETH();
        stockA = new MockERC20("Stock A", "STKA", 18);
        dexRouter = new MockSwapRouter02(address(bps), address(weth), BW_RATE, BW_DIV);
        registry = new MockRialtoRouterRegistry();
        rialtoRouter = new MockRialtoRouter(address(weth), STOCK_RATE);
        lockingVault = new BPSLockingVault(address(bps), OWNER);

        _deployStack();

        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(address(dexRouter), 500_000_000e18);
        stockA.mint(address(rialtoRouter), 1_000_000_000e18);
        registry.setOwner(2, address(rialtoRouter));
    }

    /// @dev The test contract is the trusted acquisitionOperator and rootPublisher. The coordinator is
    ///      BOTH the vault's executor and its distributionFundingCoordinator.
    function _deployStack() internal {
        uint256 n = uint256(vm.getNonce(address(this)));
        address predR = vm.computeCreateAddress(address(this), n + 1);
        address predCo = vm.computeCreateAddress(address(this), n + 4);
        address predV = vm.computeCreateAddress(address(this), n + 5);

        swapAdapter = new UniswapV3BPSSwapAdapter(
            predR, address(bps), address(weth), address(dexRouter), TEST_FEE
        ); // n
        tradeRouter =
            new BPSTradeRouter(OWNER, address(bps), address(weth), address(swapAdapter), predV); // n+1
        rialtoAdapter = new RialtoStockAcquisitionAdapter(predV, address(weth), address(registry)); // n+2
        manager = new DistributionClaimManager(predCo, RECOVERY); // n+3
        coordinator = new DistributionFundingCoordinator(
            predV, address(manager), address(this), address(this)
        ); // n+4  (operator == publisher == this)
        address[] memory basket = new address[](1);
        basket[0] = address(stockA);
        vault = new StockAcquisitionVault(
            address(weth), address(rialtoAdapter), predCo, RESERVE, predCo, basket
        ); // n+5  (executor == coordinator == predCo)

        require(address(tradeRouter) == predR, "router addr");
        require(address(coordinator) == predCo, "coord addr");
        require(address(vault) == predV, "vault addr");
        require(tradeRouter.stockBudgetRecipient() == address(vault), "router->vault");
        require(vault.acquisitionExecutor() == address(coordinator), "executor==coordinator");
        require(
            vault.distributionFundingCoordinator() == address(coordinator), "coord==coordinator"
        );
        require(rialtoAdapter.stockAcquisitionVault() == address(vault), "adapter->vault");
        require(manager.owner() == address(coordinator), "coord owns manager");
    }

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function _true(bool c, string memory m) internal pure {
        require(c, m);
    }

    function _rialtoExec(address stockToken, address routerTarget, uint256 wethIn)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(
            RialtoStockAcquisitionAdapter.RialtoExecution({
                target: routerTarget,
                callData: abi.encodeWithSelector(
                    MockRialtoRouter.settle.selector, stockToken, wethIn
                ),
                quoteDeadline: type(uint64).max
            })
        );
    }

    function _buyFundsBudget() internal returns (uint256 supplyBefore) {
        weth.mint(USER, G);
        vm.prank(USER);
        weth.approve(address(tradeRouter), G);
        supplyBefore = bps.totalSupply();
        vm.prank(USER);
        tradeRouter.buyExactWethForBps(G, 0, 0, USER, DEADLINE);
        _eq(weth.balanceOf(address(vault)), STOCK_BUDGET_WETH, "2% budget funded to vault");
        _eq(supplyBefore - bps.totalSupply(), BURNED_BPS, "1% true burn");
    }

    /// @dev Drive router buy -> operator acquires+records -> returns the acquisition id.
    function _acquire() internal returns (uint256 acquisitionId) {
        _buyFundsBudget();
        // Trusted acquisitionOperator (this) calls the coordinator, which (as executor) drives the
        // vault acquisition through the Rialto adapter and records the exact deltas.
        acquisitionId = coordinator.executeAndRecordAcquisition(
            address(stockA),
            STOCK_BUDGET_WETH,
            1900e18,
            DEADLINE,
            _rialtoExec(address(stockA), address(rialtoRouter), STOCK_BUDGET_WETH)
        );
        _eq(vault.totalStockAcquired(address(stockA)), ACQUIRED, "acquired");
        _eq(stockA.balanceOf(RESERVE), RESERVE_ALLOC, "exact 20% reserve delivered");
        (,,, uint256 acq, uint256 dist, uint256 res,) = coordinator.acquisitions(acquisitionId);
        _eq(acq, ACQUIRED, "record acquired");
        _eq(dist, DISTRIBUTION, "record 80%");
        _eq(res, RESERVE_ALLOC, "record 20%");
    }

    function testEndToEndClaim() public {
        uint256 id = _acquire();
        uint256 cycleId = 42;
        bytes32 leaf = manager.leafFor(cycleId, LOCKER, address(stockA), DISTRIBUTION);
        // rootPublisher (this) funds exactly the recorded 80% into one cycle.
        coordinator.fundRecordedAcquisition(
            id,
            leaf,
            keccak256("alloc"),
            keccak256("manifest"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            cycleId
        );
        _eq(stockA.balanceOf(address(manager)), DISTRIBUTION, "manager funded exact 80%");
        _eq(stockA.balanceOf(address(coordinator)), 0, "coordinator retains nothing");

        vm.warp(block.timestamp + 2);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(LOCKER);
        manager.claim(cycleId, address(stockA), DISTRIBUTION, emptyProof);

        _eq(stockA.balanceOf(LOCKER), DISTRIBUTION, "locker claimed exact 80%");
        _eq(stockA.balanceOf(LOCKER) + stockA.balanceOf(RESERVE), ACQUIRED, "all stock accounted");
        _eq(DISTRIBUTION + RESERVE_ALLOC, ACQUIRED, "80/20 conserves");
    }

    function testInvalidProofCannotClaim() public {
        uint256 id = _acquire();
        bytes32 leaf = manager.leafFor(42, LOCKER, address(stockA), DISTRIBUTION);
        coordinator.fundRecordedAcquisition(
            id,
            leaf,
            keccak256("a"),
            keccak256("m"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            42
        );
        vm.warp(block.timestamp + 2);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(LOCKER);
        vm.expectRevert(DistributionClaimManager.InvalidProof.selector);
        manager.claim(42, address(stockA), DISTRIBUTION - 1, emptyProof);
    }

    function testDuplicateClaimCannotClaim() public {
        uint256 id = _acquire();
        bytes32 leaf = manager.leafFor(42, LOCKER, address(stockA), DISTRIBUTION);
        coordinator.fundRecordedAcquisition(
            id,
            leaf,
            keccak256("a"),
            keccak256("m"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            42
        );
        vm.warp(block.timestamp + 2);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(LOCKER);
        manager.claim(42, address(stockA), DISTRIBUTION, emptyProof);
        vm.prank(LOCKER);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionClaimManager.AlreadyClaimed.selector, 42, LOCKER, address(stockA)
            )
        );
        manager.claim(42, address(stockA), DISTRIBUTION, emptyProof);
    }

    // A hostile Rialto router mid-flow reverts the whole acquisition atomically: no record, no id, the
    // vault's post-buy WETH budget untouched, nothing distributed.
    function testHostileRialtoRollsBackAcquisition() public {
        HostileRialtoRouter hostile = new HostileRialtoRouter(address(weth), STOCK_RATE);
        stockA.mint(address(hostile), 1_000_000e18);
        registry.setOwner(2, address(hostile));
        hostile.setMode(HostileRialtoRouter.Mode.NO_OUTPUT);

        _buyFundsBudget();
        vm.expectRevert();
        coordinator.executeAndRecordAcquisition(
            address(stockA),
            STOCK_BUDGET_WETH,
            1900e18,
            DEADLINE,
            _rialtoExec(address(stockA), address(hostile), STOCK_BUDGET_WETH)
        );

        _eq(coordinator.acquisitionCount(), 0, "no acquisition recorded");
        _eq(weth.balanceOf(address(vault)), STOCK_BUDGET_WETH, "vault budget intact");
        _eq(vault.totalStockAcquired(address(stockA)), 0, "no acquisition");
        _eq(stockA.balanceOf(RESERVE), 0, "no reserve delivered");
    }

    // Fee-on-transfer stock through the complete adapter->vault path is rejected by the frozen vault's
    // report-vs-observed check (the adapter forwards its observed net amount; the vault sees less).
    function testFeeOnTransferStockRejectedThroughAdapterPath() public {
        MockFeeOnTransferERC20 feeStock = new MockFeeOnTransferERC20("Fee Stock", "fSTK", 100); // 1%
        MockRialtoRouter feeRouter = new MockRialtoRouter(address(weth), STOCK_RATE);
        feeStock.mint(address(feeRouter), 1_000_000e18);
        MockRialtoRouterRegistry feeReg = new MockRialtoRouterRegistry();

        // Minimal vault + Rialto adapter with the fee stock in the basket; this contract is the executor.
        uint256 n = uint256(vm.getNonce(address(this)));
        address predV = vm.computeCreateAddress(address(this), n + 1);
        RialtoStockAcquisitionAdapter feeAdapter =
            new RialtoStockAcquisitionAdapter(predV, address(weth), address(feeReg)); // n
        address[] memory basket = new address[](1);
        basket[0] = address(feeStock);
        StockAcquisitionVault feeVault = new StockAcquisitionVault(
            address(weth), address(feeAdapter), address(this), RESERVE, address(0xC00D), basket
        ); // n+1
        require(address(feeVault) == predV, "fee vault addr");
        feeReg.setOwner(2, address(feeRouter));
        weth.mint(address(feeVault), 1_000_000e18);

        vm.expectRevert(); // vault ReportedStockMismatch: observed (net of fee) < adapter-reported
        feeVault.executeAcquisition(
            address(feeStock),
            STOCK_BUDGET_WETH,
            1,
            DEADLINE,
            _rialtoExec(address(feeStock), address(feeRouter), STOCK_BUDGET_WETH)
        );
    }
}
