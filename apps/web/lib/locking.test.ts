import { describe, expect, it } from "vitest";
import { LOCAL_DEMO_MANIFEST } from "./fixtures";
import { enableWrites, resolveDeployment, type DeploymentState } from "./manifest";
import { buildLockView, planCreateLock, planWithdraw, previewLockWeight } from "./locking";

function live(writable: boolean): DeploymentState {
  const s = resolveDeployment({ ...LOCAL_DEMO_MANIFEST, isFixture: false, sourceCommit: "abc" });
  if (s.status !== "live") throw new Error("expected live");
  if (!writable) return s;
  return enableWrites(
    s,
    Object.fromEntries(s.requiredCodeAddresses.map((a) => [a.toLowerCase(), true])),
  );
}

describe("locking model (§D)", () => {
  it("view exposes balances and a no-yield disclosure (no APY language)", () => {
    const v = buildLockView(1000n, 400n);
    expect(v.walletBpsBalance).toBe(1000n);
    expect(v.lockedPrincipal).toBe(400n);
    expect(v.snapshotNote.toLowerCase()).toContain("does not guarantee");
    expect(v.snapshotNote.toLowerCase()).toContain("no yield"); // discloses NO yield is paid
    expect(v.snapshotNote.toLowerCase()).not.toContain("apy");
    expect(v.snapshotNote.toLowerCase()).not.toContain("guaranteed return");
  });

  it("preview weight matches floor(principal * multiplierBps / 10000)", () => {
    expect(previewLockWeight(100_000n, 604_800)).toBe(110_000n);
    expect(previewLockWeight(100_000n, 2_592_000)).toBe(175_000n);
    expect(() => previewLockWeight(1n, 12345)).toThrow();
  });

  it("createLock plan uses exact allowance and the locking-vault target; gated by writes+eligibility", () => {
    const dep = live(true);
    if (dep.status !== "live") throw new Error();
    const plan = planCreateLock(500n, 604_800, dep, true);
    expect(plan.target.toLowerCase()).toBe(dep.addresses.lockingVault.toLowerCase());
    expect(plan.allowanceAmount).toBe(500n); // exact
    expect(plan.canSubmit).toBe(true);
    expect(planCreateLock(500n, 604_800, dep, false).canSubmit).toBe(false); // not eligible
    expect(planCreateLock(500n, 604_800, live(false), true).canSubmit).toBe(false); // writes disabled
  });

  it("withdraw plan targets the locking vault", () => {
    const dep = live(true);
    if (dep.status !== "live") throw new Error();
    expect(planWithdraw(0n, dep, true).target.toLowerCase()).toBe(
      dep.addresses.lockingVault.toLowerCase(),
    );
  });
});
