"use client";
import { useAccount, useChainId } from "wagmi";
import { CanaryBanner } from "./CanaryBanner";
import { resolveCanary } from "../lib/canary/manifest";
import { DEFAULT_CANARY_MANIFEST } from "../lib/canary/manifest.data";
import { canaryBlockReason, prepareCanaryAction, type CanaryOpKey } from "../lib/canary/operations";

// Canary-mode application view (Task 10B-2). Rendered INSTEAD of the demo dashboard when the canary profile
// is selected, so canary mode NEVER shows demonstration fixtures or canonical BPS addresses. Every operation
// resolves its target through the canary operations router against the canary manifest only, and provider-
// derived chain 4663 is required. With the committed fail-closed manifest (both approval flags false, null
// addresses/caps) every operation is BLOCKED. It uses the connected connector/provider for chain/account and
// constructs no wallet client and imports no deterministic key or fixture.
const OPERATIONS: readonly { label: string; key: CanaryOpKey }[] = [
  { label: "BPSC-TEST balance / ERC-20 reads", key: "canaryToken" },
  { label: "Buy / sell preparation (official router)", key: "tradeRouter" },
  { label: "Approvals (exact-amount)", key: "tradeRouter" },
  { label: "Locking / partial withdrawal", key: "lockingVault" },
  { label: "Acquisition budget / cycle reads / claim", key: "claimManager" },
  { label: "Stock-acquisition vault reads", key: "stockVault" },
  { label: "Coordinator / funding reads", key: "coordinator" },
];

export function CanaryApp() {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const state = resolveCanary(DEFAULT_CANARY_MANIFEST);
  const effectiveChain = isConnected ? chainId : null;
  const globalBlock = canaryBlockReason(state, effectiveChain);

  return (
    <main data-testid="canary-app">
      <CanaryBanner />
      <div className="card">
        <h2>BPSC-TEST canary — operations</h2>
        <p className="small muted">
          Canary mode routes every operation through the canary manifest only. No demonstration
          fixtures and no canonical BPS addresses are used. Provider-derived chain 4663 is required.
          Live writes stay disabled until an approved canary manifest sets both{" "}
          <code>broadcastReady</code> and <code>liveWritesApproved</code>.
        </p>
        <div className="kv">
          <span className="k">Provider chain</span>
          <span className="v" data-testid="canary-chain">
            {isConnected ? chainId : "not connected"}
          </span>
        </div>
        <div className="kv">
          <span className="k">Canary status</span>
          <span className="v" data-testid="canary-status">
            {state.status}
          </span>
        </div>
        {globalBlock ? (
          <p className="small" role="alert" data-testid="canary-global-block">
            All canary operations BLOCKED (fail-closed): {globalBlock}
          </p>
        ) : null}
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Operation</th>
                <th>Target</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {OPERATIONS.map((op) => {
                const r = prepareCanaryAction(state, effectiveChain, op.key);
                return (
                  <tr key={op.label} data-testid="canary-op-row" data-op-ok={r.ok ? "yes" : "no"}>
                    <td>{op.label}</td>
                    <td>{r.ok ? r.value.target : "—"}</td>
                    <td>{r.ok ? "ready" : `BLOCKED: ${r.reason}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
