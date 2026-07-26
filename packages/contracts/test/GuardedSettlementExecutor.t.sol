// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {GuardedSettlementExecutor} from "../src/GuardedSettlementExecutor.sol";
import {IGuardedSettlementExecutor} from "../src/interfaces/IGuardedSettlementExecutor.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";
import {AllowanceTrapERC20} from "./mocks/AllowanceTrapERC20.sol";
import {MockRialtoRouterRegistry} from "./mocks/MockRialtoRouterRegistry.sol";
import {MockGuardedRouter} from "./mocks/MockGuardedRouter.sol";
import {MockGuardedCalldataValidator} from "./mocks/MockGuardedCalldataValidator.sol";
import {MockSettlementPriceGuard} from "./mocks/MockSettlementPriceGuard.sol";
import {ReentrantGuardedRouter} from "./mocks/ReentrantGuardedRouter.sol";

/// @notice Local, offline Foundry tests for GuardedSettlementExecutor. No fork, no RPC, no live call.
contract GuardedSettlementExecutorTest is Test {
    uint256 internal constant CHAIN = 4663;
    uint256 internal constant CAP = 10_000_000_000_000_000; // 0.01 WETH
    uint256 internal constant SELL = 5_000_000_000_000_000; // 0.005 WETH
    uint256 internal constant MINBUY = 1_000_000_000_000_000;
    bytes32 internal constant DOMAIN = keccak256("BPS-GUARDED-SETTLEMENT/1");
    bytes4 internal constant EVIDENCE_ONLY_SELECTOR = 0x77963966;

    MockERC20 internal weth;
    MockERC20 internal nvda;
    MockRialtoRouterRegistry internal registry;
    MockGuardedRouter internal router;
    MockGuardedCalldataValidator internal validator;
    MockSettlementPriceGuard internal priceGuard;
    GuardedSettlementExecutor internal exec;

    bytes4 internal FAKE_SELECTOR;
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        vm.chainId(CHAIN);
        weth = new MockERC20("WETH", "WETH", 18);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        registry = new MockRialtoRouterRegistry();
        router = new MockGuardedRouter(address(weth), address(nvda));
        registry.setOwner(2, address(router));
        validator = new MockGuardedCalldataValidator();
        priceGuard = new MockSettlementPriceGuard();
        exec = new GuardedSettlementExecutor(
            address(this), address(weth), address(nvda), address(registry)
        );
        weth.mint(address(exec), 1e18);
        nvda.mint(address(router), 1000e18);
        FAKE_SELECTOR = MockGuardedRouter.guardedSettle.selector;
    }

    // --- helpers ---

    function _configure() internal {
        exec.unpause();
        exec.setTokenPairAllowed(address(weth), address(nvda), true);
        exec.setMaxSellAmount(address(weth), CAP);
        exec.setPriceGuard(address(priceGuard));
        exec.setSelectorValidator(FAKE_SELECTOR, address(validator));
    }

    function _cd(
        address st,
        address bt,
        uint256 sa,
        uint256 mba,
        address rec,
        uint16 pf,
        uint16 igf
    ) internal view returns (bytes memory) {
        return abi.encodeWithSelector(FAKE_SELECTOR, st, bt, sa, mba, rec, pf, igf);
    }

    /// @dev Recompute calldataHash + intentDigest from the params so only the intended guard fails.
    function _finalize(IGuardedSettlementExecutor.SettlementParams memory p)
        internal
        view
        returns (IGuardedSettlementExecutor.SettlementParams memory)
    {
        p.calldataHash = keccak256(p.callData);
        IGuardedSettlementExecutor.DigestInput memory d = IGuardedSettlementExecutor.DigestInput({
            domain: DOMAIN,
            chainId: CHAIN,
            executor: address(exec),
            registryAddr: address(registry),
            featureId: 2,
            target: p.target,
            selector: p.selector,
            sellToken: p.sellToken,
            buyToken: p.buyToken,
            sellAmount: p.sellAmount,
            minBuyAmount: p.minBuyAmount,
            platformFeeBps: p.platformFeeBps,
            slippageBps: p.slippageBps,
            taker: address(exec),
            nonce: p.nonce,
            deadline: p.deadline,
            calldataHash: p.calldataHash
        });
        p.intentDigest = exec.computeIntentDigest(d);
        return p;
    }

    function _valid(uint256 nonce)
        internal
        view
        returns (IGuardedSettlementExecutor.SettlementParams memory p)
    {
        p.sellToken = address(weth);
        p.buyToken = address(nvda);
        p.sellAmount = SELL;
        p.minBuyAmount = MINBUY;
        p.target = address(router);
        p.selector = FAKE_SELECTOR;
        p.callData = _cd(address(weth), address(nvda), SELL, MINBUY, address(exec), 5, 0);
        p.platformFeeBps = 5;
        p.integratorFeePresent = false;
        p.slippageBps = 50;
        p.nonce = nonce;
        p.deadline = block.timestamp + 100;
        p = _finalize(p);
    }

    // ============================ constructor / config ============================

    function test_constructor_rejectsZeroAndBadController() public {
        vm.expectRevert(IGuardedSettlementExecutor.ZeroAddress.selector);
        new GuardedSettlementExecutor(address(this), address(0), address(nvda), address(registry));
        // Ownable rejects the zero controller.
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new GuardedSettlementExecutor(address(0), address(weth), address(nvda), address(registry));
        vm.expectRevert(IGuardedSettlementExecutor.InvalidController.selector);
        new GuardedSettlementExecutor(
            0x000000000000000000000000000000000000dEaD,
            address(weth),
            address(nvda),
            address(registry)
        );
    }

    function test_constructor_rejectsNonContractDeps() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IGuardedSettlementExecutor.NotAContract.selector, address(0xBEEF)
            )
        );
        new GuardedSettlementExecutor(
            address(this), address(0xBEEF), address(nvda), address(registry)
        );
    }

    function test_constructor_rejectsWrongChain() public {
        vm.chainId(1);
        vm.expectRevert(
            abi.encodeWithSelector(IGuardedSettlementExecutor.WrongChain.selector, uint256(1))
        );
        new GuardedSettlementExecutor(
            address(this), address(weth), address(nvda), address(registry)
        );
        vm.chainId(CHAIN);
    }

    function test_startsPaused() public view {
        assertTrue(exec.paused());
    }

    function test_onlyController_config_and_settle() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        exec.unpause();

        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        exec.executeSettlement(p);
    }

    function test_evidenceOnlySelector_cannotBeRegistered() public {
        vm.expectRevert(GuardedSettlementExecutor.EvidenceOnlySelectorDisabled.selector);
        exec.setSelectorValidator(EVIDENCE_ONLY_SELECTOR, address(validator));
        assertEq(exec.selectorValidator(EVIDENCE_ONLY_SELECTOR), address(0));
    }

    function test_setMaxSellAmount_capCeiling() public {
        vm.expectRevert(IGuardedSettlementExecutor.CapCeilingExceeded.selector);
        exec.setMaxSellAmount(address(weth), CAP + 1);
    }

    function test_setPriceGuard_rejectsZero() public {
        vm.expectRevert(IGuardedSettlementExecutor.ZeroAddress.selector);
        exec.setPriceGuard(address(0));
    }

    // ============================ happy path ============================

    function test_happyPath_settles() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        uint256 received = exec.executeSettlement(p);
        assertEq(received, MINBUY);
        assertEq(nvda.balanceOf(address(exec)), MINBUY);
        assertEq(weth.allowance(address(exec), address(router)), 0);
        assertEq(router.seenAllowance(), SELL); // approved EXACTLY the sell amount
        assertTrue(exec.isDigestConsumed(p.intentDigest));
        assertTrue(exec.isNonceUsed(1));
    }

    function test_happyPath_emitsSanitizedEvent() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(7);
        vm.expectEmit(true, true, true, true, address(exec));
        emit IGuardedSettlementExecutor.SettlementExecuted(
            p.intentDigest,
            7,
            address(router),
            address(weth),
            address(nvda),
            SELL,
            MINBUY,
            FAKE_SELECTOR
        );
        exec.executeSettlement(p);
    }

    // ============================ registry enforcement ============================

    function test_registry_pausedFeatureFailsClosed() public {
        _configure();
        registry.pause(2);
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        vm.expectRevert(); // ownerOf(2) reverts (paused/uninitialized)
        exec.executeSettlement(p);
    }

    function test_registry_zeroRouterFailsClosed() public {
        _configure();
        registry.forceReturnZero(2);
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        vm.expectRevert(IGuardedSettlementExecutor.ZeroRouter.selector);
        exec.executeSettlement(p);
    }

    function test_registry_targetMismatchFails() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.target = address(0xCAFE);
        p = _finalize(p);
        vm.expectRevert(
            abi.encodeWithSelector(
                IGuardedSettlementExecutor.RouterMismatch.selector, address(0xCAFE), address(router)
            )
        );
        exec.executeSettlement(p);
    }

    function test_registry_previousRouterCannotPass() public {
        _configure();
        // Migrate feature 2 to a new router; the old (previous) router must no longer settle.
        address oldRouter = address(router);
        MockGuardedRouter newRouter = new MockGuardedRouter(address(weth), address(nvda));
        registry.setOwner(2, address(newRouter));
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.target = oldRouter; // targeting the stale/previous router
        p = _finalize(p);
        vm.expectRevert(
            abi.encodeWithSelector(
                IGuardedSettlementExecutor.RouterMismatch.selector, oldRouter, address(newRouter)
            )
        );
        exec.executeSettlement(p);
    }

    // ============================ selector + calldata validation ============================

    function test_selectorWithoutValidatorFails() public {
        exec.unpause();
        exec.setTokenPairAllowed(address(weth), address(nvda), true);
        exec.setMaxSellAmount(address(weth), CAP);
        exec.setPriceGuard(address(priceGuard));
        // NOTE: no selector validator registered.
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        vm.expectRevert(IGuardedSettlementExecutor.SelectorNoValidator.selector);
        exec.executeSettlement(p);
    }

    function test_validatorMismatch_recipientNotExecutor() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        // Calldata routes the purchase to a stranger, not the executor.
        p.callData = _cd(address(weth), address(nvda), SELL, MINBUY, stranger, 5, 0);
        p = _finalize(p);
        vm.expectRevert(MockGuardedCalldataValidator.ValidatorMismatch.selector);
        exec.executeSettlement(p);
    }

    function test_validatorMismatch_integratorFeeInCalldata() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.callData = _cd(address(weth), address(nvda), SELL, MINBUY, address(exec), 5, 3); // integrator fee 3
        p = _finalize(p);
        vm.expectRevert(MockGuardedCalldataValidator.ValidatorMismatch.selector);
        exec.executeSettlement(p);
    }

    // ============================ token / amount / fee / value ============================

    function test_wrongDirectionFails() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.sellToken = address(nvda);
        p.buyToken = address(weth);
        p = _finalize(p);
        vm.expectRevert(IGuardedSettlementExecutor.WrongTokenOrDirection.selector);
        exec.executeSettlement(p);
    }

    function test_zeroAmountFails() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.sellAmount = 0;
        p.callData = _cd(address(weth), address(nvda), 0, MINBUY, address(exec), 5, 0);
        p = _finalize(p);
        vm.expectRevert(IGuardedSettlementExecutor.ZeroAmount.selector);
        exec.executeSettlement(p);
    }

    function test_capUnsetFails() public {
        exec.unpause();
        exec.setTokenPairAllowed(address(weth), address(nvda), true);
        exec.setPriceGuard(address(priceGuard));
        exec.setSelectorValidator(FAKE_SELECTOR, address(validator));
        // cap not set
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        vm.expectRevert(IGuardedSettlementExecutor.AmountCapUnset.selector);
        exec.executeSettlement(p);
    }

    function test_amountAboveCapFails() public {
        _configure();
        uint256 tooMuch = CAP + 1;
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.sellAmount = tooMuch;
        p.callData = _cd(address(weth), address(nvda), tooMuch, MINBUY, address(exec), 5, 0);
        p = _finalize(p);
        vm.expectRevert(IGuardedSettlementExecutor.AmountExceedsCap.selector);
        exec.executeSettlement(p);
    }

    function test_nonzeroValueFails() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(exec).call{value: 1}(
            abi.encodeCall(GuardedSettlementExecutor.executeSettlement, (p))
        );
        assertFalse(ok); // non-payable rejects value => msg.value must be 0
    }

    function test_platformFeeTooHighFails() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.platformFeeBps = 6;
        p.callData = _cd(address(weth), address(nvda), SELL, MINBUY, address(exec), 6, 0);
        p = _finalize(p);
        vm.expectRevert(IGuardedSettlementExecutor.FeeTooHigh.selector);
        exec.executeSettlement(p);
    }

    function test_integratorFeeFlagFails() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.integratorFeePresent = true;
        p = _finalize(p);
        vm.expectRevert(IGuardedSettlementExecutor.IntegratorFeeForbidden.selector);
        exec.executeSettlement(p);
    }

    function test_slippageTooHighFails() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.slippageBps = 101;
        p = _finalize(p);
        vm.expectRevert(IGuardedSettlementExecutor.SlippageTooHigh.selector);
        exec.executeSettlement(p);
    }

    // ============================ price guard ============================

    function test_priceGuardUnsetFails() public {
        exec.unpause();
        exec.setTokenPairAllowed(address(weth), address(nvda), true);
        exec.setMaxSellAmount(address(weth), CAP);
        exec.setSelectorValidator(FAKE_SELECTOR, address(validator));
        // price guard not set
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        vm.expectRevert(IGuardedSettlementExecutor.PriceGuardUnset.selector);
        exec.executeSettlement(p);
    }

    function test_priceGuardRejectingFails() public {
        _configure();
        priceGuard.setAccept(false);
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        vm.expectRevert(MockSettlementPriceGuard.PriceRejected.selector);
        exec.executeSettlement(p);
    }

    function test_priceGuardDeviationFails() public {
        _configure();
        // Reference: 0.005 WETH -> ~0.0009 NVDA; minBuy of 0.001 exceeds +1% ceiling.
        priceGuard.setReference(SELL, 900_000_000_000_000); // refBuyForSell = 0.0009
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        vm.expectRevert(MockSettlementPriceGuard.PriceDeviation.selector);
        exec.executeSettlement(p);
    }

    // ============================ received-delta / atomicity ============================

    function test_minBuyNotMetReverts() public {
        _configure();
        router.setDeliver(MINBUY - 1); // deliver less than the minimum
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        vm.expectRevert(
            abi.encodeWithSelector(
                IGuardedSettlementExecutor.MinBuyNotMet.selector, MINBUY, MINBUY - 1
            )
        );
        exec.executeSettlement(p);
        // Replay state restored by the atomic revert.
        assertFalse(exec.isDigestConsumed(p.intentDigest));
        assertFalse(exec.isNonceUsed(1));
        assertEq(weth.allowance(address(exec), address(router)), 0);
    }

    function test_routerFailureRevertsAtomically() public {
        _configure();
        router.setRevert(true);
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        vm.expectRevert(IGuardedSettlementExecutor.RouterCallFailed.selector);
        exec.executeSettlement(p);
        assertFalse(exec.isDigestConsumed(p.intentDigest));
        assertFalse(exec.isNonceUsed(1));
    }

    function test_feeOnTransferStockFailsSafe() public {
        // Deploy an executor whose stock token is fee-on-transfer: the received delta < minBuy => revert.
        MockFeeOnTransferERC20 feeStock = new MockFeeOnTransferERC20("FEE", "FEE", 100); // 1%
        MockGuardedRouter feeRouter = new MockGuardedRouter(address(weth), address(feeStock));
        MockRialtoRouterRegistry feeReg = new MockRialtoRouterRegistry();
        feeReg.setOwner(2, address(feeRouter));
        GuardedSettlementExecutor feeExec = new GuardedSettlementExecutor(
            address(this), address(weth), address(feeStock), address(feeReg)
        );
        weth.mint(address(feeExec), 1e18);
        feeStock.mint(address(feeRouter), 1000e18);
        feeExec.unpause();
        feeExec.setTokenPairAllowed(address(weth), address(feeStock), true);
        feeExec.setMaxSellAmount(address(weth), CAP);
        feeExec.setPriceGuard(address(priceGuard));
        feeExec.setSelectorValidator(FAKE_SELECTOR, address(validator));

        bytes memory cd =
            _cd(address(weth), address(feeStock), SELL, MINBUY, address(feeExec), 5, 0);
        IGuardedSettlementExecutor.DigestInput memory d = IGuardedSettlementExecutor.DigestInput({
            domain: DOMAIN,
            chainId: CHAIN,
            executor: address(feeExec),
            registryAddr: address(feeReg),
            featureId: 2,
            target: address(feeRouter),
            selector: FAKE_SELECTOR,
            sellToken: address(weth),
            buyToken: address(feeStock),
            sellAmount: SELL,
            minBuyAmount: MINBUY,
            platformFeeBps: 5,
            slippageBps: 50,
            taker: address(feeExec),
            nonce: 1,
            deadline: block.timestamp + 100,
            calldataHash: keccak256(cd)
        });
        IGuardedSettlementExecutor.SettlementParams memory p =
            IGuardedSettlementExecutor.SettlementParams({
                sellToken: address(weth),
                buyToken: address(feeStock),
                sellAmount: SELL,
                minBuyAmount: MINBUY,
                target: address(feeRouter),
                selector: FAKE_SELECTOR,
                callData: cd,
                platformFeeBps: 5,
                integratorFeePresent: false,
                slippageBps: 50,
                nonce: 1,
                deadline: block.timestamp + 100,
                intentDigest: feeExec.computeIntentDigest(d),
                calldataHash: keccak256(cd)
            });
        // Router delivers exactly MINBUY, but the 1% fee makes the received delta < MINBUY.
        vm.expectRevert(); // MinBuyNotMet
        feeExec.executeSettlement(p);
    }

    function test_allowanceClearFailureRevertsAtomically() public {
        // WETH that refuses allowance clearing => AllowanceNotCleared after the swap.
        AllowanceTrapERC20 trap = new AllowanceTrapERC20();
        MockGuardedRouter trapRouter = new MockGuardedRouter(address(trap), address(nvda));
        MockRialtoRouterRegistry trapReg = new MockRialtoRouterRegistry();
        trapReg.setOwner(2, address(trapRouter));
        GuardedSettlementExecutor trapExec = new GuardedSettlementExecutor(
            address(this), address(trap), address(nvda), address(trapReg)
        );
        trap.mint(address(trapExec), 1e18);
        nvda.mint(address(trapRouter), 1000e18);
        trapExec.unpause();
        trapExec.setTokenPairAllowed(address(trap), address(nvda), true);
        trapExec.setMaxSellAmount(address(trap), CAP);
        trapExec.setPriceGuard(address(priceGuard));
        trapExec.setSelectorValidator(FAKE_SELECTOR, address(validator));

        bytes memory cd = _cd(address(trap), address(nvda), SELL, MINBUY, address(trapExec), 5, 0);
        IGuardedSettlementExecutor.DigestInput memory d = IGuardedSettlementExecutor.DigestInput({
            domain: DOMAIN,
            chainId: CHAIN,
            executor: address(trapExec),
            registryAddr: address(trapReg),
            featureId: 2,
            target: address(trapRouter),
            selector: FAKE_SELECTOR,
            sellToken: address(trap),
            buyToken: address(nvda),
            sellAmount: SELL,
            minBuyAmount: MINBUY,
            platformFeeBps: 5,
            slippageBps: 50,
            taker: address(trapExec),
            nonce: 1,
            deadline: block.timestamp + 100,
            calldataHash: keccak256(cd)
        });
        IGuardedSettlementExecutor.SettlementParams memory p =
            IGuardedSettlementExecutor.SettlementParams({
                sellToken: address(trap),
                buyToken: address(nvda),
                sellAmount: SELL,
                minBuyAmount: MINBUY,
                target: address(trapRouter),
                selector: FAKE_SELECTOR,
                callData: cd,
                platformFeeBps: 5,
                integratorFeePresent: false,
                slippageBps: 50,
                nonce: 1,
                deadline: block.timestamp + 100,
                intentDigest: trapExec.computeIntentDigest(d),
                calldataHash: keccak256(cd)
            });
        vm.expectRevert(); // AllowanceNotCleared
        trapExec.executeSettlement(p);
    }

    // ============================ deadline / replay / digest ============================

    function test_missingDeadlineFails() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.deadline = 0;
        p = _finalize(p);
        vm.expectRevert(IGuardedSettlementExecutor.MissingOrExpiredDeadline.selector);
        exec.executeSettlement(p);
    }

    function test_expiredDeadlineFails() public {
        _configure();
        vm.warp(1_000_000);
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.deadline = block.timestamp - 1;
        p = _finalize(p);
        vm.expectRevert(IGuardedSettlementExecutor.MissingOrExpiredDeadline.selector);
        exec.executeSettlement(p);
    }

    function test_deadlineTooFarFails() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.deadline = block.timestamp + 301; // > 300s horizon
        p = _finalize(p);
        vm.expectRevert(IGuardedSettlementExecutor.DeadlineTooFar.selector);
        exec.executeSettlement(p);
    }

    function test_reusedNonceFails() public {
        _configure();
        exec.executeSettlement(_valid(1));
        // Same nonce, different amount => distinct digest => NonceUsed is the failure.
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.sellAmount = SELL + 1;
        p.callData = _cd(address(weth), address(nvda), SELL + 1, MINBUY, address(exec), 5, 0);
        p = _finalize(p);
        vm.expectRevert(IGuardedSettlementExecutor.NonceUsed.selector);
        exec.executeSettlement(p);
    }

    function test_reusedDigestFails() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        exec.executeSettlement(p);
        vm.expectRevert(IGuardedSettlementExecutor.DigestUsed.selector);
        exec.executeSettlement(p); // identical => same digest
    }

    function test_digestMismatchFails() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.intentDigest = bytes32(uint256(p.intentDigest) ^ 1);
        vm.expectRevert(IGuardedSettlementExecutor.DigestMismatch.selector);
        exec.executeSettlement(p);
    }

    function test_calldataHashMismatchFails() public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.calldataHash = keccak256("not the calldata");
        vm.expectRevert(IGuardedSettlementExecutor.CalldataHashMismatch.selector);
        exec.executeSettlement(p);
    }

    // ============================ reentrancy / pause / recovery ============================

    function test_reentrancyBlocked() public {
        // The reentrant router is BOTH the feature-2 router AND the executor's controller (owner), so its
        // nested re-entry passes onlyOwner and reaches the nonReentrant guard.
        ReentrantGuardedRouter reRouter = new ReentrantGuardedRouter(address(weth), address(nvda));
        MockRialtoRouterRegistry reg2 = new MockRialtoRouterRegistry();
        reg2.setOwner(2, address(reRouter));
        GuardedSettlementExecutor rexec = new GuardedSettlementExecutor(
            address(reRouter), address(weth), address(nvda), address(reg2)
        );
        weth.mint(address(rexec), 1e18);
        nvda.mint(address(reRouter), 1000e18);
        vm.startPrank(address(reRouter));
        rexec.unpause();
        rexec.setTokenPairAllowed(address(weth), address(nvda), true);
        rexec.setMaxSellAmount(address(weth), CAP);
        rexec.setPriceGuard(address(priceGuard));
        rexec.setSelectorValidator(FAKE_SELECTOR, address(validator));
        vm.stopPrank();

        bytes memory cd = _cd(address(weth), address(nvda), SELL, MINBUY, address(rexec), 5, 0);
        IGuardedSettlementExecutor.DigestInput memory d = IGuardedSettlementExecutor.DigestInput({
            domain: DOMAIN,
            chainId: CHAIN,
            executor: address(rexec),
            registryAddr: address(reg2),
            featureId: 2,
            target: address(reRouter),
            selector: FAKE_SELECTOR,
            sellToken: address(weth),
            buyToken: address(nvda),
            sellAmount: SELL,
            minBuyAmount: MINBUY,
            platformFeeBps: 5,
            slippageBps: 50,
            taker: address(rexec),
            nonce: 1,
            deadline: block.timestamp + 100,
            calldataHash: keccak256(cd)
        });
        IGuardedSettlementExecutor.SettlementParams memory p =
            IGuardedSettlementExecutor.SettlementParams({
                sellToken: address(weth),
                buyToken: address(nvda),
                sellAmount: SELL,
                minBuyAmount: MINBUY,
                target: address(reRouter),
                selector: FAKE_SELECTOR,
                callData: cd,
                platformFeeBps: 5,
                integratorFeePresent: false,
                slippageBps: 50,
                nonce: 1,
                deadline: block.timestamp + 100,
                intentDigest: rexec.computeIntentDigest(d),
                calldataHash: keccak256(cd)
            });
        // The nested params only need to reach the nonReentrant modifier; reuse `p`.
        reRouter.setReentry(rexec, p);

        reRouter.kickoff(rexec, p); // outer succeeds; the nested re-entry is blocked by nonReentrant
        assertEq(
            bytes4(reRouter.reentryError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector
        );
    }

    function test_emergencyPauseBlocksSettlement() public {
        _configure();
        exec.pause();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        exec.executeSettlement(p);
    }

    function test_recover_sendsOnlyToControllerAndClamps() public {
        // Send stray tokens to the executor; recovery returns them to the controller (owner) only.
        weth.mint(address(exec), 3e18);
        uint256 execBal = weth.balanceOf(address(exec));
        uint256 ownerBefore = weth.balanceOf(address(this));
        exec.recover(address(weth), type(uint256).max); // clamps to the balance
        assertEq(weth.balanceOf(address(exec)), 0);
        assertEq(weth.balanceOf(address(this)), ownerBefore + execBal);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        exec.recover(address(weth), 1);
    }

    // ============================ cross-language digest parity ============================

    /// @dev Must equal the TypeScript `computeOnchainIntentDigest` for the same fixed vector
    ///      (packages/rialto/src/guarded-settlement.ts). Proves TS and Solidity digests are identical.
    function test_digestParityVector() public view {
        assertEq(exec.GUARD_DOMAIN(), DOMAIN);
        IGuardedSettlementExecutor.DigestInput memory d = IGuardedSettlementExecutor.DigestInput({
            domain: DOMAIN,
            chainId: 4663,
            executor: 0x1111111111111111111111111111111111111111,
            registryAddr: 0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E,
            featureId: 2,
            target: 0xC94135b63772b91D79d0A2DaAb2a8801f32359bD,
            selector: hex"77963966",
            sellToken: 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73,
            buyToken: 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC,
            sellAmount: 5_000_000_000_000_000,
            minBuyAmount: 1_000_000_000_000_000,
            platformFeeBps: 5,
            slippageBps: 50,
            taker: 0x1111111111111111111111111111111111111111,
            nonce: 1,
            deadline: 1_893_456_000,
            calldataHash: bytes32(uint256(0xdeadbeef))
        });
        assertEq(
            exec.computeIntentDigest(d),
            bytes32(0x99edf1c907908d0d6f278d7e04c0a6624ba35f59ca6b7b74800b220fdd8e8c06)
        );
    }

    // ============================ fuzz ============================

    function testFuzz_amountWithinCapSettles(uint256 amount) public {
        _configure();
        amount = bound(amount, 1, CAP);
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.sellAmount = amount;
        p.minBuyAmount = 1;
        p.callData = _cd(address(weth), address(nvda), amount, 1, address(exec), 5, 0);
        p = _finalize(p);
        uint256 received = exec.executeSettlement(p);
        assertGe(received, 1);
        assertEq(weth.allowance(address(exec), address(router)), 0);
    }

    function testFuzz_amountAboveCapFails(uint256 amount) public {
        _configure();
        amount = bound(amount, CAP + 1, type(uint128).max);
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.sellAmount = amount;
        p.callData = _cd(address(weth), address(nvda), amount, MINBUY, address(exec), 5, 0);
        p = _finalize(p);
        vm.expectRevert(IGuardedSettlementExecutor.AmountExceedsCap.selector);
        exec.executeSettlement(p);
    }

    function testFuzz_slippageCeiling(uint16 slippage) public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        p.slippageBps = slippage;
        p = _finalize(p);
        if (slippage > 100) {
            vm.expectRevert(IGuardedSettlementExecutor.SlippageTooHigh.selector);
            exec.executeSettlement(p);
        } else {
            exec.executeSettlement(p);
        }
    }

    function testFuzz_reusedNonceAlwaysFails(uint256 nonce) public {
        _configure();
        nonce = bound(nonce, 1, type(uint128).max);
        exec.executeSettlement(_valid(nonce));
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(nonce);
        p.minBuyAmount = MINBUY + 1;
        p.callData = _cd(address(weth), address(nvda), SELL, MINBUY + 1, address(exec), 5, 0);
        p = _finalize(p);
        vm.expectRevert(IGuardedSettlementExecutor.NonceUsed.selector);
        exec.executeSettlement(p);
    }

    function testFuzz_calldataMutationFails(uint256 idx, uint8 xorVal) public {
        _configure();
        IGuardedSettlementExecutor.SettlementParams memory p = _valid(1);
        vm.assume(xorVal != 0);
        idx = bound(idx, 0, p.callData.length - 1);
        // Mutate one calldata byte WITHOUT updating calldataHash => CalldataHashMismatch (fail closed).
        p.callData[idx] = bytes1(uint8(p.callData[idx]) ^ xorVal);
        vm.expectRevert(IGuardedSettlementExecutor.CalldataHashMismatch.selector);
        exec.executeSettlement(p);
    }
}

/// @notice Stateful invariant: the executor never leaves a lingering router allowance, whatever the
///         controller does. The handler configures + drives settlements; the invariant checks allowance.
contract GuardedSettlementInvariant is Test {
    uint256 internal constant CHAIN = 4663;
    uint256 internal constant CAP = 10_000_000_000_000_000;
    GuardedSettlementHandler internal handler;

    function setUp() public {
        vm.chainId(CHAIN);
        handler = new GuardedSettlementHandler();
        targetContract(address(handler));
    }

    function invariant_routerAllowanceAlwaysZero() public view {
        assertEq(handler.currentAllowance(), 0);
    }

    function invariant_neverExceedsCapConfig() public view {
        assertLe(handler.configuredCap(), CAP);
    }
}

/// @notice Invariant handler: owns + configures a GuardedSettlementExecutor and drives settlements with
///         fresh nonces (catching reverts). Used only by the invariant runner. Test-only.
contract GuardedSettlementHandler is Test {
    uint256 internal constant CHAIN = 4663;
    uint256 internal constant CAP = 10_000_000_000_000_000;
    bytes32 internal constant DOMAIN = keccak256("BPS-GUARDED-SETTLEMENT/1");

    MockERC20 internal weth;
    MockERC20 internal nvda;
    MockRialtoRouterRegistry internal registry;
    MockGuardedRouter internal router;
    MockGuardedCalldataValidator internal validator;
    MockSettlementPriceGuard internal priceGuard;
    GuardedSettlementExecutor internal exec;
    bytes4 internal FAKE_SELECTOR;
    uint256 internal nonceCounter;

    constructor() {
        vm.chainId(CHAIN);
        weth = new MockERC20("WETH", "WETH", 18);
        nvda = new MockERC20("NVDA", "NVDA", 18);
        registry = new MockRialtoRouterRegistry();
        router = new MockGuardedRouter(address(weth), address(nvda));
        registry.setOwner(2, address(router));
        validator = new MockGuardedCalldataValidator();
        priceGuard = new MockSettlementPriceGuard();
        exec = new GuardedSettlementExecutor(
            address(this), address(weth), address(nvda), address(registry)
        );
        weth.mint(address(exec), 100e18);
        nvda.mint(address(router), 1_000_000e18);
        FAKE_SELECTOR = MockGuardedRouter.guardedSettle.selector;
        exec.unpause();
        exec.setTokenPairAllowed(address(weth), address(nvda), true);
        exec.setMaxSellAmount(address(weth), CAP);
        exec.setPriceGuard(address(priceGuard));
        exec.setSelectorValidator(FAKE_SELECTOR, address(validator));
    }

    function currentAllowance() external view returns (uint256) {
        return weth.allowance(address(exec), address(router));
    }

    function configuredCap() external view returns (uint256) {
        return exec.maxSellAmount(address(weth));
    }

    function settle(uint256 amountSeed) external {
        uint256 amount = bound(amountSeed, 1, CAP);
        nonceCounter++;
        uint256 nonce = nonceCounter;
        uint256 deadline = block.timestamp + 100;
        bytes memory cd = abi.encodeWithSelector(
            FAKE_SELECTOR,
            address(weth),
            address(nvda),
            amount,
            uint256(1),
            address(exec),
            uint16(5),
            uint16(0)
        );
        IGuardedSettlementExecutor.DigestInput memory d = IGuardedSettlementExecutor.DigestInput({
            domain: DOMAIN,
            chainId: CHAIN,
            executor: address(exec),
            registryAddr: address(registry),
            featureId: 2,
            target: address(router),
            selector: FAKE_SELECTOR,
            sellToken: address(weth),
            buyToken: address(nvda),
            sellAmount: amount,
            minBuyAmount: 1,
            platformFeeBps: 5,
            slippageBps: 50,
            taker: address(exec),
            nonce: nonce,
            deadline: deadline,
            calldataHash: keccak256(cd)
        });
        IGuardedSettlementExecutor.SettlementParams memory p =
            IGuardedSettlementExecutor.SettlementParams({
                sellToken: address(weth),
                buyToken: address(nvda),
                sellAmount: amount,
                minBuyAmount: 1,
                target: address(router),
                selector: FAKE_SELECTOR,
                callData: cd,
                platformFeeBps: 5,
                integratorFeePresent: false,
                slippageBps: 50,
                nonce: nonce,
                deadline: deadline,
                intentDigest: exec.computeIntentDigest(d),
                calldataHash: keccak256(cd)
            });
        try exec.executeSettlement(p) returns (uint256) {} catch {}
    }
}
