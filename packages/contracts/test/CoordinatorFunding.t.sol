// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DistributionFundingCoordinator} from "../src/DistributionFundingCoordinator.sol";
import {StockAcquisitionVault} from "../src/StockAcquisitionVault.sol";
import {DistributionClaimManager} from "../src/DistributionClaimManager.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {HostileStockAcquisitionAdapter} from "./mocks/HostileStockAcquisitionAdapter.sol";

interface Vm {
    function warp(uint256 newTimestamp) external;
    function prank(address sender) external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function getNonce(address account) external view returns (uint64);
    function computeCreateAddress(address deployer, uint256 nonce) external pure returns (address);
}

/// @notice Tests for the acquisition-recording DistributionFundingCoordinator, which occupies BOTH the
///         frozen vault's `acquisitionExecutor` and `distributionFundingCoordinator` roles. The vault
///         is wired to a toggleable pass-through acquisition adapter (RATE = 1 -> acquired == wethIn) so
///         acquisitions can be driven honestly or made to misbehave. The claim-manager owner is the
///         coordinator (predicted address, no setter). All local/fictional; nothing deployed.
contract CoordinatorFundingTest {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    address internal constant OPERATOR = address(0x0E9A);
    address internal constant PUBLISHER = address(0x9AB1);
    address internal constant RESERVE = address(0x5E5E);
    address internal constant RECOVERY = address(0x4EC0);
    address internal constant ATTACKER = address(0xBAD);
    address internal constant SINK = address(0x5171);
    address internal constant SOURCE = address(0x50C6);
    uint256 internal constant DEADLINE = type(uint64).max;

    MockWETH internal weth;
    MockERC20 internal stockA;
    HostileStockAcquisitionAdapter internal acqAdapter;
    DistributionClaimManager internal manager;
    DistributionFundingCoordinator internal coordinator;
    StockAcquisitionVault internal vault;

    // RATE = 1 -> acquired == wethIn; W=2000e18 -> dist 1600e18 (80%), reserve 400e18 (20%).
    uint256 internal constant W = 2000e18;
    uint256 internal constant DIST = 1600e18;
    uint256 internal constant RESV = 400e18;

    function setUp() public {
        weth = new MockWETH();
        stockA = new MockERC20("Stock A", "STKA", 18);
        acqAdapter = new HostileStockAcquisitionAdapter(address(weth), SINK, SOURCE, 1); // default HONEST

        uint256 n = uint256(vm.getNonce(address(this)));
        address predCo = vm.computeCreateAddress(address(this), n + 1);
        address predV = vm.computeCreateAddress(address(this), n + 2);
        manager = new DistributionClaimManager(predCo, RECOVERY); // n
        coordinator =
            new DistributionFundingCoordinator(predV, address(manager), OPERATOR, PUBLISHER); // n+1
        address[] memory basket = new address[](1);
        basket[0] = address(stockA);
        vault = new StockAcquisitionVault(
            address(weth), address(acqAdapter), predCo, RESERVE, predCo, basket
        ); // n+2

        require(address(coordinator) == predCo, "coord addr");
        require(address(vault) == predV, "vault addr");
        require(vault.acquisitionExecutor() == address(coordinator), "executor role");
        require(vault.distributionFundingCoordinator() == address(coordinator), "coordinator role");

        // Seed the acquisition source (stock) and give the vault a WETH budget.
        stockA.mint(SOURCE, 1_000_000_000e18);
        vm.prank(SOURCE);
        stockA.approve(address(acqAdapter), type(uint256).max);
        weth.mint(address(vault), 10_000_000e18);
    }

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function _true(bool c, string memory m) internal pure {
        require(c, m);
    }

    function _acquire(uint256 wethIn, uint256 minOut) internal returns (uint256 id) {
        vm.prank(OPERATOR);
        return
            coordinator.executeAndRecordAcquisition(address(stockA), wethIn, minOut, DEADLINE, "");
    }

    function _fund(uint256 acquisitionId, uint256 cycleId) internal {
        vm.prank(PUBLISHER);
        coordinator.fundRecordedAcquisition(
            acquisitionId,
            keccak256(abi.encode("root", cycleId)),
            keccak256("alloc"),
            keccak256("manifest"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            cycleId
        );
    }

    // --- Dual-role + constructor -----------------------------------------------------------------

    function testCoordinatorOccupiesBothVaultRoles() public view {
        _true(vault.acquisitionExecutor() == address(coordinator), "executor==coordinator");
        _true(vault.distributionFundingCoordinator() == address(coordinator), "coord==coordinator");
        _true(address(coordinator.stockAcquisitionVault()) == address(vault), "coord->vault");
        _true(manager.owner() == address(coordinator), "coord owns manager");
        _true(coordinator.acquisitionOperator() == OPERATOR, "operator");
        _true(coordinator.rootPublisher() == PUBLISHER, "publisher");
    }

    function testConstructorZeroVault() public {
        vm.expectRevert(DistributionFundingCoordinator.ZeroAddress.selector);
        new DistributionFundingCoordinator(address(0), address(manager), OPERATOR, PUBLISHER);
    }

    function testConstructorManagerNotAContract() public {
        vm.expectRevert(
            abi.encodeWithSelector(DistributionFundingCoordinator.NotAContract.selector, ATTACKER)
        );
        new DistributionFundingCoordinator(address(vault), ATTACKER, OPERATOR, PUBLISHER);
    }

    // --- Recording -------------------------------------------------------------------------------

    function testHonestAcquisitionProducesOneExactRecord() public {
        uint256 id = _acquire(W, 1900e18);
        _eq(id, 1, "first id");
        _eq(coordinator.acquisitionCount(), 1, "count");
        (
            DistributionFundingCoordinator.AcquisitionStatus status,
            address token,
            uint256 wethSpent,
            uint256 acquired,
            uint256 dist,
            uint256 reserve,
            uint256 cycleId
        ) = coordinator.acquisitions(1);
        _true(status == DistributionFundingCoordinator.AcquisitionStatus.RECORDED, "recorded");
        _true(token == address(stockA), "token");
        _eq(wethSpent, W, "weth spent");
        _eq(acquired, W, "acquired (rate 1)");
        _eq(dist, DIST, "80% distribution");
        _eq(reserve, RESV, "20% reserve");
        _eq(cycleId, 0, "no cycle yet");
        _eq(stockA.balanceOf(RESERVE), RESV, "reserve delivered by vault");
    }

    function testTwoAcquisitionsDistinctRecords() public {
        uint256 id1 = _acquire(W, 1);
        uint256 id2 = _acquire(1000e18, 1);
        _eq(id1, 1, "id1");
        _eq(id2, 2, "id2");
        (,,, uint256 acq1,,,) = coordinator.acquisitions(1);
        (,,, uint256 acq2,,,) = coordinator.acquisitions(2);
        _eq(acq1, W, "acq1 amount");
        _eq(acq2, 1000e18, "acq2 amount");
    }

    function testRoundingRemainderToReserve() public {
        uint256 wethIn = 2000e18 + 3; // acquired = 2000e18+3; floor(*80/100)=1600e18+2; reserve=400e18+1
        _acquire(wethIn, 1);
        (,,,, uint256 dist, uint256 reserve,) = coordinator.acquisitions(1);
        _eq(dist, 1600e18 + 2, "distribution floored");
        _eq(reserve, 400e18 + 1, "remainder to reserve");
        _eq(dist + reserve, wethIn, "split conserves");
    }

    function testUnauthorizedAcquisitionCallerReverts() public {
        vm.prank(ATTACKER);
        vm.expectRevert(DistributionFundingCoordinator.NotAcquisitionOperator.selector);
        coordinator.executeAndRecordAcquisition(address(stockA), W, 1, DEADLINE, "");
    }

    function testUnapprovedStockReverts() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        vm.prank(OPERATOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionFundingCoordinator.StockNotApproved.selector, address(other)
            )
        );
        coordinator.executeAndRecordAcquisition(address(other), W, 1, DEADLINE, "");
    }

    function testHostileAcquisitionNoRecordNoId() public {
        acqAdapter.setMode(HostileStockAcquisitionAdapter.Mode.LIE_OVER); // vault reverts
        vm.prank(OPERATOR);
        vm.expectRevert();
        coordinator.executeAndRecordAcquisition(address(stockA), W, 1, DEADLINE, "");
        _eq(coordinator.acquisitionCount(), 0, "no id consumed");
        (DistributionFundingCoordinator.AcquisitionStatus status,,,,,,) =
            coordinator.acquisitions(1);
        _true(status == DistributionFundingCoordinator.AcquisitionStatus.NONE, "no record");
    }

    function testVaultUnderDeliveryRollsBack() public {
        acqAdapter.setMode(HostileStockAcquisitionAdapter.Mode.UNDER_MIN);
        vm.prank(OPERATOR);
        vm.expectRevert();
        coordinator.executeAndRecordAcquisition(address(stockA), W, W, DEADLINE, "");
        _eq(coordinator.acquisitionCount(), 0, "no record");
        _eq(weth.balanceOf(address(vault)), 10_000_000e18, "vault WETH intact");
    }

    // --- Funding ---------------------------------------------------------------------------------

    function testFundsExactRecordedEightyPercent() public {
        uint256 id = _acquire(W, 1);
        _fund(id, 42);
        _eq(stockA.balanceOf(address(manager)), DIST, "manager funded exact 80%");
        _eq(stockA.balanceOf(address(coordinator)), 0, "coordinator retains nothing");
        _eq(manager.remaining(42, address(stockA)), DIST, "manager remaining == 80%");
        (DistributionFundingCoordinator.AcquisitionStatus status,,,,,, uint256 cyc) =
            coordinator.acquisitions(id);
        _true(status == DistributionFundingCoordinator.AcquisitionStatus.FUNDED, "funded");
        _eq(cyc, 42, "cycle bound");
        _true(coordinator.cycleUsed(42), "cycle used");
        _eq(coordinator.cycleAcquisitionId(42), id, "cycle->acquisition linkage");
    }

    function testNonexistentAcquisitionReverts() public {
        vm.prank(PUBLISHER);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionFundingCoordinator.AcquisitionNotRecorded.selector, 99
            )
        );
        coordinator.fundRecordedAcquisition(
            99,
            keccak256("r"),
            keccak256("a"),
            keccak256("m"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            1
        );
    }

    function testNotRootPublisherReverts() public {
        uint256 id = _acquire(W, 1);
        vm.prank(ATTACKER);
        vm.expectRevert(DistributionFundingCoordinator.NotRootPublisher.selector);
        coordinator.fundRecordedAcquisition(
            id,
            keccak256("r"),
            keccak256("a"),
            keccak256("m"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            1
        );
    }

    function testDuplicateFundingReverts() public {
        uint256 id = _acquire(W, 1);
        _fund(id, 42);
        // Re-funding the same acquisition (any cycle) reverts: it is no longer RECORDED.
        vm.prank(PUBLISHER);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionFundingCoordinator.AcquisitionNotRecorded.selector, id
            )
        );
        coordinator.fundRecordedAcquisition(
            id,
            keccak256("r2"),
            keccak256("a"),
            keccak256("m"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            43
        );
    }

    function testCannotReassignAcquisitionToSecondCycle() public {
        uint256 id = _acquire(W, 1);
        _fund(id, 42);
        vm.prank(PUBLISHER);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionFundingCoordinator.AcquisitionNotRecorded.selector, id
            )
        );
        coordinator.fundRecordedAcquisition(
            id,
            keccak256("r"),
            keccak256("a"),
            keccak256("m"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            99
        );
    }

    function testCycleIdCannotFundSecondAcquisition() public {
        uint256 id1 = _acquire(W, 1);
        uint256 id2 = _acquire(W, 1);
        _fund(id1, 42);
        vm.prank(PUBLISHER);
        vm.expectRevert(
            abi.encodeWithSelector(DistributionFundingCoordinator.CycleAlreadyUsed.selector, 42)
        );
        coordinator.fundRecordedAcquisition(
            id2,
            keccak256("r"),
            keccak256("a"),
            keccak256("m"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            42
        );
    }

    function testOutOfOrderFundingCorrect() public {
        uint256 id1 = _acquire(W, 1); // dist 1600e18
        uint256 id2 = _acquire(1000e18, 1); // dist 800e18
        _fund(id2, 200); // fund the second first
        _fund(id1, 100);
        _eq(manager.remaining(200, address(stockA)), 800e18, "cycle 200 == acq2 80%");
        _eq(manager.remaining(100, address(stockA)), DIST, "cycle 100 == acq1 80%");
    }

    function testReserveNeverReleasedThroughCoordinator() public {
        uint256 id = _acquire(W, 1);
        uint256 reserveBefore = stockA.balanceOf(RESERVE);
        _fund(id, 42);
        _eq(stockA.balanceOf(RESERVE), reserveBefore, "reserve untouched by funding");
        _eq(vault.reserveAllocated(address(stockA)), RESV, "reserve accounting unchanged");
    }

    function testPreloadedDonationsPreserved() public {
        uint256 id = _acquire(W, 1);
        stockA.mint(address(coordinator), 5e18); // donation at coordinator
        stockA.mint(address(manager), 7e18); // donation at manager
        _fund(id, 42);
        _eq(stockA.balanceOf(address(coordinator)), 5e18, "coordinator donation preserved");
        _eq(stockA.balanceOf(address(manager)), 7e18 + DIST, "manager donation + funding");
        _eq(stockA.allowance(address(coordinator), address(manager)), 0, "allowance cleared");
    }
}
