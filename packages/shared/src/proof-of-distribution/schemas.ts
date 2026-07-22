// Runtime-validated strict schemas for the Proof-of-Distribution cycle fixture. Every input is
// validated for shape, unknown-key rejection, address syntax, and non-negative integer-string
// format here. Cross-field invariants (block ordering, epoch boundaries, tier durations,
// duplicates) are enforced later in normalization/validation, which produces the typed internal
// model with bigints and normalized addresses.

import { z } from "zod";
import { isHexAddress } from "./address.js";
import { isNonNegativeIntegerString } from "./numeric.js";
import { ECON_VERSION, EXCLUSION_CATEGORIES, SUPPORTED_LOCK_TIERS } from "./constants.js";

const zAddress = z.string().refine(isHexAddress, "malformed 20-byte hex address");
const zBig = z
  .string()
  .refine(isNonNegativeIntegerString, "expected a base-10 non-negative integer string");
const zHash32 = z
  .string()
  .refine((v) => /^0x[0-9a-fA-F]{64}$/.test(v), "expected 0x-prefixed 32-byte hex hash");

export const cycleConfigSchema = z.strictObject({
  schemaVersion: z.string().min(1),
  cycleId: zBig,
  chainId: zBig,
  bpsTokenAddress: zAddress,
  claimManagerAddress: zAddress,
  economicsVersion: z.literal(ECON_VERSION),
  rewardPolicyVersion: z.string().min(1),
  epochId: zBig,
  epochStart: zBig,
  epochEnd: zBig,
  startBlock: zBig,
  endBlock: zBig,
  snapshotBlock: zBig,
  finalizedBlock: zBig,
  confirmationDepth: zBig,
  claimStart: zBig,
  claimDeadline: zBig,
  termsVersion: z.string().min(1),
  eligibilityPolicyVersion: z.string().min(1),
  restrictedJurisdictionPolicyVersion: z.string().min(1),
});

export const confirmedTransferSchema = z.strictObject({
  chainId: zBig,
  blockNumber: zBig,
  blockHash: zHash32,
  transactionHash: zHash32,
  transactionIndex: zBig,
  logIndex: zBig,
  timestamp: zBig,
  from: zAddress,
  to: zAddress,
  rawAmount: zBig,
});

export const epochStartBalanceSchema = z.strictObject({
  wallet: zAddress,
  rawBalance: zBig,
});

export const lockRecordSchema = z.strictObject({
  wallet: zAddress,
  rawPrincipal: zBig,
  tier: z.enum(SUPPORTED_LOCK_TIERS as [string, ...string[]]),
  startTimestamp: zBig,
  unlockTimestamp: zBig,
  withdrawalTimestamp: zBig.optional(),
});

export const eligibilityRecordSchema = z.strictObject({
  wallet: zAddress,
  eligible: z.boolean(),
  policyVersion: z.string().min(1),
  validFrom: zBig,
  expiry: zBig.optional(),
  revoked: z.boolean(),
});

export const excludedAddressSchema = z.strictObject({
  address: zAddress,
  category: z.enum(EXCLUSION_CATEGORIES as [string, ...string[]]),
  reason: z.string().min(1),
  policyVersion: z.string().min(1),
});

export const acquiredAssetSchema = z.strictObject({
  ticker: z.string().min(1),
  name: z.string().min(1),
  tokenAddress: zAddress,
  decimals: z.number().int().min(0).max(255),
  acquiredRawAmount: zBig,
});

export const cycleFixtureSchema = z.strictObject({
  cycle: cycleConfigSchema,
  excludedAddresses: z.array(excludedAddressSchema),
  eligibility: z.array(eligibilityRecordSchema),
  epochStartBalances: z.array(epochStartBalanceSchema),
  transfers: z.array(confirmedTransferSchema),
  locks: z.array(lockRecordSchema),
  assets: z.array(acquiredAssetSchema).min(1),
});

export type RawCycleFixture = z.infer<typeof cycleFixtureSchema>;
export type RawCycleConfig = z.infer<typeof cycleConfigSchema>;
export type RawConfirmedTransfer = z.infer<typeof confirmedTransferSchema>;
export type RawLockRecord = z.infer<typeof lockRecordSchema>;
export type RawEligibilityRecord = z.infer<typeof eligibilityRecordSchema>;
export type RawExcludedAddress = z.infer<typeof excludedAddressSchema>;
export type RawAcquiredAsset = z.infer<typeof acquiredAssetSchema>;
export type RawEpochStartBalance = z.infer<typeof epochStartBalanceSchema>;

/** Parse and structurally validate an unknown value as a cycle fixture. Throws on any violation. */
export function parseCycleFixture(input: unknown): RawCycleFixture {
  return cycleFixtureSchema.parse(input);
}
