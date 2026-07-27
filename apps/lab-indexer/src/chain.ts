// Chain access: HTTP-only polling (no WebSocket), Doppler addresses, and
// event decoding for the two indexed streams.

import {
  createPublicClient,
  http,
  defineChain,
  getAddress,
  parseAbiItem,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";
import {
  airlockAbi,
  dopplerHookInitializerAbi,
  CHAIN_IDS,
  getAddresses,
} from "@whetstone-research/doppler-sdk/evm";
import { computePoolId, normalizePoolKey } from "@whetstone-research/doppler-sdk/evm";

/** Canonical GOOGL — must match packages/launch-lab/src/config (kept in sync by test). */
export const GOOGL_ADDRESS: Address = getAddress("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3");

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
});

/** Canonical Uniswap v4-core PoolManager Swap event (not exported by the SDK). */
export const SWAP_EVENT = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
);

export const CREATE_EVENT = airlockAbi.find(
  (x): x is Extract<(typeof airlockAbi)[number], { type: "event"; name: "Create" }> =>
    x.type === "event" && (x as { name?: string }).name === "Create",
)!;

export interface LabAddresses {
  airlock: Address;
  dopplerHookInitializer: Address;
  poolManager: Address;
}

export function labAddresses(): LabAddresses {
  const a = getAddresses(CHAIN_IDS.ROBINHOOD) as unknown as Record<string, Address>;
  const airlock = a.airlock;
  const initializer = a.dopplerHookInitializer;
  const poolManager = a.poolManager;
  if (!airlock || !initializer || !poolManager) {
    throw new Error("Doppler addresses for 4663 are incomplete in the SDK registry.");
  }
  return { airlock, dopplerHookInitializer: initializer, poolManager };
}

export function makeClient(rpcUrl: string): PublicClient {
  // HTTP transport only — polling works without any WSS endpoint.
  return createPublicClient({ chain: robinhood, transport: http(rpcUrl, { timeout: 15_000 }) });
}

export interface DecodedLaunch {
  tokenAddress: Address;
  numeraire: Address;
  initializer: Address;
  poolOrHook: Address;
  blockNumber: bigint;
  txHash: Hex;
}

/** Type guard + filter: only OUR lab's launches (GOOGL + DopplerHookInitializer). */
export function decodeLaunchLog(log: Log, expectedInitializer: Address): DecodedLaunch | null {
  const args = (log as unknown as { args?: Record<string, unknown> }).args;
  if (!args) return null;
  const numeraire = args.numeraire as Address | undefined;
  const initializer = args.initializer as Address | undefined;
  const asset = args.asset as Address | undefined;
  const poolOrHook = args.poolOrHook as Address | undefined;
  if (!numeraire || !initializer || !asset || !poolOrHook) return null;
  if (numeraire.toLowerCase() !== GOOGL_ADDRESS.toLowerCase()) return null;
  if (initializer.toLowerCase() !== expectedInitializer.toLowerCase()) return null;
  if (log.blockNumber === null || !log.transactionHash) return null;
  return {
    tokenAddress: getAddress(asset),
    numeraire: getAddress(numeraire),
    initializer: getAddress(initializer),
    poolOrHook: getAddress(poolOrHook),
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
  };
}

/** Resolve the v4 poolId for a launched asset via the initializer's getState. */
export async function resolvePoolId(
  client: PublicClient,
  initializer: Address,
  asset: Address,
): Promise<Hex | null> {
  try {
    const state = (await client.readContract({
      address: initializer,
      abi: dopplerHookInitializerAbi,
      functionName: "getState",
      args: [asset],
    })) as unknown as readonly unknown[];
    // outputs: numeraire, totalTokensOnBondingCurve, dopplerHook, calldata, status, poolKey, farTick
    const poolKey = normalizePoolKey(state[5]);
    return computePoolId(poolKey);
  } catch {
    return null;
  }
}
