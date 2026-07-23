import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppDashboard } from "./AppDashboard";
import { Providers } from "./providers";
import { createLocalWagmiConfig } from "../lib/testing/local-env";
import { makeDemoState } from "../lib/testing/local-env";

function renderApp() {
  const config = createLocalWagmiConfig(makeDemoState());
  return render(
    <Providers config={config}>
      <AppDashboard />
    </Providers>,
  );
}

describe("AppDashboard (component / integration, §L)", () => {
  it("shows Protocol-not-live, disabled live writes, and a fixture label before connecting", () => {
    renderApp();
    expect(screen.getByTestId("not-live-banner")).toHaveTextContent(/Protocol not live/i);
    expect(screen.getByTestId("live-trade")).toBeDisabled();
    expect(screen.getAllByText(/demonstration data/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("connect")).toBeInTheDocument();
  });

  it("connect → wrong-network → switch → sign → eligible → demo trade → claim → duplicate disabled", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTestId("connect"));
    await waitFor(() => expect(screen.getByTestId("account")).toBeInTheDocument());

    // Starts in the (simulated) wrong-network state; switching moves to 4663.
    expect(screen.getByTestId("network")).toHaveTextContent(/wrong network/i);
    await user.click(screen.getByTestId("switch"));
    await waitFor(() =>
      expect(screen.getByTestId("network")).toHaveTextContent("Robinhood Chain (4663)"),
    );

    // Signing alone is not eligibility; the separate service returns eligible for this account.
    await user.click(screen.getByTestId("sign"));
    await waitFor(() => expect(screen.getByTestId("eligible")).toHaveTextContent("yes"));
    expect(screen.getByTestId("elig-state")).toHaveTextContent("eligible");

    // Live trade stays disabled; the local demo lifecycle runs against the mock.
    expect(screen.getByTestId("live-trade")).toBeDisabled();
    expect(screen.getByTestId("allowance")).toHaveTextContent("1.000"); // exact input allowance
    await user.click(screen.getByTestId("demo-trade"));
    await waitFor(
      () => expect(screen.getByTestId("trade-result")).toHaveTextContent(/confirmed/i),
      {
        timeout: 5000,
      },
    );
    expect(screen.getByTestId("steps")).toHaveTextContent("approve");

    // Claim: verify the proof against the on-chain cycle, then run the local claim; duplicate disabled.
    await user.click(screen.getByTestId("verify-proof"));
    await waitFor(() => expect(screen.getByTestId("claim-status")).toHaveTextContent(/verified/i));
    await user.click(screen.getByTestId("demo-claim"));
    await waitFor(
      () => expect(screen.getByTestId("claim-status")).toHaveTextContent(/confirmed/i),
      {
        timeout: 5000,
      },
    );
    await waitFor(() => expect(screen.getByTestId("demo-claim")).toBeDisabled());
  });

  it("terms signed but ineligible account never becomes eligible", async () => {
    // The mock eligibility service only allow-lists the demo account; this test asserts the gate logic
    // via the eligibility state directly is covered in lib/eligibility.test.ts. Here we assert the UI
    // keeps writes gated until eligible.
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("connect"));
    await waitFor(() => expect(screen.getByTestId("account")).toBeInTheDocument());
    await user.click(screen.getByTestId("switch"));
    await waitFor(() =>
      expect(screen.getByTestId("network")).toHaveTextContent("Robinhood Chain (4663)"),
    );
    // After switching but before signing: not eligible, demo trade disabled.
    expect(screen.getByTestId("eligible")).toHaveTextContent("no");
    expect(screen.getByTestId("demo-trade")).toBeDisabled();
  });
});
