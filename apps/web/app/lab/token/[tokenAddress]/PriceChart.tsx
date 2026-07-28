"use client";
// Honest USD price history for a lab market. Pure inline SVG (no chart libs).
// Each point is a REAL indexed swap: the USD price is the orientation-correct
// conversion of the swap's sqrtPriceX96 (anchor may be currency0 OR currency1)
// multiplied by the verified anchor USD midpoint — the same math the server
// uses in lib/lab/market-data.ts, shared via lib/market-math.ts. When the
// launch price + time are known, a REAL launch-price baseline point is
// prepended so the chart renders a useful line after the FIRST trade.
// Without the anchor context props the component falls back to the legacy raw
// sqrt-price ratio (backwards compatible with existing callers/tests). When
// there are zero swaps AND no baseline it shows "Collecting market data".
import { useMemo, useRef, useState } from "react";
import { useHistory, type SwapRecord } from "../../../../hooks/lab";
import { orientedPricesX18, usdPerLaunchedX8 } from "../../../../lib/market-math";

type Range = "1m" | "5m" | "1h" | "6h" | "24h" | "All";

const RANGES: Range[] = ["1m", "5m", "1h", "6h", "24h", "All"];

const RANGE_MS: Record<Exclude<Range, "All">, number> = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
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

/** Legacy raw price for one swap (no anchor context); null when unusable. */
function rawSwapPrice(s: SwapRecord): number | null {
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

/** Orientation-correct USD price for one swap; null when it cannot be computed. */
function usdSwapPrice(
  s: SwapRecord,
  anchorIsCurrency0: boolean,
  anchorDecimals: number,
  anchorMidUsd: string,
): number | null {
  try {
    const sqrt = BigInt(s.sqrtPriceX96);
    if (sqrt <= 0n) return null;
    const { anchorPerLaunchedX18 } = orientedPricesX18({
      sqrtPriceX96: sqrt,
      anchorIsCurrency0,
      anchorDecimals,
      tokenDecimals: 18,
    });
    if (anchorPerLaunchedX18 <= 0n) return null;
    const usdX8 = usdPerLaunchedX8(anchorPerLaunchedX18, anchorMidUsd);
    const n = Number(usdX8) / 1e8;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function fmtPrice(price: number, usdMode: boolean): string {
  const digits = price !== 0 && Math.abs(price) < 1 ? 4 : 6;
  const s = price.toPrecision(digits);
  return usdMode ? `$${s}` : s;
}

function fmtTick(t: number, spanMs: number): string {
  const d = new Date(t);
  if (spanMs <= 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Point {
  t: number;
  price: number;
  baseline?: boolean;
}

export interface PriceChartProps {
  address: string;
  tokenSymbol?: string;
  /** Anchor ticker for labels — never hard-coded to a specific market. */
  anchorSymbol?: string;
  /** From stats.anchorIsCurrency0 — enables orientation-correct USD pricing. */
  anchorIsCurrency0?: boolean;
  /** From snapshot.anchor.decimals. */
  anchorDecimals?: number;
  /** From snapshot.anchor.midPriceUsd — enables USD mode when present. */
  anchorMidUsd?: string | null;
  /** Launch price baseline: USD price at launch (decimal string). */
  startingPriceUsd?: string | null;
  /** Launch price baseline: ISO launch time. */
  launchedAt?: string | null;
}

export function PriceChart({
  address,
  tokenSymbol,
  anchorSymbol,
  anchorIsCurrency0 = true,
  anchorDecimals = 18,
  anchorMidUsd = null,
  startingPriceUsd = null,
  launchedAt = null,
}: PriceChartProps) {
  const { available, swaps, isLoading } = useHistory(address);
  const [range, setRange] = useState<Range>("All");
  const usdMode = Boolean(anchorMidUsd);

  const allPoints = useMemo<Point[]>(() => {
    const mapped: Point[] = [];
    for (const s of swaps) {
      const price = anchorMidUsd
        ? usdSwapPrice(s, anchorIsCurrency0, anchorDecimals, anchorMidUsd)
        : rawSwapPrice(s);
      if (price === null) continue;
      mapped.push({ t: toMs(s.occurredAt), price });
    }
    mapped.sort((a, b) => a.t - b.t);
    // REAL launch-price baseline: first point at the launch time with the
    // starting price, so baseline → first trade forms a line. USD mode only —
    // mixing a USD baseline into raw-ratio prices would be dishonest.
    if (usdMode && startingPriceUsd && launchedAt) {
      const bt = Date.parse(launchedAt);
      const bp = Number(startingPriceUsd);
      if (Number.isFinite(bt) && Number.isFinite(bp) && bp > 0) {
        if (mapped.length === 0 || bt <= mapped[0]!.t) {
          mapped.unshift({ t: bt, price: bp, baseline: true });
        }
      }
    }
    return mapped;
  }, [swaps, anchorMidUsd, anchorIsCurrency0, anchorDecimals, usdMode, startingPriceUsd, launchedAt]);

  const points = useMemo<Point[]>(() => {
    if (range === "All" || allPoints.length === 0) return allPoints;
    const cutoff = allPoints[allPoints.length - 1]!.t - RANGE_MS[range];
    const filtered = allPoints.filter((p) => p.t >= cutoff);
    // Never collapse a real series below a line just because of the window.
    return filtered.length >= 2 ? filtered : allPoints;
  }, [allPoints, range]);

  const empty = points.length === 0;

  return (
    <div data-testid="price-chart">
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {RANGES.map((r) => (
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
          {isLoading && !available ? "Loading market data…" : "Collecting market data"}
        </p>
      ) : (
        <Chart
          points={points}
          tokenSymbol={tokenSymbol}
          anchorSymbol={anchorSymbol}
          usdMode={usdMode}
        />
      )}
    </div>
  );
}

function Chart({
  points,
  tokenSymbol,
  anchorSymbol,
  usdMode,
}: {
  points: Point[];
  tokenSymbol: string | undefined;
  anchorSymbol: string | undefined;
  usdMode: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const width = 640;
  const height = 280;
  const padLeft = 54;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 26;

  const prices = points.map((p) => p.price);
  const times = points.map((p) => p.t);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const priceSpan = maxPrice - minPrice || minPrice || 1;
  const timeSpan = maxT - minT || 1;

  const x = (t: number) => padLeft + ((t - minT) / timeSpan) * (width - padLeft - padRight);
  const y = (price: number) =>
    height - padBottom - ((price - minPrice) / priceSpan) * (height - padTop - padBottom);

  const coords = points.map((p) => ({ cx: x(p.t), cy: y(p.price) }));
  const polyline = coords.map((c) => `${c.cx.toFixed(2)},${c.cy.toFixed(2)}`).join(" ");
  const area =
    points.length > 1
      ? `${polyline} ${coords[coords.length - 1]!.cx.toFixed(2)},${height - padBottom} ${coords[0]!.cx.toFixed(2)},${height - padBottom}`
      : null;
  const latest = prices[prices.length - 1]!;
  const swapCount = points.filter((p) => !p.baseline).length;

  // A few small muted axis ticks.
  const priceTicks = [minPrice, minPrice + priceSpan / 2, maxPrice];
  const timeTicks = [minT, minT + timeSpan / 2, maxT];

  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < coords.length; i++) {
      const d = Math.abs(coords[i]!.cx - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  };

  const hovered = hover !== null && hover < points.length ? hover : null;
  const hoverPoint = hovered !== null ? points[hovered]! : null;
  const hoverCoord = hovered !== null ? coords[hovered]! : null;
  const tooltipOnLeft = hoverCoord !== null && hoverCoord.cx > width * 0.62;

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Price history for ${tokenSymbol ?? "token"}${usdMode ? " in USD" : ""} (derived from ${swapCount} swaps)`}
        data-testid="price-chart-svg"
        data-point-count={points.length}
        onPointerMove={handlePointer}
        onPointerLeave={() => setHover(null)}
        style={{
          display: "block",
          background: "var(--warm-white)",
          border: "1px solid var(--peach-grey)",
          borderRadius: 14,
          touchAction: "none",
        }}
      >
        {/* y (price) axis ticks */}
        {priceTicks.map((p, i) => {
          const ty = y(p);
          return (
            <g key={`py-${i}`}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={ty}
                y2={ty}
                stroke="var(--peach-grey)"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
              <text
                x={padLeft - 6}
                y={ty + 3}
                textAnchor="end"
                fontSize="10"
                fill="var(--warm-grey)"
              >
                {fmtPrice(p, usdMode)}
              </text>
            </g>
          );
        })}
        {/* x (time) axis ticks */}
        {timeTicks.map((t, i) => (
          <text
            key={`tx-${i}`}
            x={x(t)}
            y={height - 8}
            textAnchor={i === 0 ? "start" : i === timeTicks.length - 1 ? "end" : "middle"}
            fontSize="10"
            fill="var(--warm-grey)"
          >
            {fmtTick(t, timeSpan)}
          </text>
        ))}

        {area && <polygon points={area} fill="var(--soft-peach)" opacity="0.45" />}
        {points.length > 1 && (
          <polyline fill="none" stroke="var(--signal-orange)" strokeWidth="2" points={polyline} />
        )}
        {coords.map((c, i) => (
          <circle
            key={`${c.cx}-${c.cy}-${i}`}
            cx={c.cx}
            cy={c.cy}
            r={points.length > 40 ? 1.5 : 3}
            fill={points[i]!.baseline ? "var(--warm-grey)" : "var(--signal-orange)"}
            data-testid="price-point"
            data-baseline={points[i]!.baseline ? "true" : undefined}
          />
        ))}

        {/* hover / touch tooltip: vertical guide + dot + time/price readout */}
        {hoverPoint && hoverCoord && (
          <g data-testid="chart-tooltip" pointerEvents="none">
            <line
              x1={hoverCoord.cx}
              x2={hoverCoord.cx}
              y1={padTop}
              y2={height - padBottom}
              stroke="var(--warm-grey)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <circle
              cx={hoverCoord.cx}
              cy={hoverCoord.cy}
              r={4.5}
              fill="var(--deep-ink)"
              stroke="var(--warm-white)"
              strokeWidth="1.5"
            />
            <text
              x={tooltipOnLeft ? hoverCoord.cx - 8 : hoverCoord.cx + 8}
              y={padTop + 10}
              textAnchor={tooltipOnLeft ? "end" : "start"}
              fontSize="11"
              fill="var(--deep-ink)"
              fontWeight="600"
            >
              {fmtPrice(hoverPoint.price, usdMode)}
            </text>
            <text
              x={tooltipOnLeft ? hoverCoord.cx - 8 : hoverCoord.cx + 8}
              y={padTop + 24}
              textAnchor={tooltipOnLeft ? "end" : "start"}
              fontSize="10"
              fill="var(--warm-grey)"
            >
              {new Date(hoverPoint.t).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
              {hoverPoint.baseline ? " · launch price" : ""}
            </text>
          </g>
        )}
      </svg>
      <p className="lab-muted" style={{ fontSize: 13, marginTop: 8 }}>
        {usdMode ? (
          <>
            Latest price: {fmtPrice(latest, true)} per {tokenSymbol ?? "token"} · {swapCount} real
            swap{swapCount === 1 ? "" : "s"}
            {points.some((p) => p.baseline) ? " · launch-price baseline" : ""}. Derived from
            on-chain swaps and the verified {anchorSymbol ?? "anchor"} midpoint; not a price
            oracle.
          </>
        ) : (
          <>
            Latest derived price: {latest.toPrecision(6)} {anchorSymbol ?? "anchor"} /{" "}
            {tokenSymbol ?? "token"} · {swapCount} real swap{swapCount === 1 ? "" : "s"}. Derived
            from on-chain swaps; not a price oracle.
          </>
        )}
      </p>
    </div>
  );
}
