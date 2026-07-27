"use client";
// Launch Lab creation flow — simplified VISIBLE flow: Token → Pair → Launch,
// driven entirely by useCreateFlow. Every CreateFlowState enum value is renderable
// via FLOW_STATE_INFO. All existing validation / metadata upload / simulation /
// manifest / gating / signing work is preserved; only the step grouping changed:
// the anchor picker + fee destination live on "Pair", and the old Review + Launch
// steps are folded into "Launch".
import { useState } from "react";
import { useConnect, useSwitchChain } from "wagmi";
import {
  CHAIN_ID,
  EXPLORER_BASE_URL,
  SPLIT,
  type CreateFlowState,
  type FeePreset,
  type LaunchManifest,
} from "@bps/launch-lab";
import { useCreateFlow } from "../../../hooks/lab";

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

function Gate({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li>
      <span className={ok ? "badge badge-good" : "badge badge-bad"}>{ok ? "PASS" : "BLOCKED"}</span>{" "}
      {label}
    </li>
  );
}

export default function LabCreatePage() {
  const flow = useCreateFlow();
  const { connect, connectors, isPending: connecting } = useConnect();
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
      <h1>Create a market</h1>

      <section className="card" style={{ marginBottom: "1rem" }}>
        <div className="kv">
          <span className="k">Wallet</span>
          <span className="v" data-testid="wallet-state">
            {flow.walletState}
          </span>
        </div>
        {disconnected ? (
          <div data-testid="wallet-hint">
            <p className="small muted">
              Connect a wallet to create a market. Nothing can be signed while disconnected.
            </p>
            {connectors.map((c) => (
              <button key={c.uid} onClick={() => connect({ connector: c })} disabled={connecting}>
                Connect {c.name}
              </button>
            ))}
            {connectors.length === 0 ? (
              <p className="small muted">No wallet connector is available in this environment.</p>
            ) : null}
          </div>
        ) : null}
        {wrongChain ? (
          <button onClick={() => switchChain({ chainId: CHAIN_ID })} data-testid="switch-chain">
            Switch to Robinhood Chain ({CHAIN_ID})
          </button>
        ) : null}
        {flow.unauthorised ? (
          <p className="small" style={{ color: "var(--bad)" }} data-testid="unauthorised">
            This wallet is not on the creator allowlist (AUTH_NOT_ALLOWLISTED).
          </p>
        ) : null}
      </section>

      <nav aria-label="Steps" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {([1, 2, 3] as const).map((n) => {
          const labels = { 1: "Token", 2: "Pair", 3: "Launch" } as const;
          const enabled =
            n === 1 || (n === 2 && flow.metadata !== null) || (n === 3 && flow.bundle !== null);
          return (
            <button
              key={n}
              onClick={() => enabled && setStep(n)}
              disabled={!enabled || busy}
              aria-current={step === n ? "step" : undefined}
            >
              {n}. {labels[n]}
            </button>
          );
        })}
      </nav>

      <section className="card" style={{ marginBottom: "1rem" }} data-testid="flow-state">
        <div className="kv">
          <span className="k">Flow state</span>
          <span className="v">{info.label}</span>
        </div>
        <p className="small muted">{info.detail}</p>
        {flow.error ? (
          <p className="small" style={{ color: "var(--bad)" }} data-testid="flow-error">
            {flow.error}
          </p>
        ) : null}
      </section>

      {step === 1 ? (
        <section className="card">
          <h2>1. Token</h2>
          <label>
            Image (PNG, JPEG, or WebP; max 4 MB)
            <br />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              data-testid="image-input"
              onChange={(e) => flow.updateForm({ imageFile: e.target.files?.[0] ?? null })}
            />
          </label>
          <br />
          <label>
            Name
            <br />
            <input
              type="text"
              value={flow.form.tokenName}
              maxLength={48}
              data-testid="name-input"
              onChange={(e) => flow.updateForm({ tokenName: e.target.value })}
            />
          </label>
          <br />
          <label>
            Ticker
            <br />
            <input
              type="text"
              value={flow.form.tokenSymbol}
              maxLength={12}
              data-testid="symbol-input"
              onChange={(e) => flow.updateForm({ tokenSymbol: e.target.value.toUpperCase() })}
            />
          </label>
          <br />
          <label>
            Description
            <br />
            <textarea
              value={flow.form.tokenDescription}
              maxLength={600}
              rows={4}
              style={{ width: "100%" }}
              data-testid="description-input"
              onChange={(e) => flow.updateForm({ tokenDescription: e.target.value })}
            />
          </label>
          {flow.formErrors.length > 0 ? (
            <ul data-testid="form-errors">
              {flow.formErrors.map((err) => (
                <li key={err} className="small" style={{ color: "var(--bad)" }}>
                  {err}
                </li>
              ))}
            </ul>
          ) : null}
          {flow.metadata ? (
            <p className="small muted" data-testid="metadata-confirmed">
              Metadata pinned: {flow.metadata.tokenUri} (provider: {flow.metadata.provider})
            </p>
          ) : null}
          <label style={{ display: "block", margin: "0.75rem 0" }}>
            <input
              type="checkbox"
              checked={flow.form.termsAccepted}
              data-testid="terms-checkbox"
              onChange={(e) => flow.updateForm({ termsAccepted: e.target.checked })}
            />{" "}
            {
              "I acknowledge this is an experimental, unaffiliated market platform and that launch configuration is irreversible."
            }
          </label>
          {!flow.form.termsAccepted ? (
            <p className="small muted" data-testid="terms-hint">
              Check the acknowledgement above to continue. Nothing is signed or sent until you do.
            </p>
          ) : null}
          <button
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
            {flow.metadata ? "Continue" : "Upload metadata & continue"}
          </button>
          {disconnected ? (
            <p className="small muted">Signing is blocked until a wallet is connected.</p>
          ) : null}
        </section>
      ) : null}

      {step === 2 ? (
        <section className="card" data-testid="pair-step">
          <h2>2. Pair</h2>

          <h3>Quote asset (anchor)</h3>
          <p className="small muted">
            Choose the approved Stock Token your market is quoted in. This pairing is fixed
            permanently at launch.
          </p>
          <div className="grid" data-testid="anchor-picker" role="radiogroup" aria-label="Anchor">
            {anchors.map((a) => (
              <label
                key={a.symbol}
                className="card"
                data-testid={`anchor-choice-${a.symbol}`}
                style={
                  flow.form.anchorSymbol === a.symbol ? { borderColor: "var(--accent)" } : undefined
                }
              >
                <input
                  type="radio"
                  name="anchor"
                  value={a.symbol}
                  checked={flow.form.anchorSymbol === a.symbol}
                  onChange={() => flow.updateForm({ anchorSymbol: a.symbol })}
                />{" "}
                {a.logo ? (
                  <img
                    src={a.logo}
                    alt=""
                    width={18}
                    height={18}
                    style={{ verticalAlign: "middle", borderRadius: "50%" }}
                  />
                ) : null}{" "}
                <strong>{a.symbol}</strong>
                <br />
                <span className="small muted">{a.name}</span>
              </label>
            ))}
            {anchors.length === 0 ? <p className="small muted">Loading approved anchors…</p> : null}
          </div>
          {selectedAnchor ? (
            <Row
              k="Anchor address"
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

          <h3>Fee destination</h3>
          <p className="small muted">Where your creator share of LP fees is collected.</p>
          <label style={{ display: "block", margin: "0.35rem 0" }} data-testid="fee-dest-connected">
            <input
              type="radio"
              name="feeDest"
              checked={feeMode === "connected"}
              onChange={selectFeeConnected}
            />{" "}
            Connected wallet (default)
          </label>
          <label style={{ display: "block", margin: "0.35rem 0" }} data-testid="fee-dest-custom">
            <input
              type="radio"
              name="feeDest"
              checked={feeMode === "custom"}
              onChange={() => setFeeMode("custom")}
            />{" "}
            Custom wallet
          </label>
          {feeMode === "custom" ? (
            <input
              type="text"
              value={flow.form.creatorFeeAddress}
              placeholder="0x… fee-collecting address"
              style={{ width: "100%" }}
              data-testid="creator-fee-input"
              onChange={(e) => flow.updateForm({ creatorFeeAddress: e.target.value })}
            />
          ) : null}

          <h3>Fee split (immutable)</h3>
          <div data-testid="fee-split-readonly">
            <Row k="Creator" v={`${SPLIT.creatorFeePct.toString()}%`} />
            <Row k="BPS" v={`${SPLIT.bpsFeePct.toString()}%`} />
            <Row k="Doppler" v={`${SPLIT.protocolPct.toString()}%`} />
          </div>

          <details data-testid="advanced-disclosure" style={{ marginTop: "1rem" }}>
            <summary>Advanced (defaults are fine for most launches)</summary>
            <div style={{ marginTop: "0.75rem" }}>
              <Row k="Total supply" v="1,000,000,000 (fixed)" />
              <label>
                Starting FDV (USD, integer)
                <br />
                <input
                  type="number"
                  min={1_000}
                  max={10_000_000}
                  step={1}
                  value={flow.form.startingFdvUsd || ""}
                  data-testid="fdv-input"
                  onChange={(e) => flow.updateForm({ startingFdvUsd: Number(e.target.value) })}
                />
              </label>
              <h4>Fee preset</h4>
              <div className="grid">
                {(flow.config?.feePresets ?? []).map((p: FeePreset) => (
                  <label
                    key={p.id}
                    className="card"
                    style={p.enabled ? undefined : { opacity: 0.55 }}
                    data-testid={`preset-choice-${p.id}`}
                  >
                    <input
                      type="radio"
                      name="feePreset"
                      value={p.id}
                      checked={flow.form.feePreset === p.id}
                      disabled={!p.enabled}
                      onChange={() => p.enabled && flow.updateForm({ feePreset: p.id })}
                    />{" "}
                    {p.label} — {p.displayFee} ({p.mode})
                    {!p.enabled && p.disabledReason ? (
                      <span className="small muted">
                        <br />
                        {p.disabledReason}
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            </div>
          </details>

          {flow.formErrors.length > 0 ? (
            <ul data-testid="pair-errors">
              {flow.formErrors.map((err) => (
                <li key={err} className="small" style={{ color: "var(--bad)" }}>
                  {err}
                </li>
              ))}
            </ul>
          ) : null}
          <button
            data-testid="prepare-launch"
            disabled={disconnected || busy || !flow.metadata || flow.formErrors.length > 0}
            onClick={async () => {
              const ok = await flow.prepare();
              if (ok) setStep(3);
            }}
          >
            Prepare launch (simulate + manifest)
          </button>
        </section>
      ) : null}

      {step === 3 && flow.manifest && flow.simulation && flow.prepared ? (
        <section className="card" data-testid="review">
          <h2>3. Launch — review every value below; it is irreversible once launched</h2>
          <p className="banner">
            <strong>Irreversible configuration.</strong> Token identity, metadata URI, anchor
            pairing, supply, fee preset, and beneficiary splits are fixed permanently at launch.
            There is no upgrade or admin path to change them afterwards.
          </p>
          <h3>Token identity</h3>
          <Row k="Name" v={flow.manifest.tokenName} />
          <Row k="Symbol" v={flow.manifest.tokenSymbol} />
          <Row k="Description hash" v={flow.manifest.tokenDescriptionHash} />
          <Row k="Token URI" v={flow.manifest.tokenUri} />
          <Row k="Image CID" v={flow.manifest.tokenImageCid} />
          <h3>Anchor (quote asset)</h3>
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
          <h3>Supply and pricing</h3>
          <Row k="Initial supply (wei)" v={flow.manifest.initialSupply} />
          <Row k="Sale inventory (wei)" v={flow.manifest.saleInventory} />
          <Row k="Starting FDV (USD)" v={flow.manifest.startingFdvUsdFixed} />
          <Row k="Starting price (USD, FDV / 1e9)" v={startingPriceUsd(flow.manifest)} />
          <h3>Fees</h3>
          <Row k="Fee preset" v={flow.manifest.feePreset} />
          <Row k="Exact pool fee units" v={String(flow.manifest.exactPoolFeeUnits)} />
          <h3>Beneficiaries</h3>
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Address</th>
                  <th>Percent</th>
                  <th>Shares (WAD)</th>
                </tr>
              </thead>
              <tbody>
                {flow.manifest.beneficiaries.map((b) => (
                  <tr key={`${b.beneficiary}-${b.label}`}>
                    <td>{b.label}</td>
                    <td style={{ wordBreak: "break-all" }}>{b.beneficiary}</td>
                    <td>{b.percent}</td>
                    <td>{b.sharesWad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Modes</h3>
          <Row k="Migration mode" v={flow.manifest.migrationMode} />
          <Row k="Governance mode" v={flow.manifest.governanceMode} />
          <Row k="Initializer mode" v={flow.manifest.initializerMode} />
          <h3>Resolved Doppler modules</h3>
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
          <h3>Prediction and integrity</h3>
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
          <h3>Parties</h3>
          <Row k="Creator" v={flow.manifest.creatorAddress} />
          <Row k="Creator fee address" v={flow.manifest.creatorFeeAddress} />
          <Row k="BPS fee address" v={flow.manifest.bpsFeeAddress} />
          <Row k="Protocol fee address (Airlock owner)" v={flow.manifest.protocolFeeAddress} />
          <Row k="Chain id" v={String(flow.manifest.chainId)} />
          <Row
            k="App version / commit"
            v={`${flow.manifest.appVersion} / ${flow.manifest.sourceCommit}`}
          />

          <h3 style={{ marginTop: "1.25rem" }}>Launch</h3>
          {flow.config && flow.config.publicBeta.launchesToday !== null ? (
            <p className="small muted" data-testid="public-beta-capacity">
              Public beta: {flow.config.publicBeta.launchesToday} of{" "}
              {flow.config.publicBeta.publicDailyLaunchCap} launches today
            </p>
          ) : null}
          <ul style={{ listStyle: "none", paddingLeft: 0 }} data-testid="launch-checklist">
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
            data-testid="launch-button"
            disabled={!flow.canLaunch || busy}
            onClick={() => void flow.launch()}
          >
            Launch market
          </button>
          <div style={{ marginTop: "1rem" }}>
            <div className="kv">
              <span className="k">Status</span>
              <span className="v" data-testid="launch-status">
                {info.label}
              </span>
            </div>
            <p className="small muted">{info.detail}</p>
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
            <div className="card" data-testid="launch-success-panel">
              <h3>Launch verified against the manifest</h3>
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
              <p>
                <a href={`/lab/token/${flow.receiptResult.tokenAddress}`}>Open the market page</a>
              </p>
            </div>
          ) : null}

          {flow.flowState === "launch-mismatch" ? (
            <div
              className="card"
              style={{ borderColor: "var(--bad)" }}
              data-testid="launch-mismatch-panel"
            >
              <h3 style={{ color: "var(--bad)" }}>
                Hard stop: receipt does not match the manifest
              </h3>
              <p className="small">
                The flow is stopped. Investigate before doing anything else. Mismatches:
              </p>
              <ul>
                {(flow.receiptResult?.mismatches ?? [flow.error ?? "Verification failed."]).map(
                  (m) => (
                    <li key={m} className="small" style={{ color: "var(--bad)" }}>
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
        <section className="card">
          <p className="muted">No prepared launch yet — go back and prepare the launch first.</p>
        </section>
      ) : null}
    </main>
  );
}
