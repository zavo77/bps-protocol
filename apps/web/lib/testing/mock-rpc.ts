// Deterministic in-memory mock JSON-RPC transport (Task 8B, local/testing only). It backs a viem client
// and the wagmi mock connector so the ENTIRE flow — reads, simulation, approval, submission, receipt —
// works offline against fixed state, never touching a live chain. It is clearly local: it is only wired
// in local/fixture mode and never mixed with a live http transport. No key material; the "submit" step
// returns a deterministic fake hash and a success receipt.
import {
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  parseTransaction,
  toFunctionSelector,
  type Transport,
} from "viem";
import { bpsTradeRouterAbi, bpsLockingVaultAbi, distributionClaimManagerAbi } from "../abis";
import { ROBINHOOD_CHAIN_ID } from "../chain";

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
  claimed: Record<string, boolean>; // `${cycleId}:${claimantLower}:${assetLower}`
  logs: unknown[];
  switchChainRejects: boolean;
  sendRejects: boolean;
  revertOnSimulate: boolean;
}

const AGG_LATEST = toFunctionSelector("latestRoundData()");
const AGG_DECIMALS = toFunctionSelector("decimals()");
const ORACLE_PAUSED = toFunctionSelector("oraclePaused()");

function sel(data: string): string {
  return data.slice(0, 10).toLowerCase();
}

function abiFor(to: string, state: MockChainState): readonly unknown[] | null {
  const a = to.toLowerCase();
  if (state.erc20[a]) return erc20Abi as unknown as readonly unknown[];
  return null;
}

/** Build a viem `custom` transport over the given mutable state. */
export function mockTransport(state: MockChainState): Transport {
  const request = async ({
    method,
    params,
  }: {
    method: string;
    params?: unknown[];
  }): Promise<unknown> => {
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
        return "0x3b9aca00";
      case "eth_maxPriorityFeePerGas":
        return "0x3b9aca00";
      case "eth_estimateGas":
        return "0x5208";
      case "wallet_switchEthereumChain":
        if (state.switchChainRejects) throw new Error("user rejected chain switch");
        state.chainId = ROBINHOOD_CHAIN_ID;
        return null;
      case "eth_sendTransaction": {
        if (state.sendRejects) throw new Error("user rejected transaction");
        const tx = (params as [{ to?: string; data?: string }])[0];
        applySend(state, tx?.to, tx?.data);
        return `0x${"ab".repeat(32)}`;
      }
      case "eth_sendRawTransaction": {
        if (state.sendRejects) throw new Error("user rejected transaction");
        try {
          const parsed = parseTransaction((params as [`0x${string}`])[0]);
          applySend(state, parsed.to ?? undefined, parsed.data ?? undefined);
        } catch {
          /* opaque raw tx: no state mutation */
        }
        return `0x${"ab".repeat(32)}`;
      }
      case "eth_getTransactionReceipt":
        return {
          status: "0x1",
          transactionHash: `0x${"ab".repeat(32)}`,
          blockNumber: "0x1", // low block so any reasonable confirmation depth resolves against the head
          blockHash: `0x${"1".repeat(64)}`,
          contractAddress: null,
          logs: [],
          gasUsed: "0x5208",
          cumulativeGasUsed: "0x5208",
          type: "0x2",
          effectiveGasPrice: "0x3b9aca00",
        };
      case "eth_getCode": {
        const addr = String((params as string[])?.[0] ?? "").toLowerCase();
        return state.code[addr] ? "0x60006000f3" : "0x";
      }
      case "eth_getLogs":
        return state.logs;
      case "eth_call":
        return handleCall(state, params as [{ to: string; data: string }, ...unknown[]]);
      default:
        return null;
    }
  };
  return custom({ request });
}

/** Apply state mutations for a submitted tx (approve updates allowance; claim marks claimed). The sole
 *  sender is state.accounts[0] (the mock has one account). */
function applySend(state: MockChainState, to?: string, data?: string): void {
  if (!to || !data) return;
  const target = to.toLowerCase();
  const from = String(state.accounts[0] ?? "").toLowerCase();
  const s = sel(data);
  if (state.erc20[target] && s === sel(toFunctionSelector("approve(address,uint256)"))) {
    const dec = decodeFunctionData({ abi: erc20Abi, data: data as `0x${string}` });
    if (dec.functionName === "approve") {
      const spender = String(dec.args[0]).toLowerCase();
      state.erc20[target]!.allowances[`${from}:${spender}`] = dec.args[1] as bigint;
    }
  }
  if (s === sel(toFunctionSelector("claim(uint256,address,uint256,bytes32[])"))) {
    const dec = decodeFunctionData({
      abi: distributionClaimManagerAbi,
      data: data as `0x${string}`,
    });
    state.claimed[`${String(dec.args[0])}::${String(dec.args[1]).toLowerCase()}`] = true;
  }
}

function handleCall(
  state: MockChainState,
  params: [{ to: string; data: string }, ...unknown[]],
): string {
  const call = params[0];
  const to = String(call.to).toLowerCase();
  const data = String(call.data);
  const s = sel(data);

  // Aggregator / oracle reads (address-agnostic; used by feed + sequencer + stock token).
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

  // Claim manager remaining / claim simulate.
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
  if (s === sel(toFunctionSelector("claim(uint256,address,uint256,bytes32[])"))) {
    const dec = decodeFunctionData({
      abi: distributionClaimManagerAbi,
      data: data as `0x${string}`,
    });
    const key = `${String(dec.args[0])}::${String(dec.args[1]).toLowerCase()}`;
    if (state.claimed[key] || state.revertOnSimulate)
      throw new Error("execution reverted: already claimed or invalid");
    return "0x";
  }

  // ERC-20 approve simulate.
  if (s === sel(toFunctionSelector("approve(address,uint256)"))) return "0x";
  // createLock / withdraw simulate.
  if (s === sel(toFunctionSelector("createLock(uint256,uint32)"))) {
    return encodeFunctionResult({
      abi: bpsLockingVaultAbi,
      functionName: "createLock",
      result: 0n,
    });
  }
  if (s === sel(toFunctionSelector("withdraw(uint256)"))) return "0x";

  // Unknown read: fail closed with empty (callers treat as malformed).
  void abiFor(to, state);
  return "0x";
}
