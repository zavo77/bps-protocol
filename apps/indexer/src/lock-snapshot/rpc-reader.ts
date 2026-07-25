// TASK 10G-1 — strictly read-only RPC ChainReader.
//
// Capabilities used: eth_chainId, eth_getBlockByNumber, eth_getCode, eth_getLogs, eth_call (with
// an explicit pinned block). NOTHING here can sign, send, or mutate: no wallet client, no key
// material, no eth_sendTransaction / eth_sendRawTransaction. The RPC URL comes from the caller
// (environment) and is never logged or embedded in artifacts.

import {
  createPublicClient,
  decodeEventLog,
  encodeFunctionData,
  http,
  parseAbi,
  type PublicClient,
} from "viem";
import type { ChainReader, LockCreatedRecord, LockWithdrawnRecord } from "./types.js";
import { SnapshotPipelineError } from "./types.js";

const VAULT_ABI = parseAbi([
  "event LockCreated(address indexed account, uint256 indexed lockId, uint256 principal, uint64 startTime, uint32 duration, uint64 unlockTime, uint16 multiplierBps, uint16 policyVersion)",
  "event LockWithdrawn(address indexed account, uint256 indexed lockId, uint256 principal, uint64 withdrawnAt, bool emergency)",
  "function lockCount(address account) view returns (uint256)",
  "function positionWeightAt(address account, uint256 lockId, uint256 timestamp) view returns (uint256)",
]);
const MANAGER_ABI = parseAbi([
  "function leafFor(uint256 cycleId, address claimant, address asset, uint256 amount) view returns (bytes32)",
]);

const LOG_CHUNK = 45_000n; // conservative provider-safe getLogs window

export class RpcChainReader implements ChainReader {
  private readonly client: PublicClient;
  private readonly logsClient: PublicClient;
  private logsEndpointVerified = false;

  /**
   * @param rpcUrl        archival endpoint for pinned state reads (eth_call/getCode/getBlock)
   * @param logsRpcUrl    optional wide-range endpoint used ONLY for eth_getLogs scans (some
   *                      archival providers cap getLogs ranges); both endpoints are chain-id
   *                      verified against each other before any scan result is trusted
   */
  constructor(
    rpcUrl: string,
    private readonly vault: `0x${string}`,
    private readonly manager: `0x${string}`,
    private readonly pinBlock: bigint,
    logsRpcUrl?: string,
  ) {
    this.client = createPublicClient({ transport: http(rpcUrl) });
    this.logsClient =
      logsRpcUrl === undefined || logsRpcUrl === ""
        ? this.client
        : createPublicClient({ transport: http(logsRpcUrl) });
  }

  async chainId(): Promise<bigint> {
    return BigInt(await this.client.getChainId());
  }

  private async assertLogsEndpointChain(): Promise<void> {
    if (this.logsEndpointVerified) return;
    const [a, b] = await Promise.all([this.client.getChainId(), this.logsClient.getChainId()]);
    if (a !== b) {
      throw new SnapshotPipelineError(
        "LOGS_ENDPOINT_CHAIN_MISMATCH",
        `logs endpoint chain ${b} != primary chain ${a}`,
      );
    }
    // Same chain id is not enough: both endpoints must agree on the PINNED block hash before any
    // scan result is combined with pinned state reads (divergent-history protection).
    if (this.logsClient !== this.client) {
      const [ph, lh] = await Promise.all([
        this.client.getBlock({ blockNumber: this.pinBlock }),
        this.logsClient.getBlock({ blockNumber: this.pinBlock }),
      ]);
      if (ph.hash.toLowerCase() !== lh.hash.toLowerCase()) {
        throw new SnapshotPipelineError(
          "LOGS_ENDPOINT_HASH_MISMATCH",
          `logs endpoint block ${this.pinBlock} hash ${lh.hash} != primary ${ph.hash}`,
        );
      }
    }
    this.logsEndpointVerified = true;
  }

  async block(blockNumber: bigint): Promise<{ hash: string; timestamp: bigint } | null> {
    try {
      const b = await this.client.getBlock({ blockNumber });
      return { hash: b.hash, timestamp: b.timestamp };
    } catch {
      return null;
    }
  }

  async vaultHasCodeAt(blockNumber: bigint): Promise<boolean> {
    if (blockNumber < 0n) return false;
    const code = await this.client.getCode({ address: this.vault, blockNumber });
    return code !== undefined && code !== "0x";
  }

  private async scan<T>(
    from: bigint,
    to: bigint,
    eventName: "LockCreated" | "LockWithdrawn",
    map: (args: Record<string, unknown>, blockNumber: bigint, logIndex: number) => T,
  ): Promise<readonly T[]> {
    await this.assertLogsEndpointChain();
    const out: T[] = [];
    for (let start = from; start <= to; start += LOG_CHUNK + 1n) {
      const end = start + LOG_CHUNK > to ? to : start + LOG_CHUNK;
      const logs = await this.logsClient.getLogs({
        address: this.vault,
        fromBlock: start,
        toBlock: end,
      });
      for (const log of logs) {
        let decoded;
        try {
          decoded = decodeEventLog({ abi: VAULT_ABI, data: log.data, topics: log.topics });
        } catch {
          continue; // non-matching vault event
        }
        if (decoded.eventName !== eventName) continue;
        if (log.blockNumber === null || log.logIndex === null) {
          throw new SnapshotPipelineError(
            "PENDING_LOG",
            "log without block number in a pinned scan",
          );
        }
        out.push(map(decoded.args as Record<string, unknown>, log.blockNumber, log.logIndex));
      }
    }
    return out;
  }

  lockCreated(from: bigint, to: bigint): Promise<readonly LockCreatedRecord[]> {
    return this.scan(from, to, "LockCreated", (a, blockNumber, logIndex) => ({
      account: a.account as string,
      lockId: a.lockId as bigint,
      blockNumber,
      logIndex,
    }));
  }

  lockWithdrawn(from: bigint, to: bigint): Promise<readonly LockWithdrawnRecord[]> {
    return this.scan(from, to, "LockWithdrawn", (a, blockNumber, logIndex) => ({
      account: a.account as string,
      lockId: a.lockId as bigint,
      blockNumber,
      logIndex,
    }));
  }

  private async pinnedCall(to: `0x${string}`, data: `0x${string}`): Promise<`0x${string}`> {
    const res = await this.client.call({ to, data, blockNumber: this.pinBlock });
    if (res.data === undefined) {
      throw new SnapshotPipelineError(
        "HISTORICAL_STATE_UNAVAILABLE",
        `pinned call to ${to} returned no data`,
      );
    }
    return res.data;
  }

  async lockCountAt(account: string, blockNumber: bigint): Promise<bigint> {
    if (blockNumber !== this.pinBlock) {
      throw new SnapshotPipelineError("UNPINNED_READ", "lockCountAt must use the pinned block");
    }
    const data = encodeFunctionData({
      abi: VAULT_ABI,
      functionName: "lockCount",
      args: [account as `0x${string}`],
    });
    return BigInt(await this.pinnedCall(this.vault, data));
  }

  async positionWeightAt(
    account: string,
    lockId: bigint,
    timestamp: bigint,
    blockNumber: bigint,
  ): Promise<bigint> {
    if (blockNumber !== this.pinBlock) {
      throw new SnapshotPipelineError(
        "UNPINNED_READ",
        "positionWeightAt must use the pinned block",
      );
    }
    const data = encodeFunctionData({
      abi: VAULT_ABI,
      functionName: "positionWeightAt",
      args: [account as `0x${string}`, lockId, timestamp],
    });
    return BigInt(await this.pinnedCall(this.vault, data));
  }

  async leafFor(
    cycleId: bigint,
    claimant: string,
    asset: string,
    amount: bigint,
    blockNumber: bigint,
  ): Promise<string> {
    if (blockNumber !== this.pinBlock) {
      throw new SnapshotPipelineError("UNPINNED_READ", "leafFor must use the pinned block");
    }
    const data = encodeFunctionData({
      abi: MANAGER_ABI,
      functionName: "leafFor",
      args: [cycleId, claimant as `0x${string}`, asset as `0x${string}`, amount],
    });
    return await this.pinnedCall(this.manager, data);
  }

  async syncedThrough(): Promise<bigint> {
    // Stateless scan model: this reader scans live history up to the pinned block on every run,
    // so its synchronization height is the chain head observed at run time. A persistent-DB
    // indexer (INF-1) would report its own committed height here instead.
    return await this.client.getBlockNumber();
  }
}
