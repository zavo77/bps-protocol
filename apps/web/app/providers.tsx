"use client";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type Config } from "wagmi";
import { localWagmiConfig } from "./wagmi-local";

// App providers (Task 8B). Wraps the tree in wagmi + react-query. `config` is injectable so component
// tests and the browser E2E can supply the same local mock config. LOCAL DEMONSTRATION only.
export function Providers({ children, config }: { children: ReactNode; config?: Config }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <WagmiProvider config={config ?? localWagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
