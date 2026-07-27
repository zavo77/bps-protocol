// BPS Launch Lab — stable shared contracts between Claude Code (logic) and
// Claude Design (UI). Breaking changes to this file require updating both lanes.
// All financial values are bigint (wei/WAD) or fixed-point strings — never floats.

import type { Address, Hex } from 'viem';

// ---------------------------------------------------------------------------
// Chain / fixed configuration
// ---------------------------------------------------------------------------

export const ROBINHOOD_CHAIN_ID = 4663 as const;

/** WAD = 1e18, the share denominator used by Doppler beneficiaries. */
export const WAD = 10n ** 18n;

export type FeePresetId = 'BALANCED_1' | 'CREATOR_2' | 'DEGEN_3' | 'DYNAMIC_PROTECTION';

export interface FeePreset {
  id: FeePresetId;
  label: string;
  /** Exact Uniswap v4 fee units (hundredths of a bip): 10000 = 1.00%. */
  poolFeeUnits: number;
  /** Human display, e.g. "1.00%". */
  displayFee: string;
  mode: 'static' | 'decay';
  /**
   * DYNAMIC_PROTECTION is permanently disabled on chain 4663: the decay
   * multicurve initializer is not deployed there. UI must render it visibly
   * disabled with this reason.
   */
  enabled: boolean;
  disabledReason?: string;
}

// ---------------------------------------------------------------------------
// Anchor (canonical GOOGL)
// ---------------------------------------------------------------------------

export type AnchorVerificationStatus = 'unverified' | 'verifying' | 'verified' | 'mismatch';

export interface AnchorVerification {
  status: AnchorVerificationStatus;
  symbol: 'GOOGL';
  /** Checksummed canonical address, fail-closed against the official API. */
  address: Address;
  name: string;
  decimals: number;
  /** Raw decimal string from the official API, e.g. "1.000000000000000000". */
  currentMultiplier: string;
  /** Mid price in USD derived from official bid/ask, fixed-point string. */
  midPriceUsd: string;
  bidUsd: string;
  askUsd: string;
  /** Unix ms when the API responses were fetched. */
  fetchedAt: number;
  /** Human-readable failure reason when status === 'mismatch'. */
  mismatchReason?: string;
}

// ---------------------------------------------------------------------------
// Creation form
// ---------------------------------------------------------------------------

export interface LaunchFormData {
  tokenName: string;
  tokenSymbol: string;
  tokenDescription: string;
  /** Set after metadata upload; ipfs:// URI of the image. */
  imageCid?: string;
  startingFdvUsd: number;
  feePreset: FeePresetId;
  creatorAddress: Address;
  creatorFeeAddress: Address;
}

export interface BeneficiaryEntry {
  beneficiary: Address;
  /** WAD share as decimal string (bigint-safe for JSON). */
  sharesWad: string;
  /** Display label: "Creator fees", "BPS", "Doppler/Airlock owner". */
  label: string;
  percent: string;
}

// ---------------------------------------------------------------------------
// Manifest — the canonical, hashed description of the exact launch
// ---------------------------------------------------------------------------

export interface LaunchManifest {
  platform: 'BPS Launch Lab';
  appVersion: string;
  sourceCommit: string;
  chainId: typeof ROBINHOOD_CHAIN_ID;
  creatorAddress: Address;
  creatorFeeAddress: Address;
  bpsFeeAddress: Address;
  /** Airlock owner resolved on-chain at manifest build time. */
  protocolFeeAddress: Address;
  tokenName: string;
  tokenSymbol: string;
  /** keccak256 of the UTF-8 description. */
  tokenDescriptionHash: Hex;
  tokenImageCid: string;
  tokenUri: string;
  anchorSymbol: 'GOOGL';
  anchorAddress: Address;
  anchorDecimals: number;
  anchorMultiplier: string;
  /** Decimal strings of bigints. */
  initialSupply: string;
  saleInventory: string;
  startingFdvUsdFixed: string;
  feePreset: FeePresetId;
  exactPoolFeeUnits: number;
  beneficiaries: BeneficiaryEntry[];
  migrationMode: 'noOp';
  governanceMode: 'noOp';
  initializerMode: 'rehype';
  resolvedDopplerModules: Record<string, Address>;
  transactionTarget: Address;
  /** Decimal string; always "0" for create. */
  transactionValue: string;
  calldataHash: Hex;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Simulation + prepared transaction
// ---------------------------------------------------------------------------

export interface LaunchSimulation {
  status: 'ok';
  manifestHash: Hex;
  transactionTarget: Address;
  calldataHash: Hex;
  predictedTokenAddress: Address;
  predictedPoolId: Hex;
  /** Decimal string of the simulation gas estimate. */
  gasEstimate: string;
  simulationBlock: string;
  simulationTimestamp: number;
}

export interface PreparedLaunchTransaction {
  chainId: typeof ROBINHOOD_CHAIN_ID;
  from: Address;
  to: Address;
  data: Hex;
  /** Decimal string; "0". */
  value: string;
  gas: string;
  manifestHash: Hex;
  calldataHash: Hex;
  simulation: LaunchSimulation;
  /** Unix ms after which the client must re-simulate (180 s rule). */
  staleAfter: number;
}

// ---------------------------------------------------------------------------
// Receipt / market / proof
// ---------------------------------------------------------------------------

export interface LaunchReceiptResult {
  launchTransactionHash: Hex;
  confirmationBlock: string;
  tokenAddress: Address;
  poolId: Hex;
  creator: Address;
  anchorAddress: Address;
  /** LockablePoolStatus numeric value read on-chain (2 = Locked). */
  poolStatus: number;
  matchesManifest: boolean;
  mismatches: string[];
}

export type MarketDatum<T> = { available: true; value: T } | { available: false; reason: 'awaiting-indexed-data' | 'unsupported' };

export interface MarketSnapshot {
  tokenAddress: Address;
  tokenName: string;
  tokenSymbol: string;
  tokenUri: MarketDatum<string>;
  creator: MarketDatum<Address>;
  totalSupply: MarketDatum<string>;
  anchor: AnchorVerification;
  poolId: MarketDatum<Hex>;
  poolStatus: MarketDatum<number>;
  /** GOOGL held by the pool/hook, decimal string in wei. */
  anchorReserve: MarketDatum<string>;
  remainingTokenInventory: MarketDatum<string>;
  currentPriceUsd: MarketDatum<string>;
  startingPriceUsd: MarketDatum<string>;
  currentFdvUsd: MarketDatum<string>;
  feePreset: MarketDatum<FeePresetId>;
  exactPoolFeeUnits: MarketDatum<number>;
  beneficiaries: MarketDatum<BeneficiaryEntry[]>;
  launchTransactionHash: MarketDatum<Hex>;
  fetchedAt: number;
}

export interface ProofRecord {
  deploymentUrl: string;
  sourceCommit: string;
  manifest: LaunchManifest | null;
  manifestHash: Hex | null;
  anchor: AnchorVerification | null;
  simulation: LaunchSimulation | null;
  receipt: LaunchReceiptResult | null;
  buyTransactionHash: Hex | null;
  sellTransactionHash: Hex | null;
  anchorReserveWei: string | null;
  notes: string[];
}

// ---------------------------------------------------------------------------
// UI state enums (Claude Design renders every one of these)
// ---------------------------------------------------------------------------

export type WalletUiState =
  | 'disconnected'
  | 'wrong-chain'
  | 'unauthorised'
  | 'connected';

export type CreateFlowState =
  | 'form-incomplete'
  | 'form-invalid'
  | 'image-uploading'
  | 'metadata-confirmed'
  | 'anchor-verifying'
  | 'anchor-verified'
  | 'anchor-mismatch'
  | 'simulating'
  | 'simulation-success'
  | 'simulation-failure'
  | 'broadcast-disabled'
  | 'kill-switch-active'
  | 'ready-to-launch'
  | 'awaiting-signature'
  | 'transaction-pending'
  | 'confirmation-pending'
  | 'receipt-decoding'
  | 'launch-success'
  | 'launch-mismatch';

export type MarketUiState = 'loading' | 'ready' | 'awaiting-indexed-data' | 'error';

export type TradeUiState =
  | 'idle'
  | 'quote-loading'
  | 'quote-failure'
  | 'ready'
  | 'awaiting-signature'
  | 'pending'
  | 'success'
  | 'failure';

// ---------------------------------------------------------------------------
// API envelopes (all /api/lab responses)
// ---------------------------------------------------------------------------

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string };

export interface LabPublicConfig {
  chainId: typeof ROBINHOOD_CHAIN_ID;
  enabled: boolean;
  broadcastEnabled: boolean;
  killSwitchActive: boolean;
  defaultFeePreset: FeePresetId;
  feePresets: FeePreset[];
  startingFdvUsd: number;
  anchorSymbol: 'GOOGL';
  bpsFeeAddress: Address | null;
  explorerBaseUrl: string;
  /** Genesis market facts once launched (from the static registry). */
  genesis: {
    launched: boolean;
    tokenAddress: Address | null;
  };
}
