"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useConfig,
  useConnect,
  useDisconnect,
  useSignTypedData,
  useSwitchChain,
} from "wagmi";
import { getConnectorClient, getPublicClient } from "wagmi/actions";
import { type Config } from "wagmi";
import {
  encodeFunctionData,
  recoverTypedDataAddress,
  walletActions,
  type Address,
  type Hex,
} from "viem";
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
import { type TransparencyReport } from "../lib/transparency";
import { fetchTransparency } from "../lib/services/transparency-reads";
import {
  readClaimRemaining,
  readErc20,
  readLockCount,
  readLockedPrincipal,
} from "../lib/services/reads";
import { validateClaimReadiness } from "../lib/services/claim-validation";
import {
  reconcileCycleAcquisition,
  type AcquisitionReconciliation,
} from "../lib/services/acquisition-reconcile";
import { runActionLifecycle, type LifecycleStep } from "../lib/wallet/tx";
import { bpsLockingVaultAbi, bpsTradeRouterAbi, distributionClaimManagerAbi } from "../lib/abis";
import { FIXTURE_LABEL } from "../lib/fixtures";
import { DEMO_COORDINATOR, DEMO_MANAGER, DEMO_ROUTER } from "../lib/demo-fixture";
import {
  DEMO,
  demoDeclarationConfig,
  demoDeployment,
  demoEligibilityService,
  demoProofProvider,
} from "./demo";

const WEI = 10n ** 18n;
const fmt = (x: bigint | null) =>
  x === null
    ? "—"
    : `${(x / WEI).toString()}.${(((x % WEI) * 1000n) / WEI).toString().padStart(3, "0")}`;

/** Wallet client obtained from the CONNECTOR (never a separately constructed local wallet client). */
async function connectorWallet(config: Config) {
  return (await getConnectorClient(config)).extend(walletActions);
}

export function AppDashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, error: switchError } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const config = useConfig();

  const [verdict, setVerdict] = useState<DeclarationVerdict | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityResult>("unknown");
  const [txNonce, setTxNonce] = useState(0);

  const onCorrectChain = isConnected && chainId === ROBINHOOD_CHAIN_ID;
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
    // Sign THROUGH THE CONNECTOR (eth_signTypedData_v4). No key is imported by the app.
    const signature = await signTypedDataAsync({
      domain: demoDeclarationConfig.domain,
      types: demoDeclarationConfig.types,
      primaryType: "Declaration",
      message,
    });
    // Verify the recovered signer is the connected account.
    const recovered = await recoverTypedDataAddress({
      domain: demoDeclarationConfig.domain,
      types: demoDeclarationConfig.types,
      primaryType: "Declaration",
      message,
      signature,
    });
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      setVerdict({ ok: false, reason: "wrong-signer" });
      return;
    }
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
  }, [address, signTypedDataAsync]);

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
          onSwitch={() => switchChain({ chainId: ROBINHOOD_CHAIN_ID })}
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
        <LockPanel
          eligible={eligible}
          onCorrectChain={onCorrectChain}
          config={config}
          address={address}
        />
        <ClaimPanel
          eligible={eligible}
          onCorrectChain={onCorrectChain}
          config={config}
          address={address}
          onTx={() => setTxNonce((n) => n + 1)}
        />
      </div>

      <TransparencyPanel
        config={config}
        onCorrectChain={onCorrectChain}
        refreshKey={`${eligState.kind}:${txNonce}`}
      />
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
          {p.connecting ? "Connecting…" : "Connect wallet"}
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
              {p.onCorrectChain ? "Robinhood Chain (4663)" : `Wrong network (${p.chainId})`}
            </span>
          </div>
          {!p.onCorrectChain ? (
            <button onClick={p.onSwitch} data-testid="switch">
              Switch to Robinhood Chain (4663)
            </button>
          ) : (
            <button onClick={p.onSign} data-testid="sign">
              Sign restricted-beta declaration
            </button>
          )}
          <div className="kv" style={{ marginTop: "0.5rem" }}>
            <span className="k">Eligibility state</span>
            <span className="v" data-testid="elig-state">
              {p.eligStateKind}
            </span>
          </div>
          <p className="small muted">
            Signing never establishes eligibility; a separate service decides. Writes unlock only
            when eligible: <strong data-testid="eligible">{p.eligible ? "yes" : "no"}</strong>.
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
      const wallet = await connectorWallet(p.config);
      const data = encodeFunctionData({
        abi: bpsTradeRouterAbi,
        functionName: "buyExactWethForBps",
        args: [preview.amountIn, preview.minUserOut, 0n, p.address as Address, preview.deadline],
      });
      const res = await runActionLifecycle(
        { pub, wallet, account: wallet.account },
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
        Run local demonstration
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

function LockPanel(p: {
  eligible: boolean;
  onCorrectChain: boolean;
  config: Config;
  address: string | undefined;
}) {
  const [bal, setBal] = useState<bigint | null>(null);
  const [locked, setLocked] = useState<bigint | null>(null);
  const [steps, setSteps] = useState<LifecycleStep[]>([]);
  const [result, setResult] = useState<string>("");
  const [refresh, setRefresh] = useState(0);
  const [withdrawId, setWithdrawId] = useState<bigint | null>(null);
  const [wSteps, setWSteps] = useState<LifecycleStep[]>([]);
  const [wResult, setWResult] = useState<string>("");
  const LOCK_AMOUNT = 1000n * WEI;
  const DURATION = 604_800;

  useEffect(() => {
    let live = true;
    (async () => {
      if (!p.address || !p.onCorrectChain) return;
      const pub = getPublicClient(p.config);
      if (!pub) return;
      try {
        const snap = await readErc20(pub, DEMO.bps, p.address as Address, DEMO.lockingVault);
        const lp = await readLockedPrincipal(pub, DEMO.lockingVault, p.address as Address);
        if (live) {
          setBal(snap.balance);
          setLocked(lp);
        }
      } catch {
        /* fail closed */
      }
    })();
    return () => {
      live = false;
    };
  }, [p.config, p.address, p.onCorrectChain, refresh]);

  const runLock = useCallback(async () => {
    if (!p.address) return;
    setSteps([]);
    setResult("running…");
    try {
      const pub = getPublicClient(p.config);
      if (!pub) return;
      const wallet = await connectorWallet(p.config);
      const before = await readLockedPrincipal(pub, DEMO.lockingVault, p.address as Address);
      // The new position's lock id is the current lock count (positions are appended).
      const newLockId = await readLockCount(pub, DEMO.lockingVault, p.address as Address);
      const data = encodeFunctionData({
        abi: bpsLockingVaultAbi,
        functionName: "createLock",
        args: [LOCK_AMOUNT, DURATION],
      });
      const res = await runActionLifecycle(
        { pub, wallet, account: wallet.account },
        {
          target: DEMO.lockingVault,
          data,
          confirmations: 1,
          approval: { token: DEMO.bps, spender: DEMO.lockingVault, amount: LOCK_AMOUNT },
          // Reconcile: success ONLY if the confirmed locked balance increased by exactly the amount.
          reconcile: async () => {
            const after = await readLockedPrincipal(pub, DEMO.lockingVault, p.address as Address);
            return after === before + LOCK_AMOUNT;
          },
        },
        (s) => setSteps((prev) => [...prev, s]),
      );
      if (res.ok) setWithdrawId(newLockId);
      setResult(res.ok ? "lock confirmed & reconciled" : `failed at ${res.step}: ${res.reason}`);
      setRefresh((n) => n + 1);
    } catch (e) {
      setResult(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [p.config, p.address]);

  const runWithdraw = useCallback(async () => {
    if (!p.address || withdrawId === null) return;
    setWSteps([]);
    setWResult("running…");
    try {
      const pub = getPublicClient(p.config);
      if (!pub) return;
      const wallet = await connectorWallet(p.config);
      // Read the AUTHORITATIVE locked principal before the withdrawal; the position principal is the
      // amount this withdrawal must remove. Partial: other positions (e.g. the pre-existing one) remain.
      const before = await readLockedPrincipal(pub, DEMO.lockingVault, p.address as Address);
      const data = encodeFunctionData({
        abi: bpsLockingVaultAbi,
        functionName: "withdraw",
        args: [withdrawId],
      });
      const res = await runActionLifecycle(
        { pub, wallet, account: wallet.account },
        {
          target: DEMO.lockingVault,
          data,
          confirmations: 1,
          // Reconcile: success ONLY if the confirmed locked balance decreased by exactly the withdrawn
          // position principal — never inferred from the tx hash alone.
          reconcile: async () => {
            const after = await readLockedPrincipal(pub, DEMO.lockingVault, p.address as Address);
            return after === before - LOCK_AMOUNT;
          },
        },
        (s) => setWSteps((prev) => [...prev, s]),
      );
      if (res.ok) setWithdrawId(null);
      setWResult(
        res.ok ? "withdrawal confirmed & reconciled" : `failed at ${res.step}: ${res.reason}`,
      );
      setRefresh((n) => n + 1);
    } catch (e) {
      setWResult(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [p.config, p.address, withdrawId]);

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
      <div className="kv">
        <span className="k">Locked principal</span>
        <span className="v" data-testid="locked-balance">
          {fmt(locked)}
        </span>
      </div>
      <button className="btn-disabled" disabled aria-disabled="true">
        Create lock (disabled — protocol not live)
      </button>
      <button
        onClick={runLock}
        disabled={!p.eligible || !p.onCorrectChain}
        data-testid="demo-lock"
        style={{ marginTop: "0.5rem" }}
      >
        Run local lock (1000 BPS, 7d)
      </button>
      <StepList steps={steps} />
      {result && (
        <p className="small" data-testid="lock-result">
          {result}
        </p>
      )}
      <button
        onClick={runWithdraw}
        disabled={!p.eligible || !p.onCorrectChain || withdrawId === null}
        data-testid="demo-withdraw"
        style={{ marginTop: "0.75rem" }}
      >
        Withdraw local lock position (partial)
      </button>
      <StepList steps={wSteps} />
      {wResult && (
        <p className="small" data-testid="withdraw-result">
          {wResult}
        </p>
      )}
    </div>
  );
}

function ClaimPanel(p: {
  eligible: boolean;
  onCorrectChain: boolean;
  config: Config;
  address: string | undefined;
  onTx: () => void;
}) {
  const [status, setStatus] = useState<string>("");
  const [verified, setVerified] = useState<boolean>(false);
  const [claimed, setClaimed] = useState<boolean>(false);
  const [steps, setSteps] = useState<LifecycleStep[]>([]);

  const verify = useCallback(async () => {
    if (!p.address) return;
    const pub = getPublicClient(p.config);
    if (!pub) {
      setStatus("rpc unavailable");
      return;
    }
    const artifact = await demoProofProvider.getArtifact(DEMO.cycleId, p.address as Address);
    if (!artifact) {
      setStatus("no entitlement for this account");
      setVerified(false);
      return;
    }
    // Full field validation before enabling a claim (§F).
    if (artifact.artifactVersion !== "bps.pod.artifact/1") {
      setStatus("rejected: artifact-version");
      setVerified(false);
      return;
    }
    if (artifact.chainId !== ROBINHOOD_CHAIN_ID) {
      setStatus("rejected: chain");
      setVerified(false);
      return;
    }
    if (artifact.claimManager.toLowerCase() !== DEMO.claimManager.toLowerCase()) {
      setStatus("rejected: manager");
      setVerified(false);
      return;
    }
    if (artifact.account.toLowerCase() !== (p.address as string).toLowerCase()) {
      setStatus("rejected: account");
      setVerified(false);
      return;
    }
    // AUTHORITATIVE claim-manager cycle state (cycles()/assetFunding()/claimed()/remaining()/balanceOf)
    // — never an event-derived root. An old event cannot override changed current cycle state.
    const readiness = await validateClaimReadiness(pub, {
      manager: DEMO.claimManager,
      cycleId: DEMO.cycleId,
      asset: DEMO.stock,
      claimant: p.address as Address,
      amount: artifact.amount,
      artifactRoot: artifact.root as Hex,
    });
    if (!readiness.ok) {
      setStatus(`rejected: ${readiness.reason}`);
      setVerified(false);
      return;
    }
    const remaining = readiness.remaining!;
    const onchainRoot = readiness.onchainRoot!;
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
      root: onchainRoot,
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
      const wallet = await connectorWallet(p.config);
      const artifact = await demoProofProvider.getArtifact(DEMO.cycleId, p.address as Address);
      const data = encodeFunctionData({
        abi: distributionClaimManagerAbi,
        functionName: "claim",
        args: [DEMO.cycleId, DEMO.stock, DEMO.distribution, artifact!.proof.map((x) => x)],
      });
      const res = await runActionLifecycle(
        { pub, wallet, account: wallet.account },
        {
          target: DEMO.claimManager,
          data,
          confirmations: 1,
          reconcile: async () => {
            // Success only if the confirmed remaining decreased by the claimed amount.
            const rem = await readClaimRemaining(pub, DEMO.claimManager, DEMO.cycleId, DEMO.stock);
            return rem < DEMO.distribution;
          },
        },
        (s) => setSteps((prev) => [...prev, s]),
      );
      if (res.ok) {
        setClaimed(true);
        setStatus("claim confirmed & reconciled");
        p.onTx();
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
        {claimed ? "Claimed (duplicate disabled)" : "Run local claim"}
      </button>
      <StepList steps={steps} />
    </div>
  );
}

function TransparencyPanel(p: { config: Config; onCorrectChain: boolean; refreshKey: string }) {
  const [report, setReport] = useState<TransparencyReport | null>(null);
  const [recon, setRecon] = useState<AcquisitionReconciliation | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const pub = getPublicClient(p.config);
      if (!pub) return;
      try {
        const r = await fetchTransparency(pub, {
          addresses: [DEMO_ROUTER, DEMO_COORDINATOR, DEMO_MANAGER],
          fromBlock: 0n,
          headBlock: 100n,
          confirmations: 1n,
          chunkSize: 50n,
          isFixture: true,
        });
        if (live) setReport(r);
        // AUTHORITATIVE acquisition ↔ cycle reconciliation. Events give the expected acquisition + funding
        // amounts; the CURRENT linkage is read from cycleUsed()/cycleAcquisitionId()/acquisitions(). Any
        // inconsistency (or read failure) marks the acquisition transparency INVALID and fails closed.
        const ev = r.acquisitions[0];
        const rec = await reconcileCycleAcquisition(
          pub,
          DEMO_COORDINATOR,
          DEMO.cycleId,
          ev
            ? {
                acquisitionId: ev.acquisitionId,
                wethSpent: ev.wethSpent.value,
                distributionAmount: ev.distribution80.value,
                reserveAmount: ev.reserve20.value,
                acquiredStock: ev.acquiredStock.value,
              }
            : undefined,
        );
        if (live) setRecon(rec);
      } catch {
        if (live) setRecon(null); // fail closed
      }
    })();
    return () => {
      live = false;
    };
  }, [p.config, p.refreshKey, p.onCorrectChain]);

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <h2>On-chain transparency (event-derived)</h2>
      <div className="fixture-note">{FIXTURE_LABEL}</div>
      {report ? (
        <>
          <div className="grid">
            <div className="kv">
              <span className="k">Buy volume (WETH)</span>
              <span className="v" data-testid="tx-buyvol">
                {fmt(report.buyVolume.value)}{" "}
                <span className="prov prov-fixture">{report.buyVolume.provenance}</span>
              </span>
            </div>
            <div className="kv">
              <span className="k">Sell volume (WETH)</span>
              <span className="v" data-testid="tx-sellvol">
                {fmt(report.sellVolume.value)}{" "}
                <span className="prov prov-fixture">{report.sellVolume.provenance}</span>
              </span>
            </div>
            <div className="kv">
              <span className="k">BPS burned (per-trade)</span>
              <span className="v">
                {fmt(report.totalBpsBurned.value)}{" "}
                <span className="prov prov-fixture">{report.totalBpsBurned.provenance}</span>
              </span>
            </div>
            <div className="kv">
              <span className="k">BPS repurchased &amp; burned</span>
              <span className="v" data-testid="tx-repurchase-burn">
                {fmt(report.repurchaseBpsBurned.value)}{" "}
                <span className="prov prov-fixture">{report.repurchaseBpsBurned.provenance}</span>
              </span>
            </div>
            <div className="kv">
              <span className="k">Repurchase WETH spent</span>
              <span className="v" data-testid="tx-repurchase-weth">
                {fmt(report.repurchaseWethSpent.value)}
              </span>
            </div>
            <div className="kv">
              <span className="k">Stock budget delivered</span>
              <span className="v" data-testid="tx-budget-delivered">
                {fmt(report.stockBudgetDelivered.value)}
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
          {/* Authoritative acquisition ↔ cycle linkage from contract reads (not events). */}
          <div className="kv">
            <span className="k">
              Authoritative acquisition linkage (cycle {DEMO.cycleId.toString()})
            </span>
            <span className="v" data-testid="acq-linkage">
              {recon ? recon.status : "reading…"}
            </span>
          </div>
          {recon?.ok && recon.record ? (
            <div className="grid" data-testid="acq-authoritative">
              <div className="kv">
                <span className="k">Authoritative acquisition id</span>
                <span className="v" data-testid="acq-auth-id">
                  {recon.onchainAcquisitionId?.toString() ?? "—"}
                </span>
              </div>
              <div className="kv">
                <span className="k">Authoritative WETH spent</span>
                <span className="v" data-testid="acq-auth-weth">
                  {fmt(recon.record.wethSpent)}{" "}
                  <span className="prov prov-fixture">onchain-verified</span>
                </span>
              </div>
              <div className="kv">
                <span className="k">Authoritative 80% distribution</span>
                <span className="v" data-testid="acq-auth-dist">
                  {fmt(recon.record.distributionAmount)}
                </span>
              </div>
              <div className="kv">
                <span className="k">Authoritative 20% reserve</span>
                <span className="v" data-testid="acq-auth-reserve">
                  {fmt(recon.record.reserveAmount)}
                </span>
              </div>
              <div className="kv">
                <span className="k">Authoritative cycle</span>
                <span className="v" data-testid="acq-auth-cycle">
                  {recon.record.cycleId.toString()}
                </span>
              </div>
            </div>
          ) : recon && !recon.ok ? (
            <p className="small" data-testid="acq-linkage-invalid" role="alert">
              Acquisition transparency INVALID — {recon.status}
              {recon.detail ? `: ${recon.detail}` : ""}. The event-derived acquisition is not
              confirmed by current authoritative contract reads.
            </p>
          ) : null}
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Acq</th>
                  <th>Stock</th>
                  <th>WETH spent</th>
                  <th>80% dist</th>
                  <th>20% reserve</th>
                  <th>Cycle</th>
                  <th>Remaining</th>
                  <th>Claimed</th>
                  <th>Authoritative</th>
                </tr>
              </thead>
              <tbody>
                {report.acquisitions.map((a) => {
                  const confirmed = recon?.ok && recon.onchainAcquisitionId === a.acquisitionId;
                  return (
                    <tr
                      key={a.acquisitionId.toString()}
                      data-testid="acq-row"
                      data-authoritative={confirmed ? "confirmed" : "invalid"}
                    >
                      <td>{a.acquisitionId.toString()}</td>
                      <td>{a.stockToken}</td>
                      <td>{fmt(a.wethSpent.value)}</td>
                      <td>{fmt(a.distribution80.value)}</td>
                      <td>{fmt(a.reserve20.value)}</td>
                      <td>{a.cycleId.value === null ? "—" : a.cycleId.value.toString()}</td>
                      <td data-testid="acq-remaining">{fmt(a.remaining.value)}</td>
                      <td data-testid="acq-claimed">{fmt(a.claimed.value)}</td>
                      <td>{confirmed ? "confirmed" : "unconfirmed"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            {report.acquisitionDisclaimer} {report.rialtoNote}
          </p>
        </>
      ) : (
        <p className="small muted" data-testid="tx-loading">
          Loading event-derived transparency…
        </p>
      )}
    </div>
  );
}
