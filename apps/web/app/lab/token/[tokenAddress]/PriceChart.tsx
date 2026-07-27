"use client";
// Honest price history for a lab market. Renders a plain inline-SVG line of the
// REAL indexed swaps only (no fabricated candles): price is derived from each
// swap's sqrtPriceX96 — price = (sqrtPriceX96 / 2^96)^2 — falling back to the
// |amount0/amount1| ratio when the sqrt price is unusable. When there are no
// swaps (or the indexer view is not ready) it shows "Collecting market data".
// Restyled to the Claude Design V4 lab palette; logic is unchanged.
import { useMemo, useState } from "react";
import { useHistory, type SwapRecord } from "../../../../hooks/lab";

type Range = "1H" | "6H" | "24H" | "All";

const RANGE_MS: Record<Exclude<Range, "All">, number> = {
  "1H": 60 * 60 * 1000,
  "6H": 6 * 60 * 60 * 1000,
  "24H": 24 * 60 * 60 * 1000,
};

const TWO_POW_96 = 2 ** 96;

/** Normalise occurredAt (unix seconds | unix ms | ISO string) to unix ms. */
function toMs(occurredAt: string | number): number {
  if (typeof occurredAt === "number") {
    return occurredAt < 1e12 ? occurredAt * 1000 : occurredAt;
  }
  const asNumber = Number(occurredAt);
  if (Number.isFinite(asNumber) && occurredAt.trim() !== "") {
    return asNumber < 1e12 ? asNumber * 1000 : asNumber;
  }
  const parsed = Date.parse(occurredAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Derived price for one swap; null when it cannot be computed honestly. */
function swapPrice(s: SwapRecord): number | null {
  if (s.sqrtPriceX96 && s.sqrtPriceX96 !== "0") {
    try {
      const sp = Number(BigInt(s.sqrtPriceX96)) / TWO_POW_96;
      const p = sp * sp;
      if (Number.isFinite(p) && p > 0) return p;
    } catch {
      /* fall through to ratio */
    }
  }
  try {
    const a0 = Math.abs(Number(BigInt(s.amount0)));
    const a1 = Math.abs(Number(BigInt(s.amount1)));
    if (a1 !== 0) {
      const p = a0 / a1;
      if (Number.isFinite(p) && p > 0) return p;
    }
  } catch {
    /* unusable */
  }
  return null;
}

interface Point {
  t: number;
  price: number;
}

export function PriceChart({ address, tokenSymbol }: { address: string; tokenSymbol?: string }) {
  const { available, swaps, isLoading } = useHistory(address);
  const [range, setRange] = useState<Range>("All");

  const points = useMemo<Point[]>(() => {
    const mapped: Point[] = [];
    for (const s of swaps) {
      const price = swapPrice(s);
      if (price === null) continue;
      mapped.push({ t: toMs(s.occurredAt), price });
    }
    mapped.sort((a, b) => a.t - b.t);
    if (range === "All" || mapped.length === 0) return mapped;
    const cutoff = mapped[mapped.length - 1]!.t - RANGE_MS[range];
    const filtered = mapped.filter((p) => p.t >= cutoff);
    // Never collapse a real series to a single dot just because of the window.
    return filtered.length >= 1 ? filtered : mapped;
  }, [swaps, range]);

  const empty = !available || points.length === 0;

  return (
    <div data-testid="price-chart">
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {(["1H", "6H", "24H", "All"] as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            data-testid={`range-${r}`}
            aria-pressed={range === r}
            onClick={() => setRange(r)}
            className="lab-pill"
            style={{
              cursor: "pointer",
              ...(range === r
                ? {
                    background: "var(--deep-ink)",
                    color: "var(--warm-white)",
                    borderColor: "var(--deep-ink)",
                  }
                : {}),
            }}
          >
            {r}
          </button>
        ))}
      </div>

      {empty ? (
        <p className="lab-muted" data-testid="price-chart-empty" style={{ fontSize: 14 }}>
          {isLoading ? "Loading market data…" : "Collecting market data"}
        </p>
      ) : (
        <Chart points={points} tokenSymbol={tokenSymbol} />
      )}
    </div>
  );
}

function Chart({ points, tokenSymbol }: { points: Point[]; tokenSymbol: string | undefined }) {
  const width = 640;
  const height = 200;
  const pad = 8;

  const prices = points.map((p) => p.price);
  const times = points.map((p) => p.t);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const priceSpan = maxPrice - minPrice || 1;
  const timeSpan = maxT - minT || 1;

  const x = (t: number) => pad + ((t - minT) / timeSpan) * (width - 2 * pad);
  const y = (price: number) => height - pad - ((price - minPrice) / priceSpan) * (height - 2 * pad);

  const coords = points.map((p) => ({ cx: x(p.t), cy: y(p.price) }));
  const polyline = coords.map((c) => `${c.cx.toFixed(2)},${c.cy.toFixed(2)}`).join(" ");
  const latest = prices[prices.length - 1]!;

  return (
    <div className="lab-scroll-x">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={`Price history for ${tokenSymbol ?? "token"} in GOOGL (derived from ${points.length} swaps)`}
        data-testid="price-chart-svg"
        data-point-count={points.length}
        style={{
          display: "block",
          background: "var(--warm-white)",
          border: "1px solid var(--peach-grey)",
          borderRadius: 14,
        }}
      >
        {points.length > 1 && (
          <polyline fill="none" stroke="var(--signal-orange)" strokeWidth="2" points={polyline} />
        )}
        {coords.map((c, i) => (
          <circle
            key={`${c.cx}-${c.cy}-${i}`}
            cx={c.cx}
            cy={c.cy}
            r={points.length > 40 ? 1.5 : 3}
            fill="var(--signal-orange)"
            data-testid="price-point"
          />
        ))}
      </svg>
      <p className="lab-muted" style={{ fontSize: 13, marginTop: 8 }}>
        Latest derived price: {latest.toPrecision(6)} GOOGL / {tokenSymbol ?? "token"} ·{" "}
        {points.length} real swap{points.length === 1 ? "" : "s"}. Derived from on-chain swaps; not
        a price oracle.
      </p>
    </div>
  );
}
