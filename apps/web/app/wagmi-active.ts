"use client";
// Build-time-selected active wagmi config (Task 9A §A). DEFAULT (production) resolves here → the
// injected/production config with NO `lib/testing`, NO deterministic mock provider, and NO deterministic
// signing key. The isolated E2E build aliases the bare `bps-wagmi-active` specifier to
// `./wagmi-active.e2e.ts` (see `next.config.mjs`, gated by `BPS_E2E=1`), so the deterministic mock wiring is
// compiled in ONLY for the E2E build and never enters production client chunks. Component tests bypass this
// module entirely by passing an explicit `config` prop to <Providers>.
import type { Config } from "wagmi";
import { productionWagmiConfig } from "./wagmi-production";

export const activeWagmiConfig: Config = productionWagmiConfig;
