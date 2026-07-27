"use client";
// Per-market proof / advisor page. Next 16: `params` is a Promise — unwrapped
// with React.use() in the default page export, which delegates to the client
// ProofTrailView (also exported for direct testing).
//
// The evidence trail is assembled from REAL sources only:
//   - GET /api/lab/token/[address]  (useMarket)   → identity, pool, launch tx, locked/no-op status
//   - GET /api/lab/history/[address] (useHistory)  → indexed swap activity
//   - GET /api/lab/proof            (useProof)     → deployment provenance, manifest + verification hashes
// Before launch every not-yet-true item renders a pending pill; anything not yet
// indexed renders the .lab-await treatment. Nothing is ever fabricated.
import { use } from "react";
import { EXPLORER_BASE_URL, type MarketSnapshot, type ProofRecord } from "@bps/launch-lab";
import { useHistory, useLabConfig, useMarket, useProof } from "../../../../hooks/lab";

function short(v: string): string {
  return v.length > 14 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v;
}

type ItemStatus = "verified" | "pending";

interface ProofItem {
  key: string;
  title: string;
  detail: string;
  status: ItemStatus;
  /** Rendered evidence (hash chip + optional Blockscout link) when known. */
  evidence: React.ReactNode | null;
}

function Await() {
  return <span className="lab-await">awaiting indexed data</span>;
}

function Chip({ text, href }: { text: string; href?: string }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}
    >
      <span
        className="lab-data"
        style={{
          fontSize: 13,
          background: "var(--warm-white)",
          border: "1px solid var(--peach-grey)",
          borderRadius: 10,
          padding: "7px 12px",
        }}
      >
        {text}
      </span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600 }}>
          verify on Blockscout ↗
        </a>
      ) : null}
    </div>
  );
}

function buildItems(
  snap: MarketSnapshot,
  proof: ProofRecord | undefined,
  explorer: string,
  indexedSwaps: number | null,
): ProofItem[] {
  const anchorVerified = snap.anchor.status === "verified";
  const launched = snap.launchTransactionHash.available;
  const locked = snap.poolStatus.available && snap.poolStatus.value === 2;

  return [
    {
      key: "metadata",
      title: "token metadata pinned",
      detail:
        "Name, ticker, image and description are content-addressed. The URI the chain references cannot be swapped later.",
      status: snap.tokenUri.available ? "verified" : "pending",
      evidence: snap.tokenUri.available ? <Chip text={snap.tokenUri.value} /> : <Await />,
    },
    {
      key: "anchor",
      title: "GOOGL anchor verified",
      detail:
        "The quote asset was checked against the canonical protocol registry. Paired with Alphabet Class A • Robinhood Token (GOOGL).",
      status: anchorVerified ? "verified" : "pending",
      evidence: (
        <Chip
          text={short(snap.anchor.address)}
          href={`${explorer}/address/${snap.anchor.address}`}
        />
      ),
    },
    {
      key: "manifest",
      title: "launch manifest assembled",
      detail:
        "Supply 1,000,000,000 · balanced 1% fee · 85% creator beneficiary · 10% BPS Launch Lab · 5% Doppler protocol. The hash commits to every value.",
      status: proof?.manifestHash ? "verified" : "pending",
      evidence: proof?.manifestHash ? <Chip text={proof.manifestHash} /> : <Await />,
    },
    {
      key: "launch-tx",
      title: "launch transaction",
      detail: "Decoded from the confirmed transaction: token created, pool created.",
      status: launched ? "verified" : "pending",
      evidence: launched ? (
        <Chip
          text={short(snap.launchTransactionHash.value)}
          href={`${explorer}/tx/${snap.launchTransactionHash.value}`}
        />
      ) : (
        <Await />
      ),
    },
    {
      key: "token-address",
      title: "token address",
      detail: "The deployed market token this proof trail describes.",
      status: "verified",
      evidence: <Chip text={snap.tokenAddress} href={`${explorer}/address/${snap.tokenAddress}`} />,
    },
    {
      key: "pool",
      title: "pool created",
      detail: "The Uniswap v4 pool that holds the market's liquidity.",
      status: snap.poolId.available ? "verified" : "pending",
      evidence: snap.poolId.available ? <Chip text={snap.poolId.value} /> : <Await />,
    },
    {
      key: "locked",
      title: "locked-market configuration",
      detail:
        "Fixed permanently at launch through a verified no-op migration and locked-market configuration.",
      status: locked ? "verified" : "pending",
      evidence: locked ? <Chip text="pool status 2 · locked" /> : <Await />,
    },
    {
      key: "buy",
      title: "verification buy",
      detail:
        "A real swap GOOGL → token proving the market accepts buys and routes fees per the manifest.",
      status: proof?.buyTransactionHash ? "verified" : "pending",
      evidence: proof?.buyTransactionHash ? (
        <Chip
          text={short(proof.buyTransactionHash)}
          href={`${explorer}/tx/${proof.buyTransactionHash}`}
        />
      ) : (
        <Await />
      ),
    },
    {
      key: "sell",
      title: "verification sell",
      detail: "A real swap token → GOOGL proving two-sided liquidity and honest exit pricing.",
      status: proof?.sellTransactionHash ? "verified" : "pending",
      evidence: proof?.sellTransactionHash ? (
        <Chip
          text={short(proof.sellTransactionHash)}
          href={`${explorer}/tx/${proof.sellTransactionHash}`}
        />
      ) : indexedSwaps !== null && indexedSwaps > 0 ? (
        <p className="lab-muted" style={{ fontSize: 13, marginTop: 12 }}>
          {indexedSwaps} indexed swap{indexedSwaps === 1 ? "" : "s"} observed; the explicit
          verification pair is not yet recorded.
        </p>
      ) : (
        <Await />
      ),
    },
  ];
}

export function ProofTrailView({ address }: { address: string }) {
  const market = useMarket(address);
  const proofQuery = useProof();
  const history = useHistory(address);
  const { data: config } = useLabConfig();
  const explorer = config?.explorerBaseUrl ?? EXPLORER_BASE_URL;
  const snap = market.data;

  if (market.isPending) {
    return (
      <main>
        <p className="lab-muted">Loading proof trail…</p>
      </main>
    );
  }
  if (market.isError || !snap) {
    return (
      <main>
        <div className="lab-label">evidence</div>
        <h1 className="lab-h1">
          the proof <span className="lab-serif">trail</span>
        </h1>
        <p className="lab-muted" data-testid="proof-market-error" style={{ marginTop: 14 }}>
          This address is not a recognized BPS market yet:{" "}
          {market.error ? market.error.message : "no snapshot available"}.
        </p>
      </main>
    );
  }

  const indexedSwaps = history.available ? history.swaps.length : null;
  const items = buildItems(snap, proofQuery.data, explorer, indexedSwaps);
  const doneCount = items.filter((it) => it.status === "verified").length;
  const launched = snap.launchTransactionHash.available;
  const allVerified = doneCount === items.length;

  return (
    <main>
      <header style={{ marginBottom: 32 }}>
        <div className="lab-label">evidence</div>
        <h1 className="lab-h1">
          the proof <span className="lab-serif">trail</span>
        </h1>
        <p className="lab-lead" style={{ marginTop: 14 }}>
          Written for advisors and skeptics. Every claim below links to a primary source — a
          contract, a transaction, or a pinned document. Nothing here asks to be believed.
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            marginTop: 16,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 20, color: "var(--deep-ink)" }}>
            {snap.tokenName}
          </span>
          <span className="lab-label">{snap.tokenSymbol}</span>
          <a
            href={`${explorer}/address/${snap.tokenAddress}`}
            target="_blank"
            rel="noreferrer"
            className="lab-data"
            style={{ fontSize: 13 }}
            data-testid="proof-token-link"
          >
            {short(snap.tokenAddress)} ↗
          </a>
        </div>
        {launched && allVerified ? (
          <span
            className="lab-pill lab-pill--good"
            data-testid="proof-progress"
            style={{ marginTop: 16 }}
          >
            ✓ complete — all {items.length} items verified onchain
          </span>
        ) : (
          <span
            className="lab-pill lab-pill--warn"
            data-testid="proof-progress"
            style={{ marginTop: 16 }}
          >
            launch in preparation — {doneCount} of {items.length} items verified
          </span>
        )}
      </header>

      <div style={{ display: "grid", gap: 16 }} data-testid="proof-checklist">
        {items.map((it) => (
          <section
            key={it.key}
            className="lab-card"
            data-testid={`proof-item-${it.key}`}
            style={it.status === "verified" ? undefined : { background: "#fbf9f7" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 17, color: "var(--deep-ink)" }}>
                {it.title}
              </span>
              {it.status === "verified" ? (
                <span className="lab-pill lab-pill--good">verified</span>
              ) : (
                <span className="lab-pill" data-testid="proof-pending-pill">
                  pending
                </span>
              )}
            </div>
            <p className="lab-muted" style={{ fontSize: 14, margin: "6px 0 0", lineHeight: 1.55 }}>
              {it.detail}
            </p>
            {it.evidence}
          </section>
        ))}
      </div>

      <section
        className="lab-card lab-card--nested"
        style={{ marginTop: 20 }}
        data-testid="proof-provenance"
      >
        <div className="lab-label" style={{ marginBottom: 8 }}>
          deployment provenance
        </div>
        <div className="lab-kv">
          <span>Deployment</span>
          <span className="lab-data">
            {proofQuery.data ? proofQuery.data.deploymentUrl : <Await />}
          </span>
        </div>
        <div className="lab-kv">
          <span>Source commit</span>
          <span className="lab-data">
            {proofQuery.data ? proofQuery.data.sourceCommit : <Await />}
          </span>
        </div>
        <div className="lab-kv">
          <span>Indexed swaps</span>
          <span className="lab-data">{indexedSwaps === null ? <Await /> : indexedSwaps}</span>
        </div>
      </section>
    </main>
  );
}

export default function LabTokenProofPage({
  params,
}: {
  params: Promise<{ tokenAddress: string }>;
}) {
  const { tokenAddress } = use(params);
  return <ProofTrailView address={tokenAddress} />;
}
