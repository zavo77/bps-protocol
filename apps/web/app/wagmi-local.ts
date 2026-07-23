"use client";
// Single shared LOCAL-mode wiring for the running app (Task 8C). One mock chain state + wagmi config
// built from the AUTHORITATIVE EIP-1193 mock provider (via the injected connector). Wallet connect,
// network switch, typed-data signing and transactions all flow through the connector/provider exactly as
// a production injected wallet would. LOCAL DEMONSTRATION only — never a live RPC/wallet. The provider
// reports chain 1 initially (authoritative wrong network) so the connect → switch-to-4663 flow is real.
import { type Address } from "viem";
import { ROBINHOOD_CHAIN_ID } from "../lib/chain";
import { LOCAL_TEST_ADDRESS } from "../lib/testing/local-account";
import { createLocalWagmiConfig, makeDemoState } from "../lib/testing/local-env";

export const demoState = makeDemoState({ chainId: 1 });
export const demoAccount: Address = LOCAL_TEST_ADDRESS;
export const ROBINHOOD_ID = ROBINHOOD_CHAIN_ID;

export const localWagmiConfig = createLocalWagmiConfig(demoState);
