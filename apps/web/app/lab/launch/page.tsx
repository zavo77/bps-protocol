"use client";
// Launch wizard — three short screens: Launch a token → Choose the market →
// Review your market. One centred ~680px column, compact stepper, short copy,
// one primary action per screen. All validation / metadata upload / simulation /
// manifest / gating / signing logic lives unchanged in useCreateFlow; this file
// is presentation only. The form is fillable while disconnected — Continue
// opens the normal wallet connection flow when a wallet is needed. No internal
// terminology (IPFS/metadata/anchor/flow-state/server flags) appears anywhere;
// everything technical sits inside the collapsed "Advanced details" on review.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { formatEther } from "viem";
import {
  CHAIN_ID,
  EXPLORER_BASE_URL,
  SPLIT,
  type CreateFlowState,
} from "@bps/launch-lab";
import { useCreateFlow } from "../../../hooks/lab";
import { ConnectWalletButton } from "../ConnectWalletButton";

/** Short, product-facing status copy per flow state (runtime feedback only). */
const FLOW_STATE_INFO: Record<CreateFlowState, { label: string; detail: string }> = {
  "form-incomplete": { label: "Draft", detail: "" },
  "form-invalid": { label: "Draft", detail: "" },
  "image-uploading": { label: "Saving", detail: "Saving your token details…" },
  "metadata-confirmed": { label: "Saved", detail: "" },
  "anchor-verifying": { label: "Checking", detail: "Checking the paired asset…" },
  "anchor-verified": { label: "Ready", detail: "" },
  "anchor-mismatch": {
    label: "Unavailable",
    detail: "That asset can't be verified right now. Try again shortly.",
  },
  simulating: { label: "Preparing", detail: "Preparing your market…" },
  "simulation-success": { label: "Prepared", detail: "" },
  "simulation-failure": {
    label: "Failed",
    detail: "Preparation failed. Go back and try again.",
  },
  "broadcast-disabled": { label: "Unavailable", detail: "Market launches are temporarily unavailable." },
  "kill-switch-active": { label: "Unavailable", detail: "Market launches are temporarily unavailable." },
  "ready-to-launch": { label: "Ready", detail: "" },
  "awaiting-signature": { label: "Confirm", detail: "Confirm the launch in your wallet." },
  "transaction-pending": { label: "Launching", detail: "Launching your market…" },
  "confirmation-pending": { label: "Confirming", detail: "Waiting for confirmation…" },
  "receipt-decoding": { label: "Verifying", detail: "Verifying your market on-chain…" },
  "launch-success": { label: "Launched", detail: "Your market is live. Redirecting…" },
  "launch-mismatch": {
    label: "Stopped",
    detail: "The on-chain result did not match the review. This launch is stopped.",
  },
};

function short(v: string): string {
  return v.length > 14 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v;
}

/** A key/value row. Technical values use the mono .lab-data style. */
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

/** "1 billion" for the fixed 1e9 supply; locale string for anything else. */
function humanSupply(weiString: string, ticker: string): string {
  const units = Number(weiString) / 1e18;
  if (units === 1_000_000_000) return `1 billion ${ticker}`;
  return `${units.toLocaleString()} ${ticker}`;
}

const activePillStyle = {
  background: "var(--deep-ink)",
  color: "#fff",
  borderColor: "var(--deep-ink)",
} as const;

/** wallet_addEthereumChain params for Robinhood Chain (founder-specified). */
const ADD_CHAIN_PARAMS = {
  chainId: "0x1237",
  chainName: "Robinhood Chain",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
} as const;

function isUserRejection(e: unknown): boolean {
  const m = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
  const code = (e as { code?: number })?.code;
  return code === 4001 || m.includes("user rejected") || m.includes("user denied");
}

function isUnknownChain(e: unknown): boolean {
  const m = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
  const code = (e as { code?: number })?.code;
  return code === 4902 || m.includes("unrecognized chain") || m.includes("try adding the chain");
}

export default function LabCreatePage() {
  const flow = useCreateFlow();
  const { switchChainAsync } = useSwitchChain();
  const { connector } = useAccount();
  const publicClient = usePublicClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [feeMode, setFeeMode] = useState<"connected" | "custom">("connected");
  const [showConnect, setShowConnect] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  // Switch the wallet to Robinhood Chain; if the wallet doesn't know the
  // chain, request adding it, then switch again. Raw wallet errors never
  // reach the user — only concise retry copy.
  const switchNetwork = async () => {
    setSwitchError(null);
    setSwitching(true);
    try {
      await switchChainAsync({ chainId: CHAIN_ID });
    } catch (e) {
      if (isUnknownChain(e)) {
        try {
          const provider = (await connector?.getProvider?.()) as
            | { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
            | undefined;
          if (provider) {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [ADD_CHAIN_PARAMS],
            });
            await switchChainAsync({ chainId: CHAIN_ID });
          } else {
            setSwitchError("Couldn't reach the wallet — try switching networks in the wallet itself.");
          }
        } catch (e2) {
          setSwitchError(
            isUserRejection(e2)
              ? "Network switch was declined — try again."
              : "Couldn't add Robinhood Chain — try switching networks in the wallet itself.",
          );
        }
      } else if (isUserRejection(e)) {
        setSwitchError("Network switch was declined — try again.");
      } else {
        setSwitchError("Couldn't switch networks — try again.");
      }
    } finally {
      setSwitching(false);
    }
  };
  // Network fee: "calculating" → an ETH figure, or "wallet" when the estimate
  // is unavailable. Never a bare dash.
  const [estFee, setEstFee] = useState<"calculating" | "wallet" | string>("calculating");

  // Wallet change / disconnect / Start over → back to a clean Step 1.
  useEffect(() => {
    if (flow.resetEpoch > 0) {
      setStep(1);
      setFeeMode("connected");
      setShowConnect(false);
    }
  }, [flow.resetEpoch]);

  const gasEstimate = flow.simulation?.gasEstimate ?? null;
  useEffect(() => {
    let alive = true;
    setEstFee("calculating");
    if (!gasEstimate) return;
    if (!publicClient) {
      setEstFee("wallet");
      return;
    }
    publicClient
      .getGasPrice()
      .then((price) => {
        if (!alive) return;
        setEstFee(`~${Number(formatEther(price * BigInt(gasEstimate))).toPrecision(2)} ETH`);
      })
      .catch(() => {
        if (alive) setEstFee("wallet");
      });
    return () => {
      alive = false;
    };
  }, [gasEstimate, publicClient]);

  const artworkUrl = useMemo(
    () => (flow.form.imageFile ? URL.createObjectURL(flow.form.imageFile) : null),
    [flow.form.imageFile],
  );
  useEffect(() => {
    return () => {
      if (artworkUrl) URL.revokeObjectURL(artworkUrl);
    };
  }, [artworkUrl]);

  const explorer = flow.config?.explorerBaseUrl ?? EXPLORER_BASE_URL;
  const anchors = flow.config?.anchors ?? [];
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
  const launchesClosed =
    flow.config !== undefined &&
    !(flow.gates.broadcastEnabled && flow.gates.killSwitchInactive && flow.gates.creationEnabled);

  const ticker = flow.form.tokenSymbol || "your token";

  const selectFeeConnected = () => {
    setFeeMode("connected");
    flow.updateForm({ creatorFeeAddress: "" });
  };

  const heading =
    step === 1 ? "Launch a token" : step === 2 ? "Choose the market" : "Review your market";

  return (
    <main style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Hidden state marker for tests/tooling only. */}
      <span data-testid="wallet-state" style={{ display: "none" }}>
        {flow.walletState}
      </span>

      {/* Compact header: title + stepper only. */}
      <header style={{ margin: "0 0 14px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", margin: 0 }}>
          {heading}
        </h1>
        <nav
          aria-label="Steps"
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 8,
            fontSize: 13,
          }}
        >
          {([1, 2, 3] as const).map((n, i) => {
            const labels = { 1: "Token", 2: "Market", 3: "Review" } as const;
            const enabled =
              n === 1 || (n === 2 && flow.metadata !== null) || (n === 3 && flow.bundle !== null);
            const active = step === n;
            const done = n < step;
            return (
              <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {i > 0 ? (
                  <span aria-hidden style={{ color: "var(--peach-grey)" }}>
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
                        ? { background: "#fff", borderColor: "var(--good-border)", color: "var(--good)" }
                        : {
                            background: "#fff",
                            borderColor: "var(--peach-grey)",
                            color: "var(--charcoal)",
                            opacity: 0.8,
                          }),
                  }}
                >
                  {done ? "✓ " : ""}
                  {labels[n]}
                </button>
              </span>
            );
          })}
        </nav>
      </header>

      {/* Wrong network → the launch flow is STOPPED behind this clean state.
          Nothing wallet-bound (metadata, envelope, simulation, launch) can run
          until the wallet's active chain is Robinhood Chain. */}
      {wrongChain ? (
        <section className="lab-card" style={{ marginBottom: 16 }} data-testid="switch-chain-card">
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Switch to Robinhood Chain</h2>
          <p className="lab-muted" style={{ fontSize: 14, margin: "8px 0 14px" }}>
            This market launches on Robinhood Chain.
          </p>
          <button
            className="lab-btn lab-btn--primary"
            onClick={() => void switchNetwork()}
            disabled={switching}
            data-testid="switch-chain"
          >
            {switching ? "Switching…" : "Switch network"}
          </button>
          {switchError ? (
            <p style={{ color: "var(--bad)", fontSize: 13, marginTop: 10 }} data-testid="switch-error">
              {switchError}
            </p>
          ) : null}
        </section>
      ) : null}
      {flow.unauthorised ? (
        <p className="lab-pill lab-pill--bad" style={{ marginBottom: 16 }} data-testid="unauthorised">
          This wallet is not eligible to create markets right now.
        </p>
      ) : null}
      {flow.error ? (
        <p className="lab-pill lab-pill--bad" style={{ marginBottom: 16 }} data-testid="flow-error">
          {flow.error}
        </p>
      ) : null}

      {/* ---------------- Step 1 · Launch a token ---------------- */}
      {!wrongChain && step === 1 ? (
        <section className="lab-card">
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div style={{ flex: "0 0 148px" }}>
              <label
                htmlFor="lab-image"
                className="lab-card lab-card--nested"
                style={{
                  borderStyle: "dashed",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: 148,
                  height: 148,
                  cursor: "pointer",
                  overflow: "hidden",
                  padding: 8,
                }}
              >
                {artworkUrl ? (
                  <img
                    src={artworkUrl}
                    alt="Token artwork"
                    width={124}
                    height={124}
                    style={{ borderRadius: 14, objectFit: "cover" }}
                  />
                ) : (
                  <>
                    <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden>
                      +
                    </span>
                    <span className="lab-muted" style={{ fontSize: 12, textAlign: "center" }}>
                      Add artwork
                    </span>
                  </>
                )}
              </label>
              <input
                id="lab-image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                data-testid="image-input"
                onChange={(e) => flow.updateForm({ imageFile: e.target.files?.[0] ?? null })}
                style={{ display: "block", width: 148, fontSize: 11, marginTop: 6 }}
              />
            </div>

            <div style={{ flex: "1 1 300px", minWidth: 260, display: "grid", gap: 14 }}>
              <input
                className="lab-field"
                type="text"
                value={flow.form.tokenName}
                maxLength={48}
                placeholder="Token name"
                aria-label="Token name"
                data-testid="name-input"
                onChange={(e) => flow.updateForm({ tokenName: e.target.value })}
              />
              <input
                className="lab-field"
                type="text"
                value={flow.form.tokenSymbol}
                maxLength={12}
                placeholder="Ticker"
                aria-label="Ticker"
                data-testid="symbol-input"
                onChange={(e) => flow.updateForm({ tokenSymbol: e.target.value.toUpperCase() })}
                style={{ fontFamily: "var(--font-space-grotesk), sans-serif", letterSpacing: "0.06em" }}
              />
              <textarea
                className="lab-field"
                value={flow.form.tokenDescription}
                maxLength={600}
                rows={3}
                placeholder="Short description"
                aria-label="Short description"
                data-testid="description-input"
                onChange={(e) => flow.updateForm({ tokenDescription: e.target.value })}
                style={{ minHeight: "auto", resize: "vertical" }}
              />
            </div>
          </div>

          {flow.formErrors.length > 0 ? (
            <ul
              data-testid="form-errors"
              style={{ margin: "14px 0 0", paddingLeft: 0, listStyle: "none", display: "grid", gap: 6 }}
            >
              {flow.formErrors.map((err) => (
                <li key={err} className="lab-pill lab-pill--bad">
                  {err}
                </li>
              ))}
            </ul>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button
              className="lab-btn lab-btn--primary"
              data-testid="upload-continue"
              disabled={busy || !flow.formComplete || flow.formErrors.length > 0}
              onClick={async () => {
                if (disconnected) {
                  setShowConnect(true);
                  return;
                }
                if (flow.metadata) {
                  setStep(2);
                  return;
                }
                const ok = await flow.uploadMetadata();
                if (ok) setStep(2);
              }}
            >
              {busy ? "Saving…" : "Continue"}
            </button>
          </div>
          {showConnect && disconnected ? (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <ConnectWalletButton variant="inline" autoOpen />
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ---------------- Step 2 · Choose the market ---------------- */}
      {!wrongChain && step === 2 ? (
        <section className="lab-card" data-testid="pair-step">
          <p style={{ fontSize: 15, margin: "0 0 14px", color: "var(--charcoal)" }}>
            What should {ticker} be paired with?
          </p>
          <div
            data-testid="anchor-picker"
            role="radiogroup"
            aria-label="Paired asset"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))",
              gap: 10,
            }}
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
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    textAlign: "center",
                    padding: "14px 10px",
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
                    style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
                  />
                  {a.logo ? (
                    <img src={a.logo} alt="" width={34} height={34} style={{ borderRadius: "50%" }} />
                  ) : null}
                  <span style={{ fontWeight: 800, color: "var(--deep-ink)", fontSize: 15 }}>
                    {a.symbol}
                  </span>
                  <span className="lab-muted" style={{ fontSize: 11, lineHeight: 1.3 }}>
                    {a.name}
                  </span>
                </label>
              );
            })}
            {anchors.length === 0 ? <p className="lab-await">loading…</p> : null}
          </div>

          <p style={{ fontSize: 15, margin: "22px 0 8px", color: "var(--charcoal)" }}>
            Creator fees go to:
          </p>
          <label
            data-testid="fee-dest-connected"
            style={{ display: "flex", gap: 10, alignItems: "center", margin: "6px 0", cursor: "pointer" }}
          >
            <input
              type="radio"
              name="feeDest"
              checked={feeMode === "connected"}
              onChange={selectFeeConnected}
              style={{ accentColor: "var(--signal-orange)" }}
            />
            Connected wallet
          </label>
          <label
            data-testid="fee-dest-custom"
            style={{ display: "flex", gap: 10, alignItems: "center", margin: "6px 0", cursor: "pointer" }}
          >
            <input
              type="radio"
              name="feeDest"
              checked={feeMode === "custom"}
              onChange={() => setFeeMode("custom")}
              style={{ accentColor: "var(--signal-orange)" }}
            />
            Custom address
          </label>
          {feeMode === "custom" ? (
            <input
              type="text"
              className="lab-field"
              value={flow.form.creatorFeeAddress}
              placeholder="0x…"
              data-testid="creator-fee-input"
              onChange={(e) => flow.updateForm({ creatorFeeAddress: e.target.value })}
              style={{ marginTop: 6 }}
            />
          ) : null}

          {flow.formErrors.length > 0 ? (
            <ul
              data-testid="pair-errors"
              style={{ margin: "14px 0 0", paddingLeft: 0, listStyle: "none", display: "grid", gap: 6 }}
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
              gap: 10,
              alignItems: "flex-start",
              margin: "20px 0 0",
              fontSize: 13,
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
              style={{ width: 18, height: 18, marginTop: 1, accentColor: "var(--signal-orange)" }}
            />
            <span>
              I acknowledge this is an experimental, unaffiliated market platform and that launch
              configuration is irreversible.
            </span>
          </label>
          {!flow.form.termsAccepted ? (
            <p className="lab-muted" style={{ fontSize: 12, marginTop: 8 }} data-testid="terms-hint">
              Check the acknowledgement above to continue.
            </p>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 20,
              flexWrap: "wrap",
            }}
          >
            <button className="lab-btn lab-btn--ghost" onClick={() => setStep(1)} disabled={busy}>
              Back
            </button>
            <button
              className="lab-btn lab-btn--primary"
              data-testid="prepare-launch"
              disabled={
                disconnected ||
                busy ||
                !flow.metadata ||
                flow.formErrors.length > 0 ||
                !flow.form.termsAccepted
              }
              onClick={async () => {
                const ok = await flow.prepare();
                if (ok) setStep(3);
              }}
            >
              {busy ? "Preparing…" : "Continue"}
            </button>
          </div>
        </section>
      ) : null}

      {/* ---------------- Step 3 · Review your market ---------------- */}
      {!wrongChain && step === 3 && flow.manifest && flow.simulation && flow.prepared ? (
        <section className="lab-card" data-testid="review">
          <div
            style={{ display: "flex", gap: 18, alignItems: "center" }}
            data-testid="review-identity"
          >
            {artworkUrl ? (
              <img
                src={artworkUrl}
                alt={`${flow.manifest.tokenName} artwork`}
                width={84}
                height={84}
                style={{ borderRadius: 20, objectFit: "cover" }}
              />
            ) : null}
            <div>
              <div
                style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--deep-ink)" }}
              >
                {flow.manifest.tokenName}
              </div>
              <div className="lab-muted" style={{ fontSize: 15, marginTop: 2 }}>
                {flow.manifest.tokenSymbol} / {flow.manifest.anchorSymbol}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }} data-testid="review-summary">
            <Row
              k="Supply"
              v={humanSupply(flow.manifest.initialSupply, flow.manifest.tokenSymbol)}
              mono={false}
            />
            <Row
              k="Starting value"
              v={`$${Number(flow.manifest.startingFdvUsdFixed).toLocaleString()}`}
              mono={false}
            />
            <Row
              k="Trading fee"
              v={`${(flow.manifest.exactPoolFeeUnits / 10_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`}
              mono={false}
            />
            <Row k="Creator share" v={`${SPLIT.creatorFeePct.toString()}% of trading fees`} mono={false} />
            <Row
              k="Creator fees"
              v={`${
                flow.manifest.creatorFeeAddress.toLowerCase() ===
                flow.manifest.creatorAddress.toLowerCase()
                  ? "Connected wallet"
                  : "Custom wallet"
              } · ${short(flow.manifest.creatorFeeAddress)}`}
              mono={false}
            />
            <Row
              k="Network fee"
              v={
                estFee === "calculating"
                  ? "Calculating…"
                  : estFee === "wallet"
                    ? "Final network fee shown in wallet"
                    : estFee
              }
              mono={false}
            />
          </div>

          <p className="lab-muted" style={{ fontSize: 13, marginTop: 14 }}>
            This market&apos;s setup is permanent and can&apos;t be changed after launch.
          </p>

          <details style={{ marginTop: 14, opacity: 0.85 }} data-testid="advanced-details">
            <summary className="lab-label" style={{ cursor: "pointer" }}>
              Contract details
            </summary>
            <div style={{ marginTop: 12 }}>
              <Row k="Predicted token address" v={flow.simulation.predictedTokenAddress} />
              <Row k="Predicted pool id" v={flow.simulation.predictedPoolId} />
              <Row k="Manifest hash" v={flow.manifestHash ?? "—"} />
              <Row k="Calldata hash" v={flow.manifest.calldataHash} />
              <Row k="Metadata URI" v={flow.manifest.tokenUri} />
              <Row
                k="Paired asset contract"
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
              <Row k="Creator wallet" v={flow.manifest.creatorAddress} />
              <Row k="Creator fee wallet" v={flow.manifest.creatorFeeAddress} />
              <Row
                k="Migration / governance"
                v={`${flow.manifest.migrationMode} / ${flow.manifest.governanceMode}`}
                mono={false}
              />
              <Row k="Chain id" v={String(flow.manifest.chainId)} />
              <Row k="Simulation block" v={flow.simulation.simulationBlock} />
              <Row k="Gas estimate" v={flow.simulation.gasEstimate} />
              {Object.entries(flow.manifest.resolvedDopplerModules).map(([name, addr]) => (
                <Row
                  key={name}
                  k={`Module: ${name}`}
                  v={
                    <a href={`${explorer}/address/${addr}`} target="_blank" rel="noreferrer">
                      {addr}
                    </a>
                  }
                />
              ))}
              {flow.manifest.beneficiaries.map((b) => (
                <Row
                  key={`${b.beneficiary}-${b.label}`}
                  k={`Beneficiary ${b.label} (${b.percent})`}
                  v={`${b.beneficiary} · ${b.sharesWad} WAD`}
                />
              ))}
            </div>
          </details>

          {/* Exactly ONE wallet confirmation — the deployment transaction.
              Nothing else is ever asked of the wallet behind the button. */}
          <div style={{ marginTop: 14 }} data-testid="wallet-confirmations">
            <Row k="Wallet confirmations" v="1" mono={false} />
            <p
              className="lab-muted"
              style={{ fontSize: 13, margin: "4px 0 0" }}
              data-testid="wallet-confirmation-steps"
            >
              1. Launch {flow.manifest.tokenSymbol}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginTop: 20,
              flexWrap: "wrap",
            }}
          >
            <button className="lab-btn lab-btn--ghost" onClick={() => setStep(2)} disabled={busy}>
              Back
            </button>
            {launchesClosed ? (
              <p
                style={{ margin: 0, fontSize: 14, color: "var(--charcoal)" }}
                data-testid="launches-closed"
              >
                Market launches are temporarily unavailable.
              </p>
            ) : (
              <button
                className="lab-btn lab-btn--primary"
                data-testid="launch-button"
                disabled={!flow.canLaunch || busy}
                onClick={() => void flow.launch()}
                style={{ flex: "1 1 auto", fontSize: 16, minHeight: 50 }}
              >
                Launch {flow.manifest.tokenSymbol}
              </button>
            )}
          </div>

          {busy || flow.txHash || flow.flowState === "launch-mismatch" ? (
            <div style={{ marginTop: 12 }}>
              {info.detail ? (
                <p className="lab-muted" style={{ fontSize: 13, margin: 0 }} data-testid="launch-status">
                  {info.detail}
                </p>
              ) : null}
              {flow.txHash ? (
                <Row
                  k="Transaction"
                  v={
                    <a href={`${explorer}/tx/${flow.txHash}`} target="_blank" rel="noreferrer">
                      {short(flow.txHash)}
                    </a>
                  }
                />
              ) : null}
            </div>
          ) : null}

          {flow.flowState === "launch-success" && flow.receiptResult ? (
            <div
              className="lab-card lab-card--peach"
              style={{ marginTop: 16 }}
              data-testid="launch-success-panel"
            >
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Your market is live.</h3>
              <Row
                k="Token"
                v={
                  <a
                    href={`${explorer}/address/${flow.receiptResult.tokenAddress}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {short(flow.receiptResult.tokenAddress)}
                  </a>
                }
              />
              <p style={{ margin: "12px 0 0" }}>
                <a
                  className="lab-btn lab-btn--primary"
                  href={`/lab/token/${flow.receiptResult.tokenAddress}`}
                >
                  Open your market →
                </a>
              </p>
            </div>
          ) : null}

          {flow.flowState === "launch-mismatch" ? (
            <div
              className="lab-card"
              style={{ marginTop: 16, border: "1px solid var(--bad)", background: "var(--bad-bg)" }}
              data-testid="launch-mismatch-panel"
            >
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--bad)", margin: 0 }}>
                Launch stopped — the on-chain result did not match the review.
              </h3>
              <ul style={{ margin: "10px 0 0", paddingLeft: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {(flow.receiptResult?.mismatches ?? [flow.error ?? "Verification failed."]).map((m) => (
                  <li key={m} className="lab-pill lab-pill--bad">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
      {!wrongChain && step === 3 && !flow.manifest ? (
        <section className="lab-card">
          <p className="lab-await">Nothing to review yet — go back and continue from the market step.</p>
        </section>
      ) : null}

      {/* Small secondary action beneath the card. */}
      <div style={{ textAlign: "right", marginTop: 8 }}>
        <button
          type="button"
          data-testid="start-over"
          onClick={() => flow.startOver()}
          disabled={busy}
          className="lab-muted"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            textDecoration: "underline",
            padding: 4,
          }}
        >
          Start over
        </button>
      </div>
    </main>
  );
}
