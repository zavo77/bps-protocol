// Doppler integration for Robinhood Chain (4663).
//
// 4663 has NO standard/scheduled/decay multicurve initializer. The deployed,
// Airlock-whitelisted multicurve path is the rehype mode:
//   DopplerHookInitializer (PoolInitializer, whitelist state 3)
//   + RehypeDopplerHookInitializer hook (whitelisted inside the initializer)
// with DopplerERC20V1Factory (state 1), NoOpGovernanceFactory (state 2) and
// NoOpMigrator (state 4). Proven by live simulation 2026-07-27
// (docs/launch-lab/SPIKE_LAUNCH_PROOF.json).

import { encodeFunctionData, keccak256, type Address, type Hex, type PublicClient } from "viem";
import {
  CHAIN_IDS,
  DopplerSDK,
  MulticurveBuilder,
  WAD,
  ZERO_ADDRESS,
  airlockAbi,
  getAddresses,
  getAirlockOwner,
} from "@whetstone-research/doppler-sdk/evm";
import { getFeePreset, INITIAL_SUPPLY_WEI, SALE_INVENTORY_WEI, SPLIT } from "../config/index";
import type { BeneficiaryEntry, FeePresetId } from "../types/index";

export interface ResolvedModules {
  addresses: Record<string, Address>;
  airlockOwner: Address;
}

const REQUIRED_MODULES = [
  "airlock",
  "dopplerHookInitializer",
  "rehypeDopplerHookInitializer",
  "noOpMigrator",
  "noOpGovernanceFactory",
  "dopplerERC20V1Factory",
] as const;

/** Airlock ModuleState expectations (0 = NotWhitelisted). */
const EXPECTED_WHITELIST: Record<string, number> = {
  dopplerERC20V1Factory: 1,
  noOpGovernanceFactory: 2,
  dopplerHookInitializer: 3,
  noOpMigrator: 4,
};

/**
 * Resolve and verify every module the launch depends on: address configured,
 * bytecode present, and Airlock whitelist state as expected. Fail closed.
 */
export async function resolveAndVerifyModules(client: PublicClient): Promise<ResolvedModules> {
  const all = getAddresses(CHAIN_IDS.ROBINHOOD) as unknown as Record<string, unknown>;
  const resolved: Record<string, Address> = {};
  for (const name of REQUIRED_MODULES) {
    const addr = all[name];
    if (typeof addr !== "string" || !addr.startsWith("0x") || addr === ZERO_ADDRESS) {
      throw new Error(`Doppler module "${name}" is not configured for chain 4663.`);
    }
    const code = await client.getCode({ address: addr as Address });
    if (!code || code === "0x")
      throw new Error(`Doppler module "${name}" has no bytecode at ${addr}.`);
    resolved[name] = addr as Address;
  }
  const airlock = resolved.airlock;
  if (!airlock) throw new Error("Airlock address unresolved.");
  for (const [name, expected] of Object.entries(EXPECTED_WHITELIST)) {
    const moduleAddr = resolved[name];
    if (!moduleAddr) throw new Error(`Module "${name}" unresolved for whitelist check.`);
    const state = await client.readContract({
      address: airlock,
      abi: airlockAbi,
      functionName: "getModuleState",
      args: [moduleAddr],
    });
    if (Number(state) !== expected) {
      throw new Error(`Airlock whitelist state for "${name}" is ${state}, expected ${expected}.`);
    }
  }
  const airlockOwner = await getAirlockOwner(client);
  return { addresses: resolved, airlockOwner };
}

/** 85/10/5 beneficiary construction; validates sum == WAD and uniqueness. */
export function buildBeneficiaries(
  creatorFeeAddress: Address,
  bpsFeeAddress: Address,
  airlockOwner: Address,
): { raw: { beneficiary: Address; shares: bigint }[]; entries: BeneficiaryEntry[] } {
  const labeled = [
    {
      beneficiary: airlockOwner,
      shares: (WAD * SPLIT.protocolPct) / 100n,
      label: "Doppler/Airlock owner",
      percent: `${SPLIT.protocolPct}%`,
    },
    {
      beneficiary: bpsFeeAddress,
      shares: (WAD * SPLIT.bpsFeePct) / 100n,
      label: "BPS",
      percent: `${SPLIT.bpsFeePct}%`,
    },
    {
      beneficiary: creatorFeeAddress,
      shares: (WAD * SPLIT.creatorFeePct) / 100n,
      label: "Creator fees",
      percent: `${SPLIT.creatorFeePct}%`,
    },
  ];
  const raw = labeled.map((b) => ({ beneficiary: b.beneficiary, shares: b.shares }));
  const sum = raw.reduce((a, b) => a + b.shares, 0n);
  if (sum !== WAD) throw new Error(`Beneficiary shares sum ${sum} != WAD.`);
  const unique = new Set(raw.map((b) => b.beneficiary.toLowerCase()));
  if (unique.size !== raw.length) throw new Error("Beneficiary addresses must be unique.");
  for (const b of raw) {
    if (b.beneficiary === ZERO_ADDRESS) throw new Error("Zero address beneficiary rejected.");
  }
  return {
    raw,
    entries: labeled.map((b) => ({
      beneficiary: b.beneficiary,
      sharesWad: b.shares.toString(),
      label: b.label,
      percent: b.percent,
    })),
  };
}

export interface LaunchBuildInput {
  tokenName: string;
  tokenSymbol: string;
  tokenUri: string;
  anchorAddress: Address;
  /** GOOGL mid price in USD (multiplier-adjusted). */
  anchorMidUsd: number;
  startingFdvUsd: number;
  feePreset: FeePresetId;
  creatorAddress: Address;
  beneficiaries: { beneficiary: Address; shares: bigint }[];
  rehypeHookAddress: Address;
}

/**
 * Build CreateMulticurveParams for the proven rehype/noOp/noOp configuration.
 * Curve shape (proven in the spike): 60% of inventory from startingFdv→$1M FDV,
 * 40% from $1M→max — full 1B sale inventory, creator allocation 0.
 */
export function buildLaunchParams(input: LaunchBuildInput) {
  const preset = getFeePreset(input.feePreset);
  if (!preset.enabled) throw new Error(`Fee preset ${preset.id} is disabled on chain 4663.`);
  return new MulticurveBuilder(CHAIN_IDS.ROBINHOOD)
    .tokenConfig({
      type: "dopplerERC20V1",
      name: input.tokenName,
      symbol: input.tokenSymbol,
      tokenURI: input.tokenUri,
    })
    .saleConfig({
      initialSupply: INITIAL_SUPPLY_WEI,
      numTokensToSell: SALE_INVENTORY_WEI,
      numeraire: input.anchorAddress,
    })
    .withCurves({
      numerairePrice: input.anchorMidUsd,
      curves: [
        {
          marketCap: { start: input.startingFdvUsd, end: 1_000_000 },
          numPositions: 11,
          shares: (WAD * 60n) / 100n,
        },
        {
          marketCap: { start: 1_000_000, end: "max" },
          numPositions: 10,
          shares: (WAD * 40n) / 100n,
        },
      ],
      fee: preset.poolFeeUnits,
      beneficiaries: input.beneficiaries,
    })
    .withRehypeDopplerHookInitializer({
      hookAddress: input.rehypeHookAddress,
      startFee: preset.poolFeeUnits,
      endFee: preset.poolFeeUnits,
      durationSeconds: 0,
      feeRoutingMode: "routeToBeneficiaryFees",
      feeBeneficiaries: input.beneficiaries as [{ beneficiary: Address; shares: bigint }],
      feeDistributionInfo: {
        assetFeesToAssetBuybackWad: 0n,
        assetFeesToNumeraireBuybackWad: 0n,
        assetFeesToBeneficiaryWad: WAD,
        assetFeesToLpWad: 0n,
        numeraireFeesToAssetBuybackWad: 0n,
        numeraireFeesToNumeraireBuybackWad: 0n,
        numeraireFeesToBeneficiaryWad: WAD,
        numeraireFeesToLpWad: 0n,
      },
    })
    .withGovernance({ type: "noOp" })
    .withMigration({ type: "noOp" })
    .withUserAddress(input.creatorAddress)
    .build();
}

export interface SimulatedLaunch {
  transactionTarget: Address;
  data: Hex;
  calldataHash: Hex;
  predictedTokenAddress: Address;
  predictedPoolId: Hex;
  gasEstimate: bigint;
  simulationBlock: bigint;
  simulationTimestamp: number;
}

/** Simulate the exact creation and produce the unsigned transaction payload. */
export async function simulateLaunch(
  client: PublicClient,
  airlock: Address,
  params: ReturnType<typeof buildLaunchParams>,
): Promise<SimulatedLaunch> {
  const sdk = new DopplerSDK({ publicClient: client, chainId: CHAIN_IDS.ROBINHOOD });
  const sim = await sdk.factory.simulateCreateMulticurve(params);
  const data = encodeFunctionData({
    abi: airlockAbi,
    functionName: "create",
    args: [sim.createParams],
  });
  const block = await client.getBlockNumber();
  return {
    transactionTarget: airlock,
    data,
    calldataHash: keccak256(data),
    predictedTokenAddress: sim.tokenAddress,
    predictedPoolId: sim.poolId,
    gasEstimate: sim.gasEstimate ?? 13_500_000n,
    simulationBlock: block,
    simulationTimestamp: Date.now(),
  };
}
