import { defineConfig, devices } from "@playwright/test";

// Browser-level E2E (Task 8B §L; isolated build in Task 9A §A). Runs the real app in a real Chromium engine
// against the deterministic mock connector + mock transport — NO real wallet, signature, or transaction.
// The E2E build sets `BPS_E2E=1`, which makes `next.config.mjs` alias `bps-wagmi-active` to the E2E-only
// `wagmi-active.e2e.ts` (the deterministic mock wiring). The DEFAULT `npm run build` (no `BPS_E2E`) never
// compiles that wiring — the production bundle stays free of the mock provider / test account / key.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "off", headless: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Build + serve the ISOLATED E2E bundle (deterministic mock wiring compiled in via BPS_E2E).
  webServer: {
    command: "npm run build && npx next start --port 3100",
    env: { BPS_E2E: "1" },
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
