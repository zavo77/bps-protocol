"use client";
// Single shared LOCAL-mode wiring for the running app (Task 8B). One mock chain state + wagmi config,
// used by the providers and every panel so wallet/reads/writes all hit the same deterministic mock.
// This is LOCAL DEMONSTRATION wiring only — never a live RPC/wallet. The demo intentionally starts on a
// simulated wrong network so the connect → switch-to-4663 flow is exercised end to end.
import { createConfig, createStorage } from "wagmi";
import { mock } from "wagmi/connectors";
import { type Address } from "viem";
import { demoOtherChain, robinhoodChain, ROBINHOOD_CHAIN_ID } from "../lib/chain";
import { LOCAL_TEST_ADDRESS } from "../lib/testing/local-account";
import { makeDemoState } from "../lib/testing/local-env";
import { mockTransport } from "../lib/testing/mock-rpc";

// Shared mutable demo state. The transport reports chain 4663; the UI models the initial wrong-network
// state at the app level (see AppDashboard) so the switch-to-4663 flow is exercised.
export const demoState = makeDemoState();

export const demoAccount: Address = LOCAL_TEST_ADDRESS;
export const ROBINHOOD_ID = ROBINHOOD_CHAIN_ID;

const transport = mockTransport(demoState);

export const localWagmiConfig = createConfig({
  chains: [robinhoodChain, demoOtherChain],
  connectors: [mock({ accounts: [LOCAL_TEST_ADDRESS], features: {} })],
  transports: { [ROBINHOOD_CHAIN_ID]: transport, [demoOtherChain.id]: transport },
  multiInjectedProviderDiscovery: false,
  storage: createStorage({ storage: undefined }), // no persistence for the demo
  ssr: false,
});
