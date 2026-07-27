"use client";
// Embedded bidirectional trading card for a lab market. Two-step, wallet-signed:
//   1. Get quote  → server returns executable route(s) (BPS Direct + optional 0x)
//   2. Trade      → sign prepare-trade, run any approvals, then send the swap tx
// Everything is honest about state: quoting, no-route, wrong chain, insufficient
// balance, signing, pending, success (with a Blockscout receipt link) and safe
// error messages. A disconnected wallet can never reach a signature.
import { formatUnits } from "viem";
import { EXPLORER_BASE_URL } from "@bps/launch-lab";
import {
  PRICE_IMPACT_WARN_BPS,
  TRADE_DECIMALS,
  useTokenBalances,
  useTrade,
  type TradeSide,
} from "../../../../hooks/lab";

const SLIPPAGE_PRESETS: { label: string; bps: number }[] = [
  { label: "0.5%", bps: 50 },
  { label: "1%", bps: 100 },
  { label: "3%", bps: 300 },
];

function fmt(wei: string | bigint, decimals = TRADE_DECIMALS): string {
  try {
    return formatUnits(typeof wei === "bigint" ? wei : BigInt(wei), decimals);
  } catch {
    return "—";
  }
}

export function TradeCard({
  address,
  tokenSymbol = "token",
  explorer = EXPLORER_BASE_URL,
  onTraded,
}: {
  address: string;
  tokenSymbol?: string;
  explorer?: string;
  onTraded?: () => void;
}) {
  const trade = useTrade(address, onTraded);
  const balances = useTokenBalances(address);

  const {
    side,
    amount,
    slippageBps,
    status,
    routes,
    selectedRoute,
    selectedRouteId,
    txHash,
    error,
    isConnected,
    wrongChain,
    amountWei,
  } = trade;

  const isBuy = side === "buy";
  // Buy spends GOOGL; sell spends the launch token.
  const sellBalance = isBuy ? balances.googl : balances.token;
  const sellSymbol = isBuy ? "GOOGL" : tokenSymbol;
  const outputSymbol = isBuy ? tokenSymbol : "GOOGL";

  const insufficient = sellBalance !== null && amountWei > 0n && amountWei > sellBalance.balance;

  const busy =
    status === "quoting" ||
    status === "needs-approval" ||
    status === "approving" ||
    status === "simulating" ||
    status === "awaiting-signature" ||
    status === "pending";

  const impactBps = selectedRoute?.priceImpactBps ?? null;
  const highImpact = impactBps !== null && impactBps >= PRICE_IMPACT_WARN_BPS;

  function tabStyle(active: boolean): React.CSSProperties {
    return {
      flex: 1,
      padding: "0.5rem",
      fontWeight: 700,
      cursor: "pointer",
      border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
      background: active ? "color-mix(in srgb, var(--accent) 18%, var(--panel))" : "var(--panel-2)",
      color: active ? "var(--text)" : "var(--muted)",
      borderRadius: "8px",
    };
  }

  return (
    <div data-testid="trade-card">
      {/* Buy / Sell tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }} role="tablist">
        {(["buy", "sell"] as TradeSide[]).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={side === s}
            data-testid={`tab-${s}`}
            onClick={() => trade.setSide(s)}
            style={tabStyle(side === s)}
          >
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      {/* Connected-wallet balance for the relevant (sell) token */}
      <div className="kv">
        <span className="k">{sellSymbol} balance</span>
        <span className="v" data-testid="wallet-balance">
          {!isConnected
            ? "—"
            : sellBalance
              ? fmt(sellBalance.balance, sellBalance.decimals)
              : balances.isLoading
                ? "…"
                : "—"}
        </span>
      </div>

      {/* Amount + max / fraction shortcuts (sell only) */}
      <label
        className="small muted"
        htmlFor="trade-amount"
        style={{ display: "block", marginTop: "0.6rem" }}
      >
        Amount ({sellSymbol})
      </label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          id="trade-amount"
          data-testid="trade-amount"
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          disabled={!isConnected || busy}
          onChange={(e) => trade.setAmount(e.target.value)}
          style={{
            flex: 1,
            padding: "0.5rem",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            background: "var(--panel-2)",
            color: "var(--text)",
            fontVariantNumeric: "tabular-nums",
          }}
        />
        {!isBuy && (
          <button
            type="button"
            data-testid="trade-max"
            disabled={!isConnected || busy}
            onClick={() => void trade.setMaxSell()}
            style={secondaryBtn}
          >
            Max
          </button>
        )}
      </div>
      {!isBuy && (
        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
          {[25, 50, 75].map((pct) => (
            <button
              key={pct}
              type="button"
              data-testid={`trade-pct-${pct}`}
              disabled={!isConnected || busy}
              onClick={() => void trade.setSellFraction(pct)}
              style={{ ...secondaryBtn, flex: 1 }}
            >
              {pct}%
            </button>
          ))}
        </div>
      )}

      {/* Slippage presets + custom */}
      <div style={{ marginTop: "0.75rem" }}>
        <span className="small muted">Max slippage</span>
        <div
          style={{
            display: "flex",
            gap: "0.4rem",
            marginTop: "0.3rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {SLIPPAGE_PRESETS.map((p) => (
            <button
              key={p.bps}
              type="button"
              data-testid={`slippage-${p.bps}`}
              aria-pressed={slippageBps === p.bps}
              disabled={busy}
              onClick={() => trade.setSlippageBps(p.bps)}
              style={pillBtn(slippageBps === p.bps)}
            >
              {p.label}
            </button>
          ))}
          <label
            className="small muted"
            style={{ display: "inline-flex", gap: "0.3rem", alignItems: "center" }}
          >
            Custom
            <input
              data-testid="slippage-custom"
              type="number"
              min={0.01}
              max={50}
              step={0.01}
              disabled={busy}
              value={(slippageBps / 100).toString()}
              onChange={(e) => {
                const pct = Number(e.target.value);
                if (Number.isFinite(pct)) {
                  trade.setSlippageBps(Math.max(1, Math.min(5000, Math.round(pct * 100))));
                }
              }}
              style={{
                width: "4.5rem",
                padding: "0.3rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "var(--panel-2)",
                color: "var(--text)",
              }}
            />
            %
          </label>
        </div>
      </div>

      {/* Quote result */}
      {selectedRoute && (
        <div style={{ marginTop: "0.9rem" }} data-testid="quote-result">
          <div className="kv">
            <span className="k">Expected output</span>
            <span className="v" data-testid="expected-output">
              {fmt(selectedRoute.buyAmount)} {outputSymbol}
            </span>
          </div>
          <div className="kv">
            <span className="k">Minimum received</span>
            <span className="v" data-testid="minimum-received">
              {fmt(selectedRoute.minimumBuyAmount)} {outputSymbol}
            </span>
          </div>
          <div className="kv">
            <span className="k">Price impact</span>
            <span
              className="v"
              data-testid="price-impact"
              style={highImpact ? { color: "var(--bad)", fontWeight: 700 } : undefined}
            >
              {impactBps === null ? "—" : `${(impactBps / 100).toFixed(2)}%`}
              {highImpact ? " ⚠" : ""}
            </span>
          </div>
          <div className="kv">
            <span className="k">Pool fee</span>
            <span className="v" data-testid="pool-fee">
              {selectedRoute.poolFee === null
                ? "—"
                : `${(selectedRoute.poolFee / 10_000).toFixed(2)}%`}
            </span>
          </div>
          <div className="kv">
            <span className="k">Route</span>
            <span className="v" data-testid="selected-route">
              {selectedRoute.routeLabel}
            </span>
          </div>

          {/* Route switch when more than one executable route exists */}
          {routes.length > 1 && (
            <div
              style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem", flexWrap: "wrap" }}
              data-testid="route-switch"
            >
              {routes.map((r) => (
                <button
                  key={r.routeId}
                  type="button"
                  data-testid={`route-${r.routeId}`}
                  aria-pressed={selectedRouteId === r.routeId}
                  onClick={() => trade.selectRoute(r.routeId)}
                  style={pillBtn(selectedRouteId === r.routeId)}
                >
                  {r.routeLabel} · {fmt(r.buyAmount)}
                </button>
              ))}
            </div>
          )}

          {selectedRoute.warnings.length > 0 && (
            <ul className="blockers" data-testid="route-warnings">
              {selectedRoute.warnings.map((w) => (
                <li key={w} style={{ color: "var(--warn)" }}>
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ marginTop: "1rem" }}>
        {!isConnected ? (
          <p className="small muted" data-testid="trade-connect">
            Connect a wallet to trade. Nothing is signed while disconnected.
          </p>
        ) : wrongChain ? (
          <button
            type="button"
            data-testid="switch-chain"
            onClick={() => void trade.switchToChain()}
            style={primaryBtn}
          >
            Switch to Robinhood Chain (4663)
          </button>
        ) : (
          <>
            <button
              type="button"
              data-testid="quote-button"
              disabled={busy || amountWei <= 0n}
              onClick={() => void trade.quote()}
              style={secondaryBtn}
            >
              {status === "quoting" ? "Quoting…" : selectedRoute ? "Refresh quote" : "Get quote"}
            </button>
            <button
              type="button"
              data-testid="trade-button"
              disabled={busy || !selectedRoute || insufficient || amountWei <= 0n}
              onClick={() => void trade.prepareAndTrade()}
              style={{ ...primaryBtn, marginTop: "0.5rem" }}
            >
              {tradeButtonLabel(status, isBuy, insufficient)}
            </button>
          </>
        )}
      </div>

      {/* Explicit state / status line */}
      <StatusLine
        status={status}
        insufficient={insufficient}
        error={error}
        txHash={txHash}
        explorer={explorer}
      />
    </div>
  );
}

function tradeButtonLabel(status: string, isBuy: boolean, insufficient: boolean): string {
  if (insufficient) return "Insufficient balance";
  switch (status) {
    case "needs-approval":
    case "approving":
      return "Approving…";
    case "simulating":
      return "Simulating…";
    case "awaiting-signature":
      return "Confirm in wallet…";
    case "pending":
      return "Pending confirmation…";
    case "success":
      return "Traded";
    default:
      return isBuy ? "Buy" : "Sell";
  }
}

function StatusLine({
  status,
  insufficient,
  error,
  txHash,
  explorer,
}: {
  status: string;
  insufficient: boolean;
  error: string | null;
  txHash: string | null;
  explorer: string;
}) {
  return (
    <div style={{ marginTop: "0.6rem" }}>
      {insufficient && (
        <p className="small" data-testid="insufficient-balance" style={{ color: "var(--bad)" }}>
          Wallet balance is below the trade amount.
        </p>
      )}
      {status === "no-route" && (
        <p className="small" data-testid="no-route" style={{ color: "var(--warn)" }}>
          No Launch Lab route is available for this market.
        </p>
      )}
      {(status === "needs-approval" || status === "approving") && (
        <p className="small muted" data-testid="approval-state">
          Approving token allowance in your wallet…
        </p>
      )}
      {status === "awaiting-signature" && (
        <p className="small muted" data-testid="signing-state">
          Waiting for your wallet signature…
        </p>
      )}
      {status === "pending" && (
        <p className="small muted" data-testid="pending-state">
          Transaction submitted; awaiting confirmation…
        </p>
      )}
      {status === "success" && txHash && (
        <p className="small" data-testid="trade-success" style={{ color: "var(--good)" }}>
          Trade confirmed.{" "}
          <a
            href={`${explorer}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            data-testid="trade-tx-link"
          >
            View receipt ↗
          </a>
        </p>
      )}
      {status === "failure" && error && (
        <p className="small" data-testid="trade-error" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
      {status !== "failure" && status !== "success" && !insufficient && error && (
        <p className="small" data-testid="trade-note" style={{ color: "var(--warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.9rem",
  borderRadius: "8px",
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "#06121f",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.9rem",
  borderRadius: "8px",
  border: "1px solid var(--border)",
  background: "var(--panel-2)",
  color: "var(--text)",
  fontWeight: 600,
  cursor: "pointer",
};

function pillBtn(active: boolean): React.CSSProperties {
  return {
    fontSize: "0.78rem",
    padding: "0.25rem 0.6rem",
    borderRadius: "999px",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "color-mix(in srgb, var(--accent) 18%, var(--panel))" : "var(--panel-2)",
    color: active ? "var(--text)" : "var(--muted)",
    cursor: "pointer",
    fontWeight: 600,
  };
}
