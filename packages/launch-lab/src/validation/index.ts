// Zod schemas for every /api/lab mutation payload + the EIP-191 auth envelope.

import { z } from "zod";
import { isAddress } from "viem";

export const addressSchema = z
  .string()
  .refine((s): s is `0x${string}` => isAddress(s), "Invalid address");

export const feePresetSchema = z.enum(["BALANCED_1", "CREATOR_2", "DEGEN_3", "DYNAMIC_PROTECTION"]);

/** Signed request envelope. The message the wallet signs is canonical JSON of `message`. */
export const signedRequestSchema = z.object({
  message: z.object({
    action: z.enum(["metadata-upload", "prepare-launch", "prepare-trade"]),
    wallet: addressSchema,
    chainId: z.literal(4663),
    payloadHash: z.string().regex(/^0x[0-9a-f]{64}$/),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    host: z.string().min(1).max(200),
  }),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});
export type SignedRequest = z.infer<typeof signedRequestSchema>;

export const prepareLaunchSchema = z.object({
  tokenName: z.string().min(1).max(48),
  tokenSymbol: z.string().regex(/^[A-Z0-9]{1,12}$/),
  tokenDescription: z.string().min(1).max(600),
  tokenUri: z.string().startsWith("ipfs://").max(120),
  imageCid: z.string().min(10).max(80),
  metadataCid: z.string().min(10).max(80),
  metadataProvider: z.literal("pinata"),
  startingFdvUsd: z.number().int().min(1_000).max(10_000_000),
  feePreset: feePresetSchema,
  creatorAddress: addressSchema,
  creatorFeeAddress: addressSchema,
  /** Approved anchor symbol; defaults to GOOGL when omitted (back-compat). */
  anchorSymbol: z
    .string()
    .regex(/^[A-Z0-9]{1,12}$/)
    .optional(),
  /** Explicit public terms/disclosure acknowledgement — required for every wallet. */
  termsAccepted: z.literal(true),
});
export type PrepareLaunchPayload = z.infer<typeof prepareLaunchSchema>;

export const quoteSchema = z.object({
  tokenAddress: addressSchema,
  direction: z.enum(["buy", "sell"]),
  /** Exact input amount in wei (decimal string). */
  amountInWei: z.string().regex(/^[0-9]{1,30}$/),
});
export type QuotePayload = z.infer<typeof quoteSchema>;

export const MAX_BODY_BYTES = 5 * 1024 * 1024;
export const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
