// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {MockRialtoRouter} from "./mocks/MockRialtoRouter.sol";

/// @title ForkDistributionLifecycle — TASK 10F-1 fork-only distribution-lifecycle rehearsal
///
/// @notice FORK-ONLY. Runs ONLY when `ROBINHOOD_FORK_RPC` is set; otherwise every test returns
///         immediately so the offline suite stays green. All mutations occur inside Foundry's
///         in-memory fork of Robinhood Chain pinned at post-canary block 18791290 (block hash
///         0x2d332bb08395b53f571015af9959d1a0e9c68baec300265b08fe77b38ef1516f, verified against
///         both the upstream chain and docs/audit/BPS_CANARY_MAINNET_COMPLETION_2026-07-25
///         .evidence.json). An in-process Forge fork has no signing key and no broadcast path:
///         state writes CANNOT reach the upstream chain.
///
///         Exercises the DEPLOYED BPSC-TEST canary contracts (real router, real Uniswap pool,
///         real StockAcquisitionVault / DistributionFundingCoordinator / DistributionClaimManager
///         / BPSLockingVault, real NVDA Robinhood Token) end-to-end:
///           official trade (buy + sell) -> fee accounting -> acquisition funding -> simulated
///           RWA settlement -> 80/20 reserve split -> locking/effective weight -> snapshot ->
///           Merkle root publication (authorized path) -> participant claims -> duplicate/replay
///           and authorization negatives -> expired-window recovery -> proof-of-distribution
///           reconciliation.
///
///         THE ONLY MOCKED BOUNDARY is the external Rialto settlement venue: the off-chain quote
///         blob cannot be produced on-chain and the venue's settlement selector is an explicitly
///         unverified config blocker, so the registry's feature-2 router lookup is redirected
///         FORK-LOCALLY (vm.mockCall on the REAL registry's ownerOf(2)) to the existing
///         development-only test/mocks/MockRialtoRouter.sol seeded with real NVDA via fork-local
///         storage writes. Everything else (protocol contracts, pool, tokens) is the real
///         deployed code and state.
///
///         Documented fork-local impersonations (vm.prank; NO key, NO signature, NO broadcast):
///           - the canary role holder 0xD9Ee..e203 (acquisitionOperator / rootPublisher / router
///             owner / reserveRecipient / claimRecoveryRecipient) — the roles are immutable on
///             the deployed contracts, so exercising the authorized paths requires acting as
///             that address inside the fork;
///           - the canary tester 0x78B2..6024 as CLAIMANT only — its live lock is a genuine
///             snapshot participant, so excluding it would falsify the snapshot.
///
///         This rehearsal is NOT a production deployment, NOT a real RWA purchase, NOT legal
///         eligibility, and does NOT convert BPSC into canonical BPS.
interface LVm {
    function envOr(string calldata name, string calldata defaultValue)
        external
        view
        returns (string memory);
    function createSelectFork(string calldata urlOrAlias, uint256 blockNumber)
        external
        returns (uint256);
    function activeFork() external view returns (uint256);
    function prank(address sender) external;
    function warp(uint256 newTimestamp) external;
    function deal(address account, uint256 newBalance) external;
    function store(address target, bytes32 slot, bytes32 value) external;
    function load(address target, bytes32 slot) external view returns (bytes32);
    function mockCall(address callee, bytes calldata data, bytes calldata returnData) external;
    function expectRevert() external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
    function writeFile(string calldata path, string calldata data) external;
    function toString(bytes32 value) external pure returns (string memory);
}

interface IERC20F {
    function balanceOf(address) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function allowance(address, address) external view returns (uint256);
}

interface IRouterF {
    function buyExactWethForBps(uint256, uint256, uint256, address, uint256)
        external
        returns (uint256, uint256);
    function sellExactBpsForWeth(uint256, uint256, uint256, uint256, address, uint256)
        external
        returns (uint256, uint256, uint256);
    function pause() external;
    function unpause() external;
}

interface IVaultF {
    function availableWethCustody() external view returns (uint256);
    function totalStockAcquired(address) external view returns (uint256);
    function distributionAllocated(address) external view returns (uint256);
    function reserveAllocated(address) external view returns (uint256);
    function distributionReleased(address) external view returns (uint256);
    function executeAcquisition(address, uint256, uint256, uint256, bytes calldata)
        external
        returns (uint256);
}

interface ICoordF {
    function executeAndRecordAcquisition(address, uint256, uint256, uint256, bytes calldata)
        external
        returns (uint256);
    function fundRecordedAcquisition(uint256, bytes32, bytes32, bytes32, uint64, uint64, uint256)
        external;
    function acquisitionCount() external view returns (uint256);
}

interface IMgrF {
    function leafFor(uint256, address, address, uint256) external view returns (bytes32);
    function claim(uint256, address, uint256, bytes32[] calldata) external;
    function remaining(uint256, address) external view returns (uint256);
    function claimed(uint256, address, address) external view returns (bool);
    function totalOutstanding(address) external view returns (uint256);
    function recoverExpired(uint256, address) external;
    function publishCycle(
        uint256,
        bytes32,
        bytes32,
        bytes32,
        uint64,
        uint64,
        address[] calldata,
        uint256[] calldata
    ) external;
}

interface ILockF {
    function createLock(uint256, uint32) external returns (uint256);
    function positionWeightAt(address, uint256, uint256) external view returns (uint256);
    function lockedPrincipal(address) external view returns (uint256);
}

contract ForkDistributionLifecycle {
    LVm internal constant vm = LVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    // ---- pinned fork (post-canary state anchored by the accepted evidence manifest) ----
    uint256 internal constant FORK_BLOCK = 18791290;
    uint256 internal constant ROBINHOOD_CHAIN_ID = 4663;

    // ---- deployed BPSC-TEST canary contracts (VERIFIED on chain; evidence manifest) ----
    address internal constant BPSC = 0x2E6C3dC1e04C45d4B9d40BeE392a135beA50A5d7;
    address internal constant LOCKING = 0xeFA9d1C40358E281da21A1BC20a204c849cB8A42;
    address internal constant MANAGER = 0x5EcbADf1cF050F1B86D44B979416A8e859Fb2574;
    address internal constant COORD = 0xE3Bd9e1D58d16A31912f804f931Cc6bfcD702205;
    address internal constant VAULT = 0x9a5a55361BcFDD6Ded4A6EAa02D997F1108EdeC6;
    address internal constant ROUTER = 0x4847b410D1243eD38B481B89B1D1D59a8C8691e6;
    // ---- real external dependencies ----
    address internal constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address internal constant REGISTRY = 0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E;
    address internal constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    // ---- canary role holder + tester (fork-local prank targets; no keys, no signatures) ----
    address internal constant ROLES = 0xD9Eec97DEDafe1451b7f201E416A502b93c1e203;
    address internal constant TESTER = 0x78B256A742fa2c0f84ebdAf570fCDC16Ee206024;

    // ---- accepted post-canary anchors (evidence manifest, block 18791290 state) ----
    uint256 internal constant ANCHOR_VAULT_WETH = 31435920663381;
    uint256 internal constant ANCHOR_TESTER_LOCKED = 475546397072022702614092;
    uint256 internal constant ANCHOR_SUPPLY = 999980924444083854102296256;

    // ---- deterministic fork-local participants (fresh addresses, never real wallets) ----
    address internal constant ALICE = address(uint160(uint256(keccak256("bps.10f1.alice"))));
    address internal constant BOB = address(uint160(uint256(keccak256("bps.10f1.bob"))));
    address internal constant CAROL = address(uint160(uint256(keccak256("bps.10f1.carol"))));

    uint256 internal constant CYCLE_ID = 1;
    uint256 internal constant VENUE_RATE = 1000; // mock venue: stockOut = wethIn * 1000
    uint256 internal constant G_ALICE = 5_000_000_000_000_000; // divisible by 10_000
    uint256 internal constant G_BOB = 4_000_000_000_000_000;
    uint256 internal constant G_CAROL = 2_000_000_000_000_000;

    // OZ ERC-7201 namespaced ERC20 storage base slot ("openzeppelin.storage.ERC20").
    bytes32 internal constant OZ_ERC20_BASE =
        0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00;

    // ---- cross-stage rehearsal state (storage, to keep per-function frames small) ----
    uint256 internal forkId;
    bool internal forked;
    MockRialtoRouter internal venue;
    uint256 internal aliceBps;
    uint256 internal bobBps;
    uint256 internal carolBps;
    uint256 internal buyBurned;
    uint256 internal sellIn;
    uint256 internal grossOut;
    uint256 internal userOut;
    uint256 internal sellBurned;
    uint256 internal snapshotTs;
    uint256 internal wA;
    uint256 internal wB;
    uint256 internal wC;
    uint256 internal wT;
    uint256 internal totalW;
    uint256 internal wethIn;
    uint256 internal expectStock;
    uint256 internal distAmt;
    uint256 internal resAmt;
    uint256 internal eA;
    uint256 internal eB;
    uint256 internal eC;
    uint256 internal eT;
    uint256 internal dust;
    bytes32 internal root;
    uint64 internal claimStart;
    uint64 internal claimDeadline;
    uint256 internal acqId;

    // custom-error selectors of the frozen contracts (declared locally for expectRevert)
    error NotAcquisitionOperator();
    error NotRootPublisher();
    error NotAuthorizedExecutor();
    error MinimumStockOutNotMet(uint256 minimumStockOut, uint256 observed);
    error ExpiredQuote();
    error ExpiredDeadline();
    error EnforcedPause();
    error CycleNotFound(uint256 cycleId);
    error ClaimNotStarted();
    error AlreadyClaimed(uint256 cycleId, address claimant, address asset);
    error InvalidProof();
    error AssetNotRegistered(uint256 cycleId, address asset);
    error OwnableUnauthorizedAccount(address account);
    error StockNotApproved(address stockToken);

    struct RialtoExecution {
        address target;
        bytes callData;
        uint256 quoteDeadline;
    }

    // ------------------------------------------------------------------ helpers

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function _true(bool c, string memory m) internal pure {
        require(c, m);
    }

    /// @dev CONSPICUOUS FORK-LOCAL SAFETY ASSERTION — called before every mutating stage.
    ///      Proves the active EVM is the pinned in-process fork (chainid 4663 is required by the
    ///      deployed contracts' chain gates and the claim-leaf domain binding; isolation comes
    ///      from the in-process fork itself, which has no signing or broadcast capability).
    function _assertForkLocal() internal view {
        require(forked, "SAFETY: fork not initialized");
        require(vm.activeFork() == forkId, "SAFETY: not on the rehearsal fork");
        require(block.chainid == ROBINHOOD_CHAIN_ID, "SAFETY: unexpected chainid");
    }

    /// @dev Seed `amount` of `token` to `who` purely inside the fork by locating the ERC-20
    ///      balance mapping slot (plain slots 0..200 — covers OZ-upgradeable __gap layouts such
    ///      as _balances at slot 51 — then the OZ ERC-7201 namespaced base).
    function _seedTokenBalance(address token, address who, uint256 amount) internal {
        _assertForkLocal();
        for (uint256 i = 0; i <= 201; i++) {
            bytes32 slot = i == 201
                ? keccak256(abi.encode(who, OZ_ERC20_BASE))
                : keccak256(abi.encode(who, i));
            bytes32 prev = vm.load(token, slot);
            vm.store(token, slot, bytes32(amount));
            if (IERC20F(token).balanceOf(who) == amount) return;
            vm.store(token, slot, prev);
        }
        revert("seed: balance slot not found");
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(bytes.concat(a, b)) : keccak256(bytes.concat(b, a));
    }

    function _arr2(bytes32 a, bytes32 b) internal pure returns (bytes32[] memory arr) {
        arr = new bytes32[](2);
        arr[0] = a;
        arr[1] = b;
    }

    function _leaves() internal view returns (bytes32[4] memory l) {
        l[0] = IMgrF(MANAGER).leafFor(CYCLE_ID, ALICE, NVDA, eA);
        l[1] = IMgrF(MANAGER).leafFor(CYCLE_ID, BOB, NVDA, eB);
        l[2] = IMgrF(MANAGER).leafFor(CYCLE_ID, CAROL, NVDA, eC);
        l[3] = IMgrF(MANAGER).leafFor(CYCLE_ID, TESTER, NVDA, eT);
    }

    /// @dev Balanced 4-leaf tree (repo-canonical sorted-pair commutative hashing); index-aligned
    ///      proof for leaf `index`. Matches ClaimManagerBase._tree4 / OZ StandardMerkleTree rule.
    function _proofFor(uint256 index) internal view returns (bytes32[] memory) {
        bytes32[4] memory l = _leaves();
        bytes32 n01 = _hashPair(l[0], l[1]);
        bytes32 n23 = _hashPair(l[2], l[3]);
        if (index == 0) return _arr2(l[1], n23);
        if (index == 1) return _arr2(l[0], n23);
        if (index == 2) return _arr2(l[3], n01);
        return _arr2(l[2], n01);
    }

    function _computeRoot() internal view returns (bytes32) {
        bytes32[4] memory l = _leaves();
        return _hashPair(_hashPair(l[0], l[1]), _hashPair(l[2], l[3]));
    }

    function _rialtoExec(
        address target,
        address stockToken,
        uint256 amountIn,
        uint256 quoteDeadline
    ) internal pure returns (bytes memory) {
        return abi.encode(
            RialtoExecution({
                target: target,
                callData: abi.encodeWithSelector(
                    MockRialtoRouter.settle.selector, stockToken, amountIn
                ),
                quoteDeadline: quoteDeadline
            })
        );
    }

    function _buy(address who, uint256 gross) internal returns (uint256 out, uint256 burned) {
        _assertForkLocal();
        vm.prank(who);
        IERC20F(WETH).approve(ROUTER, gross);
        vm.prank(who);
        (out, burned) = IRouterF(ROUTER).buyExactWethForBps(gross, 1, 1, who, block.timestamp + 600);
    }

    // ------------------------------------------------------------------ the rehearsal

    /// @dev Single deterministic end-to-end scenario with staged negative tests, split into
    ///      stage functions (state in storage) so each frame stays small. One test function so
    ///      the pinned fork state is built exactly once and every stage sees the exact state
    ///      produced by the previous stage (mirrors the canary replay style).
    function testForkDistributionLifecycle() public {
        string memory rpc = vm.envOr("ROBINHOOD_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return; // offline suite stays green
        forkId = vm.createSelectFork(rpc, FORK_BLOCK);
        forked = true;

        _stage0Anchors();
        _stage1FundParticipantsAndTradeNegatives();
        _stage2BuyWithExactFees();
        _stage3RemainingBuys();
        _stage4SellWithExactFees();
        _stage5FeeConservation();
        _stage6Locks();
        _stage7Snapshot();
        _stage8AcquisitionNegatives();
        _stage9AcquisitionAndSplit();
        _stage10EntitlementsAndPublicationNegatives();
        _stage11PublishAuthorizedPath();
        _stage12ClaimsAndClaimNegatives();
        _stage13Reconciliation();
        _stage14ExpiredRecovery();
        _stage15WriteEvidence();
    }

    function _stage0Anchors() internal view {
        _eq(block.chainid, ROBINHOOD_CHAIN_ID, "chainid == 4663");
        _eq(block.number, FORK_BLOCK, "pinned block");
        _eq(IERC20F(WETH).balanceOf(VAULT), ANCHOR_VAULT_WETH, "anchor: vault accrued WETH");
        _eq(
            ILockF(LOCKING).lockedPrincipal(TESTER),
            ANCHOR_TESTER_LOCKED,
            "anchor: tester locked principal"
        );
        _eq(IERC20F(BPSC).totalSupply(), ANCHOR_SUPPLY, "anchor: BPSC totalSupply");
        _true(REGISTRY.code.length > 0 && WETH.code.length > 0, "anchor: externals have code");
    }

    function _stage1FundParticipantsAndTradeNegatives() internal {
        _assertForkLocal();
        vm.deal(ALICE, 1 ether);
        vm.deal(BOB, 1 ether);
        vm.deal(CAROL, 1 ether);
        _seedTokenBalance(WETH, ALICE, 10_000_000_000_000_000);
        _seedTokenBalance(WETH, BOB, 10_000_000_000_000_000);
        _seedTokenBalance(WETH, CAROL, 10_000_000_000_000_000);

        // negative: trade with expired deadline
        vm.prank(ALICE);
        IERC20F(WETH).approve(ROUTER, G_ALICE);
        vm.prank(ALICE);
        vm.expectRevert(ExpiredDeadline.selector);
        IRouterF(ROUTER).buyExactWethForBps(G_ALICE, 1, 1, ALICE, block.timestamp - 1);

        // negative: paused official route (implemented owner pause, exercised fork-locally)
        vm.prank(ROLES);
        IRouterF(ROUTER).pause();
        vm.prank(ALICE);
        vm.expectRevert(EnforcedPause.selector);
        IRouterF(ROUTER).buyExactWethForBps(G_ALICE, 1, 1, ALICE, block.timestamp + 600);
        vm.prank(ROLES);
        IRouterF(ROUTER).unpause();
    }

    function _stage2BuyWithExactFees() internal {
        uint256 vaultBefore = IERC20F(WETH).balanceOf(VAULT);
        uint256 supplyBefore = IERC20F(BPSC).totalSupply();
        uint256 aliceWethBefore = IERC20F(WETH).balanceOf(ALICE);
        (uint256 out, uint256 burned) = _buy(ALICE, G_ALICE);
        aliceBps = out;
        buyBurned = burned;
        _eq(
            IERC20F(WETH).balanceOf(ALICE),
            aliceWethBefore - G_ALICE,
            "buy: gross WETH pulled exactly"
        );
        _eq(
            IERC20F(WETH).balanceOf(VAULT) - vaultBefore,
            (G_ALICE * 200) / 10_000,
            "buy: 2% stock budget to vault"
        );
        _eq(supplyBefore - IERC20F(BPSC).totalSupply(), burned, "buy: true supply burn");
        _eq(IERC20F(BPSC).balanceOf(ALICE), out, "buy: user BPS output delivered");
        _true(burned > 0 && out > 0, "buy: nonzero legs");
    }

    function _stage3RemainingBuys() internal {
        (uint256 outB,) = _buy(BOB, G_BOB);
        (uint256 outC,) = _buy(CAROL, G_CAROL);
        bobBps = outB;
        carolBps = outC;
    }

    function _stage4SellWithExactFees() internal {
        _assertForkLocal();
        sellIn = aliceBps / 3;
        vm.prank(ALICE);
        IERC20F(BPSC).approve(ROUTER, sellIn);
        uint256 aliceWethPre = IERC20F(WETH).balanceOf(ALICE);
        uint256 vaultPre = IERC20F(WETH).balanceOf(VAULT);
        uint256 supplyPre = IERC20F(BPSC).totalSupply();
        vm.prank(ALICE);
        (uint256 g, uint256 u, uint256 burned) =
            IRouterF(ROUTER).sellExactBpsForWeth(sellIn, 1, 1, 1, ALICE, block.timestamp + 600);
        grossOut = g;
        userOut = u;
        sellBurned = burned;
        uint256 sellStock = (g * 200) / 10_000;
        _eq(u, g - sellStock - ((g * 200) / 10_000), "sell: 96% user leg identity");
        _eq(IERC20F(WETH).balanceOf(ALICE) - aliceWethPre, u, "sell: user WETH delivered");
        _eq(IERC20F(WETH).balanceOf(VAULT) - vaultPre, sellStock, "sell: 2% stock budget to vault");
        _eq(supplyPre - IERC20F(BPSC).totalSupply(), burned, "sell: true supply burn");
    }

    function _stage5FeeConservation() internal view {
        _eq(
            IERC20F(WETH).balanceOf(VAULT) - ANCHOR_VAULT_WETH,
            ((G_ALICE + G_BOB + G_CAROL) * 200) / 10_000 + ((grossOut * 200) / 10_000),
            "fees: vault accrual == sum of 2% stock budgets"
        );
    }

    function _stage6Locks() internal {
        _assertForkLocal();
        uint256 amt = IERC20F(BPSC).balanceOf(ALICE);
        vm.prank(ALICE);
        IERC20F(BPSC).approve(LOCKING, amt);
        vm.prank(ALICE);
        ILockF(LOCKING).createLock(amt, 7 days);
        aliceBps = amt; // post-sell locked principal
        vm.prank(BOB);
        IERC20F(BPSC).approve(LOCKING, bobBps);
        vm.prank(BOB);
        ILockF(LOCKING).createLock(bobBps, 14 days);
        vm.prank(CAROL);
        IERC20F(BPSC).approve(LOCKING, carolBps);
        vm.prank(CAROL);
        ILockF(LOCKING).createLock(carolBps, 21 days);
    }

    function _stage7Snapshot() internal {
        snapshotTs = block.timestamp;
        wA = ILockF(LOCKING).positionWeightAt(ALICE, 0, snapshotTs);
        wB = ILockF(LOCKING).positionWeightAt(BOB, 0, snapshotTs);
        wC = ILockF(LOCKING).positionWeightAt(CAROL, 0, snapshotTs);
        wT = ILockF(LOCKING).positionWeightAt(TESTER, 0, snapshotTs);
        _eq(wA, (aliceBps * 11_000) / 10_000, "weight: alice 1.10x");
        _eq(wB, (bobBps * 12_500) / 10_000, "weight: bob 1.25x");
        _eq(wC, (carolBps * 15_000) / 10_000, "weight: carol 1.50x");
        _eq(wT, (ANCHOR_TESTER_LOCKED * 11_000) / 10_000, "weight: live tester lock 1.10x");
        totalW = wA + wB + wC + wT;
    }

    function _stage8AcquisitionNegatives() internal {
        _assertForkLocal();
        venue = new MockRialtoRouter(WETH, VENUE_RATE);
        wethIn = IVaultF(VAULT).availableWethCustody();
        expectStock = wethIn * VENUE_RATE;
        _seedTokenBalance(NVDA, address(venue), expectStock);
        // Mock boundary: redirect the REAL registry's feature-2 router lookup (fork-local only)
        // to the development-only venue mock.
        vm.mockCall(
            REGISTRY,
            abi.encodeWithSignature("ownerOf(uint256)", uint256(2)),
            abi.encode(address(venue))
        );

        bytes memory execOk = _rialtoExec(address(venue), NVDA, wethIn, type(uint256).max);

        // negative: unauthorized settlement (not the operator; not the coordinator)
        vm.prank(ALICE);
        vm.expectRevert(NotAcquisitionOperator.selector);
        ICoordF(COORD).executeAndRecordAcquisition(NVDA, wethIn, 1, block.timestamp + 600, execOk);
        vm.prank(ALICE);
        vm.expectRevert(NotAuthorizedExecutor.selector);
        IVaultF(VAULT).executeAcquisition(NVDA, wethIn, 1, block.timestamp + 600, execOk);

        // negative: expired quote deadline
        vm.prank(ROLES);
        vm.expectRevert(ExpiredQuote.selector);
        ICoordF(COORD)
            .executeAndRecordAcquisition(
                NVDA,
                wethIn,
                1,
                block.timestamp + 600,
                _rialtoExec(address(venue), NVDA, wethIn, block.timestamp - 1)
            );

        // negative: unsupported asset (WETH is not an approved stock token)
        vm.prank(ROLES);
        vm.expectRevert(abi.encodeWithSelector(StockNotApproved.selector, WETH));
        ICoordF(COORD)
            .executeAndRecordAcquisition(
                WETH,
                wethIn,
                1,
                block.timestamp + 600,
                _rialtoExec(address(venue), WETH, wethIn, type(uint256).max)
            );

        // negative: adapter under-delivery -> atomic revert, NO silent accounting loss
        vm.prank(ROLES);
        vm.expectRevert(
            abi.encodeWithSelector(MinimumStockOutNotMet.selector, expectStock + 1, expectStock)
        );
        ICoordF(COORD)
            .executeAndRecordAcquisition(
                NVDA, wethIn, expectStock + 1, block.timestamp + 600, execOk
            );
        _eq(IVaultF(VAULT).availableWethCustody(), wethIn, "failed acquisition: custody intact");
        _eq(ICoordF(COORD).acquisitionCount(), 0, "failed acquisition: nothing recorded");
    }

    function _stage9AcquisitionAndSplit() internal {
        _assertForkLocal();
        uint256 reserveNvdaBefore = IERC20F(NVDA).balanceOf(ROLES); // canary reserveRecipient
        vm.prank(ROLES);
        acqId = ICoordF(COORD)
            .executeAndRecordAcquisition(
                NVDA,
                wethIn,
                expectStock,
                block.timestamp + 600,
                _rialtoExec(address(venue), NVDA, wethIn, type(uint256).max)
            );
        _eq(acqId, 1, "acquisition id 1");
        _eq(IVaultF(VAULT).availableWethCustody(), 0, "acquisition: all custody WETH spent");
        _eq(IERC20F(WETH).balanceOf(address(venue)), wethIn, "settlement: venue received WETH");
        _eq(IVaultF(VAULT).totalStockAcquired(NVDA), expectStock, "acquisition: stock credited");
        distAmt = (expectStock * 80) / 100;
        resAmt = expectStock - distAmt;
        _eq(IVaultF(VAULT).distributionAllocated(NVDA), distAmt, "split: 80% distribution");
        _eq(IVaultF(VAULT).reserveAllocated(NVDA), resAmt, "split: 20% reserve");
        _eq(
            IERC20F(NVDA).balanceOf(ROLES) - reserveNvdaBefore,
            resAmt,
            "split: reserve delivered to reserveRecipient"
        );
        _eq(IERC20F(NVDA).balanceOf(VAULT), distAmt, "split: distribution retained in vault");
    }

    function _stage10EntitlementsAndPublicationNegatives() internal {
        // implemented rule: floor(dist * w / totalW); remainder retained as dust
        eA = (distAmt * wA) / totalW;
        eB = (distAmt * wB) / totalW;
        eC = (distAmt * wC) / totalW;
        eT = (distAmt * wT) / totalW;
        dust = distAmt - (eA + eB + eC + eT);
        _true(eA + eB + eC + eT <= distAmt, "snapshot total <= distributable");
        _true(eA > 0 && eB > 0 && eC > 0 && eT > 0, "all entitlements nonzero");
        root = _computeRoot();
        claimStart = uint64(block.timestamp + 60);
        claimDeadline = uint64(block.timestamp + 3600);

        // negative: claim before the cycle exists (proof precomputed: expectRevert/prank apply
        // to the NEXT external call, and _proofFor performs leafFor staticcalls)
        bytes32[] memory pA0 = _proofFor(0);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(CycleNotFound.selector, CYCLE_ID));
        IMgrF(MANAGER).claim(CYCLE_ID, NVDA, eA, pA0);

        // negative: unauthorized root publication (both layers)
        vm.prank(ALICE);
        vm.expectRevert(NotRootPublisher.selector);
        ICoordF(COORD)
            .fundRecordedAcquisition(
                acqId,
                root,
                keccak256("alloc"),
                keccak256("manifest"),
                claimStart,
                claimDeadline,
                CYCLE_ID
            );
        address[] memory oneAsset = new address[](1);
        oneAsset[0] = NVDA;
        uint256[] memory oneAmt = new uint256[](1);
        oneAmt[0] = distAmt;
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(OwnableUnauthorizedAccount.selector, ALICE));
        IMgrF(MANAGER)
            .publishCycle(
                CYCLE_ID,
                root,
                keccak256("alloc"),
                keccak256("manifest"),
                claimStart,
                claimDeadline,
                oneAsset,
                oneAmt
            );
    }

    function _stage11PublishAuthorizedPath() internal {
        _assertForkLocal();
        vm.prank(ROLES);
        ICoordF(COORD)
            .fundRecordedAcquisition(
                acqId,
                root,
                keccak256("alloc"),
                keccak256("manifest"),
                claimStart,
                claimDeadline,
                CYCLE_ID
            );
        _eq(IERC20F(NVDA).balanceOf(MANAGER), distAmt, "publication: manager funded exactly");
        _eq(IVaultF(VAULT).distributionReleased(NVDA), distAmt, "publication: vault release booked");
        _eq(IMgrF(MANAGER).remaining(CYCLE_ID, NVDA), distAmt, "publication: full amount claimable");

        // negative: claim before claimStart (proof precomputed — see stage 10 note)
        bytes32[] memory pA = _proofFor(0);
        vm.prank(ALICE);
        vm.expectRevert(ClaimNotStarted.selector);
        IMgrF(MANAGER).claim(CYCLE_ID, NVDA, eA, pA);
    }

    function _stage12ClaimsAndClaimNegatives() internal {
        _assertForkLocal();
        vm.warp(claimStart);
        // proofs precomputed: expectRevert/prank bind to the NEXT external call, and _proofFor
        // performs leafFor staticcalls that would otherwise consume them
        bytes32[] memory p0 = _proofFor(0);
        bytes32[] memory p1 = _proofFor(1);
        bytes32[] memory p2 = _proofFor(2);
        bytes32[] memory p3 = _proofFor(3);
        uint256 before = IERC20F(NVDA).balanceOf(ALICE);
        vm.prank(ALICE);
        IMgrF(MANAGER).claim(CYCLE_ID, NVDA, eA, p0);
        _eq(IERC20F(NVDA).balanceOf(ALICE) - before, eA, "claim: alice exact amount");

        // negative: duplicate claim / replay
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(AlreadyClaimed.selector, CYCLE_ID, ALICE, NVDA));
        IMgrF(MANAGER).claim(CYCLE_ID, NVDA, eA, p0);
        // negative: wrong claimant with a valid other-party proof
        vm.prank(BOB);
        vm.expectRevert(InvalidProof.selector);
        IMgrF(MANAGER).claim(CYCLE_ID, NVDA, eA, p0);
        // negative: wrong amount under own proof
        vm.prank(BOB);
        vm.expectRevert(InvalidProof.selector);
        IMgrF(MANAGER).claim(CYCLE_ID, NVDA, eB + 1, p1);
        // negative: wrong cycle/epoch
        vm.prank(BOB);
        vm.expectRevert(abi.encodeWithSelector(CycleNotFound.selector, CYCLE_ID + 1));
        IMgrF(MANAGER).claim(CYCLE_ID + 1, NVDA, eB, p1);
        // negative: unregistered asset in a published cycle
        vm.prank(BOB);
        vm.expectRevert(abi.encodeWithSelector(AssetNotRegistered.selector, CYCLE_ID, WETH));
        IMgrF(MANAGER).claim(CYCLE_ID, WETH, eB, p1);

        // remaining valid claims (bob, carol, and the live-lock tester as claimant)
        vm.prank(BOB);
        IMgrF(MANAGER).claim(CYCLE_ID, NVDA, eB, p1);
        vm.prank(CAROL);
        IMgrF(MANAGER).claim(CYCLE_ID, NVDA, eC, p2);
        uint256 testerBefore = IERC20F(NVDA).balanceOf(TESTER);
        vm.prank(TESTER);
        IMgrF(MANAGER).claim(CYCLE_ID, NVDA, eT, p3);
        _eq(IERC20F(NVDA).balanceOf(TESTER) - testerBefore, eT, "claim: tester exact amount");
    }

    function _stage13Reconciliation() internal view {
        _eq(IMgrF(MANAGER).remaining(CYCLE_ID, NVDA), dust, "reconcile: remaining == dust exactly");
        _eq(IMgrF(MANAGER).totalOutstanding(NVDA), dust, "reconcile: outstanding == dust");
        _eq(IERC20F(NVDA).balanceOf(MANAGER), dust, "reconcile: manager holds only dust");
        _true(
            IMgrF(MANAGER).claimed(CYCLE_ID, ALICE, NVDA)
                && IMgrF(MANAGER).claimed(CYCLE_ID, BOB, NVDA)
                && IMgrF(MANAGER).claimed(CYCLE_ID, CAROL, NVDA)
                && IMgrF(MANAGER).claimed(CYCLE_ID, TESTER, NVDA),
            "reconcile: all claim flags set"
        );
        // global conservation: acquired == reserve(delivered) + claims + dust
        _eq(
            expectStock,
            resAmt + eA + eB + eC + eT + dust,
            "reconcile: acquired == reserve + claims + dust"
        );
    }

    function _stage14ExpiredRecovery() internal {
        _assertForkLocal();
        vm.warp(uint256(claimDeadline) + 1);
        uint256 recBefore = IERC20F(NVDA).balanceOf(ROLES); // canary claimRecoveryRecipient
        IMgrF(MANAGER).recoverExpired(CYCLE_ID, NVDA);
        _eq(IERC20F(NVDA).balanceOf(ROLES) - recBefore, dust, "recovery: dust to recoveryRecipient");
        _eq(IMgrF(MANAGER).remaining(CYCLE_ID, NVDA), 0, "recovery: nothing left");
        _eq(IERC20F(NVDA).balanceOf(MANAGER), 0, "recovery: manager empty, zero residue");
    }

    // ------------------------------------------------------------------ evidence emission

    function uintStr(uint256 v) internal pure returns (string memory s) {
        if (v == 0) return "0";
        uint256 t = v;
        uint256 len;
        while (t > 0) {
            len++;
            t /= 10;
        }
        bytes memory b = new bytes(len);
        while (v > 0) {
            b[--len] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        s = string(b);
    }

    function _kv(string memory k, uint256 v) internal pure returns (string memory) {
        return string.concat("\"", k, "\":\"", uintStr(v), "\",");
    }

    string internal evidenceJson;

    function _append(string memory k, uint256 v) internal {
        evidenceJson = string.concat(evidenceJson, _kv(k, v));
    }

    function _stage15WriteEvidence() internal {
        evidenceJson = "{";
        _append("forkBlock", FORK_BLOCK);
        _append("chainId", ROBINHOOD_CHAIN_ID);
        _append("snapshotTimestamp", snapshotTs);
        _append("buyGrossWethInAlice", G_ALICE);
        _append("buyGrossWethInBob", G_BOB);
        _append("buyGrossWethInCarol", G_CAROL);
        _append("buyStockBudgetAlice", (G_ALICE * 200) / 10_000);
        _append("buyBurnBudgetAlice", (G_ALICE * 100) / 10_000);
        _append("buyUserBpsOutAliceLocked", aliceBps);
        _append("buyBpsBurnedAlice", buyBurned);
        _append("sellBpsIn", sellIn);
        _append("sellGrossWethOut", grossOut);
        _append("sellUserWethOut", userOut);
        _append("sellBpsBurned", sellBurned);
        _append("weightAlice", wA);
        _append("weightBob", wB);
        _append("weightCarol", wC);
        _append("weightTesterLiveLock", wT);
        _append("totalEffectiveWeight", totalW);
        _append("acquisitionWethIn", wethIn);
        _append("acquiredStockNvda", expectStock);
        _append("distribution80", distAmt);
        _append("reserve20", resAmt);
        _append("entitlementAlice", eA);
        _append("entitlementBob", eB);
        _append("entitlementCarol", eC);
        _append("entitlementTester", eT);
        _append("distributionDust", dust);
        _append("claimStart", claimStart);
        _append("claimDeadline", claimDeadline);
        evidenceJson = string.concat(evidenceJson, "\"merkleRoot\":\"", vm.toString(root), "\"}");
        vm.writeFile("./rehearsal-evidence/fork-rehearsal-raw.json", evidenceJson);
    }
}
