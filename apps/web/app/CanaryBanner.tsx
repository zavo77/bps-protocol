import { CANARY_LABEL, canaryWritesAllowed, resolveCanary } from "../lib/canary/manifest";
import { DEFAULT_CANARY_MANIFEST } from "../lib/canary/manifest.data";

// Persistent canary label + fail-closed status (Task 10B-1). Rendered ONLY when the canary profile is
// explicitly selected. It resolves the fail-closed canary manifest and shows whether live canary writes are
// enabled (they are DISABLED until an approved manifest sets both broadcastReady and liveWritesApproved).
// It never presents the canary as canonical BPS and never shows fixture data as live.
export function CanaryBanner() {
  const state = resolveCanary(DEFAULT_CANARY_MANIFEST);
  const writes = canaryWritesAllowed(state);
  const reason =
    state.status === "not-approved"
      ? state.reason
      : state.status === "invalid"
        ? state.errors.join("; ")
        : "";
  return (
    <section
      data-testid="canary-banner"
      role="alert"
      aria-live="polite"
      style={{
        border: "2px solid #b45309",
        background: "#fffbeb",
        color: "#7c2d12",
        padding: "0.75rem 1rem",
        borderRadius: "0.5rem",
        margin: "0 0 0.75rem",
      }}
    >
      <strong>{CANARY_LABEL}</strong>. Non-production experimental token, no official value — this
      is <strong>NOT canonical BPS</strong>. Live canary writes:{" "}
      <strong data-testid="canary-writes">{writes ? "enabled" : "DISABLED (fail-closed)"}</strong>.
      {reason ? <span data-testid="canary-reason"> {reason}</span> : null}
    </section>
  );
}
