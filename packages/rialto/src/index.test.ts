import { describe, expect, it } from "vitest";
import { workspaceInfo } from "./index.js";

describe("@bps/rialto", () => {
  it("exposes accurate workspace info", () => {
    expect(workspaceInfo).toEqual({ name: "@bps/rialto", implemented: true });
  });
});
