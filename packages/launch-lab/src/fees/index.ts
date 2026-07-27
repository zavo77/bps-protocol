// Creator fee reads + claim-transaction construction. Claimability comes ONLY
// from the contract read `MulticurvePool.getPendingFees(beneficiary)` — never
// inferred from volume. The claim call is `collectFees(poolId)` on the
// DopplerHookInitializer (callable by anyone; releases the caller's configured
// beneficiary share). The connected beneficiary wallet signs it — no server
// signer.

import { encodeFunctionData, type Address, type Hex, type PublicClient } from "viem";
import { CHAIN_IDS, DopplerSDK, getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { getLabPoolContext } from "../swaps/index";
import { getAnchorByAddress } from "../anchors/registry";

export interface PendingFees {
  /** Raw pool fee amounts in currency0 / currency1 (wei). */
  fees0: string;
  fees1: string;
  /** Beneficiary-oriented split: which side is the anchor vs the launched token. */
  anchorSymbol: string;
  anchorAddress: Address;
  anchorFeesWei: string;
  tokenFeesWei: string;
  /** True when either side is > 0 (contract-backed claimability). */
  hasClaimable: boolean;
  poolId: Hex;
}

const COLLECT_FEES_ABI = [
  {
    type: "function",
    name: "collectFees",
    stateMutability: "nonpayable",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "fees0", type: "uint128" },
      { name: "fees1", type: "uint128" },
    ],
  },
] as const;

/**
 * Read a beneficiary's pending (claimable) fees for a lab market. Returns null
 * when the pool cannot be resolved. Amounts come straight from the contract.
 */
export async function readPendingFees(
  client: PublicClient,
  tokenAddress: Address,
  beneficiary: Address,
): Promise<PendingFees | null> {
  const ctx = await getLabPoolContext(client, tokenAddress);
  const sdk = new DopplerSDK({ publicClient: client, chainId: CHAIN_IDS.ROBINHOOD });
  const pool = await sdk.getMulticurvePool(tokenAddress);
  let fees0 = 0n;
  let fees1 = 0n;
  try {
    const pending = await pool.getPendingFees(beneficiary);
    fees0 = pending.fees0;
    fees1 = pending.fees1;
  } catch {
    return null;
  }
  const anchorIsC0 = ctx.anchorIsCurrency0;
  const anchorFeesWei = anchorIsC0 ? fees0 : fees1;
  const tokenFeesWei = anchorIsC0 ? fees1 : fees0;
  const anchor = getAnchorByAddress(ctx.anchorAddress);
  return {
    fees0: fees0.toString(),
    fees1: fees1.toString(),
    anchorSymbol: anchor?.symbol ?? ctx.anchorSymbol,
    anchorAddress: ctx.anchorAddress,
    anchorFeesWei: anchorFeesWei.toString(),
    tokenFeesWei: tokenFeesWei.toString(),
    hasClaimable: fees0 > 0n || fees1 > 0n,
    poolId: ctx.poolId,
  };
}

export interface UnsignedClaimTx {
  to: Address;
  data: Hex;
  value: "0";
  poolId: Hex;
}

/** Build the unsigned collectFees(poolId) transaction against the initializer. */
export function buildCollectFeesTx(poolId: Hex): UnsignedClaimTx {
  const a = getAddresses(CHAIN_IDS.ROBINHOOD) as unknown as { dopplerHookInitializer: Address };
  const data = encodeFunctionData({
    abi: COLLECT_FEES_ABI,
    functionName: "collectFees",
    args: [poolId],
  });
  return { to: a.dopplerHookInitializer, data, value: "0", poolId };
}
