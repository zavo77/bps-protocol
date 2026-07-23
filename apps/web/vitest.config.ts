import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Two projects: pure application-core + service tests under lib/ (node env), and React component tests
// (*.test.tsx under app/) in jsdom. Browser-level end-to-end is Playwright (playwright.config.ts).
// The `bps-wagmi-active` build-time specifier (see next.config.mjs) resolves to the production config here;
// component tests pass an explicit mock `config` prop, so they never touch the production connector path.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "bps-wagmi-active": fileURLToPath(new URL("./app/wagmi-active.ts", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "node", environment: "node", include: ["lib/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "dom",
          globals: true,
          environment: "jsdom",
          include: ["app/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
          testTimeout: 15000,
        },
      },
    ],
  },
});
