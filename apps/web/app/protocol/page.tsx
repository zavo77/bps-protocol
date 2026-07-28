import { AppDashboard } from "../AppDashboard";
import { CanaryApp } from "../CanaryApp";
import { Providers } from "../providers";
import { isCanaryMode } from "../../lib/canary/profile";

// Restricted-beta interface (Task 8B), relocated from / to /protocol. Local
// demonstration mode: wallet, eligibility, trade, locking and claim flows run
// against a deterministic mock provider/transport; live protocol writes stay
// disabled until a broadcast-ready deployment manifest and the remaining
// operational inputs exist. Canary profile behavior unchanged (Task 10B-2).
export default function ProtocolPage() {
  return <Providers>{isCanaryMode() ? <CanaryApp /> : <AppDashboard />}</Providers>;
}
