import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Canary source-isolation guard (Task 10B-1). No canary component may import a deterministic account, the
// mock provider, or construct a separate wallet client — signatures/transactions must flow through the
// connected connector/provider exactly like production (Task 9A). Complements the production-graph guard.
function readCode(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

const CANARY_FILES = [
  "./manifest.ts",
  "./manifest.data.ts",
  "./profile.ts",
  "../../app/CanaryBanner.tsx",
];

const FORBIDDEN = [
  "lib/testing",
  "local-account",
  "localTestAccount",
  "LOCAL_TEST_PRIVATE_KEY",
  "createMockEip1193Provider",
  "createLocalWagmiConfig",
  "createDemoWalletClient",
  "createWalletClient",
  "privateKeyToAccount",
];

describe("canary source isolation (§7)", () => {
  it("no canary module imports a deterministic account, mock provider, or wallet client", () => {
    for (const rel of CANARY_FILES) {
      const code = readCode(rel);
      for (const term of FORBIDDEN) {
        expect(code, `${rel} must not reference "${term}"`).not.toContain(term);
      }
    }
  });
});
