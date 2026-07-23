"use client";
// Production wagmi wiring (Task 9A §A). The running app uses ONLY the user's injected/production wallet
// through wagmi's `injected()` connector — there is NO deterministic mock provider, no local test account,
// and no deterministic signing material in this module or anything it imports. Reads use a configured
// production RPC (`NEXT_PUBLIC_BPS_RPC_URL`); absent that, the chain's rate-limited public dev RPC is a
// read-only fallback. There is NO mock fallback: with no injected wallet present the app simply cannot
// connect (fail closed). Live protocol writes remain separately gated by the deployment manifest.
import { createConfig, http, type Config } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodChain } from "../lib/chain";

const rpcUrl = process.env.NEXT_PUBLIC_BPS_RPC_URL || undefined;

export const productionWagmiConfig: Config = createConfig({
  chains: [robinhoodChain],
  connectors: [injected()],
  transports: { [robinhoodChain.id]: http(rpcUrl) },
  // Real EIP-6963 / injected-wallet discovery. No mock provider is ever registered.
  multiInjectedProviderDiscovery: true,
  ssr: true,
});

/**
 * Whether a real injected wallet is present in this environment. Production has NO mock fallback, so when
 * this is false the app must fail closed (offer no signer / no auto-connect) rather than substitute a
 * deterministic provider. Used by production-configuration tests and the connect UI.
 */
export function injectedWalletAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as { ethereum?: unknown }).ethereum !== "undefined"
  );
}
