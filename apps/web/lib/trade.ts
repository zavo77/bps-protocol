// Official BPS trade model (Task 8 §C). Routes official trades ONLY through BPSTradeRouter — never
// directly through SwapRouter02 — computes the full pre-confirmation disclosure (allocation, burn,
// minimum output, deadline, exact allowance, target, chain), and gates submission behind eligibility,
// a valid live deployment, a fresh quote, an unexpired deadline, and a successful simulation. It fails
// closed on any missing gate. Building calldata is pure; nothing here signs or broadcasts.
import { encodeFunctionData, type Address, type Hex } from "viem";
import { bpsTradeRouterAbi } from "./abis";
import { buyAllocation, sellAllocation, type TradeAllocation } from "./economics";
import { ROBINHOOD_CHAIN_ID, writesAllowed, type DeploymentState } from "./manifest";

export type TradeDirection = "buy" | "sell";

export interface TradeRequest {
  readonly direction: TradeDirection;
  readonly amountIn: bigint; // buy: gross WETH; sell: gross BPS
  readonly expectedUserOut: bigint; // buy: expected BPS to user; sell: expected WETH to user
  readonly expectedWethProceeds?: bigint; // sell only: the WETH the input BPS is expected to fetch
  readonly slippageBps: number; // applied to expected user output
  readonly recipient: Address;
  readonly nowSec: bigint;
  readonly ttlSec: bigint;
  readonly poolFee?: number; // if determinable from config
}

export interface TradePreview {
  readonly direction: TradeDirection;
  readonly chainId: number;
  readonly target: Address; // ALWAYS the BPSTradeRouter
  readonly amountIn: bigint;
  readonly minUserOut: bigint;
  readonly allocation: TradeAllocation;
  readonly stockAcquisitionFunding: bigint;
  readonly bpsBurnComponent: bigint;
  readonly totalDeductions: bigint;
  readonly totalProtocolBps: bigint;
  readonly deadline: bigint;
  readonly allowanceToken: "WETH" | "BPS";
  readonly allowanceAmount: bigint; // EXACT input amount; never unlimited
  readonly poolFee: number | null;
  readonly calldata: Hex;
}

function applySlippage(amount: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps > 10_000) throw new Error("slippageBps out of range");
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}

/**
 * Build the full trade preview from the frozen router surface. The target is always the manifest's
 * `tradeRouter`; direct SwapRouter02 routing is never produced. Allocation uses the accepted economics.
 */
export function buildTradePreview(req: TradeRequest, deployment: DeploymentState): TradePreview {
  if (deployment.status !== "live") {
    throw new Error("no live deployment: trade preview unavailable");
  }
  if (deployment.chainId !== ROBINHOOD_CHAIN_ID) throw new Error("wrong chain");
  if (req.amountIn <= 0n) throw new Error("zero input");
  const target = deployment.addresses.tradeRouter as Address;
  const deadline = req.nowSec + req.ttlSec;
  const minUserOut = applySlippage(req.expectedUserOut, req.slippageBps);

  if (req.direction === "buy") {
    const allocation = buyAllocation(req.amountIn);
    const calldata = encodeFunctionData({
      abi: bpsTradeRouterAbi,
      functionName: "buyExactWethForBps",
      args: [req.amountIn, minUserOut, 0n, req.recipient, deadline],
    });
    return {
      direction: "buy",
      chainId: deployment.chainId,
      target,
      amountIn: req.amountIn,
      minUserOut,
      allocation,
      stockAcquisitionFunding: allocation.stockBudget,
      bpsBurnComponent: allocation.burnBudget,
      totalDeductions: allocation.stockBudget + allocation.burnBudget,
      totalProtocolBps: allocation.totalProtocolBps,
      deadline,
      allowanceToken: "WETH",
      allowanceAmount: req.amountIn, // exact
      poolFee: req.poolFee ?? null,
      calldata,
    };
  }

  // sell: allocation is computed from the ACTUAL WETH proceeds of selling the input BPS.
  const proceeds = req.expectedWethProceeds ?? req.expectedUserOut;
  const allocation = sellAllocation(proceeds);
  const calldata = encodeFunctionData({
    abi: bpsTradeRouterAbi,
    functionName: "sellExactBpsForWeth",
    args: [req.amountIn, 0n, minUserOut, 0n, req.recipient, deadline],
  });
  return {
    direction: "sell",
    chainId: deployment.chainId,
    target,
    amountIn: req.amountIn,
    minUserOut,
    allocation,
    stockAcquisitionFunding: allocation.stockBudget,
    bpsBurnComponent: allocation.burnBudget,
    totalDeductions: allocation.stockBudget + allocation.burnBudget,
    totalProtocolBps: allocation.totalProtocolBps,
    deadline,
    allowanceToken: "BPS",
    allowanceAmount: req.amountIn, // exact
    poolFee: req.poolFee ?? null,
    calldata,
  };
}

/** Reject any target that is not the official router (e.g. a raw SwapRouter02 address). */
export function assertOfficialRoute(target: Address, deployment: DeploymentState): void {
  if (deployment.status !== "live") throw new Error("no live deployment");
  if (target.toLowerCase() !== deployment.addresses.tradeRouter.toLowerCase()) {
    throw new Error(
      "refused: official trades must route through BPSTradeRouter, not an external pool",
    );
  }
}

export interface SubmissionGateInput {
  readonly deployment: DeploymentState;
  readonly eligible: boolean;
  readonly simulationOk: boolean;
  readonly quoteFresh: boolean;
  readonly nowSec: bigint;
  readonly deadline: bigint;
  readonly manifestSourceCommit: string;
  readonly quoteSourceCommit: string;
}

export type SubmissionGate =
  { readonly canSubmit: true } | { readonly canSubmit: false; readonly reason: string };

/** Fail-closed submission gate: every condition must hold or the trade cannot be submitted. */
export function tradeSubmissionGate(g: SubmissionGateInput): SubmissionGate {
  if (!writesAllowed(g.deployment)) return { canSubmit: false, reason: "protocol-not-live" };
  if (!g.eligible) return { canSubmit: false, reason: "not-eligible" };
  if (g.manifestSourceCommit !== g.quoteSourceCommit) {
    return { canSubmit: false, reason: "manifest-quote-commit-mismatch" };
  }
  if (!g.quoteFresh) return { canSubmit: false, reason: "stale-quote" };
  if (g.nowSec >= g.deadline) return { canSubmit: false, reason: "deadline-expired" };
  if (!g.simulationOk) return { canSubmit: false, reason: "simulation-failed" };
  return { canSubmit: true };
}
