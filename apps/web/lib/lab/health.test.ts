import { describe, expect, it } from "vitest";
import type { LabServerFlags } from "@bps/launch-lab";
import { runHealthChecks, type HealthDeps } from "./health";

const SECRET_URL = "postgresql://user:sup3rsecret@dbhost:5432/db";
const SECRET_RPC = "https://rpc.example/very-secret-key";

const flags: LabServerFlags = {
  enabled: true,
  broadcastEnabled: false,
  killSwitchActive: true,
  accessMode: "public",
  creatorAllowlist: [],
  bpsFeeAddress: null,
  startingFdvUsd: 20500,
  defaultFeePreset: "BALANCED_1",
  maxLaunchesPerWallet: 2,
  launchCooldownSeconds: 3600,
  publicDailyLaunchCap: 25,
  metadataMaxBytes: 4 * 1024 * 1024,
  requestTtlSeconds: 300,
};

function deps(overrides?: Partial<HealthDeps>): HealthDeps {
  return {
    getChainId: async () => 4663,
    dbPing: async () => undefined,
    pinataConfigured: true,
    readFlags: () => flags,
    commit: "abc123def456",
    timeoutMs: 50,
    ...overrides,
  };
}

describe("runHealthChecks", () => {
  it("returns 200 with the safe shape when everything passes", async () => {
    const { httpStatus, body } = await runHealthChecks(deps());
    expect(httpStatus).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      service: "bps-launch-lab-web",
      chainId: 4663,
      rpc: "ok",
      database: "ok",
      pinataConfigured: true,
      accessMode: "public",
      commit: "abc123def456",
    });
    expect(new Date(body.checkedAt).getTime()).toBeGreaterThan(0);
  });

  it("kill switch active and broadcast disabled are healthy operating states", async () => {
    const { httpStatus, body } = await runHealthChecks(deps());
    expect(body.killSwitchActive).toBe(true);
    expect(body.broadcastEnabled).toBe(false);
    expect(httpStatus).toBe(200);
  });

  it("wrong RPC chain returns 503", async () => {
    const { httpStatus, body } = await runHealthChecks(deps({ getChainId: async () => 1 }));
    expect(httpStatus).toBe(503);
    expect(body.rpc).toBe("wrong-chain");
    expect(body.status).toBe("unhealthy");
  });

  it("RPC timeout returns 503 without hanging", async () => {
    const never = new Promise<number>(() => {});
    const { httpStatus, body } = await runHealthChecks(deps({ getChainId: () => never }));
    expect(httpStatus).toBe(503);
    expect(body.rpc).toBe("timeout");
  });

  it("database failure is reported safely (category only, 503)", async () => {
    const { httpStatus, body } = await runHealthChecks(
      deps({
        dbPing: async () => {
          throw new Error(`connect failed: ${SECRET_URL}`);
        },
      }),
    );
    expect(httpStatus).toBe(503);
    expect(body.database).toBe("error");
    expect(JSON.stringify(body)).not.toContain("sup3rsecret");
  });

  it("unconfigured database does not fail health", async () => {
    const { httpStatus, body } = await runHealthChecks(deps({ dbPing: undefined }));
    expect(httpStatus).toBe(200);
    expect(body.database).toBe("not-configured");
  });

  it("missing required configuration fails closed", async () => {
    const broken = deps({
      readFlags: () => {
        throw new Error(`Missing required environment variables: ${SECRET_RPC}`);
      },
      pinataConfigured: false,
    });
    const { httpStatus, body } = await runHealthChecks(broken);
    expect(httpStatus).toBe(503);
    expect(body.configOk).toBe(false);
    expect(body.accessMode).toBe("unknown");
    expect(body.killSwitchActive).toBe(true); // fail-closed default in the report
  });

  it("no secret values ever appear in the response", async () => {
    const leaky = deps({
      getChainId: async () => {
        throw new Error(`rpc failed: ${SECRET_RPC}`);
      },
      dbPing: async () => {
        throw new Error(`db failed: ${SECRET_URL}`);
      },
    });
    const { body } = await runHealthChecks(leaky);
    const json = JSON.stringify(body);
    expect(json).not.toContain("very-secret-key");
    expect(json).not.toContain("sup3rsecret");
    expect(json).not.toContain("rpc.example");
    expect(json).not.toContain("dbhost");
  });
});
