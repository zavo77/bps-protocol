"use client";
// Proof directory (index). A short "select a market to view its proof" over the
// real, chain-reconstructed launches from useMarkets. Each verified market links
// to its per-market evidence trail at /lab/proof/<address>. Honest empty state —
// nothing is fabricated before a market exists.
import { useMarkets, type MarketListItem } from "../../../hooks/lab";

function short(v: string): string {
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

function ProofCard({ market }: { market: MarketListItem }) {
  return (
    <a
      href={`/lab/proof/${market.tokenAddress}`}
      className="lab-card"
      data-testid={`proof-market-${market.tokenAddress.toLowerCase()}`}
      style={{ display: "block", color: "inherit" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 20, color: "var(--deep-ink)" }}>
          {market.tokenName}
        </span>
        <span className="lab-label">{market.tokenSymbol}</span>
      </div>
      <p className="lab-muted" style={{ fontSize: 14, margin: "8px 0 0" }}>
        Paired with {market.anchorSymbol ?? "an approved Robinhood Stock Token"}
      </p>
      <div className="lab-kv" style={{ marginTop: 14 }}>
        <span>Token</span>
        <span className="lab-data">{short(market.tokenAddress)}</span>
      </div>
      <div className="lab-kv">
        <span>Launch tx</span>
        <span className="lab-data">{short(market.launchTransactionHash)}</span>
      </div>
      <p style={{ margin: "14px 0 0", fontWeight: 600, color: "var(--deep-ink)" }}>
        view proof trail →
      </p>
    </a>
  );
}

export default function LabProofIndexPage() {
  const markets = useMarkets("newest");

  return (
    <main>
      <div className="lab-label">evidence</div>
      <h1 className="lab-h1">
        the proof <span className="lab-serif">trail</span>
      </h1>
      <p className="lab-lead" style={{ marginTop: 14 }}>
        Written for advisors and skeptics. Select a market to open its evidence trail — every claim
        links to a primary source: a contract, a transaction, or a pinned document.
      </p>

      <div style={{ marginTop: 28 }}>
        {markets.isPending ? (
          <p className="lab-muted">Loading proof directory…</p>
        ) : markets.isError ? (
          <p className="lab-muted" data-testid="proof-directory-error">
            Proof directory temporarily unavailable.
          </p>
        ) : markets.markets.length === 0 ? (
          <p className="lab-muted" data-testid="proof-empty">
            No BPS markets have launched yet.
          </p>
        ) : (
          <div className="lab-grid" data-testid="proof-directory">
            {markets.markets.map((m) => (
              <ProofCard key={m.tokenAddress} market={m} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
