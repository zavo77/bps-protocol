// Local demonstration environment (Task 8B, local/testing only). Assembles a deterministic mock chain
// state seeded for the LOCAL_DEMO manifest + the local-test account, plus the wagmi config and a viem
// public client wired to the mock transport. This is the SINGLE source of local-mode wiring used by the
// app, component tests, and the browser E2E. It is never mixed with a live RPC/http transport.
import { createConfig, type Config } from "wagmi";
import { injected } from "wagmi/connectors";
import { type Address } from "viem";
import { demoOtherChain, robinhoodChain, ROBINHOOD_CHAIN_ID } from "../chain";
import { LOCAL_DEMO_MANIFEST } from "../fixtures";
import { LOCAL_TEST_ADDRESS } from "./local-account";
import { mockTransport, type MockChainState } from "./mock-rpc";
import { createMockEip1193Provider } from "./mock-eip1193";
import { encodeEventLog } from "../services/transparency-reads";
import {
  bpsTradeRouterAbi,
  distributionClaimManagerAbi,
  distributionFundingCoordinatorAbi,
} from "../abis";

// The demo fixture constants are defined in the KEY-FREE `lib/demo-fixture.ts` (safe for production) and
// re-exported here so existing test imports (`from "../testing/local-env"`) keep working unchanged.
export {
  DEMO_WETH,
  DEMO_BPS,
  DEMO_STOCK,
  DEMO_CYCLE_ID,
  DEMO_DISTRIBUTION,
  DEMO_PRELOCKED,
  DEMO_ROUTER,
  DEMO_COORDINATOR,
  DEMO_MANAGER,
  DEMO_SIBLING,
  DEMO_SIBLING_AMOUNT,
  DEMO_ROOT,
  DEMO_ACCOUNT_ADDRESS,
} from "../demo-fixture";

import {
  DEMO_WETH,
  DEMO_BPS,
  DEMO_STOCK,
  DEMO_CYCLE_ID,
  DEMO_DISTRIBUTION,
  DEMO_PRELOCKED,
  DEMO_ROUTER,
  DEMO_COORDINATOR,
  DEMO_MANAGER,
  DEMO_ROOT,
} from "../demo-fixture";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export function makeDemoState(overrides: Partial<MockChainState> = {}): MockChainState {
  const me = LOCAL_TEST_ADDRESS.toLowerCase();
  const router = DEMO_ROUTER.toLowerCase();
  const vault = LOCAL_DEMO_MANIFEST.actual.lockingVault!.toLowerCase();
  const stock = DEMO_STOCK.toLowerCase();
  const manager = DEMO_MANAGER.toLowerCase();
  const code: Record<string, boolean> = {};
  for (const v of Object.values(LOCAL_DEMO_MANIFEST.actual)) if (v) code[v.toLowerCase()] = true;
  code[DEMO_WETH.toLowerCase()] = true;
  code[stock] = true;
  const cyc = DEMO_CYCLE_ID.toString();
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
      [stock]: {
        decimals: 18,
        // The claim manager holds the funded distribution stock (balanceOf(manager)).
        balances: { [manager]: DEMO_DISTRIBUTION },
        allowances: {},
      },
    },
    routerPaused: false,
    claimRemaining: { [`${cyc}:${stock}`]: DEMO_DISTRIBUTION },
    claimed: {},
    lockedPrincipal: { [me]: DEMO_PRELOCKED },
    locks: { [me]: [DEMO_PRELOCKED] }, // pre-existing position id 0
    cycleRoot: { [cyc]: DEMO_ROOT },
    cyclePublished: { [cyc]: true },
    assetFunded: { [`${cyc}:${stock}`]: DEMO_DISTRIBUTION },
    acquisition: {
      status: 2, // FUNDED
      stockToken: DEMO_STOCK,
      wethSpent: 20n * 10n ** 18n,
      acquiredStock: 2000n * 10n ** 18n,
      distributionAmount: DEMO_DISTRIBUTION,
      reserveAmount: 400n * 10n ** 18n,
      cycleId: DEMO_CYCLE_ID,
    },
    logs: [],
    switchChainRejects: false,
    sendRejects: false,
    revertOnSimulate: false,
    receiptReverts: false,
    txCount: 0,
    ...overrides,
  };
}

/** Seed the state's logs with real ABI-encoded protocol events and append a Claimed event when a claim
 *  is applied — so the event-backed transparency view updates after a confirmed local action. */
export function installDemoTransparency(state: MockChainState): void {
  const me = LOCAL_TEST_ADDRESS as Address;
  const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
  state.logs = [
    encodeEventLog(
      bpsTradeRouterAbi as never,
      "OfficialBuy",
      {
        tradeId: 1n,
        trader: me,
        recipient: me,
        grossWethInput: 1000n * 10n ** 18n,
        stockBudget: 20n * 10n ** 18n,
        burnBudget: 10n * 10n ** 18n,
        userWethBudget: 970n * 10n ** 18n,
        userBpsOutput: 500n * 10n ** 18n,
        bpsBurned: 10_000n * 10n ** 18n,
        adapter: ZERO,
        stockBudgetRecipient: DEMO_STOCK,
      },
      { address: DEMO_ROUTER, blockNumber: 10n, transactionHash: tx(0xa1), logIndex: 0 },
    ),
    encodeEventLog(
      bpsTradeRouterAbi as never,
      "OfficialSell",
      {
        tradeId: 2n,
        trader: me,
        recipient: me,
        grossBpsInput: 300n * 10n ** 18n,
        grossWethOutput: 200n * 10n ** 18n,
        stockBudget: 4n * 10n ** 18n,
        burnBudget: 2n * 10n ** 18n,
        userWethOutput: 194n * 10n ** 18n,
        bpsBurned: 4n * 10n ** 18n,
        adapter: ZERO,
        stockBudgetRecipient: DEMO_STOCK,
      },
      { address: DEMO_ROUTER, blockNumber: 10n, transactionHash: tx(0xa4), logIndex: 1 },
    ),
    encodeEventLog(
      bpsTradeRouterAbi as never,
      "BpsRepurchasedAndBurned",
      { tradeId: 2n, wethSpent: 2n * 10n ** 18n, bpsBurned: 5n * 10n ** 18n },
      { address: DEMO_ROUTER, blockNumber: 10n, transactionHash: tx(0xa4), logIndex: 2 },
    ),
    encodeEventLog(
      bpsTradeRouterAbi as never,
      "StockBudgetDelivered",
      { tradeId: 1n, recipient: DEMO_STOCK, amount: 20n * 10n ** 18n },
      { address: DEMO_ROUTER, blockNumber: 10n, transactionHash: tx(0xa1), logIndex: 3 },
    ),
    encodeEventLog(
      distributionFundingCoordinatorAbi as never,
      "AcquisitionRecorded",
      {
        acquisitionId: 1n,
        stockToken: DEMO_STOCK,
        operator: me,
        wethSpent: 20n * 10n ** 18n,
        acquiredStock: 2000n * 10n ** 18n,
        distributionAmount: 1600n * 10n ** 18n,
        reserveAmount: 400n * 10n ** 18n,
      },
      { address: DEMO_COORDINATOR, blockNumber: 11n, transactionHash: tx(0xa2), logIndex: 0 },
    ),
    encodeEventLog(
      distributionFundingCoordinatorAbi as never,
      "AcquisitionFunded",
      {
        acquisitionId: 1n,
        cycleId: DEMO_CYCLE_ID,
        stockToken: DEMO_STOCK,
        amount: DEMO_DISTRIBUTION,
        merkleRoot: DEMO_ROOT,
        claimStart: 0n,
        claimDeadline: 4_000_000_000n,
      },
      { address: DEMO_COORDINATOR, blockNumber: 12n, transactionHash: tx(0xa3), logIndex: 0 },
    ),
  ];
  state.onApplied = (kind, args) => {
    if (kind === "claim") {
      state.logs.push(
        encodeEventLog(
          distributionClaimManagerAbi as never,
          "Claimed",
          {
            cycleId: args.cycleId as bigint,
            claimant: LOCAL_TEST_ADDRESS as Address,
            asset: DEMO_STOCK,
            amount: args.amount as bigint,
          },
          { address: DEMO_MANAGER, blockNumber: 20n, transactionHash: tx(0xb1), logIndex: 0 },
        ),
      );
    }
  };
}

/** wagmi config using an AUTHORITATIVE EIP-1193 mock provider (via the injected connector) + a mock read
 *  transport, for component tests and the app. All signing/sends go through the connector/provider — the
 *  provider holds the deterministic key internally; the app never imports it. */
export function createLocalWagmiConfig(state: MockChainState): Config {
  installDemoTransparency(state);
  const transport = mockTransport(state);
  // The connector target's provider type is the wagmi injected-provider shape; our EIP-1193 provider
  // implements the subset the connector uses. Cast once to satisfy the connector's broad type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = createMockEip1193Provider(state) as any;
  return createConfig({
    chains: [robinhoodChain, demoOtherChain],
    connectors: [
      injected({
        target: () => ({ id: "mockEip1193", name: "Mock EIP-1193 (local)", provider }),
      }),
    ],
    transports: { [ROBINHOOD_CHAIN_ID]: transport, [demoOtherChain.id]: transport },
    multiInjectedProviderDiscovery: false,
    ssr: false,
  });
}
