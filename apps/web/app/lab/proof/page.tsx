"use client";
// Genesis proof page. Pre-launch: a pending checklist (nothing fabricated).
// Post-launch: every hash with Blockscout links.
import { EXPLORER_BASE_URL } from "@bps/launch-lab";
import { useLabConfig, useProof } from "../../../hooks/lab";

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

function Pending() {
  return <span className="badge badge-warn">Pending</span>;
}

export default function LabProofPage() {
  const proof = useProof();
  const { data: config } = useLabConfig();
  const explorer = config?.explorerBaseUrl ?? EXPLORER_BASE_URL;

  if (proof.isPending) {
    return (
      <main>
        <p className="muted">Loading proof record…</p>
      </main>
    );
  }
  if (proof.isError || !proof.data) {
    return (
      <main>
        <p className="muted">Proof record unavailable: {proof.error?.message ?? "unknown error"}</p>
      </main>
    );
  }
  const record = proof.data;
  const launched = record.receipt !== null;

  return (
    <main>
      <h1>Genesis proof</h1>
      <p className="muted">
        Everything on this page is drawn from the deployment itself, the static registry, and live
        verification — nothing is fabricated before it exists.
      </p>

      <section className="card" data-testid="proof-checklist">
        <h2>{launched ? "Launch record" : "Pre-launch checklist"}</h2>
        <Row k="Deployment URL" v={record.deploymentUrl} />
        <Row k="Source commit" v={record.sourceCommit} />
        <Row
          k="Anchor verification (live)"
          v={
            record.anchor ? (
              record.anchor.status === "verified" ? (
                <span className="badge badge-good">Verified</span>
              ) : (
                <span className="badge badge-bad">{record.anchor.status}</span>
              )
            ) : (
              <Pending />
            )
          }
        />
        <Row k="Launch manifest" v={record.manifestHash ? record.manifestHash : <Pending />} />
        <Row
          k="Simulation"
          v={
            record.simulation ? (
              `block ${record.simulation.simulationBlock} · gas ${record.simulation.gasEstimate}`
            ) : (
              <Pending />
            )
          }
        />
        <Row
          k="Launch receipt"
          v={
            record.receipt ? (
              <a
                href={`${explorer}/tx/${record.receipt.launchTransactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {short(record.receipt.launchTransactionHash)}
              </a>
            ) : (
              <Pending />
            )
          }
        />
        <Row
          k="Verification buy"
          v={
            record.buyTransactionHash ? (
              <a
                href={`${explorer}/tx/${record.buyTransactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {short(record.buyTransactionHash)}
              </a>
            ) : (
              <Pending />
            )
          }
        />
        <Row
          k="Verification sell"
          v={
            record.sellTransactionHash ? (
              <a
                href={`${explorer}/tx/${record.sellTransactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {short(record.sellTransactionHash)}
              </a>
            ) : (
              <Pending />
            )
          }
        />
        <Row k="Anchor reserve (wei)" v={record.anchorReserveWei ?? <Pending />} />
      </section>

      {launched && record.receipt ? (
        <section className="card" style={{ marginTop: "1rem" }} data-testid="proof-launched">
          <h2>Receipt facts</h2>
          <Row
            k="Token address"
            v={
              <a
                href={`${explorer}/address/${record.receipt.tokenAddress}`}
                target="_blank"
                rel="noreferrer"
              >
                {record.receipt.tokenAddress}
              </a>
            }
          />
          <Row k="Pool id" v={record.receipt.poolId} />
          <Row k="Confirmation block" v={record.receipt.confirmationBlock} />
          <Row k="Creator" v={record.receipt.creator} />
          <Row
            k="Matches manifest"
            v={
              record.receipt.matchesManifest ? (
                <span className="badge badge-good">Yes</span>
              ) : (
                <span className="badge badge-bad">NO — mismatched</span>
              )
            }
          />
          {record.receipt.mismatches.length > 0 ? (
            <ul>
              {record.receipt.mismatches.map((m) => (
                <li key={m} className="small" style={{ color: "var(--bad)" }}>
                  {m}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {record.notes.length > 0 ? (
        <section className="card" style={{ marginTop: "1rem" }}>
          <h2>Notes</h2>
          <ul>
            {record.notes.map((n) => (
              <li key={n} className="small muted">
                {n}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {record.anchor ? (
        <section className="card" style={{ marginTop: "1rem" }} data-testid="proof-anchor">
          <h2>Live anchor verification</h2>
          <Row k="Status" v={record.anchor.status} />
          <Row
            k="Address"
            v={
              <a
                href={`${explorer}/address/${record.anchor.address}`}
                target="_blank"
                rel="noreferrer"
              >
                {record.anchor.address}
              </a>
            }
          />
          <Row k="Multiplier" v={record.anchor.currentMultiplier || "—"} />
          <Row k="Mid price (USD)" v={record.anchor.midPriceUsd} />
          <Row k="Fetched" v={new Date(record.anchor.fetchedAt).toISOString()} />
        </section>
      ) : null}
    </main>
  );
}
