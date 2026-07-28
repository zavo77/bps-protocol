"use client";
// Public landing + markets directory (the /lab entry point). Renders ONLY real,
// chain-reconstructed launches from GET /api/lab/launches (via useMarkets),
// enriched with indexed swap activity when the indexer view exists — otherwise
// each market honestly reads "collecting market data". Genesis/market status and
// the anchor set come from GET /api/lab/config (useLabConfig). Client-side search
// (name/symbol/anchor) + a server-applied newest/volume sort toggle. No sample
// markets, volume, FDV, holders, or TVL are ever fabricated. Styled with the
// Claude Design V4 system (app/lab/lab.css) scoped by .lab-root in the layout.
import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { EXPLORER_BASE_URL, SPLIT } from "@bps/launch-lab";
import { useLabConfig, useMarkets, type MarketListItem } from "../../../hooks/lab";

function short(v: string): string {
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

/** Gross movement is anchor-denominated wei (18 decimals); trim trailing zeros. */
function fmtGross(wei: string): string {
  try {
    const s = formatUnits(BigInt(wei), 18);
    return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
  } catch {
    return "—";
  }
}

function AnchorBadge({ symbol, logo }: { symbol: string | null; logo: string | null }) {
  if (!symbol) return <span className="lab-await">unrecognized anchor</span>;
  return (
    <span className="lab-pill" style={{ whiteSpace: "nowrap" }}>
      {logo ? (
        <img src={logo} alt="" width={16} height={16} style={{ borderRadius: "50%" }} />
      ) : null}
      {symbol}
    </span>
  );
}

function MarketCard({
  market,
  logo,
  explorer,
}: {
  market: MarketListItem;
  logo: string | null;
  explorer: string;
}) {
  const collecting = market.indexedSwaps === null || market.grossMovementWei === null;
  return (
    <article className="lab-card" data-testid={`market-card-${market.tokenAddress.toLowerCase()}`}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: "-0.03em",
              color: "var(--deep-ink)",
            }}
          >
            {market.tokenName}
          </div>
          <div className="lab-label" style={{ marginTop: 4 }}>
            {market.tokenSymbol}
          </div>
        </div>
        <AnchorBadge symbol={market.anchorSymbol} logo={logo} />
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="lab-kv">
          <span>address</span>
          <a className="lab-data" href={`/lab/token/${market.tokenAddress}`}>
            {short(market.tokenAddress)}
          </a>
        </div>
        <div className="lab-kv">
          <span>creator</span>
          {market.creator ? (
            <a className="lab-data" href={`/lab/profile/${market.creator}`}>
              {short(market.creator)}
            </a>
          ) : (
            <span className="lab-await">awaiting indexed data</span>
          )}
        </div>
        <div className="lab-kv">
          <span>activity</span>
          {collecting ? (
            <span className="lab-await" data-testid="market-collecting">
              collecting market data
            </span>
          ) : (
            <span className="lab-data" data-testid="market-activity">
              {market.indexedSwaps} swaps · {fmtGross(market.grossMovementWei as string)} gross
            </span>
          )}
        </div>
        <div className="lab-kv">
          <span>launch tx</span>
          <a
            className="lab-data"
            href={`${explorer}/tx/${market.launchTransactionHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {short(market.launchTransactionHash)}
          </a>
        </div>
      </div>
    </article>
  );
}

function FeeItem({ pct, label, detail }: { pct: string; label: string; detail: string }) {
  return (
    <div className="lab-card lab-card--nested">
      <div
        style={{
          fontWeight: 800,
          fontSize: 34,
          letterSpacing: "-0.04em",
          color: "var(--deep-ink)",
        }}
      >
        {pct}
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, marginTop: 6, color: "var(--deep-ink)" }}>
        {label}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.5, color: "var(--warm-grey)" }}>
        {detail}
      </p>
    </div>
  );
}

export default function LabTokensPage() {
  const { data: config } = useLabConfig();
  const markets = useMarkets("newest");
  const [search, setSearch] = useState("");

  const explorer = config?.explorerBaseUrl ?? EXPLORER_BASE_URL;
  const logoBySymbol = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const a of config?.anchors ?? []) map.set(a.symbol, a.logo);
    return map;
  }, [config?.anchors]);

  const genesisAddress =
    config?.genesis.launched && config.genesis.tokenAddress ? config.genesis.tokenAddress : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return markets.markets;
    return markets.markets.filter((m) => {
      return (
        m.tokenName.toLowerCase().includes(q) ||
        m.tokenSymbol.toLowerCase().includes(q) ||
        (m.anchorSymbol ?? "").toLowerCase().includes(q)
      );
    });
  }, [markets.markets, search]);

  return (
    <main>
      {/* ---- hero ---- */}
      <section
        className="lab-card lab-card--peach"
        style={{ borderRadius: 32, padding: "clamp(32px, 5vw, 56px)", marginBottom: 24 }}
      >
        <div className="lab-label" style={{ color: "#9c6f55" }}>
          bps launch lab · robinhood chain
        </div>
        <h1 className="lab-h1" style={{ marginTop: 16, maxWidth: 720 }}>
          launch community markets paired with <span className="lab-serif">real-world</span> assets
        </h1>
        <p className="lab-lead" style={{ marginTop: 18, color: "#5c4638" }}>
          Paired with Alphabet Class A • Robinhood Token (GOOGL). One transaction, permanent
          liquidity, every basis point accounted for.
        </p>
        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: 28,
          }}
        >
          <a href="/lab/launch" className="lab-btn lab-btn--primary" data-testid="hero-create">
            Launch a market
          </a>
          {genesisAddress ? (
            <a
              href={`/lab/token/${genesisAddress}`}
              className="lab-btn lab-btn--ghost"
              data-testid="hero-genesis"
            >
              view the genesis market
            </a>
          ) : null}
        </div>
        <div className="lab-label" style={{ marginTop: 20, color: "#9c6f55" }}>
          public creation · fixed parameters · onchain verification
        </div>
      </section>

      {/* ---- fee economics (read-only 85 / 10 / 5) ---- */}
      <section className="lab-card" style={{ marginBottom: 24 }} data-testid="fee-economics">
        <div className="lab-label">fee economics</div>
        <h2 className="lab-h2" style={{ marginTop: 12 }}>
          every basis point has a <span className="lab-serif">destination</span>
        </h2>
        <p className="lab-lead" style={{ marginTop: 8, fontSize: 15 }}>
          The split below is encoded in every launch manifest and enforced by the pool itself. It
          never changes after launch.
        </p>
        <div className="lab-grid" style={{ marginTop: 20 }}>
          <FeeItem
            pct={`${SPLIT.creatorFeePct.toString()}%`}
            label="creator beneficiary"
            detail={`${SPLIT.creatorFeePct.toString()}% of every swap fee streams to the creator beneficiary fixed at launch.`}
          />
          <FeeItem
            pct={`${SPLIT.bpsFeePct.toString()}%`}
            label="BPS Launch Lab"
            detail={`${SPLIT.bpsFeePct.toString()}% funds Launch Lab operations and the public indexer.`}
          />
          <FeeItem
            pct={`${SPLIT.protocolPct.toString()}%`}
            label="Doppler protocol"
            detail={`${SPLIT.protocolPct.toString()}% goes to the Doppler protocol that powers the market mechanics.`}
          />
        </div>
      </section>

      {/* ---- markets directory ---- */}
      <section>
        <div className="lab-label">the markets</div>
        <h2 className="lab-h2" style={{ marginTop: 12 }}>
          every launch, <span className="lab-serif">onchain</span>
        </h2>
        <p className="lab-lead" style={{ marginTop: 8, fontSize: 15 }}>
          Every community market launched through the Launch Lab, quoted in an approved Robinhood
          Stock Token. Data is reconstructed from chain; swap activity appears once indexed.
        </p>

        {/* genesis / first-market status */}
        <div className="lab-card lab-card--nested" style={{ margin: "18px 0" }}>
          <div className="lab-label">genesis market</div>
          {genesisAddress ? (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <span className="lab-pill lab-pill--good">live</span>
              <a
                className="lab-data"
                href={`/lab/token/${genesisAddress}`}
                data-testid="genesis-link"
              >
                {short(genesisAddress)} →
              </a>
            </div>
          ) : (
            <p className="lab-await" style={{ marginTop: 8 }} data-testid="genesis-status">
              No BPS markets have launched yet.
            </p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            margin: "16px 0 20px",
          }}
        >
          <input
            type="search"
            className="lab-field"
            value={search}
            placeholder="Search by name, symbol, or anchor"
            data-testid="markets-search"
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: "14rem" }}
          />
          <div role="group" aria-label="Sort" style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="lab-btn lab-btn--ghost"
              data-testid="markets-sort-newest"
              aria-pressed={markets.sort === "newest"}
              onClick={() => markets.setSort("newest")}
              style={
                markets.sort === "newest"
                  ? { background: "var(--deep-ink)", color: "#fff", borderColor: "var(--deep-ink)" }
                  : undefined
              }
            >
              newest
            </button>
            <button
              type="button"
              className="lab-btn lab-btn--ghost"
              data-testid="markets-sort-volume"
              aria-pressed={markets.sort === "volume"}
              onClick={() => markets.setSort("volume")}
              style={
                markets.sort === "volume"
                  ? { background: "var(--deep-ink)", color: "#fff", borderColor: "var(--deep-ink)" }
                  : undefined
              }
            >
              volume
            </button>
          </div>
        </div>

        {markets.isPending ? (
          <p className="lab-await" data-testid="markets-loading">
            loading markets…
          </p>
        ) : markets.isError ? (
          <p className="lab-await" data-testid="markets-error">
            Markets are temporarily unavailable.
          </p>
        ) : markets.markets.length === 0 ? (
          <p className="lab-await" data-testid="markets-empty">
            No BPS markets have launched yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="lab-await" data-testid="markets-no-match">
            No markets match your search.
          </p>
        ) : (
          <div className="lab-grid" data-testid="markets-grid">
            {filtered.map((m) => (
              <MarketCard
                key={m.tokenAddress}
                market={m}
                logo={logoBySymbol.get(m.anchorSymbol ?? "") ?? null}
                explorer={explorer}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
