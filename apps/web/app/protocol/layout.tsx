import type { Metadata } from "next";
import type { ReactNode } from "react";

// Legacy restricted-beta protocol shell — applies ONLY to /protocol. The public
// Launch Lab renders its own full-page design and never inherits this chrome.
export const metadata: Metadata = {
  title: "BPS Protocol — Restricted Beta",
  description:
    "BPS Protocol restricted-beta interface: official-route trading, locking, distribution claims, " +
    "and on-chain transparency. Fails closed until a valid live deployment manifest exists.",
};

export default function ProtocolLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container">
      <header className="site-header">
        <div className="brand">
          BPS Protocol <span>· Restricted Beta</span>
        </div>
        <span className="badge badge-warn" role="status">
          Restricted beta · not a public launch
        </span>
      </header>
      {children}
    </div>
  );
}
