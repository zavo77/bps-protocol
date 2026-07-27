import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { NATIVE_ETH, PAYMENT_TOKENS } from "@bps/launch-lab";
import { TradeCard } from "./[tokenAddress]/TradeCard";
import { PriceChart } from "./[tokenAddress]/PriceChart";

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
    getBalance: vi.fn(),
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
    getBalance: h.fns.getBalance,
    waitForTransactionReceipt: h.fns.waitForTransactionReceipt,
  }),
  useSwitchChain: () => ({ switchChainAsync: h.fns.switchChainAsync }),
  useWriteContract: () => ({ writeContractAsync: h.fns.writeContractAsync }),
  useSendTransaction: () => ({ sendTransactionAsync: h.fns.sendTransactionAsync }),
  useSignMessage: () => ({ signMessageAsync: h.fns.signMessageAsync }),
}));

const TOKEN = "0x1111111111111111111111111111111111111111";
const TAKER = "0x1000000000000000000000000000000000000001";
const ROUTER = "0x2222222222222222222222222222222222222222";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const NVDA = "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC";
const USDG = PAYMENT_TOKENS.find((t) => t.symbol === "USDG")!.address;

const WEI = (n: number) => (BigInt(n) * 10n ** 18n).toString();

/** One-step buy: pay ETH → receive PRINT, single 0x transaction. */
const ONE_STEP_BUY = {
  marketToken: TOKEN,
  side: "buy",
  anchorSymbol: "GOOGL",
  anchorAddress: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
  userInputToken: NATIVE_ETH,
  userOutputToken: TOKEN,
  routeKind: "one-step",
  legs: [
    {
      kind: "zeroEx",
      label: "0x: ETH → PRINT",
      inputToken: NATIVE_ETH,
      outputToken: TOKEN,
      inputAmountWei: WEI(1),
      expectedOutputWei: WEI(5000),
      minimumOutputWei: WEI(4950),
      transactionTarget: ROUTER,
      transactionData: "0x",
      transactionValue: WEI(1),
      allowanceTarget: null,
      estimated: false,
    },
  ],
  expectedFinalOutputWei: WEI(5000),
  minimumFinalOutputWei: WEI(4950),
  totalPriceImpactBps: 120,
  poolFeeUnits: 10_000,
  zeroExFeeNote: null,
  walletActionCount: 1,
  approvalsRequired: [],
  quoteExpiry: Date.now() + 60_000,
  warnings: [],
};

/** Composed buy: ETH → NVDA (0x), then NVDA → PRINT (BPS Direct). Two wallet actions. */
const COMPOSED_BUY = {
  marketToken: TOKEN,
  side: "buy",
  anchorSymbol: "NVDA",
  anchorAddress: NVDA,
  userInputToken: NATIVE_ETH,
  userOutputToken: TOKEN,
  routeKind: "composed",
  legs: [
    {
      kind: "zeroEx",
      label: "0x: ETH → NVDA",
      inputToken: NATIVE_ETH,
      outputToken: NVDA,
      inputAmountWei: WEI(1),
      expectedOutputWei: WEI(2),
      minimumOutputWei: WEI(2),
      transactionTarget: ROUTER,
      transactionData: "0x",
      transactionValue: WEI(1),
      allowanceTarget: null,
      estimated: false,
    },
    {
      kind: "bpsDirect",
      label: "BPS Direct: NVDA → PRINT",
      inputToken: NVDA,
      outputToken: TOKEN,
      inputAmountWei: WEI(2),
      expectedOutputWei: WEI(5000),
      minimumOutputWei: WEI(4950),
      transactionTarget: ROUTER,
      transactionData: null,
      transactionValue: "0",
      allowanceTarget: PERMIT2,
      estimated: true,
    },
  ],
  expectedFinalOutputWei: WEI(5000),
  minimumFinalOutputWei: WEI(4950),
  totalPriceImpactBps: 200,
  poolFeeUnits: 10_000,
  zeroExFeeNote: null,
  walletActionCount: 2,
  approvalsRequired: [{ token: NVDA, spender: PERMIT2 }],
  quoteExpiry: Date.now() + 60_000,
  warnings: [],
};

function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as unknown as Response;
}

interface Call {
  url: string;
  body: Record<string, unknown> | null;
}
type Handler = (url: string, init?: RequestInit) => Response;

function stubFetch(handler: Handler): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      let body: Record<string, unknown> | null = null;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = null;
        }
      }
      calls.push({ url, body });
      return handler(url, init);
    }),
  );
  return calls;
}

function bodyFor(calls: Call[], fragment: string): Record<string, unknown> | null {
  return calls.find((c) => c.url.includes(fragment))?.body ?? null;
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
  h.fns.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
    if (functionName === "decimals") return 18;
    if (functionName === "balanceOf") return 1000n * 10n ** 18n;
    return 0n;
  });
  h.fns.getBalance.mockResolvedValue(1000n * 10n ** 18n);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TradeCard — pay/receive assets (ETH / WETH / USDG)", () => {
  it("buy with ETH selected quotes inputToken=NATIVE_ETH, output=marketToken and renders expected output", async () => {
    const user = userEvent.setup();
    const calls = stubFetch((url) => {
      if (url.includes("/api/lab/quote"))
        return jsonResponse(200, { ok: true, data: ONE_STEP_BUY });
      return jsonResponse(404, { ok: false, error: "not found", code: "NOT_FOUND" });
    });

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="GOOGL" />);

    await user.type(screen.getByTestId("trade-amount"), "1");
    await user.click(screen.getByTestId("quote-button"));

    await waitFor(() => expect(screen.getByTestId("expected-output")).toHaveTextContent(/5000/));
    expect(screen.getByTestId("expected-output")).toHaveTextContent(/PRINT/);
    expect(screen.getByTestId("minimum-received")).toHaveTextContent(/4950/);
    expect(screen.getByTestId("price-impact")).toHaveTextContent(/1\.20%/);
    expect(screen.getByTestId("pool-fee")).toHaveTextContent(/1\.00%/);

    const body = bodyFor(calls, "/api/lab/quote");
    expect(body).not.toBeNull();
    expect(body!.side).toBe("buy");
    expect(body!.inputToken).toBe(NATIVE_ETH);
    expect(body!.outputToken).toBe(TOKEN);
    expect(body!.marketToken).toBe(TOKEN);
  });

  it("buy with USDG selected quotes inputToken=USDG address", async () => {
    const user = userEvent.setup();
    const calls = stubFetch((url) => {
      if (url.includes("/api/lab/quote"))
        return jsonResponse(200, { ok: true, data: ONE_STEP_BUY });
      return jsonResponse(404, { ok: false, error: "not found", code: "NOT_FOUND" });
    });

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="GOOGL" />);

    await user.click(screen.getByTestId("paytoken-USDG"));
    await user.type(screen.getByTestId("trade-amount"), "10");
    await user.click(screen.getByTestId("quote-button"));

    await waitFor(() => expect(bodyFor(calls, "/api/lab/quote")).not.toBeNull());
    const body = bodyFor(calls, "/api/lab/quote");
    expect(body!.side).toBe("buy");
    expect(body!.inputToken).toBe(USDG);
    expect(body!.outputToken).toBe(TOKEN);
  });

  it("sell quotes inputToken=marketToken and outputToken=the chosen pay asset (ETH)", async () => {
    const user = userEvent.setup();
    const calls = stubFetch((url) => {
      if (url.includes("/api/lab/quote"))
        return jsonResponse(200, {
          ok: true,
          data: {
            ...ONE_STEP_BUY,
            side: "sell",
            userInputToken: TOKEN,
            userOutputToken: NATIVE_ETH,
          },
        });
      return jsonResponse(404, { ok: false, error: "not found", code: "NOT_FOUND" });
    });

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="GOOGL" />);

    await user.click(screen.getByTestId("tab-sell"));
    // Sell → the "You receive" side is the pay-asset selector; ETH is the default.
    expect(screen.getByTestId("receive-selector")).toBeInTheDocument();
    expect(screen.getByTestId("paytoken-ETH")).toHaveAttribute("aria-pressed", "true");

    await user.type(screen.getByTestId("trade-amount"), "100");
    await user.click(screen.getByTestId("quote-button"));

    await waitFor(() => expect(bodyFor(calls, "/api/lab/quote")).not.toBeNull());
    const body = bodyFor(calls, "/api/lab/quote");
    expect(body!.side).toBe("sell");
    expect(body!.inputToken).toBe(TOKEN);
    expect(body!.outputToken).toBe(NATIVE_ETH);
  });

  it("the primary amount field is never labeled with the anchor symbol", async () => {
    stubFetch(() => jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" }));

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="NVDA" />);

    const label = screen.getByTestId("amount-field-label");
    expect(label).toHaveTextContent(/you pay/i);
    expect(label).not.toHaveTextContent("NVDA");
    // The amount input's accessible name must not carry the anchor symbol either.
    expect(screen.getByTestId("trade-amount")).not.toHaveAccessibleName(/NVDA/);
  });
});

describe("TradeCard — honesty about composed routes", () => {
  it("a composed (2-step) route shows the step count and 'not one-click' with route details collapsed", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.includes("/api/lab/quote"))
        return jsonResponse(200, { ok: true, data: COMPOSED_BUY });
      return jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" });
    });

    wrap(
      <TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="NVDA" anchorAddress={NVDA} />,
    );

    await user.type(screen.getByTestId("trade-amount"), "1");
    await user.click(screen.getByTestId("quote-button"));

    await waitFor(() => expect(screen.getByTestId("route-details")).toBeInTheDocument());
    // Route/legs are disclosed only inside a collapsed <details>.
    expect(screen.getByTestId("route-details")).not.toHaveAttribute("open");
    // The always-visible summary is honest: 2 steps, via the anchor, not one-click.
    const summary = screen.getByTestId("route-summary");
    expect(summary).toHaveTextContent(/2 steps/);
    expect(summary).toHaveTextContent(/via NVDA/);
    expect(summary).toHaveTextContent(/not one-click/i);
    // The primary button never implies a single atomic swap.
    expect(screen.getByTestId("trade-button")).toHaveTextContent(/2 steps/);
    expect(screen.queryByText(/atomic/i)).toBeNull();
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

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="GOOGL" />);

    await user.click(screen.getByTestId("tab-sell"));
    await user.click(screen.getByTestId("trade-max"));

    await waitFor(() =>
      expect((screen.getByTestId("trade-amount") as HTMLInputElement).value).toBe("250"),
    );
  });
});

describe("TradeCard — safety gates", () => {
  it("a disconnected wallet cannot reach signing (no quote or prepare-leg request)", async () => {
    h.state.isConnected = false;
    h.state.address = undefined;
    const calls = stubFetch(() => jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" }));

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="GOOGL" />);

    expect(screen.getByTestId("trade-connect")).toBeInTheDocument();
    expect(screen.queryByTestId("trade-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quote-button")).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/api/lab/trade/prepare-leg"))).toBe(false);
    expect(calls.some((c) => c.url.includes("/api/lab/quote"))).toBe(false);
  });

  it("shows the switch-chain control when connected to the wrong chain", async () => {
    h.state.chainId = 1;
    stubFetch(() => jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" }));

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="GOOGL" />);

    const switchBtn = screen.getByTestId("switch-chain");
    expect(switchBtn).toHaveTextContent(/Switch to Robinhood Chain/i);
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
