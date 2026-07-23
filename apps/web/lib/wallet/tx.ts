// Transaction lifecycle service (Task 8B §E). Orchestrates exact-approval → simulate → submit → confirm →
// reconcile against injected viem clients (a mock wallet/public client in local/tests, the user's wallet
// in live mode). It NEVER requests unlimited approval, never routes official trades to SwapRouter02
// (the target is caller-supplied and asserted upstream), and fails closed on wrong chain or a failed
// simulation. It performs no live broadcast in this repository — local mode targets the mock transport.
import {
  encodeFunctionData,
  erc20Abi,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { ROBINHOOD_CHAIN_ID } from "../chain";

export type LifecycleStep =
  | "validate"
  | "read-allowance"
  | "approve"
  | "await-approval"
  | "reread-allowance"
  | "simulate"
  | "submit"
  | "await-receipt"
  | "reconcile"
  | "done";

export interface ApprovalRequirement {
  readonly token: Address;
  readonly spender: Address;
  readonly amount: bigint; // EXACT amount; never max
}

export interface ActionRequest {
  readonly target: Address;
  readonly data: Hex;
  readonly value?: bigint;
  readonly approval?: ApprovalRequirement;
  readonly confirmations: number;
  // Post-confirmation authoritative-state check: returns true only when the confirmed on-chain state
  // matches the intended action. Success is NEVER reported on a returned hash alone.
  readonly reconcile?: () => Promise<boolean>;
}

export interface LifecycleResult {
  readonly ok: boolean;
  readonly step: LifecycleStep;
  readonly hash?: Hex;
  readonly reason?: string;
}

type ConfirmOutcome =
  | { readonly kind: "receipt"; readonly receipt: TransactionReceipt }
  | { readonly kind: "cancelled" }
  | { readonly kind: "confirm-error"; readonly reason: string };

/**
 * Await a confirmed receipt at the required depth, correctly handling mempool replacement via viem's
 * `onReplaced` callback:
 *  - a CANCELLED replacement means the intended action did NOT execute → reported as cancelled;
 *  - a repriced/replaced (still-mined) replacement resolves with the replacement's confirmed receipt,
 *    which is then reconciled against authoritative state like any other receipt;
 *  - any confirmation error (timeout, RPC failure) fails closed rather than throwing.
 * Success is never assumed — the caller must still inspect receipt.status and reconcile.
 */
async function waitConfirmed(
  pub: PublicClient,
  hash: Hex,
  confirmations: number,
): Promise<ConfirmOutcome> {
  let replacementReason: string | null = null;
  try {
    const receipt = await pub.waitForTransactionReceipt({
      hash,
      confirmations,
      onReplaced: (r: { reason: string }) => {
        replacementReason = r.reason;
      },
    });
    if (replacementReason === "cancelled") return { kind: "cancelled" };
    return { kind: "receipt", receipt };
  } catch (e) {
    return { kind: "confirm-error", reason: rejectionReason(e) };
  }
}

async function currentAllowance(
  pub: PublicClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return pub.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

/**
 * Run the full lifecycle. `onStep` reports progress for the UI. Approval is requested for the EXACT
 * amount only when the current allowance is insufficient. A successful simulation is required before
 * submission, and the action is re-simulated after any approval.
 */
export async function runActionLifecycle(
  clients: { pub: PublicClient; wallet: WalletClient; account: Account | Address },
  req: ActionRequest,
  onStep?: (s: LifecycleStep) => void,
): Promise<LifecycleResult> {
  const account = typeof clients.account === "string" ? clients.account : clients.account.address;
  const report = (s: LifecycleStep) => onStep?.(s);

  report("validate");
  const chainId = await clients.pub.getChainId();
  if (chainId !== ROBINHOOD_CHAIN_ID) return { ok: false, step: "validate", reason: "wrong-chain" };

  if (req.approval) {
    report("read-allowance");
    const have = await currentAllowance(
      clients.pub,
      req.approval.token,
      account as Address,
      req.approval.spender,
    );
    if (have < req.approval.amount) {
      report("approve");
      let approveHash: Hex;
      try {
        approveHash = await clients.wallet.sendTransaction({
          chain: clients.wallet.chain,
          account: clients.account,
          to: req.approval.token,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [req.approval.spender, req.approval.amount], // EXACT, never max
          }),
        });
      } catch (e) {
        return { ok: false, step: "approve", reason: rejectionReason(e) };
      }
      report("await-approval");
      const approvalOutcome = await waitConfirmed(clients.pub, approveHash, req.confirmations);
      if (approvalOutcome.kind === "cancelled")
        return { ok: false, step: "await-approval", reason: "approval-cancelled-replacement" };
      if (approvalOutcome.kind === "confirm-error")
        return {
          ok: false,
          step: "await-approval",
          reason: `confirm-error:${approvalOutcome.reason}`,
        };
      if (approvalOutcome.receipt.status !== "success")
        return { ok: false, step: "await-approval", reason: "approval-reverted" };
      report("reread-allowance");
      const now = await currentAllowance(
        clients.pub,
        req.approval.token,
        account as Address,
        req.approval.spender,
      );
      if (now < req.approval.amount)
        return { ok: false, step: "reread-allowance", reason: "allowance-insufficient" };
    }
  }

  report("simulate");
  try {
    await clients.pub.call({
      account: account as Address,
      to: req.target,
      data: req.data,
      value: req.value ?? 0n,
    });
  } catch (e) {
    return { ok: false, step: "simulate", reason: `simulation-failed:${rejectionReason(e)}` };
  }

  report("submit");
  let hash: Hex;
  try {
    hash = await clients.wallet.sendTransaction({
      chain: clients.wallet.chain,
      account: clients.account,
      to: req.target,
      data: req.data,
      value: req.value ?? 0n,
    });
  } catch (e) {
    return { ok: false, step: "submit", reason: rejectionReason(e) };
  }

  report("await-receipt");
  const outcome = await waitConfirmed(clients.pub, hash, req.confirmations);
  if (outcome.kind === "cancelled")
    return { ok: false, step: "await-receipt", hash, reason: "cancelled-replacement" };
  if (outcome.kind === "confirm-error")
    return { ok: false, step: "await-receipt", hash, reason: `confirm-error:${outcome.reason}` };
  if (outcome.receipt.status !== "success")
    return { ok: false, step: "await-receipt", hash, reason: "reverted" };

  report("reconcile");
  if (req.reconcile) {
    let reconciled: boolean;
    try {
      reconciled = await req.reconcile();
    } catch {
      reconciled = false;
    }
    if (!reconciled) return { ok: false, step: "reconcile", hash, reason: "reconciliation-failed" };
  }
  report("done");
  return { ok: true, step: "done", hash };
}

function rejectionReason(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const msg = raw.toLowerCase();
  if (msg.includes("reject") || msg.includes("denied")) return "user-rejected";
  if (msg.includes("revert")) return "reverted";
  if (msg.includes("replac")) return "replaced";
  return `failed: ${raw.split("\n")[0]?.slice(0, 120)}`;
}
