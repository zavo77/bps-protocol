import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createConfig, http } from "wagmi";
import { FEE_PRESETS } from "@bps/launch-lab";
import { robinhoodChain } from "../../lib/chain";
import { Providers } from "../providers";
import LabLandingPage from "./page";
import LabLayout from "./layout";

const DISCLOSURE =
  "Experimental independent market. BPS is not affiliated with or endorsed by Alphabet, Google, " +
  "Robinhood, Doppler or Uniswap. GOOGL refers to the canonical Alphabet Class A Robinhood Stock " +
  "Token used as the market's quote asset.";

function makeConfig() {
  return createConfig({
    chains: [robinhoodChain],
    connectors: [],
    transports: { [robinhoodChain.id]: http("http://localhost:0") },
    multiInjectedProviderDiscovery: false,
    ssr: false,
  });
}

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
    launchesToday: 3,
  },
  genesis: { launched: false, tokenAddress: null },
};

const LAUNCH_TX = `0x${"ab".repeat(32)}`;

const LAUNCH_RECORD = {
  tokenAddress: "0x2222222222222222222222222222222222222222",
  tokenName: "Example Token",
  tokenSymbol: "EXT",
  creator: "0x3333333333333333333333333333333333333333",
  numeraire: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
  poolOrHook: "0x4444444444444444444444444444444444444444",
  launchTransactionHash: LAUNCH_TX,
  blockNumber: "1234567",
  timestamp: 1_753_600_000,
};

const LAUNCH_RECORD_NO_CREATOR = {
  ...LAUNCH_RECORD,
  tokenAddress: "0x5555555555555555555555555555555555555555",
  tokenName: "Second Token",
  tokenSymbol: "SEC",
  creator: null,
  launchTransactionHash: `0x${"cd".repeat(32)}`,
};

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

function stubLabFetch(map: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      for (const [prefix, data] of Object.entries(map)) {
        if (url.includes(prefix)) {
          return { status: 200, json: async () => ({ ok: true, data }) } as unknown as Response;
        }
      }
      return {
        status: 404,
        json: async () => ({ ok: false, error: "not found", code: "NOT_FOUND" }),
      } as unknown as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Launch Lab landing", () => {
  it("layout renders the required disclosure footer verbatim", () => {
    stubLabFetch({ "/api/lab/config": LAB_CONFIG, "/api/lab/anchor/googl": ANCHOR });
    render(
      <LabLayout>
        <div data-testid="child" />
      </LabLayout>,
    );
    expect(screen.getByTestId("lab-disclosure").textContent).toBe(DISCLOSURE);
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders hero, genesis pending state, anchor card, exact 85/10/5 split, and no fabricated stats", async () => {
    stubLabFetch({
      "/api/lab/config": LAB_CONFIG,
      "/api/lab/anchor/googl": ANCHOR,
      "/api/lab/launches": { launches: [] },
    });
    render(
      <Providers config={makeConfig()}>
        <LabLandingPage />
      </Providers>,
    );

    expect(
      screen.getByText("Create community markets paired with real-world assets."),
    ).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Genesis market launching")).toBeInTheDocument());

    // Anchor card from live verification data.
    await waitFor(() =>
      expect(screen.getByTestId("anchor-card")).toHaveTextContent("Alphabet Class A"),
    );
    expect(screen.getByTestId("anchor-card")).toHaveTextContent("Verified");
    expect(screen.getByTestId("anchor-card")).toHaveTextContent("195.12");

    // Exact fee split.
    const split = screen.getByTestId("fee-split");
    expect(split).toHaveTextContent("85%");
    expect(split).toHaveTextContent("10%");
    expect(split).toHaveTextContent("5%");

    // Disabled preset rendered disabled with its reason.
    await waitFor(() =>
      expect(screen.getByTestId("preset-DYNAMIC_PROTECTION")).toHaveTextContent("Disabled"),
    );
    expect(screen.getByTestId("preset-DYNAMIC_PROTECTION")).toHaveTextContent(
      "The decay multicurve initializer is not deployed on Robinhood Chain (4663).",
    );

    // No fabricated stats of any kind.
    expect(screen.queryByText(/24h volume/i)).toBeNull();
    expect(screen.queryByText(/total value locked/i)).toBeNull();
    expect(screen.queryByText(/\bTVL\b/)).toBeNull();
    expect(screen.queryByText(/\d+ (holders|traders|markets launched)/i)).toBeNull();
  });

  it("shows the public-beta access line when accessMode is public", async () => {
    stubLabFetch({
      "/api/lab/config": LAB_CONFIG,
      "/api/lab/anchor/googl": ANCHOR,
      "/api/lab/launches": { launches: [] },
    });
    render(
      <Providers config={makeConfig()}>
        <LabLandingPage />
      </Providers>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("access-mode-line")).toHaveTextContent(
        "Public beta — any wallet can create a market.",
      ),
    );
  });

  it("shows the limited/disabled access lines for allowlist and disabled modes", async () => {
    stubLabFetch({
      "/api/lab/config": { ...LAB_CONFIG, accessMode: "allowlist" },
      "/api/lab/anchor/googl": ANCHOR,
      "/api/lab/launches": { launches: [] },
    });
    const first = render(
      <Providers config={makeConfig()}>
        <LabLandingPage />
      </Providers>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("access-mode-line")).toHaveTextContent(
        "Creation is currently limited.",
      ),
    );
    first.unmount();
    vi.unstubAllGlobals();

    stubLabFetch({
      "/api/lab/config": { ...LAB_CONFIG, accessMode: "disabled" },
      "/api/lab/anchor/googl": ANCHOR,
      "/api/lab/launches": { launches: [] },
    });
    render(
      <Providers config={makeConfig()}>
        <LabLandingPage />
      </Providers>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("access-mode-line")).toHaveTextContent(
        "Creation is currently disabled.",
      ),
    );
  });

  it("renders the live markets list from the launches API", async () => {
    stubLabFetch({
      "/api/lab/config": LAB_CONFIG,
      "/api/lab/anchor/googl": ANCHOR,
      "/api/lab/launches": { launches: [LAUNCH_RECORD, LAUNCH_RECORD_NO_CREATOR] },
    });
    render(
      <Providers config={makeConfig()}>
        <LabLandingPage />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText("Example Token")).toBeInTheDocument());
    const live = screen.getByTestId("live-markets");
    expect(live).toHaveTextContent("EXT");
    expect(live).toHaveTextContent("Second Token");
    expect(live).toHaveTextContent("SEC");

    // Shortened token address links to the internal market page.
    expect(screen.getByRole("link", { name: "0x2222…2222" })).toHaveAttribute(
      "href",
      "/lab/token/0x2222222222222222222222222222222222222222",
    );
    // Launch transaction links to Blockscout.
    expect(screen.getByRole("link", { name: "0xabab…abab" })).toHaveAttribute(
      "href",
      `https://robinhoodchain.blockscout.com/tx/${LAUNCH_TX}`,
    );
    // Creator shortened when present; em dash when unknown.
    expect(live).toHaveTextContent("0x3333…3333");
    const row = screen.getByTestId("launch-row-0x5555555555555555555555555555555555555555");
    expect(row).toHaveTextContent("—");
    expect(screen.queryByTestId("live-markets-empty")).toBeNull();
  });

  it("renders the honest empty state when no launches exist", async () => {
    stubLabFetch({
      "/api/lab/config": LAB_CONFIG,
      "/api/lab/anchor/googl": ANCHOR,
      "/api/lab/launches": { launches: [] },
    });
    render(
      <Providers config={makeConfig()}>
        <LabLandingPage />
      </Providers>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("live-markets-empty")).toHaveTextContent(
        "No markets launched yet.",
      ),
    );
  });
});
