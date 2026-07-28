import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createConfig, http } from "wagmi";
import { mock } from "wagmi/connectors/mock";
import { FEE_PRESETS } from "@bps/launch-lab";
import { robinhoodChain } from "../../../lib/chain";
import { Providers } from "../../providers";
import { useCreateFlow } from "../../../hooks/lab";
import LabCreatePage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const TERMS_LABEL =
  "I acknowledge this is an experimental, unaffiliated market platform and that launch configuration is irreversible.";

function makeConfig() {
  return createConfig({
    chains: [robinhoodChain],
    connectors: [],
    transports: { [robinhoodChain.id]: http("http://localhost:0") },
    multiInjectedProviderDiscovery: false,
    ssr: false,
  });
}

/** Same boundary as makeConfig but with wagmi's mock connector for a connectable wallet. */
function makeConnectableConfig() {
  return createConfig({
    chains: [robinhoodChain],
    connectors: [mock({ accounts: ["0x1000000000000000000000000000000000000001"] })],
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
  accessMode: "public",
  defaultFeePreset: "BALANCED_1",
  feePresets: [...FEE_PRESETS],
  startingFdvUsd: 20_500,
  anchorSymbol: "GOOGL",
  bpsFeeAddress: "0x000000000000000000000000000000000000dEaD",
  explorerBaseUrl: "https://robinhoodchain.blockscout.com",
  publicBeta: {
    maxLaunchesPerWallet: 2,
    launchCooldownSeconds: 3_600,
    publicDailyLaunchCap: 25,
    launchesToday: 3,
  },
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
      /Connect your wallet to launch a market/i,
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

    // The signing/upload action stays blocked while disconnected, and the
    // welcoming connect prompt is the only wallet chrome shown.
    expect(screen.getByTestId("upload-continue")).toBeDisabled();
    expect(screen.getByTestId("connect-wallet")).toHaveTextContent(/Connect wallet/i);

    // Nothing was sent to a mutation endpoint (no metadata upload, prepare, or simulate).
    expect(calls.some((u) => u.includes("/api/lab/metadata"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/lab/prepare"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/lab/simulate"))).toBe(false);
  });

  it("starts every user field empty — no prefilled name, ticker, description, or image", () => {
    stubLabFetch();
    render(
      <Providers config={makeConfig()}>
        <LabCreatePage />
      </Providers>,
    );
    expect((screen.getByTestId("name-input") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("symbol-input") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("description-input") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByTestId("image-input") as HTMLInputElement).files?.length ?? 0).toBe(0);
    expect((screen.getByTestId("terms-checkbox") as HTMLInputElement).checked).toBe(false);
  });
});

describe("Launch Lab create page (terms acknowledgement)", () => {
  it("requires the acknowledgement checkbox before progression past step 1", async () => {
    stubLabFetch();
    const user = userEvent.setup();
    render(
      <Providers config={makeConnectableConfig()}>
        <LabCreatePage />
      </Providers>,
    );

    // Connect the mock wallet through the public "Connect wallet" control.
    await user.click(screen.getByTestId("connect-wallet"));
    await user.click(screen.getByRole("button", { name: /Mock Connector/i }));
    await waitFor(() =>
      expect(screen.getByTestId("wallet-state")).toHaveTextContent(/^connected$/),
    );

    // The exact acknowledgement label is rendered with the checkbox.
    expect(screen.getByText(TERMS_LABEL)).toBeInTheDocument();

    // Complete a valid form (real PNG magic bytes).
    await user.type(screen.getByTestId("name-input"), "Example Token");
    await user.type(screen.getByTestId("symbol-input"), "ext");
    await user.type(screen.getByTestId("description-input"), "A community market token.");
    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])],
      "token.png",
      { type: "image/png" },
    );
    await user.upload(screen.getByTestId("image-input") as HTMLInputElement, png);

    // Terms unchecked → progression stays blocked with the hint visible.
    expect(screen.getByTestId("upload-continue")).toBeDisabled();
    expect(screen.getByTestId("terms-hint")).toBeInTheDocument();

    // Checking the acknowledgement unblocks progression.
    await user.click(screen.getByTestId("terms-checkbox"));
    await waitFor(() => expect(screen.getByTestId("upload-continue")).toBeEnabled());
  });

  it("prepare() is not callable without the acknowledgement — no prepare/simulate request is sent", async () => {
    const calls = stubLabFetch();
    const user = userEvent.setup();

    function PrepareProbe() {
      const flow = useCreateFlow();
      return (
        <div>
          <span data-testid="probe-error">{flow.error ?? ""}</span>
          <button data-testid="probe-prepare" onClick={() => void flow.prepare()}>
            prepare
          </button>
        </div>
      );
    }

    render(
      <Providers config={makeConfig()}>
        <PrepareProbe />
      </Providers>,
    );

    await user.click(screen.getByTestId("probe-prepare"));
    await waitFor(() =>
      expect(screen.getByTestId("probe-error")).toHaveTextContent(/acknowledgement/i),
    );
    expect(calls.some((u) => u.includes("/api/lab/prepare"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/lab/simulate"))).toBe(false);
  });
});
