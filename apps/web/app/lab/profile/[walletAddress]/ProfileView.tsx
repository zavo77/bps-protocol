"use client";
// Public creator profile. Real data only: created markets (chain-reconstructed)
// and indexed gross swap activity. When the CONNECTED wallet is the profile
// wallet, each market shows a contract-backed fee panel (useFees) whose Claim
// button is enabled ONLY when getPendingFees reports claimable amounts — never a
// fabricated or estimated number. Other viewers see fees as "Visible to the
// creator" and nothing is fetched or claimed on their behalf.
import { useMemo } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { EXPLORER_BASE_URL } from "@bps/launch-lab";
import { useFees, useLabConfig, useProfile, type ProfileMarket } from "../../../../hooks/lab";

function short(v: string): string {
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

function fmtWei(wei: string): string {
  try {
    const s = formatUnits(BigInt(wei), 18);
    return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
  } catch {
    return "—";
  }
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

/** Contract-backed fee panel for a market the connected creator owns. */
function MarketFeePanel({ tokenAddress, explorer }: { tokenAddress: string; explorer: string }) {
  const fees = useFees(tokenAddress, { enabled: true });

  return (
    <div
      className="card"
      style={{ marginTop: "0.5rem" }}
      data-testid={`fee-panel-${tokenAddress.toLowerCase()}`}
    >
      <Row
        k="Pending anchor fees"
        v={
          fees.fees ? (
            <span data-testid="fee-anchor">
              {fmtWei(fees.fees.anchorFeesWei)} {fees.fees.anchorSymbol}
            </span>
          ) : fees.state === "loading" ? (
            "…"
          ) : (
            "—"
          )
        }
      />
      <Row
        k="Pending token fees"
        v={
          fees.fees ? (
            <span data-testid="fee-token">{fmtWei(fees.fees.tokenFeesWei)}</span>
          ) : fees.state === "loading" ? (
            "…"
          ) : (
            "—"
          )
        }
      />
      <button
        type="button"
        data-testid="claim-button"
        disabled={!fees.canClaim}
        onClick={() => void fees.claim()}
      >
        {fees.state === "signing"
          ? "Confirm in wallet…"
          : fees.state === "pending"
            ? "Claiming…"
            : fees.state === "success"
              ? "Claimed"
              : "Claim fees"}
      </button>
      {fees.state === "no-fees" ? (
        <p className="small muted" data-testid="fee-none">
          No claimable fees right now.
        </p>
      ) : null}
      {fees.state === "signing" ? (
        <p className="small muted" data-testid="fee-signing">
          Waiting for your wallet signature…
        </p>
      ) : null}
      {fees.state === "pending" ? (
        <p className="small muted" data-testid="fee-pending">
          Claim submitted; awaiting confirmation…
        </p>
      ) : null}
      {fees.state === "success" && fees.txHash ? (
        <p className="small" style={{ color: "var(--good)" }} data-testid="fee-success">
          Fees claimed.{" "}
          <a
            href={`${explorer}/tx/${fees.txHash}`}
            target="_blank"
            rel="noreferrer"
            data-testid="fee-tx-link"
          >
            View receipt ↗
          </a>
        </p>
      ) : null}
      {fees.state === "failure" && fees.error ? (
        <p className="small" style={{ color: "var(--bad)" }} data-testid="fee-error">
          {fees.error}
        </p>
      ) : null}
    </div>
  );
}

function MarketCard({
  market,
  isOwner,
  logo,
  explorer,
}: {
  market: ProfileMarket;
  isOwner: boolean;
  logo: string | null;
  explorer: string;
}) {
  const collecting = market.indexedSwaps === null || market.grossMovementWei === null;
  return (
    <section className="card" data-testid={`profile-market-${market.tokenAddress.toLowerCase()}`}>
      <h3>
        <a href={`/lab/token/${market.tokenAddress}`}>
          {market.tokenName} ({market.tokenSymbol})
        </a>
      </h3>
      <Row
        k="Anchor"
        v={
          <span>
            {logo ? (
              <img
                src={logo}
                alt=""
                width={16}
                height={16}
                style={{ verticalAlign: "middle", borderRadius: "50%", marginRight: "0.35rem" }}
              />
            ) : null}
            {market.anchorSymbol ?? "—"}
          </span>
        }
      />
      <Row
        k="Activity"
        v={
          collecting ? (
            <span className="muted">Collecting market data</span>
          ) : (
            `${market.indexedSwaps} swaps · ${fmtWei(market.grossMovementWei as string)} gross`
          )
        }
      />
      <Row
        k="Launch tx"
        v={
          <a
            href={`${explorer}/tx/${market.launchTransactionHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {short(market.launchTransactionHash)}
          </a>
        }
      />
      {isOwner ? (
        <MarketFeePanel tokenAddress={market.tokenAddress} explorer={explorer} />
      ) : (
        <p className="small muted" data-testid="fees-visible-to-creator">
          Fees are visible to the creator.
        </p>
      )}
    </section>
  );
}

export function ProfileView({ walletAddress }: { walletAddress: string }) {
  const { data: config } = useLabConfig();
  const { address } = useAccount();
  const profileQuery = useProfile(walletAddress);
  const explorer = config?.explorerBaseUrl ?? EXPLORER_BASE_URL;

  const isOwner = address !== undefined && address.toLowerCase() === walletAddress.toLowerCase();

  const logoBySymbol = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const a of config?.anchors ?? []) map.set(a.symbol, a.logo);
    return map;
  }, [config?.anchors]);

  if (profileQuery.isPending) {
    return (
      <main>
        <p className="muted">Loading profile…</p>
      </main>
    );
  }
  if (profileQuery.isError || !profileQuery.data) {
    return (
      <main>
        <p className="muted" data-testid="profile-error">
          Profile unavailable: {profileQuery.error ? profileQuery.error.message : "unknown error"}
        </p>
      </main>
    );
  }

  const profile = profileQuery.data;

  return (
    <main>
      <h1>Creator</h1>
      <section className="card" data-testid="profile-summary">
        <Row
          k="Wallet"
          v={
            <a
              href={`${explorer}/address/${profile.creator}`}
              target="_blank"
              rel="noreferrer"
              data-testid="profile-wallet-link"
            >
              {short(profile.creator)}
            </a>
          }
        />
        <Row k="Markets created" v={String(profile.marketCount)} />
        <Row
          k="Total indexed gross"
          v={
            profile.totalIndexedGrossWei !== null ? (
              `${fmtWei(profile.totalIndexedGrossWei)} (indexed)`
            ) : (
              <span className="muted" data-testid="profile-awaiting-indexed">
                Awaiting indexed data
              </span>
            )
          }
        />
        {isOwner ? (
          <p className="small muted" data-testid="profile-is-owner">
            This is your connected wallet — claimable fees are shown per market below.
          </p>
        ) : null}
      </section>

      <h2 style={{ marginTop: "1.5rem" }}>Markets</h2>
      {profile.markets.length === 0 ? (
        <p className="muted" data-testid="profile-no-markets">
          This wallet has not created any markets yet.
        </p>
      ) : (
        <div className="grid">
          {profile.markets.map((m) => (
            <MarketCard
              key={m.tokenAddress}
              market={m}
              isOwner={isOwner}
              logo={logoBySymbol.get(m.anchorSymbol ?? "") ?? null}
              explorer={explorer}
            />
          ))}
        </div>
      )}
    </main>
  );
}
