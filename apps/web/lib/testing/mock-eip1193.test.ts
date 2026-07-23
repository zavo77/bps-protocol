import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { createMockEip1193Provider } from "./mock-eip1193";
import { makeDemoState } from "./local-env";
import { LOCAL_TEST_ADDRESS } from "./local-account";
import {
  DECLARATION_DOMAIN,
  DECLARATION_TYPES,
  verifyDeclaration,
  type SignedDeclaration,
} from "../eligibility";
import { ROBINHOOD_CHAIN_ID, robinhoodChain, demoOtherChain } from "../chain";

const OTHER_ACCOUNT = "0x000000000000000000000000000000000000b0b0" as Address;
const DOC_HASH = `0x${"1".repeat(64)}` as Hex;

function provider(state = makeDemoState()) {
  return createMockEip1193Provider(state);
}

async function signDeclaration(
  p: ReturnType<typeof createMockEip1193Provider>,
  walletInMessage: Address,
): Promise<SignedDeclaration> {
  const message = {
    wallet: walletInMessage,
    documentHash: DOC_HASH,
    documentVersion: 1n,
    nonce: 7n,
    expiry: 5_000_000_000n,
  };
  const payload = JSON.stringify({
    domain: { ...DECLARATION_DOMAIN, chainId: ROBINHOOD_CHAIN_ID },
    types: DECLARATION_TYPES,
    primaryType: "Declaration",
    message: {
      wallet: message.wallet,
      documentHash: message.documentHash,
      documentVersion: message.documentVersion.toString(),
      nonce: message.nonce.toString(),
      expiry: message.expiry.toString(),
    },
  });
  const signature = (await p.request({
    method: "eth_signTypedData_v4",
    params: [LOCAL_TEST_ADDRESS, payload],
  })) as Hex;
  return { message, signature, chainId: ROBINHOOD_CHAIN_ID };
}

const policy = {
  currentDocumentVersion: 1n,
  currentDocumentHash: DOC_HASH,
  nowSec: 1000n,
  usedNonces: new Set<string>(),
};

describe("EIP-1193 provider state coverage (§G)", () => {
  it("chainChanged: switching chain emits chainChanged and updates the exposed chain id", async () => {
    const p = provider();
    let changedTo: string | null = null;
    p.on("chainChanged", (id) => {
      changedTo = id as string;
    });
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${demoOtherChain.id.toString(16)}` }],
    });
    expect(changedTo).toBe(`0x${demoOtherChain.id.toString(16)}`);
    expect(await p.request({ method: "eth_chainId" })).toBe(`0x${demoOtherChain.id.toString(16)}`);
  });

  it("accountsChanged: updates the selected/exposed account", async () => {
    const p = provider();
    let selected: string[] | null = null;
    p.on("accountsChanged", (a) => {
      selected = a as string[];
    });
    p.__setAccounts([OTHER_ACCOUNT]);
    expect(selected).toEqual([OTHER_ACCOUNT]);
    expect(await p.request({ method: "eth_accounts" })).toEqual([OTHER_ACCOUNT]);
  });

  it("a signature recovering to a DIFFERENT account than the message wallet is rejected", async () => {
    const p = provider();
    // The provider signs with its only key (LOCAL_TEST_ADDRESS), but the message claims OTHER_ACCOUNT.
    const signed = await signDeclaration(p, OTHER_ACCOUNT);
    const verdict = await verifyDeclaration(signed, policy);
    expect(verdict).toMatchObject({ ok: false, reason: "wrong-signer" });
  });

  it("the same signature IS accepted for the account that actually signed", async () => {
    const p = provider();
    const signed = await signDeclaration(p, LOCAL_TEST_ADDRESS as Address);
    expect(await verifyDeclaration(signed, policy)).toEqual({ ok: true });
  });

  it("after accountsChanged, a signature from the PREVIOUS account no longer matches the new account", async () => {
    const p = provider();
    // Signature is produced while LOCAL_TEST_ADDRESS is active...
    const signed = await signDeclaration(p, LOCAL_TEST_ADDRESS as Address);
    expect(await verifyDeclaration(signed, policy)).toEqual({ ok: true });
    // ...then the wallet switches accounts. A declaration now REQUIRED to bind to OTHER_ACCOUNT would
    // carry wallet=OTHER_ACCOUNT, but the only signable key still recovers to LOCAL_TEST_ADDRESS → reject.
    p.__setAccounts([OTHER_ACCOUNT]);
    const rebind = await signDeclaration(p, OTHER_ACCOUNT);
    expect(await verifyDeclaration(rebind, policy)).toMatchObject({
      ok: false,
      reason: "wrong-signer",
    });
  });

  it("disconnect: exposes no accounts (signing/writes have no signer)", async () => {
    const p = provider();
    expect(await p.request({ method: "eth_accounts" })).toEqual([LOCAL_TEST_ADDRESS]);
    let disconnected = false;
    p.on("disconnect", () => {
      disconnected = true;
    });
    p.__disconnect();
    expect(disconnected).toBe(true);
    expect(await p.request({ method: "eth_accounts" })).toEqual([]);
  });

  it("reconnect does NOT silently re-establish consent — only an explicit request re-exposes accounts", async () => {
    const p = provider();
    p.__disconnect();
    // A passive read still sees nothing (no silent reconnect).
    expect(await p.request({ method: "eth_accounts" })).toEqual([]);
    // Explicit consent (eth_requestAccounts) is required to re-expose the account.
    expect(await p.request({ method: "eth_requestAccounts" })).toEqual([LOCAL_TEST_ADDRESS]);
    expect(await p.request({ method: "eth_accounts" })).toEqual([LOCAL_TEST_ADDRESS]);
  });

  it("a rejected chain switch preserves the current (wrong) chain", async () => {
    const p = provider(makeDemoState({ chainId: 1, switchChainRejects: true }));
    await expect(
      p.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${robinhoodChain.id.toString(16)}` }],
      }),
    ).rejects.toThrow();
    expect(await p.request({ method: "eth_chainId" })).toBe("0x1");
  });

  it("the deterministic key is confined to the provider (never re-exported for app use)", async () => {
    // The signing key is only reachable THROUGH the provider's request surface; there is no exported
    // account/private key on the provider object itself.
    const p = provider();
    expect((p as unknown as Record<string, unknown>).privateKey).toBeUndefined();
    expect((p as unknown as Record<string, unknown>).account).toBeUndefined();
    // Signing still works, but exclusively via the EIP-1193 request method.
    const sig = await p.request({
      method: "eth_signTypedData_v4",
      params: [
        LOCAL_TEST_ADDRESS,
        JSON.stringify({
          domain: { ...DECLARATION_DOMAIN, chainId: ROBINHOOD_CHAIN_ID },
          types: DECLARATION_TYPES,
          primaryType: "Declaration",
          message: {
            wallet: LOCAL_TEST_ADDRESS,
            documentHash: DOC_HASH,
            documentVersion: "1",
            nonce: "7",
            expiry: "5000000000",
          },
        }),
      ],
    });
    expect(sig).toMatch(/^0x[0-9a-f]+$/i);
  });
});
