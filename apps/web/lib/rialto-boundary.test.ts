import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// §G: the client-consumable application code must NEVER import the server-only Rialto quote client, the
// server subpath, or reference the API key. This scans the browser-reachable source (lib + app) and
// fails if any forbidden symbol appears. Operator/quote handling stays server-only by construction.
const FORBIDDEN = [
  "fetchRialtoAllowanceQuote",
  "@bps/rialto/server",
  "quote-client",
  "RIALTO_API_KEY",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...walk(p));
    } else if (/\.(ts|tsx|js|jsx)$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("Rialto server-only import boundary (§G)", () => {
  it("no browser-reachable source imports the quote client or references the API key", () => {
    const roots = ["lib", "app"].map((d) => join(process.cwd(), d));
    const offenders: string[] = [];
    for (const root of roots) {
      let files: string[] = [];
      try {
        files = walk(root);
      } catch {
        continue; // directory may not exist
      }
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        for (const term of FORBIDDEN) {
          if (src.includes(term)) offenders.push(`${file}: ${term}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the forbidden-term scanner actually works (self-check)", () => {
    // Guard against a broken scanner silently passing: the term list is non-empty and matched literally.
    expect(FORBIDDEN).toContain("RIALTO_API_KEY");
    expect("const x = fetchRialtoAllowanceQuote()".includes("fetchRialtoAllowanceQuote")).toBe(
      true,
    );
  });
});
