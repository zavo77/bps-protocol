import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { NATIVE_ETH, PAYMENT_TOKENS } from "@bps/launch-lab";
import {
  loadPendingTrade,
  savePendingTrade,
  type PendingComposedTrade,
} from "../../../hooks/lab/trade-recovery";
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
  useAccount: () => ({ address: h.state.address, isConnected: h.state.isConnected, chainId: h.state.chainId }),
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

/** Composed sell: PRINT → NVDA (BPS Direct), then NVDA → ETH (Rialto). Two wallet actions. */
const COMPOSED_SELL = {
  marketToken: TOKEN,
  side: "sell",
  anchorSymbol: "NVDA",
  anchorAddress: NVDA,
  userInputToken: TOKEN,
  userOutputToken: NATIVE_ETH,
  routeKind: "composed",
  legs: [
    {
      kind: "bpsDirect",
      label: "BPS Direct: PRINT → NVDA",
      inputToken: TOKEN,
      outputToken: NVDA,
      inputAmountWei: WEI(100),
      expectedOutputWei: WEI(2),
      minimumOutputWei: WEI(2),
      transactionTarget: ROUTER,
      transactionData: "0x",
      transactionValue: "0",
      allowanceTarget: PERMIT2,
      estimated: false,
    },
    {
      kind: "rialto",
      label: "Rialto: NVDA → ETH",
      inputToken: NVDA,
      outputToken: NATIVE_ETH,
      inputAmountWei: WEI(2),
      expectedOutputWei: WEI(1),
      minimumOutputWei: WEI(1),
      transactionTarget: ROUTER,
      transactionData: null,
      transactionValue: "0",
      allowanceTarget: ROUTER,
      estimated: true,
    },
  ],
  expectedFinalOutputWei: WEI(1),
  minimumFinalOutputWei: WEI(1),
  totalPriceImpactBps: 100,
  poolFeeUnits: 10_000,
  zeroExFeeNote: "Rialto leg fee 5 bps.",
  walletActionCount: 2,
  approvalsRequired: [],
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
  if (typeof globalThis.localStorage !== "undefined") globalThis.localStorage.clear();
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

describe("TradeCard — frozen V1 primary UI (routing internals inside Trade details)", () => {
  it("a composed (2-step) route keeps anchor/steps/venue inside collapsed Trade details; the summary and button stay generic", async () => {
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

    await waitFor(() => expect(screen.getByTestId("expected-output")).toBeInTheDocument());
    // Routing internals live only inside the collapsed <details>.
    const details = screen.getByTestId("route-details");
    expect(details).not.toHaveAttribute("open");
    // The always-visible summary is generic — no anchor, venue, or step count.
    const summary = screen.getByTestId("route-summary");
    expect(summary).toHaveTextContent(/^Trade details$/);
    expect(summary).not.toHaveTextContent(/NVDA/);
    // The primary button is just the action — no step count, and never "atomic".
    expect(screen.getByTestId("trade-button")).toHaveTextContent(/^Buy$/);
    expect(screen.queryByText(/atomic/i)).toBeNull();
    // Inside Trade details the breakdown stays fully honest.
    expect(screen.getByTestId("internal-anchor")).toHaveTextContent("NVDA");
    expect(screen.getByTestId("wallet-actions")).toHaveTextContent(/2/);
    expect(screen.getByTestId("wallet-actions")).toHaveTextContent(/not one-click/i);
    expect(screen.getByTestId("route-legs")).toHaveTextContent(/NVDA → PRINT/);
    expect(screen.getByTestId("minimum-received")).toBeInTheDocument();
    expect(screen.getByTestId("price-impact")).toBeInTheDocument();
    expect(screen.getByTestId("pool-fee")).toBeInTheDocument();
  });

  it("primary surface never leaks the anchor before a quote; anchor pay option sits inside Trade details", async () => {
    stubFetch(() => jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" }));

    wrap(
      <TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="NVDA" anchorAddress={NVDA} />,
    );

    // The pay pills are payment assets only — the anchor is not offered there.
    const paySelector = screen.getByTestId("pay-selector");
    expect(paySelector).not.toHaveTextContent("NVDA");
    // The advanced anchor option exists, but inside the Trade details disclosure.
    const advanced = screen.getByTestId("paytoken-advanced");
    expect(screen.getByTestId("route-details")).toContainElement(advanced);
    expect(advanced).toHaveTextContent(/you never need to own it/i);
  });

  it("the venue platform fee is displayed inside Trade details when the route reports one", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.includes("/api/lab/quote"))
        return jsonResponse(200, {
          ok: true,
          data: { ...ONE_STEP_BUY, zeroExFeeNote: "Rialto fee 5 bps (in quoted output)." },
        });
      return jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" });
    });

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="GOOGL" />);

    await user.type(screen.getByTestId("trade-amount"), "1");
    await user.click(screen.getByTestId("quote-button"));

    await waitFor(() =>
      expect(screen.getByTestId("zeroex-fee-note")).toHaveTextContent(/Rialto fee 5 bps/),
    );
    // …and it lives inside the Trade details disclosure, not the primary surface.
    expect(screen.getByTestId("route-details")).toContainElement(
      screen.getByTestId("zeroex-fee-note"),
    );
  });

  it("an expired quote is rejected for execution and refreshed instead — no wallet interaction", async () => {
    const user = userEvent.setup();
    const calls = stubFetch((url) => {
      if (url.includes("/api/lab/quote"))
        return jsonResponse(200, {
          ok: true,
          data: { ...ONE_STEP_BUY, quoteExpiry: Date.now() - 1_000 }, // already stale
        });
      return jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" });
    });

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="GOOGL" />);

    await user.type(screen.getByTestId("trade-amount"), "1");
    await user.click(screen.getByTestId("quote-button"));
    await waitFor(() => expect(screen.getByTestId("trade-button")).toBeInTheDocument());
    await user.click(screen.getByTestId("trade-button"));

    // The stale quote is refreshed (second /quote call), never executed.
    await waitFor(() =>
      expect(calls.filter((c) => c.url.includes("/api/lab/quote")).length).toBeGreaterThanOrEqual(
        2,
      ),
    );
    expect(calls.some((c) => c.url.includes("/api/lab/trade/prepare-leg"))).toBe(false);
    expect(h.fns.signMessageAsync).not.toHaveBeenCalled();
    expect(h.fns.sendTransactionAsync).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId("trade-note")).toHaveTextContent(/expired and was refreshed/i),
    );
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

describe("TradeCard — composed-trade recovery", () => {
  const FIXTURE_HASH = `0x${"ab".repeat(32)}`;

  function prepLegOk() {
    return {
      leg: {
        kind: "zeroEx",
        inputToken: NATIVE_ETH,
        outputToken: NVDA,
        exactInputAmount: "0",
        expectedOutputWei: "0",
        minimumOutputWei: "0",
      },
      simulation: "ok",
      approvals: {
        erc20ApprovalNeeded: false,
        erc20ApprovalTarget: null,
        permit2ApprovalNeeded: false,
        permit2SpenderTarget: null,
      },
      transaction: {
        chainId: 4663,
        from: TAKER,
        to: ROUTER,
        data: "0x",
        value: "0",
        gas: "500000",
      },
      staleAfter: Date.now() + 60_000,
    };
  }

  function pendingFixture(overrides: Partial<PendingComposedTrade> = {}): PendingComposedTrade {
    return {
      v: 1,
      side: "buy",
      marketToken: TOKEN,
      marketSymbol: "PRINT",
      anchorSymbol: "NVDA",
      anchorAddress: NVDA,
      paymentSymbol: "ETH",
      paymentAddress: NATIVE_ETH,
      completedLegTxHash: FIXTURE_HASH,
      actualReceivedAnchorWei: WEI(3),
      pendingLegNumber: 2,
      quoteExpiry: Date.now() + 60_000,
      createdAt: Date.now(),
      ...overrides,
    };
  }

  it("(a) first leg confirms, second leg reverts → pending is persisted and the banner renders", async () => {
    const user = userEvent.setup();
    h.fns.signMessageAsync.mockResolvedValue("0xsig");
    h.fns.sendTransactionAsync.mockResolvedValue(`0x${"11".repeat(32)}`);
    h.fns.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    let balanceOfCall = 0;
    h.fns.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "decimals") return 18;
      if (functionName === "balanceOf") {
        balanceOfCall += 1;
        return balanceOfCall === 1 ? 0n : 2n * 10n ** 18n; // anchor: before, after leg 1
      }
      return 0n;
    });
    stubFetch((url, init) => {
      if (url.includes("/api/lab/quote"))
        return jsonResponse(200, { ok: true, data: COMPOSED_BUY });
      if (url.includes("/api/lab/trade/prepare-leg")) {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const kind = (body?.payload ?? {}).kind;
        if (kind === "bpsDirect")
          return jsonResponse(409, { ok: false, error: "sim reverted", code: "SIMULATION_FAILED" });
        return jsonResponse(200, { ok: true, data: prepLegOk() });
      }
      return jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" });
    });

    wrap(
      <TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="NVDA" anchorAddress={NVDA} />,
    );

    await user.type(screen.getByTestId("trade-amount"), "1");
    await user.click(screen.getByTestId("quote-button"));
    await waitFor(() => expect(screen.getByTestId("quote-result")).toBeInTheDocument());
    await user.click(screen.getByTestId("trade-button"));

    await waitFor(() => expect(screen.getByTestId("recovery-banner")).toBeInTheDocument());
    expect(screen.getByTestId("recovery-heading")).toHaveTextContent("Trade partially completed");
    // The partial trade is persisted with the ACTUAL received anchor amount.
    const persisted = loadPendingTrade(TAKER, TOKEN);
    expect(persisted).not.toBeNull();
    expect(persisted!.actualReceivedAnchorWei).toBe(WEI(2));
    expect(persisted!.completedLegTxHash).toBe(`0x${"11".repeat(32)}`);
  });

  it("(b) a partial trade from a prior session (page refresh) shows the resume banner + action", async () => {
    savePendingTrade(TAKER, pendingFixture());
    stubFetch(() => jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" }));

    wrap(
      <TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="NVDA" anchorAddress={NVDA} />,
    );

    await waitFor(() => expect(screen.getByTestId("recovery-banner")).toBeInTheDocument());
    expect(screen.getByTestId("recovery-resume")).toHaveTextContent(/Continue buying PRINT/i);
    expect(screen.getByTestId("recovery-leg1-link")).toHaveAttribute(
      "href",
      expect.stringContaining(FIXTURE_HASH),
    );
    expect(screen.getByTestId("recovery-cancel")).toHaveTextContent(/keep NVDA/i);
  });

  it("(c) an expired quote between legs still resumes by re-preparing the second leg fresh", async () => {
    const user = userEvent.setup();
    h.fns.signMessageAsync.mockResolvedValue("0xsig");
    h.fns.sendTransactionAsync.mockResolvedValue(`0x${"22".repeat(32)}`);
    h.fns.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    savePendingTrade(TAKER, pendingFixture({ quoteExpiry: Date.now() - 5_000 }));
    const calls = stubFetch((url) => {
      if (url.includes("/api/lab/trade/prepare-leg"))
        return jsonResponse(200, { ok: true, data: prepLegOk() });
      return jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" });
    });

    wrap(
      <TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="NVDA" anchorAddress={NVDA} />,
    );

    await waitFor(() => expect(screen.getByTestId("recovery-banner")).toBeInTheDocument());
    await user.click(screen.getByTestId("recovery-resume"));

    // Resume ALWAYS re-prepares server-side — no reuse of stale calldata.
    await waitFor(() =>
      expect(calls.some((c) => c.url.includes("/api/lab/trade/prepare-leg"))).toBe(true),
    );
    await waitFor(() => expect(screen.getByTestId("trade-success")).toBeInTheDocument());
  });

  it("(d) resume prepares the second leg with the persisted ACTUAL amount, not the estimate", async () => {
    const user = userEvent.setup();
    h.fns.signMessageAsync.mockResolvedValue("0xsig");
    h.fns.sendTransactionAsync.mockResolvedValue(`0x${"33".repeat(32)}`);
    h.fns.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    const ACTUAL = WEI(3); // differs from the quote's leg-2 estimate (WEI(2))
    savePendingTrade(TAKER, pendingFixture({ actualReceivedAnchorWei: ACTUAL }));
    const calls = stubFetch((url) => {
      if (url.includes("/api/lab/trade/prepare-leg"))
        return jsonResponse(200, { ok: true, data: prepLegOk() });
      return jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" });
    });

    wrap(
      <TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="NVDA" anchorAddress={NVDA} />,
    );

    await waitFor(() => expect(screen.getByTestId("recovery-banner")).toBeInTheDocument());
    await user.click(screen.getByTestId("recovery-resume"));

    await waitFor(() => expect(bodyFor(calls, "/api/lab/trade/prepare-leg")).not.toBeNull());
    const body = bodyFor(calls, "/api/lab/trade/prepare-leg");
    const payload = body!.payload as Record<string, unknown>;
    expect(payload.exactInputAmount).toBe(ACTUAL);
    expect(payload.kind).toBe("bpsDirect");
    expect(payload.inputToken).toBe(NVDA);
    expect(payload.outputToken).toBe(TOKEN);
  });

  it("(e) cancel clears the pending trade, hides the banner, and never touches the second leg", async () => {
    const user = userEvent.setup();
    savePendingTrade(TAKER, pendingFixture());
    const calls = stubFetch(() => jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" }));

    wrap(
      <TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="NVDA" anchorAddress={NVDA} />,
    );

    await waitFor(() => expect(screen.getByTestId("recovery-banner")).toBeInTheDocument());
    await user.click(screen.getByTestId("recovery-cancel"));

    await waitFor(() => expect(screen.queryByTestId("recovery-banner")).toBeNull());
    expect(loadPendingTrade(TAKER, TOKEN)).toBeNull();
    expect(calls.some((c) => c.url.includes("/api/lab/trade/prepare-leg"))).toBe(false);
  });

  it("(f) a resumed trade completes: success, pending cleared, onTraded fired", async () => {
    const user = userEvent.setup();
    h.fns.signMessageAsync.mockResolvedValue("0xsig");
    h.fns.sendTransactionAsync.mockResolvedValue(`0x${"44".repeat(32)}`);
    h.fns.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    savePendingTrade(TAKER, pendingFixture());
    const onTraded = vi.fn();
    stubFetch((url) => {
      if (url.includes("/api/lab/trade/prepare-leg"))
        return jsonResponse(200, { ok: true, data: prepLegOk() });
      return jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" });
    });

    wrap(
      <TradeCard
        address={TOKEN}
        tokenSymbol="PRINT"
        anchorSymbol="NVDA"
        anchorAddress={NVDA}
        onTraded={onTraded}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("recovery-banner")).toBeInTheDocument());
    await user.click(screen.getByTestId("recovery-resume"));

    await waitFor(() => expect(screen.getByTestId("trade-success")).toBeInTheDocument());
    expect(loadPendingTrade(TAKER, TOKEN)).toBeNull();
    expect(onTraded).toHaveBeenCalled();
    expect(screen.queryByTestId("recovery-banner")).toBeNull();
  });
});

describe("TradeCard — final-gate additions (Rialto lane)", () => {
  function prepLegFor(kind: string) {
    return {
      leg: {
        kind,
        inputToken: NATIVE_ETH,
        outputToken: NVDA,
        exactInputAmount: "0",
        expectedOutputWei: "0",
        minimumOutputWei: "0",
      },
      simulation: "ok",
      approvals: {
        erc20ApprovalNeeded: false,
        erc20ApprovalTarget: null,
        permit2ApprovalNeeded: false,
        permit2SpenderTarget: null,
      },
      transaction: {
        chainId: 4663,
        from: TAKER,
        to: ROUTER,
        data: "0x",
        value: "0",
        gas: "500000",
      },
      staleAfter: Date.now() + 60_000,
    };
  }

  it("in-session composed leg 2 is prepared from the ACTUAL measured amount, not the estimate", async () => {
    const user = userEvent.setup();
    h.fns.signMessageAsync.mockResolvedValue("0xsig");
    h.fns.sendTransactionAsync.mockResolvedValue(`0x${"55".repeat(32)}`);
    h.fns.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    // Anchor (NVDA) balance: 0 before leg 1, then 3 NVDA received — the quote's
    // leg-2 ESTIMATE is 2 NVDA, so the actual delta (3) must win.
    let nvdaReads = 0;
    h.fns.readContract.mockImplementation(
      async ({ functionName, address }: { functionName: string; address: string }) => {
        if (functionName === "decimals") return 18;
        if (functionName === "balanceOf") {
          if (address.toLowerCase() === NVDA.toLowerCase()) {
            nvdaReads += 1;
            return nvdaReads === 1 ? 0n : 3n * 10n ** 18n;
          }
          return 1000n * 10n ** 18n;
        }
        return 0n;
      },
    );
    const calls = stubFetch((url) => {
      if (url.includes("/api/lab/quote"))
        return jsonResponse(200, { ok: true, data: COMPOSED_BUY });
      if (url.includes("/api/lab/trade/prepare-leg"))
        return jsonResponse(200, { ok: true, data: prepLegFor("zeroEx") });
      return jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" });
    });

    wrap(
      <TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="NVDA" anchorAddress={NVDA} />,
    );

    await user.type(screen.getByTestId("trade-amount"), "1");
    await user.click(screen.getByTestId("quote-button"));
    await waitFor(() => expect(screen.getByTestId("trade-button")).toBeInTheDocument());
    await user.click(screen.getByTestId("trade-button"));

    await waitFor(() => expect(screen.getByTestId("trade-success")).toBeInTheDocument());
    const legBodies = calls
      .filter((c) => c.url.includes("/api/lab/trade/prepare-leg"))
      .map((c) => c.body!.payload as Record<string, unknown>);
    expect(legBodies).toHaveLength(2);
    expect(legBodies[1]!.kind).toBe("bpsDirect");
    // The estimate was WEI(2); the measured delta WEI(3) is what leg 2 spends.
    expect(legBodies[1]!.exactInputAmount).toBe(WEI(3));
  });

  it("SELL: first leg confirms, second leg fails → sale-recovery banner + ACTUAL amount persisted", async () => {
    const user = userEvent.setup();
    h.fns.signMessageAsync.mockResolvedValue("0xsig");
    h.fns.sendTransactionAsync.mockResolvedValue(`0x${"66".repeat(32)}`);
    h.fns.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    let nvdaReads = 0;
    h.fns.readContract.mockImplementation(
      async ({ functionName, address }: { functionName: string; address: string }) => {
        if (functionName === "decimals") return 18;
        if (functionName === "balanceOf") {
          if (address.toLowerCase() === NVDA.toLowerCase()) {
            nvdaReads += 1;
            return nvdaReads === 1 ? 0n : 2n * 10n ** 18n;
          }
          return 1000n * 10n ** 18n;
        }
        return 0n;
      },
    );
    stubFetch((url, init) => {
      if (url.includes("/api/lab/quote"))
        return jsonResponse(200, { ok: true, data: COMPOSED_SELL });
      if (url.includes("/api/lab/trade/prepare-leg")) {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const kind = (body?.payload ?? {}).kind;
        if (kind === "bpsDirect") return jsonResponse(200, { ok: true, data: prepLegFor("bpsDirect") });
        // The aggregator second leg has no route right now.
        return jsonResponse(409, { ok: false, error: "no route", code: "ROUTE_UNAVAILABLE" });
      }
      return jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" });
    });

    wrap(
      <TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="NVDA" anchorAddress={NVDA} />,
    );

    await user.click(screen.getByTestId("tab-sell"));
    await user.type(screen.getByTestId("trade-amount"), "100");
    await user.click(screen.getByTestId("quote-button"));
    await waitFor(() => expect(screen.getByTestId("trade-button")).toBeInTheDocument());
    await user.click(screen.getByTestId("trade-button"));

    await waitFor(() => expect(screen.getByTestId("recovery-banner")).toBeInTheDocument());
    expect(screen.getByTestId("recovery-heading")).toHaveTextContent("Sale partially completed");
    const persisted = loadPendingTrade(TAKER, TOKEN);
    expect(persisted).not.toBeNull();
    expect(persisted!.side).toBe("sell");
    expect(persisted!.actualReceivedAnchorWei).toBe(WEI(2));
    // Cancel keeps the anchor — the user is never forced onward.
    expect(screen.getByTestId("recovery-cancel")).toHaveTextContent(/keep NVDA/i);
  });

  it("SELL resume posts an aggregator leg (server runs the Rialto-first chain) with the ACTUAL amount", async () => {
    const user = userEvent.setup();
    h.fns.signMessageAsync.mockResolvedValue("0xsig");
    h.fns.sendTransactionAsync.mockResolvedValue(`0x${"77".repeat(32)}`);
    h.fns.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    const FIXTURE_HASH = `0x${"cd".repeat(32)}`;
    savePendingTrade(TAKER, {
      v: 1,
      side: "sell",
      marketToken: TOKEN,
      marketSymbol: "PRINT",
      anchorSymbol: "NVDA",
      anchorAddress: NVDA,
      paymentSymbol: "ETH",
      paymentAddress: NATIVE_ETH,
      completedLegTxHash: FIXTURE_HASH,
      actualReceivedAnchorWei: WEI(2),
      pendingLegNumber: 2,
      quoteExpiry: Date.now() + 60_000,
      createdAt: Date.now(),
    });
    const calls = stubFetch((url) => {
      if (url.includes("/api/lab/trade/prepare-leg"))
        return jsonResponse(200, { ok: true, data: prepLegFor("rialto") });
      return jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" });
    });

    wrap(
      <TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="NVDA" anchorAddress={NVDA} />,
    );

    await waitFor(() => expect(screen.getByTestId("recovery-banner")).toBeInTheDocument());
    expect(screen.getByTestId("recovery-resume")).toHaveTextContent(/Continue converting NVDA/i);
    await user.click(screen.getByTestId("recovery-resume"));

    await waitFor(() => expect(screen.getByTestId("trade-success")).toBeInTheDocument());
    const body = bodyFor(calls, "/api/lab/trade/prepare-leg");
    const payload = body!.payload as Record<string, unknown>;
    // Aggregator kind — the SERVER applies Rialto → 1inch → 0x; never a pinned 0x leg.
    expect(payload.kind).toBe("rialto");
    expect(payload.inputToken).toBe(NVDA);
    expect(payload.outputToken).toBe(NATIVE_ETH);
    expect(payload.exactInputAmount).toBe(WEI(2));
    expect(loadPendingTrade(TAKER, TOKEN)).toBeNull();
  });

  it("after a successful trade the quote is retired — the button returns to Get quote", async () => {
    const user = userEvent.setup();
    h.fns.signMessageAsync.mockResolvedValue("0xsig");
    h.fns.sendTransactionAsync.mockResolvedValue(`0x${"88".repeat(32)}`);
    h.fns.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    stubFetch((url) => {
      if (url.includes("/api/lab/quote"))
        return jsonResponse(200, { ok: true, data: ONE_STEP_BUY });
      if (url.includes("/api/lab/trade/prepare-leg"))
        return jsonResponse(200, { ok: true, data: prepLegFor("zeroEx") });
      return jsonResponse(404, { ok: false, error: "x", code: "NOT_FOUND" });
    });

    wrap(<TradeCard address={TOKEN} tokenSymbol="PRINT" anchorSymbol="GOOGL" />);

    await user.type(screen.getByTestId("trade-amount"), "1");
    await user.click(screen.getByTestId("quote-button"));
    await waitFor(() => expect(screen.getByTestId("trade-button")).toBeInTheDocument());
    await user.click(screen.getByTestId("trade-button"));

    await waitFor(() => expect(screen.getByTestId("trade-success")).toBeInTheDocument());
    // The executed quote cannot be re-submitted: the trade button is gone and
    // the primary slot offers a fresh quote instead.
    expect(screen.queryByTestId("trade-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("quote-button")).toHaveTextContent(/Get quote/i);
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
