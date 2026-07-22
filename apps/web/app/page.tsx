import { ECON_DISCLOSURE } from "../lib/economics";
import { DRY_RUN_MANIFEST, FIXTURE_LABEL, SAMPLE_TRANSPARENCY } from "../lib/fixtures";
import { LOCK_TIERS } from "../lib/locking";
import { resolveDeployment, writesAllowed } from "../lib/manifest";
import { buildTransparencyReport, type Provenance } from "../lib/transparency";

// The interface is driven by the configured deployment manifest. In this build the only manifest is the
// dry-run (not broadcast-ready) manifest, so the app resolves to "not live" and every write is disabled.
// Fixture-derived figures are explicitly labeled and never presented as live on-chain state.
const deployment = resolveDeployment(DRY_RUN_MANIFEST);
const canWrite = writesAllowed(deployment);
const report = buildTransparencyReport(SAMPLE_TRANSPARENCY);

const WEI = 10n ** 18n;
function fmt(x: bigint | null, unit = ""): string {
  if (x === null) return "—";
  const whole = x / WEI;
  const frac = ((x % WEI) * 1000n) / WEI;
  return `${whole.toString()}.${frac.toString().padStart(3, "0")}${unit ? " " + unit : ""}`;
}

function Prov({ p }: { p: Provenance }) {
  return <span className={`prov prov-${p}`}>{p}</span>;
}

function DisabledAction({ label }: { label: string }) {
  return (
    <button
      className="btn-disabled"
      disabled
      aria-disabled="true"
      title="Protocol not live — writes disabled"
    >
      {label} (disabled)
    </button>
  );
}

const ELIGIBILITY_GATES: readonly string[] = [
  "1 · Connect a wallet",
  "2 · Be on Robinhood Chain (id 4663)",
  "3 · Sign the restricted-beta declarations (EIP-712)",
  "4 · Pass a SEPARATE jurisdiction/eligibility check — signing alone is never sufficient",
  "5 · Eligible → write actions unlock (only in a live, broadcast-ready deployment)",
];

const LIVE_BLOCKERS: readonly string[] = [
  "User-supplied deployer and role addresses (treasury, owner, reserve, operator, publisher, recovery)",
  "Approved restricted-beta stock basket selection",
  "BPS/WETH pool, fee tier and liquidity plan",
  "Production RPC endpoint",
  "Protected Rialto quote-service configuration (server-only)",
  "Explicit maximum acquisition size and slippage policy",
  "Actual broadcast-path creator/nonce rehearsal using only ephemeral credentials",
  "Independent external smart-contract security review",
  "External jurisdiction and eligibility review",
  "Separate explicit authorization before any live broadcast",
];

export default function HomePage() {
  return (
    <main>
      <section className="banner" role="status" aria-live="polite">
        <strong>Protocol not live.</strong>{" "}
        {deployment.status === "not-live" ? deployment.reason : "no valid live deployment manifest"}
        . All trade, lock and claim write actions are disabled. This restricted beta is not a public
        launch and is <strong>not fully decentralized</strong>: it relies on a trusted acquisition
        operator, a governed root publisher, and a centralized, permissioned Rialto quote service.
      </section>

      <div className="grid">
        <div className="card">
          <h2>Official BPS trade (BPSTradeRouter)</h2>
          <p className="small muted">
            Official trades route only through the BPSTradeRouter. Direct external-pool
            (SwapRouter02) trades are outside the official accounting path and are not offered here.
          </p>
          <h3>Buy allocation</h3>
          <div className="kv">
            <span className="k">Stock acquisition</span>
            <span className="v">{ECON_DISCLOSURE.buy.stockAcquisition}</span>
          </div>
          <div className="kv">
            <span className="k">BPS repurchase &amp; burn</span>
            <span className="v">{ECON_DISCLOSURE.buy.burn}</span>
          </div>
          <div className="kv">
            <span className="k">Total protocol allocation</span>
            <span className="v">{ECON_DISCLOSURE.buy.total}</span>
          </div>
          <h3>Sell allocation</h3>
          <div className="kv">
            <span className="k">Stock acquisition</span>
            <span className="v">{ECON_DISCLOSURE.sell.stockAcquisition}</span>
          </div>
          <div className="kv">
            <span className="k">Direct BPS burn</span>
            <span className="v">{ECON_DISCLOSURE.sell.burn}</span>
          </div>
          <div className="kv">
            <span className="k">Total protocol allocation</span>
            <span className="v">{ECON_DISCLOSURE.sell.total}</span>
          </div>
          <p className="small muted" style={{ marginTop: "0.75rem" }}>
            Approvals are always for the exact input amount (never unlimited). Trades simulate
            before submission and fail closed on stale quotes, expired deadlines or manifest
            mismatch.
          </p>
          <div style={{ marginTop: "0.75rem" }}>
            <DisabledAction label="Trade" />
          </div>
        </div>

        <div className="card">
          <h2>Locking (BPSLockingVault · vebps-1)</h2>
          <p className="small muted">
            Locking establishes eligibility for future distributions. It does not guarantee an
            allocation and pays no yield, APY or interest.
          </p>
          <h3>Fixed terms</h3>
          {LOCK_TIERS.map((t) => (
            <div className="kv" key={t.durationSec}>
              <span className="k">{t.label}</span>
              <span className="v">{(t.multiplierBps / 100).toFixed(0)}% weight</span>
            </div>
          ))}
          <div style={{ marginTop: "0.75rem" }}>
            <DisabledAction label="Create lock" />
          </div>
        </div>

        <div className="card">
          <h2>Distribution claims (DistributionClaimManager)</h2>
          <p className="small muted">
            Entitlement comes from a published Proof-of-Distribution artifact and is verified
            against the on-chain cycle and a locally recomputed Merkle proof. Entitlement is never
            inferred from wallet holdings, and a proof is never fabricated when the artifact is
            unavailable.
          </p>
          <div style={{ marginTop: "0.75rem" }}>
            <DisabledAction label="Claim distribution" />
          </div>
        </div>

        <div className="card">
          <h2>Eligibility gates</h2>
          <p className="small muted">
            Every write action stays disabled until all gates pass. The frontend makes no legal or
            jurisdiction determination.
          </p>
          {ELIGIBILITY_GATES.map((g) => (
            <div className="kv" key={g}>
              <span className="k">{g}</span>
            </div>
          ))}
          <p className="small muted" style={{ marginTop: "0.75rem" }}>
            Robinhood Stock Tokens carry jurisdiction and eligibility restrictions and involve risk
            of loss. Eligibility is determined by a separate configured boundary, subject to
            external legal and eligibility review.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>On-chain transparency</h2>
        <div className="fixture-note">{FIXTURE_LABEL}</div>
        <div className="grid">
          <div className="kv">
            <span className="k">Official buy volume (WETH)</span>
            <span className="v">
              {fmt(report.buyVolume.value)} <Prov p={report.buyVolume.provenance} />
            </span>
          </div>
          <div className="kv">
            <span className="k">Official sell volume (WETH)</span>
            <span className="v">
              {fmt(report.sellVolume.value)} <Prov p={report.sellVolume.provenance} />
            </span>
          </div>
          <div className="kv">
            <span className="k">Total BPS burned</span>
            <span className="v">
              {fmt(report.totalBpsBurned.value)} <Prov p={report.totalBpsBurned.provenance} />
            </span>
          </div>
          <div className="kv">
            <span className="k">Stock budget accrued (WETH)</span>
            <span className="v">
              {fmt(report.stockAcquisitionBudgetAccrued.value)}{" "}
              <Prov p={report.stockAcquisitionBudgetAccrued.provenance} />
            </span>
          </div>
          <div className="kv">
            <span className="k">Budget spent on acquisitions (WETH)</span>
            <span className="v">
              {fmt(report.stockAcquisitionBudgetSpent.value)}{" "}
              <Prov p={report.stockAcquisitionBudgetSpent.provenance} />
            </span>
          </div>
          <div className="kv">
            <span className="k">Pending budget (no acquisition yet)</span>
            <span className="v">
              {fmt(report.pendingBudgetNotYetAcquired.value)}{" "}
              <Prov p={report.pendingBudgetNotYetAcquired.provenance} />
            </span>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: "0.5rem" }}>
          {report.acquisitionDisclaimer} {report.rialtoNote}
        </p>
        <h3>Acquisitions → cycles</h3>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Acq ID</th>
                <th>Stock</th>
                <th>WETH spent</th>
                <th>Acquired</th>
                <th>80% distribution</th>
                <th>20% reserve</th>
                <th>Cycle</th>
                <th>Released</th>
                <th>Remaining</th>
                <th>80/20 OK</th>
              </tr>
            </thead>
            <tbody>
              {report.acquisitions.map((a) => (
                <tr key={a.acquisitionId.toString()}>
                  <td>{a.acquisitionId.toString()}</td>
                  <td>{a.stockToken}</td>
                  <td>{fmt(a.wethSpent.value)}</td>
                  <td>{fmt(a.acquiredStock.value)}</td>
                  <td>{fmt(a.distribution80.value)}</td>
                  <td>{fmt(a.reserve20.value)}</td>
                  <td>{a.cycleId.value === null ? "—" : a.cycleId.value.toString()}</td>
                  <td>{fmt(a.released.value)}</td>
                  <td>{fmt(a.remaining.value)}</td>
                  <td>{a.splitReconciles ? "✓" : "✗"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>Remaining live blockers</h2>
        <p className="small muted">
          This interface can be fully exercised against local/fork fixtures without broadcasting.
          Going live additionally requires:
        </p>
        <ul className="blockers">
          {LIVE_BLOCKERS.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <p className="small muted" style={{ marginTop: "0.5rem" }}>
          Legal/eligibility and independent security reviews are <strong>not</strong> complete.
          Writes enabled: <strong>{canWrite ? "yes" : "no"}</strong>.
        </p>
      </div>
    </main>
  );
}
