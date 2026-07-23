import { AppDashboard } from "./AppDashboard";
import { Providers } from "./providers";

// Restricted-beta interface (Task 8B). Local demonstration mode: wallet, eligibility, trade, locking and
// claim flows run against a deterministic mock provider/transport; live protocol writes stay disabled
// until a broadcast-ready deployment manifest and the remaining operational inputs exist.
export default function HomePage() {
  return (
    <Providers>
      <AppDashboard />
    </Providers>
  );
}
