import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";

// Tests for GET /api/lab/route-probe — the read-only deployed-runtime
// diagnostic. Asserts the founder matrix shape, exact-spender pass-through,
// native-no-approval reporting, honest not-simulated notes, and that the
// response never carries calldata or key material.

const BENEFICIARY = getAddress("0x1000000000000000000000000000000000000001");
const SPENDER = getAddress("0x3000000000000000000000000000000000000003");
const TXTO = getAddress("0x4000000000000000000000000000000000000004");

const m = vi.hoisted(() => ({
  quoteAggregatorDirect: vi.fn(),
  client: {
    getBalance: vi.fn(async () => 0n), // probe taker unfunded by default
    readContract: vi.fn(async () => 0n),
    call: vi.fn(async () => ({})),
  },
}));

vi.mock("./server", () => ({
  getFlags: () => ({ bpsFeeAddress: BENEFICIARY }),
  getLabClient: () => m.client,
}));
vi.mock("./trade-router", () => ({ quoteAggregatorDirect: m.quoteAggregatorDirect }));

import { GET } from "../../app/api/lab/route-probe/route";

let reqNo = 100;
function makeRequest() {
  reqNo += 1;
  return new Request("https://lab.test/api/lab/route-probe", {
    headers: { "x-forwarded-for": `10.1.0.${reqNo}` },
  });
}

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BPS_LAUNCH_LAB_ROUTE_PROBE_ENABLED = "true";
  m.client.getBalance.mockResolvedValue(0n);
  m.client.readContract.mockResolvedValue(0n);
  m.quoteAggregatorDirect.mockImplementation(async (args: { sellToken: string }) => ({
    venue: "rialto",
    buyAmountWei: "1000000000000000000",
    minBuyAmountWei: "995000000000000000",
    allowanceTarget:
      args.sellToken.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        ? null
        : SPENDER,
    transactionTarget: TXTO,
    transactionData: "0xdeadbeef",
    transactionValue: "0",
    platformFeeBps: 5,
    quoteExpiry: Date.now() + 30_000,
  }));
});

describe("GET /api/lab/route-probe", () => {
  it("probes the full founder matrix (4 forward + 4 reverse pairs) on chain 4663", async () => {
    const res = await GET(makeRequest());
    const body = (await res.json()) as {
      ok: boolean;
      data: { chainId: number; priority: string[]; pairs: { pair: string; venue: string }[] };
    };
    expect(res.status).toBe(200);
    expect(body.data.chainId).toBe(4663);
    expect(body.data.priority).toEqual(["rialto", "oneInch", "zeroEx"]);
    expect(body.data.pairs.map((p) => p.pair)).toEqual([
      "ETH->GOOGL",
      "ETH->NVDA",
      "WETH->NVDA",
      "USDG->GOOGL",
      "GOOGL->ETH",
      "NVDA->ETH",
      "NVDA->WETH",
      "GOOGL->USDG",
    ]);
    expect(body.data.pairs.every((p) => p.venue === "rialto")).toBe(true);
  });

  it("reports the exact venue spender, native-no-approval, fee, and honest simulation notes", async () => {
    const res = await GET(makeRequest());
    const body = (await res.json()) as {
      data: {
        pairs: {
          pair: string;
          allowanceSpender: string | null;
          nativeNoApproval: boolean | null;
          platformFeeBps: number;
          simulation: string;
          simulationNote?: string;
        }[];
      };
    };
    const ethLeg = body.data.pairs.find((p) => p.pair === "ETH->GOOGL")!;
    expect(ethLeg.allowanceSpender).toBeNull(); // native ETH → no ERC-20 approval
    expect(ethLeg.nativeNoApproval).toBe(true);
    expect(ethLeg.platformFeeBps).toBe(5); // fee read from the quote
    const wethLeg = body.data.pairs.find((p) => p.pair === "WETH->NVDA")!;
    expect(wethLeg.allowanceSpender).toBe(SPENDER); // exactly as returned
    // Unfunded probe taker → honest not-simulated, never a fake pass.
    expect(wethLeg.simulation).toBe("not-simulated");
    expect(wethLeg.simulationNote).toMatch(/lacks input balance/);
  });

  it("simulates the exact returned calldata when the probe taker is funded", async () => {
    m.client.getBalance.mockResolvedValue(10n ** 18n); // fund native ETH
    const res = await GET(makeRequest());
    const body = (await res.json()) as { data: { pairs: { pair: string; simulation: string }[] } };
    const ethLeg = body.data.pairs.find((p) => p.pair === "ETH->GOOGL")!;
    expect(ethLeg.simulation).toBe("ok");
    expect(m.client.call).toHaveBeenCalled();
  });

  it("never leaks calldata or key material in the response", async () => {
    const res = await GET(makeRequest());
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("0xdeadbeef"); // calldata omitted
    expect(raw.toLowerCase()).not.toContain("rialto_api_key");
    expect(raw.toLowerCase()).not.toContain("authorization");
    expect(raw.toLowerCase()).not.toContain("bearer");
  });

  it("is tightly rate-limited (venue quota protection)", async () => {
    const fixed = () =>
      new Request("https://lab.test/api/lab/route-probe", {
        headers: { "x-forwarded-for": "10.2.0.99" },
      });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await GET(fixed())).status);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(2);
  });

  it("is DISABLED (404) unless the server-side diagnostics flag is set", async () => {
    delete process.env.BPS_LAUNCH_LAB_ROUTE_PROBE_ENABLED;
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
    expect(m.quoteAggregatorDirect).not.toHaveBeenCalled();
  });

  it("exposes no taker addresses in the response", async () => {
    m.client.getBalance.mockResolvedValue(10n ** 18n); // exercise the simulated path too
    const res = await GET(makeRequest());
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain(BENEFICIARY);
    expect(raw.toLowerCase()).not.toContain("taker");
  });
});
