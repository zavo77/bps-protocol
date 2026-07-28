import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// Minimal root: html/body only. Each section owns its full page — the Launch
// Lab renders as a complete public product (app/lab/layout.tsx) and the legacy
// restricted-beta protocol dashboard keeps its own shell under /protocol.
export const metadata: Metadata = {
  title: "BPS Launch Lab",
  description: "Launch community markets paired with real-world assets.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
