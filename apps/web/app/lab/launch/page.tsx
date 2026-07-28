"use client";
// Launch Lab creation flow — Token → Pair → Launch, driven entirely by
// useCreateFlow. Every CreateFlowState enum value is renderable via
// FLOW_STATE_INFO, and walletState maps 1:1 onto the hook's WalletUiState. All
// validation / metadata upload / simulation / manifest / gating / signing logic
// is preserved unchanged; only presentation is restyled to the Claude Design V4
// system (app/lab/lab.css, scoped by .lab-root in the layout). No sample token
// identity, gas, block, or hash is prefilled — every value shown comes from real
// hook / manifest data. The print-token image appears only as an optional upload
// placeholder, never as a prefilled token.
import { useState, type ReactNode } from "react";
import { useSwitchChain } from "wagmi";
import {
  CHAIN_ID,
  EXPLORER_BASE_URL,
  SPLIT,
  type CreateFlowState,
  type FeePresetId,
  type LaunchManifest,
} from "@bps/launch-lab";
import { useCreateFlow } from "../../../hooks/lab";
import { ConnectWalletButton } from "../ConnectWalletButton";

const FLOW_STATE_INFO: Record<CreateFlowState, { label: string; detail: string }> = {
  "form-incomplete": {
    label: "Form incomplete",
    detail: "Fill in the token name, ticker, description, and image, then upload metadata.",
  },
  "form-invalid": {
    label: "Form invalid",
    detail: "Fix the validation errors shown next to the form fields.",
  },
  "image-uploading": {
    label: "Uploading metadata",
    detail: "Pinning the image and metadata JSON to IPFS via the production provider.",
  },
  "metadata-confirmed": {
    label: "Metadata confirmed",
    detail: "The token metadata is pinned on IPFS. Choose the pair and prepare the launch.",
  },
  "anchor-verifying": {
    label: "Verifying anchor",
    detail: "Fail-closed verification against the official Stock Token API is in progress.",
  },
  "anchor-verified": {
    label: "Anchor verified",
    detail: "The canonical anchor is verified. Ready to simulate the launch.",
  },
  "anchor-mismatch": {
    label: "Anchor mismatch",
    detail: "The anchor failed verification. Launching is blocked until it verifies.",
  },
  simulating: {
    label: "Simulating",
    detail: "The server is simulating the exact creation transaction and building the manifest.",
  },
  "simulation-success": {
    label: "Simulation succeeded",
    detail: "A prepared transaction exists. Complete the remaining launch gates to proceed.",
  },
  "simulation-failure": {
    label: "Simulation failed",
    detail: "The launch simulation failed. Review the error and prepare again.",
  },
  "broadcast-disabled": {
    label: "Broadcast disabled",
    detail: "Server configuration currently disables broadcasting launches.",
  },
  "kill-switch-active": {
    label: "Creation halted",
    detail:
      "Launch creation is switched off by the server (kill switch or disabled access mode). All launches are halted.",
  },
  "ready-to-launch": {
    label: "Ready to launch",
    detail: "Every gate passes. Launch sends the exact prepared transaction from your wallet.",
  },
  "awaiting-signature": {
    label: "Awaiting signature",
    detail: "Confirm the launch transaction in your wallet.",
  },
  "transaction-pending": {
    label: "Transaction pending",
    detail: "The launch transaction was broadcast and is awaiting inclusion in a block.",
  },
  "confirmation-pending": {
    label: "Confirmation pending",
    detail: "The transaction is included; collecting the confirmed receipt.",
  },
  "receipt-decoding": {
    label: "Decoding receipt",
    detail: "Decoding the launch receipt and verifying every fact against the manifest.",
  },
  "launch-success": {
    label: "Launch verified",
    detail: "The receipt matches the manifest. Redirecting to the market page.",
  },
  "launch-mismatch": {
    label: "LAUNCH MISMATCH — stopped",
    detail:
      "The on-chain result does not match the reviewed manifest. This flow is hard-stopped; do not retry without investigating.",
  },
};

/** Exact disabled-preset copy required by the design handoff. */
const DYNAMIC_PROTECTION_LABEL =
  "requires the decay initializer, not yet deployed on Robinhood Chain";

/** UI-only descriptions per preset (not fabricated data). */
const PRESET_DETAIL: Record<FeePresetId, string> = {
  BALANCED_1: "steady two-sided markets",
  CREATOR_2: "more of every swap streams to beneficiaries",
  DEGEN_3: "for high-velocity markets that expect heavy speculation",
  DYNAMIC_PROTECTION: DYNAMIC_PROTECTION_LABEL,
};

function short(v: string): string {
  return v.length > 14 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v;
}

/** A key/value row. Hashes/addresses/numeric data use the mono .lab-data style. */
function Row({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="lab-kv">
      <span>{k}</span>
      <span className={mono ? "lab-data" : undefined} style={{ textAlign: "right" }}>
        {v}
      </span>
    </div>
  );
}

function SubHead({ children }: { children: ReactNode }) {
  return (
    <div className="lab-label" style={{ margin: "22px 0 6px" }}>
      {children}
    </div>
  );
}

function Gate({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
      <span className={ok ? "lab-pill lab-pill--good" : "lab-pill lab-pill--bad"}>
        {ok ? "pass" : "blocked"}
      </span>
      <span style={{ fontSize: 14, color: "var(--charcoal)" }}>{label}</span>
    </li>
  );
}

const activePillStyle = {
  background: "var(--deep-ink)",
  color: "#fff",
  borderColor: "var(--deep-ink)",
} as const;

export default function LabCreatePage() {
  const flow = useCreateFlow();
  const { switchChain } = useSwitchChain();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [feeMode, setFeeMode] = useState<"connected" | "custom">("connected");

  const explorer = flow.config?.explorerBaseUrl ?? EXPLORER_BASE_URL;
  const anchors = flow.config?.anchors ?? [];
  const selectedAnchor = anchors.find((a) => a.symbol === flow.form.anchorSymbol);
  const info = FLOW_STATE_INFO[flow.flowState];
  const busy =
    flow.flowState === "image-uploading" ||
    flow.flowState === "simulating" ||
    flow.flowState === "awaiting-signature" ||
    flow.flowState === "transaction-pending" ||
    flow.flowState === "confirmation-pending" ||
    flow.flowState === "receipt-decoding";

  const disconnected = flow.walletState === "disconnected";
  const wrongChain = flow.walletState === "wrong-chain";

  const startingPriceUsd = (m: LaunchManifest): string => {
    const fdv = Number(m.startingFdvUsdFixed);
    if (!Number.isFinite(fdv)) return "—";
    return (fdv / 1_000_000_000).toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  };

  const selectFeeConnected = () => {
    setFeeMode("connected");
    flow.updateForm({ creatorFeeAddress: "" });
  };

  return (
    <main>
      <header style={{ marginBottom: 24 }}>
        <div className="lab-label">launch a market</div>
        <h1 className="lab-h1" style={{ marginTop: 12 }}>
          launch something <span className="lab-serif">permanent</span>
        </h1>
      </header>

      {/* Hidden state marker for tests/tooling only — never visible chrome. */}
      <span data-testid="wallet-state" style={{ display: "none" }}>
        {flow.walletState}
      </span>

      {/* ---- connect prompt (only while disconnected) ---- */}
      {disconnected ? (
        <section
          className="lab-card"
          style={{
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
          data-testid="wallet-hint"
        >
          <p className="lab-lead" style={{ fontSize: 15, margin: 0 }}>
            Connect your wallet to launch a market.
          </p>
          <ConnectWalletButton variant="inline" />
        </section>
      ) : null}
      {wrongChain ? (
        <section className="lab-card" style={{ marginBottom: 20 }}>
          <button
            className="lab-btn lab-btn--primary"
            onClick={() => switchChain({ chainId: CHAIN_ID })}
            data-testid="switch-chain"
          >
            Switch to Robinhood Chain ({CHAIN_ID})
          </button>
        </section>
      ) : null}
      {flow.unauthorised ? (
        <p className="lab-pill lab-pill--bad" style={{ marginBottom: 20 }} data-testid="unauthorised">
          This wallet is not eligible to create markets right now.
        </p>
      ) : null}

      {/* ---- compact stepper ---- */}
      <nav
        aria-label="Steps"
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 20,
          fontSize: 14,
        }}
      >
        {([1, 2, 3] as const).map((n, i) => {
          const labels = { 1: "Token", 2: "Pair", 3: "Review & launch" } as const;
          const enabled =
            n === 1 || (n === 2 && flow.metadata !== null) || (n === 3 && flow.bundle !== null);
          const active = step === n;
          const done = n < step;
          return (
            <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {i > 0 ? (
                <span aria-hidden style={{ color: "var(--peach-grey)", padding: "0 2px" }}>
                  —
                </span>
              ) : null}
              <button
                className="lab-pill"
                onClick={() => enabled && setStep(n)}
                disabled={!enabled || busy}
                aria-current={active ? "step" : undefined}
                style={{
                  cursor: enabled ? "pointer" : "default",
                  ...(active
                    ? activePillStyle
                    : done
                      ? {
                          background: "#fff",
                          borderColor: "var(--good-border)",
                          color: "var(--good)",
                        }
                      : {
                          background: "#fff",
                          borderColor: "var(--peach-grey)",
                          color: "var(--charcoal)",
                          opacity: 0.8,
                        }),
                }}
              >
                {done ? "✓ " : `${n} · `}
                {labels[n]}
              </button>
            </span>
          );
        })}
      </nav>

      {/* Errors surface inline, next to the work — no internal state chrome. */}
      {flow.error ? (
        <p
          className="lab-pill lab-pill--bad"
          style={{ marginBottom: 16 }}
          data-testid="flow-error"
        >
          {flow.error}
        </p>
      ) : null}

      {/* ---- step 1: token ---- */}
      {step === 1 ? (
        <section className="lab-card">
          <div className="lab-label">step 1 of 3</div>
          <h2 className="lab-h2" style={{ marginTop: 8 }}>
            the token
          </h2>

          {flow.metadata ? (
            <p
              className="lab-pill lab-pill--good"
              data-testid="metadata-confirmed"
              style={{ marginTop: 16 }}
            >
              metadata pinned: {flow.metadata.tokenUri} (provider: {flow.metadata.provider})
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 20 }}>
            <div style={{ flex: "0 0 200px" }}>
              <div className="lab-label" style={{ marginBottom: 10 }}>
                image
              </div>
              <div
                className="lab-card lab-card--nested"
                style={{
                  borderStyle: "dashed",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  textAlign: "center",
                }}
              >
                {flow.form.imageFile ? (
                  <span className="lab-data" style={{ fontSize: 12, wordBreak: "break-all" }}>
                    {flow.form.imageFile.name}
                  </span>
                ) : (
                  <img
                    src="/lab/print-token.png"
                    alt=""
                    width={84}
                    height={84}
                    style={{ opacity: 0.3, borderRadius: 16 }}
                  />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  data-testid="image-input"
                  onChange={(e) => flow.updateForm({ imageFile: e.target.files?.[0] ?? null })}
                  style={{ fontSize: 12, maxWidth: "100%" }}
                />
              </div>
              <p className="lab-muted" style={{ fontSize: 12, marginTop: 8 }}>
                PNG, JPEG, or WebP · max 4 MB. The image above is a placeholder only.
              </p>
            </div>

            <div style={{ flex: "1 1 300px", minWidth: 260, display: "grid", gap: 18 }}>
              <div>
                <label className="lab-label" htmlFor="lab-name">
                  name
                </label>
                <input
                  id="lab-name"
                  className="lab-field"
                  type="text"
                  value={flow.form.tokenName}
                  maxLength={48}
                  placeholder="what is this market called?"
                  data-testid="name-input"
                  onChange={(e) => flow.updateForm({ tokenName: e.target.value })}
                  style={{ marginTop: 8 }}
                />
              </div>
              <div>
                <label className="lab-label" htmlFor="lab-symbol">
                  ticker
                </label>
                <input
                  id="lab-symbol"
                  className="lab-field"
                  type="text"
                  value={flow.form.tokenSymbol}
                  maxLength={12}
                  placeholder="1–12 characters"
                  data-testid="symbol-input"
                  onChange={(e) => flow.updateForm({ tokenSymbol: e.target.value.toUpperCase() })}
                  style={{
                    marginTop: 8,
                    fontFamily: "var(--font-space-grotesk), sans-serif",
                    letterSpacing: "0.06em",
                  }}
                />
              </div>
              <div>
                <label className="lab-label" htmlFor="lab-desc">
                  description
                </label>
                <textarea
                  id="lab-desc"
                  className="lab-field"
                  value={flow.form.tokenDescription}
                  maxLength={600}
                  rows={4}
                  placeholder="one honest paragraph. what is this, who is it for?"
                  data-testid="description-input"
                  onChange={(e) => flow.updateForm({ tokenDescription: e.target.value })}
                  style={{ marginTop: 8, minHeight: "auto", resize: "vertical" }}
                />
              </div>
            </div>
          </div>

          {flow.formErrors.length > 0 ? (
            <ul
              data-testid="form-errors"
              style={{
                margin: "16px 0 0",
                paddingLeft: 0,
                listStyle: "none",
                display: "grid",
                gap: 6,
              }}
            >
              {flow.formErrors.map((err) => (
                <li key={err} className="lab-pill lab-pill--bad">
                  {err}
                </li>
              ))}
            </ul>
          ) : null}

          <label
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              margin: "20px 0 0",
              fontSize: 15,
              lineHeight: 1.5,
              color: "var(--charcoal)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={flow.form.termsAccepted}
              data-testid="terms-checkbox"
              onChange={(e) => flow.updateForm({ termsAccepted: e.target.checked })}
              style={{ width: 20, height: 20, marginTop: 1, accentColor: "var(--signal-orange)" }}
            />
            <span>
              I acknowledge this is an experimental, unaffiliated market platform and that launch
              configuration is irreversible.
            </span>
          </label>
          {!flow.form.termsAccepted ? (
            <p
              className="lab-muted"
              style={{ fontSize: 13, marginTop: 10 }}
              data-testid="terms-hint"
            >
              Check the acknowledgement above to continue.
            </p>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 14,
              borderTop: "1px solid var(--peach-grey)",
              marginTop: 22,
              paddingTop: 22,
              flexWrap: "wrap",
            }}
          >
            <button
              className="lab-btn lab-btn--primary"
              data-testid="upload-continue"
              disabled={
                disconnected ||
                busy ||
                !flow.formComplete ||
                flow.formErrors.length > 0 ||
                !flow.form.termsAccepted
              }
              onClick={async () => {
                if (flow.metadata) {
                  setStep(2);
                  return;
                }
                const ok = await flow.uploadMetadata();
                if (ok) setStep(2);
              }}
            >
              {flow.metadata ? "continue to market →" : "upload metadata & continue →"}
            </button>
          </div>
        </section>
      ) : null}

      {/* ---- step 2: pair ---- */}
      {step === 2 ? (
        <section className="lab-card" data-testid="pair-step">
          <div className="lab-label">step 2 of 3</div>
          <h2 className="lab-h2" style={{ marginTop: 8 }}>
            the market
          </h2>

          <SubHead>quote asset (anchor)</SubHead>
          <p className="lab-muted" style={{ fontSize: 14 }}>
            Choose the approved Stock Token your market is quoted in. This pairing is fixed
            permanently at launch.
          </p>
          <div
            className="lab-grid"
            data-testid="anchor-picker"
            role="radiogroup"
            aria-label="Anchor"
            style={{ marginTop: 12 }}
          >
            {anchors.map((a) => {
              const selected = flow.form.anchorSymbol === a.symbol;
              return (
                <label
                  key={a.symbol}
                  className="lab-card lab-card--nested"
                  data-testid={`anchor-choice-${a.symbol}`}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    cursor: "pointer",
                    ...(selected
                      ? {
                          borderColor: "var(--signal-orange)",
                          boxShadow: "inset 0 0 0 1px var(--signal-orange)",
                        }
                      : {}),
                  }}
                >
                  <input
                    type="radio"
                    name="anchor"
                    value={a.symbol}
                    checked={selected}
                    onChange={() => flow.updateForm({ anchorSymbol: a.symbol })}
                    style={{ accentColor: "var(--signal-orange)" }}
                  />
                  {a.logo ? (
                    <img
                      src={a.logo}
                      alt=""
                      width={28}
                      height={28}
                      style={{ borderRadius: "50%" }}
                    />
                  ) : null}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 700, color: "var(--deep-ink)", display: "block" }}>
                      {a.symbol}
                    </span>
                    <span className="lab-muted" style={{ fontSize: 12 }}>
                      {a.name}
                    </span>
                  </span>
                </label>
              );
            })}
            {anchors.length === 0 ? <p className="lab-await">loading approved anchors…</p> : null}
          </div>
          {selectedAnchor ? (
            <Row
              k="anchor address"
              v={
                <a
                  href={`${explorer}/address/${selectedAnchor.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {short(selectedAnchor.address)}
                </a>
              }
            />
          ) : null}

          <SubHead>fee destination</SubHead>
          <p className="lab-muted" style={{ fontSize: 14 }}>
            Where your creator share of LP fees is collected.
          </p>
          <label
            data-testid="fee-dest-connected"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              margin: "8px 0",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="feeDest"
              checked={feeMode === "connected"}
              onChange={selectFeeConnected}
              style={{ accentColor: "var(--signal-orange)" }}
            />
            Connected wallet (default)
          </label>
          <label
            data-testid="fee-dest-custom"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              margin: "8px 0",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="feeDest"
              checked={feeMode === "custom"}
              onChange={() => setFeeMode("custom")}
              style={{ accentColor: "var(--signal-orange)" }}
            />
            Custom wallet
          </label>
          {feeMode === "custom" ? (
            <input
              type="text"
              className="lab-field"
              value={flow.form.creatorFeeAddress}
              placeholder="0x… fee-collecting address"
              data-testid="creator-fee-input"
              onChange={(e) => flow.updateForm({ creatorFeeAddress: e.target.value })}
              style={{ marginTop: 6 }}
            />
          ) : null}

          <SubHead>fee split (immutable)</SubHead>
          <div data-testid="fee-split-readonly">
            <Row k="creator beneficiary" v={`${SPLIT.creatorFeePct.toString()}%`} />
            <Row k="BPS Launch Lab" v={`${SPLIT.bpsFeePct.toString()}%`} />
            <Row k="Doppler protocol" v={`${SPLIT.protocolPct.toString()}%`} />
          </div>

          <details data-testid="advanced-disclosure" style={{ marginTop: 20 }}>
            <summary className="lab-label" style={{ cursor: "pointer" }}>
              advanced (defaults are fine for most launches)
            </summary>
            <div style={{ marginTop: 16, display: "grid", gap: 18 }}>
              <Row k="total supply" v="1,000,000,000 (fixed)" />
              <div>
                <label className="lab-label" htmlFor="lab-fdv">
                  starting FDV (USD, integer)
                </label>
                <input
                  id="lab-fdv"
                  className="lab-field"
                  type="number"
                  min={1_000}
                  max={10_000_000}
                  step={1}
                  value={flow.form.startingFdvUsd || ""}
                  data-testid="fdv-input"
                  onChange={(e) => flow.updateForm({ startingFdvUsd: Number(e.target.value) })}
                  style={{ marginTop: 8 }}
                />
              </div>
              <div>
                <div className="lab-label">fee preset</div>
                <div className="lab-grid" style={{ marginTop: 12 }}>
                  {(flow.config?.feePresets ?? []).map((p) => {
                    const selected = flow.form.feePreset === p.id;
                    const detail = p.enabled ? PRESET_DETAIL[p.id] : DYNAMIC_PROTECTION_LABEL;
                    return (
                      <label
                        key={p.id}
                        className="lab-card lab-card--nested"
                        data-testid={`preset-choice-${p.id}`}
                        style={{
                          cursor: p.enabled ? "pointer" : "not-allowed",
                          opacity: p.enabled ? 1 : 0.6,
                          ...(selected ? { borderColor: "var(--signal-orange)" } : {}),
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <input
                            type="radio"
                            name="feePreset"
                            value={p.id}
                            checked={selected}
                            disabled={!p.enabled}
                            onChange={() => p.enabled && flow.updateForm({ feePreset: p.id })}
                            style={{ accentColor: "var(--signal-orange)" }}
                          />
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: 24,
                              letterSpacing: "-0.04em",
                              color: "var(--deep-ink)",
                            }}
                          >
                            {p.displayFee}
                          </span>
                          {!p.enabled ? (
                            <span className="lab-pill" style={{ marginLeft: "auto" }}>
                              not yet available
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontWeight: 700, marginTop: 6, color: "var(--deep-ink)" }}>
                          {p.label}{" "}
                          <span className="lab-muted" style={{ fontWeight: 400, fontSize: 12 }}>
                            ({p.mode})
                          </span>
                        </div>
                        <p
                          className="lab-muted"
                          style={{ fontSize: 13, marginTop: 3, lineHeight: 1.4 }}
                        >
                          {detail}
                        </p>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </details>

          {flow.formErrors.length > 0 ? (
            <ul
              data-testid="pair-errors"
              style={{
                margin: "16px 0 0",
                paddingLeft: 0,
                listStyle: "none",
                display: "grid",
                gap: 6,
              }}
            >
              {flow.formErrors.map((err) => (
                <li key={err} className="lab-pill lab-pill--bad">
                  {err}
                </li>
              ))}
            </ul>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 14,
              borderTop: "1px solid var(--peach-grey)",
              marginTop: 22,
              paddingTop: 22,
              flexWrap: "wrap",
            }}
          >
            <button className="lab-btn lab-btn--ghost" onClick={() => setStep(1)} disabled={busy}>
              ← back
            </button>
            <button
              className="lab-btn lab-btn--primary"
              data-testid="prepare-launch"
              disabled={disconnected || busy || !flow.metadata || flow.formErrors.length > 0}
              onClick={async () => {
                const ok = await flow.prepare();
                if (ok) setStep(3);
              }}
            >
              Continue to review →
            </button>
          </div>
        </section>
      ) : null}

      {/* ---- step 3: launch / review ---- */}
      {step === 3 && flow.manifest && flow.simulation && flow.prepared ? (
        <section className="lab-card" data-testid="review">
          <div className="lab-label">step 3 of 3</div>
          <h2 className="lab-h2" style={{ marginTop: 8 }}>
            launch — read this like a <span className="lab-serif">contract</span>
          </h2>
          <div className="lab-card lab-card--peach" style={{ marginTop: 16 }}>
            <strong>Irreversible configuration.</strong> Token identity, metadata URI, anchor
            pairing, supply, fee preset, and beneficiary splits are fixed permanently at launch
            through a verified no-op migration and locked-market configuration.
          </div>

          <SubHead>token identity</SubHead>
          <Row k="Name" v={flow.manifest.tokenName} mono={false} />
          <Row k="Symbol" v={flow.manifest.tokenSymbol} mono={false} />
          <Row k="Description hash" v={flow.manifest.tokenDescriptionHash} />
          <Row k="Token URI" v={flow.manifest.tokenUri} />
          <Row k="Image CID" v={flow.manifest.tokenImageCid} />

          <SubHead>anchor (quote asset)</SubHead>
          <Row
            k="Anchor"
            v={`${flow.manifest.anchorSymbol} (decimals ${flow.manifest.anchorDecimals})`}
          />
          <Row
            k="Anchor address"
            v={
              <a
                href={`${explorer}/address/${flow.manifest.anchorAddress}`}
                target="_blank"
                rel="noreferrer"
              >
                {flow.manifest.anchorAddress}
              </a>
            }
          />
          <Row k="Anchor multiplier" v={flow.manifest.anchorMultiplier} />

          <SubHead>supply and pricing</SubHead>
          <Row k="Initial supply (wei)" v={flow.manifest.initialSupply} />
          <Row k="Sale inventory (wei)" v={flow.manifest.saleInventory} />
          <Row k="Starting FDV (USD)" v={flow.manifest.startingFdvUsdFixed} />
          <Row k="Starting price (USD, FDV / 1e9)" v={startingPriceUsd(flow.manifest)} />

          <SubHead>fees</SubHead>
          <Row k="Fee preset" v={flow.manifest.feePreset} />
          <Row k="Exact pool fee units" v={String(flow.manifest.exactPoolFeeUnits)} />

          <SubHead>beneficiaries</SubHead>
          <div className="lab-scroll-x">
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                minWidth: 520,
              }}
            >
              <thead>
                <tr>
                  {["Label", "Address", "Percent", "Shares (WAD)"].map((h) => (
                    <th
                      key={h}
                      className="lab-label"
                      style={{ textAlign: "left", padding: "8px 10px" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flow.manifest.beneficiaries.map((b) => (
                  <tr key={`${b.beneficiary}-${b.label}`}>
                    <td style={{ padding: "8px 10px" }}>{b.label}</td>
                    <td className="lab-data" style={{ padding: "8px 10px" }}>
                      {b.beneficiary}
                    </td>
                    <td className="lab-data" style={{ padding: "8px 10px" }}>
                      {b.percent}
                    </td>
                    <td className="lab-data" style={{ padding: "8px 10px" }}>
                      {b.sharesWad}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <SubHead>modes</SubHead>
          <Row k="Migration mode" v={flow.manifest.migrationMode} />
          <Row k="Governance mode" v={flow.manifest.governanceMode} />
          <Row k="Initializer mode" v={flow.manifest.initializerMode} />

          <SubHead>resolved Doppler modules</SubHead>
          {Object.entries(flow.manifest.resolvedDopplerModules).map(([name, addr]) => (
            <Row
              key={name}
              k={name}
              v={
                <a href={`${explorer}/address/${addr}`} target="_blank" rel="noreferrer">
                  {addr}
                </a>
              }
            />
          ))}

          <SubHead>prediction and integrity</SubHead>
          <Row k="Predicted token address" v={flow.simulation.predictedTokenAddress} />
          <Row k="Predicted pool id" v={flow.simulation.predictedPoolId} />
          <Row k="Transaction target" v={flow.manifest.transactionTarget} />
          <Row k="Transaction value" v={flow.manifest.transactionValue} />
          <Row k="Gas estimate" v={flow.simulation.gasEstimate} />
          <Row k="Gas limit (sent)" v={flow.prepared.gas} />
          <Row k="Manifest hash" v={flow.manifestHash ?? "—"} />
          <Row k="Calldata hash" v={flow.manifest.calldataHash} />
          <Row k="Simulation block" v={flow.simulation.simulationBlock} />
          <Row
            k="Simulation age"
            v={
              flow.simulationAgeMs !== null
                ? `${Math.round(flow.simulationAgeMs / 1000)} s ${flow.simulationFresh ? "(fresh)" : "(STALE — will re-simulate before sending)"}`
                : "—"
            }
          />

          <SubHead>parties</SubHead>
          <Row k="Creator" v={flow.manifest.creatorAddress} />
          <Row k="Creator fee address" v={flow.manifest.creatorFeeAddress} />
          <Row k="BPS fee address" v={flow.manifest.bpsFeeAddress} />
          <Row k="Protocol fee address (Airlock owner)" v={flow.manifest.protocolFeeAddress} />
          <Row k="Chain id" v={String(flow.manifest.chainId)} />
          <Row
            k="App version / commit"
            v={`${flow.manifest.appVersion} / ${flow.manifest.sourceCommit}`}
          />

          {/* ---- launch ---- */}
          <SubHead>launch</SubHead>
          {flow.config && flow.config.publicBeta.launchesToday !== null ? (
            <p className="lab-muted" style={{ fontSize: 13 }} data-testid="public-beta-capacity">
              Public beta: {flow.config.publicBeta.launchesToday} of{" "}
              {flow.config.publicBeta.publicDailyLaunchCap} launches today
            </p>
          ) : null}
          <ul
            style={{ listStyle: "none", paddingLeft: 0, margin: "8px 0 0" }}
            data-testid="launch-checklist"
          >
            <Gate ok={flow.gates.walletConnected} label="Wallet connected" />
            <Gate ok={flow.gates.chainOk} label={`On Robinhood Chain (${CHAIN_ID})`} />
            <Gate ok={flow.gates.anchorVerified} label="Anchor verified" />
            <Gate ok={flow.gates.metadataConfirmed} label="Metadata confirmed (production IPFS)" />
            <Gate
              ok={flow.gates.simulated && flow.gates.simulationFresh}
              label="Simulation fresh (re-simulated automatically if stale)"
            />
            <Gate ok={flow.gates.broadcastEnabled} label="Broadcast enabled (server flag)" />
            <Gate ok={flow.gates.killSwitchInactive} label="Kill switch inactive" />
            <Gate ok={flow.gates.creationEnabled} label="Creation enabled (access mode)" />
            <Gate ok={flow.gates.termsAccepted} label="Acknowledgement accepted" />
          </ul>
          <button
            className="lab-btn lab-btn--primary"
            style={{ marginTop: 16 }}
            data-testid="launch-button"
            disabled={!flow.canLaunch || busy}
            onClick={() => void flow.launch()}
          >
            Launch market
          </button>

          <div style={{ marginTop: 18 }}>
            <div className="lab-kv">
              <span>status</span>
              <span className="lab-data" data-testid="launch-status">
                {info.label}
              </span>
            </div>
            <p className="lab-muted" style={{ fontSize: 14, marginTop: 8 }}>
              {info.detail}
            </p>
            {flow.txHash ? (
              <Row
                k="Launch transaction"
                v={
                  <a href={`${explorer}/tx/${flow.txHash}`} target="_blank" rel="noreferrer">
                    {short(flow.txHash)}
                  </a>
                }
              />
            ) : null}
          </div>

          {flow.flowState === "launch-success" && flow.receiptResult ? (
            <div
              className="lab-card lab-card--peach"
              style={{ marginTop: 18 }}
              data-testid="launch-success-panel"
            >
              <h3 className="lab-h2" style={{ fontSize: 22 }}>
                launch verified against the manifest
              </h3>
              <Row
                k="Token"
                v={
                  <a
                    href={`${explorer}/address/${flow.receiptResult.tokenAddress}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {flow.receiptResult.tokenAddress}
                  </a>
                }
              />
              <Row k="Pool id" v={flow.receiptResult.poolId} />
              <Row k="Confirmation block" v={flow.receiptResult.confirmationBlock} />
              <Row
                k="Transaction"
                v={
                  <a
                    href={`${explorer}/tx/${flow.receiptResult.launchTransactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {short(flow.receiptResult.launchTransactionHash)}
                  </a>
                }
              />
              <p style={{ marginTop: 14 }}>
                <a
                  className="lab-btn lab-btn--ghost"
                  href={`/lab/token/${flow.receiptResult.tokenAddress}`}
                >
                  open the market page →
                </a>
              </p>
            </div>
          ) : null}

          {flow.flowState === "launch-mismatch" ? (
            <div
              className="lab-card"
              style={{ marginTop: 18, border: "1px solid var(--bad)", background: "var(--bad-bg)" }}
              data-testid="launch-mismatch-panel"
            >
              <h3 className="lab-h2" style={{ fontSize: 22, color: "var(--bad)" }}>
                hard stop: receipt does not match the manifest
              </h3>
              <p style={{ fontSize: 14 }}>
                The flow is stopped. Investigate before doing anything else. Mismatches:
              </p>
              <ul
                style={{
                  margin: "8px 0 0",
                  paddingLeft: 0,
                  listStyle: "none",
                  display: "grid",
                  gap: 6,
                }}
              >
                {(flow.receiptResult?.mismatches ?? [flow.error ?? "Verification failed."]).map(
                  (m) => (
                    <li key={m} className="lab-pill lab-pill--bad">
                      {m}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
      {step === 3 && !flow.manifest ? (
        <section className="lab-card">
          <p className="lab-await">
            No prepared launch yet — go back and prepare the launch first.
          </p>
        </section>
      ) : null}
    </main>
  );
}
