import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { APPROVED_ANCHORS, FEE_PRESETS } from "@bps/launch-lab";
import LabCreatePage from "./page";

// ---------------------------------------------------------------------------
// Wagmi + router are mocked wholesale so the multi-step wizard can be driven to
// the Pair step (which needs confirmed metadata) with a connected, correctly
// chained wallet and a controllable signer.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  state: {
    address: "0x1000000000000000000000000000000000000001" as string | undefined,
    isConnected: true,
    chainId: 4663,
  },
  fns: {
    connect: vi.fn(),
    switchChain: vi.fn(),
    switchChainAsync: vi.fn(),
    sendTransactionAsync: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    readContract: vi.fn(),
    signMessageAsync: vi.fn(async () => `0x${"ab".repeat(65)}`),
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: h.state.address, isConnected: h.state.isConnected, chainId: h.state.chainId }),
  useChainId: () => h.state.chainId,
  usePublicClient: () => ({
    waitForTransactionReceipt: h.fns.waitForTransactionReceipt,
    readContract: h.fns.readContract,
  }),
  useConnect: () => ({ connect: h.fns.connect, connectors: [], isPending: false }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useSwitchChain: () => ({
    switchChain: h.fns.switchChain,
    switchChainAsync: h.fns.switchChainAsync,
  }),
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
  anchors: APPROVED_ANCHORS.map((a) => ({
    symbol: a.symbol,
    name: a.name,
    logo: a.logo,
    address: a.address,
    decimals: a.decimals,
  })),
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

const METADATA_RESULT = {
  imageCid: "bafyImageCidExampleExampleExampleExample",
  metadataCid: "bafyMetadataCidExampleExampleExampleExample",
  tokenUri: "ipfs://bafyMetadataCidExampleExampleExampleExample",
  provider: "pinata",
};

function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as unknown as Response;
}

/** Records every request; captures the /api/lab/prepare body for assertions. */
function stubFetch(): { prepareBodies: string[] } {
  const bucket = { prepareBodies: [] as string[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/lab/config")) return jsonResponse(200, { ok: true, data: LAB_CONFIG });
      if (url.includes("/api/lab/anchor/googl"))
        return jsonResponse(200, { ok: true, data: ANCHOR });
      if (url.includes("/api/lab/metadata"))
        return jsonResponse(200, { ok: true, data: METADATA_RESULT });
      if (url.includes("/api/lab/prepare")) {
        if (typeof init?.body === "string") bucket.prepareBodies.push(init.body);
        // Stop cleanly after capturing the request payload — the flow handles the
        // failure and stays on the Pair step, so no partial bundle is rendered.
        return jsonResponse(400, { ok: false, error: "stopped for test", code: "TEST_STOP" });
      }
      return jsonResponse(404, { ok: false, error: "not found", code: "NOT_FOUND" });
    }),
  );
  return bucket;
}

const PNG = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], "t.png", {
    type: "image/png",
  });

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/** Fill the Token step with a valid form + terms, upload metadata, land on Pair. */
async function gotoPairStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("name-input"), "Print Token");
  await user.type(screen.getByTestId("symbol-input"), "print");
  await user.type(screen.getByTestId("description-input"), "A community market token.");
  await user.upload(screen.getByTestId("image-input") as HTMLInputElement, PNG());
  await waitFor(() => expect(screen.getByTestId("upload-continue")).toBeEnabled());
  await user.click(screen.getByTestId("upload-continue"));
  await waitFor(() => expect(screen.getByTestId("pair-step")).toBeInTheDocument());
  // The acknowledgement now lives on the market step, before Continue.
  await user.click(screen.getByTestId("terms-checkbox"));
}

beforeEach(() => {
  h.state.address = "0x1000000000000000000000000000000000000001";
  h.state.isConnected = true;
  h.state.chainId = 4663;
  h.fns.signMessageAsync.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Create wizard — anchor picker", () => {
  it("renders all five approved anchors and selecting one sets the prepared payload anchorSymbol", async () => {
    const bucket = stubFetch();
    const user = userEvent.setup();
    wrap(<LabCreatePage />);

    await gotoPairStep(user);

    // All five approved anchors render in the picker.
    for (const sym of ["GOOGL", "NVDA", "AAPL", "TSLA", "SPCX"]) {
      expect(screen.getByTestId(`anchor-choice-${sym}`)).toBeInTheDocument();
    }
    // Default selection is GOOGL.
    const googl = screen.getByTestId("anchor-choice-GOOGL").querySelector("input")!;
    expect(googl.checked).toBe(true);

    // Select NVDA and prepare the launch.
    await user.click(screen.getByTestId("anchor-choice-NVDA").querySelector("input")!);
    await waitFor(() =>
      expect(
        (screen.getByTestId("anchor-choice-NVDA").querySelector("input") as HTMLInputElement)
          .checked,
      ).toBe(true),
    );

    await user.click(screen.getByTestId("prepare-launch"));

    await waitFor(() => expect(bucket.prepareBodies.length).toBeGreaterThan(0));
    const body = JSON.parse(bucket.prepareBodies[0]!) as {
      envelope?: unknown;
      payload: { anchorSymbol: string };
    };
    expect(body.payload.anchorSymbol).toBe("NVDA");
    // Single-confirmation contract: no signed envelope, no message signature —
    // the deployment transaction is the only wallet interaction of a launch.
    expect(body.envelope).toBeUndefined();
    expect(h.fns.signMessageAsync).not.toHaveBeenCalled();
  });
});

describe("Create wizard — fee destination", () => {
  it("validates a custom fee wallet address with viem isAddress", async () => {
    stubFetch();
    const user = userEvent.setup();
    wrap(<LabCreatePage />);

    await gotoPairStep(user);

    // Default is the connected wallet — no custom address input shown.
    expect(screen.queryByTestId("creator-fee-input")).not.toBeInTheDocument();

    // Switch to a custom wallet and type an invalid address → validation error.
    await user.click(screen.getByTestId("fee-dest-custom").querySelector("input")!);
    await user.type(screen.getByTestId("creator-fee-input"), "0xnot-an-address");
    await waitFor(() =>
      expect(screen.getByText(/Creator fee address is not a valid address/i)).toBeInTheDocument(),
    );
    // The invalid address also blocks preparing the launch.
    expect(screen.getByTestId("prepare-launch")).toBeDisabled();

    // Replace with a valid checksummed address → error clears, prepare re-enabled.
    await user.clear(screen.getByTestId("creator-fee-input"));
    await user.type(
      screen.getByTestId("creator-fee-input"),
      "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
    );
    await waitFor(() =>
      expect(screen.queryByText(/Creator fee address is not a valid address/i)).toBeNull(),
    );
    expect(screen.getByTestId("prepare-launch")).toBeEnabled();
  });
});
