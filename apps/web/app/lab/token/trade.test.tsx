import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TradeCard } from "./[address]/TradeCard";
import { PriceChart } from "./[address]/PriceChart";

// ---------------------------------------------------------------------------
// Wagmi hooks are mocked wholesale so the trade card can be exercised in jsdom
// with a controllable connected/disconnected wallet, chain id, and RPC reads.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  state: {
    address: undefined as string | undefined,
    isConnected: false,
    chainId: 4663,
  },
  fns: {
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    switchChainAsync: vi.fn(),
    writeContractAsync: vi.fn(),
    sendTransactionAsync: vi.fn(),
    signMessageAsync: vi.fn(),
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: h.state.address, isConnected: h.state.isConnected }),
  useChainId: () => h.state.chainId,
  usePublicClient: () => ({
    readContract: h.fns.readContract,
    waitForTransactionReceipt: h.fns.waitForTransactionReceipt,
  }),
  useSwitchChain: () => ({ switchChainAsync: h.fns.switchChainAsync }),
  useWriteContract: () => ({ writeContractAsync: h.fns.writeContractAsync }),
  useSendTransaction: () => ({ sendTransactionAsync: h.fns.sendTransactionAsync }),
  useSignMessage: () => ({ signMessageAsync: h.fns.signMessageAsync }),
}));

const TOKEN = "0x1111111111111111111111111111111111111111";
const TAKER = "0x1000000000000000000000000000000000000001";
const GOOGL = "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const ROUTER = "0x2222222222222222222222222222222222222222";

const WEI = (n: number) => (BigInt(n) * 10n ** 18n).toString();

const BUY_QUOTE = {
  routes: [
    {
      routeId: "bpsDirectV4",
      routeLabel: "BPS Direct",
      sellToken: GOOGL,
      buyToken: TOKEN,
      sellAmount: WEI(10),
      buyAmount: WEI(5000),
      minimumBuyAmount: WEI(4950),
      estimatedGas: "500000",
      priceImpactBps: 120,
      poolFee: 10_000,
      allowanceTarget: PERMIT2,
      transactionTarget: ROUTER,
      transactionData: "0x",
      transactionValue: "0",
      quoteBlock: "100",
      quoteExpiry: Date.now() + 60_000,
      warnings: [],
    },
  ],
  selected: "bpsDirectV4",
  side: "buy",
  tokenAddress: TOKEN,
  taker: TAKER,
};

function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as unknown as Response;
}

type Handler = (url: string, init?: RequestInit) => Response;

function stubFetch(handler: Handler): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      return handler(url, init);
    }),
  );
  return calls;
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  h.state.address = TAKER;
  h.state.isConnected = true;
  h.state.chainId = 4663;
  for (const fn of Object.values(h.fns)) fn.mockReset();
  // Sensible default balances so useTokenBalances resolves to real bigints.
  h.fns.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
    if (functionName === "decimals") return 18;
    if (functionName === "balanceOf") return 1000n * 10n ** 18n;
    return 0n;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TradeCard — quoting", () => {
  it("renders expected output, minimum received, and the selected route for a buy quote", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.includes("/api/lab/quote")) return jsonResponse(200, { ok: true, data: BUY_QUOTE });
      return jsonResponse(404, { ok: false, error: "not found", code: "NOT_FOUND" });
    });

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" />);

    await user.type(screen.getByTestId("trade-amount"), "10");
    await user.click(screen.getByTestId("quote-button"));

    await waitFor(() => expect(screen.getByTestId("expected-output")).toHaveTextContent(/5000/));
    expect(screen.getByTestId("expected-output")).toHaveTextContent(/PRINT/);
    expect(screen.getByTestId("minimum-received")).toHaveTextContent(/4950/);
    expect(screen.getByTestId("selected-route")).toHaveTextContent(/BPS Direct/);
    expect(screen.getByTestId("pool-fee")).toHaveTextContent(/1\.00%/);
    expect(screen.getByTestId("price-impact")).toHaveTextContent(/1\.20%/);
  });

  it("shows the no-route state when the quote endpoint says the token is not a lab market", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.includes("/api/lab/quote"))
        return jsonResponse(404, {
          ok: false,
          error: "That token is not a Launch Lab GOOGL market.",
          code: "NOT_A_LAB_MARKET",
        });
      return jsonResponse(404, { ok: false, error: "not found", code: "NOT_FOUND" });
    });

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" />);

    await user.type(screen.getByTestId("trade-amount"), "10");
    await user.click(screen.getByTestId("quote-button"));

    await waitFor(() => expect(screen.getByTestId("no-route")).toBeInTheDocument());
    expect(screen.getByTestId("no-route")).toHaveTextContent(/No Launch Lab route/i);
  });
});

describe("TradeCard — sell shortcuts", () => {
  it("Max reads the connected wallet's token balance and fills the amount", async () => {
    const user = userEvent.setup();
    h.fns.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "decimals") return 18;
      if (functionName === "balanceOf") return 250n * 10n ** 18n;
      return 0n;
    });
    stubFetch(() => jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" }));

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" />);

    await user.click(screen.getByTestId("tab-sell"));
    await user.click(screen.getByTestId("trade-max"));

    await waitFor(() =>
      expect((screen.getByTestId("trade-amount") as HTMLInputElement).value).toBe("250"),
    );
  });
});

describe("TradeCard — safety gates", () => {
  it("a disconnected wallet cannot reach signing (no /trade/prepare request)", async () => {
    h.state.isConnected = false;
    h.state.address = undefined;
    const calls = stubFetch(() => jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" }));

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" />);

    expect(screen.getByTestId("trade-connect")).toBeInTheDocument();
    // No trade/quote action buttons are rendered while disconnected.
    expect(screen.queryByTestId("trade-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quote-button")).not.toBeInTheDocument();
    expect(calls.some((u) => u.includes("/api/lab/trade/prepare"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/lab/quote"))).toBe(false);
  });

  it("shows the switch-chain control when connected to the wrong chain", async () => {
    h.state.chainId = 1;
    stubFetch(() => jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" }));

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" />);

    const switchBtn = screen.getByTestId("switch-chain");
    expect(switchBtn).toHaveTextContent(/Switch to Robinhood Chain/i);
    // The trade button is replaced by the switch control while on the wrong chain.
    expect(screen.queryByTestId("trade-button")).not.toBeInTheDocument();
  });
});

describe("PriceChart", () => {
  it('shows "Collecting market data" for empty history', async () => {
    stubFetch((url) => {
      if (url.includes("/api/lab/history/"))
        return jsonResponse(200, { ok: true, data: { available: true, swaps: [] } });
      return jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" });
    });

    wrap(<PriceChart address={TOKEN} tokenSymbol="PRINT" />);

    await waitFor(() =>
      expect(screen.getByTestId("price-chart-empty")).toHaveTextContent(/Collecting market data/i),
    );
    expect(screen.queryByTestId("price-chart-svg")).not.toBeInTheDocument();
  });

  it("renders real swap points for non-empty history", async () => {
    const swaps = [
      {
        id: 1,
        poolId: "0xpool",
        blockNumber: 10,
        txHash: "0xaaa",
        amount0: "1000000000000000000",
        amount1: "500000000000000000",
        sqrtPriceX96: "79228162514264337593543950336", // 2^96 → price ≈ 1
        tick: 0,
        fee: 10000,
        occurredAt: 1_753_600_000,
      },
      {
        id: 2,
        poolId: "0xpool",
        blockNumber: 11,
        txHash: "0xbbb",
        amount0: "2000000000000000000",
        amount1: "500000000000000000",
        sqrtPriceX96: "112044876359446739992122380288", // ≈ price 2
        tick: 10,
        fee: 10000,
        occurredAt: 1_753_600_600,
      },
      {
        id: 3,
        poolId: "0xpool",
        blockNumber: 12,
        txHash: "0xccc",
        amount0: "1500000000000000000",
        amount1: "500000000000000000",
        sqrtPriceX96: "137201025763335650739594956800",
        tick: 20,
        fee: 10000,
        occurredAt: 1_753_601_200,
      },
    ];
    stubFetch((url) => {
      if (url.includes("/api/lab/history/"))
        return jsonResponse(200, { ok: true, data: { available: true, swaps } });
      return jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" });
    });

    wrap(<PriceChart address={TOKEN} tokenSymbol="PRINT" />);

    await waitFor(() => expect(screen.getByTestId("price-chart-svg")).toBeInTheDocument());
    expect(screen.getByTestId("price-chart-svg")).toHaveAttribute("data-point-count", "3");
    expect(screen.getAllByTestId("price-point").length).toBe(3);
    expect(screen.queryByTestId("price-chart-empty")).not.toBeInTheDocument();
  });
});
