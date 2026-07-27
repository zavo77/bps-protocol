import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createConfig, http } from "wagmi";
import { APPROVED_ANCHORS, FEE_PRESETS } from "@bps/launch-lab";
import { robinhoodChain } from "../../../lib/chain";
import { Providers } from "../../providers";
import LabTokensPage from "./page";

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
  anchors: APPROVED_ANCHORS.map((a) => ({
    symbol: a.symbol,
    name: a.name,
    logo: a.logo,
    address: a.address,
    decimals: a.decimals,
  })),
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

const MARKET_WITH_ACTIVITY = {
  tokenAddress: "0x2222222222222222222222222222222222222222",
  tokenName: "Example Token",
  tokenSymbol: "EXT",
  creator: "0x3333333333333333333333333333333333333333",
  numeraire: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
  anchorSymbol: "GOOGL",
  poolOrHook: "0x4444444444444444444444444444444444444444",
  launchTransactionHash: `0x${"ab".repeat(32)}`,
  blockNumber: "1234567",
  timestamp: 1_753_600_000,
  indexedSwaps: 12,
  grossMovementWei: "5000000000000000000",
};

const MARKET_COLLECTING = {
  tokenAddress: "0x5555555555555555555555555555555555555555",
  tokenName: "Nvidia Community",
  tokenSymbol: "NVC",
  creator: "0x6666666666666666666666666666666666666666",
  numeraire: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
  anchorSymbol: "NVDA",
  poolOrHook: "0x7777777777777777777777777777777777777777",
  launchTransactionHash: `0x${"cd".repeat(32)}`,
  blockNumber: "1234570",
  timestamp: 1_753_600_600,
  indexedSwaps: null,
  grossMovementWei: null,
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

describe("Launch Lab markets browser", () => {
  it("renders markets from the launches API with anchor, links, and activity", async () => {
    stubLabFetch({
      "/api/lab/config": LAB_CONFIG,
      "/api/lab/launches": {
        launches: [MARKET_WITH_ACTIVITY, MARKET_COLLECTING],
        indexedDataAvailable: true,
        sort: "newest",
      },
    });
    render(
      <Providers config={makeConfig()}>
        <LabTokensPage />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText("Example Token")).toBeInTheDocument());
    const table = screen.getByTestId("markets-table");
    expect(table).toHaveTextContent("EXT");
    expect(table).toHaveTextContent("GOOGL");
    expect(table).toHaveTextContent("Nvidia Community");
    expect(table).toHaveTextContent("NVDA");

    // Token address links to the internal market page.
    expect(screen.getByRole("link", { name: "0x2222…2222" })).toHaveAttribute(
      "href",
      "/lab/token/0x2222222222222222222222222222222222222222",
    );
    // Creator links to the internal profile page.
    expect(screen.getByRole("link", { name: "0x3333…3333" })).toHaveAttribute(
      "href",
      "/lab/profile/0x3333333333333333333333333333333333333333",
    );

    // Indexed activity shown when present; honest "Collecting market data" otherwise.
    expect(screen.getByTestId("market-activity")).toHaveTextContent("12 swaps");
    expect(screen.getByTestId("market-collecting")).toHaveTextContent("Collecting market data");
  });

  it("filters markets client-side by name, symbol, or anchor", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    stubLabFetch({
      "/api/lab/config": LAB_CONFIG,
      "/api/lab/launches": {
        launches: [MARKET_WITH_ACTIVITY, MARKET_COLLECTING],
        indexedDataAvailable: true,
        sort: "newest",
      },
    });
    render(
      <Providers config={makeConfig()}>
        <LabTokensPage />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText("Example Token")).toBeInTheDocument());

    await user.type(screen.getByTestId("markets-search"), "nvda");
    await waitFor(() => expect(screen.queryByText("Example Token")).not.toBeInTheDocument());
    expect(screen.getByText("Nvidia Community")).toBeInTheDocument();
  });

  it("shows the honest empty state when no markets exist", async () => {
    stubLabFetch({
      "/api/lab/config": LAB_CONFIG,
      "/api/lab/launches": { launches: [], indexedDataAvailable: false, sort: "newest" },
    });
    render(
      <Providers config={makeConfig()}>
        <LabTokensPage />
      </Providers>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("markets-empty")).toHaveTextContent("No markets launched yet."),
    );
  });
});
