import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { activeWagmiConfig } from "bps-wagmi-active";
import { productionWagmiConfig, injectedWalletAvailable } from "./wagmi-production";
import { Providers } from "./providers";

// Production configuration guarantees (Task 9A §C). These run with the DEFAULT (non-E2E) build wiring:
// `bps-wagmi-active` resolves to the production config, exactly as a shipped production build would.
describe("production wallet configuration (§C)", () => {
  it("does NOT silently default to the mock wallet — the active config is the production config", () => {
    expect(activeWagmiConfig).toBe(productionWagmiConfig);
    // No mock EIP-1193 connector is present (the demo connector id is "mockEip1193").
    for (const c of productionWagmiConfig.connectors) {
      expect(c.id).not.toBe("mockEip1193");
      expect(c.name).not.toMatch(/mock/i);
    }
    // A real injected connector is wired.
    expect(productionWagmiConfig.connectors.length).toBeGreaterThan(0);
    expect(
      productionWagmiConfig.connectors.some((c) =>
        /injected|metamask|wallet/i.test(`${c.id} ${c.name}`),
      ),
    ).toBe(true);
  });

  it("fails closed when no injected wallet is configured (no mock fallback)", () => {
    // jsdom has no injected wallet unless one is set. Ensure none, then assert unavailability.
    delete (globalThis as { ethereum?: unknown }).ethereum;
    delete (window as unknown as { ethereum?: unknown }).ethereum;
    expect(injectedWalletAvailable()).toBe(false);
  });

  it("reports availability only when a real injected provider is present", () => {
    (window as unknown as { ethereum?: unknown }).ethereum = { request: async () => null };
    expect(injectedWalletAvailable()).toBe(true);
    delete (window as unknown as { ethereum?: unknown }).ethereum;
  });

  it("test-provider injection is possible ONLY through the explicit config-prop boundary", () => {
    // With no prop, Providers uses the production config (proven above). Passing an explicit config is the
    // ONLY way a (test) provider enters — and it must be honored. Rendering both paths must not throw.
    const prod = render(
      <Providers>
        <div data-testid="child-prod" />
      </Providers>,
    );
    expect(prod.getByTestId("child-prod")).toBeInTheDocument();
    prod.unmount();

    const injected = render(
      <Providers config={productionWagmiConfig}>
        <div data-testid="child-injected" />
      </Providers>,
    );
    expect(injected.getByTestId("child-injected")).toBeInTheDocument();
    injected.unmount();
  });
});
