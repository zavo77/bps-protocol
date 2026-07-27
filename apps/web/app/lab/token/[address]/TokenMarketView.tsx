"use client";
// Market page body. Every MarketDatum with available:false renders EXACTLY
// "Awaiting indexed data" — never zero, never a fabricated value.
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { EXPLORER_BASE_URL, type MarketDatum } from "@bps/launch-lab";
import { useLabConfig, useMarket } from "../../../../hooks/lab";
import { TradeCard } from "./TradeCard";
import { PriceChart } from "./PriceChart";

export const AWAITING = "Awaiting indexed data";

function datumText<T>(d: MarketDatum<T> | undefined, fmt?: (v: T) => string): string {
  if (!d || !d.available) return AWAITING;
  return fmt ? fmt(d.value) : String(d.value);
}

function short(v: string): string {
  return v.length > 14 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v" style={{ wordBreak: "break-all", textAlign: "right" }}>
        {v}
      </span>
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
        <p className="muted">Loading market…</p>
      </main>
    );
  }
  if (market.isError || !snap) {
    return (
      <main>
        <p className="muted" data-testid="market-error">
          Market data unavailable: {market.error ? market.error.message : "unknown error"}
        </p>
      </main>
    );
  }

  const fmtWei = (decimals: number) => (v: string) => formatUnits(BigInt(v), decimals);
  const anchorDecimals = snap.anchor.decimals || 18;

  return (
    <main>
      <h1>
        {snap.tokenName} ({snap.tokenSymbol})
      </h1>
      <p className="small">
        Token{" "}
        <a href={`${explorer}/address/${snap.tokenAddress}`} target="_blank" rel="noreferrer">
          {snap.tokenAddress}
        </a>
      </p>

      <div className="grid">
        <section className="card" data-testid="market-core">
          <h2>Market</h2>
          <Row k="Current price (USD)" v={datumText(snap.currentPriceUsd)} />
          <Row k="Starting price (USD)" v={datumText(snap.startingPriceUsd)} />
          <Row k="Current FDV (USD)" v={datumText(snap.currentFdvUsd)} />
          <Row k="Total supply" v={datumText(snap.totalSupply, fmtWei(18))} />
          <Row
            k="Remaining sale inventory"
            v={datumText(snap.remainingTokenInventory, fmtWei(18))}
          />
          <Row k="GOOGL reserve" v={datumText(snap.anchorReserve, fmtWei(anchorDecimals))} />
        </section>

        <section className="card" data-testid="market-anchor">
          <h2>
            GOOGL anchor{" "}
            {snap.anchor.status === "verified" ? (
              <span className="badge badge-good">Verified</span>
            ) : (
              <span className="badge badge-warn">{snap.anchor.status}</span>
            )}
          </h2>
          <Row k="Name" v={snap.anchor.name || "—"} />
          <Row
            k="Address"
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
          <Row k="Multiplier" v={snap.anchor.currentMultiplier || "—"} />
          <Row k="Mid price (USD)" v={snap.anchor.midPriceUsd} />
        </section>

        <section className="card" data-testid="market-pool">
          <h2>Pool</h2>
          <Row k="Pool id" v={datumText(snap.poolId, short)} />
          <Row
            k="Pool status"
            v={datumText(snap.poolStatus, (s) => (s === 2 ? "2 (Locked)" : String(s)))}
          />
          <Row k="Fee preset" v={datumText(snap.feePreset)} />
          <Row k="Exact pool fee units" v={datumText(snap.exactPoolFeeUnits)} />
          <Row k="Creator" v={datumText(snap.creator, short)} />
          <Row k="Token URI" v={datumText(snap.tokenUri)} />
          <Row
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
                AWAITING
              )
            }
          />
        </section>

        <section className="card" data-testid="market-beneficiaries">
          <h2>Beneficiaries</h2>
          {snap.beneficiaries.available ? (
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Address</th>
                    <th>Percent</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.beneficiaries.value.map((b) => (
                    <tr key={`${b.beneficiary}-${b.label}`}>
                      <td>{b.label}</td>
                      <td style={{ wordBreak: "break-all" }}>{b.beneficiary}</td>
                      <td>{b.percent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">{AWAITING}</p>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: "1rem" }} data-testid="price-chart-section">
        <h2>Price history</h2>
        <PriceChart address={snap.tokenAddress} tokenSymbol={snap.tokenSymbol} />
      </section>

      <section className="card" style={{ marginTop: "1rem" }} data-testid="trade-section">
        <h2>Trade</h2>
        <TradeCard
          address={snap.tokenAddress}
          tokenSymbol={snap.tokenSymbol}
          explorer={explorer}
          onTraded={handleTraded}
        />
        <p className="small muted" style={{ marginTop: "0.9rem" }}>
          <a
            href="https://matcha.xyz"
            target="_blank"
            rel="noreferrer"
            className="small muted"
            data-testid="trade-external"
          >
            Advanced: trade on Matcha ↗
          </a>{" "}
          — external aggregator not operated by BPS; verify the token address yourself.
        </p>
      </section>

      <p className="small muted" style={{ marginTop: "1rem" }}>
        Snapshot fetched {new Date(snap.fetchedAt).toISOString()}
      </p>
    </main>
  );
}
