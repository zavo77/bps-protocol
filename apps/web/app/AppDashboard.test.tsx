import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppDashboard } from "./AppDashboard";
import { Providers } from "./providers";
import { createLocalWagmiConfig, makeDemoState } from "../lib/testing/local-env";
import type { MockChainState } from "../lib/testing/mock-rpc";

function renderApp(overrides: Partial<MockChainState> = {}) {
  // Start on the authoritative WRONG chain (id 1) so the provider-derived switch flow is exercised.
  const config = createLocalWagmiConfig(makeDemoState({ chainId: 1, ...overrides }));
  return render(
    <Providers config={config}>
      <AppDashboard />
    </Providers>,
  );
}

async function connectAndSwitch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("connect"));
  await waitFor(() => expect(screen.getByTestId("account")).toBeInTheDocument());
  // Provider-derived wrong chain.
  expect(screen.getByTestId("network")).toHaveTextContent(/wrong network \(1\)/i);
  await user.click(screen.getByTestId("switch"));
  await waitFor(() =>
    expect(screen.getByTestId("network")).toHaveTextContent("Robinhood Chain (4663)"),
  );
}

describe("AppDashboard (provider-driven, §H)", () => {
  it("before connect: protocol-not-live, disabled live writes, fixture label", () => {
    renderApp();
    expect(screen.getByTestId("not-live-banner")).toHaveTextContent(/Protocol not live/i);
    expect(screen.getByTestId("live-trade")).toBeDisabled();
    expect(screen.getAllByText(/demonstration data/i).length).toBeGreaterThan(0);
  });

  it("rejected network switch preserves the wrong-chain state", async () => {
    const user = userEvent.setup();
    renderApp({ switchChainRejects: true });
    await user.click(screen.getByTestId("connect"));
    await waitFor(() => expect(screen.getByTestId("account")).toBeInTheDocument());
    await user.click(screen.getByTestId("switch"));
    await waitFor(() => expect(screen.getByTestId("switch-error")).toBeInTheDocument());
    expect(screen.getByTestId("network")).toHaveTextContent(/wrong network \(1\)/i);
  });

  it("full flow: switch → connector signature → eligible → approval+trade → lock → claim → transparency", async () => {
    const user = userEvent.setup();
    renderApp();
    await connectAndSwitch(user);

    // Before signing: not eligible; write actions gated.
    expect(screen.getByTestId("eligible")).toHaveTextContent("no");
    expect(screen.getByTestId("demo-trade")).toBeDisabled();

    // Sign through the connector; eligibility is a SEPARATE result.
    await user.click(screen.getByTestId("sign"));
    await waitFor(() => expect(screen.getByTestId("eligible")).toHaveTextContent("yes"));
    expect(screen.getByTestId("elig-state")).toHaveTextContent("eligible");

    // Official buy: exact allowance, live write disabled, connector-driven lifecycle confirms.
    expect(screen.getByTestId("allowance")).toHaveTextContent("1.000");
    expect(screen.getByTestId("live-trade")).toBeDisabled();
    await user.click(screen.getByTestId("demo-trade"));
    await waitFor(
      () => expect(screen.getByTestId("trade-result")).toHaveTextContent(/confirmed/i),
      { timeout: 8000 },
    );
    expect(screen.getByTestId("steps")).toHaveTextContent("approve");

    // Lock: confirmed + reconciled. A pre-existing 500 position is seeded, so locked rises to 1500.
    await waitFor(() => expect(screen.getByTestId("bps-balance")).not.toHaveTextContent("—"));
    await waitFor(() => expect(screen.getByTestId("locked-balance")).toHaveTextContent("500.000"));
    await user.click(screen.getByTestId("demo-lock"));
    await waitFor(
      () => expect(screen.getByTestId("lock-result")).toHaveTextContent(/reconciled/i),
      { timeout: 8000 },
    );
    await waitFor(() => expect(screen.getByTestId("locked-balance")).toHaveTextContent("1500.000"));

    // Partial withdrawal: withdraw ONLY the newly-created position; the pre-existing 500 remains locked.
    // Success is reconciled against the authoritative locked balance (never inferred from the tx hash).
    await user.click(screen.getByTestId("demo-withdraw"));
    await waitFor(
      () => expect(screen.getByTestId("withdraw-result")).toHaveTextContent(/reconciled/i),
      { timeout: 8000 },
    );
    await waitFor(() => expect(screen.getByTestId("locked-balance")).toHaveTextContent("500.000"));
    expect(screen.getByTestId("demo-withdraw")).toBeDisabled(); // no further position to withdraw

    // Event-backed transparency renders decoded events.
    await waitFor(() => expect(screen.getByTestId("acq-row")).toBeInTheDocument());
    expect(screen.getByTestId("tx-buyvol")).toHaveTextContent("1000.000");
    expect(screen.getByTestId("acq-remaining")).toHaveTextContent("1600.000");

    // Claim: verify all fields, claim + reconcile, then transparency updates and duplicate is disabled.
    await user.click(screen.getByTestId("verify-proof"));
    await waitFor(() => expect(screen.getByTestId("claim-status")).toHaveTextContent(/verified/i));
    await user.click(screen.getByTestId("demo-claim"));
    await waitFor(
      () => expect(screen.getByTestId("claim-status")).toHaveTextContent(/reconciled/i),
      { timeout: 8000 },
    );
    await waitFor(() => expect(screen.getByTestId("demo-claim")).toBeDisabled());
    // Transparency reflects the new Claimed event (remaining drops to 0).
    await waitFor(() => expect(screen.getByTestId("acq-claimed")).toHaveTextContent("1600.000"), {
      timeout: 8000,
    });
  });
});
