// Local demonstration environment (Task 8B, local/testing only). Assembles a deterministic mock chain
// state seeded for the LOCAL_DEMO manifest + the local-test account, plus the wagmi config and a viem
// public client wired to the mock transport. This is the SINGLE source of local-mode wiring used by the
// app, component tests, and the browser E2E. It is never mixed with a live RPC/http transport.
import { createConfig, type Config } from "wagmi";
import { mock } from "wagmi/connectors";
import {
  createWalletClient,
  custom,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { localTestAccount } from "./local-account";
import { demoOtherChain, robinhoodChain, ROBINHOOD_CHAIN_ID } from "../chain";
import { LOCAL_DEMO_MANIFEST } from "../fixtures";
import { LOCAL_TEST_ADDRESS } from "./local-account";
import { mockTransport, type MockChainState } from "./mock-rpc";

export const DEMO_WETH = LOCAL_DEMO_MANIFEST.external.weth.address as Address;
export const DEMO_BPS = LOCAL_DEMO_MANIFEST.actual.bpsToken as Address;
export const DEMO_STOCK = "0x00000000000000000000000000000000000aaaa1" as Address; // fixture stock (AAPL)
export const DEMO_CYCLE_ID = 42n;
export const DEMO_DISTRIBUTION = 1600n * 10n ** 18n;

export function makeDemoState(overrides: Partial<MockChainState> = {}): MockChainState {
  const me = LOCAL_TEST_ADDRESS.toLowerCase();
  const router = LOCAL_DEMO_MANIFEST.actual.tradeRouter!.toLowerCase();
  const vault = LOCAL_DEMO_MANIFEST.actual.lockingVault!.toLowerCase();
  const code: Record<string, boolean> = {};
  for (const v of Object.values(LOCAL_DEMO_MANIFEST.actual)) if (v) code[v.toLowerCase()] = true;
  code[DEMO_WETH.toLowerCase()] = true;
  code[DEMO_STOCK.toLowerCase()] = true;
  return {
    chainId: ROBINHOOD_CHAIN_ID,
    blockNumber: 100n,
    accounts: [LOCAL_TEST_ADDRESS],
    code,
    erc20: {
      [DEMO_WETH.toLowerCase()]: {
        decimals: 18,
        balances: { [me]: 5n * 10n ** 18n },
        allowances: { [`${me}:${router}`]: 0n },
      },
      [DEMO_BPS.toLowerCase()]: {
        decimals: 18,
        balances: { [me]: 100_000n * 10n ** 18n },
        allowances: { [`${me}:${router}`]: 0n, [`${me}:${vault}`]: 0n },
      },
    },
    routerPaused: false,
    claimRemaining: { [`${DEMO_CYCLE_ID}:${DEMO_STOCK.toLowerCase()}`]: DEMO_DISTRIBUTION },
    claimed: {},
    logs: [],
    switchChainRejects: false,
    sendRejects: false,
    revertOnSimulate: false,
    ...overrides,
  };
}

/**
 * LOCAL-mode wallet client: the connected demo account IS the local-test account, so in local/demo mode
 * we sign+send via a viem wallet client over the SAME mock transport as `pub` (the wagmi mock connector
 * deliberately does not forward eth_sendTransaction). Live mode uses the user's injected wallet instead.
 */
export function createDemoWalletClient(pub: PublicClient): WalletClient {
  return createWalletClient({
    account: localTestAccount,
    chain: robinhoodChain,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: custom({ request: (pub.transport as any).request }),
  });
}

/** wagmi config using the mock connector + mock transport, for component tests. */
export function createLocalWagmiConfig(state: MockChainState): Config {
  const transport = mockTransport(state);
  return createConfig({
    chains: [robinhoodChain, demoOtherChain],
    connectors: [mock({ accounts: [LOCAL_TEST_ADDRESS], features: {} })],
    transports: { [ROBINHOOD_CHAIN_ID]: transport, [demoOtherChain.id]: transport },
    multiInjectedProviderDiscovery: false,
    ssr: false,
  });
}
