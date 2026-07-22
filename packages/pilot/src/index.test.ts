import { describe, expect, it } from "vitest";
import { workspaceInfo } from "./index.js";

describe("@bps/pilot", () => {
  it("exposes accurate workspace info", () => {
    expect(workspaceInfo).toEqual({ name: "@bps/pilot", implemented: true });
  });
});
