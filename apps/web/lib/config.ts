// Runtime configuration boundary (Task 8B §C). The accepted Milestone 1 EIP-712 declaration domain,
// types, and document hashes DO NOT EXIST in this repository (confirmed by searching current source and
// history). Therefore:
//  - PRODUCTION_DECLARATION_CONFIG is null (a live blocker: USER INPUT / EXTERNAL LEGAL INPUT REQUIRED);
//  - restricted-beta live writes FAIL CLOSED without it;
//  - a clearly-labeled LOCAL_TEST config exists solely for automated/local testing.
// Eligibility is a SEPARATE result from a configured service; signing never establishes it. No public
// endpoint that can mark arbitrary users eligible is created — only an interface and a local mock.
import { keccak256, stringToHex, type Hex, type TypedDataDomain } from "viem";
import { ROBINHOOD_CHAIN_ID } from "./chain";
import { DECLARATION_TYPES, type EligibilityResult } from "./eligibility";

export interface DeclarationConfig {
  readonly domain: TypedDataDomain;
  readonly types: typeof DECLARATION_TYPES;
  readonly documentVersion: bigint;
  readonly documentHash: Hex;
  readonly source: "production" | "local-test";
}

/** No accepted production legal declaration configuration exists yet. Live writes fail closed. */
export const PRODUCTION_DECLARATION_CONFIG: DeclarationConfig | null = null;

/** LOCAL-TEST ONLY declaration config. Never a legal instrument; used for local/automated testing. */
export const LOCAL_TEST_DECLARATION_CONFIG: DeclarationConfig = {
  domain: { name: "BPS Restricted Beta Declarations", version: "1", chainId: ROBINHOOD_CHAIN_ID },
  types: DECLARATION_TYPES,
  documentVersion: 1n,
  documentHash: keccak256(stringToHex("bps-local-test-declaration-v1")),
  source: "local-test",
};

export type AppMode = "local" | "fork" | "restricted-beta" | "production";

/**
 * Resolve the declaration config for a mode. Local/fork use the labeled test config; restricted-beta/
 * production require the (currently absent) production config and return null → the caller must fail
 * closed (no signing prompt, no writes).
 */
export function resolveDeclarationConfig(mode: AppMode): DeclarationConfig | null {
  if (mode === "local" || mode === "fork") return LOCAL_TEST_DECLARATION_CONFIG;
  return PRODUCTION_DECLARATION_CONFIG;
}

/** Eligibility is provided by a configured, authenticated service. No production service exists yet. */
export interface EligibilityService {
  readonly kind: "local-mock" | "production";
  check(account: string): Promise<EligibilityResult>;
}

/**
 * Local, deterministic mock eligibility service for testing/local mode ONLY. It is not an endpoint and
 * cannot be reached by arbitrary users; it returns `eligible` only for an explicitly allow-listed set.
 */
export function createLocalMockEligibilityService(
  eligibleAccounts: readonly string[],
): EligibilityService {
  const allow = new Set(eligibleAccounts.map((a) => a.toLowerCase()));
  return {
    kind: "local-mock",
    check: (account: string) =>
      Promise.resolve(allow.has(account.toLowerCase()) ? "eligible" : "ineligible"),
  };
}

/** The production eligibility service is a live blocker; live mode has no service until it is configured. */
export const PRODUCTION_ELIGIBILITY_SERVICE: EligibilityService | null = null;
