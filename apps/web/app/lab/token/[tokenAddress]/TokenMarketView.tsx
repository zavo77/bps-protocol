"use client";
// Public market page — Claude Design V4 lab aesthetic. Hierarchy (founder
// spec): token identity header → stat strip (price / 24h change / market cap /
// FDV / pool reserve / curve inventory value / 24h volume / holder addresses /
// age + DEX Screener & Blockscout links) → chart LEFT + TradeCard RIGHT
// (stacked on mobile, chart first) → Recent trades table → collapsed "Market
// details". Every label derives from the snapshot (dynamic anchor symbol —
// nothing hard-coded to a market). Values the enriched snapshot populates
// render directly; when stats is null the page shows honest compact
// placeholders ("—" / "No trades yet"), never a fabricated value. Pool reserve
// and curve inventory value are ALWAYS separate rows — never summed, never
// labelled "Liquidity".
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { EXPLORER_BASE_URL } from "@bps/launch-lab";
import { useLabConfig, useMarket, useTokenMetadata } from "../../../../hooks/lab";
import { TradeCard } from "./TradeCard";
import { PriceChart } from "./PriceChart";

function short(v: string): string {
  return v.length > 14 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v;
}

/** 0x1234…abcd — compact address/hash display. */
function shortAddr(v: string): string {
  return v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-4)}` : v;
}

/** Compact USD for large aggregates (market cap, FDV, liquidity, volume). */
function fmtUsdCompact(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `$${(n / 1e3).toFixed(1)}K`;
  if (n !== 0 && abs < 0.01) return `$${n.toPrecision(3)}`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** USD unit price with enough significant digits for micro-cap prices. */
function fmtUsdPrice(v: string | null | undefined): string {
  if (!v) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (Math.abs(n) < 0.01) return `$${n.toPrecision(4)}`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}

/** Human token/anchor amount from a wei string. */
function fmtAmount(wei: string | null | undefined, decimals: number): string {
  if (!wei) return "—";
  try {
    const s = formatUnits(BigInt(wei), decimals);
    const n = Number(s);
    if (!Number.isFinite(n)) return s;
    if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
    return n === 0 ? "0" : n.toPrecision(4);
  } catch {
    return "—";
  }
}

/** Age since an ISO timestamp: "42m", "3h 10m", "2d 4h". */
function fmtAge(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return "—";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** Relative trade time: "12s ago", "5m ago", "3h ago", "2d ago". */
function fmtTimeAgo(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const LAYOUT_CSS = `
.market-main { display: grid; gap: 24px; grid-template-columns: minmax(0, 1fr); align-items: start; }
@media (min-width: 920px) { .market-main { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); } }
.market-stat-strip { display: flex; flex-wrap: wrap; gap: 16px 28px; align-items: flex-start; }
.market-stat { display: flex; flex-direction: column; gap: 4px; min-width: 84px; }
.market-links { display: flex; gap: 14px; align-items: center; margin-left: auto; flex-wrap: wrap; }
.market-trades-table { width: 100%; border-collapse: collapse; font-size: 13px; white-space: nowrap; }
.market-trades-table th { text-align: left; color: var(--warm-grey); font-weight: 500; padding: 6px 14px 6px 0; border-bottom: 1px solid var(--peach-grey); }
.market-trades-table td { padding: 8px 14px 8px 0; border-bottom: 1px solid var(--peach-grey); }
.market-trades-table tr:last-child td { border-bottom: none; }
`;

function Stat({
  label,
  value,
  testid,
}: {
  label: string;
  value: React.ReactNode;
  testid?: string;
}) {
  return (
    <div className="market-stat">
      <span className="lab-label">{label}</span>
      <span
        className="lab-data"
        style={{ fontSize: 16, wordBreak: "normal" }}
        data-testid={testid}
      >
        {value}
      </span>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="lab-kv">
      <span>{k}</span>
      <span className="lab-data">{v}</span>
    </div>
  );
}

export function TokenMarketView({ address }: { address: string }) {
  const { data: config } = useLabConfig();
  const market = useMarket(address);
  const { data: metadata } = useTokenMetadata(address);
  const queryClient = useQueryClient();
  const explorer = config?.explorerBaseUrl ?? EXPLORER_BASE_URL;
  const snap = market.data;

  // After a confirmed trade, refresh market, balances, and swap history.
  const handleTraded = useCallback(() => {
    void market.refetch();
    void queryClient.invalidateQueries({ queryKey: ["lab", "balances"] });
    void queryClient.invalidateQueries({ queryKey: ["lab", "history"] });
  }, [market, queryClient]);

  if (market.isPending) {
    return (
      <main>
        <p className="lab-muted">Loading market…</p>
      </main>
    );
  }
  if (market.isError || !snap) {
    return (
      <main>
        <p className="lab-muted" data-testid="market-error">
          Market data unavailable: {market.error ? market.error.message : "unknown error"}
        </p>
      </main>
    );
  }

  const anchorSymbol = snap.anchor.symbol;
  const anchorDecimals = snap.anchor.decimals || 18;
  const anchorVerified = snap.anchor.status === "verified";
  const locked = snap.poolStatus.available && snap.poolStatus.value === 2;
  const stats = snap.stats ?? null;
  const w24 = stats ? stats.windows["24h"] : null;
  const trades = snap.trades ?? [];
  const dex = snap.dexScreener ?? null;
  const explorerTokenUrl = snap.explorerTokenUrl || `${explorer}/token/${snap.tokenAddress}`;
  const hasTrades = (stats?.swapCount ?? 0) > 0 || trades.length > 0;

  // Artwork ONLY from this token's metadata endpoint (tokenURI-derived). No
  // hardcoded artwork fallback — another token's image must never appear here.
  // When unavailable, a neutral monogram placeholder renders instead.
  const tokenImage = metadata?.available && metadata.imageUrl ? metadata.imageUrl : null;
  const monogram = (snap.tokenSymbol || snap.tokenName || "?").slice(0, 4).toUpperCase();

  const startingPriceUsd =
    stats?.startingPriceUsd ??
    (snap.startingPriceUsd.available ? snap.startingPriceUsd.value : null);
  const anchorReserveWei =
    stats?.anchorReserveWei ?? (snap.anchorReserve.available ? snap.anchorReserve.value : null);
  const remainingInventoryWei =
    stats?.remainingInventoryWei ??
    (snap.remainingTokenInventory.available ? snap.remainingTokenInventory.value : null);

  const change24 = w24?.priceChangePct ?? null;
  const change24Num = change24 !== null ? Number(change24) : null;
  const changeNode =
    change24 !== null && Number.isFinite(change24Num as number) ? (
      <span
        style={{ color: (change24Num as number) < 0 ? "var(--bad)" : "var(--good)" }}
        data-change-direction={(change24Num as number) < 0 ? "down" : "up"}
      >
        {(change24Num as number) >= 0 ? "+" : ""}
        {change24}%
      </span>
    ) : (
      "—"
    );

  return (
    <main>
      <style>{LAYOUT_CSS}</style>

      {/* ---- token identity header ---- */}
      <header
        style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", marginBottom: 20 }}
      >
        {tokenImage ? (
          <img
            src={tokenImage}
            alt=""
            width={88}
            height={88}
            data-testid="token-artwork"
            style={{
              display: "block",
              borderRadius: 24,
              border: "1px solid var(--peach-grey)",
              boxShadow: "var(--card-shadow)",
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            data-testid="token-artwork-placeholder"
            style={{
              width: 88,
              height: 88,
              borderRadius: 24,
              border: "1px solid var(--peach-grey)",
              background: "var(--soft-peach)",
              color: "var(--deep-ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontSize: 20,
              letterSpacing: 1,
            }}
          >
            {monogram}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h1 className="lab-h1" style={{ margin: 0 }}>
              {snap.tokenName}
            </h1>
            <span className="lab-label" data-testid="pair-line" style={{ fontSize: 13 }}>
              {snap.tokenSymbol} / {anchorSymbol}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <span
              className={anchorVerified ? "lab-pill lab-pill--good" : "lab-pill lab-pill--warn"}
              data-testid="anchor-status-pill"
            >
              {anchorVerified ? `✓ ${anchorSymbol} anchor verified` : `anchor ${snap.anchor.status}`}
            </span>
            {locked ? (
              <span className="lab-pill lab-pill--good" data-testid="locked-pill">
                ✓ liquidity locked
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <span className="lab-data" style={{ fontSize: 13 }}>
            {short(snap.tokenAddress)}
          </span>
        </div>
      </header>

      {/* ---- stat strip ---- */}
      <section className="lab-card market-stat-strip" data-testid="stat-strip" style={{ marginBottom: 24 }}>
        <Stat label="Price" value={fmtUsdPrice(stats?.priceUsd)} testid="stat-price" />
        <Stat label="24h" value={changeNode} testid="stat-change-24h" />
        <Stat label="Market cap" value={fmtUsdCompact(stats?.marketCapUsd)} testid="stat-market-cap" />
        <Stat label="FDV" value={fmtUsdCompact(stats?.fdvUsd)} testid="stat-fdv" />
        {/* Two honest components, reported separately — never summed, never "Liquidity". */}
        <Stat
          label="Pool reserve"
          value={fmtUsdCompact(stats?.poolReserveUsd)}
          testid="stat-pool-reserve"
        />
        <Stat
          label="Curve inventory value"
          value={fmtUsdCompact(stats?.curveInventoryValueUsd)}
          testid="stat-curve-inventory"
        />
        <Stat label="24h volume" value={fmtUsdCompact(w24?.volumeUsd)} testid="stat-volume-24h" />
        <Stat
          label="Holder addresses"
          value={
            <>
              {snap.holderCount !== null && snap.holderCount !== undefined
                ? snap.holderCount.toLocaleString("en-US")
                : "—"}{" "}
              <span className="lab-muted" data-testid="holders-source" style={{ fontSize: 11 }}>
                Blockscout
              </span>
            </>
          }
          testid="stat-holders"
        />
        <Stat label="Age" value={fmtAge(snap.launchedAt)} testid="stat-age" />
        {!hasTrades ? (
          <span className="lab-muted" data-testid="no-trades-note" style={{ fontSize: 13, alignSelf: "center" }}>
            No trades yet
          </span>
        ) : null}
        <div className="market-links">
          {dex ? (
            <a
              data-testid="dexscreener-link"
              href={dex.url}
              target="_blank"
              rel="noreferrer"
              className="lab-btn lab-btn--ghost"
            >
              DEX Screener ↗
            </a>
          ) : (
            <span className="lab-muted" data-testid="dexscreener-indexing" style={{ fontSize: 13 }}>
              DEX Screener indexing…
            </span>
          )}
          <a
            data-testid="token-blockscout"
            href={explorerTokenUrl}
            target="_blank"
            rel="noreferrer"
            className="lab-btn lab-btn--ghost"
          >
            Blockscout ↗
          </a>
        </div>
      </section>

      {/* ---- main row: chart left (~60%), trade right (~40%); chart first on mobile ---- */}
      <div className="market-main">
        <section className="lab-card" data-testid="price-chart-section" style={{ minWidth: 0 }}>
          <h2 className="lab-h2">price</h2>
          <PriceChart
            address={snap.tokenAddress}
            tokenSymbol={snap.tokenSymbol}
            anchorSymbol={anchorSymbol}
            anchorIsCurrency0={stats?.anchorIsCurrency0}
            anchorDecimals={anchorDecimals}
          />
        </section>

        <aside style={{ display: "grid", gap: 20, minWidth: 0 }}>
          <section className="lab-card" data-testid="trade-section">
            <h2 className="lab-h2">trade</h2>
            <p className="lab-label" data-testid="trade-anchor-framing" style={{ marginBottom: 12 }}>
              Market anchored to {anchorSymbol}
            </p>
            <TradeCard
              address={snap.tokenAddress}
              tokenSymbol={snap.tokenSymbol}
              explorer={explorer}
              anchorSymbol={snap.anchor.symbol}
              anchorAddress={snap.anchor.address}
              anchorDecimals={snap.anchor.decimals}
              onTraded={handleTraded}
            />
            <p className="lab-muted" style={{ fontSize: 13, marginTop: 14 }}>
              <a
                href="https://matcha.xyz"
                target="_blank"
                rel="noreferrer"
                data-testid="trade-external"
              >
                Advanced: trade on Matcha ↗
              </a>{" "}
              — external aggregator not operated by BPS; verify the token address yourself.
            </p>
          </section>
          <section className="lab-card lab-card--nested" style={{ display: "flex", gap: 14 }}>
            <img src="/lab/bps-icon-flat.png" alt="" width={26} height={26} style={{ height: 26 }} />
            <p className="lab-muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.55 }}>
              This market&apos;s configuration is locked: verified no-op migration, immutable fee
              split, liquidity held by the pool contract. Verify everything — trust nothing.
            </p>
          </section>
        </aside>
      </div>

      {/* ---- recent trades ---- */}
      <section className="lab-card" data-testid="recent-trades" style={{ marginTop: 24 }}>
        <div
          style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 8 }}
        >
          <h2 className="lab-h2" style={{ margin: 0 }}>
            recent trades
          </h2>
          {w24 ? (
            <span className="lab-label" data-testid="trades-24h-counts">
              24h: {plural(w24.buys, "buy")} · {plural(w24.sells, "sell")}
            </span>
          ) : null}
        </div>
        {trades.length === 0 ? (
          <p className="lab-muted" data-testid="trades-empty" style={{ fontSize: 14 }}>
            No trades yet
          </p>
        ) : (
          <div className="lab-scroll-x">
            <table className="market-trades-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Side</th>
                  <th>{snap.tokenSymbol}</th>
                  <th>{anchorSymbol}</th>
                  <th>USD</th>
                  <th>Price</th>
                  <th>Wallet</th>
                  <th>Tx</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.txHash} data-testid={`trade-row-${t.txHash}`}>
                    <td className="lab-muted">{fmtTimeAgo(t.occurredAt)}</td>
                    <td>
                      <span
                        className={
                          t.side === "buy" ? "lab-pill lab-pill--good" : "lab-pill lab-pill--bad"
                        }
                        data-testid={`trade-side-${t.txHash}`}
                      >
                        {t.side === "buy" ? "Buy" : "Sell"}
                      </span>
                    </td>
                    <td className="lab-data">{fmtAmount(t.tokenAmountWei, 18)}</td>
                    <td className="lab-data">
                      {fmtAmount(t.anchorAmountWei, anchorDecimals)} {anchorSymbol}
                    </td>
                    <td className="lab-data">{fmtUsdCompact(t.usdValue)}</td>
                    <td className="lab-data">{fmtUsdPrice(t.priceUsdAtTrade)}</td>
                    {/* Wallet = transaction.from. The decoded event sender is
                        usually a router — exposed only as detail, NEVER shown
                        as the wallet. */}
                    <td
                      className="lab-data"
                      data-testid={`trade-wallet-${t.txHash}`}
                      title={
                        t.eventSender &&
                        (!t.trader || t.eventSender.toLowerCase() !== t.trader.toLowerCase())
                          ? `Event sender (router): ${t.eventSender}`
                          : undefined
                      }
                    >
                      {t.trader ? (
                        <a
                          href={`${explorer}/address/${t.trader}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortAddr(t.trader)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <a
                        href={`${explorer}/tx/${t.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`trade-tx-${t.txHash}`}
                      >
                        {shortAddr(t.txHash)} ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- collapsed market details (never leads with pool ids / module config) ---- */}
      <details className="lab-card" data-testid="market-details" style={{ marginTop: 24 }}>
        <summary
          className="lab-label"
          style={{ cursor: "pointer", fontSize: 13, listStyle: "revert" }}
        >
          Market details
        </summary>
        <div style={{ marginTop: 14 }}>
          <Kv
            k={`Anchor reserve (${anchorSymbol})`}
            v={
              anchorReserveWei !== null ? (
                <>
                  {fmtAmount(anchorReserveWei, anchorDecimals)} {anchorSymbol}
                </>
              ) : (
                "—"
              )
            }
          />
          <Kv
            k="Remaining inventory"
            v={
              remainingInventoryWei !== null
                ? `${fmtAmount(remainingInventoryWei, 18)} ${snap.tokenSymbol}`
                : "—"
            }
          />
          <Kv
            k="Circulating supply"
            v={
              stats
                ? `${fmtAmount(stats.circulatingSupplyWei, 18)} ${snap.tokenSymbol}`
                : "—"
            }
          />
          <Kv
            k="Total supply"
            v={
              snap.totalSupply.available
                ? `${fmtAmount(snap.totalSupply.value, 18)} ${snap.tokenSymbol}`
                : "—"
            }
          />
          <Kv k="Starting price (USD)" v={fmtUsdPrice(startingPriceUsd)} />
          <Kv
            k="Creator"
            v={
              snap.creator.available ? (
                <a
                  href={`${explorer}/address/${snap.creator.value}`}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="creator-link"
                >
                  {shortAddr(snap.creator.value)}
                </a>
              ) : (
                "—"
              )
            }
          />
          <Kv
            k="Launch transaction"
            v={
              snap.launchTransactionHash.available ? (
                <a
                  href={`${explorer}/tx/${snap.launchTransactionHash.value}`}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="launch-tx-link"
                >
                  {shortAddr(snap.launchTransactionHash.value)}
                </a>
              ) : (
                "—"
              )
            }
          />
          <Kv k="Launch block" v={snap.launchBlock ?? "—"} />
          <Kv
            k="Pool status"
            v={
              snap.poolStatus.available
                ? snap.poolStatus.value === 2
                  ? "2 (locked)"
                  : String(snap.poolStatus.value)
                : "—"
            }
          />
          <Kv
            k="Pool fee"
            v={
              snap.exactPoolFeeUnits.available
                ? `${(snap.exactPoolFeeUnits.value / 10_000).toFixed(2)}%`
                : "—"
            }
          />
          <Kv k="Pool id" v={snap.poolId.available ? short(snap.poolId.value) : "—"} />
          <Kv
            k="Provenance"
            v={
              snap.provenanceVerified ? (
                <span className="lab-pill lab-pill--good" data-testid="provenance-pill">
                  ✓ provenance verified
                </span>
              ) : (
                <span className="lab-pill" data-testid="provenance-pill">
                  provenance unverified
                </span>
              )
            }
          />
          <p style={{ margin: "18px 0 0" }}>
            <a href={`/lab/proof/${snap.tokenAddress}`} data-testid="proof-link">
              full proof trail →
            </a>
          </p>
        </div>
      </details>

      <p className="lab-muted" style={{ fontSize: 13, marginTop: 20 }}>
        Snapshot fetched {new Date(snap.fetchedAt).toISOString()}
      </p>
    </main>
  );
}
