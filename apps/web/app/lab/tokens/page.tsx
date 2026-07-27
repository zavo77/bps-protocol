"use client";
// Public markets browser. Renders ONLY real, chain-reconstructed launches from
// GET /api/lab/launches (via useMarkets), enriched with indexed swap activity
// when the indexer view exists — otherwise each market honestly reads
// "Collecting market data". Client-side search (name/symbol/anchor) + a
// server-applied newest/volume sort toggle. Honest empty state.
import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { EXPLORER_BASE_URL } from "@bps/launch-lab";
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

function AnchorCell({ symbol, logo }: { symbol: string | null; logo: string | null }) {
  if (!symbol) return <span className="muted">—</span>;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {logo ? (
        <img
          src={logo}
          alt=""
          width={16}
          height={16}
          style={{ verticalAlign: "middle", borderRadius: "50%", marginRight: "0.35rem" }}
        />
      ) : null}
      {symbol}
    </span>
  );
}

function MarketRow({
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
    <tr data-testid={`market-row-${market.tokenAddress.toLowerCase()}`}>
      <td>
        <strong>{market.tokenName}</strong>
      </td>
      <td>{market.tokenSymbol}</td>
      <td>
        <AnchorCell symbol={market.anchorSymbol} logo={logo} />
      </td>
      <td>
        <a href={`/lab/token/${market.tokenAddress}`}>{short(market.tokenAddress)}</a>
      </td>
      <td>
        {market.creator ? (
          <a href={`/lab/profile/${market.creator}`}>{short(market.creator)}</a>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        {collecting ? (
          <span className="small muted" data-testid="market-collecting">
            Collecting market data
          </span>
        ) : (
          <span className="small" data-testid="market-activity">
            {market.indexedSwaps} swaps · {fmtGross(market.grossMovementWei as string)} gross
          </span>
        )}
      </td>
      <td>
        <a href={`${explorer}/tx/${market.launchTransactionHash}`} target="_blank" rel="noreferrer">
          {short(market.launchTransactionHash)}
        </a>
      </td>
    </tr>
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
      <h1>Markets</h1>
      <p className="muted">
        Every community market launched through the Launch Lab, quoted in an approved Robinhood
        Stock Token. Data is reconstructed from chain; swap activity appears once indexed.
      </p>

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          flexWrap: "wrap",
          margin: "1rem 0",
        }}
      >
        <input
          type="search"
          value={search}
          placeholder="Search by name, symbol, or anchor"
          data-testid="markets-search"
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: "14rem", padding: "0.5rem" }}
        />
        <div role="group" aria-label="Sort" style={{ display: "flex", gap: "0.4rem" }}>
          <button
            type="button"
            data-testid="markets-sort-newest"
            aria-pressed={markets.sort === "newest"}
            onClick={() => markets.setSort("newest")}
          >
            Newest
          </button>
          <button
            type="button"
            data-testid="markets-sort-volume"
            aria-pressed={markets.sort === "volume"}
            onClick={() => markets.setSort("volume")}
          >
            Volume
          </button>
        </div>
      </div>

      {markets.isPending ? (
        <p className="muted">Loading markets…</p>
      ) : markets.isError ? (
        <p className="muted" data-testid="markets-error">
          Markets are temporarily unavailable.
        </p>
      ) : markets.markets.length === 0 ? (
        <p className="muted" data-testid="markets-empty">
          No markets launched yet.
        </p>
      ) : filtered.length === 0 ? (
        <p className="muted" data-testid="markets-no-match">
          No markets match your search.
        </p>
      ) : (
        <div className="scroll-x">
          <table className="tbl" data-testid="markets-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Symbol</th>
                <th>Anchor</th>
                <th>Address</th>
                <th>Creator</th>
                <th>Activity</th>
                <th>Launch tx</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <MarketRow
                  key={m.tokenAddress}
                  market={m}
                  logo={logoBySymbol.get(m.anchorSymbol ?? "") ?? null}
                  explorer={explorer}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
