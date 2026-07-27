// Guards the local indexer anchor registry against drift from the canonical
// @bps/launch-lab registry. Tests may import the shared TypeScript source
// (vitest resolves it); the PRODUCTION indexer never does — see anchors.ts.

import { describe, expect, it } from "vitest";
import { APPROVED_ANCHORS as LOCAL } from "./anchors.js";
import { APPROVED_ANCHORS as CANONICAL } from "../../../packages/launch-lab/src/anchors/registry.js";

describe("indexer anchor registry sync", () => {
  it("matches @bps/launch-lab symbol -> address exactly", () => {
    const local = LOCAL.map((a) => `${a.symbol}:${a.address.toLowerCase()}`).sort();
    const canonical = CANONICAL.map((a) => `${a.symbol}:${a.address.toLowerCase()}`).sort();
    expect(local).toEqual(canonical);
  });

  it("has the same anchor count and decimals", () => {
    expect(LOCAL.length).toBe(CANONICAL.length);
    for (const c of CANONICAL) {
      const l = LOCAL.find((x) => x.symbol === c.symbol);
      expect(l, `missing ${c.symbol}`).toBeTruthy();
      expect(l?.decimals).toBe(c.decimals);
      expect(l?.address.toLowerCase()).toBe(c.address.toLowerCase());
    }
  });
});
