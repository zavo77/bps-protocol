// Thin public surface for the local fixture runner. Domain logic lives in @bps/shared.

import { runProofOfDistribution, type PipelineResult } from "@bps/shared";
import { loadCanonicalFixture } from "./fixture.js";

export interface WorkspaceInfo {
  readonly name: string;
  readonly implemented: boolean;
}

export const workspaceInfo: WorkspaceInfo = {
  name: "@bps/pilot",
  implemented: true,
};

export { CANONICAL_FIXTURE_PATH, loadCanonicalFixture } from "./fixture.js";

/** Run the Proof-of-Distribution pipeline against the canonical checked-in fixture. */
export function runCanonicalCycle(): PipelineResult {
  return runProofOfDistribution(loadCanonicalFixture());
}
