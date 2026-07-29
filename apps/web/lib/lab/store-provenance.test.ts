// Store-level P0.2/P0.2A provenance tests against a MOCK pg pool that captures
// every SQL statement (including BEGIN/COMMIT/ROLLBACK and FOR UPDATE) so the
// exact transactional shape of recordPreparedLaunch and
// registerVerifiedLaunchAtomic is pinned: fail-closed immutable v2 inserts,
// PREPARED_CONFLICT on divergence, in-transaction exact-fact comparison, safe
// lab_launches conflict handling, and the single atomic insert+consume that
// can never consume on a failed insert.

import { afterEach, describe, expect, it, vi } from "vitest";
import { keccak256, type Hex } from "viem";

const TOKEN = "0x4000000000000000000000000000000000000004";
const WALLET = "0x1000000000000000000000000000000000000001";
const GOOGL = "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3";
const TARGET = "0x5000000000000000000000000000000000000005";
const POOL_OR_HOOK = "0x1111111111111111111111111111111111111111";
const CALLDATA = "0xdeadbeef" as Hex;
const MANIFEST_HASH = `0x${"ab".repeat(32)}`;
const LAUNCH_TX = `0x${"11".repeat(32)}`;

interface Captured {
  sql: string;
  values: unknown[] | undefined;
}

type QueryHandler = (sql: string, values?: unknown[]) => { rows: Record<string, unknown>[] };

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.resetModules();
});

/**
 * Load the REAL store with a mocked `pg`: pool.query and the connected
 * client's query are routed through per-test handlers; every statement is
 * captured (normalized whitespace) for SQL-shape assertions.
 */
async function loadStore(opts: { poolHandler?: QueryHandler; clientHandler?: QueryHandler }) {
  const poolCalls: Captured[] = [];
  const clientCalls: Captured[] = [];
  const released = { count: 0 };
  const norm = (text: string) => text.replace(/\s+/g, " ").trim();
  vi.doMock("pg", () => ({
    default: {},
    Pool: class {
      async query(text: string, values?: unknown[]) {
        const sql = norm(text);
        poolCalls.push({ sql, values });
        return opts.poolHandler ? opts.poolHandler(sql, values) : { rows: [] };
      }
      async connect() {
        return {
          query: async (text: string, values?: unknown[]) => {
            const sql = norm(text);
            clientCalls.push({ sql, values });
            return opts.clientHandler ? opts.clientHandler(sql, values) : { rows: [] };
          },
          release: () => {
            released.count += 1;
          },
        };
      }
    },
  }));
  vi.doMock("server-only", () => ({}));
  process.env.DATABASE_URL = "postgresql://u:p@h:5432/db";
  const store = await import("./store");
  return { store, poolCalls, clientCalls, released };
}

function prepareArgs(overrides: Record<string, unknown> = {}) {
  return {
    predictedToken: TOKEN,
    creator: WALLET,
    manifestHash: MANIFEST_HASH,
    anchorSymbol: "GOOGL",
    numeraire: GOOGL,
    chainId: 4663,
    transactionTarget: TARGET,
    transactionData: CALLDATA,
    transactionValue: "0",
    launchManifest: { anchorAddress: GOOGL, startingFdvUsdFixed: "20500" },
    ...overrides,
  } as Parameters<Awaited<ReturnType<typeof loadStore>>["store"]["recordPreparedLaunch"]>[0];
}

function verifiedRec(overrides: Record<string, unknown> = {}) {
  return {
    tokenAddress: TOKEN,
    creator: WALLET,
    numeraire: GOOGL,
    anchorSymbol: "GOOGL",
    poolOrHook: POOL_OR_HOOK,
    launchTx: LAUNCH_TX,
    blockNumber: "123",
    timestamp: 2_000,
    manifestHash: MANIFEST_HASH,
    tokenName: "Print Token",
    tokenSymbol: "PRINT",
    ...overrides,
  } as Parameters<Awaited<ReturnType<typeof loadStore>>["store"]["registerVerifiedLaunchAtomic"]>[0];
}

function expectedFacts(overrides: Record<string, unknown> = {}) {
  return {
    creator: WALLET,
    transactionTarget: TARGET,
    calldataHash: keccak256(CALLDATA),
    transactionValue: "0",
    chainId: 4663,
    eventNumeraire: GOOGL,
    blockTimestamp: 2_000,
    ...overrides,
  } as Parameters<
    Awaited<ReturnType<typeof loadStore>>["store"]["registerVerifiedLaunchAtomic"]
  >[1];
}

/** The full v2 prepared row as the atomic SELECT FOR UPDATE returns it. */
const fullRow = (overrides: Record<string, unknown> = {}) => ({
  creator: WALLET.toLowerCase(),
  manifest_hash: MANIFEST_HASH,
  provenance_version: 2,
  chain_id: 4663,
  transaction_target: TARGET.toLowerCase(),
  calldata_hash: keccak256(CALLDATA),
  transaction_value: "0",
  launch_manifest: { anchorAddress: GOOGL, startingFdvUsdFixed: "20500" },
  created_epoch: "1000",
  valid_until_epoch: "5000",
  consumed_at: null,
  consumed_by_tx: null,
  ...overrides,
});

/** Conflict-row for the recordPreparedLaunch conflict SELECT. */
const conflictRow = (overrides: Record<string, unknown> = {}) => ({
  creator: WALLET.toLowerCase(),
  manifest_hash: MANIFEST_HASH,
  transaction_target: TARGET.toLowerCase(),
  calldata_hash: keccak256(CALLDATA),
  transaction_value: "0",
  chain_id: 4663,
  consumed_at: null,
  launch_manifest: { anchorAddress: GOOGL, startingFdvUsdFixed: "20500" },
  ...overrides,
});

describe("recordPreparedLaunch — fail-closed immutable v2 insert", () => {
  it("inserts a v2 row with a SERVER-computed calldata hash and never uses DO UPDATE", async () => {
    const { store, poolCalls } = await loadStore({
      poolHandler: (sql) =>
        /INSERT INTO lab_prepared/i.test(sql)
          ? { rows: [{ predicted_token: TOKEN.toLowerCase() }] }
          : { rows: [] },
    });
    const result = await store.recordPreparedLaunch(prepareArgs());
    expect(result).toEqual({ status: "inserted" });
    const insert = poolCalls.find((c) => /INSERT INTO lab_prepared/i.test(c.sql));
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain("ON CONFLICT (predicted_token) DO NOTHING");
    expect(insert!.sql).not.toMatch(/DO UPDATE/i);
    expect(insert!.sql).toContain("provenance_version");
    expect(insert!.sql).toMatch(/valid_until/);
    expect(insert!.sql).toContain("interval '60 minutes'");
    // calldata_hash is keccak256(data), computed server-side.
    expect(insert!.values).toContain(keccak256(CALLDATA));
    expect(insert!.values).toContain(CALLDATA);
    expect(insert!.values).toContain(4663);
  });

  it("FAIL-CLOSED: an insert/query error throws REGISTRY_UNAVAILABLE (never suppressed)", async () => {
    const { store } = await loadStore({
      poolHandler: (sql) => {
        if (/INSERT INTO lab_prepared/i.test(sql)) throw new Error("connection reset");
        return { rows: [] };
      },
    });
    await expect(store.recordPreparedLaunch(prepareArgs())).rejects.toThrow(
      "REGISTRY_UNAVAILABLE",
    );
  });

  it("FAIL-CLOSED: a conflict whose row cannot be read back throws REGISTRY_UNAVAILABLE", async () => {
    const { store } = await loadStore({
      poolHandler: (sql) => {
        if (/INSERT INTO lab_prepared/i.test(sql)) return { rows: [] }; // conflict
        if (/SELECT creator, manifest_hash/i.test(sql)) return { rows: [] }; // vanished
        return { rows: [] };
      },
    });
    await expect(store.recordPreparedLaunch(prepareArgs())).rejects.toThrow(
      "REGISTRY_UNAVAILABLE",
    );
  });

  it("(8) a conflicting prepare (same token, different calldata hash) throws PREPARED_CONFLICT and leaves the row unchanged", async () => {
    const { store, poolCalls } = await loadStore({
      poolHandler: (sql) => {
        if (/INSERT INTO lab_prepared/i.test(sql)) return { rows: [] }; // conflict
        if (/SELECT creator, manifest_hash/i.test(sql)) {
          return { rows: [conflictRow({ calldata_hash: keccak256("0x9999" as Hex) })] };
        }
        return { rows: [] };
      },
    });
    await expect(store.recordPreparedLaunch(prepareArgs())).rejects.toThrow("PREPARED_CONFLICT");
    // The existing row was NEVER updated.
    expect(poolCalls.some((c) => /UPDATE lab_prepared/i.test(c.sql))).toBe(false);
  });

  it("(9) an identical prepare (parallel duplicate / retry / reload) returns the STORED manifest and only refreshes valid_until", async () => {
    const { store, poolCalls } = await loadStore({
      poolHandler: (sql) => {
        if (/INSERT INTO lab_prepared/i.test(sql)) return { rows: [] }; // conflict
        if (/SELECT creator, manifest_hash/i.test(sql)) return { rows: [conflictRow()] };
        return { rows: [] };
      },
    });
    const result = await store.recordPreparedLaunch(prepareArgs());
    expect(result.status).toBe("existing");
    if (result.status === "existing") {
      // The SAME immutable manifest identity — original createdAt preserved.
      expect(result.storedManifestHash).toBe(MANIFEST_HASH);
      expect(result.storedManifest).toEqual({ anchorAddress: GOOGL, startingFdvUsdFixed: "20500" });
    }
    const updates = poolCalls.filter((c) => /UPDATE lab_prepared/i.test(c.sql));
    expect(updates).toHaveLength(1);
    // The refresh touches ONLY the validity window — no provenance overwrite.
    expect(updates[0]!.sql).toMatch(/SET valid_until = now\(\) \+ interval '60 minutes'/);
    expect(updates[0]!.sql).not.toMatch(/manifest_hash|calldata_hash|creator|launch_manifest/);
    expect(updates[0]!.sql).toContain("consumed_at IS NULL");
  });

  it("a consumed identical preparation can never be reused (PREPARED_CONFLICT)", async () => {
    const { store } = await loadStore({
      poolHandler: (sql) => {
        if (/INSERT INTO lab_prepared/i.test(sql)) return { rows: [] };
        if (/SELECT creator, manifest_hash/i.test(sql)) {
          return { rows: [conflictRow({ consumed_at: "2026-07-29T00:00:00Z" })] };
        }
        return { rows: [] };
      },
    });
    await expect(store.recordPreparedLaunch(prepareArgs())).rejects.toThrow("PREPARED_CONFLICT");
  });
});

describe("registerVerifiedLaunchAtomic — one transaction, both effects or neither", () => {
  it("commits insert + consumption atomically with the launch tx recorded", async () => {
    const { store, clientCalls, released } = await loadStore({
      clientHandler: (sql) => {
        if (/FROM lab_prepared/i.test(sql)) return { rows: [fullRow()] };
        if (/INSERT INTO lab_launches/i.test(sql))
          return { rows: [{ token_address: TOKEN.toLowerCase() }] };
        return { rows: [] };
      },
    });
    const result = await store.registerVerifiedLaunchAtomic(
      verifiedRec(),
      expectedFacts(),
      LAUNCH_TX,
    );
    expect(result).toEqual({ status: "registered" });
    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls[0]).toBe("BEGIN");
    // (3) ALL v2 fields are selected under the lock.
    expect(sqls[1]).toMatch(/SELECT creator, manifest_hash, provenance_version, chain_id/);
    expect(sqls[1]).toMatch(/transaction_target, calldata_hash, transaction_value, launch_manifest/);
    expect(sqls[1]).toMatch(/consumed_at, consumed_by_tx/);
    expect(sqls[1]).toMatch(/FROM lab_prepared WHERE predicted_token = \$1 FOR UPDATE/);
    // (4) The insert never blind-promotes: DO NOTHING, not DO UPDATE.
    const insert = sqls.find((s) => /INSERT INTO lab_launches/i.test(s))!;
    expect(insert).toContain("ON CONFLICT (token_address) DO NOTHING");
    expect(insert).not.toMatch(/DO UPDATE/i);
    const consume = clientCalls.find((c) =>
      /UPDATE lab_prepared SET consumed_at = now\(\), consumed_by_tx = \$2/.test(c.sql),
    );
    expect(consume).toBeDefined();
    expect(consume!.values).toEqual([TOKEN.toLowerCase(), LAUNCH_TX]);
    expect(sqls[sqls.length - 1]).toBe("COMMIT");
    expect(sqls).not.toContain("ROLLBACK");
    expect(released.count).toBe(1);
    // The inserted launch facts are built from the manifest read UNDER THE
    // LOCK (locked-row values), not from anything the caller passed in.
    const insertCall = clientCalls.find((c) => /INSERT INTO lab_launches/i.test(c.sql))!;
    const factsJson = String(insertCall.values![insertCall.values!.length - 1]);
    expect(factsJson).toContain('"source":"registration"');
    expect(factsJson).toContain('"startingFdvUsd":"20500"');
  });

  it("(3) an in-transaction fact mismatch (target differs) ROLLS BACK with PROVENANCE_MISMATCH", async () => {
    const { store, clientCalls } = await loadStore({
      clientHandler: (sql) => {
        if (/FROM lab_prepared/i.test(sql)) {
          return { rows: [fullRow({ transaction_target: "0x9999999999999999999999999999999999999999" })] };
        }
        return { rows: [] };
      },
    });
    const result = await store.registerVerifiedLaunchAtomic(
      verifiedRec(),
      expectedFacts(),
      LAUNCH_TX,
    );
    expect(result).toEqual({ status: "failed", code: "PROVENANCE_MISMATCH" });
    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls).toContain("ROLLBACK");
    expect(sqls.some((s) => /INSERT INTO lab_launches/i.test(s))).toBe(false);
    expect(sqls.some((s) => /SET consumed_at/i.test(s))).toBe(false);
  });

  it("(3) a stored-manifest anchor differing from the Create event numeraire ROLLS BACK", async () => {
    const { store } = await loadStore({
      clientHandler: (sql) => {
        if (/FROM lab_prepared/i.test(sql)) {
          return {
            rows: [
              fullRow({
                launch_manifest: {
                  anchorAddress: "0x9999999999999999999999999999999999999999",
                },
              }),
            ],
          };
        }
        return { rows: [] };
      },
    });
    const result = await store.registerVerifiedLaunchAtomic(
      verifiedRec(),
      expectedFacts(),
      LAUNCH_TX,
    );
    expect(result).toEqual({ status: "failed", code: "PROVENANCE_MISMATCH" });
  });

  it("(4) a conflicting existing lab_launches row (different launch_tx) ROLLS BACK — provenance_verified is never promoted", async () => {
    const { store, clientCalls } = await loadStore({
      clientHandler: (sql) => {
        if (/FROM lab_prepared/i.test(sql)) return { rows: [fullRow()] };
        if (/INSERT INTO lab_launches/i.test(sql)) return { rows: [] }; // conflict
        if (/FROM lab_launches WHERE token_address = \$1 FOR UPDATE/i.test(sql)) {
          return {
            rows: [
              {
                creator: WALLET.toLowerCase(),
                numeraire: GOOGL,
                pool_or_hook: POOL_OR_HOOK,
                launch_tx: `0x${"ff".repeat(32)}`, // DIFFERENT transaction
                provenance_verified: false,
              },
            ],
          };
        }
        return { rows: [] };
      },
    });
    const result = await store.registerVerifiedLaunchAtomic(
      verifiedRec(),
      expectedFacts(),
      LAUNCH_TX,
    );
    expect(result).toEqual({ status: "failed", code: "LAUNCH_ROW_CONFLICT" });
    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls).toContain("ROLLBACK");
    expect(sqls.some((s) => /SET provenance_verified = true/i.test(s))).toBe(false);
    expect(sqls.some((s) => /SET consumed_at/i.test(s))).toBe(false);
  });

  it("(4) an existing row with EXACTLY matching facts is adopted (promoted) and consumption proceeds", async () => {
    const { store, clientCalls } = await loadStore({
      clientHandler: (sql) => {
        if (/FROM lab_prepared/i.test(sql)) return { rows: [fullRow()] };
        if (/INSERT INTO lab_launches/i.test(sql)) return { rows: [] }; // conflict
        if (/FROM lab_launches WHERE token_address = \$1 FOR UPDATE/i.test(sql)) {
          return {
            rows: [
              {
                creator: WALLET.toLowerCase(),
                numeraire: GOOGL,
                pool_or_hook: POOL_OR_HOOK,
                launch_tx: LAUNCH_TX,
                provenance_verified: false,
              },
            ],
          };
        }
        return { rows: [] };
      },
    });
    const result = await store.registerVerifiedLaunchAtomic(
      verifiedRec(),
      expectedFacts(),
      LAUNCH_TX,
    );
    expect(result).toEqual({ status: "registered" });
    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls.some((s) => /SET provenance_verified = true/i.test(s))).toBe(true);
    expect(sqls.some((s) => /SET consumed_at/i.test(s))).toBe(true);
    expect(sqls[sqls.length - 1]).toBe("COMMIT");
  });

  it("(11) a failed lab_launches insert ROLLS BACK and never consumes the preparation", async () => {
    const { store, clientCalls, released } = await loadStore({
      clientHandler: (sql) => {
        if (/FROM lab_prepared/i.test(sql)) return { rows: [fullRow()] };
        if (/INSERT INTO lab_launches/i.test(sql)) throw new Error("disk full");
        return { rows: [] };
      },
    });
    const result = await store.registerVerifiedLaunchAtomic(
      verifiedRec(),
      expectedFacts(),
      LAUNCH_TX,
    );
    expect(result).toEqual({ status: "failed", code: "REGISTRATION_FAILED" });
    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls).toContain("ROLLBACK");
    expect(sqls).not.toContain("COMMIT");
    // The preparation was NOT consumed — the UPDATE never ran.
    expect(sqls.some((s) => /SET consumed_at/i.test(s))).toBe(false);
    expect(released.count).toBe(1);
  });

  it("(12) a concurrent second caller finds the consumed row and gets idempotent success without a second insert", async () => {
    const { store, clientCalls } = await loadStore({
      clientHandler: (sql) => {
        if (/FROM lab_prepared/i.test(sql)) {
          return { rows: [fullRow({ consumed_at: "2026-07-29T00:00:00Z" })] };
        }
        if (/FROM lab_launches WHERE token_address/i.test(sql)) return { rows: [{ "?column?": 1 }] };
        return { rows: [] };
      },
    });
    const result = await store.registerVerifiedLaunchAtomic(
      verifiedRec(),
      expectedFacts(),
      LAUNCH_TX,
    );
    expect(result).toEqual({ status: "already-registered" });
    const sqls = clientCalls.map((c) => c.sql);
    // No second insert, no second consumption, nothing committed.
    expect(sqls.some((s) => /INSERT INTO lab_launches/i.test(s))).toBe(false);
    expect(sqls.some((s) => /SET consumed_at/i.test(s))).toBe(false);
    expect(sqls).not.toContain("COMMIT");
  });

  it("a consumed row WITHOUT a verified launch fails PREPARED_CONSUMED (no silent success)", async () => {
    const { store } = await loadStore({
      clientHandler: (sql) => {
        if (/FROM lab_prepared/i.test(sql)) {
          return { rows: [fullRow({ consumed_at: "2026-07-29T00:00:00Z" })] };
        }
        return { rows: [] }; // token not provenance-verified
      },
    });
    const result = await store.registerVerifiedLaunchAtomic(
      verifiedRec(),
      expectedFacts(),
      LAUNCH_TX,
    );
    expect(result).toEqual({ status: "failed", code: "PREPARED_CONSUMED" });
  });

  it("rejects a legacy row (provenance_version NULL) inside the transaction", async () => {
    const { store, clientCalls } = await loadStore({
      clientHandler: (sql) => {
        if (/FROM lab_prepared/i.test(sql))
          return { rows: [fullRow({ provenance_version: null })] };
        return { rows: [] };
      },
    });
    const result = await store.registerVerifiedLaunchAtomic(
      verifiedRec(),
      expectedFacts(),
      LAUNCH_TX,
    );
    expect(result).toEqual({ status: "failed", code: "UNVERIFIED_PROVENANCE" });
    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls.some((s) => /INSERT INTO lab_launches/i.test(s))).toBe(false);
    expect(sqls).toContain("ROLLBACK");
  });

  it("rejects a block timestamp outside the validity window inside the transaction", async () => {
    const { store } = await loadStore({
      clientHandler: (sql) => {
        if (/FROM lab_prepared/i.test(sql)) return { rows: [fullRow()] };
        return { rows: [] };
      },
    });
    const late = await store.registerVerifiedLaunchAtomic(
      verifiedRec(),
      expectedFacts({ blockTimestamp: 9_999 }),
      LAUNCH_TX,
    );
    expect(late).toEqual({ status: "failed", code: "PREPARED_EXPIRED" });
  });

  it("reports a missing preparation as PREPARED_NOT_FOUND", async () => {
    const { store } = await loadStore({
      clientHandler: () => ({ rows: [] }),
    });
    const result = await store.registerVerifiedLaunchAtomic(
      verifiedRec(),
      expectedFacts(),
      LAUNCH_TX,
    );
    expect(result).toEqual({ status: "failed", code: "PREPARED_NOT_FOUND" });
  });
});
