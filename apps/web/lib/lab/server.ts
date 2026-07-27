// Server-only Launch Lab glue: RPC client, auth, and orchestration.
// Never import from client components. Secrets stay in process.env.

import "server-only";
import {
  createPublicClient,
  fallback,
  http,
  defineChain,
  keccak256,
  stringToHex,
  verifyMessage,
  type Address,
  type PublicClient,
} from "viem";
import {
  requireEnv,
  readServerFlags,
  resolveAnchor,
  resolveAndVerifyModules,
  buildBeneficiaries,
  buildLaunchParams,
  simulateLaunch,
  hashManifest,
  hashDescription,
  canonicalize,
  getFeePreset,
  CHAIN_ID,
  EXPLORER_BASE_URL,
  FEE_PRESETS,
  INITIAL_SUPPLY_WEI,
  SALE_INVENTORY_WEI,
  SIMULATION_MAX_AGE_MS,
  GENESIS_MARKET,
  SIGNATURE_MAX_AGE_MS,
  type LabServerFlags,
  type LaunchManifest,
  type LaunchSimulation,
  type PreparedLaunchTransaction,
  type LabPublicConfig,
  type PrepareLaunchPayload,
  type SignedRequest,
} from "@bps/launch-lab";

export const labChain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: EXPLORER_BASE_URL } },
});

let cachedClient: PublicClient | null = null;

/**
 * Server public client. Primary = the private RPC from env; fallback = the
 * public rate-limited endpoint (repo policy: acceptable as a NON-critical
 * fallback only). The private endpoint has shown quota exhaustion
 * ("monthly capacity limit"), so reads must survive its failure.
 */
export function getLabClient(): PublicClient {
  if (cachedClient) return cachedClient;
  const { ROBINHOOD_CHAIN_RPC_URL } = requireEnv(["ROBINHOOD_CHAIN_RPC_URL"] as const);
  cachedClient = createPublicClient({
    chain: labChain,
    transport: fallback([
      http(ROBINHOOD_CHAIN_RPC_URL, { timeout: 10_000 }),
      http("https://rpc.mainnet.chain.robinhood.com", { timeout: 10_000 }),
    ]),
  });
  return cachedClient;
}

export function getFlags(): LabServerFlags {
  return readServerFlags();
}

export function publicConfig(): LabPublicConfig {
  const flags = getFlags();
  return {
    chainId: CHAIN_ID,
    enabled: flags.enabled,
    broadcastEnabled: flags.broadcastEnabled,
    killSwitchActive: flags.killSwitchActive,
    defaultFeePreset: flags.defaultFeePreset,
    feePresets: [...FEE_PRESETS],
    startingFdvUsd: flags.startingFdvUsd,
    anchorSymbol: "GOOGL",
    bpsFeeAddress: flags.bpsFeeAddress,
    explorerBaseUrl: EXPLORER_BASE_URL,
    genesis: { launched: GENESIS_MARKET.launched, tokenAddress: GENESIS_MARKET.tokenAddress },
  };
}

/**
 * Verify a signed request envelope: EIP-191 signature over canonical JSON of
 * `message`, allowlisted signer, fresh timestamps, matching host + payload hash.
 * Returns the verified wallet or throws.
 */
export async function verifySignedRequest(
  req: SignedRequest,
  expected: {
    action: SignedRequest["message"]["action"];
    payloadHash: `0x${string}`;
    host: string;
  },
): Promise<Address> {
  const { message, signature } = req;
  if (message.action !== expected.action) throw new Error("AUTH_ACTION_MISMATCH");
  if (message.chainId !== CHAIN_ID) throw new Error("AUTH_CHAIN_MISMATCH");
  if (message.payloadHash !== expected.payloadHash) throw new Error("AUTH_PAYLOAD_MISMATCH");
  const hostOk = message.host === expected.host;
  if (!hostOk) throw new Error("AUTH_HOST_MISMATCH");
  const now = Date.now();
  if (message.issuedAt > now + 60_000) throw new Error("AUTH_ISSUED_IN_FUTURE");
  if (message.expiresAt < now) throw new Error("AUTH_EXPIRED");
  if (message.expiresAt - message.issuedAt > SIGNATURE_MAX_AGE_MS)
    throw new Error("AUTH_WINDOW_TOO_LONG");
  const text = canonicalize(message);
  const ok = await verifyMessage({
    address: message.wallet,
    message: text,
    signature: signature as `0x${string}`,
  });
  if (!ok) throw new Error("AUTH_BAD_SIGNATURE");
  const flags = getFlags();
  if (!flags.creatorAllowlist.some((a) => a.toLowerCase() === message.wallet.toLowerCase())) {
    throw new Error("AUTH_NOT_ALLOWLISTED");
  }
  return message.wallet;
}

export function payloadHashOf(payload: unknown): `0x${string}` {
  return keccak256(stringToHex(canonicalize(payload)));
}

export interface PreparedLaunchBundle {
  manifest: LaunchManifest;
  manifestHash: `0x${string}`;
  simulation: LaunchSimulation;
  prepared: PreparedLaunchTransaction;
}

/**
 * The full prepare path: re-resolve anchor (fail closed), verify modules,
 * build beneficiaries + params, simulate the exact creation, produce the
 * manifest and unsigned transaction bound to the calldata hash.
 */
export async function prepareLaunch(
  payload: PrepareLaunchPayload,
  appVersion: string,
  sourceCommit: string,
): Promise<PreparedLaunchBundle> {
  const flags = getFlags();
  if (!flags.enabled) throw new Error("LAB_DISABLED");
  if (!flags.bpsFeeAddress) throw new Error("BPS_BENEFICIARY_UNCONFIGURED");
  const preset = getFeePreset(payload.feePreset);
  if (!preset.enabled) throw new Error("FEE_PRESET_DISABLED");

  const client = getLabClient();
  const anchor = await resolveAnchor(client, { bypassCache: true });
  if (anchor.status !== "verified") throw new Error(`ANCHOR_MISMATCH: ${anchor.mismatchReason}`);

  const modules = await resolveAndVerifyModules(client);
  const bene = buildBeneficiaries(
    payload.creatorFeeAddress as Address,
    flags.bpsFeeAddress,
    modules.airlockOwner,
  );

  const params = buildLaunchParams({
    tokenName: payload.tokenName,
    tokenSymbol: payload.tokenSymbol,
    tokenUri: payload.tokenUri,
    anchorAddress: anchor.address,
    anchorMidUsd: Number(anchor.midPriceUsd),
    startingFdvUsd: payload.startingFdvUsd,
    feePreset: payload.feePreset,
    creatorAddress: payload.creatorAddress as Address,
    beneficiaries: bene.raw,
    rehypeHookAddress: modules.addresses.rehypeDopplerHookInitializer as Address,
  });
  const sim = await simulateLaunch(client, modules.addresses.airlock as Address, params);

  const manifest: LaunchManifest = {
    platform: "BPS Launch Lab",
    appVersion,
    sourceCommit,
    chainId: CHAIN_ID,
    creatorAddress: payload.creatorAddress as Address,
    creatorFeeAddress: payload.creatorFeeAddress as Address,
    bpsFeeAddress: flags.bpsFeeAddress,
    protocolFeeAddress: modules.airlockOwner,
    tokenName: payload.tokenName,
    tokenSymbol: payload.tokenSymbol,
    tokenDescriptionHash: hashDescription(payload.tokenDescription),
    tokenImageCid: payload.imageCid,
    tokenUri: payload.tokenUri,
    anchorSymbol: "GOOGL",
    anchorAddress: anchor.address,
    anchorDecimals: anchor.decimals,
    anchorMultiplier: anchor.currentMultiplier,
    initialSupply: INITIAL_SUPPLY_WEI.toString(),
    saleInventory: SALE_INVENTORY_WEI.toString(),
    startingFdvUsdFixed: String(payload.startingFdvUsd),
    feePreset: payload.feePreset,
    exactPoolFeeUnits: preset.poolFeeUnits,
    beneficiaries: bene.entries,
    migrationMode: "noOp",
    governanceMode: "noOp",
    initializerMode: "rehype",
    resolvedDopplerModules: modules.addresses,
    transactionTarget: sim.transactionTarget,
    transactionValue: "0",
    calldataHash: sim.calldataHash,
    createdAt: Date.now(),
  };
  const manifestHash = hashManifest(manifest);

  const simulation: LaunchSimulation = {
    status: "ok",
    manifestHash,
    transactionTarget: sim.transactionTarget,
    calldataHash: sim.calldataHash,
    predictedTokenAddress: sim.predictedTokenAddress,
    predictedPoolId: sim.predictedPoolId,
    gasEstimate: sim.gasEstimate.toString(),
    simulationBlock: sim.simulationBlock.toString(),
    simulationTimestamp: sim.simulationTimestamp,
  };

  const prepared: PreparedLaunchTransaction = {
    chainId: CHAIN_ID,
    from: payload.creatorAddress as Address,
    to: sim.transactionTarget,
    data: sim.data,
    value: "0",
    gas: ((sim.gasEstimate * 125n) / 100n).toString(),
    manifestHash,
    calldataHash: sim.calldataHash,
    simulation,
    staleAfter: sim.simulationTimestamp + SIMULATION_MAX_AGE_MS,
  };

  return { manifest, manifestHash, simulation, prepared };
}
