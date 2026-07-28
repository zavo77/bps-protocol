import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FEE_PRESETS } from "@bps/launch-lab";
import LabCreatePage from "./page";
import { useCreateFlow } from "../../../hooks/lab";

// Live-P0 chain gating: a wallet on another chain (e.g. Ethereum Mainnet) must
// see a clean "Switch to Robinhood Chain" state — never the wizard, never a raw
// viem error — and nothing wallet-bound (metadata, envelope, simulation,
// launch) may run until the wallet's ACTIVE chain is 4663.

const h = vi.hoisted(() => ({
  state: {
    address: "0x1000000000000000000000000000000000000001" as string | undefined,
    isConnected: true,
    chainId: 1 as number | undefined, // Ethereum Mainnet by default in this suite
  },
  fns: {
    connect: vi.fn(),
    switchChainAsync: vi.fn(),
    sendTransactionAsync: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    readContract: vi.fn(),
    getGasPrice: vi.fn(async () => 1_000_000n),
    signMessageAsync: vi.fn(async () => `0x${"ab".repeat(65)}`),
    disconnect: vi.fn(),
    providerRequest: vi.fn(async () => null),
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: h.state.address,
    isConnected: h.state.isConnected,
    chainId: h.state.chainId,
    connector: { getProvider: async () => ({ request: h.fns.providerRequest }) },
  }),
  useChainId: () => 4663, // the app config chain — deliberately NOT the wallet chain
  usePublicClient: () => ({
    waitForTransactionReceipt: h.fns.waitForTransactionReceipt,
    readContract: h.fns.readContract,
    getGasPrice: h.fns.getGasPrice,
  }),
  useConnect: () => ({ connect: h.fns.connect, connectors: [], isPending: false }),
  useDisconnect: () => ({ disconnect: h.fns.disconnect }),
  useSwitchChain: () => ({ switchChainAsync: h.fns.switchChainAsync }),
  useSendTransaction: () => ({ sendTransactionAsync: h.fns.sendTransactionAsync }),
  useSignMessage: () => ({ signMessageAsync: h.fns.signMessageAsync }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

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
    launchesToday: 0,
  },
  genesis: { launched: false, tokenAddress: null },
};

function stubFetch() {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      if (url.includes("/api/lab/config")) {
        return { status: 200, json: async () => ({ ok: true, data: LAB_CONFIG }) } as Response;
      }
      if (url.includes("/api/lab/metadata")) {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            data: { imageCid: "QmI", metadataCid: "QmM", tokenUri: "ipfs://QmM", provider: "pinata" },
          }),
        } as unknown as Response;
      }
      return {
        status: 404,
        json: async () => ({ ok: false, error: "x", code: "NOT_FOUND" }),
      } as unknown as Response;
    }),
  );
  return calls;
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function rerender(view: ReturnType<typeof render>) {
  view.rerender(
    <QueryClientProvider client={new QueryClient()}>
      <LabCreatePage />
    </QueryClientProvider>,
  );
}

const PNG = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], "t.png", {
    type: "image/png",
  });

beforeEach(() => {
  h.state.address = "0x1000000000000000000000000000000000000001";
  h.state.isConnected = true;
  h.state.chainId = 1;
  window.localStorage.clear();
  for (const fn of Object.values(h.fns)) fn.mockReset();
  h.fns.getGasPrice.mockResolvedValue(1_000_000n);
  h.fns.providerRequest.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wallet chain gating (live P0)", () => {
  it("a wallet on chain 1 sees the clean Switch-network state, not the wizard", async () => {
    stubFetch();
    wrap(<LabCreatePage />);

    const card = await screen.findByTestId("switch-chain-card");
    expect(card).toHaveTextContent(/Switch to Robinhood Chain/);
    expect(card).toHaveTextContent(/This market launches on Robinhood Chain/);
    expect(screen.getByTestId("switch-chain")).toHaveTextContent(/Switch network/);
    // The launch flow is STOPPED: no form, no steps.
    expect(screen.queryByTestId("name-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pair-step")).not.toBeInTheDocument();
  });

  it("no metadata or manifest is prepared before switching", async () => {
    const calls = stubFetch();

    function Probe() {
      const flow = useCreateFlow();
      return (
        <div>
          <span data-testid="probe-error">{flow.error ?? ""}</span>
          <button data-testid="probe-upload" onClick={() => void flow.uploadMetadata()}>
            u
          </button>
          <button data-testid="probe-prepare" onClick={() => void flow.prepare()}>
            p
          </button>
        </div>
      );
    }
    const user = userEvent.setup();
    wrap(<Probe />);

    await user.click(screen.getByTestId("probe-upload"));
    await waitFor(() =>
      expect(screen.getByTestId("probe-error")).toHaveTextContent(/Switch to Robinhood Chain/),
    );
    await user.click(screen.getByTestId("probe-prepare"));
    await waitFor(() =>
      expect(screen.getByTestId("probe-error")).toHaveTextContent(/Switch to Robinhood Chain/),
    );
    // Nothing wallet-bound left the browser: no signature, no metadata, no prepare.
    expect(h.fns.signMessageAsync).not.toHaveBeenCalled();
    expect(calls.some((u) => u.includes("/api/lab/metadata"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/lab/prepare"))).toBe(false);
  });

  it("a successful switch to 4663 resumes safely with the typed form intact", async () => {
    stubFetch();
    const user = userEvent.setup();
    h.state.chainId = 4663; // start on the right chain, type a draft
    const view = wrap(<LabCreatePage />);
    await user.type(screen.getByTestId("name-input"), "PRINT");

    h.state.chainId = 1; // wallet hops to Mainnet → flow stops
    rerender(view);
    await screen.findByTestId("switch-chain-card");

    h.state.chainId = 4663; // switched back → wizard resumes with the draft
    rerender(view);
    await waitFor(() =>
      expect((screen.getByTestId("name-input") as HTMLInputElement).value).toBe("PRINT"),
    );
    expect(screen.queryByTestId("switch-chain-card")).not.toBeInTheDocument();
  });

  it("a rejected switch shows a concise retry state — never the raw wallet error", async () => {
    stubFetch();
    h.fns.switchChainAsync.mockRejectedValue(
      new Error(
        'User rejected the request.\nRequest Arguments:\n  chain: Robinhood Chain\nDetails: MetaMask Tx Signature: User denied.\nVersion: viem@2.55.8',
      ),
    );
    const user = userEvent.setup();
    wrap(<LabCreatePage />);

    await user.click(await screen.findByTestId("switch-chain"));
    await waitFor(() =>
      expect(screen.getByTestId("switch-error")).toHaveTextContent(
        /Network switch was declined — try again\./,
      ),
    );
    expect(screen.getByTestId("switch-error")).not.toHaveTextContent(/Request Arguments|viem/);
  });

  it("an unknown chain triggers wallet_addEthereumChain with the Robinhood Chain params", async () => {
    stubFetch();
    h.fns.switchChainAsync
      .mockRejectedValueOnce(new Error("Unrecognized chain ID. Try adding the chain first."))
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    wrap(<LabCreatePage />);

    await user.click(await screen.findByTestId("switch-chain"));
    await waitFor(() => expect(h.fns.providerRequest).toHaveBeenCalled());
    const req = (h.fns.providerRequest.mock.calls[0] as unknown[])[0] as {
      method: string;
      params: [Record<string, unknown>];
    };
    expect(req.method).toBe("wallet_addEthereumChain");
    expect(req.params[0]).toMatchObject({
      chainId: "0x1237",
      chainName: "Robinhood Chain",
      rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
      blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
    });
    // After adding, the switch is retried.
    expect(h.fns.switchChainAsync).toHaveBeenCalledTimes(2);
  });

  it("a chain change invalidates prepared/metadata state (fresh upload required)", async () => {
    const calls = stubFetch();
    const user = userEvent.setup();
    h.state.chainId = 4663;
    const view = wrap(<LabCreatePage />);

    // Reach the Market step (metadata confirmed).
    await user.type(screen.getByTestId("name-input"), "PRINT");
    await user.type(screen.getByTestId("symbol-input"), "PRINT");
    await user.type(screen.getByTestId("description-input"), "A community market token.");
    await user.upload(screen.getByTestId("image-input") as HTMLInputElement, PNG());
    await waitFor(() => expect(screen.getByTestId("upload-continue")).toBeEnabled());
    await user.click(screen.getByTestId("upload-continue"));
    await screen.findByTestId("pair-step");
    const uploadsBefore = calls.filter((u) => u.includes("/api/lab/metadata")).length;
    expect(uploadsBefore).toBe(1);

    // Wallet hops chains and returns → metadata state invalidated, back to Step 1.
    h.state.chainId = 1;
    rerender(view);
    await screen.findByTestId("switch-chain-card");
    h.state.chainId = 4663;
    rerender(view);
    await screen.findByTestId("name-input");
    expect(screen.queryByTestId("pair-step")).not.toBeInTheDocument();

    // Continuing again requires a FRESH metadata upload (old one invalidated).
    await waitFor(() => expect(screen.getByTestId("upload-continue")).toBeEnabled());
    await user.click(screen.getByTestId("upload-continue"));
    await screen.findByTestId("pair-step");
    expect(calls.filter((u) => u.includes("/api/lab/metadata")).length).toBe(2);
  });

  it("the launch transaction can never be sent while the wallet is on chain 1", async () => {
    stubFetch();
    function LaunchProbe() {
      const flow = useCreateFlow();
      return (
        <div>
          <span data-testid="probe-error">{flow.error ?? ""}</span>
          <button data-testid="probe-launch" onClick={() => void flow.launch()}>
            l
          </button>
        </div>
      );
    }
    const user = userEvent.setup();
    wrap(<LaunchProbe />);

    await user.click(screen.getByTestId("probe-launch"));
    await waitFor(() =>
      expect(screen.getByTestId("probe-error")).toHaveTextContent(/Switch to Robinhood Chain/),
    );
    expect(h.fns.sendTransactionAsync).not.toHaveBeenCalled();
  });
});
