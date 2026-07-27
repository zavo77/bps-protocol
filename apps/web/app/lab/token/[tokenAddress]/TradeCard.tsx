"use client";
// Embedded bidirectional trading card for a lab market.
//
// Users pay/receive ETH / WETH / USDG — the market's RWA anchor is INTERNAL
// routing detail and appears only as an "advanced" pay/receive option and inside
// the collapsed route breakdown. Two-step, wallet-signed:
//   1. Get quote  → server returns an executable route (one-step 0x, or composed
//                   via the anchor, or advanced direct-anchor)
//   2. Trade      → sign prepare-leg, run any approvals, send each leg in order
//
// Everything is honest: quoting, no-route, wrong chain, insufficient balance,
// signing, per-leg pending, success (with a Blockscout receipt link per leg).
// A disconnected wallet can never reach a signature. When the route is composed
// the card NEVER claims atomicity — it states plainly it takes N wallet actions.
// Styled to the lab design system; the trade/switch button is the ONE primary action.
import { formatUnits } from "viem";
import { EXPLORER_BASE_URL } from "@bps/launch-lab";
import { PRICE_IMPACT_WARN_BPS, useTrade, type TradeSide } from "../../../../hooks/lab";
import type { TradeToken } from "../../../../hooks/lab/use-trade";

const SLIPPAGE_PRESETS: { label: string; bps: number }[] = [
  { label: "0.5%", bps: 50 },
  { label: "1%", bps: 100 },
  { label: "3%", bps: 300 },
];

function fmt(wei: string | bigint, decimals: number): string {
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

/** A row of pay/receive token pills. The anchor sits under an "advanced" toggle. */
function PayTokenSelector({
  tokens,
  anchor,
  selected,
  disabled,
  onSelect,
  testid,
}: {
  tokens: TradeToken[];
  anchor: TradeToken | null;
  selected: TradeToken;
  disabled: boolean;
  onSelect: (t: TradeToken) => void;
  testid: string;
}) {
  return (
    <div data-testid={testid}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {tokens.map((t) => (
          <button
            key={t.symbol}
            type="button"
            data-testid={`paytoken-${t.symbol}`}
            aria-pressed={selected.address === t.address}
            disabled={disabled}
            onClick={() => onSelect(t)}
            className="lab-pill"
            style={{ cursor: "pointer", ...pillStyle(selected.address === t.address) }}
          >
            {t.symbol}
          </button>
        ))}
      </div>
      {anchor && (
        <details
          className="lab-disclosure"
          style={{ marginTop: 8 }}
          data-testid="paytoken-advanced"
        >
          <summary style={{ cursor: "pointer" }}>Advanced: route via the market anchor</summary>
          <p className="lab-muted" style={{ fontSize: 12, margin: "8px 0" }}>
            {anchor.symbol} is the market&apos;s internal anchor asset. Most users pay and receive
            ETH, WETH, or USDG.
          </p>
          <button
            type="button"
            data-testid={`paytoken-${anchor.symbol}`}
            aria-pressed={selected.address === anchor.address}
            disabled={disabled}
            onClick={() => onSelect(anchor)}
            className="lab-pill"
            style={{ cursor: "pointer", ...pillStyle(selected.address === anchor.address) }}
          >
            {anchor.symbol}
          </button>
        </details>
      )}
    </div>
  );
}

export function TradeCard({
  address,
  tokenSymbol = "token",
  explorer = EXPLORER_BASE_URL,
  anchorSymbol,
  anchorAddress,
  anchorDecimals = 18,
  onTraded,
}: {
  address: string;
  tokenSymbol?: string;
  explorer?: string;
  anchorSymbol?: string;
  anchorAddress?: string;
  anchorDecimals?: number;
  onTraded?: () => void;
}) {
  const anchor =
    anchorSymbol && anchorAddress
      ? { symbol: anchorSymbol, address: anchorAddress as `0x${string}`, decimals: anchorDecimals }
      : null;
  const trade = useTrade(address, { onTraded, anchor, marketSymbol: tokenSymbol });

  const {
    side,
    amount,
    slippageBps,
    status,
    quote,
    txHash,
    legHashes,
    legIndex,
    legCount,
    error,
    isConnected,
    wrongChain,
    amountWei,
    payTokens,
    anchorToken,
    payToken,
    inputDecimals,
    outputDecimals,
    inputBalanceWei,
    insufficient,
    pendingRecovery,
    pendingPrompt,
    pendingExpired,
  } = trade;

  const isBuy = side === "buy";
  // Input asset: buy pays the pay token; sell sells the launched token.
  const inputSymbol = isBuy ? payToken.symbol : tokenSymbol;
  const outputSymbol = isBuy ? tokenSymbol : payToken.symbol;

  const busy =
    status === "quoting" ||
    status === "needs-approval" ||
    status === "approving" ||
    status === "simulating" ||
    status === "awaiting-signature" ||
    status === "pending";

  const impactBps = quote?.totalPriceImpactBps ?? null;
  const highImpact = impactBps !== null && impactBps >= PRICE_IMPACT_WARN_BPS;
  const composed = quote?.routeKind === "composed";
  const multiStep = (quote?.walletActionCount ?? 1) > 1;

  return (
    <div data-testid="trade-card">
      {/* Composed-trade recovery: the first leg confirmed but the second is still
          outstanding (failed, interrupted, or the page reloaded). Honest and NEVER
          auto-run — the user explicitly resumes or cancels (keeping the anchor). */}
      {pendingRecovery && pendingPrompt && !busy && (
        <div
          data-testid="recovery-banner"
          className="lab-card lab-card--nested"
          style={{
            marginBottom: 16,
            background: "var(--warn-bg)",
            borderColor: "var(--warn-border)",
          }}
        >
          <p className="lab-label" data-testid="recovery-heading" style={{ color: "var(--warn)" }}>
            {pendingPrompt.heading}
          </p>
          <p className="lab-muted" style={{ fontSize: 13, margin: "8px 0", lineHeight: 1.5 }}>
            Your first step confirmed on-chain. This trade takes a second wallet action to finish —
            it will not run on its own.{" "}
            {pendingExpired
              ? "The earlier quote expired, so the second step is re-priced fresh before you sign."
              : ""}
          </p>
          <p style={{ margin: "0 0 10px" }}>
            <a
              href={`${explorer}/tx/${pendingRecovery.completedLegTxHash}`}
              target="_blank"
              rel="noreferrer"
              data-testid="recovery-leg1-link"
            >
              First step receipt ↗
            </a>
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              data-testid="recovery-resume"
              className="lab-btn lab-btn--primary"
              onClick={() => void trade.resumePendingTrade()}
            >
              {pendingPrompt.action}
            </button>
            <button
              type="button"
              data-testid="recovery-cancel"
              className="lab-btn lab-btn--ghost"
              onClick={() => trade.cancelPendingTrade()}
            >
              Cancel and keep {pendingRecovery.anchorSymbol}
            </button>
          </div>
        </div>
      )}

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

      {/* -------- INPUT (You pay / You sell) -------- */}
      <label
        className="lab-label"
        htmlFor="trade-amount"
        data-testid="amount-field-label"
        style={{ display: "block", margin: "4px 0 6px" }}
      >
        {isBuy ? "You pay" : `You sell (${tokenSymbol})`}
      </label>

      {isBuy && (
        <div style={{ marginBottom: 8 }}>
          <PayTokenSelector
            tokens={payTokens}
            anchor={anchorToken}
            selected={payToken}
            disabled={!isConnected || busy}
            onSelect={trade.setPayToken}
            testid="pay-selector"
          />
        </div>
      )}

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
          aria-label={isBuy ? "Amount to pay" : `Amount of ${tokenSymbol} to sell`}
        />
        <button
          type="button"
          data-testid="trade-max"
          className="lab-btn lab-btn--ghost"
          disabled={!isConnected || busy}
          onClick={() => void trade.setMax()}
        >
          Max
        </button>
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
              onClick={() => void trade.setInputFraction(pct)}
              style={{ flex: 1 }}
            >
              {pct}%
            </button>
          ))}
        </div>
      )}

      {/* Connected-wallet balance for the input asset */}
      <div className="lab-kv" style={{ marginTop: 8 }}>
        <span>{inputSymbol} balance</span>
        <span className="lab-data" data-testid="wallet-balance">
          {!isConnected
            ? "—"
            : inputBalanceWei !== null
              ? fmt(inputBalanceWei, inputDecimals)
              : "…"}
        </span>
      </div>

      {/* -------- OUTPUT (You receive) -------- */}
      <div style={{ marginTop: 16 }}>
        <span className="lab-label">You receive</span>
        {isBuy ? (
          <div
            className="lab-field"
            data-testid="receive-readonly"
            style={{ display: "flex", alignItems: "center", marginTop: 6, minHeight: 44 }}
          >
            {tokenSymbol}
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            <PayTokenSelector
              tokens={payTokens}
              anchor={anchorToken}
              selected={payToken}
              disabled={!isConnected || busy}
              onSelect={trade.setPayToken}
              testid="receive-selector"
            />
          </div>
        )}
      </div>

      {/* Slippage presets + custom */}
      <div style={{ marginTop: 16 }}>
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
      {quote && (
        <div style={{ marginTop: 16 }} data-testid="quote-result">
          <div className="lab-kv">
            <span>Expected output</span>
            <span className="lab-data" data-testid="expected-output">
              {fmt(quote.expectedFinalOutputWei, outputDecimals)} {outputSymbol}
            </span>
          </div>
          <div className="lab-kv">
            <span>Minimum received</span>
            <span className="lab-data" data-testid="minimum-received">
              {fmt(quote.minimumFinalOutputWei, outputDecimals)} {outputSymbol}
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
              {quote.poolFeeUnits === null ? "—" : `${(quote.poolFeeUnits / 10_000).toFixed(2)}%`}
            </span>
          </div>
          {quote.zeroExFeeNote && (
            <div className="lab-kv">
              <span>0x fee</span>
              <span className="lab-data" data-testid="zeroex-fee-note">
                {quote.zeroExFeeNote}
              </span>
            </div>
          )}

          {/* Route/legs live ONLY inside this collapsed disclosure. The summary is
              always visible and states the step count honestly — never atomic when
              the route is composed. */}
          <details className="lab-disclosure" style={{ marginTop: 10 }} data-testid="route-details">
            <summary style={{ cursor: "pointer" }} data-testid="route-summary">
              Route details —{" "}
              {multiStep
                ? `${quote.walletActionCount} steps (via ${quote.anchorSymbol}), not one-click`
                : quote.routeKind === "direct-anchor"
                  ? `direct via ${quote.anchorSymbol}`
                  : "1 step (single transaction)"}
            </summary>
            <div style={{ marginTop: 8 }} data-testid="route-legs">
              {multiStep && (
                <p style={{ color: "var(--warn)", fontSize: 13, margin: "0 0 8px" }}>
                  This trade routes via {quote.anchorSymbol} and takes {quote.walletActionCount}{" "}
                  separate wallet actions — it is not a single one-click swap.
                </p>
              )}
              <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
                {quote.legs.map((leg, i) => (
                  <li key={`${leg.label}-${i}`} style={{ fontSize: 13, marginBottom: 4 }}>
                    {leg.label}
                    {leg.estimated ? " (estimated until the prior step confirms)" : ""}
                  </li>
                ))}
              </ol>
            </div>
          </details>

          {quote.warnings.length > 0 && (
            <ul data-testid="route-warnings" style={{ margin: "8px 0 0", paddingLeft: "1.1rem" }}>
              {quote.warnings.map((w) => (
                <li key={w} style={{ color: "var(--warn)", fontSize: 13 }}>
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Actions — exactly ONE primary button (trade, or switch when wrong chain). */}
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
              onClick={() => void trade.getQuote()}
            >
              {status === "quoting" ? "Quoting…" : quote ? "Refresh quote" : "Get quote"}
            </button>
            <button
              type="button"
              data-testid="trade-button"
              className="lab-btn lab-btn--primary"
              style={{ width: "100%", marginTop: 8 }}
              disabled={busy || !quote || insufficient || amountWei <= 0n}
              onClick={() => void trade.prepareAndTrade()}
            >
              {tradeButtonLabel(status, isBuy, insufficient, composed, legIndex, legCount)}
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
        legHashes={legHashes}
        legIndex={legIndex}
        legCount={legCount}
        explorer={explorer}
      />
    </div>
  );
}

function tradeButtonLabel(
  status: string,
  isBuy: boolean,
  insufficient: boolean,
  composed: boolean,
  legIndex: number,
  legCount: number,
): string {
  if (insufficient) return "Insufficient balance";
  switch (status) {
    case "needs-approval":
    case "approving":
      return "Approving…";
    case "simulating":
      return "Preparing…";
    case "awaiting-signature":
      return "Confirm in wallet…";
    case "pending":
      return legCount > 1 ? `Step ${legIndex}/${legCount} pending…` : "Pending confirmation…";
    case "success":
      return "Traded";
    default:
      if (composed) return isBuy ? "Buy (2 steps)" : "Sell (2 steps)";
      return isBuy ? "Buy" : "Sell";
  }
}

function StatusLine({
  status,
  insufficient,
  error,
  txHash,
  legHashes,
  legIndex,
  legCount,
  explorer,
}: {
  status: string;
  insufficient: boolean;
  error: string | null;
  txHash: string | null;
  legHashes: string[];
  legIndex: number;
  legCount: number;
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
          No Launch Lab route is available for this pay/receive asset.
        </p>
      )}
      {(status === "needs-approval" || status === "approving") && (
        <p className="lab-muted" data-testid="approval-state" style={{ fontSize: 13, margin: 0 }}>
          Approving token allowance in your wallet…
        </p>
      )}
      {status === "simulating" && (
        <p className="lab-muted" data-testid="simulating-state" style={{ fontSize: 13, margin: 0 }}>
          Preparing and simulating the transaction…
        </p>
      )}
      {status === "awaiting-signature" && (
        <p className="lab-muted" data-testid="signing-state" style={{ fontSize: 13, margin: 0 }}>
          Waiting for your wallet signature…
        </p>
      )}
      {status === "pending" && (
        <p className="lab-muted" data-testid="pending-state" style={{ fontSize: 13, margin: 0 }}>
          {legCount > 1
            ? `Step ${legIndex} of ${legCount} submitted; awaiting confirmation…`
            : "Transaction submitted; awaiting confirmation…"}
        </p>
      )}
      {status === "success" && (
        <div data-testid="trade-success" style={{ color: "var(--good)", fontSize: 13 }}>
          <p style={{ margin: 0 }}>Trade confirmed.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
            {legHashes.map((h, i) => (
              <a
                key={h}
                href={`${explorer}/tx/${h}`}
                target="_blank"
                rel="noreferrer"
                data-testid={`trade-tx-link-${i}`}
              >
                {legHashes.length > 1 ? `Step ${i + 1} receipt ↗` : "View receipt ↗"}
              </a>
            ))}
            {legHashes.length === 0 && txHash && (
              <a
                href={`${explorer}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                data-testid="trade-tx-link-0"
              >
                View receipt ↗
              </a>
            )}
          </div>
        </div>
      )}
      {status === "failure" && error && (
        <p data-testid="trade-error" style={{ color: "var(--bad)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}
      {status !== "failure" &&
        status !== "success" &&
        status !== "no-route" &&
        !insufficient &&
        error && (
          <p data-testid="trade-note" style={{ color: "var(--warn)", fontSize: 13, margin: 0 }}>
            {error}
          </p>
        )}
    </div>
  );
}
