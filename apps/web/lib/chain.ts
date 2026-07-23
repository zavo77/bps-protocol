import { defineChain } from "viem";

// Robinhood Chain (id 4663). RPC URLs are NOT hardcoded to a production endpoint — the public
// rate-limited dev RPC is a fallback only, and live mode must be pointed at a configured production RPC.
export const ROBINHOOD_CHAIN_ID = 4663 as const;

export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] }, // dev/fallback only
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://explorer.mainnet.chain.robinhood.com" },
  },
});

// A second, clearly non-production chain used ONLY so the local demo can start on the "wrong" network
// and exercise the switch-to-4663 flow. Never a real network.
export const demoOtherChain = defineChain({
  id: 1,
  name: "Other Network (demo)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://localhost:0"] } },
});
