"use client";
// Public creator profile. Real data only: created markets (chain-reconstructed)
// and indexed gross swap activity. When the CONNECTED wallet is the profile
// wallet, each market shows a contract-backed fee panel (useFees) whose Claim
// button is enabled ONLY when getPendingFees reports claimable amounts — never a
// fabricated or estimated number. Other viewers see fees as "visible to the
// creator" and nothing is fetched or claimed on their behalf. Restyled to the
// Claude Design V4 lab system; wiring is unchanged.
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

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="lab-kv">
      <span>{k}</span>
      <span className="lab-data">{v}</span>
    </div>
  );
}

/** Contract-backed fee panel for a market the connected creator owns. */
function MarketFeePanel({ tokenAddress, explorer }: { tokenAddress: string; explorer: string }) {
  const fees = useFees(tokenAddress, { enabled: true });

  return (
    <div
      className="lab-card lab-card--nested"
      style={{ marginTop: 12 }}
      data-testid={`fee-panel-${tokenAddress.toLowerCase()}`}
    >
      <div className="lab-label" style={{ marginBottom: 8 }}>
        creator fees
      </div>
      <Kv
        k="Pending anchor fees"
        v={
          fees.fees ? (
            <span data-testid="fee-anchor">
              {fmtWei(fees.fees.anchorFeesWei)} {fees.fees.anchorSymbol}
            </span>
          ) : fees.state === "loading" ? (
            "…"
          ) : (
            <span className="lab-await">awaiting indexed data</span>
          )
        }
      />
      <Kv
        k="Pending token fees"
        v={
          fees.fees ? (
            <span data-testid="fee-token">{fmtWei(fees.fees.tokenFeesWei)}</span>
          ) : fees.state === "loading" ? (
            "…"
          ) : (
            <span className="lab-await">awaiting indexed data</span>
          )
        }
      />
      <button
        type="button"
        data-testid="claim-button"
        className="lab-btn lab-btn--primary"
        style={{ width: "100%", marginTop: 12 }}
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
        <p
          className="lab-muted"
          data-testid="fee-none"
          style={{ fontSize: 13, margin: "10px 0 0" }}
        >
          {fees.fees ? "No fees currently claimable." : "Fee data unavailable."}
        </p>
      ) : null}
      {fees.state === "signing" ? (
        <p
          className="lab-muted"
          data-testid="fee-signing"
          style={{ fontSize: 13, margin: "10px 0 0" }}
        >
          Waiting for your wallet signature…
        </p>
      ) : null}
      {fees.state === "pending" ? (
        <p
          className="lab-muted"
          data-testid="fee-pending"
          style={{ fontSize: 13, margin: "10px 0 0" }}
        >
          Claim submitted; awaiting confirmation…
        </p>
      ) : null}
      {fees.state === "success" && fees.txHash ? (
        <p
          data-testid="fee-success"
          style={{ color: "var(--good)", fontSize: 13, margin: "10px 0 0" }}
        >
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
        <p
          data-testid="fee-error"
          style={{ color: "var(--bad)", fontSize: 13, margin: "10px 0 0" }}
        >
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
    <section
      className="lab-card"
      data-testid={`profile-market-${market.tokenAddress.toLowerCase()}`}
    >
      <h3 className="lab-h2" style={{ fontSize: 20 }}>
        <a href={`/lab/token/${market.tokenAddress}`}>
          {market.tokenName} ({market.tokenSymbol})
        </a>
      </h3>
      <Kv
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
      <Kv
        k="Activity"
        v={
          collecting ? (
            <span className="lab-muted">Collecting market data</span>
          ) : (
            `${market.indexedSwaps} swaps · ${fmtWei(market.grossMovementWei as string)} gross`
          )
        }
      />
      <Kv
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
      <p style={{ margin: "10px 0 0" }}>
        <a href={`/lab/proof/${market.tokenAddress}`} data-testid="profile-proof-link">
          proof trail →
        </a>
      </p>
      {isOwner ? (
        <MarketFeePanel tokenAddress={market.tokenAddress} explorer={explorer} />
      ) : (
        <p
          className="lab-muted"
          data-testid="fees-visible-to-creator"
          style={{ fontSize: 13, margin: "12px 0 0" }}
        >
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
        <p className="lab-muted">Loading profile…</p>
      </main>
    );
  }
  if (profileQuery.isError || !profileQuery.data) {
    return (
      <main>
        <p className="lab-muted" data-testid="profile-error">
          Profile unavailable: {profileQuery.error ? profileQuery.error.message : "unknown error"}
        </p>
      </main>
    );
  }

  const profile = profileQuery.data;

  return (
    <main>
      <div className="lab-label">creator</div>
      <h1 className="lab-h1">
        market <span className="lab-serif">maker</span>
      </h1>

      <section className="lab-card" data-testid="profile-summary" style={{ marginTop: 8 }}>
        <Kv
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
        <Kv k="Markets created" v={String(profile.marketCount)} />
        <Kv
          k="Total indexed gross"
          v={
            profile.totalIndexedGrossWei !== null ? (
              `${fmtWei(profile.totalIndexedGrossWei)} (indexed)`
            ) : (
              <span className="lab-await" data-testid="profile-awaiting-indexed">
                awaiting indexed data
              </span>
            )
          }
        />
        {isOwner ? (
          <p
            className="lab-muted"
            data-testid="profile-is-owner"
            style={{ fontSize: 13, margin: "12px 0 0" }}
          >
            This is your connected wallet — claimable fees are shown per market below.
          </p>
        ) : null}
      </section>

      <h2 className="lab-h2" style={{ marginTop: 32 }}>
        markets
      </h2>
      {profile.markets.length === 0 ? (
        <p className="lab-muted" data-testid="profile-no-markets">
          This wallet has not created any markets yet.
        </p>
      ) : (
        <div className="lab-grid">
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
