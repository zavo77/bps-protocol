"use client";
// Public "Connect wallet" control — consumer-facing, no connector jargon.
// Disconnected: one button that reveals the available wallet options.
// Connected: the short address with a disconnect action. Used by the lab
// header and by page-level connect prompts.
import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Friendly display names — users never see connector implementation terms. */
function walletLabel(name: string): string {
  const n = name.toLowerCase();
  if (n === "injected") return "Browser wallet";
  return name;
}

export function ConnectWalletButton({
  variant = "header",
  autoOpen = false,
}: {
  variant?: "header" | "inline";
  /** Open the wallet options immediately (used when an action needs a wallet). */
  autoOpen?: boolean;
}) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(autoOpen);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the options on outside click / escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (isConnected && address) {
    return (
      <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
        <button
          type="button"
          className="lab-btn lab-btn--ghost"
          data-testid="wallet-connected"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {shortAddress(address)}
        </button>
        {open ? (
          <div
            role="menu"
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 6px)",
              background: "#fff",
              border: "1px solid var(--peach-grey)",
              borderRadius: 12,
              boxShadow: "0 8px 28px rgba(30,20,15,0.12)",
              padding: 8,
              zIndex: 50,
              minWidth: 180,
            }}
          >
            <button
              type="button"
              className="lab-btn lab-btn--ghost"
              style={{ width: "100%" }}
              data-testid="wallet-disconnect"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
            >
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className={variant === "inline" ? "lab-btn lab-btn--primary" : "lab-btn lab-btn--ghost"}
        data-testid="connect-wallet"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={isPending}
        onClick={() => setOpen((v) => !v)}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Wallet options"
          data-testid="wallet-options"
          style={{
            position: "absolute",
            right: variant === "header" ? 0 : "auto",
            left: variant === "header" ? "auto" : 0,
            top: "calc(100% + 6px)",
            background: "#fff",
            border: "1px solid var(--peach-grey)",
            borderRadius: 12,
            boxShadow: "0 8px 28px rgba(30,20,15,0.12)",
            padding: 8,
            zIndex: 50,
            minWidth: 210,
            display: "grid",
            gap: 6,
          }}
        >
          {connectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              className="lab-btn lab-btn--ghost"
              style={{ width: "100%", justifyContent: "flex-start" }}
              onClick={() => {
                connect({ connector: c });
                setOpen(false);
              }}
            >
              {walletLabel(c.name)}
            </button>
          ))}
          {connectors.length === 0 ? (
            <p className="lab-muted" style={{ fontSize: 13, margin: 6 }}>
              No wallet was detected in this browser.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
