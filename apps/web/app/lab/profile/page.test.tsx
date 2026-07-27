import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { APPROVED_ANCHORS, FEE_PRESETS } from "@bps/launch-lab";
import { ProfileView } from "./[walletAddress]/ProfileView";

// Wagmi mocked wholesale so the connected wallet (and thus profile ownership) is
// controllable; nothing signs during these tests.
const h = vi.hoisted(() => ({
  state: {
    address: undefined as string | undefined,
    isConnected: false,
    chainId: 4663,
  },
  fns: {
    waitForTransactionReceipt: vi.fn(),
    sendTransactionAsync: vi.fn(),
    signMessageAsync: vi.fn(),
    readContract: vi.fn(),
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: h.state.address, isConnected: h.state.isConnected }),
  useChainId: () => h.state.chainId,
  usePublicClient: () => ({
    waitForTransactionReceipt: h.fns.waitForTransactionReceipt,
    readContract: h.fns.readContract,
  }),
  useSendTransaction: () => ({ sendTransactionAsync: h.fns.sendTransactionAsync }),
  useSignMessage: () => ({ signMessageAsync: h.fns.signMessageAsync }),
}));

const OWNER = "0x1000000000000000000000000000000000000001";
const OTHER = "0x9999999999999999999999999999999999999999";
const TOKEN = "0x2222222222222222222222222222222222222222";

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

const PROFILE = {
  creator: OWNER,
  marketCount: 1,
  totalIndexedGrossWei: "5000000000000000000",
  indexedDataAvailable: true,
  markets: [
    {
      tokenAddress: TOKEN,
      tokenName: "Example Token",
      tokenSymbol: "EXT",
      anchorSymbol: "GOOGL",
      anchorAddress: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
      launchTransactionHash: `0x${"ab".repeat(32)}`,
      blockNumber: "1234567",
      timestamp: 1_753_600_000,
      indexedSwaps: 12,
      grossMovementWei: "5000000000000000000",
    },
  ],
};

const FEES_CLAIMABLE = {
  fees0: "1000000000000000000",
  fees1: "0",
  anchorSymbol: "GOOGL",
  anchorAddress: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
  anchorFeesWei: "1000000000000000000",
  tokenFeesWei: "0",
  hasClaimable: true,
  poolId: `0x${"11".repeat(32)}`,
};

const FEES_NONE = { ...FEES_CLAIMABLE, anchorFeesWei: "0", hasClaimable: false };

function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as unknown as Response;
}

function stubFetch(feesData: unknown | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/lab/config")) return jsonResponse(200, { ok: true, data: LAB_CONFIG });
      if (url.includes("/api/lab/profile/")) return jsonResponse(200, { ok: true, data: PROFILE });
      if (url.includes("/api/lab/fees/")) {
        if (feesData === null)
          return jsonResponse(404, {
            ok: false,
            error: "not a lab market",
            code: "NOT_A_LAB_MARKET",
          });
        return jsonResponse(200, { ok: true, data: feesData });
      }
      return jsonResponse(404, { ok: false, error: "not found", code: "NOT_FOUND" });
    }),
  );
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  h.state.address = undefined;
  h.state.isConnected = false;
  for (const fn of Object.values(h.fns)) fn.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Creator profile — public view", () => {
  it("renders the creator's markets and hides fees from non-owners", async () => {
    stubFetch(null);
    wrap(<ProfileView walletAddress={OWNER} />);

    await waitFor(() => expect(screen.getByText(/Example Token/)).toBeInTheDocument());
    expect(screen.getByTestId("profile-summary")).toHaveTextContent("Markets created");
    expect(screen.getByTestId("profile-summary")).toHaveTextContent("1");

    // A non-connected viewer never sees a claim control; fees belong to the creator.
    expect(screen.getByTestId("fees-visible-to-creator")).toBeInTheDocument();
    expect(screen.queryByTestId("claim-button")).not.toBeInTheDocument();
  });
});

describe("Creator profile — owner fee claiming", () => {
  it("disables the claim button when there is nothing contract-claimable", async () => {
    h.state.address = OWNER;
    h.state.isConnected = true;
    stubFetch(FEES_NONE);
    wrap(<ProfileView walletAddress={OWNER} />);

    await waitFor(() => expect(screen.getByTestId("claim-button")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("fee-none")).toBeInTheDocument());
    expect(screen.getByTestId("claim-button")).toBeDisabled();
  });

  it("enables the claim button only when getPendingFees reports claimable amounts", async () => {
    h.state.address = OWNER;
    h.state.isConnected = true;
    stubFetch(FEES_CLAIMABLE);
    wrap(<ProfileView walletAddress={OWNER} />);

    await waitFor(() => expect(screen.getByTestId("claim-button")).toBeEnabled());
    // Real contract-backed pending amounts are surfaced, not estimates.
    expect(screen.getByTestId("fee-anchor")).toHaveTextContent("1 GOOGL");
  });

  it("does not treat a different connected wallet as the owner", async () => {
    h.state.address = OTHER;
    h.state.isConnected = true;
    stubFetch(FEES_CLAIMABLE);
    wrap(<ProfileView walletAddress={OWNER} />);

    await waitFor(() => expect(screen.getByText(/Example Token/)).toBeInTheDocument());
    expect(screen.getByTestId("fees-visible-to-creator")).toBeInTheDocument();
    expect(screen.queryByTestId("claim-button")).not.toBeInTheDocument();
  });
});
