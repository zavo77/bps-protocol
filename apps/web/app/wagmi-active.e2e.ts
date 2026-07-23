"use client";
// E2E-ONLY active config (Task 9A §A). The deterministic mock wiring (authoritative mock EIP-1193 provider
// + deterministic mock read transport) built from `lib/testing`. This module is compiled into the app ONLY
// when `next.config.mjs` aliases the `bps-wagmi-active` specifier to it (the `BPS_E2E=1` build). It is NEVER
// part of the default production build, so the deterministic key/provider stay out of production client
// chunks. It exposes the SAME application-facing `Config`/injected-connector interface as production.
import type { Config } from "wagmi";
import { createLocalWagmiConfig, makeDemoState } from "../lib/testing/local-env";

// Start on the authoritative wrong network (chain 1) so the connect → switch-to-4663 flow is real.
export const activeWagmiConfig: Config = createLocalWagmiConfig(makeDemoState({ chainId: 1 }));
