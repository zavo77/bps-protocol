import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createConfig, http } from "wagmi";
import { FEE_PRESETS } from "@bps/launch-lab";
import { robinhoodChain } from "../../../lib/chain";
import { Providers } from "../../providers";
import { TokenMarketView } from "./[address]/TokenMarketView";

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

const SNAPSHOT = {
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
  fetchedAt: 1_753_600_000_000,
};

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

function stubLabFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/lab/token/")) {
        return {
          status: 200,
          json: async () => ({ ok: true, data: SNAPSHOT }),
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Launch Lab token market page", () => {
  it('renders exactly "Awaiting indexed data" for every unavailable datum (never zero)', async () => {
    stubLabFetch();
    render(
      <Providers config={makeConfig()}>
        <TokenMarketView address={TOKEN} />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText("PRINT (PRINT)")).toBeInTheDocument());

    // 13 unavailable datums in the fixture: 12 rows render the exact string in
    // their value cell + the beneficiaries card renders it once.
    const awaiting = screen.getAllByText("Awaiting indexed data");
    expect(awaiting.length).toBeGreaterThanOrEqual(12);

    // Never rendered as zero.
    const core = screen.getByTestId("market-core");
    expect(core).not.toHaveTextContent(/\b0(\.0+)?\b/);

    // External trading fallback — clearly labeled, no fake quote widget.
    const external = screen.getByTestId("trade-external");
    expect(external).toHaveAttribute("href", "https://matcha.xyz");
    expect(screen.getByTestId("trade-section")).toHaveTextContent(/external site/i);
    expect(screen.getByTestId("trade-section")).toHaveTextContent(/QUOTE_NOT_YET_AVAILABLE/);

    // Token Blockscout link present.
    expect(screen.getByRole("link", { name: TOKEN })).toHaveAttribute(
      "href",
      `https://robinhoodchain.blockscout.com/address/${TOKEN}`,
    );
  });
});
