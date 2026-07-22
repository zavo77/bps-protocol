import { describe, expect, it } from "vitest";
import * as barrel from "./index.js";
import * as server from "./server.js";

describe("@bps/rialto", () => {
  it("exposes accurate workspace info", () => {
    expect(barrel.workspaceInfo).toEqual({ name: "@bps/rialto", implemented: true });
  });

  // Structural boundary: the server-only quote client must NOT be reachable from the main barrel a
  // browser/client bundle would import. It is exposed exclusively through "@bps/rialto/server".
  it("does not re-export the server-only quote client from the main barrel", () => {
    const names = Object.keys(barrel);
    expect(names).not.toContain("fetchRialtoAllowanceQuote");
    expect(names).not.toContain("RialtoQuoteError");
    expect((barrel as Record<string, unknown>).fetchRialtoAllowanceQuote).toBeUndefined();
  });

  it("exposes the quote client only through the server entry", () => {
    expect(typeof server.fetchRialtoAllowanceQuote).toBe("function");
    expect(typeof server.RialtoQuoteError).toBe("function");
  });
});
