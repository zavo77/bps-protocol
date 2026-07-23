import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Providers } from "./providers";
import { CanaryApp } from "./CanaryApp";
import { createLocalWagmiConfig, makeDemoState } from "../lib/testing/local-env";

describe("CanaryApp routing (Task 10B-2)", () => {
  it("renders canary operations fail-closed and NEVER the demo dashboard or fixtures", () => {
    const config = createLocalWagmiConfig(makeDemoState({ chainId: 1 }));
    render(
      <Providers config={config}>
        <CanaryApp />
      </Providers>,
    );
    expect(screen.getByTestId("canary-app")).toBeInTheDocument();
    expect(screen.getByTestId("canary-banner")).toBeInTheDocument();
    // The committed default manifest is fail-closed → not-approved, all operations blocked.
    expect(screen.getByTestId("canary-status")).toHaveTextContent("not-approved");
    expect(screen.getByTestId("canary-global-block")).toBeInTheDocument();
    const rows = screen.getAllByTestId("canary-op-row");
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => expect(r).toHaveAttribute("data-op-ok", "no"));
    // Demo-dashboard controls / fixture banner must NOT appear in canary mode.
    expect(screen.queryByTestId("demo-trade")).toBeNull();
    expect(screen.queryByTestId("bps-balance")).toBeNull();
    expect(screen.queryByTestId("not-live-banner")).toBeNull();
    expect(screen.queryByTestId("acq-row")).toBeNull();
  });
});
