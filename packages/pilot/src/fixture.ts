// Loader for the single canonical checked-in cycle fixture. The JSON is the source of truth; it is
// read from disk and returned unparsed-into-domain (the pipeline validates it).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FIXTURE_URL = new URL("../fixtures/canonical-cycle.json", import.meta.url);

/** Absolute path to the canonical cycle fixture. */
export const CANONICAL_FIXTURE_PATH = fileURLToPath(FIXTURE_URL);

/** Read and JSON-parse the canonical cycle fixture. Returns unknown; the pipeline validates it. */
export function loadCanonicalFixture(): unknown {
  return JSON.parse(readFileSync(CANONICAL_FIXTURE_PATH, "utf8")) as unknown;
}
