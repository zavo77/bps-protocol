import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createConfig, http } from "wagmi";
import { FEE_PRESETS } from "@bps/launch-lab";
import { robinhoodChain } from "../../../lib/chain";
import { Providers } from "../../providers";
import LabProofPage from "./page";

function makeConfig() {
  return createConfig({
    chains: [robinhoodChain],
    connectors: [],
    transports: { [robinhoodChain.id]: http("http://localhost:0") },
    multiInjectedProviderDiscovery: false,
    ssr: false,
  });
}

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
  defaultFeePreset: "BALANCED_1",
  feePresets: [...FEE_PRESETS],
  startingFdvUsd: 20_500,
  anchorSymbol: "GOOGL",
  bpsFeeAddress: null,
  explorerBaseUrl: "https://robinhoodchain.blockscout.com",
  genesis: { launched: false, tokenAddress: null },
};

function stubLabFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/lab/proof")) {
        return {
          status: 200,
          json: async () => ({ ok: true, data: PENDING_PROOF }),
        } as unknown as Response;
      }
      if (url.includes("/api/lab/config")) {
        return {
          status: 200,
          json: async () => ({ ok: true, data: LAB_CONFIG }),
        } as unknown as Response;
      }
      return {
        status: 404,
        json: async () => ({ ok: false, error: "not found", code: "NOT_FOUND" }),
      } as unknown as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Launch Lab proof page (pre-launch)", () => {
  it("renders the pending checklist with deployment facts and no fabricated hashes", async () => {
    stubLabFetch();
    render(
      <Providers config={makeConfig()}>
        <LabProofPage />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText("Pre-launch checklist")).toBeInTheDocument());

    const checklist = screen.getByTestId("proof-checklist");
    expect(checklist).toHaveTextContent("lab.example.test");
    expect(checklist).toHaveTextContent("abc1234def");
    // Live anchor verification shows verified; everything else is pending.
    expect(checklist).toHaveTextContent("Verified");
    // Manifest, simulation, receipt, buy, sell, anchor reserve => 6 pending badges.
    expect(screen.getAllByText("Pending").length).toBe(6);
    // No fabricated transaction hashes appear anywhere.
    expect(document.body.textContent).not.toMatch(/0x[0-9a-fA-F]{64}/);
    // The pending note from the server is rendered.
    expect(
      screen.getByText(/Genesis launch pending — checklist state; no launch has occurred yet\./),
    ).toBeInTheDocument();
  });
});
