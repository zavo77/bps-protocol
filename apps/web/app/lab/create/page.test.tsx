import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createConfig, http } from "wagmi";
import { FEE_PRESETS } from "@bps/launch-lab";
import { robinhoodChain } from "../../../lib/chain";
import { Providers } from "../../providers";
import LabCreatePage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

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
  broadcastEnabled: true,
  killSwitchActive: false,
  defaultFeePreset: "BALANCED_1",
  feePresets: [...FEE_PRESETS],
  startingFdvUsd: 20_500,
  anchorSymbol: "GOOGL",
  bpsFeeAddress: "0x000000000000000000000000000000000000dEaD",
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

function stubLabFetch() {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      if (url.includes("/api/lab/config")) {
        return {
          status: 200,
          json: async () => ({ ok: true, data: LAB_CONFIG }),
        } as unknown as Response;
      }
      if (url.includes("/api/lab/anchor/googl")) {
        return {
          status: 200,
          json: async () => ({ ok: true, data: ANCHOR }),
        } as unknown as Response;
      }
      return {
        status: 404,
        json: async () => ({ ok: false, error: "not found", code: "NOT_FOUND" }),
      } as unknown as Response;
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Launch Lab create page (disconnected wallet)", () => {
  it("blocks signing when disconnected, even with a complete valid form", async () => {
    const calls = stubLabFetch();
    const user = userEvent.setup();
    render(
      <Providers config={makeConfig()}>
        <LabCreatePage />
      </Providers>,
    );

    expect(screen.getByTestId("wallet-state")).toHaveTextContent("disconnected");
    expect(screen.getByTestId("wallet-hint")).toHaveTextContent(
      /Connect a wallet to create a market/i,
    );

    // Complete the form with valid values (real PNG magic bytes).
    await user.type(screen.getByTestId("name-input"), "Print Token");
    await user.type(screen.getByTestId("symbol-input"), "print"); // auto-uppercased
    await user.type(screen.getByTestId("description-input"), "A community market token.");
    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])],
      "token.png",
      { type: "image/png" },
    );
    await user.upload(screen.getByTestId("image-input") as HTMLInputElement, png);

    await waitFor(() =>
      expect((screen.getByTestId("symbol-input") as HTMLInputElement).value).toBe("PRINT"),
    );

    // The signing/upload action stays blocked while disconnected.
    expect(screen.getByTestId("upload-continue")).toBeDisabled();
    expect(screen.getByText(/Signing is blocked until a wallet is connected/i)).toBeInTheDocument();

    // Nothing was sent to a mutation endpoint (no metadata upload, prepare, or simulate).
    expect(calls.some((u) => u.includes("/api/lab/metadata"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/lab/prepare"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/lab/simulate"))).toBe(false);
  });
});
