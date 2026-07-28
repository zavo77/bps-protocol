"use client";
import { useAccount } from "wagmi";
import { CHAIN_ID, type LabPublicConfig, type WalletUiState } from "@bps/launch-lab";

/**
 * Client-derivable WalletUiState. The creator allowlist is server-private, so
 * 'unauthorised' can NEVER be derived client-side — treat it as unknown here.
 * Only when an API call returned 401 AUTH_NOT_ALLOWLISTED do callers pass
 * `options.unauthorised: true` to surface that state.
 *
 * Chain detection uses the WALLET's actual chain (`useAccount().chainId`) —
 * NEVER wagmi's `useChainId()`, which returns the app config's chain and
 * cannot see that an injected wallet is on Ethereum Mainnet (the live P0:
 * wrong-chain was never detected, and launching threw a raw ChainMismatchError).
 */
export function useWalletUiState(
  config?: LabPublicConfig | null,
  options?: { unauthorised?: boolean },
): WalletUiState {
  const { isConnected, chainId: walletChainId } = useAccount();
  const requiredChain: number = config?.chainId ?? CHAIN_ID;
  if (!isConnected) return "disconnected";
  if (walletChainId !== requiredChain) return "wrong-chain";
  if (options?.unauthorised) return "unauthorised";
  return "connected";
}
