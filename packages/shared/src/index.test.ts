import { describe, expect, it } from "vitest";
import { workspaceInfo } from "./index.js";

describe("@bps/shared", () => {
  it("exposes accurate workspace info", () => {
    expect(workspaceInfo).toEqual({ name: "@bps/shared", implemented: true });
  });
});
