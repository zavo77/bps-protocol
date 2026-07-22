// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DistributionFundingCoordinator} from "../src/DistributionFundingCoordinator.sol";
import {StockAcquisitionVault} from "../src/StockAcquisitionVault.sol";
import {DistributionClaimManager} from "../src/DistributionClaimManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {AllowanceTrapERC20} from "./mocks/AllowanceTrapERC20.sol";
import {HostileFundingManager} from "./mocks/HostileFundingManager.sol";
import {HostileStockAcquisitionAdapter} from "./mocks/HostileStockAcquisitionAdapter.sol";

interface Vm {
    function prank(address sender) external;
    function expectRevert() external;
    function expectRevert(bytes calldata revertData) external;
    function getNonce(address account) external view returns (uint64);
    function computeCreateAddress(address deployer, uint256 nonce) external pure returns (address);
}

/// @notice Closes the two funding-stage rollback gaps admitted in the Task 6B report — a claim-manager
///         that under-receives, and a stock token whose allowance cannot be cleared — WITHOUT touching
///         any frozen production contract. Both drive the real acquisition-recording coordinator (as
///         the vault's sole executor + distribution coordinator) through a genuine recorded acquisition
///         and then fail inside `fundRecordedAcquisition`; each test proves the ENTIRE operation rolls
///         back: acquisition status, cycle linkage, vault `distributionReleased`, coordinator/manager
///         balances, allowance, and reserve accounting all return to their pre-funding values.
///         All local/fictional; nothing deployed.
contract CoordinatorFundingRollbackTest {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    address internal constant OPERATOR = address(0x0E9A);
    address internal constant PUBLISHER = address(0x9AB1);
    address internal constant RESERVE = address(0x5E5E);
    address internal constant RECOVERY = address(0x4EC0);
    address internal constant SINK = address(0x5171);
    address internal constant SOURCE = address(0x50C6);
    address internal constant MGRSINK = address(0x5152);
    uint256 internal constant DEADLINE = type(uint64).max;

    uint256 internal constant W = 2000e18;
    uint256 internal constant DIST = 1600e18; // 80%
    uint256 internal constant RESV = 400e18; // 20%
    uint256 internal constant SKIM = 1e18;

    MockWETH internal weth;
    IERC20 internal stock;
    HostileStockAcquisitionAdapter internal acqAdapter;
    DistributionFundingCoordinator internal coordinator;
    StockAcquisitionVault internal vault;

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function _true(bool c, string memory m) internal pure {
        require(c, m);
    }

    // Deploy WETH + the pass-through acquisition adapter (before any predicted-address nonce read).
    function _baseInfra() internal {
        weth = new MockWETH();
        acqAdapter = new HostileStockAcquisitionAdapter(address(weth), SINK, SOURCE, 1); // HONEST, rate 1
    }

    // Deploy coordinator (both vault roles) + vault against an already-deployed `manager`, wiring
    // `stock` as the sole basket asset. Nonce plan read fresh here: coordinator(n), vault(n+1).
    function _deployCoordAndVault(address manager) internal {
        uint256 n = uint256(vm.getNonce(address(this)));
        address predCo = vm.computeCreateAddress(address(this), n);
        address predV = vm.computeCreateAddress(address(this), n + 1);
        coordinator = new DistributionFundingCoordinator(predV, manager, OPERATOR, PUBLISHER);
        address[] memory basket = new address[](1);
        basket[0] = address(stock);
        vault = new StockAcquisitionVault(
            address(weth), address(acqAdapter), predCo, RESERVE, predCo, basket
        );
        require(address(coordinator) == predCo, "coord addr");
        require(address(vault) == predV, "vault addr");
    }

    // Seed source stock + vault WETH budget, then record one honest acquisition of W.
    function _seedAndAcquire() internal returns (uint256 id) {
        MockERC20(address(stock)).mint(SOURCE, 1_000_000e18);
        vm.prank(SOURCE);
        stock.approve(address(acqAdapter), type(uint256).max);
        weth.mint(address(vault), 10_000_000e18);
        vm.prank(OPERATOR);
        id = coordinator.executeAndRecordAcquisition(address(stock), W, 1, DEADLINE, "");
        require(id == 1, "recorded id");
    }

    function _assertRecordedNotFunded(uint256 id, uint256 cycleId) internal view {
        (DistributionFundingCoordinator.AcquisitionStatus status,,,,,, uint256 cyc) =
            coordinator.acquisitions(id);
        _true(
            status == DistributionFundingCoordinator.AcquisitionStatus.RECORDED,
            "still RECORDED (not FUNDED)"
        );
        _eq(cyc, 0, "no cycle bound");
        _true(!coordinator.cycleUsed(cycleId), "cycle not marked used");
        _eq(coordinator.cycleAcquisitionId(cycleId), 0, "no cycle->acq linkage");
        _eq(vault.distributionReleased(address(stock)), 0, "vault release rolled back");
        _eq(vault.reserveAllocated(address(stock)), RESV, "reserve accounting unchanged");
    }

    function _fund(uint256 id, uint256 cycleId) internal {
        vm.prank(PUBLISHER);
        coordinator.fundRecordedAcquisition(
            id,
            keccak256("root"),
            keccak256("alloc"),
            keccak256("manifest"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            cycleId
        );
    }

    // --- A.1: claim-manager under-receipt rolls back the whole funding -----------------------------

    function testClaimManagerUnderReceiptRollsBack() public {
        _baseInfra();
        stock = IERC20(address(new MockERC20("Stock A", "STKA", 18)));
        HostileFundingManager hostileMgr = new HostileFundingManager(MGRSINK, SKIM);
        _deployCoordAndVault(address(hostileMgr));
        uint256 id = _seedAndAcquire();

        uint256 coordBefore = stock.balanceOf(address(coordinator));

        // Manager pulls the full DIST but keeps only DIST-SKIM -> ManagerReceiptMismatch, full rollback.
        vm.prank(PUBLISHER);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionFundingCoordinator.ManagerReceiptMismatch.selector, DIST, DIST - SKIM
            )
        );
        coordinator.fundRecordedAcquisition(
            id,
            keccak256("root"),
            keccak256("alloc"),
            keccak256("manifest"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            42
        );

        _assertRecordedNotFunded(id, 42);
        _eq(stock.balanceOf(address(coordinator)), coordBefore, "coordinator balance unchanged");
        _eq(stock.balanceOf(address(hostileMgr)), 0, "manager received nothing");
        _eq(stock.balanceOf(MGRSINK), 0, "no skim escaped");
        _eq(stock.allowance(address(coordinator), address(hostileMgr)), 0, "allowance cleared");
    }

    // --- A.2: allowance-clear failure rolls back the whole funding ---------------------------------

    function testAllowanceClearFailureRollsBack() public {
        _baseInfra();
        stock = IERC20(address(new AllowanceTrapERC20()));
        // Real frozen manager owned by the coordinator; nonce plan: manager(n), coordinator(n+1).
        uint256 n = uint256(vm.getNonce(address(this)));
        address predCo = vm.computeCreateAddress(address(this), n + 1);
        DistributionClaimManager manager = new DistributionClaimManager(predCo, RECOVERY);
        _deployCoordAndVault(address(manager));
        require(manager.owner() == address(coordinator), "coord owns manager");
        uint256 id = _seedAndAcquire();

        uint256 coordBefore = stock.balanceOf(address(coordinator));
        uint256 mgrBefore = stock.balanceOf(address(manager));

        // The trap token never clears the coordinator's allowance -> AllowanceNotCleared, full rollback.
        vm.prank(PUBLISHER);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionFundingCoordinator.AllowanceNotCleared.selector, DIST
            )
        );
        coordinator.fundRecordedAcquisition(
            id,
            keccak256("root"),
            keccak256("alloc"),
            keccak256("manifest"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            7
        );

        _assertRecordedNotFunded(id, 7);
        _eq(stock.balanceOf(address(coordinator)), coordBefore, "coordinator balance unchanged");
        _eq(stock.balanceOf(address(manager)), mgrBefore, "manager received nothing (rolled back)");
        (,,,,, bool published) = manager.cycles(7);
        _true(!published, "cycle not published");
    }
}
