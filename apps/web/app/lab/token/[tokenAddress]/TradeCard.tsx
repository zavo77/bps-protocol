"use client";
// Embedded bidirectional trading card for a lab market. Two-step, wallet-signed:
//   1. Get quote  → server returns executable route(s) (BPS Direct + optional 0x)
//   2. Trade      → sign prepare-trade, run any approvals, then send the swap tx
// Everything is honest about state: quoting, no-route, wrong chain, insufficient
// balance, signing, pending, success (with a Blockscout receipt link) and safe
// error messages. A disconnected wallet can never reach a signature. Restyled to
// the Claude Design V4 lab system; the trade button is the ONE primary action.
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

/** Selected-pill styling built on .lab-pill (no active variant exists in the CSS). */
function pillStyle(active: boolean): React.CSSProperties {
  return active
    ? { background: "var(--deep-ink)", color: "var(--warm-white)", borderColor: "var(--deep-ink)" }
    : {};
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

  return (
    <div data-testid="trade-card">
      {/* Buy / Sell tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }} role="tablist">
        {(["buy", "sell"] as TradeSide[]).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={side === s}
            data-testid={`tab-${s}`}
            onClick={() => trade.setSide(s)}
            className="lab-btn lab-btn--ghost"
            style={{
              flex: 1,
              ...(side === s
                ? {
                    background: "var(--deep-ink)",
                    color: "var(--warm-white)",
                    borderColor: "var(--deep-ink)",
                  }
                : {}),
            }}
          >
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      {/* Connected-wallet balance for the relevant (sell) token */}
      <div className="lab-kv">
        <span>{sellSymbol} balance</span>
        <span className="lab-data" data-testid="wallet-balance">
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
        className="lab-label"
        htmlFor="trade-amount"
        style={{ display: "block", margin: "14px 0 6px" }}
      >
        Amount ({sellSymbol})
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          id="trade-amount"
          data-testid="trade-amount"
          className="lab-field"
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          disabled={!isConnected || busy}
          onChange={(e) => trade.setAmount(e.target.value)}
          style={{ flex: 1, fontVariantNumeric: "tabular-nums" }}
        />
        {!isBuy && (
          <button
            type="button"
            data-testid="trade-max"
            className="lab-btn lab-btn--ghost"
            disabled={!isConnected || busy}
            onClick={() => void trade.setMaxSell()}
          >
            Max
          </button>
        )}
      </div>
      {!isBuy && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {[25, 50, 75].map((pct) => (
            <button
              key={pct}
              type="button"
              data-testid={`trade-pct-${pct}`}
              className="lab-btn lab-btn--ghost"
              disabled={!isConnected || busy}
              onClick={() => void trade.setSellFraction(pct)}
              style={{ flex: 1 }}
            >
              {pct}%
            </button>
          ))}
        </div>
      )}

      {/* Slippage presets + custom */}
      <div style={{ marginTop: 14 }}>
        <span className="lab-label">Max slippage</span>
        <div
          style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}
        >
          {SLIPPAGE_PRESETS.map((p) => (
            <button
              key={p.bps}
              type="button"
              data-testid={`slippage-${p.bps}`}
              aria-pressed={slippageBps === p.bps}
              disabled={busy}
              onClick={() => trade.setSlippageBps(p.bps)}
              className="lab-pill"
              style={{ cursor: "pointer", ...pillStyle(slippageBps === p.bps) }}
            >
              {p.label}
            </button>
          ))}
          <label
            className="lab-muted"
            style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}
          >
            Custom
            <input
              data-testid="slippage-custom"
              className="lab-field"
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
              style={{ width: "5rem", minHeight: 36, padding: "4px 8px" }}
            />
            %
          </label>
        </div>
      </div>

      {/* Quote result */}
      {selectedRoute && (
        <div style={{ marginTop: 14 }} data-testid="quote-result">
          <div className="lab-kv">
            <span>Expected output</span>
            <span className="lab-data" data-testid="expected-output">
              {fmt(selectedRoute.buyAmount)} {outputSymbol}
            </span>
          </div>
          <div className="lab-kv">
            <span>Minimum received</span>
            <span className="lab-data" data-testid="minimum-received">
              {fmt(selectedRoute.minimumBuyAmount)} {outputSymbol}
            </span>
          </div>
          <div className="lab-kv">
            <span>Price impact</span>
            <span
              className="lab-data"
              data-testid="price-impact"
              style={highImpact ? { color: "var(--bad)", fontWeight: 700 } : undefined}
            >
              {impactBps === null ? "—" : `${(impactBps / 100).toFixed(2)}%`}
              {highImpact ? " ⚠" : ""}
            </span>
          </div>
          <div className="lab-kv">
            <span>Pool fee</span>
            <span className="lab-data" data-testid="pool-fee">
              {selectedRoute.poolFee === null
                ? "—"
                : `${(selectedRoute.poolFee / 10_000).toFixed(2)}%`}
            </span>
          </div>
          <div className="lab-kv">
            <span>Route</span>
            <span className="lab-data" data-testid="selected-route">
              {selectedRoute.routeLabel}
            </span>
          </div>

          {/* Route switch when more than one executable route exists — collapsed. */}
          {routes.length > 1 && (
            <details className="lab-disclosure" style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer" }}>Routing options ({routes.length})</summary>
              <div
                style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}
                data-testid="route-switch"
              >
                {routes.map((r) => (
                  <button
                    key={r.routeId}
                    type="button"
                    data-testid={`route-${r.routeId}`}
                    aria-pressed={selectedRouteId === r.routeId}
                    onClick={() => trade.selectRoute(r.routeId)}
                    className="lab-pill"
                    style={{ cursor: "pointer", ...pillStyle(selectedRouteId === r.routeId) }}
                  >
                    {r.routeLabel} · {fmt(r.buyAmount)}
                  </button>
                ))}
              </div>
            </details>
          )}

          {selectedRoute.warnings.length > 0 && (
            <ul data-testid="route-warnings" style={{ margin: "8px 0 0", paddingLeft: "1.1rem" }}>
              {selectedRoute.warnings.map((w) => (
                <li key={w} style={{ color: "var(--warn)", fontSize: 13 }}>
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ marginTop: 16 }}>
        {!isConnected ? (
          <p className="lab-muted" data-testid="trade-connect" style={{ fontSize: 13 }}>
            Connect a wallet to trade. Nothing is signed while disconnected.
          </p>
        ) : wrongChain ? (
          <button
            type="button"
            data-testid="switch-chain"
            onClick={() => void trade.switchToChain()}
            className="lab-btn lab-btn--primary"
            style={{ width: "100%" }}
          >
            Switch to Robinhood Chain (4663)
          </button>
        ) : (
          <>
            <button
              type="button"
              data-testid="quote-button"
              className="lab-btn lab-btn--ghost"
              style={{ width: "100%" }}
              disabled={busy || amountWei <= 0n}
              onClick={() => void trade.quote()}
            >
              {status === "quoting" ? "Quoting…" : selectedRoute ? "Refresh quote" : "Get quote"}
            </button>
            <button
              type="button"
              data-testid="trade-button"
              className="lab-btn lab-btn--primary"
              style={{ width: "100%", marginTop: 8 }}
              disabled={busy || !selectedRoute || insufficient || amountWei <= 0n}
              onClick={() => void trade.prepareAndTrade()}
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
    <div style={{ marginTop: 10 }}>
      {insufficient && (
        <p
          data-testid="insufficient-balance"
          style={{ color: "var(--bad)", fontSize: 13, margin: 0 }}
        >
          Wallet balance is below the trade amount.
        </p>
      )}
      {status === "no-route" && (
        <p data-testid="no-route" style={{ color: "var(--warn)", fontSize: 13, margin: 0 }}>
          No Launch Lab route is available for this market.
        </p>
      )}
      {(status === "needs-approval" || status === "approving") && (
        <p className="lab-muted" data-testid="approval-state" style={{ fontSize: 13, margin: 0 }}>
          Approving token allowance in your wallet…
        </p>
      )}
      {status === "awaiting-signature" && (
        <p className="lab-muted" data-testid="signing-state" style={{ fontSize: 13, margin: 0 }}>
          Waiting for your wallet signature…
        </p>
      )}
      {status === "pending" && (
        <p className="lab-muted" data-testid="pending-state" style={{ fontSize: 13, margin: 0 }}>
          Transaction submitted; awaiting confirmation…
        </p>
      )}
      {status === "success" && txHash && (
        <p data-testid="trade-success" style={{ color: "var(--good)", fontSize: 13, margin: 0 }}>
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
        <p data-testid="trade-error" style={{ color: "var(--bad)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}
      {status !== "failure" && status !== "success" && !insufficient && error && (
        <p data-testid="trade-note" style={{ color: "var(--warn)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
