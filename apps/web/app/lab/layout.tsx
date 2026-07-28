// Launch Lab section layout (server component). Mounts LabProviders exactly once
// around every /lab route, loads the Claude Design V4 typefaces via next/font,
// wraps everything in the .lab-root design scope, and renders the required
// disclosure footer verbatim.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LabProviders } from "../../providers/lab-providers";
import { ConnectedProfileLink } from "./ConnectedProfileLink";
import { ConnectWalletButton } from "./ConnectWalletButton";
import "./lab.css";

// Fonts load at RUNTIME via a stylesheet link (display=swap) — deliberately NOT
// next/font/google, which fetches fonts during `next build` and fails the build
// when the network is unavailable. lab.css defines the --font-* variables with
// safe system fallbacks, so an unreachable CDN degrades gracefully.
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&family=Instrument+Serif:ital@1&family=Quicksand:wght@700&display=swap";

export const metadata: Metadata = {
  title: "BPS Launch Lab",
  description: "Create community markets paired with real-world assets.",
};

const DISCLOSURE =
  "Experimental independent market. Not affiliated with or endorsed by Alphabet, Google, " +
  "Robinhood, Doppler or Uniswap.";

export default function LabLayout({ children }: { children: ReactNode }) {
  return (
    <LabProviders>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS_HREF} />
      <div className="lab-root">
        <div className="lab-wrap">
          <header className="lab-header">
            <a href="/lab/tokens" className="lab-brand" aria-label="BPS Launch Lab home">
              <img src="/lab/bps-icon-flat.png" alt="" width={30} height={30} />
              bps launch lab
            </a>
            <nav aria-label="Launch Lab" className="lab-nav">
              <a href="/lab/tokens">Markets</a>
              <a href="/lab/launch">Launch</a>
              <ConnectedProfileLink />
              <ConnectWalletButton />
            </nav>
          </header>
          {children}
          <footer className="lab-disclosure" data-testid="lab-disclosure">
            {DISCLOSURE}
          </footer>
        </div>
      </div>
    </LabProviders>
  );
}
