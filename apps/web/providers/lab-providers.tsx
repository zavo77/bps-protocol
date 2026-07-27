"use client";
// Launch Lab provider shell. Reuses the app's existing `Providers` (WagmiProvider +
// QueryClientProvider, see app/providers.tsx) so the lab shares the exact same wallet
// and query wiring. No new context is introduced. The optional `config` prop exists
// for component tests, mirroring the `Providers` boundary.
import type { ReactNode } from "react";
import type { Config } from "wagmi";
import { Providers } from "../app/providers";

export function LabProviders({ children, config }: { children: ReactNode; config?: Config }) {
  // Conditional spread keeps exactOptionalPropertyTypes satisfied.
  return <Providers {...(config ? { config } : {})}>{children}</Providers>;
}
