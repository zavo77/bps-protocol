// Local demonstration wiring (Task 8B). Assembles the resolved deployment (a fixture manifest → live but
// isFixture, so LIVE writes stay disabled), a local mock eligibility service, the local-test declaration
// config, and a deterministic local proof-artifact provider. All clearly LOCAL DEMONSTRATION data.
import { type Address } from "viem";
import { LOCAL_DEMO_MANIFEST } from "../lib/fixtures";
import { resolveDeployment } from "../lib/manifest";
import { createLocalMockEligibilityService, LOCAL_TEST_DECLARATION_CONFIG } from "../lib/config";
import { createLocalProofProvider } from "../lib/proof/provider";
// Key-free demo fixtures only — no import of `lib/testing/*` or any deterministic key material.
import {
  DEMO_ACCOUNT_ADDRESS,
  DEMO_BPS,
  DEMO_STOCK,
  DEMO_WETH,
  DEMO_CYCLE_ID,
  DEMO_DISTRIBUTION,
} from "../lib/demo-fixture";
import { ROBINHOOD_CHAIN_ID } from "../lib/chain";

export const demoDeployment = resolveDeployment(LOCAL_DEMO_MANIFEST);
export const demoEligibilityService = createLocalMockEligibilityService([DEMO_ACCOUNT_ADDRESS]);
export const demoDeclarationConfig = LOCAL_TEST_DECLARATION_CONFIG;

export const DEMO = {
  weth: DEMO_WETH,
  bps: DEMO_BPS,
  stock: DEMO_STOCK,
  cycleId: DEMO_CYCLE_ID,
  distribution: DEMO_DISTRIBUTION,
  account: DEMO_ACCOUNT_ADDRESS,
  router: LOCAL_DEMO_MANIFEST.actual.tradeRouter as Address,
  lockingVault: LOCAL_DEMO_MANIFEST.actual.lockingVault as Address,
  claimManager: LOCAL_DEMO_MANIFEST.actual.claimManager as Address,
} as const;

export const demoProofProvider = createLocalProofProvider({
  chainId: ROBINHOOD_CHAIN_ID,
  claimManager: DEMO.claimManager,
  stockToken: DEMO.stock,
  stockSymbol: "AAPL",
  cycleId: DEMO.cycleId,
  account: DEMO.account,
  amount: DEMO.distribution,
  siblingAccount: "0x000000000000000000000000000000000000b0b0" as Address,
  siblingAmount: 1n,
});
