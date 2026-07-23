"use client";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type Config } from "wagmi";
import { activeWagmiConfig } from "bps-wagmi-active";

// App providers (Task 8B; production-isolated in Task 9A). By default the app uses the production
// injected-wallet config (`activeWagmiConfig` → `wagmi-active.ts` → `wagmi-production.ts`). Nothing on the
// default production path imports `lib/testing`, the deterministic mock provider, the local test account, or
// any deterministic signing material. The `bps-wagmi-active` specifier is a build-time alias: only the
// isolated E2E build (`BPS_E2E=1`) rewrites it to `wagmi-active.e2e.ts`, which pulls in the deterministic
// mock wiring — that wiring therefore never enters production client chunks (a build-boundary exclusion, not
// a runtime flag). `config` is injectable so COMPONENT tests supply the deterministic mock config through
// this explicit boundary, using the same application-facing connector interface.
export function Providers({ children, config }: { children: ReactNode; config?: Config }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <WagmiProvider config={config ?? activeWagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
