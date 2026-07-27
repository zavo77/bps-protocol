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
  defaultFeePreset: "BALANCED_1",
  feePresets: [...FEE_PRESETS],
  startingFdvUsd: 20_500,
  anchorSymbol: "GOOGL",
  bpsFeeAddress: null,
  explorerBaseUrl: "https://robinhoodchain.blockscout.com",
  genesis: { launched: false, tokenAddress: null },
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
    stubLabFetch({ "/api/lab/config": LAB_CONFIG, "/api/lab/anchor/googl": ANCHOR });
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
});
