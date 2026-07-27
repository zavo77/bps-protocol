"use client";
import { useAccount, useChainId } from "wagmi";
import { CHAIN_ID, type LabPublicConfig, type WalletUiState } from "@bps/launch-lab";

/**
 * Client-derivable WalletUiState. The creator allowlist is server-private, so
 * 'unauthorised' can NEVER be derived client-side — treat it as unknown here.
 * Only when an API call returned 401 AUTH_NOT_ALLOWLISTED do callers pass
 * `options.unauthorised: true` to surface that state.
 */
export function useWalletUiState(
  config?: LabPublicConfig | null,
  options?: { unauthorised?: boolean },
): WalletUiState {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const requiredChain: number = config?.chainId ?? CHAIN_ID;
  if (!isConnected) return "disconnected";
  if (chainId !== requiredChain) return "wrong-chain";
  if (options?.unauthorised) return "unauthorised";
  return "connected";
}
