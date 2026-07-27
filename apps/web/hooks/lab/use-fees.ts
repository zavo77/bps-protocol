"use client";
// Contract-backed creator fees for one lab market + a wallet-signed claim.
//
// Read:  GET /api/lab/fees/[token]?beneficiary=<connected> → PendingFees (amounts
//        come straight from MulticurvePool.getPendingFees; claimability is NEVER
//        inferred from volume). A 404 NOT_A_LAB_MARKET is surfaced as "no fees".
// Claim: sign a 'prepare-trade' envelope over {tokenAddress,beneficiary} → POST
//        /api/lab/fees/claim/prepare (server re-reads pending fees and refuses
//        with 409 NOTHING_CLAIMABLE when there is nothing to claim) → send the
//        returned collectFees(poolId) tx from the connected beneficiary wallet →
//        wait for the receipt → refetch. No server signer; only the beneficiary
//        signs. Nothing is ever fabricated or estimated.
import { useCallback, useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useSendTransaction } from "wagmi";
import { CHAIN_ID, type PendingFees } from "@bps/launch-lab";
import { LabApiError, errorMessage, labFetch } from "./api";
import { useSignedRequest } from "./use-signed-request";

export type FeesUiState =
  "idle" | "loading" | "no-fees" | "claimable" | "signing" | "pending" | "success" | "failure";

/** Local claim lifecycle; the read state is derived from the query otherwise. */
type ClaimPhase = "idle" | "signing" | "pending" | "success" | "failure";

interface ClaimPrepareResponse {
  pending: PendingFees;
  transaction: { chainId: number; from: Address; to: Address; data: Hex; value: string };
}

export interface UseFees {
  state: FeesUiState;
  fees: PendingFees | null;
  hasClaimable: boolean;
  txHash: Hex | null;
  error: string | null;
  isConnected: boolean;
  /** True only when contract-backed pending fees exist and no claim is in flight. */
  canClaim: boolean;
  claim: () => Promise<void>;
  refetch: () => void;
}

export function useFees(tokenAddress: string, options?: { enabled?: boolean }): UseFees {
  const enabled = options?.enabled ?? true;
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const signRequest = useSignedRequest();

  const [phase, setPhase] = useState<ClaimPhase>("idle");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tokenOk = isAddress(tokenAddress);
  const queryEnabled = enabled && isConnected && Boolean(address) && tokenOk;

  const query: UseQueryResult<PendingFees | null, Error> = useQuery({
    queryKey: ["lab", "fees", tokenAddress.toLowerCase(), address?.toLowerCase() ?? "none"],
    enabled: queryEnabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PendingFees | null> => {
      try {
        return await labFetch<PendingFees>(`/api/lab/fees/${tokenAddress}?beneficiary=${address}`);
      } catch (e) {
        // A non-lab market (or unreadable fees) is honestly "no fees", not an error.
        if (e instanceof LabApiError && e.code === "NOT_A_LAB_MARKET") return null;
        throw e;
      }
    },
  });

  const fees = query.data ?? null;
  const hasClaimable = fees?.hasClaimable === true;

  const claim = useCallback(async () => {
    setError(null);
    setTxHash(null);
    if (!address || !isAddress(tokenAddress) || !publicClient) {
      setError("Connect the beneficiary wallet to claim.");
      setPhase("failure");
      return;
    }
    // Sign and POST the exact same payload the server re-canonicalizes and hashes.
    const payload = { tokenAddress: getAddress(tokenAddress), beneficiary: getAddress(address) };
    try {
      setPhase("signing");
      const envelope = await signRequest("prepare-trade", payload);
      const prep = await labFetch<ClaimPrepareResponse>("/api/lab/fees/claim/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ envelope, payload }),
      });
      const hash = await sendTransactionAsync({
        to: prep.transaction.to,
        data: prep.transaction.data,
        value: 0n,
        chainId: CHAIN_ID,
      });
      setTxHash(hash);
      setPhase("pending");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        setPhase("success");
        void query.refetch();
      } else {
        setPhase("failure");
        setError("Claim transaction reverted on-chain.");
      }
    } catch (e) {
      setPhase("failure");
      setError(errorMessage(e));
    }
  }, [address, tokenAddress, publicClient, signRequest, sendTransactionAsync, query]);

  const state: FeesUiState = (() => {
    if (phase === "signing") return "signing";
    if (phase === "pending") return "pending";
    if (phase === "success") return "success";
    if (phase === "failure") return "failure";
    if (!queryEnabled) return "idle";
    if (query.isPending && query.fetchStatus !== "idle") return "loading";
    return hasClaimable ? "claimable" : "no-fees";
  })();

  const canClaim = hasClaimable && phase !== "signing" && phase !== "pending";

  return {
    state,
    fees,
    hasClaimable,
    txHash,
    error,
    isConnected,
    canClaim,
    claim,
    refetch: () => void query.refetch(),
  };
}
