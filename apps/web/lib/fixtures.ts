// Clearly-labeled LOCAL / DEMONSTRATION fixtures (Task 8). Nothing here is live data. Every fixture
// manifest carries `isFixture: true` so the deployment boundary keeps live writes disabled, and the UI
// must render these under an explicit "local / demonstration data" label. Addresses are fictional and
// well-formed but non-placeholder; they never represent a real deployment.
import type { DeploymentManifest } from "./manifest";
import type { TransparencyInputs } from "./transparency";
import type { FeedConfig } from "./oracle";

const F = (n: string): string => `0x${n.padEnd(40, "0")}`;

/** A dry-run (not broadcast-ready) manifest — resolves to "not-live". */
export const DRY_RUN_MANIFEST: DeploymentManifest = {
  schemaVersion: "1.0.0",
  chainId: 4663,
  sourceCommit: "dryrun-local",
  broadcastReady: false,
  mode: "local",
  isFixture: true,
  deployer: null,
  external: {
    weth: {
      address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      runtimeCodeHash: "0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353",
      status: "VERIFIED",
    },
    rialtoRegistry: {
      address: "0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E",
      runtimeCodeHash: "0xf8b9b92ca74f49f59f66ece51adb02dbefe254dcf967db586c4dda798268a01e",
      status: "VERIFIED",
    },
    swapRouter02: {
      address: "0xCaf681a66D020601342297493863E78C959E5cb2",
      runtimeCodeHash: "0x6f36c378e272c6324c48f045182bcb54bd8ad654cf9ebd42e8893d52c4cb25dc",
      status: "VERIFIED",
    },
  },
  predicted: {
    bpsToken: null,
    lockingVault: null,
    claimManager: null,
    rialtoAdapter: null,
    coordinator: null,
    stockVault: null,
    uniswapAdapter: null,
    tradeRouter: null,
  },
  actual: {
    bpsToken: null,
    lockingVault: null,
    claimManager: null,
    rialtoAdapter: null,
    coordinator: null,
    stockVault: null,
    uniswapAdapter: null,
    tradeRouter: null,
  },
};

/**
 * A LOCAL DEMO manifest with fictional-but-well-formed addresses so the flows can be exercised in the
 * UI/tests. `isFixture: true` keeps live writes DISABLED even though `broadcastReady` is true.
 */
export const LOCAL_DEMO_MANIFEST: DeploymentManifest = {
  ...DRY_RUN_MANIFEST,
  sourceCommit: "local-demo",
  broadcastReady: true,
  actual: {
    bpsToken: F("b95111"),
    lockingVault: F("10c11ade"),
    claimManager: F("c1a11de"),
    rialtoAdapter: F("a1a170ade"),
    coordinator: F("c00d11"),
    stockVault: F("57c0ade"),
    uniswapAdapter: F("111543ade"),
    tradeRouter: F("710de511"),
  },
};

export const SAMPLE_TRANSPARENCY: TransparencyInputs = {
  isFixture: true,
  trades: [
    {
      kind: "buy",
      stockBudget: 20n * 10n ** 18n,
      bpsBurned: 10_000n * 10n ** 18n,
      gross: 1000n * 10n ** 18n,
    },
    {
      kind: "sell",
      stockBudget: 4n * 10n ** 18n,
      bpsBurned: 4n * 10n ** 18n,
      gross: 200n * 10n ** 18n,
    },
  ],
  recorded: [
    {
      acquisitionId: 1n,
      stockToken: "AAPL",
      wethSpent: 20n * 10n ** 18n,
      acquiredStock: 2000n * 10n ** 18n,
      distributionAmount: 1600n * 10n ** 18n,
      reserveAmount: 400n * 10n ** 18n,
    },
  ],
  funded: [
    {
      acquisitionId: 1n,
      cycleId: 42n,
      stockToken: "AAPL",
      amount: 1600n * 10n ** 18n,
      merkleRoot: "0x1234000000000000000000000000000000000000000000000000000000000000",
    },
  ],
  cycleReads: [
    { cycleId: 42n, asset: "AAPL", remaining: 600n * 10n ** 18n, funded: 1600n * 10n ** 18n },
  ],
};

/** Fixture feed config — the proxy is a DEMO placeholder; a real feed address is source-backed config. */
export const SAMPLE_FEED: FeedConfig = {
  stockSymbol: "AAPL",
  proxy: F("feed"),
  decimals: 8,
  heartbeatSec: 3600,
  multiplier: 1,
  sourceUrl: "DEMO — real Chainlink proxy address is source-backed configuration (live blocker)",
};

export const FIXTURE_LABEL = "Local / demonstration data — not live on-chain state.";
