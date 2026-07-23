import { AppDashboard } from "./AppDashboard";
import { CanaryApp } from "./CanaryApp";
import { Providers } from "./providers";
import { isCanaryMode } from "../lib/canary/profile";

// Restricted-beta interface (Task 8B). Local demonstration mode: wallet, eligibility, trade, locking and
// claim flows run against a deterministic mock provider/transport; live protocol writes stay disabled
// until a broadcast-ready deployment manifest and the remaining operational inputs exist.
//
// Task 10B-2: when (and ONLY when) the canary profile is explicitly selected (NEXT_PUBLIC_BPS_CANARY=1), the
// app renders the isolated `CanaryApp` INSTEAD of the demonstration dashboard — so canary mode routes every
// operation through the canary manifest only, never the demo fixtures or canonical BPS addresses. Default
// (non-canary) behavior is unchanged. Canary writes remain fail-closed until an approved canary manifest
// sets both broadcastReady and liveWritesApproved.
export default function HomePage() {
  return <Providers>{isCanaryMode() ? <CanaryApp /> : <AppDashboard />}</Providers>;
}
