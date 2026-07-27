"use client";
// Builds and signs the /api/lab authentication envelope. The wallet signs the
// EIP-191 personal message = canonicalize(message) — the exact canonical JSON
// string the server re-canonicalizes and verifies (see @bps/launch-lab validation).
import { useCallback } from "react";
import { keccak256, stringToHex } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { canonicalize, CHAIN_ID, type SignedRequest } from "@bps/launch-lab";

/** Client-issued validity window (server rejects windows above 5 minutes). */
const SIGNATURE_VALIDITY_MS = 4 * 60_000;

export type SignedRequestAction = SignedRequest["message"]["action"];

export function useSignedRequest(): (
  action: SignedRequestAction,
  payload: unknown,
) => Promise<SignedRequest> {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  return useCallback(
    async (action: SignedRequestAction, payload: unknown): Promise<SignedRequest> => {
      if (!address) throw new Error("Connect a wallet before signing requests.");
      const payloadHash = keccak256(stringToHex(canonicalize(payload)));
      const issuedAt = Date.now();
      const message: SignedRequest["message"] = {
        action,
        wallet: address,
        chainId: CHAIN_ID,
        payloadHash,
        issuedAt,
        expiresAt: issuedAt + SIGNATURE_VALIDITY_MS,
        host: window.location.host,
      };
      const signature = await signMessageAsync({ message: canonicalize(message) });
      return { message, signature };
    },
    [address, signMessageAsync],
  );
}
