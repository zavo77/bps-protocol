/** @type {import("next").NextConfig} */
/* global process */

// The `bps-wagmi-active` specifier selects the app's active wagmi config at BUILD time. By default it
// resolves to `./app/wagmi-active.ts` (the production injected-wallet config; no `lib/testing`). ONLY the
// isolated E2E build (`BPS_E2E=1`) aliases it to `./app/wagmi-active.e2e.ts`, which pulls in the
// deterministic mock wiring. This keeps the deterministic mock provider / test account / private-key
// material out of the default production client bundle by construction.
const e2e = process.env.BPS_E2E === "1";

const nextConfig = {
  turbopack: {
    resolveAlias: {
      "bps-wagmi-active": e2e ? "./app/wagmi-active.e2e.ts" : "./app/wagmi-active.ts",
    },
  },
  // @bps/launch-lab ships TypeScript source (no prebuild step); Next compiles it.
  transpilePackages: ["@bps/launch-lab"],
};

export default nextConfig;
