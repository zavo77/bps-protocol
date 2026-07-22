import { defineConfig } from "vitest/config";

// Pure-TS application-core tests (no DOM). React component / browser tests are intentionally out of
// scope here — they would require @testing-library / a DOM env / a Vite React plugin that are not
// installed (a documented Task 8 blocker).
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
