// Wallet + declaration + eligibility state machine (Task 8 §B).
//
// IMPORTANT BOUNDARIES:
// - Signing the declarations NEVER makes a wallet eligible. Eligibility is a SEPARATE result supplied by
//   the configured restricted-beta boundary; the frontend makes no legal/jurisdiction determination.
// - The EIP-712 domain/types below are a restricted-beta SCAFFOLD, not an accepted legal instrument. The
//   real document hashes, version, domain, and expiry policy are a governance/legal input (a live
//   blocker). The verification LOGIC (signer match, chain, expiry, nonce replay, document version) is
//   what this module owns.
// - No jurisdiction data is persisted here; callers must not write sensitive eligibility detail to
//   browser storage.
import { recoverTypedDataAddress, type Address, type Hex, type TypedDataDomain } from "viem";
import { ROBINHOOD_CHAIN_ID } from "./manifest";

export const DECLARATION_DOMAIN: TypedDataDomain = {
  name: "BPS Restricted Beta Declarations",
  version: "1",
  chainId: ROBINHOOD_CHAIN_ID,
};

export const DECLARATION_TYPES = {
  Declaration: [
    { name: "wallet", type: "address" },
    { name: "documentHash", type: "bytes32" },
    { name: "documentVersion", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

export interface DeclarationMessage {
  readonly wallet: Address;
  readonly documentHash: Hex;
  readonly documentVersion: bigint;
  readonly nonce: bigint;
  readonly expiry: bigint; // unix seconds
}

export interface SignedDeclaration {
  readonly message: DeclarationMessage;
  readonly signature: Hex;
  readonly chainId: number;
}

export interface DeclarationPolicy {
  readonly currentDocumentVersion: bigint;
  readonly currentDocumentHash: Hex;
  readonly nowSec: bigint;
  readonly usedNonces: ReadonlySet<string>; // `${wallet}:${nonce}` already consumed
}

export type DeclarationVerdict =
  { readonly ok: true } | { readonly ok: false; readonly reason: DeclarationRejection };

export type DeclarationRejection =
  | "wrong-chain"
  | "wrong-signer"
  | "expired"
  | "replayed-nonce"
  | "stale-document-version"
  | "stale-document-hash"
  | "bad-signature";

/** Verify a signed declaration against the current policy. Async only for signature recovery (viem). */
export async function verifyDeclaration(
  signed: SignedDeclaration,
  policy: DeclarationPolicy,
): Promise<DeclarationVerdict> {
  if (signed.chainId !== ROBINHOOD_CHAIN_ID) return { ok: false, reason: "wrong-chain" };
  if (signed.message.documentVersion !== policy.currentDocumentVersion) {
    return { ok: false, reason: "stale-document-version" };
  }
  if (signed.message.documentHash.toLowerCase() !== policy.currentDocumentHash.toLowerCase()) {
    return { ok: false, reason: "stale-document-hash" };
  }
  if (signed.message.expiry <= policy.nowSec) return { ok: false, reason: "expired" };
  const nonceKey = `${signed.message.wallet.toLowerCase()}:${signed.message.nonce.toString()}`;
  if (policy.usedNonces.has(nonceKey)) return { ok: false, reason: "replayed-nonce" };

  let recovered: Address;
  try {
    recovered = await recoverTypedDataAddress({
      domain: DECLARATION_DOMAIN,
      types: DECLARATION_TYPES,
      primaryType: "Declaration",
      message: signed.message,
      signature: signed.signature,
    });
  } catch {
    return { ok: false, reason: "bad-signature" };
  }
  if (recovered.toLowerCase() !== signed.message.wallet.toLowerCase()) {
    return { ok: false, reason: "wrong-signer" };
  }
  return { ok: true };
}

export type EligibilityResult = "eligible" | "ineligible" | "unknown";

export interface WalletContext {
  readonly address: Address | null;
  readonly chainId: number | null;
}

export type EligibilityState =
  | { readonly kind: "wallet-disconnected" }
  | { readonly kind: "wrong-network"; readonly chainId: number }
  | { readonly kind: "connected-unsigned" }
  | { readonly kind: "declaration-expired-or-superseded"; readonly reason: DeclarationRejection }
  | { readonly kind: "signed-eligibility-unverified" }
  | { readonly kind: "eligible" }
  | { readonly kind: "ineligible" };

/** Whether any write action may be presented. Only the terminal `eligible` state passes the gate. */
export function eligibilityWriteGate(state: EligibilityState): boolean {
  return state.kind === "eligible";
}

/**
 * Pure state derivation. `declarationVerdict` is the result of `verifyDeclaration` (null if unsigned);
 * `eligibility` is the SEPARATE result from the configured restricted-beta boundary. A signed-but-not-
 * eligible wallet lands in `signed-eligibility-unverified` (never `eligible`).
 */
export function deriveEligibilityState(
  wallet: WalletContext,
  declarationVerdict: DeclarationVerdict | null,
  eligibility: EligibilityResult,
): EligibilityState {
  if (wallet.address === null) return { kind: "wallet-disconnected" };
  if (wallet.chainId !== ROBINHOOD_CHAIN_ID) {
    return { kind: "wrong-network", chainId: wallet.chainId ?? 0 };
  }
  if (declarationVerdict === null) return { kind: "connected-unsigned" };
  if (!declarationVerdict.ok) {
    // Expired / superseded / replay / signer / chain problems all block and require a fresh declaration.
    if (
      declarationVerdict.reason === "expired" ||
      declarationVerdict.reason === "stale-document-version" ||
      declarationVerdict.reason === "stale-document-hash"
    ) {
      return { kind: "declaration-expired-or-superseded", reason: declarationVerdict.reason };
    }
    return { kind: "connected-unsigned" };
  }
  // Valid signature: eligibility is still a separate gate. Signing alone is never sufficient.
  if (eligibility === "eligible") return { kind: "eligible" };
  if (eligibility === "ineligible") return { kind: "ineligible" };
  return { kind: "signed-eligibility-unverified" };
}
