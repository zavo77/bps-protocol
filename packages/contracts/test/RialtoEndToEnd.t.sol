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
}

/// @notice Complete local end-to-end proof of the beta flow: a frozen BPSTradeRouter buy funds the
///         stock-acquisition budget; the StockAcquisitionVault acquires stock through the concrete
///         Rialto adapter (registry-locked mock router); the vault applies the frozen 80/20 split and
///         delivers the reserve; the DistributionFundingCoordinator funds a DistributionClaimManager
///         cycle with exactly the released 80%; and an eligible locker claims against a fixture PoD
///         root. All addresses/assets are fictional and local; nothing is deployed and no Rialto API
///         is called. The circular immutability among router/adapter/vault/coordinator/manager is
///         closed with nonce-predicted CREATE addresses (no production authorization is weakened).
contract RialtoEndToEndTest {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    // Fictional rates: 1 WETH <-> 1000 BPS (buy legs); 1 WETH -> 100 stock (Rialto acquisition).
    uint256 internal constant BW_RATE = 1000;
    uint256 internal constant BW_DIV = 1000;
    uint256 internal constant STOCK_RATE = 100;
    uint24 internal constant TEST_FEE = 3000;
    uint256 internal constant DEADLINE = type(uint64).max;

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

    // Buy expectations for G = 1000e18.
    uint256 internal constant G = 1000e18;
    uint256 internal constant STOCK_BUDGET_WETH = 20e18; // 2%
    uint256 internal constant BURNED_BPS = 10_000e18; // 1% * BW_RATE
    // Acquisition of 20e18 WETH -> 2000e18 stock; 80/20 split.
    uint256 internal constant ACQUIRED = 2000e18;
    uint256 internal constant DISTRIBUTION = 1600e18; // 80%
    uint256 internal constant RESERVE_ALLOC = 400e18; // 20%

    function setUp() public {
        bps = new BPSToken(address(this));
        weth = new MockWETH();
        stockA = new MockERC20("Stock A", "STKA", 18);
        dexRouter = new MockSwapRouter02(address(bps), address(weth), BW_RATE, BW_DIV);
        registry = new MockRialtoRouterRegistry();
        rialtoRouter = new MockRialtoRouter(address(weth), STOCK_RATE);
        lockingVault = new BPSLockingVault(address(bps), OWNER);

        _deployStack();

        // Seed venue liquidity: DEX with BPS (buy legs), Rialto router with stock inventory.
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(address(dexRouter), 500_000_000e18);
        stockA.mint(address(rialtoRouter), 1_000_000_000e18);
        registry.setOwner(2, address(rialtoRouter));
    }

    /// @dev Deploy the six interdependent contracts closing every circular immutability with predicted
    ///      CREATE addresses. `this` acts as the vault's acquisition executor and the coordinator's root
    ///      publisher (trusted governance/keeper roles — see the operational blocker in HANDOVER).
    function _deployStack() internal {
        uint256 n = uint256(vm.getNonce(address(this)));
        address predR = vm.computeCreateAddress(address(this), n + 1); // trade router
        address predV = vm.computeCreateAddress(address(this), n + 5); // stock vault
        address predCo = vm.computeCreateAddress(address(this), n + 4); // coordinator

        swapAdapter = new UniswapV3BPSSwapAdapter(
            predR, address(bps), address(weth), address(dexRouter), TEST_FEE
        ); // n
        tradeRouter =
            new BPSTradeRouter(OWNER, address(bps), address(weth), address(swapAdapter), predV); // n+1
        rialtoAdapter = new RialtoStockAcquisitionAdapter(predV, address(weth), address(registry)); // n+2
        manager = new DistributionClaimManager(predCo, RECOVERY); // n+3
        coordinator = new DistributionFundingCoordinator(predV, address(manager), address(this)); // n+4
        address[] memory basket = new address[](1);
        basket[0] = address(stockA);
        vault = new StockAcquisitionVault(
            address(weth),
            address(rialtoAdapter),
            address(this), // executor
            RESERVE,
            predCo,
            basket
        ); // n+5

        require(address(tradeRouter) == predR, "router addr");
        require(address(vault) == predV, "vault addr");
        require(address(coordinator) == predCo, "coordinator addr");
        require(address(tradeRouter.swapAdapter()) == address(swapAdapter), "router->adapter");
        require(tradeRouter.stockBudgetRecipient() == address(vault), "router->vault");
        require(address(vault.acquisitionAdapter()) == address(rialtoAdapter), "vault->adapter");
        require(rialtoAdapter.stockAcquisitionVault() == address(vault), "adapter->vault");
        require(vault.distributionFundingCoordinator() == address(coordinator), "vault->coord");
        require(address(coordinator.stockAcquisitionVault()) == address(vault), "coord->vault");
        require(manager.owner() == address(coordinator), "coord owns manager");
    }

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function _true(bool c, string memory m) internal pure {
        require(c, m);
    }

    function _rialtoExec(uint256 wethIn) internal view returns (bytes memory) {
        return abi.encode(
            RialtoStockAcquisitionAdapter.RialtoExecution({
                target: address(rialtoRouter),
                callData: abi.encodeWithSelector(
                    MockRialtoRouter.settle.selector, address(stockA), wethIn
                ),
                quoteDeadline: DEADLINE
            })
        );
    }

    /// @dev Drive the flow up to (but not including) the claim, funding cycle `cycleId` for `LOCKER`
    ///      with the exact released distribution and returning the fixture root leaf used.
    function _runToFunded(uint256 cycleId) internal returns (uint256 supplyBefore) {
        // 0. Eligible locker locks BPS (a real participant whose veBPS earns the entitlement).
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        bps.transfer(LOCKER, 1_000e18);
        vm.prank(LOCKER);
        bps.approve(address(lockingVault), 1_000e18);
        vm.prank(LOCKER);
        lockingVault.createLock(1_000e18, 7 days);

        // 1. Router buy funds the stock-acquisition budget (WETH) into the vault.
        weth.mint(USER, G);
        vm.prank(USER);
        weth.approve(address(tradeRouter), G);
        supplyBefore = bps.totalSupply();
        vm.prank(USER);
        tradeRouter.buyExactWethForBps(G, 0, 0, USER, DEADLINE);
        _eq(weth.balanceOf(address(vault)), STOCK_BUDGET_WETH, "2% stock budget funded to vault");
        _eq(supplyBefore - bps.totalSupply(), BURNED_BPS, "1% buy-burn reduced totalSupply");

        // 2-3. Executor acquires stock via the Rialto adapter; vault applies 80/20; reserve delivered.
        vault.executeAcquisition(
            address(stockA), STOCK_BUDGET_WETH, 1900e18, DEADLINE, _rialtoExec(STOCK_BUDGET_WETH)
        );
        _eq(vault.totalStockAcquired(address(stockA)), ACQUIRED, "acquired stock");
        _eq(vault.distributionAllocated(address(stockA)), DISTRIBUTION, "80% distribution");
        _eq(vault.reserveAllocated(address(stockA)), RESERVE_ALLOC, "20% reserve");
        _eq(stockA.balanceOf(RESERVE), RESERVE_ALLOC, "reserve delivered exactly");
        _eq(stockA.balanceOf(address(vault)), DISTRIBUTION, "distribution retained");
        _eq(stockA.balanceOf(address(rialtoAdapter)), 0, "no adapter stock residue");
        _eq(weth.balanceOf(address(rialtoAdapter)), 0, "no adapter WETH residue");
        _eq(weth.balanceOf(address(vault)), 0, "vault WETH fully spent on acquisition");

        // 4. Executor releases the distribution allocation to the coordinator.
        vault.releaseToDistributionCoordinator(address(stockA), DISTRIBUTION);
        _eq(stockA.balanceOf(address(coordinator)), DISTRIBUTION, "coordinator holds distribution");

        // 5. Root publisher funds a cycle with a single-leaf fixture root for the locker.
        bytes32 leaf = manager.leafFor(cycleId, LOCKER, address(stockA), DISTRIBUTION);
        coordinator.fundAndPublishCycle(
            cycleId,
            leaf, // single-entitlement tree: root == leaf
            keccak256("allocationsContentHash"),
            keccak256("manifestEnvelopeHash"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            address(stockA),
            DISTRIBUTION
        );
        _eq(stockA.balanceOf(address(manager)), DISTRIBUTION, "manager funded exactly");
        _eq(stockA.balanceOf(address(coordinator)), 0, "coordinator retains nothing");
    }

    function testEndToEndClaim() public {
        _runToFunded(42);
        vm.warp(block.timestamp + 2); // enter the claim window

        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(LOCKER);
        manager.claim(42, address(stockA), DISTRIBUTION, emptyProof);

        _eq(stockA.balanceOf(LOCKER), DISTRIBUTION, "locker claimed exactly the distribution");
        _eq(stockA.balanceOf(address(manager)), 0, "manager fully claimed");
        // Full reconciliation: acquired = distribution + reserve; claimed + reserve == acquired.
        _eq(DISTRIBUTION + RESERVE_ALLOC, ACQUIRED, "80/20 conserves the acquisition");
        _eq(stockA.balanceOf(LOCKER) + stockA.balanceOf(RESERVE), ACQUIRED, "all stock accounted");
        // No residues / lingering approvals anywhere in the new components.
        _eq(weth.allowance(address(vault), address(rialtoAdapter)), 0, "vault->adapter allowance 0");
        _eq(weth.allowance(address(rialtoAdapter), address(rialtoRouter)), 0, "adapter->router 0");
        _eq(stockA.allowance(address(coordinator), address(manager)), 0, "coord->manager 0");
        _eq(stockA.balanceOf(address(vault)), 0, "vault distribution fully released");
    }

    function testInvalidProofCannotClaim() public {
        _runToFunded(42);
        vm.warp(block.timestamp + 2);
        bytes32[] memory emptyProof = new bytes32[](0);
        // Wrong amount -> different leaf -> fails against the single-leaf root.
        vm.prank(LOCKER);
        vm.expectRevert(DistributionClaimManager.InvalidProof.selector);
        manager.claim(42, address(stockA), DISTRIBUTION - 1, emptyProof);
    }

    function testDuplicateClaimCannotClaim() public {
        _runToFunded(42);
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

    // A hostile Rialto router mid-flow must revert the entire acquisition atomically, leaving the
    // vault's post-buy state (WETH budget) untouched and nothing distributed.
    function testHostileRialtoRollsBackAcquisition() public {
        HostileRialtoRouter hostile = new HostileRialtoRouter(address(weth), STOCK_RATE);
        stockA.mint(address(hostile), 1_000_000e18);
        registry.setOwner(2, address(hostile));
        hostile.setMode(HostileRialtoRouter.Mode.UNDER_DELIVER);
        hostile.setUnderBy(200e18); // deliver 1800e18 < the 1900e18 minimum

        weth.mint(USER, G);
        vm.prank(USER);
        weth.approve(address(tradeRouter), G);
        vm.prank(USER);
        tradeRouter.buyExactWethForBps(G, 0, 0, USER, DEADLINE);
        _eq(weth.balanceOf(address(vault)), STOCK_BUDGET_WETH, "budget funded");

        bytes memory ex = abi.encode(
            RialtoStockAcquisitionAdapter.RialtoExecution({
                target: address(hostile),
                callData: abi.encodeWithSelector(
                    MockRialtoRouter.settle.selector, address(stockA), STOCK_BUDGET_WETH
                ),
                quoteDeadline: DEADLINE
            })
        );
        vm.expectRevert();
        vault.executeAcquisition(address(stockA), STOCK_BUDGET_WETH, 1900e18, DEADLINE, ex);

        _eq(weth.balanceOf(address(vault)), STOCK_BUDGET_WETH, "vault WETH budget intact");
        _eq(vault.totalStockAcquired(address(stockA)), 0, "no acquisition recorded");
        _eq(vault.distributionAllocated(address(stockA)), 0, "no distribution");
        _eq(stockA.balanceOf(address(vault)), 0, "no stock in vault");
        _eq(stockA.balanceOf(RESERVE), 0, "no reserve delivered");
    }
}
