import { defineConfig, devices } from "@playwright/test";

// Browser-level E2E (Task 8B §L). Runs the real app (Next dev server) in a real Chromium engine against
// the deterministic mock connector + mock transport — NO real wallet, signature, or transaction. This is
// NOT a vitest function test; it drives the rendered DOM in a browser.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "off", headless: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
