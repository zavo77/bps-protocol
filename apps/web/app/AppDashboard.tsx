"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useConfig,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { getPublicClient } from "wagmi/actions";
import { type Config } from "wagmi";
import { type Address } from "viem";
import { ROBINHOOD_CHAIN_ID } from "../lib/chain";
import { ECON_DISCLOSURE } from "../lib/economics";
import { writesAllowed } from "../lib/manifest";
import {
  deriveEligibilityState,
  eligibilityWriteGate,
  verifyDeclaration,
  type DeclarationVerdict,
  type EligibilityResult,
} from "../lib/eligibility";
import { buildTradePreview } from "../lib/trade";
import { verifyClaim, type Entitlement, type OnchainCycle } from "../lib/claim";
import { buildTransparencyReport } from "../lib/transparency";
import { readClaimRemaining, readErc20 } from "../lib/services/reads";
import { runActionLifecycle, type LifecycleStep } from "../lib/wallet/tx";
import { localTestAccount } from "../lib/testing/local-account";
import { createDemoWalletClient } from "../lib/testing/local-env";
import { SAMPLE_TRANSPARENCY, FIXTURE_LABEL } from "../lib/fixtures";
import {
  DEMO,
  demoDeclarationConfig,
  demoDeployment,
  demoEligibilityService,
  demoProofProvider,
} from "./demo";
import { encodeFunctionData } from "viem";
import { bpsTradeRouterAbi, distributionClaimManagerAbi } from "../lib/abis";

const WEI = 10n ** 18n;
const fmt = (x: bigint | null) =>
  x === null
    ? "—"
    : `${(x / WEI).toString()}.${(((x % WEI) * 1000n) / WEI).toString().padStart(3, "0")}`;

export function AppDashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, error: switchError } = useSwitchChain();
  const config = useConfig();

  const [verdict, setVerdict] = useState<DeclarationVerdict | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityResult>("unknown");
  // The mock connector reports chain 4663 immediately; to exercise the wrong-network → switch flow in
  // the demo, we start in a simulated wrong-network state that a real switchChain() call clears.
  const [simulatedWrongNetwork, setSimulatedWrongNetwork] = useState(true);

  const onCorrectChain = chainId === ROBINHOOD_CHAIN_ID && !simulatedWrongNetwork;
  const wallet = {
    address: (address ?? null) as Address | null,
    chainId: isConnected ? chainId : null,
  };
  const eligState = deriveEligibilityState(wallet, verdict, eligibility);
  const eligible = eligibilityWriteGate(eligState);
  const liveWrites = writesAllowed(demoDeployment); // false: fixture manifest → live writes disabled

  const signDeclaration = useCallback(async () => {
    if (!address) return;
    const message = {
      wallet: address as Address,
      documentHash: demoDeclarationConfig.documentHash,
      documentVersion: demoDeclarationConfig.documentVersion,
      nonce: 1n,
      expiry: 4_000_000_000n,
    };
    // LOCAL-TEST signing: the connected demo account is the local-test account; sign directly with it.
    const signature = await localTestAccount.signTypedData({
      domain: demoDeclarationConfig.domain,
      types: demoDeclarationConfig.types,
      primaryType: "Declaration",
      message,
    });
    const v = await verifyDeclaration(
      { message, signature, chainId: ROBINHOOD_CHAIN_ID },
      {
        currentDocumentVersion: demoDeclarationConfig.documentVersion,
        currentDocumentHash: demoDeclarationConfig.documentHash,
        nowSec: 1_000_000_000n,
        usedNonces: new Set(),
      },
    );
    setVerdict(v);
    // Eligibility is a SEPARATE result from the configured (local mock) service.
    setEligibility(await demoEligibilityService.check(address));
  }, [address]);

  return (
    <main data-testid="app">
      <section className="banner" role="status" aria-live="polite" data-testid="not-live-banner">
        <strong>Protocol not live.</strong> Live protocol writes are disabled (no broadcast-ready
        deployment manifest). This is a <strong>local demonstration</strong> and is{" "}
        <strong>not fully decentralized</strong>: it depends on a trusted acquisition operator, a
        governed root publisher, and a centralized, permissioned Rialto quote service. Live writes
        enabled: <strong>{liveWrites ? "yes" : "no"}</strong>.
      </section>
      <div className="fixture-note">{FIXTURE_LABEL}</div>

      <div className="grid">
        <WalletPanel
          isConnected={isConnected}
          connecting={connecting}
          onConnect={() => connect({ connector: connectors[0]! })}
          onDisconnect={() => disconnect()}
          address={address}
          onCorrectChain={onCorrectChain}
          chainId={chainId}
          onSwitch={() => {
            switchChain({ chainId: ROBINHOOD_CHAIN_ID });
            setSimulatedWrongNetwork(false);
          }}
          onSign={signDeclaration}
          eligStateKind={eligState.kind}
          eligible={eligible}
          connectError={connectError?.message ?? null}
          switchError={switchError?.message ?? null}
        />
        <TradePanel
          eligible={eligible}
          onCorrectChain={onCorrectChain}
          config={config}
          address={address}
        />
        <LockPanel onCorrectChain={onCorrectChain} config={config} address={address} />
        <ClaimPanel
          eligible={eligible}
          onCorrectChain={onCorrectChain}
          config={config}
          address={address}
        />
      </div>

      <TransparencyPanel />
    </main>
  );
}

function StepList({ steps }: { steps: readonly LifecycleStep[] }) {
  if (steps.length === 0) return null;
  return (
    <p className="small muted" data-testid="steps">
      Lifecycle: {steps.join(" → ")}
    </p>
  );
}

function WalletPanel(p: {
  isConnected: boolean;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  address: string | undefined;
  onCorrectChain: boolean;
  chainId: number;
  onSwitch: () => void;
  onSign: () => void;
  eligStateKind: string;
  eligible: boolean;
  connectError: string | null;
  switchError: string | null;
}) {
  return (
    <div className="card">
      <h2>Wallet &amp; eligibility</h2>
      {!p.isConnected ? (
        <button onClick={p.onConnect} disabled={p.connecting} data-testid="connect">
          {p.connecting ? "Connecting…" : "Connect wallet (local mock)"}
        </button>
      ) : (
        <>
          <div className="kv">
            <span className="k">Account</span>
            <span className="v" data-testid="account">
              {p.address}
            </span>
          </div>
          <div className="kv">
            <span className="k">Network</span>
            <span className="v" data-testid="network">
              {p.onCorrectChain ? "Robinhood Chain (4663)" : "Wrong network — switch to continue"}
            </span>
          </div>
          {!p.onCorrectChain ? (
            <button onClick={p.onSwitch} data-testid="switch">
              Switch to Robinhood Chain (4663)
            </button>
          ) : (
            <button onClick={p.onSign} data-testid="sign">
              Sign restricted-beta declaration (local-test)
            </button>
          )}
          <div className="kv" style={{ marginTop: "0.5rem" }}>
            <span className="k">Eligibility state</span>
            <span className="v" data-testid="elig-state">
              {p.eligStateKind}
            </span>
          </div>
          <p className="small muted">
            Signing never establishes eligibility; a separate local mock eligibility service
            decides. Write actions unlock only when eligible:{" "}
            <strong data-testid="eligible">{p.eligible ? "yes" : "no"}</strong>.
          </p>
          <button onClick={p.onDisconnect} className="small">
            Disconnect
          </button>
        </>
      )}
      {p.connectError && (
        <p className="small" style={{ color: "var(--bad)" }} data-testid="connect-error">
          {p.connectError}
        </p>
      )}
      {p.switchError && (
        <p className="small" style={{ color: "var(--bad)" }} data-testid="switch-error">
          {p.switchError}
        </p>
      )}
    </div>
  );
}

function TradePanel(p: {
  eligible: boolean;
  onCorrectChain: boolean;
  config: Config;
  address: string | undefined;
}) {
  const [steps, setSteps] = useState<LifecycleStep[]>([]);
  const [result, setResult] = useState<string>("");
  const preview = useMemo(() => {
    if (demoDeployment.status !== "live" || !p.address) return null;
    return buildTradePreview(
      {
        direction: "buy",
        amountIn: WEI,
        expectedUserOut: 500n * WEI,
        slippageBps: 100,
        recipient: p.address as Address,
        nowSec: 1000n,
        ttlSec: 600n,
        poolFee: 3000,
      },
      demoDeployment,
    );
  }, [p.address]);

  const runDemo = useCallback(async () => {
    if (!preview || !p.address) return;
    setSteps([]);
    setResult("running…");
    try {
      const pub = getPublicClient(p.config);
      if (!pub) return;
      const wallet = createDemoWalletClient(pub);
      const data = encodeFunctionData({
        abi: bpsTradeRouterAbi,
        functionName: "buyExactWethForBps",
        args: [preview.amountIn, preview.minUserOut, 0n, p.address as Address, preview.deadline],
      });
      const res = await runActionLifecycle(
        { pub, wallet, account: localTestAccount },
        {
          target: preview.target,
          data,
          value: 0n,
          approval: { token: DEMO.weth, spender: preview.target, amount: preview.allowanceAmount },
          confirmations: 1,
        },
        (s) => setSteps((prev) => [...prev, s]),
      );
      setResult(res.ok ? `confirmed ${res.hash}` : `failed at ${res.step}: ${res.reason}`);
    } catch (e) {
      setResult(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [preview, p.config, p.address]);

  return (
    <div className="card">
      <h2>Official trade (BPSTradeRouter)</h2>
      <p className="small muted">
        Routes only through BPSTradeRouter — never SwapRouter02. Exact allowance, never unlimited.
      </p>
      {preview && (
        <>
          <div className="kv">
            <span className="k">Direction</span>
            <span className="v">buy</span>
          </div>
          <div className="kv">
            <span className="k">Input</span>
            <span className="v">{fmt(preview.amountIn)} WETH</span>
          </div>
          <div className="kv">
            <span className="k">Min output</span>
            <span className="v" data-testid="minout">
              {fmt(preview.minUserOut)} BPS
            </span>
          </div>
          <div className="kv">
            <span className="k">Stock acquisition</span>
            <span className="v">{ECON_DISCLOSURE.buy.stockAcquisition}</span>
          </div>
          <div className="kv">
            <span className="k">BPS burn</span>
            <span className="v">{ECON_DISCLOSURE.buy.burn}</span>
          </div>
          <div className="kv">
            <span className="k">Exact allowance</span>
            <span className="v" data-testid="allowance">
              {fmt(preview.allowanceAmount)} WETH
            </span>
          </div>
          <div className="kv">
            <span className="k">Target</span>
            <span className="v">{preview.target}</span>
          </div>
          <div className="kv">
            <span className="k">Chain</span>
            <span className="v">{preview.chainId}</span>
          </div>
        </>
      )}
      <button className="btn-disabled" disabled aria-disabled="true" data-testid="live-trade">
        Submit live trade (disabled — protocol not live)
      </button>
      <button
        onClick={runDemo}
        disabled={!p.eligible || !p.onCorrectChain}
        data-testid="demo-trade"
        style={{ marginTop: "0.5rem" }}
      >
        Run local demonstration (mock)
      </button>
      <StepList steps={steps} />
      {result && (
        <p className="small" data-testid="trade-result">
          {result}
        </p>
      )}
    </div>
  );
}

function LockPanel(p: { onCorrectChain: boolean; config: Config; address: string | undefined }) {
  const [bal, setBal] = useState<bigint | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!p.address || !p.onCorrectChain) return;
      try {
        const lp = getPublicClient(p.config);
        if (!lp) return;
        const snap = await readErc20(lp, DEMO.bps, p.address as Address, DEMO.lockingVault);
        if (live) setBal(snap.balance);
      } catch {
        if (live) setBal(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [p.config, p.address, p.onCorrectChain]);
  return (
    <div className="card">
      <h2>Locking (BPSLockingVault)</h2>
      <p className="small muted">
        Locking establishes distribution eligibility. No yield, APY or interest.
      </p>
      <div className="kv">
        <span className="k">BPS balance</span>
        <span className="v" data-testid="bps-balance">
          {fmt(bal)}
        </span>
      </div>
      <button className="btn-disabled" disabled aria-disabled="true">
        Create lock (disabled — protocol not live)
      </button>
    </div>
  );
}

function ClaimPanel(p: {
  eligible: boolean;
  onCorrectChain: boolean;
  config: Config;
  address: string | undefined;
}) {
  const [status, setStatus] = useState<string>("");
  const [verified, setVerified] = useState<boolean>(false);
  const [claimed, setClaimed] = useState<boolean>(false);
  const [steps, setSteps] = useState<LifecycleStep[]>([]);

  const verify = useCallback(async () => {
    if (!p.address) return;
    const artifact = await demoProofProvider.getArtifact(DEMO.cycleId, p.address as Address);
    if (!artifact) {
      setStatus("no entitlement for this account");
      setVerified(false);
      return;
    }
    const cp = getPublicClient(p.config);
    if (!cp) {
      setStatus("rpc unavailable");
      return;
    }
    const remaining = await readClaimRemaining(cp, DEMO.claimManager, DEMO.cycleId, DEMO.stock);
    const entitlement: Entitlement = {
      cycleId: artifact.cycleId,
      claimManager: artifact.claimManager,
      asset: artifact.stockToken,
      assetSymbol: artifact.stockSymbol,
      claimant: artifact.account,
      amount: artifact.amount,
      proof: artifact.proof,
      root: artifact.root,
    };
    const cycle: OnchainCycle = {
      cycleId: artifact.cycleId,
      root: artifact.root,
      asset: artifact.stockToken,
      remaining,
      claimStartSec: 0n,
      claimDeadlineSec: 4_000_000_000n,
    };
    const v = verifyClaim(entitlement, cycle, {
      chainId: ROBINHOOD_CHAIN_ID,
      nowSec: 1000n,
      alreadyClaimed: claimed,
    });
    setVerified(v.ok);
    setStatus(v.ok ? "proof verified against on-chain cycle" : `rejected: ${v.reason}`);
  }, [p.config, p.address, claimed]);

  const claim = useCallback(async () => {
    if (!p.address) return;
    try {
      const pub = getPublicClient(p.config);
      if (!pub) return;
      const wallet = createDemoWalletClient(pub);
      const artifact = await demoProofProvider.getArtifact(DEMO.cycleId, p.address as Address);
      const data = encodeFunctionData({
        abi: distributionClaimManagerAbi,
        functionName: "claim",
        args: [DEMO.cycleId, DEMO.stock, DEMO.distribution, artifact!.proof.map((x) => x)],
      });
      const res = await runActionLifecycle(
        { pub, wallet, account: localTestAccount },
        { target: DEMO.claimManager, data, confirmations: 1 },
        (s) => setSteps((prev) => [...prev, s]),
      );
      if (res.ok) {
        setClaimed(true);
        setStatus("claim confirmed");
      } else setStatus(`claim failed: ${res.reason}`);
    } catch (e) {
      setStatus(`claim error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [p.config, p.address]);

  return (
    <div className="card">
      <h2>Distribution claim</h2>
      <p className="small muted">
        Entitlement comes from a published proof artifact, verified against the on-chain cycle.
        Never inferred from holdings.
      </p>
      <button onClick={verify} disabled={!p.onCorrectChain} data-testid="verify-proof">
        Verify proof
      </button>
      <div className="kv">
        <span className="k">Status</span>
        <span className="v" data-testid="claim-status">
          {status || "—"}
        </span>
      </div>
      <button className="btn-disabled" disabled aria-disabled="true">
        Submit live claim (disabled — protocol not live)
      </button>
      <button
        onClick={claim}
        disabled={!p.eligible || !verified || claimed}
        data-testid="demo-claim"
        style={{ marginTop: "0.5rem" }}
      >
        {claimed ? "Claimed (duplicate disabled)" : "Run local claim (mock)"}
      </button>
      <StepList steps={steps} />
    </div>
  );
}

function TransparencyPanel() {
  const report = buildTransparencyReport(SAMPLE_TRANSPARENCY);
  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <h2>On-chain transparency</h2>
      <div className="fixture-note">{FIXTURE_LABEL}</div>
      <div className="grid">
        <div className="kv">
          <span className="k">Buy volume (WETH)</span>
          <span className="v">
            {fmt(report.buyVolume.value)}{" "}
            <span className="prov prov-fixture">{report.buyVolume.provenance}</span>
          </span>
        </div>
        <div className="kv">
          <span className="k">BPS burned</span>
          <span className="v">
            {fmt(report.totalBpsBurned.value)}{" "}
            <span className="prov prov-fixture">{report.totalBpsBurned.provenance}</span>
          </span>
        </div>
        <div className="kv">
          <span className="k">Budget spent on acquisitions</span>
          <span className="v">{fmt(report.stockAcquisitionBudgetSpent.value)}</span>
        </div>
        <div className="kv">
          <span className="k">Pending budget (not acquired)</span>
          <span className="v">{fmt(report.pendingBudgetNotYetAcquired.value)}</span>
        </div>
      </div>
      <p className="small muted">
        {report.acquisitionDisclaimer} {report.rialtoNote}
      </p>
    </div>
  );
}
