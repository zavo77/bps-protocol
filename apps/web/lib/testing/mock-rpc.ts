// Deterministic in-memory mock JSON-RPC engine (Task 8B/8C, local/testing only). It backs both a viem
// `custom` transport (for read services) and the authoritative EIP-1193 mock provider (mock-eip1193.ts)
// so the ENTIRE flow — reads, simulation, approval, submission, receipt, and event emission — works
// offline against fixed state, never touching a live chain. No production key material lives here; the
// EIP-1193 provider signs internally with a deterministic local-test key that the app/UI never imports.
import {
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  parseTransaction,
  toFunctionSelector,
  type Transport,
} from "viem";
import {
  bpsTradeRouterAbi,
  bpsLockingVaultAbi,
  distributionClaimManagerAbi,
  distributionFundingCoordinatorAbi,
} from "../abis";
import { ROBINHOOD_CHAIN_ID } from "../chain";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as `0x${string}`;

export interface MockErc20 {
  decimals: number;
  balances: Record<string, bigint>;
  allowances: Record<string, bigint>; // `${owner}:${spender}`
}

export interface MockChainState {
  chainId: number;
  blockNumber: bigint;
  accounts: readonly string[];
  code: Record<string, boolean>; // lowercased addr -> has code
  erc20: Record<string, MockErc20>; // lowercased token -> state
  routerPaused: boolean;
  claimRemaining: Record<string, bigint>; // `${cycleId}:${assetLower}`
  claimed: Record<string, boolean>; // `${cycleId}::${claimantLower}`
  lockedPrincipal: Record<string, bigint>; // `${accountLower}` -> locked BPS in the vault
  locks: Record<string, bigint[]>; // `${accountLower}` -> per-lockId principal (0 = withdrawn)
  // Authoritative claim-manager cycle state (read via cycles()/assetFunding()).
  cycleRoot: Record<string, `0x${string}`>; // `${cycleId}` -> current on-chain merkle root
  cyclePublished: Record<string, boolean>; // `${cycleId}` -> published
  assetFunded: Record<string, bigint>; // `${cycleId}:${assetLower}` -> funded allocation
  // Authoritative coordinator acquisition record (read via acquisitions()).
  acquisition: {
    status: number;
    stockToken: string;
    wethSpent: bigint;
    acquiredStock: bigint;
    distributionAmount: bigint;
    reserveAmount: bigint;
    cycleId: bigint;
  } | null;
  logs: unknown[]; // pre-encoded event logs returned by eth_getLogs
  switchChainRejects: boolean;
  sendRejects: boolean;
  revertOnSimulate: boolean;
  receiptReverts: boolean;
  // When true, an approve() send is accepted (hash + success receipt) but the allowance is NOT updated,
  // so the post-approval re-read fails closed (models a non-conforming / griefing token).
  suppressApprovalEffect?: boolean;
  txCount: number;
  // Optional hook: called after a state-mutating send is applied, so the harness can append a
  // corresponding confirmed event log (used to prove event-backed transparency updates live).
  onApplied?: (
    kind: "approve" | "claim" | "lock" | "withdraw",
    args: Record<string, unknown>,
  ) => void;
}

const AGG_LATEST = toFunctionSelector("latestRoundData()");
const AGG_DECIMALS = toFunctionSelector("decimals()");
const ORACLE_PAUSED = toFunctionSelector("oraclePaused()");
const APPROVE = toFunctionSelector("approve(address,uint256)");
const CLAIM = toFunctionSelector("claim(uint256,address,uint256,bytes32[])");
const CREATE_LOCK = toFunctionSelector("createLock(uint256,uint32)");
const WITHDRAW = toFunctionSelector("withdraw(uint256)");

function sel(data: string): string {
  return data.slice(0, 10).toLowerCase();
}

function nextHash(state: MockChainState): `0x${string}` {
  state.txCount += 1;
  return `0x${state.txCount.toString(16).padStart(64, "0")}` as `0x${string}`;
}

/** Apply state mutations for a submitted tx (approve/claim/lock). Sole sender = state.accounts[0]. */
function applySend(state: MockChainState, to?: string, data?: string): void {
  if (!to || !data) return;
  const target = to.toLowerCase();
  const from = String(state.accounts[0] ?? "").toLowerCase();
  const s = sel(data);
  if (state.erc20[target] && s === sel(APPROVE)) {
    const dec = decodeFunctionData({ abi: erc20Abi, data: data as `0x${string}` });
    if (dec.functionName === "approve") {
      const spender = String(dec.args[0]).toLowerCase();
      if (!state.suppressApprovalEffect) {
        state.erc20[target]!.allowances[`${from}:${spender}`] = dec.args[1] as bigint;
      }
      state.onApplied?.("approve", { token: target, spender, amount: dec.args[1] });
    }
  } else if (s === sel(CLAIM)) {
    const dec = decodeFunctionData({
      abi: distributionClaimManagerAbi,
      data: data as `0x${string}`,
    });
    const cycleId = dec.args[0] as bigint;
    const asset = String(dec.args[1]).toLowerCase();
    const amount = dec.args[2] as bigint;
    state.claimed[`${cycleId}::${from}`] = true;
    const key = `${cycleId}:${asset}`;
    const rem = state.claimRemaining[key] ?? 0n;
    state.claimRemaining[key] = rem > amount ? rem - amount : 0n;
    state.onApplied?.("claim", { cycleId, asset, claimant: from, amount });
  } else if (s === sel(CREATE_LOCK)) {
    const dec = decodeFunctionData({ abi: bpsLockingVaultAbi, data: data as `0x${string}` });
    const amount = dec.args[0] as bigint;
    const duration = dec.args[1] as number;
    state.lockedPrincipal[from] = (state.lockedPrincipal[from] ?? 0n) + amount;
    state.locks[from] = [...(state.locks[from] ?? []), amount]; // new lock position
    // Reduce the vault's BPS-side allowance by the spent amount (SafeERC20 pull).
    const bpsEntry = Object.entries(state.erc20).find(
      ([, v]) => v.allowances[`${from}:${target}`] !== undefined,
    );
    if (bpsEntry) {
      const allowKey = `${from}:${target}`;
      const cur = bpsEntry[1].allowances[allowKey] ?? 0n;
      bpsEntry[1].allowances[allowKey] = cur > amount ? cur - amount : 0n;
      bpsEntry[1].balances[from] = (bpsEntry[1].balances[from] ?? 0n) - amount;
    }
    state.onApplied?.("lock", { account: from, vault: target, amount, duration });
  } else if (s === sel(WITHDRAW)) {
    const dec = decodeFunctionData({ abi: bpsLockingVaultAbi, data: data as `0x${string}` });
    const lockId = Number(dec.args[0] as bigint);
    const positions = state.locks[from] ?? [];
    const principal = positions[lockId] ?? 0n;
    if (principal > 0n) {
      positions[lockId] = 0n; // mark withdrawn
      state.lockedPrincipal[from] = (state.lockedPrincipal[from] ?? 0n) - principal;
      // Return the withdrawn principal to the user's BPS balance (the vault releases it).
      const bpsEntry = Object.entries(state.erc20).find(
        ([, v]) => v.allowances[`${from}:${target}`] !== undefined,
      );
      if (bpsEntry) bpsEntry[1].balances[from] = (bpsEntry[1].balances[from] ?? 0n) + principal;
      state.onApplied?.("withdraw", { account: from, vault: target, lockId, principal });
    }
  }
}

/** Core JSON-RPC request handler over the mutable state. Shared by the transport and the EIP-1193 provider. */
export function createRpcRequest(state: MockChainState) {
  return async ({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> => {
    switch (method) {
      case "eth_chainId":
        return `0x${state.chainId.toString(16)}`;
      case "eth_blockNumber":
        return `0x${state.blockNumber.toString(16)}`;
      case "eth_accounts":
      case "eth_requestAccounts":
        return state.accounts;
      case "eth_getBlockByNumber":
        return {
          number: `0x${state.blockNumber.toString(16)}`,
          timestamp: "0x0",
          hash: `0x${"1".repeat(64)}`,
        };
      case "eth_getTransactionCount":
        return "0x0";
      case "eth_gasPrice":
      case "eth_maxPriorityFeePerGas":
        return "0x3b9aca00";
      case "eth_estimateGas":
        return "0x5208";
      case "wallet_switchEthereumChain": {
        if (state.switchChainRejects) {
          const err = new Error("user rejected chain switch") as Error & { code: number };
          err.code = 4001;
          throw err;
        }
        const requested = (params as [{ chainId?: string }])[0]?.chainId;
        state.chainId = requested ? Number(BigInt(requested)) : ROBINHOOD_CHAIN_ID;
        return null;
      }
      case "eth_sendTransaction": {
        if (state.sendRejects) {
          const err = new Error("user rejected transaction") as Error & { code: number };
          err.code = 4001;
          throw err;
        }
        const tx = (params as [{ to?: string; data?: string }])[0];
        applySend(state, tx?.to, tx?.data);
        return nextHash(state);
      }
      case "eth_sendRawTransaction": {
        if (state.sendRejects) throw new Error("user rejected transaction");
        try {
          const parsed = parseTransaction((params as [`0x${string}`])[0]);
          applySend(state, parsed.to ?? undefined, parsed.data ?? undefined);
        } catch {
          /* opaque raw tx: no state mutation */
        }
        return nextHash(state);
      }
      case "eth_getTransactionReceipt": {
        const hash = (params as [string])[0];
        return {
          status: state.receiptReverts ? "0x0" : "0x1",
          transactionHash: hash,
          blockNumber: "0x1", // low block so any reasonable confirmation depth resolves against the head
          blockHash: `0x${"1".repeat(64)}`,
          contractAddress: null,
          logs: [],
          gasUsed: "0x5208",
          cumulativeGasUsed: "0x5208",
          type: "0x2",
          effectiveGasPrice: "0x3b9aca00",
        };
      }
      case "eth_getCode": {
        const addr = String((params as string[])?.[0] ?? "").toLowerCase();
        return state.code[addr] ? "0x60006000f3" : "0x";
      }
      case "eth_getLogs": {
        // Respect the fromBlock/toBlock/address filter so confirmation-depth and range windowing are
        // genuinely enforced end-to-end (the caller never receives logs outside the requested window).
        const filter = (params as [Record<string, unknown> | undefined])?.[0] ?? {};
        const parseBlock = (v: unknown): bigint | null =>
          typeof v === "string" && v.startsWith("0x") ? BigInt(v) : null;
        const from = parseBlock(filter.fromBlock);
        const to = parseBlock(filter.toBlock);
        const addr = typeof filter.address === "string" ? filter.address.toLowerCase() : undefined;
        return (state.logs as { blockNumber?: string; address?: string }[]).filter((log) => {
          const bn = parseBlock(log.blockNumber);
          if (from !== null && bn !== null && bn < from) return false;
          if (to !== null && bn !== null && bn > to) return false;
          if (addr && typeof log.address === "string" && log.address.toLowerCase() !== addr)
            return false;
          return true;
        });
      }
      case "eth_call":
        return handleCall(state, params as [{ to: string; data: string }, ...unknown[]]);
      default:
        return null;
    }
  };
}

/** Build a viem `custom` transport over the given mutable state (used by the read services + tests). */
export function mockTransport(state: MockChainState): Transport {
  return custom({ request: createRpcRequest(state) });
}

function handleCall(
  state: MockChainState,
  params: [{ to: string; data: string }, ...unknown[]],
): string {
  const call = params[0];
  const to = String(call.to).toLowerCase();
  const data = String(call.data);
  const s = sel(data);

  // Aggregator / oracle reads (address-agnostic).
  if (s === sel(AGG_LATEST)) {
    return encodeFunctionResult({
      abi: [
        {
          type: "function",
          name: "latestRoundData",
          outputs: [
            { name: "roundId", type: "uint80" },
            { name: "answer", type: "int256" },
            { name: "startedAt", type: "uint256" },
            { name: "updatedAt", type: "uint256" },
            { name: "answeredInRound", type: "uint80" },
          ],
          stateMutability: "view",
          inputs: [],
        },
      ],
      functionName: "latestRoundData",
      result: [1n, 200_00000000n, 0n, state.blockNumber, 1n],
    });
  }
  if (s === sel(ORACLE_PAUSED)) {
    return encodeFunctionResult({
      abi: [
        {
          type: "function",
          name: "oraclePaused",
          outputs: [{ type: "bool" }],
          stateMutability: "view",
          inputs: [],
        },
      ],
      functionName: "oraclePaused",
      result: false,
    });
  }

  // ERC-20 reads.
  const token = state.erc20[to];
  if (token) {
    if (s === sel(AGG_DECIMALS)) {
      return encodeFunctionResult({
        abi: erc20Abi,
        functionName: "decimals",
        result: token.decimals,
      });
    }
    const decoded = decodeFunctionData({ abi: erc20Abi, data: data as `0x${string}` });
    if (decoded.functionName === "balanceOf") {
      const owner = String(decoded.args[0]).toLowerCase();
      return encodeFunctionResult({
        abi: erc20Abi,
        functionName: "balanceOf",
        result: token.balances[owner] ?? 0n,
      });
    }
    if (decoded.functionName === "allowance") {
      const key = `${String(decoded.args[0]).toLowerCase()}:${String(decoded.args[1]).toLowerCase()}`;
      return encodeFunctionResult({
        abi: erc20Abi,
        functionName: "allowance",
        result: token.allowances[key] ?? 0n,
      });
    }
  }

  // Router paused / simulate.
  if (s === sel(toFunctionSelector("paused()"))) {
    return encodeFunctionResult({
      abi: bpsTradeRouterAbi,
      functionName: "paused",
      result: state.routerPaused,
    });
  }
  if (
    s === sel(toFunctionSelector("buyExactWethForBps(uint256,uint256,uint256,address,uint256)"))
  ) {
    if (state.revertOnSimulate) throw new Error("execution reverted: simulation failed");
    return encodeFunctionResult({
      abi: bpsTradeRouterAbi,
      functionName: "buyExactWethForBps",
      result: [0n, 0n],
    });
  }
  if (
    s ===
    sel(toFunctionSelector("sellExactBpsForWeth(uint256,uint256,uint256,uint256,address,uint256)"))
  ) {
    if (state.revertOnSimulate) throw new Error("execution reverted: simulation failed");
    return encodeFunctionResult({
      abi: bpsTradeRouterAbi,
      functionName: "sellExactBpsForWeth",
      result: [0n, 0n, 0n],
    });
  }

  // Locking vault: totalLockedPrincipal(), lockedPrincipal(addr), policyMultiplierBps(uint32).
  if (s === sel(toFunctionSelector("totalLockedPrincipal()"))) {
    const total = Object.values(state.lockedPrincipal).reduce((a, b) => a + b, 0n);
    return encodeFunctionResult({
      abi: bpsLockingVaultAbi,
      functionName: "totalLockedPrincipal",
      result: total,
    });
  }
  if (s === sel(toFunctionSelector("lockedPrincipal(address)"))) {
    const dec = decodeFunctionData({
      abi: [
        {
          type: "function",
          name: "lockedPrincipal",
          stateMutability: "view",
          inputs: [{ type: "address" }],
          outputs: [{ type: "uint256" }],
        },
      ] as const,
      data: data as `0x${string}`,
    });
    const acct = String(dec.args[0]).toLowerCase();
    return encodeFunctionResult({
      abi: [
        {
          type: "function",
          name: "lockedPrincipal",
          stateMutability: "view",
          inputs: [{ type: "address" }],
          outputs: [{ type: "uint256" }],
        },
      ] as const,
      functionName: "lockedPrincipal",
      result: state.lockedPrincipal[acct] ?? 0n,
    });
  }

  // Claim manager: remaining(uint256,address), claim simulate.
  if (s === sel(toFunctionSelector("remaining(uint256,address)"))) {
    const dec = decodeFunctionData({
      abi: distributionClaimManagerAbi,
      data: data as `0x${string}`,
    });
    const key = `${String(dec.args[0])}:${String(dec.args[1]).toLowerCase()}`;
    return encodeFunctionResult({
      abi: distributionClaimManagerAbi,
      functionName: "remaining",
      result: state.claimRemaining[key] ?? 0n,
    });
  }
  if (s === sel(CLAIM)) {
    const dec = decodeFunctionData({
      abi: distributionClaimManagerAbi,
      data: data as `0x${string}`,
    });
    const from = String(state.accounts[0] ?? "").toLowerCase();
    const key = `${String(dec.args[0])}::${from}`;
    if (state.claimed[key] || state.revertOnSimulate) {
      throw new Error("execution reverted: already claimed or invalid");
    }
    return "0x";
  }

  // Locking vault: lockCount(address).
  if (s === sel(toFunctionSelector("lockCount(address)"))) {
    const dec = decodeFunctionData({ abi: bpsLockingVaultAbi, data: data as `0x${string}` });
    const acct = String(dec.args[0]).toLowerCase();
    return encodeFunctionResult({
      abi: bpsLockingVaultAbi,
      functionName: "lockCount",
      result: BigInt((state.locks[acct] ?? []).length),
    });
  }

  // Claim manager authoritative cycle state: cycles(), assetFunding(), claimed().
  if (s === sel(toFunctionSelector("cycles(uint256)"))) {
    const dec = decodeFunctionData({
      abi: distributionClaimManagerAbi,
      data: data as `0x${string}`,
    });
    const cyc = String(dec.args[0]);
    const root = state.cycleRoot[cyc] ?? (`0x${"0".repeat(64)}` as `0x${string}`);
    const published = state.cyclePublished[cyc] ?? false;
    return encodeFunctionResult({
      abi: distributionClaimManagerAbi,
      functionName: "cycles",
      result: [root, `0x${"0".repeat(64)}`, `0x${"0".repeat(64)}`, 0n, 4_000_000_000n, published],
    });
  }
  if (s === sel(toFunctionSelector("assetFunding(uint256,address)"))) {
    const dec = decodeFunctionData({
      abi: distributionClaimManagerAbi,
      data: data as `0x${string}`,
    });
    const cyc = String(dec.args[0]);
    const asset = String(dec.args[1]).toLowerCase();
    const funded = state.assetFunded[`${cyc}:${asset}`] ?? 0n;
    const remaining = state.claimRemaining[`${cyc}:${asset}`] ?? funded;
    const claimedAmt = funded > remaining ? funded - remaining : 0n;
    return encodeFunctionResult({
      abi: distributionClaimManagerAbi,
      functionName: "assetFunding",
      result: [funded > 0n, funded, claimedAmt, 0n, false],
    });
  }
  if (s === sel(toFunctionSelector("claimed(uint256,address,address)"))) {
    const dec = decodeFunctionData({
      abi: distributionClaimManagerAbi,
      data: data as `0x${string}`,
    });
    const cyc = String(dec.args[0]);
    const claimant = String(dec.args[1]).toLowerCase();
    return encodeFunctionResult({
      abi: distributionClaimManagerAbi,
      functionName: "claimed",
      result: state.claimed[`${cyc}::${claimant}`] ?? false,
    });
  }

  // Coordinator authoritative acquisition record: acquisitions(), cycleUsed(), cycleAcquisitionId().
  if (s === sel(toFunctionSelector("acquisitions(uint256)"))) {
    const a = state.acquisition;
    return encodeFunctionResult({
      abi: distributionFundingCoordinatorAbi,
      functionName: "acquisitions",
      result: a
        ? [
            a.status,
            a.stockToken as `0x${string}`,
            a.wethSpent,
            a.acquiredStock,
            a.distributionAmount,
            a.reserveAmount,
            a.cycleId,
          ]
        : [0, ZERO_ADDR, 0n, 0n, 0n, 0n, 0n],
    });
  }
  if (s === sel(toFunctionSelector("cycleUsed(uint256)"))) {
    const used = !!state.acquisition && state.acquisition.cycleId !== 0n;
    return encodeFunctionResult({
      abi: distributionFundingCoordinatorAbi,
      functionName: "cycleUsed",
      result: used,
    });
  }
  if (s === sel(toFunctionSelector("cycleAcquisitionId(uint256)"))) {
    return encodeFunctionResult({
      abi: distributionFundingCoordinatorAbi,
      functionName: "cycleAcquisitionId",
      result: state.acquisition ? 1n : 0n,
    });
  }

  // approve / createLock / withdraw simulate.
  if (s === sel(APPROVE)) return "0x";
  if (s === sel(CREATE_LOCK)) {
    if (state.revertOnSimulate) throw new Error("execution reverted: lock failed");
    return encodeFunctionResult({
      abi: bpsLockingVaultAbi,
      functionName: "createLock",
      result: 0n,
    });
  }
  if (s === sel(toFunctionSelector("withdraw(uint256)"))) return "0x";

  // Generic decimals() on a non-ERC20 address (a Chainlink feed) -> 8.
  if (s === sel(AGG_DECIMALS)) {
    return encodeFunctionResult({
      abi: [
        {
          type: "function",
          name: "decimals",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "uint8" }],
        },
      ] as const,
      functionName: "decimals",
      result: 8,
    });
  }

  return "0x";
}
