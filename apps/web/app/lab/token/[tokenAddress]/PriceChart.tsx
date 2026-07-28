"use client";
// Authoritative anchor-denominated price history for a lab market. Pure inline
// SVG (no chart libs). Each point is a REAL indexed swap: the price is the
// orientation-correct ANCHOR-per-token conversion of the swap's sqrtPriceX96
// (anchor may be currency0 OR currency1) via the shared lib/market-math
// orientedPricesX18 — the same math the server uses in lib/lab/market-data.ts.
// History is NEVER retroactively converted to USD: multiplying old swaps by
// today's anchor midpoint fabricates a USD history that never traded. The
// current token/USD price is a separate current statistic shown by the market
// view. Without the anchor orientation props the component falls back to the
// legacy raw sqrt-price ratio (backwards compatible with existing callers).
// When there are zero swaps it shows the honest "Collecting market data".
import { useMemo, useRef, useState } from "react";
import { useHistory, type SwapRecord } from "../../../../hooks/lab";
import { orientedPricesX18 } from "../../../../lib/market-math";

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

/**
 * Orientation-correct ANCHOR-per-token price for one swap (display number,
 * anchorPerLaunchedX18 / 1e18); null when it cannot be computed.
 */
function anchorSwapPrice(
  s: SwapRecord,
  anchorIsCurrency0: boolean,
  anchorDecimals: number,
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
    const n = Number(anchorPerLaunchedX18) / 1e18;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function fmtPrice(price: number): string {
  const digits = price !== 0 && Math.abs(price) < 1 ? 4 : 6;
  return price.toPrecision(digits);
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
}

export interface PriceChartProps {
  address: string;
  tokenSymbol?: string;
  /** Anchor ticker for labels — never hard-coded to a specific market. */
  anchorSymbol?: string;
  /**
   * From stats.anchorIsCurrency0 — REQUIRED (with anchorDecimals) for the
   * anchor-denominated series; when missing the legacy raw fallback is used.
   * `| undefined` is explicit so callers may pass stats?.anchorIsCurrency0
   * directly under exactOptionalPropertyTypes.
   */
  anchorIsCurrency0?: boolean | undefined;
  /** From snapshot.anchor.decimals. */
  anchorDecimals?: number | undefined;
}

export function PriceChart({
  address,
  tokenSymbol,
  anchorSymbol,
  anchorIsCurrency0,
  anchorDecimals,
}: PriceChartProps) {
  const { available, swaps, isLoading } = useHistory(address);
  const [range, setRange] = useState<Range>("All");
  const anchorMode = anchorIsCurrency0 !== undefined && anchorDecimals !== undefined;

  const allPoints = useMemo<Point[]>(() => {
    const mapped: Point[] = [];
    for (const s of swaps) {
      const price =
        anchorIsCurrency0 !== undefined && anchorDecimals !== undefined
          ? anchorSwapPrice(s, anchorIsCurrency0, anchorDecimals)
          : rawSwapPrice(s);
      if (price === null) continue;
      mapped.push({ t: toMs(s.occurredAt), price });
    }
    mapped.sort((a, b) => a.t - b.t);
    return mapped;
  }, [swaps, anchorIsCurrency0, anchorDecimals]);

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
          anchorMode={anchorMode}
        />
      )}
    </div>
  );
}

function Chart({
  points,
  tokenSymbol,
  anchorSymbol,
  anchorMode,
}: {
  points: Point[];
  tokenSymbol: string | undefined;
  anchorSymbol: string | undefined;
  anchorMode: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const width = 640;
  const height = 280;
  const padLeft = 54;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 26;

  // "{anchorSymbol} per {tokenSymbol}" — the unit of every axis/tooltip value.
  const unit = `${anchorSymbol ?? "anchor"} per ${tokenSymbol ?? "token"}`;

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
  const swapCount = points.length;

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
        aria-label={
          anchorMode
            ? `Price history for ${tokenSymbol ?? "token"} in ${unit} (derived from ${swapCount} swaps)`
            : `Price history for ${tokenSymbol ?? "token"} (derived from ${swapCount} swaps)`
        }
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
        {/* y-axis unit — the series is anchor-denominated, never USD history */}
        {anchorMode ? (
          <text
            x={padLeft}
            y={10}
            textAnchor="start"
            fontSize="10"
            fill="var(--warm-grey)"
            data-testid="axis-unit"
          >
            {unit}
          </text>
        ) : null}
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
                {fmtPrice(p)}
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
            fill="var(--signal-orange)"
            data-testid="price-point"
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
              {anchorMode ? `${fmtPrice(hoverPoint.price)} ${unit}` : fmtPrice(hoverPoint.price)}
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
            </text>
          </g>
        )}
      </svg>
      <p className="lab-muted" data-testid="price-chart-footer" style={{ fontSize: 13, marginTop: 8 }}>
        {anchorMode ? (
          <>
            Latest price: {fmtPrice(latest)} {unit} · {swapCount} real swap
            {swapCount === 1 ? "" : "s"}. Anchor-denominated series derived from on-chain swaps —
            each point is that swap&apos;s {unit} price, never a retroactive USD conversion. USD
            values shown elsewhere use the live {anchorSymbol ?? "anchor"} midpoint. Not a price
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
