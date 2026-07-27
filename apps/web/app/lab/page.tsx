"use client";
// Launch Lab landing. Renders ONLY real data (server config + live anchor
// verification) — no fabricated stats of any kind.
import { EXPLORER_BASE_URL, SPLIT, type AnchorVerification, type FeePreset } from "@bps/launch-lab";
import { useAnchor, useLabConfig } from "../../hooks/lab";

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function AnchorBadge({ anchor }: { anchor: AnchorVerification | undefined }) {
  if (!anchor) return <span className="badge">Verifying…</span>;
  if (anchor.status === "verified") return <span className="badge badge-good">Verified</span>;
  if (anchor.status === "verifying") return <span className="badge badge-warn">Verifying</span>;
  return <span className="badge badge-bad">{anchor.status}</span>;
}

function FeePresetCard({ preset }: { preset: FeePreset }) {
  return (
    <div
      className="card"
      style={preset.enabled ? undefined : { opacity: 0.55 }}
      data-testid={`preset-${preset.id}`}
    >
      <h2>
        {preset.label}{" "}
        {preset.enabled ? (
          <span className="badge">{preset.displayFee}</span>
        ) : (
          <span className="badge badge-bad">Disabled</span>
        )}
      </h2>
      <div className="kv">
        <span className="k">Pool fee units</span>
        <span className="v">{preset.poolFeeUnits}</span>
      </div>
      <div className="kv">
        <span className="k">Mode</span>
        <span className="v">{preset.mode}</span>
      </div>
      {!preset.enabled && preset.disabledReason ? (
        <p className="small muted">{preset.disabledReason}</p>
      ) : null}
    </div>
  );
}

export default function LabLandingPage() {
  const { data: config } = useLabConfig();
  const { data: anchor } = useAnchor();
  const explorer = config?.explorerBaseUrl ?? EXPLORER_BASE_URL;

  return (
    <main>
      <section style={{ marginBottom: "1.5rem" }}>
        <h1>Create community markets paired with real-world assets.</h1>
        <p className="muted">
          The BPS Launch Lab launches new tokens into Doppler markets quoted in the canonical GOOGL
          Robinhood Stock Token on Robinhood Chain (4663). Every launch is simulated, manifested,
          and verified against its on-chain receipt.
        </p>
        <p>
          <a href="/lab/create">Create a market</a>
          {" · "}
          <a href="/lab/proof">Genesis proof</a>
        </p>
      </section>

      <div className="grid">
        <section className="card" data-testid="genesis-card">
          <h2>Genesis market</h2>
          {config?.genesis.launched && config.genesis.tokenAddress ? (
            <p>
              Launched —{" "}
              <a href={`/lab/token/${config.genesis.tokenAddress}`}>
                view the Genesis market ({short(config.genesis.tokenAddress)})
              </a>
            </p>
          ) : (
            <p className="muted">Genesis market launching</p>
          )}
        </section>

        <section className="card" data-testid="anchor-card">
          <h2>
            GOOGL anchor <AnchorBadge anchor={anchor} />
          </h2>
          {anchor ? (
            <>
              <div className="kv">
                <span className="k">Name</span>
                <span className="v">{anchor.name || "—"}</span>
              </div>
              <div className="kv">
                <span className="k">Address</span>
                <span className="v">
                  <a
                    href={`${explorer}/address/${anchor.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {short(anchor.address)}
                  </a>
                </span>
              </div>
              <div className="kv">
                <span className="k">Multiplier</span>
                <span className="v">{anchor.currentMultiplier || "—"}</span>
              </div>
              <div className="kv">
                <span className="k">Mid price (USD)</span>
                <span className="v">{anchor.midPriceUsd}</span>
              </div>
              {anchor.status === "mismatch" && anchor.mismatchReason ? (
                <p className="small" style={{ color: "var(--bad)" }}>
                  {anchor.mismatchReason}
                </p>
              ) : null}
            </>
          ) : (
            <p className="muted">Verifying against the official Stock Token API…</p>
          )}
        </section>

        <section className="card" data-testid="fee-split">
          <h2>Fee economics</h2>
          <p className="small muted">
            LP fees from every market are split between fixed beneficiaries:
          </p>
          <div className="kv">
            <span className="k">Creator fees</span>
            <span className="v">{SPLIT.creatorFeePct.toString()}%</span>
          </div>
          <div className="kv">
            <span className="k">BPS</span>
            <span className="v">{SPLIT.bpsFeePct.toString()}%</span>
          </div>
          <div className="kv">
            <span className="k">Protocol (Doppler/Airlock owner)</span>
            <span className="v">{SPLIT.protocolPct.toString()}%</span>
          </div>
        </section>
      </div>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Fee presets</h2>
        <div className="grid">
          {(config?.feePresets ?? []).map((p) => (
            <FeePresetCard key={p.id} preset={p} />
          ))}
        </div>
      </section>

      <section style={{ marginTop: "1.5rem" }} className="card">
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Describe your token.</strong> Name, ticker, description, and image are uploaded
            to IPFS and pinned; the metadata URI is fixed before anything touches the chain.
          </li>
          <li>
            <strong>Review the exact launch.</strong> The server verifies the GOOGL anchor
            fail-closed, simulates the exact creation transaction, and produces a hashed manifest of
            every irreversible value.
          </li>
          <li>
            <strong>Launch and verify.</strong> Your wallet signs the prepared transaction; the
            receipt is decoded and checked against the manifest before the market page opens.
          </li>
        </ol>
        <p>
          <a href="/lab/create">Start creating</a>
        </p>
      </section>
    </main>
  );
}
