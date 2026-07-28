import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FEE_PRESETS } from "@bps/launch-lab";
import LabCreatePage from "./page";

// Wallet-scoped wizard-state isolation (founder P0): a wallet change or
// disconnect must wipe the previous wallet's draft and wallet-bound state and
// return to Step 1; drafts persist ONLY per (chainId, address); Start over
// clears everything including the persisted draft; a fresh visitor always
// starts empty.

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
    getGasPrice: vi.fn(async () => 1_000_000n),
    signMessageAsync: vi.fn(async () => `0x${"ab".repeat(65)}`),
    disconnect: vi.fn(),
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: h.state.address, isConnected: h.state.isConnected }),
  useChainId: () => h.state.chainId,
  usePublicClient: () => ({
    waitForTransactionReceipt: h.fns.waitForTransactionReceipt,
    readContract: h.fns.readContract,
    getGasPrice: h.fns.getGasPrice,
  }),
  useConnect: () => ({ connect: h.fns.connect, connectors: [], isPending: false }),
  useDisconnect: () => ({ disconnect: h.fns.disconnect }),
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

const WALLET_A = "0x1000000000000000000000000000000000000001";
const WALLET_B = "0x2000000000000000000000000000000000000002";

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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/lab/config")) {
        return { status: 200, json: async () => ({ ok: true, data: LAB_CONFIG }) } as Response;
      }
      return {
        status: 404,
        json: async () => ({ ok: false, error: "x", code: "NOT_FOUND" }),
      } as unknown as Response;
    }),
  );
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  h.state.address = WALLET_A;
  h.state.isConnected = true;
  h.state.chainId = 4663;
  window.localStorage.clear();
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wallet-scoped wizard isolation", () => {
  it("wallet address change wipes the previous wallet's draft and shows an empty Step 1", async () => {
    const user = userEvent.setup();
    const view = wrap(<LabCreatePage />);

    await user.type(screen.getByTestId("name-input"), "MAG7");
    await user.type(screen.getByTestId("symbol-input"), "mag7");
    await user.type(screen.getByTestId("description-input"), "wallet A private draft");
    expect((screen.getByTestId("name-input") as HTMLInputElement).value).toBe("MAG7");

    // Wallet B connects in the same tab.
    h.state.address = WALLET_B;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <LabCreatePage />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect((screen.getByTestId("name-input") as HTMLInputElement).value).toBe(""),
    );
    expect((screen.getByTestId("symbol-input") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("description-input") as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByText(/wallet A private draft/)).toBeNull();
  });

  it("disconnect wipes the wallet-bound draft and returns to an empty Step 1", async () => {
    const user = userEvent.setup();
    const view = wrap(<LabCreatePage />);

    await user.type(screen.getByTestId("name-input"), "Secret Draft");

    h.state.address = undefined;
    h.state.isConnected = false;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <LabCreatePage />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect((screen.getByTestId("name-input") as HTMLInputElement).value).toBe(""),
    );
  });

  it("persists a draft ONLY under the connected wallet's scoped key and restores it for that wallet", async () => {
    const user = userEvent.setup();
    wrap(<LabCreatePage />);

    await user.type(screen.getByTestId("name-input"), "My Token");
    const key = `bps.lab.launchDraft.v1.4663.${WALLET_A.toLowerCase()}`;
    await waitFor(() => expect(window.localStorage.getItem(key)).not.toBeNull(), {
      timeout: 3000,
    });
    const stored = JSON.parse(window.localStorage.getItem(key)!) as Record<string, unknown>;
    expect(stored.tokenName).toBe("My Token");
    // Nothing wallet-B-scoped, nothing unscoped.
    expect(
      Object.keys(window.localStorage).filter((k) => k.startsWith("bps.lab.launchDraft")),
    ).toEqual([key]);
  });

  it("Start over clears the form AND the persisted draft", async () => {
    const user = userEvent.setup();
    wrap(<LabCreatePage />);

    await user.type(screen.getByTestId("name-input"), "Temporary");
    const key = `bps.lab.launchDraft.v1.4663.${WALLET_A.toLowerCase()}`;
    await waitFor(() => expect(window.localStorage.getItem(key)).not.toBeNull(), {
      timeout: 3000,
    });

    await user.click(screen.getByTestId("start-over"));
    await waitFor(() =>
      expect((screen.getByTestId("name-input") as HTMLInputElement).value).toBe(""),
    );
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("a disconnected visitor never writes any draft storage", async () => {
    h.state.address = undefined;
    h.state.isConnected = false;
    const user = userEvent.setup();
    wrap(<LabCreatePage />);

    await user.type(screen.getByTestId("name-input"), "anon");
    await new Promise((r) => setTimeout(r, 700));
    expect(
      Object.keys(window.localStorage).filter((k) => k.startsWith("bps.lab.launchDraft")),
    ).toEqual([]);
  });
});
