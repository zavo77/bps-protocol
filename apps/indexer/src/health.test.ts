import { describe, expect, it } from "vitest";
import { getHealthStatus } from "./health.js";

describe("getHealthStatus", () => {
  it("reports the indexer service as ok with the given timestamp", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(getHealthStatus(now)).toEqual({
      service: "indexer",
      status: "ok",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
  });
});
