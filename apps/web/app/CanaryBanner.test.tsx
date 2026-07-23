import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CanaryBanner } from "./CanaryBanner";

describe("CanaryBanner (Task 10B-1)", () => {
  it("renders the persistent BPSC-TEST canary label and never presents as canonical BPS", () => {
    render(<CanaryBanner />);
    const banner = screen.getByTestId("canary-banner");
    expect(banner).toHaveTextContent("BPSC-TEST — ROBINHOOD MAINNET CANARY — TEST ONLY");
    expect(banner).toHaveTextContent(/not canonical bps/i);
    expect(banner).toHaveTextContent(/no official value/i);
  });

  it("shows canary writes DISABLED (fail-closed) for the default committed manifest", () => {
    render(<CanaryBanner />);
    expect(screen.getByTestId("canary-writes")).toHaveTextContent("DISABLED (fail-closed)");
  });
});
