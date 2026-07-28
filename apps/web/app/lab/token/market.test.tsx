import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createConfig, http } from "wagmi";
import { FEE_PRESETS } from "@bps/launch-lab";
import { robinhoodChain } from "../../../lib/chain";
import { Providers } from "../../providers";
import { TokenMarketView } from "./[tokenAddress]/TokenMarketView";
import { PriceChart } from "./[tokenAddress]/PriceChart";

function makeConfig() {
  return createConfig({
    chains: [robinhoodChain],
    connectors: [],
    transports: { [robinhoodChain.id]: http("http://localhost:0") },
    multiInjectedProviderDiscovery: false,
    ssr: false,
  });
}

const TOKEN = "0x1111111111111111111111111111111111111111";
/** The live first test buy on PRINT/GOOGL — must render in the trades table. */
const LIVE_BUY_TX = "0xdc37b4921884ba1a256e694f9c2a718af815adf7a9535b6c11b3d993883ea9ba";

const ANCHOR = {
  status: "verified",
  symbol: "GOOGL",
  address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
  name: "Alphabet Class A Robinhood Token",
  decimals: 18,
  currentMultiplier: "1.000000000000000000",
  midPriceUsd: "195.12",
  bidUsd: "195.00",
  askUsd: "195.24",
  fetchedAt: 1_753_600_000_000,
};

const UNAVAILABLE = { available: false, reason: "awaiting-indexed-data" } as const;

/** Ledger-derived stats fixture (EnrichedMarketSnapshot.stats). */
const STATS = {
  anchorIsCurrency0: true,
  poolId: `0x${"ab".repeat(32)}`,
  lastSqrtPriceX96: "79228162514264337593543950336",
  priceAnchorPerToken: "0.005381",
  priceTokenPerAnchor: "185.83",
  priceUsd: "1.05",
  startingPriceUsd: "0.0205",
  fdvUsd: "21000000",
  circulatingSupplyWei: "50000000000000000000000",
  marketCapUsd: "52500",
  anchorReserveWei: "57442260344809",
  remainingInventoryWei: "999950000000000000000000000",
  liquidityUsd: "20521.55",
  windows: {
    "5m": { volumeUsd: "0", buys: 0, sells: 0, priceChangePct: null },
    "1h": { volumeUsd: "11.2079", buys: 1, sells: 0, priceChangePct: null },
    "6h": { volumeUsd: "11.2079", buys: 1, sells: 0, priceChangePct: null },
    "24h": { volumeUsd: "44.83", buys: 3, sells: 1, priceChangePct: "2.35" },
    all: { volumeUsd: "44.83", buys: 3, sells: 1, priceChangePct: "2.35" },
  },
  lastTradeAt: "2026-07-27T12:00:00.000Z",
  swapCount: 4,
};

const TRADES = [
  {
    txHash: LIVE_BUY_TX,
    blockNumber: "8412345",
    occurredAt: "2026-07-27T12:00:00.000Z",
    side: "buy",
    tokenAmountWei: "1000000000000000000000",
    anchorAmountWei: "57442260344809",
    usdValue: "11.2079",
    priceUsdAtTrade: "1.05",
    trader: "0x59D0e50779e5D9C4b2c4fdBb5e0AaB9a1B4e56aD",
  },
];

const DEX_PAIR = {
  url: "https://dexscreener.com/robinhoodchain/0x9999999999999999999999999999999999999999",
  priceUsd: "1.05",
  priceNative: "0.005381",
  liquidityUsd: 20521.55,
  fdv: 21000000,
  marketCap: 52500,
  volume24h: 44.83,
  txns24h: { buys: 3, sells: 1 },
  priceChange24h: 2.35,
  pairCreatedAt: 1_753_500_000_000,
  dexId: "uniswap",
};

/** Enriched snapshot with NO indexed data yet (stats null, no trades). */
const EMPTY_SNAPSHOT = {
  tokenAddress: TOKEN,
  tokenName: "PRINT",
  tokenSymbol: "PRINT",
  tokenUri: UNAVAILABLE,
  creator: UNAVAILABLE,
  totalSupply: UNAVAILABLE,
  anchor: ANCHOR,
  poolId: UNAVAILABLE,
  poolStatus: UNAVAILABLE,
  anchorReserve: UNAVAILABLE,
  remainingTokenInventory: UNAVAILABLE,
  currentPriceUsd: UNAVAILABLE,
  startingPriceUsd: UNAVAILABLE,
  currentFdvUsd: UNAVAILABLE,
  feePreset: UNAVAILABLE,
  exactPoolFeeUnits: UNAVAILABLE,
  beneficiaries: UNAVAILABLE,
  launchTransactionHash: UNAVAILABLE,
  launchBlock: null,
  launchedAt: null,
  provenanceVerified: false,
  stats: null,
  trades: [],
  holderCount: null,
  dexScreener: null,
  explorerTokenUrl: `https://robinhoodchain.blockscout.com/token/${TOKEN}`,
  fetchedAt: 1_753_600_000_000,
};

/** Enriched snapshot with a live market: stats, trades, holders, provenance. */
const LIVE_SNAPSHOT = {
  ...EMPTY_SNAPSHOT,
  creator: { available: true, value: "0x59D0e50779e5D9C4b2c4fdBb5e0AaB9a1B4e56aD" },
  totalSupply: { available: true, value: "1000000000000000000000000000" },
  poolId: { available: true, value: STATS.poolId },
  poolStatus: { available: true, value: 2 },
  anchorReserve: { available: true, value: STATS.anchorReserveWei },
  remainingTokenInventory: { available: true, value: STATS.remainingInventoryWei },
  currentPriceUsd: { available: true, value: STATS.priceUsd },
  startingPriceUsd: { available: true, value: STATS.startingPriceUsd },
  currentFdvUsd: { available: true, value: STATS.fdvUsd },
  exactPoolFeeUnits: { available: true, value: 10_000 },
  launchTransactionHash: { available: true, value: `0x${"cd".repeat(32)}` },
  launchBlock: "8400000",
  launchedAt: "2026-07-26T12:00:00.000Z",
  provenanceVerified: true,
  stats: STATS,
  trades: TRADES,
  holderCount: 7,
  dexScreener: null,
};

const LAB_CONFIG = {
  chainId: 4663,
  enabled: true,
  broadcastEnabled: false,
  killSwitchActive: true,
  accessMode: "public",
  defaultFeePreset: "BALANCED_1",
  feePresets: [...FEE_PRESETS],
  startingFdvUsd: 20_500,
  anchorSymbol: "GOOGL",
  bpsFeeAddress: null,
  explorerBaseUrl: "https://robinhoodchain.blockscout.com",
  publicBeta: {
    maxLaunchesPerWallet: 2,
    launchCooldownSeconds: 3_600,
    publicDailyLaunchCap: 25,
    launchesToday: null,
  },
  genesis: { launched: false, tokenAddress: null },
};

function stubLabFetch(snapshot: unknown, history?: { swaps: unknown[] }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/lab/token/")) {
        return {
          status: 200,
          json: async () => ({ ok: true, data: snapshot }),
        } as unknown as Response;
      }
      if (url.includes("/api/lab/history/")) {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            data: { available: true, swaps: history?.swaps ?? [] },
          }),
        } as unknown as Response;
      }
      if (url.includes("/api/lab/config")) {
        return {
          status: 200,
          json: async () => ({ ok: true, data: LAB_CONFIG }),
        } as unknown as Response;
      }
      return {
        status: 404,
        json: async () => ({ ok: false, error: "not found", code: "NOT_FOUND" }),
      } as unknown as Response;
    }),
  );
}

function renderMarket() {
  return render(
    <Providers config={makeConfig()}>
      <TokenMarketView address={TOKEN} />
    </Providers>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Launch Lab token market page", () => {
  it("renders honest compact placeholders (— / No trades yet) when stats is null — never 'awaiting indexed data', never zero", async () => {
    stubLabFetch(EMPTY_SNAPSHOT);
    renderMarket();

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("PRINT"),
    );

    // The generic awaiting-indexed-data treatment is gone for snapshot values.
    expect(screen.queryByText("awaiting indexed data")).toBeNull();

    // Stat strip: honest compact placeholders, plus the No-trades note.
    expect(screen.getByTestId("stat-price")).toHaveTextContent("—");
    expect(screen.getByTestId("stat-market-cap")).toHaveTextContent("—");
    expect(screen.getByTestId("stat-holders")).toHaveTextContent("—");
    expect(screen.getByTestId("no-trades-note")).toHaveTextContent("No trades yet");
    expect(screen.getByTestId("trades-empty")).toHaveTextContent("No trades yet");

    // Market details is collapsed by default (never leads with pool ids).
    expect(screen.getByTestId("market-details")).not.toHaveAttribute("open");

    // The embedded trade card is the primary control; the Matcha link is the
    // clearly secondary "Advanced" link. Disconnected wallet prompts connect.
    const external = screen.getByTestId("trade-external");
    expect(external).toHaveAttribute("href", "https://matcha.xyz");
    expect(external.tagName).toBe("A");
    expect(external).toHaveTextContent(/Advanced/i);
    expect(screen.getByTestId("trade-card")).toBeInTheDocument();
    expect(screen.getByTestId("trade-connect")).toBeInTheDocument();

    // Blockscout link uses the snapshot's explorerTokenUrl verbatim.
    expect(screen.getByTestId("token-blockscout")).toHaveAttribute(
      "href",
      `https://robinhoodchain.blockscout.com/token/${TOKEN}`,
    );
  });

  it("stat strip shows price, FDV, and market cap from the snapshot stats", async () => {
    stubLabFetch(LIVE_SNAPSHOT);
    renderMarket();

    await waitFor(() => expect(screen.getByTestId("stat-price")).toHaveTextContent("$1.05"));
    expect(screen.getByTestId("stat-fdv")).toHaveTextContent("$21.00M");
    expect(screen.getByTestId("stat-market-cap")).toHaveTextContent("$52.5K");
    expect(screen.getByTestId("stat-change-24h")).toHaveTextContent("+2.35%");
    expect(screen.getByTestId("stat-holders")).toHaveTextContent("7");
    // 24h buy/sell window counts in the trades header.
    expect(screen.getByTestId("trades-24h-counts")).toHaveTextContent("24h: 3 buys · 1 sell");
  });

  it("renders the live test buy in the recent-trades table with its Blockscout tx link", async () => {
    stubLabFetch(LIVE_SNAPSHOT);
    renderMarket();

    await waitFor(() =>
      expect(screen.getByTestId(`trade-row-${LIVE_BUY_TX}`)).toBeInTheDocument(),
    );
    const row = screen.getByTestId(`trade-row-${LIVE_BUY_TX}`);
    expect(row).toHaveTextContent("Buy");
    expect(screen.getByTestId(`trade-side-${LIVE_BUY_TX}`)).toHaveClass("lab-pill--good");
    expect(screen.getByTestId(`trade-tx-${LIVE_BUY_TX}`)).toHaveAttribute(
      "href",
      `https://robinhoodchain.blockscout.com/tx/${LIVE_BUY_TX}`,
    );
    // USD value and execution price come from the trade record.
    expect(row).toHaveTextContent("$11.21");
    expect(row).toHaveTextContent("$1.05");
  });

  it("shows 'DEX Screener indexing…' while dexScreener is null and the verbatim link once present", async () => {
    stubLabFetch({ ...LIVE_SNAPSHOT, dexScreener: null });
    const first = renderMarket();
    await waitFor(() =>
      expect(screen.getByTestId("dexscreener-indexing")).toHaveTextContent(
        "DEX Screener indexing…",
      ),
    );
    expect(screen.queryByTestId("dexscreener-link")).toBeNull();
    first.unmount();
    vi.unstubAllGlobals();

    stubLabFetch({ ...LIVE_SNAPSHOT, dexScreener: DEX_PAIR });
    renderMarket();
    await waitFor(() => expect(screen.getByTestId("dexscreener-link")).toBeInTheDocument());
    // The pair link is used VERBATIM — never constructed or guessed.
    expect(screen.getByTestId("dexscreener-link")).toHaveAttribute("href", DEX_PAIR.url);
    expect(screen.getByTestId("dexscreener-link")).toHaveTextContent("DEX Screener ↗");
    expect(screen.queryByTestId("dexscreener-indexing")).toBeNull();
  });

  it("uses the dynamic anchor symbol everywhere — an NVDA-anchored market never says GOOGL", async () => {
    const nvdaAnchor = {
      ...ANCHOR,
      symbol: "NVDA",
      name: "NVIDIA Robinhood Token",
      address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
      midPriceUsd: "1180.55",
    };
    stubLabFetch({ ...LIVE_SNAPSHOT, anchor: nvdaAnchor });
    renderMarket();

    await waitFor(() => expect(screen.getByTestId("pair-line")).toHaveTextContent("PRINT / NVDA"));
    expect(screen.getByTestId("anchor-status-pill")).toHaveTextContent("NVDA anchor verified");
    expect(screen.getByTestId("trade-anchor-framing")).toHaveTextContent(
      "Market anchored to NVDA",
    );
    // The trades table quotes the anchor column dynamically.
    expect(screen.getByTestId(`trade-row-${LIVE_BUY_TX}`)).toHaveTextContent("NVDA");
    // Nothing on the page is hard-coded to GOOGL.
    expect(screen.queryAllByText(/GOOGL/)).toHaveLength(0);
  });
});

describe("PriceChart — launch-price baseline", () => {
  it("renders the chart from the launch baseline plus a single swap (baseline → first trade line)", async () => {
    const swap = {
      id: 1,
      poolId: `0x${"ab".repeat(32)}`,
      blockNumber: 8412345,
      txHash: LIVE_BUY_TX,
      amount0: "-57442260344809",
      amount1: "1000000000000000000000",
      sqrtPriceX96: "79228162514264337593543950336", // 2^96 → 1 anchor per token
      tick: 0,
      fee: 10000,
      occurredAt: "2026-07-27T12:00:00.000Z",
    };
    stubLabFetch(LIVE_SNAPSHOT, { swaps: [swap] });

    render(
      <Providers config={makeConfig()}>
        <PriceChart
          address={TOKEN}
          tokenSymbol="PRINT"
          anchorSymbol="GOOGL"
          anchorIsCurrency0={true}
          anchorDecimals={18}
          anchorMidUsd="195.12"
          startingPriceUsd="0.0205"
          launchedAt="2026-07-26T12:00:00.000Z"
        />
      </Providers>,
    );

    // Baseline + one swap = a two-point line, honestly rendered. (The baseline
    // renders immediately; the swap point arrives when the history query lands.)
    await waitFor(() =>
      expect(screen.getByTestId("price-chart-svg")).toHaveAttribute("data-point-count", "2"),
    );
    const points = screen.getAllByTestId("price-point");
    expect(points).toHaveLength(2);
    expect(points[0]).toHaveAttribute("data-baseline", "true");
    expect(screen.queryByTestId("price-chart-empty")).toBeNull();
  });

  it("keeps the honest empty state when there are zero swaps AND no baseline", async () => {
    stubLabFetch(LIVE_SNAPSHOT, { swaps: [] });

    render(
      <Providers config={makeConfig()}>
        <PriceChart address={TOKEN} tokenSymbol="PRINT" anchorSymbol="GOOGL" anchorMidUsd="195.12" />
      </Providers>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("price-chart-empty")).toHaveTextContent(/Collecting market data/i),
    );
    expect(screen.queryByTestId("price-chart-svg")).toBeNull();
  });
});
