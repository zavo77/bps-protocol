import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  // Two honest components — NEVER summed into a single "Liquidity" number.
  poolReserveUsd: "11.2079",
  curveInventoryValueUsd: "1049947500",
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
    /** transaction.from — the wallet shown in the Wallet column. */
    trader: "0x59D0e50779e5D9C4b2c4fdBb5e0AaB9a1B4e56aD",
    /** Decoded Swap event sender (a router) — detail only, never the wallet. */
    eventSender: "0x9eB7f2591E8f2f3860d1a1bbcCEc0BA9d5c40BdC",
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

/** Honest default: the metadata endpoint has nothing for this token. */
const NO_METADATA = {
  available: false,
  name: null,
  description: null,
  imageUrl: null,
  tokenUri: null,
  source: null,
  fetchedAt: 1_753_600_000_000,
};

function stubLabFetch(
  snapshot: unknown,
  history?: { swaps: unknown[] },
  metadata: unknown = NO_METADATA,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/metadata")) {
        return {
          status: 200,
          json: async () => ({ ok: true, data: metadata }),
        } as unknown as Response;
      }
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

    // No metadata artwork → neutral monogram placeholder, never a stand-in image.
    expect(screen.getByTestId("token-artwork-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("token-artwork")).toBeNull();

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

  it("labels pool reserve and curve inventory value as separate rows — never summed, never 'Liquidity'", async () => {
    stubLabFetch(LIVE_SNAPSHOT);
    renderMarket();

    await waitFor(() =>
      expect(screen.getByTestId("stat-pool-reserve")).toHaveTextContent("$11.21"),
    );
    expect(screen.getByText("Pool reserve")).toBeInTheDocument();
    expect(screen.getByText("Curve inventory value")).toBeInTheDocument();
    expect(screen.getByTestId("stat-curve-inventory")).toHaveTextContent("$1.05B");
    // No stat is labelled "Liquidity" and the sum (11.2079 + 1049947500) is
    // never displayed anywhere.
    expect(screen.queryByText("Liquidity")).toBeNull();
    expect(screen.queryByTestId("stat-liquidity")).toBeNull();
    expect(document.body.textContent).not.toContain("1049947511");
  });

  it("labels the holder count 'Holder addresses' with its Blockscout source disclosed", async () => {
    stubLabFetch(LIVE_SNAPSHOT);
    renderMarket();

    await waitFor(() => expect(screen.getByTestId("stat-holders")).toHaveTextContent("7"));
    expect(screen.getByText("Holder addresses")).toBeInTheDocument();
    expect(screen.queryByText("Holders")).toBeNull();
    // The source is disclosed right next to the count.
    expect(screen.getByTestId("stat-holders")).toContainElement(
      screen.getByTestId("holders-source"),
    );
    expect(screen.getByTestId("holders-source")).toHaveTextContent("Blockscout");
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

  it("shows the trader's wallet (transaction.from) in the Wallet column — the router event sender is detail only", async () => {
    stubLabFetch(LIVE_SNAPSHOT);
    renderMarket();

    await waitFor(() =>
      expect(screen.getByTestId(`trade-wallet-${LIVE_BUY_TX}`)).toBeInTheDocument(),
    );
    expect(screen.getByRole("columnheader", { name: "Wallet" })).toBeInTheDocument();

    const wallet = screen.getByTestId(`trade-wallet-${LIVE_BUY_TX}`);
    // Shortened wallet address, linked to its Blockscout address page.
    expect(wallet).toHaveTextContent("0x59D0…56aD");
    expect(within(wallet).getByRole("link")).toHaveAttribute(
      "href",
      `https://robinhoodchain.blockscout.com/address/${TRADES[0]!.trader}`,
    );
    // The event sender (router) differs → exposed as labelled detail only.
    expect(wallet).toHaveAttribute(
      "title",
      `Event sender (router): ${TRADES[0]!.eventSender}`,
    );
    // The router address is never displayed as the wallet.
    expect(wallet.textContent).not.toContain("0x9eB7");
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

  it("uses metadata artwork when available, else a neutral monogram — never another token's artwork", async () => {
    const META = {
      available: true,
      name: "PRINT",
      description: "Genesis lab market",
      imageUrl: "https://example.com/artwork/print.png",
      tokenUri: "https://example.com/artwork/print.json",
      source: "token-uri",
      fetchedAt: 1_753_600_000_000,
    };
    stubLabFetch(LIVE_SNAPSHOT, undefined, META);
    const first = renderMarket();
    await waitFor(() =>
      expect(screen.getByTestId("token-artwork")).toHaveAttribute("src", META.imageUrl),
    );
    expect(screen.queryByTestId("token-artwork-placeholder")).toBeNull();
    first.unmount();
    vi.unstubAllGlobals();

    // No metadata → neutral monogram placeholder. The old hardcoded PRINT
    // artwork fallback is gone and must never return.
    stubLabFetch(LIVE_SNAPSHOT);
    renderMarket();
    await waitFor(() =>
      expect(screen.getByTestId("token-artwork-placeholder")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("token-artwork-placeholder")).toHaveTextContent("PRIN");
    expect(screen.queryByTestId("token-artwork")).toBeNull();
    expect(document.querySelector('img[src="/lab/print-token.png"]')).toBeNull();
  });
});

describe("PriceChart — anchor-denominated series", () => {
  /** sqrtPriceX96 = 2^96 → exactly 1 anchor per token (18/18 decimals). */
  const SWAP = {
    id: 1,
    poolId: `0x${"ab".repeat(32)}`,
    blockNumber: 8412345,
    txHash: LIVE_BUY_TX,
    amount0: "-57442260344809",
    amount1: "1000000000000000000000",
    sqrtPriceX96: "79228162514264337593543950336",
    tick: 0,
    fee: 10000,
    occurredAt: "2026-07-27T12:00:00.000Z",
  };

  function renderChart() {
    return render(
      <Providers config={makeConfig()}>
        <PriceChart
          address={TOKEN}
          tokenSymbol="PRINT"
          anchorSymbol="GOOGL"
          anchorIsCurrency0={true}
          anchorDecimals={18}
        />
      </Providers>,
    );
  }

  it("plots anchor-per-token from each swap's sqrtPriceX96 — the anchor USD midpoint is NEVER applied to historical points", async () => {
    stubLabFetch(LIVE_SNAPSHOT, { swaps: [SWAP] });
    renderChart();

    await waitFor(() =>
      expect(screen.getByTestId("price-chart-svg")).toHaveAttribute("data-point-count", "1"),
    );
    // 2^96 → exactly 1 GOOGL per PRINT. Under the banned retroactive USD
    // conversion this point would read 195.12 (1 × today's midpoint).
    const footer = screen.getByTestId("price-chart-footer");
    expect(footer).toHaveTextContent("1.00000 GOOGL per PRINT");
    expect(footer.textContent).not.toContain("195.12");
    expect(footer.textContent).not.toContain("$");
    // Axis and footer are anchor-denominated and disclose the USD rule.
    expect(screen.getByTestId("axis-unit")).toHaveTextContent("GOOGL per PRINT");
    expect(footer).toHaveTextContent(/derived from on-chain swaps/i);
    expect(footer).toHaveTextContent(/USD values shown elsewhere use the live GOOGL midpoint/i);
  });

  it("renders no launch-price baseline point — a single swap is a single real point", async () => {
    stubLabFetch(LIVE_SNAPSHOT, { swaps: [SWAP] });
    renderChart();

    await waitFor(() => expect(screen.getByTestId("price-chart-svg")).toBeInTheDocument());
    expect(screen.getAllByTestId("price-point")).toHaveLength(1);
    expect(document.querySelector("[data-baseline]")).toBeNull();
    expect(screen.queryByTestId("price-chart-empty")).toBeNull();
  });

  it("keeps the honest empty state when there are zero swaps", async () => {
    stubLabFetch(LIVE_SNAPSHOT, { swaps: [] });
    renderChart();

    await waitFor(() =>
      expect(screen.getByTestId("price-chart-empty")).toHaveTextContent(/Collecting market data/i),
    );
    expect(screen.queryByTestId("price-chart-svg")).toBeNull();
  });
});
