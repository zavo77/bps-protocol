// Launch Lab section layout (server component). Mounts LabProviders exactly once
// around every /lab route and renders the required disclosure footer verbatim.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LabProviders } from "../../providers/lab-providers";

export const metadata: Metadata = {
  title: "BPS Launch Lab",
  description: "Create community markets paired with real-world assets.",
};

const DISCLOSURE =
  "Experimental independent market. BPS is not affiliated with or endorsed by Alphabet, Google, " +
  "Robinhood, Doppler or Uniswap. GOOGL refers to the canonical Alphabet Class A Robinhood Stock " +
  "Token used as the market's quote asset.";

export default function LabLayout({ children }: { children: ReactNode }) {
  return (
    <LabProviders>
      <nav
        aria-label="Launch Lab"
        style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}
      >
        <a href="/lab">Launch Lab</a>
        <a href="/lab/create">Create</a>
        <a href="/lab/proof">Proof</a>
      </nav>
      {children}
      <footer
        style={{ marginTop: "2rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}
      >
        <p className="small muted" data-testid="lab-disclosure">
          {DISCLOSURE}
        </p>
      </footer>
    </LabProviders>
  );
}
