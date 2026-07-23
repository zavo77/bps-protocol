import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNT_ADDRESS } from "./demo-fixture";
import { localTestAccount, LOCAL_TEST_ADDRESS } from "./testing/local-account";

// Production dependency-graph isolation (Task 9A §A/§C). The default production client graph
// (page → Providers → wagmi-active → wagmi-production, plus demo.ts / AppDashboard.tsx / demo-fixture.ts)
// must NOT reference the deterministic mock provider, the local test account, the private key, or anything
// under `lib/testing/*`. This is a source-level guard complementing the built-bundle scan in the audit
// report; a regression here fails before a build is even produced.
function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const PRODUCTION_GRAPH = [
  "../app/page.tsx",
  "../app/providers.tsx",
  "../app/wagmi-active.ts",
  "../app/wagmi-production.ts",
  "../app/demo.ts",
  "../app/AppDashboard.tsx",
  "./demo-fixture.ts",
];

const FORBIDDEN = [
  "lib/testing",
  "local-account",
  "localTestAccount",
  "LOCAL_TEST_PRIVATE_KEY",
  "createMockEip1193Provider",
  "createLocalWagmiConfig",
  "createDemoWalletClient",
  "privateKeyToAccount",
];

describe("production dependency-graph isolation (§A/§C)", () => {
  it("no production-graph module imports lib/testing, the mock provider, or key material", () => {
    for (const rel of PRODUCTION_GRAPH) {
      const src = read(rel);
      // Strip line comments so an explanatory comment mentioning a term is not a false positive.
      const code = src
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      for (const term of FORBIDDEN) {
        expect(code, `${rel} must not reference "${term}"`).not.toContain(term);
      }
    }
  });

  it("the key-free demo fixture never imports the testing/key modules", () => {
    const code = read("./demo-fixture.ts")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(code).not.toContain("testing/");
    expect(code).not.toContain("local-account");
    expect(code).not.toContain("privateKeyToAccount");
  });

  it("the hardcoded DEMO_ACCOUNT_ADDRESS matches the deterministic signer (single source of truth)", () => {
    // The production fixture hardcodes the address; the test/E2E-only key derives the same address. This
    // guarantees the key never needs to be imported by production to obtain the demo account address.
    expect(DEMO_ACCOUNT_ADDRESS).toBe(localTestAccount.address);
    expect(DEMO_ACCOUNT_ADDRESS).toBe(LOCAL_TEST_ADDRESS);
  });
});
