// Fixed Launch Lab configuration + fail-closed environment access.
// Secrets are read from process.env by name only and never re-exported.

import { getAddress, type Address } from 'viem';
import type { FeePreset, FeePresetId } from '../types/index';

export const CHAIN_ID = 4663 as const;
export const EXPLORER_BASE_URL = 'https://robinhoodchain.blockscout.com';

/** Canonical GOOGL (Alphabet Class A • Robinhood Token); re-verified fail-closed at runtime. */
export const GOOGL_ADDRESS: Address = getAddress('0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3');

export const INITIAL_SUPPLY_WEI = 10n ** 18n * 1_000_000_000n; // 1B tokens
export const SALE_INVENTORY_WEI = INITIAL_SUPPLY_WEI; // creator allocation 0

/** Simulations older than this must be re-run before signing. */
export const SIMULATION_MAX_AGE_MS = 180_000;

export const FEE_PRESETS: readonly FeePreset[] = [
  { id: 'BALANCED_1', label: 'Balanced', poolFeeUnits: 10_000, displayFee: '1.00%', mode: 'static', enabled: true },
  { id: 'CREATOR_2', label: 'Creator', poolFeeUnits: 20_000, displayFee: '2.00%', mode: 'static', enabled: true },
  { id: 'DEGEN_3', label: 'Degen', poolFeeUnits: 30_000, displayFee: '3.00%', mode: 'static', enabled: true },
  {
    id: 'DYNAMIC_PROTECTION',
    label: 'Dynamic Protection',
    poolFeeUnits: 10_000,
    displayFee: 'decay',
    mode: 'decay',
    enabled: false,
    disabledReason: 'The decay multicurve initializer is not deployed on Robinhood Chain (4663).',
  },
] as const;

export function getFeePreset(id: FeePresetId): FeePreset {
  const p = FEE_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown fee preset: ${id}`);
  return p;
}

/** Beneficiary split (WAD shares) — fixed by founder decision 2026-07-27. */
export const SPLIT = { creatorFeePct: 85n, bpsFeePct: 10n, protocolPct: 5n } as const;

export class MissingEnvError extends Error {
  constructor(public readonly names: string[]) {
    super(`Missing required environment variables: ${names.join(', ')}`);
  }
}

/** Read required env vars; throws MissingEnvError listing every absent name. */
export function requireEnv<const K extends readonly string[]>(names: K): Record<K[number], string> {
  const missing: string[] = [];
  const out: Record<string, string> = {};
  for (const n of names) {
    const v = process.env[n];
    if (!v || v.trim() === '') missing.push(n);
    else out[n] = v.trim();
  }
  if (missing.length > 0) throw new MissingEnvError(missing);
  return out as Record<K[number], string>;
}

export interface LabServerFlags {
  enabled: boolean;
  broadcastEnabled: boolean;
  killSwitchActive: boolean;
  creatorAllowlist: Address[];
  bpsFeeAddress: Address | null;
  startingFdvUsd: number;
  defaultFeePreset: FeePresetId;
}

/**
 * Feature flags fail CLOSED: lab disabled, broadcast disabled, kill switch
 * active unless each is explicitly configured otherwise.
 */
export function readServerFlags(): LabServerFlags {
  const allow = (process.env.BPS_LAUNCH_LAB_CREATOR_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => getAddress(s));
  const bps = process.env.BPS_LAUNCH_LAB_BPS_BENEFICIARY;
  const fdv = Number(process.env.BPS_LAUNCH_LAB_START_FDV_USD ?? '20500');
  const preset = (process.env.BPS_LAUNCH_LAB_DEFAULT_FEE_PRESET ?? 'BALANCED_1') as FeePresetId;
  return {
    enabled: process.env.BPS_LAUNCH_LAB_ENABLED === 'true',
    broadcastEnabled: process.env.BPS_LAUNCH_LAB_BROADCAST_ENABLED === 'true',
    killSwitchActive: process.env.BPS_LAUNCH_LAB_KILL_SWITCH !== 'false',
    creatorAllowlist: allow,
    bpsFeeAddress: bps ? getAddress(bps) : null,
    startingFdvUsd: Number.isFinite(fdv) && fdv > 0 ? fdv : 20_500,
    defaultFeePreset: FEE_PRESETS.some((p) => p.id === preset && p.enabled) ? preset : 'BALANCED_1',
  };
}
