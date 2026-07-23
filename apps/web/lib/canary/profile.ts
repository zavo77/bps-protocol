// Canary web-profile selector (Task 10B-1). Canary mode is OFF by default and requires an EXPLICIT build-time
// selection (`NEXT_PUBLIC_BPS_CANARY=1`). When off, the application behaves exactly as before (canonical
// production config, Task 9A). This module only reports the selection + the persistent label; it holds no
// key and constructs no wallet client.
import { CANARY_LABEL } from "./manifest";

/** True only when the canary profile was explicitly selected at build time. Default (unset) => false. */
export function isCanaryMode(): boolean {
  return process.env.NEXT_PUBLIC_BPS_CANARY === "1";
}

export { CANARY_LABEL };
