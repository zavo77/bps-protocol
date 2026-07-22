import { describe, expect, it } from "vitest";
import { DRY_RUN_MANIFEST, LOCAL_DEMO_MANIFEST } from "./fixtures";
import {
  enableWrites,
  resolveDeployment,
  writesAllowed,
  type DeploymentManifest,
} from "./manifest";

function liveManifest(): DeploymentManifest {
  // A production-shaped manifest with real-looking (non-fixture) actual addresses.
  return {
    ...LOCAL_DEMO_MANIFEST,
    isFixture: false,
    mode: "restricted-beta",
    sourceCommit: "abc123",
  };
}

describe("deployment-manifest boundary (§A)", () => {
  it("dry-run manifest resolves to not-live (no write controls)", () => {
    const s = resolveDeployment(DRY_RUN_MANIFEST);
    expect(s.status).toBe("not-live");
    expect(writesAllowed(s)).toBe(false);
  });

  it("wrong chain id is invalid", () => {
    const s = resolveDeployment({ ...liveManifest(), chainId: 1 });
    expect(s.status).toBe("invalid");
  });

  it("malformed manifest is invalid (fails closed)", () => {
    expect(resolveDeployment({ nonsense: true }).status).toBe("invalid");
    expect(resolveDeployment(null).status).toBe("invalid");
  });

  it("null/placeholder actual address keeps it not-live", () => {
    const m = liveManifest();
    const s = resolveDeployment({ ...m, actual: { ...m.actual, tradeRouter: null } });
    expect(s.status).toBe("not-live");
    const s2 = resolveDeployment({
      ...m,
      actual: { ...m.actual, tradeRouter: "0x0000000000000000000000000000000000000000" },
    });
    expect(s2.status).toBe("not-live");
  });

  it("live manifest starts writes-disabled until runtime code is confirmed", () => {
    const s = resolveDeployment(liveManifest());
    expect(s.status).toBe("live");
    if (s.status !== "live") return;
    expect(s.writesEnabled).toBe(false);
    expect(writesAllowed(s)).toBe(false);
    // Confirm code for all required addresses -> writes enabled.
    const codePresent = Object.fromEntries(
      s.requiredCodeAddresses.map((a) => [a.toLowerCase(), true]),
    );
    const enabled = enableWrites(s, codePresent);
    expect(writesAllowed(enabled)).toBe(true);
  });

  it("missing runtime code on any required contract keeps writes disabled", () => {
    const s = resolveDeployment(liveManifest());
    if (s.status !== "live") throw new Error("expected live");
    const codePresent = Object.fromEntries(
      s.requiredCodeAddresses.slice(1).map((a) => [a.toLowerCase(), true]),
    );
    expect(writesAllowed(enableWrites(s, codePresent))).toBe(false);
  });

  it("fixture manifest never enables live writes even with code and broadcastReady", () => {
    const s = resolveDeployment(LOCAL_DEMO_MANIFEST); // isFixture: true
    expect(s.status).toBe("live");
    if (s.status !== "live") return;
    const codePresent = Object.fromEntries(
      s.requiredCodeAddresses.map((a) => [a.toLowerCase(), true]),
    );
    expect(writesAllowed(enableWrites(s, codePresent))).toBe(false);
    expect(s.isFixture).toBe(true);
  });
});
