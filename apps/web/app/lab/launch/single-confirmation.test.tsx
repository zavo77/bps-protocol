import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { APPROVED_ANCHORS, FEE_PRESETS } from "@bps/launch-lab";
import LabCreatePage from "./page";
import { useCreateFlow } from "../../../hooks/lab";

// Founder P0 — ONE wallet confirmation for the whole launch. These tests prove:
// (a) NO personal_sign/signMessage during metadata upload,
// (b) none during preparation,
// (c) none during stale re-simulation (silent, automatic),
// (d) EXACTLY ONE sendTransaction for a full launch,
// (e) the registration POST still fires with transactionHash + manifest.

const h = vi.hoisted(() => {
  const WALLET = "0x1000000000000000000000000000000000000001";
  const TOKEN = "0x4000000000000000000000000000000000000004";
  const TX = `0x${"11".repeat(32)}`;
  return {
    WALLET,
    TOKEN,
    TX,
    state: { address: WALLET as string | undefined, isConnected: true, chainId: 4663 },
    fns: {
      connect: vi.fn(),
      switchChainAsync: vi.fn(),
      sendTransactionAsync: vi.fn(async () => TX),
      waitForTransactionReceipt: vi.fn(async () => ({
        status: "success",
        logs: [],
        blockNumber: 123n,
        transactionHash: TX,
      })),
      readContract: vi.fn(),
      getGasPrice: vi.fn(async () => 1_000_000n),
      signMessageAsync: vi.fn(async () => `0x${"ab".repeat(65)}`),
      disconnect: vi.fn(),
      decodeAndVerifyReceipt: vi.fn(async () => ({
        launchTransactionHash: TX,
        confirmationBlock: "123",
        tokenAddress: TOKEN,
        poolId: `0x${"22".repeat(32)}`,
        creator: WALLET,
        anchorAddress: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
        poolStatus: 2,
        matchesManifest: true,
        mismatches: [],
      })),
      routerPush: vi.fn(),
    },
  };
});

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: h.state.address,
    isConnected: h.state.isConnected,
    chainId: h.state.chainId,
  }),
  useChainId: () => h.state.chainId,
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
  useRouter: () => ({ push: h.fns.routerPush, replace: vi.fn(), prefetch: vi.fn() }),
}));

// Receipt decoding is verified elsewhere; here it simply confirms the manifest.
vi.mock("@bps/launch-lab", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, decodeAndVerifyReceipt: h.fns.decodeAndVerifyReceipt };
});

const ANCHOR_ADDR = "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3";

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
    launchesToday: 0,
  },
  genesis: { launched: false, tokenAddress: null },
};

const ANCHOR = {
  status: "verified",
  symbol: "GOOGL",
  address: ANCHOR_ADDR,
  name: "Alphabet Class A Robinhood Token",
  decimals: 18,
  currentMultiplier: "1.000000000000000000",
  midPriceUsd: "195.12",
  bidUsd: "195.00",
  askUsd: "195.24",
  fetchedAt: Date.now(),
};

const METADATA_RESULT = {
  imageCid: "bafyImageCidExampleExampleExampleExample",
  metadataCid: "bafyMetadataCidExampleExampleExampleExample",
  tokenUri: "ipfs://bafyMetadataCidExampleExampleExampleExample",
  provider: "pinata",
};

const MANIFEST_HASH = `0x${"ab".repeat(32)}`;
const CALLDATA_HASH = `0x${"cd".repeat(32)}`;
const TX_TARGET = "0x5000000000000000000000000000000000000005";

function makeBundle(staleAfter: number, simulationTimestamp = Date.now()) {
  const manifest = {
    platform: "BPS Launch Lab",
    appVersion: "8h-v1",
    sourceCommit: "test",
    chainId: 4663,
    creatorAddress: h.WALLET,
    creatorFeeAddress: h.WALLET,
    bpsFeeAddress: "0x000000000000000000000000000000000000dEaD",
    protocolFeeAddress: "0x6000000000000000000000000000000000000006",
    tokenName: "Print Token",
    tokenSymbol: "PRINT",
    tokenDescriptionHash: `0x${"ee".repeat(32)}`,
    tokenImageCid: METADATA_RESULT.imageCid,
    tokenUri: METADATA_RESULT.tokenUri,
    anchorSymbol: "GOOGL",
    anchorAddress: ANCHOR_ADDR,
    anchorDecimals: 18,
    anchorMultiplier: "1.000000000000000000",
    initialSupply: "1000000000000000000000000000",
    saleInventory: "900000000000000000000000000",
    startingFdvUsdFixed: "20500",
    feePreset: "BALANCED_1",
    exactPoolFeeUnits: 10_000,
    beneficiaries: [],
    migrationMode: "noOp",
    governanceMode: "noOp",
    initializerMode: "rehype",
    resolvedDopplerModules: {},
    transactionTarget: TX_TARGET,
    transactionValue: "0",
    calldataHash: CALLDATA_HASH,
    createdAt: Date.now(),
  };
  const simulation = {
    status: "ok",
    manifestHash: MANIFEST_HASH,
    transactionTarget: TX_TARGET,
    calldataHash: CALLDATA_HASH,
    predictedTokenAddress: h.TOKEN,
    predictedPoolId: `0x${"33".repeat(32)}`,
    gasEstimate: "1000000",
    simulationBlock: "123",
    simulationTimestamp,
  };
  const prepared = {
    chainId: 4663,
    from: h.WALLET,
    to: TX_TARGET,
    data: "0xdeadbeef",
    value: "0",
    gas: "1250000",
    manifestHash: MANIFEST_HASH,
    calldataHash: CALLDATA_HASH,
    simulation,
    staleAfter,
  };
  return { manifest, manifestHash: MANIFEST_HASH, simulation, prepared };
}

interface Captured {
  metadataBodies: FormData[];
  prepareBodies: string[];
  simulateBodies: string[];
  registrationBodies: string[];
  signLikeBodies: string[];
}

function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as unknown as Response;
}

/** Stub every /api/lab endpoint; capture bodies. `staleFirstPrepare` makes the
 *  bundle from /prepare already stale so launch() must silently re-simulate. */
function stubFetch(opts?: { staleFirstPrepare?: boolean }): Captured {
  const cap: Captured = {
    metadataBodies: [],
    prepareBodies: [],
    simulateBodies: [],
    registrationBodies: [],
    signLikeBodies: [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (typeof init?.body === "string" && /personal_sign|eth_sign|signTypedData/i.test(init.body)) {
        cap.signLikeBodies.push(init.body);
      }
      if (url.includes("/api/lab/config")) return jsonResponse(200, { ok: true, data: LAB_CONFIG });
      if (url.includes("/api/lab/anchor/")) return jsonResponse(200, { ok: true, data: ANCHOR });
      if (url.includes("/api/lab/metadata")) {
        if (init?.body instanceof FormData) cap.metadataBodies.push(init.body);
        return jsonResponse(200, { ok: true, data: METADATA_RESULT });
      }
      if (url.includes("/api/lab/prepare")) {
        if (typeof init?.body === "string") cap.prepareBodies.push(init.body);
        const stale = opts?.staleFirstPrepare === true;
        return jsonResponse(200, {
          ok: true,
          data: makeBundle(stale ? Date.now() - 10_000 : Date.now() + 500_000),
        });
      }
      if (url.includes("/api/lab/simulate")) {
        if (typeof init?.body === "string") cap.simulateBodies.push(init.body);
        const fresh = makeBundle(Date.now() + 500_000);
        return jsonResponse(200, {
          ok: true,
          data: {
            simulation: fresh.simulation,
            prepared: fresh.prepared,
            manifestHash: fresh.manifestHash,
          },
        });
      }
      if (url.includes("/api/lab/launches")) {
        if (typeof init?.body === "string") cap.registrationBodies.push(init.body);
        return jsonResponse(200, { ok: true, data: { registered: true } });
      }
      return jsonResponse(404, { ok: false, error: "not found", code: "NOT_FOUND" });
    }),
  );
  return cap;
}

const PNG = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], "t.png", {
    type: "image/png",
  });

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  h.state.address = h.WALLET;
  h.state.isConnected = true;
  h.state.chainId = 4663;
  window.localStorage.clear();
  h.fns.connect.mockClear();
  h.fns.switchChainAsync.mockClear();
  h.fns.sendTransactionAsync.mockClear();
  h.fns.waitForTransactionReceipt.mockClear();
  h.fns.signMessageAsync.mockClear();
  h.fns.decodeAndVerifyReceipt.mockClear();
  h.fns.routerPush.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("single wallet confirmation launch (founder P0)", () => {
  it("full wizard launch: zero signatures, one sendTransaction, registration carries the manifest", async () => {
    const cap = stubFetch();
    const user = userEvent.setup();
    wrap(<LabCreatePage />);

    // --- Step 1: metadata upload with NO wallet interaction ---
    await user.type(screen.getByTestId("name-input"), "Print Token");
    await user.type(screen.getByTestId("symbol-input"), "print");
    await user.type(screen.getByTestId("description-input"), "A community market token.");
    await user.upload(screen.getByTestId("image-input") as HTMLInputElement, PNG());
    await waitFor(() => expect(screen.getByTestId("upload-continue")).toBeEnabled());
    await user.click(screen.getByTestId("upload-continue"));
    await screen.findByTestId("pair-step");

    expect(h.fns.signMessageAsync).not.toHaveBeenCalled(); // (a)
    expect(cap.signLikeBodies).toEqual([]);
    expect(cap.metadataBodies.length).toBe(1);
    const fd = cap.metadataBodies[0]!;
    expect(fd.get("envelope")).toBeNull(); // no signed envelope part at all
    expect(fd.get("wallet")).toBe(h.WALLET); // plain rate-limit key only
    expect(typeof fd.get("fields")).toBe("string");
    expect(fd.get("image")).toBeInstanceOf(File);

    // --- Step 2: preparation with NO wallet interaction ---
    await user.click(screen.getByTestId("terms-checkbox"));
    await waitFor(() => expect(screen.getByTestId("prepare-launch")).toBeEnabled());
    await user.click(screen.getByTestId("prepare-launch"));
    await screen.findByTestId("review");

    expect(h.fns.signMessageAsync).not.toHaveBeenCalled(); // (b)
    expect(cap.prepareBodies.length).toBe(1);
    const prepareBody = JSON.parse(cap.prepareBodies[0]!) as Record<string, unknown>;
    expect(prepareBody.envelope).toBeUndefined();
    expect((prepareBody.payload as { creatorAddress: string }).creatorAddress).toBe(h.WALLET);

    // --- Review screen: single-confirmation copy before the button ---
    const confirmations = screen.getByTestId("wallet-confirmations");
    expect(confirmations).toHaveTextContent("Wallet confirmations");
    expect(confirmations).toHaveTextContent(/^Wallet confirmations1/); // value "1"
    expect(screen.getByTestId("wallet-confirmation-steps")).toHaveTextContent("1. Launch PRINT");
    expect(screen.getByTestId("launch-button")).toHaveTextContent("Launch PRINT");

    // --- Launch: EXACTLY ONE wallet confirmation (the deployment tx) ---
    await waitFor(() => expect(screen.getByTestId("launch-button")).toBeEnabled());
    await user.click(screen.getByTestId("launch-button"));
    await waitFor(() => expect(screen.getByTestId("launch-success-panel")).toBeInTheDocument());

    expect(h.fns.sendTransactionAsync).toHaveBeenCalledTimes(1); // (d)
    expect(h.fns.sendTransactionAsync).toHaveBeenCalledWith(
      expect.objectContaining({ to: TX_TARGET, data: "0xdeadbeef", chainId: 4663 }),
    );
    expect(h.fns.signMessageAsync).not.toHaveBeenCalled(); // never, anywhere
    expect(cap.signLikeBodies).toEqual([]);
    expect(cap.simulateBodies.length).toBe(0); // fresh bundle → no re-simulation

    // (e) Registration fires with transactionHash + full manifest.
    await waitFor(() => expect(cap.registrationBodies.length).toBe(1));
    const reg = JSON.parse(cap.registrationBodies[0]!) as {
      transactionHash: string;
      manifest: { tokenSymbol: string; calldataHash: string };
    };
    expect(reg.transactionHash).toBe(h.TX);
    expect(reg.manifest.tokenSymbol).toBe("PRINT");
    expect(reg.manifest.calldataHash).toBe(CALLDATA_HASH);
  });

  it("stale prepared tx: silent re-simulation with no wallet interaction, then ONE sendTransaction", async () => {
    const cap = stubFetch({ staleFirstPrepare: true });
    const user = userEvent.setup();

    function Probe() {
      const flow = useCreateFlow();
      return (
        <div>
          <span data-testid="probe-state">{flow.flowState}</span>
          <span data-testid="probe-error">{flow.error ?? ""}</span>
          <button
            data-testid="probe-fill"
            onClick={() =>
              flow.updateForm({
                tokenName: "Print Token",
                tokenSymbol: "PRINT",
                tokenDescription: "A community market token.",
                imageFile: PNG(),
                termsAccepted: true,
              })
            }
          >
            fill
          </button>
          <button data-testid="probe-upload" onClick={() => void flow.uploadMetadata()}>
            upload
          </button>
          <button data-testid="probe-prepare" onClick={() => void flow.prepare()}>
            prepare
          </button>
          <button data-testid="probe-launch" onClick={() => void flow.launch()}>
            launch
          </button>
        </div>
      );
    }
    wrap(<Probe />);

    await user.click(screen.getByTestId("probe-fill"));
    await user.click(screen.getByTestId("probe-upload"));
    await waitFor(() => expect(cap.metadataBodies.length).toBe(1));
    await user.click(screen.getByTestId("probe-prepare"));
    await waitFor(() => expect(cap.prepareBodies.length).toBe(1));

    // The prepared transaction is ALREADY stale → launch must silently
    // re-simulate (no wallet prompt) and then send exactly once.
    await user.click(screen.getByTestId("probe-launch"));
    await waitFor(() => expect(screen.getByTestId("probe-state")).toHaveTextContent("launch-success"));

    expect(cap.simulateBodies.length).toBe(1); // (c) silent re-simulation happened
    const simBody = JSON.parse(cap.simulateBodies[0]!) as Record<string, unknown>;
    expect(simBody.envelope).toBeUndefined(); // no envelope on re-simulation either
    expect(h.fns.signMessageAsync).not.toHaveBeenCalled(); // (c) zero signatures
    expect(cap.signLikeBodies).toEqual([]);
    expect(h.fns.sendTransactionAsync).toHaveBeenCalledTimes(1); // (d) still exactly one

    // (e) Registration still fires with transactionHash + manifest.
    await waitFor(() => expect(cap.registrationBodies.length).toBe(1));
    const reg = JSON.parse(cap.registrationBodies[0]!) as {
      transactionHash: string;
      manifest: { tokenSymbol: string };
    };
    expect(reg.transactionHash).toBe(h.TX);
    expect(reg.manifest.tokenSymbol).toBe("PRINT");
  });

  it("a stale-but-ready flow stays 'ready-to-launch' (no dead-end while silent refresh exists)", async () => {
    stubFetch({ staleFirstPrepare: true });
    const user = userEvent.setup();

    function Probe() {
      const flow = useCreateFlow();
      return (
        <div>
          <span data-testid="probe-state">{flow.flowState}</span>
          <span data-testid="probe-can-launch">{String(flow.canLaunch)}</span>
          <button
            data-testid="probe-fill"
            onClick={() =>
              flow.updateForm({
                tokenName: "Print Token",
                tokenSymbol: "PRINT",
                tokenDescription: "A community market token.",
                imageFile: PNG(),
                termsAccepted: true,
              })
            }
          >
            fill
          </button>
          <button data-testid="probe-upload" onClick={() => void flow.uploadMetadata()}>
            upload
          </button>
          <button data-testid="probe-prepare" onClick={() => void flow.prepare()}>
            prepare
          </button>
        </div>
      );
    }
    wrap(<Probe />);

    await user.click(screen.getByTestId("probe-fill"));
    await user.click(screen.getByTestId("probe-upload"));
    await waitFor(() => expect(screen.getByTestId("probe-state")).toHaveTextContent("metadata-confirmed"));
    await user.click(screen.getByTestId("probe-prepare"));
    // Even though the returned bundle is ALREADY stale, the flow remains
    // launchable — launch() re-simulates silently before sending.
    await waitFor(() => expect(screen.getByTestId("probe-can-launch")).toHaveTextContent("true"));
    expect(screen.getByTestId("probe-state")).toHaveTextContent("ready-to-launch");
  });
});
