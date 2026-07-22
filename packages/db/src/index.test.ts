import { describe, expect, it } from "vitest";
import { workspaceInfo } from "./index.js";

describe("@bps/db", () => {
  it("exposes accurate workspace info", () => {
    expect(workspaceInfo).toEqual({ name: "@bps/db", implemented: false });
  });
});
