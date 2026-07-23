import { test, expect } from "@playwright/test";

// Deterministic browser workflow (Task 8C §H) in a REAL Chromium engine, driven entirely through the
// authoritative EIP-1193 mock provider + wagmi injected connector. It proves: provider-derived wrong
// chain → real provider switch to 4663 → connector-driven typed-data signature (recovered to the
// connected account) → separate local eligibility → official buy preview → exact approval + simulate +
// submit + confirm THROUGH THE CONNECTOR → a real local lock with confirmed-state reconciliation → an
// event-derived transparency view → proof-artifact validation → claim through the connector → the
// transparency view updating from the new decoded Claimed event → duplicate claim disabled. No real
// wallet, signature, or transaction is used.
test("restricted-beta connector-driven workflow in a real browser", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("not-live-banner")).toContainText(/Protocol not live/i);
  await expect(page.getByTestId("live-trade")).toBeDisabled();

  // Connect through the injected connector → provider-derived wrong chain.
  await page.getByTestId("connect").click();
  await expect(page.getByTestId("account")).toBeVisible();
  await expect(page.getByTestId("network")).toContainText(/wrong network \(1\)/i);

  // Real provider chain switch to 4663.
  await page.getByTestId("switch").click();
  await expect(page.getByTestId("network")).toContainText("Robinhood Chain (4663)");

  // Connector-driven signature; eligibility is a SEPARATE local result.
  await page.getByTestId("sign").click();
  await expect(page.getByTestId("eligible")).toContainText("yes");
  await expect(page.getByTestId("elig-state")).toContainText("eligible");

  // Official buy through the connector: exact allowance, live write disabled, confirmed lifecycle.
  await expect(page.getByTestId("allowance")).toContainText("1.000");
  await expect(page.getByTestId("live-trade")).toBeDisabled();
  await page.getByTestId("demo-trade").click();
  await expect(page.getByTestId("trade-result")).toContainText(/confirmed/i);
  await expect(page.getByTestId("steps")).toContainText("approve");

  // Real local lock with reconciliation → locked balance updates.
  await page.getByTestId("demo-lock").click();
  await expect(page.getByTestId("lock-result")).toContainText(/reconciled/i);
  await expect(page.getByTestId("locked-balance")).toContainText("1000.000");

  // Event-derived transparency.
  await expect(page.getByTestId("acq-row")).toBeVisible();
  await expect(page.getByTestId("tx-buyvol")).toContainText("1000.000");
  await expect(page.getByTestId("acq-remaining")).toContainText("1600.000");

  // Proof validation + claim through the connector, then transparency updates and duplicate is disabled.
  await page.getByTestId("verify-proof").click();
  await expect(page.getByTestId("claim-status")).toContainText(/verified/i);
  await page.getByTestId("demo-claim").click();
  await expect(page.getByTestId("claim-status")).toContainText(/reconciled/i);
  await expect(page.getByTestId("demo-claim")).toBeDisabled();
  await expect(page.getByTestId("acq-claimed")).toContainText("1600.000");
});
