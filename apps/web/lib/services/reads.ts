// Contract-read service (Task 8B §D). Thin, testable wrappers over a viem PublicClient (transport is
// injected by the caller: an http transport for live, or a mock transport in tests/local). Every entry
// fails closed on wrong chain / missing code / RPC failure. It never writes, signs, or broadcasts.
import { erc20Abi, type Address, type Hex, type PublicClient } from "viem";
import {
  bpsLockingVaultAbi,
  bpsTradeRouterAbi,
  distributionClaimManagerAbi,
  distributionFundingCoordinatorAbi,
} from "../abis";
import { ROBINHOOD_CHAIN_ID } from "../chain";

export class WrongChainError extends Error {
  constructor(readonly actual: number) {
    super(`wrong chain ${actual} (expected ${ROBINHOOD_CHAIN_ID})`);
  }
}
export class MissingCodeError extends Error {
  constructor(readonly address: string) {
    super(`no runtime code at ${address}`);
  }
}
export class ReadFailedError extends Error {
  constructor(what: string, cause?: unknown) {
    super(`read failed: ${what}`);
    this.cause = cause;
  }
}

/** Assert the client is on chain 4663 and every required address has runtime code. Fail closed. */
export async function assertReadable(
  client: PublicClient,
  requiredAddresses: readonly Address[],
): Promise<void> {
  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch (e) {
    throw new ReadFailedError("getChainId", e);
  }
  if (chainId !== ROBINHOOD_CHAIN_ID) throw new WrongChainError(chainId);
  for (const a of requiredAddresses) {
    let code: `0x${string}` | undefined;
    try {
      code = await client.getCode({ address: a });
    } catch (e) {
      throw new ReadFailedError(`getCode ${a}`, e);
    }
    if (!code || code === "0x") throw new MissingCodeError(a);
  }
}

export interface Erc20Snapshot {
  readonly balance: bigint;
  readonly decimals: number;
  readonly allowance: bigint;
}

export async function readErc20(
  client: PublicClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<Erc20Snapshot> {
  try {
    const [balance, decimals, allowance] = await Promise.all([
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      }),
      client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
      }),
    ]);
    return { balance, decimals, allowance };
  } catch (e) {
    throw new ReadFailedError(`erc20 ${token}`, e);
  }
}

export async function readRouterPaused(client: PublicClient, router: Address): Promise<boolean> {
  try {
    return await client.readContract({
      address: router,
      abi: bpsTradeRouterAbi,
      functionName: "paused",
    });
  } catch (e) {
    throw new ReadFailedError("router.paused", e);
  }
}

export async function readLockedPrincipal(
  client: PublicClient,
  vault: Address,
  account: Address,
): Promise<bigint> {
  try {
    return await client.readContract({
      address: vault,
      abi: bpsLockingVaultAbi,
      functionName: "lockedPrincipal",
      args: [account],
    });
  } catch (e) {
    throw new ReadFailedError("vault.lockedPrincipal", e);
  }
}

export async function readClaimRemaining(
  client: PublicClient,
  manager: Address,
  cycleId: bigint,
  asset: Address,
): Promise<bigint> {
  try {
    return await client.readContract({
      address: manager,
      abi: distributionClaimManagerAbi,
      functionName: "remaining",
      args: [cycleId, asset],
    });
  } catch (e) {
    throw new ReadFailedError("manager.remaining", e);
  }
}

export async function readLockCount(
  client: PublicClient,
  vault: Address,
  account: Address,
): Promise<bigint> {
  try {
    return await client.readContract({
      address: vault,
      abi: bpsLockingVaultAbi,
      functionName: "lockCount",
      args: [account],
    });
  } catch (e) {
    throw new ReadFailedError("vault.lockCount", e);
  }
}

export interface CycleState {
  readonly merkleRoot: Hex;
  readonly claimStart: bigint;
  readonly claimDeadline: bigint;
  readonly published: boolean;
}

/** Authoritative current cycle state from the claim manager (cycles()) — NOT an event-derived root. */
export async function readCycle(
  client: PublicClient,
  manager: Address,
  cycleId: bigint,
): Promise<CycleState> {
  try {
    const r = await client.readContract({
      address: manager,
      abi: distributionClaimManagerAbi,
      functionName: "cycles",
      args: [cycleId],
    });
    return { merkleRoot: r[0], claimStart: r[3], claimDeadline: r[4], published: r[5] };
  } catch (e) {
    throw new ReadFailedError("manager.cycles", e);
  }
}

export interface AssetFundingState {
  readonly registered: boolean;
  readonly funded: bigint;
  readonly claimed: bigint;
}

/** Authoritative per-cycle/asset funding from the claim manager (assetFunding()). */
export async function readAssetFunding(
  client: PublicClient,
  manager: Address,
  cycleId: bigint,
  asset: Address,
): Promise<AssetFundingState> {
  try {
    const r = await client.readContract({
      address: manager,
      abi: distributionClaimManagerAbi,
      functionName: "assetFunding",
      args: [cycleId, asset],
    });
    return { registered: r[0], funded: r[1], claimed: r[2] };
  } catch (e) {
    throw new ReadFailedError("manager.assetFunding", e);
  }
}

/** Authoritative per-(cycle,claimant,asset) claim-used flag from the claim manager (claimed()). */
export async function readClaimUsed(
  client: PublicClient,
  manager: Address,
  cycleId: bigint,
  claimant: Address,
  asset: Address,
): Promise<boolean> {
  try {
    return await client.readContract({
      address: manager,
      abi: distributionClaimManagerAbi,
      functionName: "claimed",
      args: [cycleId, claimant, asset],
    });
  } catch (e) {
    throw new ReadFailedError("manager.claimed", e);
  }
}

export interface AcquisitionRecord {
  readonly status: number;
  readonly stockToken: Address;
  readonly wethSpent: bigint;
  readonly acquiredStock: bigint;
  readonly distributionAmount: bigint;
  readonly reserveAmount: bigint;
  readonly cycleId: bigint;
}

/** Authoritative acquisition record from the coordinator (acquisitions()). */
export async function readAcquisition(
  client: PublicClient,
  coordinator: Address,
  acquisitionId: bigint,
): Promise<AcquisitionRecord> {
  try {
    const r = await client.readContract({
      address: coordinator,
      abi: distributionFundingCoordinatorAbi,
      functionName: "acquisitions",
      args: [acquisitionId],
    });
    return {
      status: Number(r[0]),
      stockToken: r[1],
      wethSpent: r[2],
      acquiredStock: r[3],
      distributionAmount: r[4],
      reserveAmount: r[5],
      cycleId: r[6],
    };
  } catch (e) {
    throw new ReadFailedError("coordinator.acquisitions", e);
  }
}

/** Authoritative "has this cycle already consumed an acquisition?" flag (coordinator.cycleUsed()). */
export async function readCycleUsed(
  client: PublicClient,
  coordinator: Address,
  cycleId: bigint,
): Promise<boolean> {
  try {
    return await client.readContract({
      address: coordinator,
      abi: distributionFundingCoordinatorAbi,
      functionName: "cycleUsed",
      args: [cycleId],
    });
  } catch (e) {
    throw new ReadFailedError("coordinator.cycleUsed", e);
  }
}

/** Authoritative acquisition id bound to a cycle (coordinator.cycleAcquisitionId()); 0 if unbound. */
export async function readCycleAcquisitionId(
  client: PublicClient,
  coordinator: Address,
  cycleId: bigint,
): Promise<bigint> {
  try {
    return await client.readContract({
      address: coordinator,
      abi: distributionFundingCoordinatorAbi,
      functionName: "cycleAcquisitionId",
      args: [cycleId],
    });
  } catch (e) {
    throw new ReadFailedError("coordinator.cycleAcquisitionId", e);
  }
}

export async function readLeaf(
  client: PublicClient,
  manager: Address,
  cycleId: bigint,
  claimant: Address,
  asset: Address,
  amount: bigint,
): Promise<`0x${string}`> {
  try {
    return await client.readContract({
      address: manager,
      abi: distributionClaimManagerAbi,
      functionName: "leafFor",
      args: [cycleId, claimant, asset, amount],
    });
  } catch (e) {
    throw new ReadFailedError("manager.leafFor", e);
  }
}

export interface RawLog {
  readonly transactionHash: string | null;
  readonly logIndex: number | null;
  readonly blockNumber: bigint | null;
  readonly args?: Record<string, unknown>;
}

/** Dedupe logs by (txHash, logIndex); logs missing either are kept but not treated as duplicates. */
export function dedupeLogs<T extends RawLog>(logs: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const l of logs) {
    if (l.transactionHash === null || l.logIndex === null) {
      out.push(l);
      continue;
    }
    const key = `${l.transactionHash.toLowerCase()}:${l.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

const COORD_EVENTS = distributionFundingCoordinatorAbi.filter((x) => x.type === "event");
const ROUTER_EVENTS = bpsTradeRouterAbi.filter((x) => x.type === "event");

/**
 * Bounded, chunked log retrieval from `fromBlock`..`toBlock` in `chunkSize` windows, respecting a
 * confirmation depth (never reads past `head - confirmations`). Deduplicates the result. Fails closed on
 * RPC error. `client.getLogs` is called per chunk with the provided event ABIs.
 */
export async function getLogsChunked(
  client: PublicClient,
  params: {
    readonly address: Address;
    readonly events?: readonly unknown[];
    readonly fromBlock: bigint;
    readonly headBlock: bigint;
    readonly confirmations: bigint;
    readonly chunkSize: bigint;
  },
): Promise<RawLog[]> {
  const safeHead = params.headBlock - params.confirmations;
  if (safeHead < params.fromBlock) return [];
  const all: RawLog[] = [];
  for (let start = params.fromBlock; start <= safeHead; start += params.chunkSize) {
    const end = start + params.chunkSize - 1n > safeHead ? safeHead : start + params.chunkSize - 1n;
    let logs: unknown[];
    try {
      // Fetch RAW logs (no `events`) so the caller's decoder controls ABI matching; viem still formats
      // wire fields (hex → bigint block number, etc.).
      logs = (await client.getLogs({
        address: params.address,
        fromBlock: start,
        toBlock: end,
      })) as unknown[];
    } catch (e) {
      throw new ReadFailedError(`getLogs ${start}-${end}`, e);
    }
    all.push(...(logs as RawLog[]));
  }
  return dedupeLogs(all);
}

export const OFFICIAL_TRADE_EVENTS = ROUTER_EVENTS;
export const COORDINATOR_EVENTS = COORD_EVENTS;
