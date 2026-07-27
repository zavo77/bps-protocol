"use client";
// Market page body, restyled to the Claude Design V4 lab aesthetic. Every
// MarketDatum with available:false renders EXACTLY "awaiting indexed data" via
// the .lab-await treatment — never zero, never a fabricated value. All market /
// anchor / pool / fee data, the embedded TradeCard, and the PriceChart are
// preserved; only the presentation changed.
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { EXPLORER_BASE_URL, type MarketDatum } from "@bps/launch-lab";
import { useLabConfig, useMarket } from "../../../../hooks/lab";
import { TradeCard } from "./TradeCard";
import { PriceChart } from "./PriceChart";

export const AWAITING = "awaiting indexed data";

const IMAGE_RE = /^https?:\/\/.+\.(png|jpe?g|webp|gif|svg)$/i;

function short(v: string): string {
  return v.length > 14 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v;
}

/** Render a MarketDatum: available → formatted value; else the .lab-await note. */
function Datum<T>({ d, fmt }: { d: MarketDatum<T> | undefined; fmt?: (v: T) => React.ReactNode }) {
  if (!d || !d.available) return <span className="lab-await">{AWAITING}</span>;
  return <>{fmt ? fmt(d.value) : String(d.value)}</>;
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

  const fmtWei = (decimals: number) => (v: string) => formatUnits(BigInt(v), decimals);
  const anchorDecimals = snap.anchor.decimals || 18;
  const tokenImage =
    snap.tokenUri.available && IMAGE_RE.test(snap.tokenUri.value)
      ? snap.tokenUri.value
      : "/lab/print-token.png";
  const anchorVerified = snap.anchor.status === "verified";
  const locked = snap.poolStatus.available && snap.poolStatus.value === 2;

  return (
    <main>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
          marginBottom: 28,
        }}
      >
        <img
          src={tokenImage}
          alt=""
          width={88}
          height={88}
          style={{
            display: "block",
            borderRadius: 24,
            border: "1px solid var(--peach-grey)",
            boxShadow: "var(--card-shadow)",
          }}
        />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h1 className="lab-h1" style={{ margin: 0 }}>
              {snap.tokenName}
            </h1>
            <span className="lab-label">{snap.tokenSymbol}</span>
          </div>
          <p className="lab-muted" style={{ margin: "8px 0 0" }}>
            Paired with Alphabet Class A • Robinhood Token (GOOGL)
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <span
              className={anchorVerified ? "lab-pill lab-pill--good" : "lab-pill lab-pill--warn"}
              data-testid="anchor-status-pill"
            >
              {anchorVerified ? "✓ GOOGL anchor verified" : `anchor ${snap.anchor.status}`}
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
          <a
            className="lab-btn lab-btn--ghost"
            data-testid="token-blockscout"
            href={`${explorer}/address/${snap.tokenAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            verify on Blockscout ↗
          </a>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gap: 24,
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 24, minWidth: 0 }}>
          <section className="lab-card" data-testid="market-core">
            <h2 className="lab-h2">market</h2>
            <Kv k="Current price (USD)" v={<Datum d={snap.currentPriceUsd} />} />
            <Kv k="Starting price (USD)" v={<Datum d={snap.startingPriceUsd} />} />
            <Kv k="Current FDV (USD)" v={<Datum d={snap.currentFdvUsd} />} />
            <Kv k="Total supply" v={<Datum d={snap.totalSupply} fmt={fmtWei(18)} />} />
            <Kv
              k="Remaining sale inventory"
              v={<Datum d={snap.remainingTokenInventory} fmt={fmtWei(18)} />}
            />
          </section>

          <div className="lab-grid">
            <section className="lab-card lab-card--peach" data-testid="market-anchor">
              <div className="lab-label">GOOGL reserve · real</div>
              <div
                style={{ margin: "10px 0 4px", fontWeight: 700, fontSize: 24 }}
                className="lab-data"
              >
                <Datum d={snap.anchorReserve} fmt={fmtWei(anchorDecimals)} />
              </div>
              <p className="lab-muted" style={{ fontSize: 14, margin: "8px 0 0" }}>
                The quote-asset balance held by the pool right now — not a projection.
              </p>
              <div style={{ marginTop: 14 }}>
                <Kv
                  k="Anchor status"
                  v={
                    anchorVerified ? (
                      <span className="lab-pill lab-pill--good">verified</span>
                    ) : (
                      <span className="lab-pill lab-pill--warn">{snap.anchor.status}</span>
                    )
                  }
                />
                <Kv
                  k="Anchor address"
                  v={
                    <a
                      href={`${explorer}/address/${snap.anchor.address}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {short(snap.anchor.address)}
                    </a>
                  }
                />
                <Kv k="Multiplier" v={snap.anchor.currentMultiplier || "—"} />
                <Kv k="Mid price (USD)" v={snap.anchor.midPriceUsd} />
              </div>
            </section>

            <section className="lab-card" data-testid="market-beneficiaries">
              <div className="lab-label">fee transparency</div>
              <div style={{ margin: "10px 0", fontWeight: 700, fontSize: 24 }}>
                1%{" "}
                <span className="lab-muted" style={{ fontSize: 15 }}>
                  balanced
                </span>
              </div>
              <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden" }}>
                <span style={{ flex: "0 0 85%", background: "var(--pastel-orange)" }} />
                <span style={{ flex: "0 0 10%", background: "var(--soft-peach)" }} />
                <span style={{ flex: "0 0 5%", background: "var(--signal-orange)" }} />
              </div>
              <p
                className="lab-muted"
                style={{ fontSize: 14, margin: "12px 0 0", lineHeight: 1.6 }}
              >
                85% creator beneficiary · 10% BPS Launch Lab · 5% Doppler protocol
                <br />
                fixed at launch, enforced by the pool.
              </p>
              {snap.beneficiaries.available ? (
                <div className="lab-scroll-x" style={{ marginTop: 12 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", color: "var(--warm-grey)" }}>Label</th>
                        <th style={{ textAlign: "left", color: "var(--warm-grey)" }}>Address</th>
                        <th style={{ textAlign: "left", color: "var(--warm-grey)" }}>Percent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.beneficiaries.value.map((b) => (
                        <tr key={`${b.beneficiary}-${b.label}`}>
                          <td>{b.label}</td>
                          <td style={{ wordBreak: "break-all" }} className="lab-data">
                            {b.beneficiary}
                          </td>
                          <td className="lab-data">{b.percent}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ marginTop: 12 }}>
                  <span className="lab-await">{AWAITING}</span>
                </p>
              )}
            </section>
          </div>

          <section className="lab-card" data-testid="market-pool">
            <h2 className="lab-h2">pool</h2>
            <Kv k="Pool id" v={<Datum d={snap.poolId} fmt={short} />} />
            <Kv
              k="Pool status"
              v={<Datum d={snap.poolStatus} fmt={(s) => (s === 2 ? "2 (locked)" : String(s))} />}
            />
            <Kv k="Fee preset" v={<Datum d={snap.feePreset} />} />
            <Kv k="Exact pool fee units" v={<Datum d={snap.exactPoolFeeUnits} />} />
            <Kv k="Creator" v={<Datum d={snap.creator} fmt={short} />} />
            <Kv k="Token URI" v={<Datum d={snap.tokenUri} />} />
            <Kv
              k="Launch transaction"
              v={
                snap.launchTransactionHash.available ? (
                  <a
                    href={`${explorer}/tx/${snap.launchTransactionHash.value}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {short(snap.launchTransactionHash.value)}
                  </a>
                ) : (
                  <span className="lab-await">{AWAITING}</span>
                )
              }
            />
            <p
              className="lab-muted"
              data-testid="permanence-note"
              style={{ fontSize: 13, margin: "14px 0 0", lineHeight: 1.55 }}
            >
              Permanence: fixed at launch through a verified no-op migration and locked-market
              configuration.
            </p>
            <p style={{ margin: "18px 0 0" }}>
              <a href={`/lab/proof/${snap.tokenAddress}`} data-testid="proof-link">
                full proof trail →
              </a>
            </p>
          </section>

          <section className="lab-card" data-testid="price-chart-section">
            <h2 className="lab-h2">price history</h2>
            <PriceChart address={snap.tokenAddress} tokenSymbol={snap.tokenSymbol} />
          </section>
        </div>

        <aside style={{ display: "grid", gap: 20, minWidth: 0 }}>
          <section className="lab-card" data-testid="trade-section">
            <h2 className="lab-h2">trade</h2>
            <p
              className="lab-label"
              data-testid="trade-anchor-framing"
              style={{ marginBottom: 12 }}
            >
              Market anchored to {snap.anchor.symbol}
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
            <img
              src="/lab/bps-icon-flat.png"
              alt=""
              width={26}
              height={26}
              style={{ height: 26 }}
            />
            <p className="lab-muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.55 }}>
              This market&apos;s configuration is locked: verified no-op migration, immutable fee
              split, liquidity held by the pool contract. Verify everything — trust nothing.
            </p>
          </section>
        </aside>
      </div>

      <p className="lab-muted" style={{ fontSize: 13, marginTop: 20 }}>
        Snapshot fetched {new Date(snap.fetchedAt).toISOString()}
      </p>
    </main>
  );
}
