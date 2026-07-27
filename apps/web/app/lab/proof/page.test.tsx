import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FEE_PRESETS } from "@bps/launch-lab";
import LabProofIndexPage from "./page";
import { ProofTrailView } from "./[tokenAddress]/page";

const TOKEN = "0x1111111111111111111111111111111111111111";

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

const UNAVAILABLE = { available: false, reason: "awaiting-indexed-data" } as const;

// A market snapshot BEFORE its launch is confirmed/indexed: launch tx, pool,
// metadata etc. are all unavailable → the proof trail shows the pending state.
const PENDING_SNAPSHOT = {
  tokenAddress: TOKEN,
  tokenName: "PRINT",
  tokenSymbol: "PRINT",
  tokenUri: UNAVAILABLE,
  creator: UNAVAILABLE,
  totalSupply: UNAVAILABLE,
  anchor: ANCHOR,
  poolId: UNAVAILABLE,
  poolStatus: UNAVAILABLE,
  anchorReserve: UNAVAILABLE,
  remainingTokenInventory: UNAVAILABLE,
  currentPriceUsd: UNAVAILABLE,
  startingPriceUsd: UNAVAILABLE,
  currentFdvUsd: UNAVAILABLE,
  feePreset: UNAVAILABLE,
  exactPoolFeeUnits: UNAVAILABLE,
  beneficiaries: UNAVAILABLE,
  launchTransactionHash: UNAVAILABLE,
  fetchedAt: 1_753_600_000_000,
};

const PENDING_PROOF = {
  deploymentUrl: "lab.example.test",
  sourceCommit: "abc1234def",
  manifest: null,
  manifestHash: null,
  anchor: ANCHOR,
  simulation: null,
  receipt: null,
  buyTransactionHash: null,
  sellTransactionHash: null,
  anchorReserveWei: null,
  notes: ["Genesis launch pending — checklist state; no launch has occurred yet."],
};

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
  anchors: [],
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

const MARKET_LIST_ITEM = {
  tokenAddress: TOKEN,
  tokenName: "PRINT",
  tokenSymbol: "PRINT",
  creator: "0x1000000000000000000000000000000000000001",
  numeraire: ANCHOR.address,
  anchorSymbol: "GOOGL",
  poolOrHook: "0x3333333333333333333333333333333333333333",
  launchTransactionHash: `0x${"ab".repeat(32)}`,
  blockNumber: "1234567",
  timestamp: 1_753_600_000,
  indexedSwaps: null,
  grossMovementWei: null,
};

function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as unknown as Response;
}

/** Route-aware fetch stub. `launches` controls the directory list contents. */
function stubFetch(opts: { launches?: unknown[] }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/lab/config")) return jsonResponse(200, { ok: true, data: LAB_CONFIG });
      if (url.includes("/api/lab/launches"))
        return jsonResponse(200, {
          ok: true,
          data: { launches: opts.launches ?? [], indexedDataAvailable: false, sort: "newest" },
        });
      if (url.includes("/api/lab/token/"))
        return jsonResponse(200, { ok: true, data: PENDING_SNAPSHOT });
      if (url.includes("/api/lab/history/"))
        return jsonResponse(200, { ok: true, data: { available: false, swaps: [] } });
      if (url.includes("/api/lab/proof"))
        return jsonResponse(200, { ok: true, data: PENDING_PROOF });
      return jsonResponse(404, { ok: false, error: "not found", code: "NOT_FOUND" });
    }),
  );
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Proof directory (index)", () => {
  it("shows the honest empty state when no markets have launched", async () => {
    stubFetch({ launches: [] });
    wrap(<LabProofIndexPage />);

    await waitFor(() => expect(screen.getByTestId("proof-empty")).toBeInTheDocument());
    expect(screen.getByTestId("proof-empty")).toHaveTextContent(
      /No BPS markets have launched yet\./i,
    );
  });

  it("links each launched market to its per-market proof trail", async () => {
    stubFetch({ launches: [MARKET_LIST_ITEM] });
    wrap(<LabProofIndexPage />);

    await waitFor(() =>
      expect(screen.getByTestId(`proof-market-${TOKEN.toLowerCase()}`)).toBeInTheDocument(),
    );
    expect(screen.getByTestId(`proof-market-${TOKEN.toLowerCase()}`)).toHaveAttribute(
      "href",
      `/lab/proof/${TOKEN}`,
    );
  });
});

describe("Per-market proof trail (pending)", () => {
  it("renders the pending checklist with no fabricated hashes", async () => {
    stubFetch({});
    wrap(<ProofTrailView address={TOKEN} />);

    // Progress reflects only the genuinely-verified items (anchor + token address).
    await waitFor(() =>
      expect(screen.getByTestId("proof-progress")).toHaveTextContent(/launch in preparation/i),
    );
    expect(screen.getByTestId("proof-progress")).toHaveTextContent(/2 of 9 items verified/i);

    // The pending items render pending pills; verified items render verified pills.
    expect(screen.getAllByTestId("proof-pending-pill").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("proof-checklist")).toBeInTheDocument();

    // Deployment provenance is real, and no fabricated 64-hex hashes appear.
    expect(screen.getByTestId("proof-provenance")).toHaveTextContent("abc1234def");
    expect(document.body.textContent).not.toMatch(/0x[0-9a-fA-F]{64}/);

    // Market identity + Blockscout link.
    expect(screen.getByTestId("proof-token-link")).toHaveAttribute(
      "href",
      `https://robinhoodchain.blockscout.com/address/${TOKEN}`,
    );
  });
});
