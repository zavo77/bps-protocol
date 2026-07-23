import { AppDashboard } from "./AppDashboard";
import { CanaryBanner } from "./CanaryBanner";
import { Providers } from "./providers";
import { isCanaryMode } from "../lib/canary/profile";

// Restricted-beta interface (Task 8B). Local demonstration mode: wallet, eligibility, trade, locking and
// claim flows run against a deterministic mock provider/transport; live protocol writes stay disabled
// until a broadcast-ready deployment manifest and the remaining operational inputs exist.
//
// Task 10B-1: when (and ONLY when) the canary profile is explicitly selected (NEXT_PUBLIC_BPS_CANARY=1), a
// persistent "BPSC-TEST — ROBINHOOD MAINNET CANARY — TEST ONLY" banner is shown. Default behavior is
// unchanged. Canary writes remain fail-closed/disabled until an approved canary manifest exists.
export default function HomePage() {
  return (
    <Providers>
      {isCanaryMode() ? <CanaryBanner /> : null}
      <AppDashboard />
    </Providers>
  );
}
