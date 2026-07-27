// Chain access: HTTP-only polling (no WebSocket), Doppler addresses, and the
// PoolManager Swap event for the swap-indexing stream.

import {
  createPublicClient,
  http,
  defineChain,
  getAddress,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  dopplerHookInitializerAbi,
  CHAIN_IDS,
  getAddresses,
  computePoolId,
  normalizePoolKey,
} from "@whetstone-research/doppler-sdk/evm";
// Local, emitted-JS-safe registry — NEVER import @bps/launch-lab at runtime
// (its TS-source entrypoint breaks plain-Node ESM). See ./anchors.ts.
import { APPROVED_ANCHOR_ADDRESSES, getAnchorByAddress } from "./anchors.js";

/** Canonical GOOGL — kept for the sync test; discovery now spans all anchors. */
export const GOOGL_ADDRESS: Address = getAddress("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3");

export { APPROVED_ANCHOR_ADDRESSES, getAnchorByAddress };

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

// NOTE: the indexer intentionally has NO Airlock-Create classification path.
// A market becomes tracked ONLY by being a provenance-verified BPS row in
// Postgres (see indexer.ts reloadTrackedMarkets). Chain events never classify.

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
