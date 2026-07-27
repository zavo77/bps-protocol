import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// §G: the RIALTO_API_KEY and the Rialto quote client must never reach the browser.
// The enforced invariant is: any file that references the key MUST be server-only
// (import "server-only" — Next.js throws at build if such a module is pulled into a
// client bundle). Client-reachable source (no server-only marker) must reference
// neither the key nor the server quote client. This scanner walks lib + app and:
//   - exempts files marked `import "server-only"` (cannot be client-bundled), and
//   - fails if any client-reachable file references a forbidden symbol.
const FORBIDDEN = [
  "fetchRialtoAllowanceQuote",
  "@bps/rialto/server",
  "quote-client",
  "RIALTO_API_KEY",
];

const SERVER_ONLY_MARKERS = ['import "server-only"', "import 'server-only'"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...walk(p));
    } else if (/\.(ts|tsx|js|jsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function isServerOnly(src: string): boolean {
  return SERVER_ONLY_MARKERS.some((m) => src.includes(m));
}

describe("Rialto server-only import boundary (§G)", () => {
  it("no client-reachable source references the API key or the quote client", () => {
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
        if (isServerOnly(src)) continue; // server-only cannot be bundled into the client
        for (const term of FORBIDDEN) {
          if (src.includes(term)) offenders.push(`${file}: ${term}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the Rialto adapter that reads the key is marked server-only", () => {
    const adapter = readFileSync(join(process.cwd(), "lib", "lab", "rialto.ts"), "utf8");
    expect(adapter.includes("RIALTO_API_KEY")).toBe(true); // it does read the key
    expect(isServerOnly(adapter)).toBe(true); // ...but only server-side
  });

  it("the forbidden-term scanner actually works (self-check)", () => {
    expect(FORBIDDEN).toContain("RIALTO_API_KEY");
    // A non-server-only file with the term must be caught: no server-only marker here.
    const sample = "const k = process.env.RIALTO_API_KEY";
    expect(isServerOnly(sample)).toBe(false);
    expect(sample.includes("RIALTO_API_KEY")).toBe(true);
  });
});
