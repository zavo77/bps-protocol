// Provenance gating tests — the store's listLaunches must be verified-only and
// must never classify markets from chain events. We exercise the pure SQL
// intent via a mock pg pool injected through the module's DATABASE_URL path.

import { afterEach, describe, expect, it, vi } from "vitest";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.resetModules();
});

/** Load the store with a mocked `pg` so no real DB is needed. */
async function loadStoreWithRows(verifiedRows: Record<string, unknown>[]) {
  const queries: string[] = [];
  vi.doMock("pg", () => ({
    default: {},
    Pool: class {
      async query(text: string) {
        const norm = text.replace(/\s+/g, " ").trim();
        queries.push(norm);
        if (/FROM lab_launches WHERE provenance_verified = true/i.test(norm)) {
          return { rows: verifiedRows };
        }
        return { rows: [] };
      }
    },
  }));
  vi.doMock("server-only", () => ({}));
  process.env.DATABASE_URL = "postgresql://u:p@h:5432/db";
  const store = await import("./store");
  return { store, queries };
}

const GOOGL = "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3";

describe("provenance-gated listLaunches", () => {
  it("selects only provenance_verified rows", async () => {
    const { store, queries } = await loadStoreWithRows([
      {
        token_address: "0x1f212fccea9995931f4f2f9ca0c8b641188ca196",
        token_name: "PRINT",
        token_symbol: "PRINT",
        creator: "0x29244a2309b703f82e292a3db7df0e95d0cdca72",
        numeraire: GOOGL,
        anchor_symbol: "GOOGL",
        pool_or_hook: "0x9982538f41f2ae29ddb9d3d9307010052984fdbb",
        launch_tx: `0x${"ab".repeat(32)}`,
        block_number: "20800000",
        ts: 1785000000,
      },
    ]);
    store.invalidateLaunchCache();
    const rows = await store.listLaunches();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenSymbol).toBe("PRINT");
    // The SELECT MUST filter on provenance_verified — never a bare scan.
    expect(queries.some((q) => /WHERE provenance_verified = true/i.test(q))).toBe(true);
  });

  it("returns an empty registry (never misclassifies) when there are no verified rows", async () => {
    const { store } = await loadStoreWithRows([]);
    store.invalidateLaunchCache();
    expect(await store.listLaunches()).toEqual([]);
  });
});
