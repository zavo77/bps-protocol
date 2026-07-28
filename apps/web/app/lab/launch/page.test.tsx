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

function stubLabFetch(opts?: { withMetadata?: boolean }) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      // The wagmi mock connector routes signing through the HTTP transport as a
      // JSON-RPC call — answer it with a deterministic test signature.
      if (typeof init?.body === "string" && init.body.includes('"eth_sign"')) {
        const rpc = JSON.parse(init.body) as { id: number };
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: `0x${"ab".repeat(65)}` }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
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
      if (opts?.withMetadata && url.includes("/api/lab/metadata")) {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            data: {
              imageCid: "QmImage",
              metadataCid: "QmMeta",
              tokenUri: "ipfs://QmMeta",
              provider: "pinata",
            },
          }),
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
  it("lets a disconnected visitor fill the form; Continue opens the wallet flow instead of uploading", async () => {
    const calls = stubLabFetch();
    const user = userEvent.setup();
    render(
      <Providers config={makeConfig()}>
        <LabCreatePage />
      </Providers>,
    );

    expect(screen.getByTestId("wallet-state")).toHaveTextContent("disconnected");

    // A disconnected visitor can complete the form (real PNG magic bytes).
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

    // Continue is clickable but opens the normal wallet connection flow
    // instead of doing anything wallet-bound.
    await waitFor(() => expect(screen.getByTestId("upload-continue")).toBeEnabled());
    await user.click(screen.getByTestId("upload-continue"));
    await waitFor(() => expect(screen.getByTestId("connect-wallet")).toBeInTheDocument());
    expect(screen.getByTestId("wallet-options")).toBeInTheDocument(); // options opened

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
  });
});

describe("Launch Lab create page (terms acknowledgement)", () => {
  it("requires the acknowledgement checkbox on the market step before Continue", async () => {
    stubLabFetch({ withMetadata: true });
    const user = userEvent.setup();
    render(
      <Providers config={makeConnectableConfig()}>
        <LabCreatePage />
      </Providers>,
    );

    // A visitor fills the form FIRST; Continue then opens the wallet flow.
    await user.type(screen.getByTestId("name-input"), "Example Token");
    await user.type(screen.getByTestId("symbol-input"), "ext");
    await user.type(screen.getByTestId("description-input"), "A community market token.");
    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])],
      "token.png",
      { type: "image/png" },
    );
    await user.upload(screen.getByTestId("image-input") as HTMLInputElement, png);
    await waitFor(() => expect(screen.getByTestId("upload-continue")).toBeEnabled());
    await user.click(screen.getByTestId("upload-continue"));

    // The normal wallet connection flow opens; connect the mock wallet.
    await waitFor(() => expect(screen.getByTestId("connect-wallet")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Mock Connector/i }));
    await waitFor(() =>
      expect(screen.getByTestId("wallet-state")).toHaveTextContent(/^connected$/),
    );

    // Continue again — now connected, step 1 proceeds (no acknowledgement needed here).
    await user.click(screen.getByTestId("upload-continue"));
    await waitFor(() => expect(screen.getByTestId("pair-step")).toBeInTheDocument());

    // The exact acknowledgement label renders with the checkbox on the market step.
    expect(screen.getByText(TERMS_LABEL)).toBeInTheDocument();

    // Terms unchecked → Continue stays blocked with the hint visible.
    expect(screen.getByTestId("prepare-launch")).toBeDisabled();
    expect(screen.getByTestId("terms-hint")).toBeInTheDocument();

    // Checking the acknowledgement unblocks Continue.
    await user.click(screen.getByTestId("terms-checkbox"));
    await waitFor(() => expect(screen.getByTestId("prepare-launch")).toBeEnabled());
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
