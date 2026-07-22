import { describe, expect, it } from "vitest";
import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  DECLARATION_DOMAIN,
  DECLARATION_TYPES,
  deriveEligibilityState,
  eligibilityWriteGate,
  verifyDeclaration,
  type DeclarationMessage,
  type DeclarationPolicy,
  type SignedDeclaration,
} from "./eligibility";

// TEST-ONLY throwaway key derived deterministically from a label (not a real/known credential) purely
// to generate a signature that exercises the verification logic. This is NOT a user wallet and NOT a
// credential; nothing is broadcast and no real key material is embedded.
const TEST_KEY = keccak256(stringToHex("bps-task8-eligibility-test-key"));
const account = privateKeyToAccount(TEST_KEY);
const DOC_HASH = "0xabcd000000000000000000000000000000000000000000000000000000000000" as const;

async function sign(overrides: Partial<DeclarationMessage> = {}): Promise<SignedDeclaration> {
  const message: DeclarationMessage = {
    wallet: account.address,
    documentHash: DOC_HASH,
    documentVersion: 1n,
    nonce: 1n,
    expiry: 2_000_000_000n,
    ...overrides,
  };
  const signature = await account.signTypedData({
    domain: DECLARATION_DOMAIN,
    types: DECLARATION_TYPES,
    primaryType: "Declaration",
    message,
  });
  return { message, signature, chainId: 4663 };
}

const policy: DeclarationPolicy = {
  currentDocumentVersion: 1n,
  currentDocumentHash: DOC_HASH,
  nowSec: 1_000_000_000n,
  usedNonces: new Set(),
};

describe("declaration verification (§B)", () => {
  it("accepts a valid signature", async () => {
    expect((await verifyDeclaration(await sign(), policy)).ok).toBe(true);
  });

  it("rejects wrong chain", async () => {
    const s = { ...(await sign()), chainId: 1 };
    expect(await verifyDeclaration(s, policy)).toEqual({ ok: false, reason: "wrong-chain" });
  });

  it("rejects expired declaration", async () => {
    const v = await verifyDeclaration(await sign({ expiry: 999_999_999n }), policy);
    expect(v).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects replayed nonce", async () => {
    const p = { ...policy, usedNonces: new Set([`${account.address.toLowerCase()}:1`]) };
    expect(await verifyDeclaration(await sign(), p)).toEqual({
      ok: false,
      reason: "replayed-nonce",
    });
  });

  it("rejects stale document version and hash", async () => {
    expect(await verifyDeclaration(await sign({ documentVersion: 2n }), policy)).toEqual({
      ok: false,
      reason: "stale-document-version",
    });
    const p = {
      ...policy,
      currentDocumentHash:
        "0x9999000000000000000000000000000000000000000000000000000000000000" as const,
    };
    expect((await verifyDeclaration(await sign(), p)).ok).toBe(false);
  });

  it("rejects wrong signer (signature over a different wallet field)", async () => {
    const other = "0x000000000000000000000000000000000000bEEF" as const;
    const v = await verifyDeclaration(await sign({ wallet: other }), policy);
    expect(v).toEqual({ ok: false, reason: "wrong-signer" });
  });

  it("rejects a malformed signature", async () => {
    const s = { ...(await sign()), signature: "0xdead" as const };
    expect((await verifyDeclaration(s, policy)).ok).toBe(false);
  });
});

describe("eligibility state machine (§B)", () => {
  const ok = { ok: true } as const;
  it("wallet disconnected", () => {
    expect(deriveEligibilityState({ address: null, chainId: null }, null, "unknown").kind).toBe(
      "wallet-disconnected",
    );
  });
  it("wrong network", () => {
    expect(
      deriveEligibilityState({ address: account.address, chainId: 1 }, null, "unknown").kind,
    ).toBe("wrong-network");
  });
  it("connected but unsigned", () => {
    expect(
      deriveEligibilityState({ address: account.address, chainId: 4663 }, null, "eligible").kind,
    ).toBe("connected-unsigned");
  });
  it("SIGNING ALONE IS NOT ELIGIBLE: signed but eligibility unknown", () => {
    const st = deriveEligibilityState({ address: account.address, chainId: 4663 }, ok, "unknown");
    expect(st.kind).toBe("signed-eligibility-unverified");
    expect(eligibilityWriteGate(st)).toBe(false);
  });
  it("eligible only when the separate boundary says eligible", () => {
    const st = deriveEligibilityState({ address: account.address, chainId: 4663 }, ok, "eligible");
    expect(st.kind).toBe("eligible");
    expect(eligibilityWriteGate(st)).toBe(true);
  });
  it("ineligible", () => {
    expect(
      deriveEligibilityState({ address: account.address, chainId: 4663 }, ok, "ineligible").kind,
    ).toBe("ineligible");
  });
  it("expired/superseded declaration surfaces distinctly", () => {
    const st = deriveEligibilityState(
      { address: account.address, chainId: 4663 },
      { ok: false, reason: "expired" },
      "eligible",
    );
    expect(st.kind).toBe("declaration-expired-or-superseded");
    expect(eligibilityWriteGate(st)).toBe(false);
  });
});
