// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DistributionFundingCoordinator} from "../src/DistributionFundingCoordinator.sol";
import {DistributionClaimManager} from "../src/DistributionClaimManager.sol";
import {MockDistributionSource} from "./mocks/MockDistributionSource.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

interface Vm {
    function warp(uint256 newTimestamp) external;
    function prank(address sender) external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function getNonce(address account) external view returns (uint64);
    function computeCreateAddress(address deployer, uint256 nonce) external pure returns (address);
}

contract CoordinatorFundingTest {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    address internal constant PUBLISHER = address(0x9AB1);
    address internal constant RECOVERY = address(0x4EC0);
    address internal constant CLAIMANT = address(0xC1A1);
    address internal constant ATTACKER = address(0xBAD);

    MockDistributionSource internal source;
    DistributionClaimManager internal manager;
    DistributionFundingCoordinator internal coordinator;
    MockERC20 internal stockA;

    function setUp() public {
        source = new MockDistributionSource();
        stockA = new MockERC20("Stock A", "STKA", 18);
        // Predict the coordinator address so the claim manager can be owned by it directly (no setter).
        uint256 n = uint256(vm.getNonce(address(this)));
        address predictedCoordinator = vm.computeCreateAddress(address(this), n + 1);
        manager = new DistributionClaimManager(predictedCoordinator, RECOVERY);
        coordinator =
            new DistributionFundingCoordinator(address(source), address(manager), PUBLISHER);
        require(address(coordinator) == predictedCoordinator, "predicted coordinator mismatch");
        require(manager.owner() == address(coordinator), "coordinator owns manager");

        source.setApproved(address(stockA), true);
    }

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function _true(bool c, string memory m) internal pure {
        require(c, m);
    }

    /// @dev Model the vault releasing `amount` distribution stock to the coordinator.
    function _release(uint256 amount) internal {
        source.setReleased(address(stockA), amount);
        stockA.mint(address(coordinator), amount);
    }

    function _fund(uint256 cycleId, uint256 amount) internal {
        vm.prank(PUBLISHER);
        coordinator.fundAndPublishCycle(
            cycleId,
            keccak256("root"),
            keccak256("alloc"),
            keccak256("manifest"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            address(stockA),
            amount
        );
    }

    // --- Constructor -----------------------------------------------------------------------------

    function testConstructorZeroVault() public {
        vm.expectRevert(DistributionFundingCoordinator.ZeroAddress.selector);
        new DistributionFundingCoordinator(address(0), address(manager), PUBLISHER);
    }

    function testConstructorZeroManager() public {
        vm.expectRevert(DistributionFundingCoordinator.ZeroAddress.selector);
        new DistributionFundingCoordinator(address(source), address(0), PUBLISHER);
    }

    function testConstructorZeroPublisher() public {
        vm.expectRevert(DistributionFundingCoordinator.ZeroAddress.selector);
        new DistributionFundingCoordinator(address(source), address(manager), address(0));
    }

    function testConstructorAliasVaultManager() public {
        vm.expectRevert(DistributionFundingCoordinator.InvalidSystemAddress.selector);
        new DistributionFundingCoordinator(address(manager), address(manager), PUBLISHER);
    }

    function testConstructorManagerNotAContract() public {
        vm.expectRevert(
            abi.encodeWithSelector(DistributionFundingCoordinator.NotAContract.selector, ATTACKER)
        );
        new DistributionFundingCoordinator(address(source), ATTACKER, PUBLISHER);
    }

    function testImmutablesStored() public view {
        _true(address(coordinator.stockAcquisitionVault()) == address(source), "vault");
        _true(address(coordinator.distributionClaimManager()) == address(manager), "manager");
        _true(coordinator.rootPublisher() == PUBLISHER, "publisher");
    }

    // --- Funding ---------------------------------------------------------------------------------

    function testHappyFunding() public {
        _release(1600e18);
        _fund(42, 1600e18);
        _eq(stockA.balanceOf(address(manager)), 1600e18, "manager funded exactly");
        _eq(stockA.balanceOf(address(coordinator)), 0, "coordinator retains nothing");
        _true(coordinator.cycleFunded(42), "cycle recorded");
        _eq(coordinator.cycleFundedAmount(42), 1600e18, "cycle amount");
        _true(coordinator.cycleStockToken(42) == address(stockA), "cycle token");
        _eq(coordinator.totalFunded(address(stockA)), 1600e18, "cumulative funded");
        _eq(manager.remaining(42, address(stockA)), 1600e18, "manager remaining");
    }

    function testNotRootPublisher() public {
        _release(1600e18);
        vm.prank(ATTACKER);
        vm.expectRevert(DistributionFundingCoordinator.NotRootPublisher.selector);
        coordinator.fundAndPublishCycle(
            42,
            keccak256("r"),
            keccak256("a"),
            keccak256("m"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            address(stockA),
            1600e18
        );
    }

    function testUnapprovedStock() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        vm.prank(PUBLISHER);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionFundingCoordinator.StockNotApproved.selector, address(other)
            )
        );
        coordinator.fundAndPublishCycle(
            42,
            keccak256("r"),
            keccak256("a"),
            keccak256("m"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            address(other),
            1e18
        );
    }

    function testZeroAmount() public {
        _release(1600e18);
        vm.prank(PUBLISHER);
        vm.expectRevert(DistributionFundingCoordinator.ZeroAmount.selector);
        coordinator.fundAndPublishCycle(
            42,
            keccak256("r"),
            keccak256("a"),
            keccak256("m"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            address(stockA),
            0
        );
    }

    function testDuplicateCycleReverts() public {
        _release(3200e18);
        _fund(42, 1600e18);
        vm.prank(PUBLISHER);
        vm.expectRevert(
            abi.encodeWithSelector(DistributionFundingCoordinator.CycleAlreadyFunded.selector, 42)
        );
        coordinator.fundAndPublishCycle(
            42,
            keccak256("r2"),
            keccak256("a2"),
            keccak256("m2"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            address(stockA),
            1600e18
        );
    }

    function testExceedsReleasedDistribution() public {
        _release(1000e18); // vault released only 1000
        vm.prank(PUBLISHER);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionFundingCoordinator.ExceedsReleasedDistribution.selector,
                1001e18,
                1000e18
            )
        );
        coordinator.fundAndPublishCycle(
            42,
            keccak256("r"),
            keccak256("a"),
            keccak256("m"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            address(stockA),
            1001e18
        );
    }

    // A donation to the coordinator (balance present) cannot be funded beyond the released amount.
    function testDonationCannotBeFunded() public {
        source.setReleased(address(stockA), 0); // vault released nothing
        stockA.mint(address(coordinator), 5000e18); // unsolicited donation
        vm.prank(PUBLISHER);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionFundingCoordinator.ExceedsReleasedDistribution.selector, 1e18, 0
            )
        );
        coordinator.fundAndPublishCycle(
            42,
            keccak256("r"),
            keccak256("a"),
            keccak256("m"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            address(stockA),
            1e18
        );
    }

    function testTwoCyclesBoundedByCumulativeReleased() public {
        _release(1600e18); // total released 1600
        _fund(1, 1000e18); // fund 1000
        // A second cycle can fund at most the remaining 600.
        vm.prank(PUBLISHER);
        vm.expectRevert(
            abi.encodeWithSelector(
                DistributionFundingCoordinator.ExceedsReleasedDistribution.selector,
                1601e18,
                1600e18
            )
        );
        coordinator.fundAndPublishCycle(
            2,
            keccak256("r2"),
            keccak256("a2"),
            keccak256("m2"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            address(stockA),
            601e18
        );
        _fund(2, 600e18); // exactly the remaining 600 succeeds
        _eq(coordinator.totalFunded(address(stockA)), 1600e18, "cumulative == released");
    }

    // If the vault "released" accounting says X but the coordinator does not actually hold X, the
    // manager's own pull fails and the whole funding reverts (no partial state).
    function testInsufficientHeldStockReverts() public {
        source.setReleased(address(stockA), 1600e18); // claims released, but mint less
        stockA.mint(address(coordinator), 1000e18); // coordinator only holds 1000
        vm.prank(PUBLISHER);
        vm.expectRevert(); // manager safeTransferFrom pulls 1600 from coordinator -> insufficient
        coordinator.fundAndPublishCycle(
            42,
            keccak256("r"),
            keccak256("a"),
            keccak256("m"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 1000),
            address(stockA),
            1600e18
        );
        _true(!coordinator.cycleFunded(42), "no cycle committed on revert");
    }
}
