import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Two projects: pure application-core + service tests under lib/ (node env), and React component tests
// (*.test.tsx under app/) in jsdom. Browser-level end-to-end is Playwright (playwright.config.ts).
export default defineConfig({
  plugins: [react()],
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
