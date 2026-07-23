import { test, expect } from "@playwright/test";

// Deterministic browser workflow (Task 8B §L): connect → wrong-network → switch to 4663 → sign local
// declaration → separate local eligibility → preview official buy → exact approval → simulation →
// mocked confirmation → verify a distribution proof → claim → duplicate disabled. Runs entirely against
// the mock connector + mock transport; no real wallet, signature, or transaction.
test("restricted-beta local workflow in a real browser", async ({ page }) => {
  await page.goto("/");

  // Protocol-not-live + fixture labeling + disabled live write.
  await expect(page.getByTestId("not-live-banner")).toContainText(/Protocol not live/i);
  await expect(page.getByTestId("live-trade")).toBeDisabled();

  // Connect the (mock) wallet.
  await page.getByTestId("connect").click();
  await expect(page.getByTestId("account")).toBeVisible();

  // Wrong network → switch to Robinhood Chain 4663.
  await expect(page.getByTestId("network")).toContainText(/wrong network/i);
  await page.getByTestId("switch").click();
  await expect(page.getByTestId("network")).toContainText("Robinhood Chain (4663)");

  // Sign the local-test declaration; eligibility is a SEPARATE local result.
  await page.getByTestId("sign").click();
  await expect(page.getByTestId("eligible")).toContainText("yes");
  await expect(page.getByTestId("elig-state")).toContainText("eligible");

  // Official buy: exact allowance shown, live write still disabled, demo lifecycle confirms via mock.
  await expect(page.getByTestId("allowance")).toContainText("1.000");
  await expect(page.getByTestId("live-trade")).toBeDisabled();
  await page.getByTestId("demo-trade").click();
  await expect(page.getByTestId("trade-result")).toContainText(/confirmed/i);
  await expect(page.getByTestId("steps")).toContainText("approve");

  // Distribution claim: verify proof against the on-chain cycle, claim, then duplicate is disabled.
  await page.getByTestId("verify-proof").click();
  await expect(page.getByTestId("claim-status")).toContainText(/verified/i);
  await page.getByTestId("demo-claim").click();
  await expect(page.getByTestId("claim-status")).toContainText(/confirmed/i);
  await expect(page.getByTestId("demo-claim")).toBeDisabled();
});
