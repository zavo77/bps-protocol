// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ForkLifecycleProbe — TASK 10F-1 pre-implementation discovery (FORK-ONLY, read/local-write probe)
/// @notice Development-only probe. Discovers (a) the NVDA Robinhood Token balance storage slot and
///         (b) whether NVDA transfers execute between arbitrary fork-local addresses. Runs ONLY when
///         ROBINHOOD_FORK_RPC is set; all writes occur inside Foundry's in-memory fork and cannot
///         reach the upstream chain. Never signs or broadcasts anything.
interface PVm {
    function envOr(string calldata name, string calldata defaultValue)
        external
        view
        returns (string memory);
    function createSelectFork(string calldata urlOrAlias, uint256 blockNumber)
        external
        returns (uint256);
    function activeFork() external view returns (uint256);
    function store(address target, bytes32 slot, bytes32 value) external;
    function load(address target, bytes32 slot) external view returns (bytes32);
    function prank(address sender) external;
}

interface IERC20Probe {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}

contract ForkLifecycleProbe {
    PVm internal constant vm = PVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    address internal constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    uint256 internal constant FORK_BLOCK = 18791290;

    event ProbeResult(string what, uint256 value);
    event ProbeAddr(string what, address value);

    function testProbeNvdaSlotAndTransfer() public {
        string memory rpc = vm.envOr("ROBINHOOD_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return; // offline suite stays green
        vm.createSelectFork(rpc, FORK_BLOCK);
        require(block.chainid == 4663, "fork chainid");
        require(block.number == FORK_BLOCK, "fork block");

        address holder = address(uint160(uint256(keccak256("bps.rehearsal.holder"))));
        uint256 want = 12345e18;

        // Candidate slots: plain mapping at slots 0..40, plus the OZ ERC-7201 namespaced ERC20
        // location (openzeppelin.storage.ERC20) base slot.
        uint256 found = type(uint256).max;
        bytes32 ozBase = 0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00;
        for (uint256 i = 0; i <= 41; i++) {
            bytes32 slot =
                i == 41 ? keccak256(abi.encode(holder, ozBase)) : keccak256(abi.encode(holder, i));
            bytes32 prev = vm.load(NVDA, slot);
            vm.store(NVDA, slot, bytes32(want));
            if (IERC20Probe(NVDA).balanceOf(holder) == want) {
                found = i;
                emit ProbeResult("nvda-balance-slot-index", i);
                break;
            }
            vm.store(NVDA, slot, prev);
        }
        require(found != type(uint256).max, "PROBE: no balance slot found in 0..40 or ERC-7201");

        // Transferability between arbitrary (non-allowlisted) fork-local addresses.
        address peer = address(uint160(uint256(keccak256("bps.rehearsal.peer"))));
        vm.prank(holder);
        bool ok = IERC20Probe(NVDA).transfer(peer, 1e18);
        require(ok, "PROBE: transfer returned false");
        require(IERC20Probe(NVDA).balanceOf(peer) == 1e18, "PROBE: peer balance");
        emit ProbeResult("nvda-transfer-ok", 1);
        emit ProbeResult("nvda-decimals", IERC20Probe(NVDA).decimals());
    }
}
