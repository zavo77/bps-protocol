// Static Genesis market registry. Vercel has no persistent runtime filesystem,
// so permanent launch facts are written HERE (by an engineer, from verified
// receipts) and shipped via redeploy. Never fabricate values.

import type { Address, Hex } from 'viem';

export interface GenesisMarketRecord {
  launched: boolean;
  tokenAddress: Address | null;
  tokenName: string;
  tokenSymbol: string;
  poolId: Hex | null;
  launchTransactionHash: Hex | null;
  buyTransactionHash: Hex | null;
  sellTransactionHash: Hex | null;
  manifestHash: Hex | null;
  sourceCommit: string | null;
  launchedAtUtc: string | null;
}

/** Updated ONLY after on-chain verification of the real Genesis launch. */
export const GENESIS_MARKET: GenesisMarketRecord = {
  launched: false,
  tokenAddress: null,
  tokenName: 'PRINT',
  tokenSymbol: 'PRINT',
  poolId: null,
  launchTransactionHash: null,
  buyTransactionHash: null,
  sellTransactionHash: null,
  manifestHash: null,
  sourceCommit: null,
  launchedAtUtc: null,
};
