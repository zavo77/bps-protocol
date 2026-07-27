import { afterEach, describe, expect, it } from "vitest";
import { getAddress } from "viem";
import {
  MissingEnvError,
  requireEnv,
  readServerFlags,
  getFeePreset,
  FEE_PRESETS,
} from "./config/index";
import { prepareLaunchSchema, signedRequestSchema } from "./validation/index";
import { canonicalize, hashManifest, hashDescription } from "./manifest/index";
import {
  validateMetadataInput,
  isBroadcastableTokenUri,
  localPreviewMetadata,
  type MetadataInput,
} from "./metadata/index";
import { buildBeneficiaries, buildLaunchParams } from "./doppler/index";
import { WAD } from "./types/index";

const A = getAddress("0x29244A2309B703F82E292A3db7df0e95d0cdca72");
const B = getAddress("0x261Cda9dADdfDC9A0b8de887718af516FA7ee9C2");
const C = getAddress("0xF7F2d76F6364c72ea860512d78ae07e54bBbF8A5");
const GOOGL = getAddress("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3");
const HOOK = getAddress("0x9982538F41f2ae29ddb9d3D9307010052984FDbB");

const PNG = (() => {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47]);
  return b;
})();

function validMeta(): MetadataInput {
  return {
    tokenName: "PRINT",
    tokenSymbol: "PRINT",
    tokenDescription: "A test description.",
    imageBytes: PNG,
    imageMime: "image/png",
    imageFilename: "print-token.png",
  };
}

describe("config", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("requireEnv throws listing every missing name", () => {
    delete process.env.__LAB_TEST_A;
    delete process.env.__LAB_TEST_B;
    try {
      requireEnv(["__LAB_TEST_A", "__LAB_TEST_B"] as const);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MissingEnvError);
      expect((e as MissingEnvError).names).toEqual(["__LAB_TEST_A", "__LAB_TEST_B"]);
    }
  });

  it("flags fail closed when env is absent", () => {
    delete process.env.BPS_LAUNCH_LAB_ENABLED;
    delete process.env.BPS_LAUNCH_LAB_BROADCAST_ENABLED;
    delete process.env.BPS_LAUNCH_LAB_KILL_SWITCH;
    const flags = readServerFlags();
    expect(flags.enabled).toBe(false);
    expect(flags.broadcastEnabled).toBe(false);
    expect(flags.killSwitchActive).toBe(true);
    expect(flags.creatorAllowlist).toEqual([]);
    expect(flags.bpsFeeAddress).toBeNull();
  });

  it("guardrail knobs fall back to defaults when env is missing or empty", () => {
    delete process.env.BPS_LAUNCH_LAB_LAUNCH_COOLDOWN_SECONDS;
    process.env.BPS_LAUNCH_LAB_MAX_LAUNCHES_PER_WALLET = "";
    const flags = readServerFlags();
    expect(flags.launchCooldownSeconds).toBe(3600);
    expect(flags.maxLaunchesPerWallet).toBe(2);
    process.env.BPS_LAUNCH_LAB_LAUNCH_COOLDOWN_SECONDS = "0";
    expect(readServerFlags().launchCooldownSeconds).toBe(0);
  });

  it('kill switch deactivates only on explicit "false"', () => {
    process.env.BPS_LAUNCH_LAB_KILL_SWITCH = "off";
    expect(readServerFlags().killSwitchActive).toBe(true);
    process.env.BPS_LAUNCH_LAB_KILL_SWITCH = "false";
    expect(readServerFlags().killSwitchActive).toBe(false);
  });

  it("DYNAMIC_PROTECTION is disabled with a reason", () => {
    const p = getFeePreset("DYNAMIC_PROTECTION");
    expect(p.enabled).toBe(false);
    expect(p.disabledReason).toMatch(/4663/);
    expect(FEE_PRESETS.filter((x) => x.enabled).map((x) => x.id)).toEqual([
      "BALANCED_1",
      "CREATOR_2",
      "DEGEN_3",
    ]);
  });

  it("BALANCED_1 converts to exactly 10000 fee units", () => {
    expect(getFeePreset("BALANCED_1").poolFeeUnits).toBe(10_000);
    expect(getFeePreset("CREATOR_2").poolFeeUnits).toBe(20_000);
    expect(getFeePreset("DEGEN_3").poolFeeUnits).toBe(30_000);
  });
});

describe("validation", () => {
  const payload = {
    tokenName: "PRINT",
    tokenSymbol: "PRINT",
    tokenDescription: "desc",
    tokenUri: "ipfs://bafyexamplecid",
    imageCid: "bafyimagecid1234",
    metadataCid: "bafymetacid1234",
    metadataProvider: "pinata",
    startingFdvUsd: 20500,
    feePreset: "BALANCED_1",
    creatorAddress: A,
    creatorFeeAddress: B,
    termsAccepted: true,
  };

  it("accepts the Genesis payload", () => {
    expect(prepareLaunchSchema.parse(payload).tokenSymbol).toBe("PRINT");
  });

  it.each([
    ["lowercase ticker", { tokenSymbol: "print" }],
    ["long ticker", { tokenSymbol: "AAAAAAAAAAAAA" }],
    ["bad address", { creatorAddress: "0x123" }],
    ["non-ipfs uri", { tokenUri: "https://example.com/x.json" }],
    ["local provider", { metadataProvider: "local-preview" }],
    ["tiny fdv", { startingFdvUsd: 10 }],
    ["terms not accepted", { termsAccepted: false }],
  ])("rejects %s", (_label, patch) => {
    expect(() => prepareLaunchSchema.parse({ ...payload, ...patch })).toThrow();
  });

  it("signed envelope requires chain 4663 and hex hash", () => {
    const msg = {
      message: {
        action: "prepare-launch",
        wallet: A,
        chainId: 4663,
        payloadHash: `0x${"a".repeat(64)}`,
        issuedAt: 1,
        expiresAt: 2,
        host: "example.com",
      },
      signature: "0xdeadbeef",
    };
    expect(signedRequestSchema.parse(msg).message.chainId).toBe(4663);
    expect(() =>
      signedRequestSchema.parse({ ...msg, message: { ...msg.message, chainId: 1 } }),
    ).toThrow();
  });
});

describe("manifest hashing", () => {
  it("canonicalize sorts keys deterministically", () => {
    expect(canonicalize({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });
  it("hashDescription is stable", () => {
    expect(hashDescription("x")).toBe(hashDescription("x"));
    expect(hashDescription("x")).not.toBe(hashDescription("y"));
  });
  it("hashManifest changes when any field changes", () => {
    const m = { platform: "BPS Launch Lab", chainId: 4663, tokenName: "PRINT" } as never;
    const m2 = { platform: "BPS Launch Lab", chainId: 4663, tokenName: "PRINT2" } as never;
    expect(hashManifest(m)).not.toBe(hashManifest(m2));
  });
});

describe("metadata validation", () => {
  it("accepts a valid PNG", () => {
    expect(validateMetadataInput(validMeta())).toEqual([]);
  });
  it.each([
    ["bad magic", (m: MetadataInput) => ({ ...m, imageBytes: new Uint8Array([1, 2, 3, 4]) })],
    ["oversize", (m: MetadataInput) => ({ ...m, imageBytes: new Uint8Array(5 * 1024 * 1024) })],
    ["html in name", (m: MetadataInput) => ({ ...m, tokenName: "<script>" })],
    ["bad ticker", (m: MetadataInput) => ({ ...m, tokenSymbol: "pr int" })],
    ["bad filename", (m: MetadataInput) => ({ ...m, imageFilename: "../evil.png" })],
    ["long description", (m: MetadataInput) => ({ ...m, tokenDescription: "x".repeat(601) })],
  ])("rejects %s", (_l, patch) => {
    expect(validateMetadataInput(patch(validMeta())).length).toBeGreaterThan(0);
  });
  it("local preview is never broadcastable", () => {
    const local = localPreviewMetadata(validMeta());
    expect(isBroadcastableTokenUri(local)).toBe(false);
    expect(
      isBroadcastableTokenUri({
        imageCid: "bafyimagecid1234",
        metadataCid: "bafymetacid1234",
        tokenUri: "ipfs://bafymetacid1234",
        provider: "pinata",
      }),
    ).toBe(true);
  });
});

describe("beneficiaries", () => {
  it("builds 85/10/5 summing to WAD", () => {
    const { raw, entries } = buildBeneficiaries(B, C, A);
    expect(raw.reduce((s, x) => s + x.shares, 0n)).toBe(WAD);
    expect(entries.map((e) => e.percent)).toEqual(["5%", "10%", "85%"]);
  });
  it("rejects duplicates", () => {
    expect(() => buildBeneficiaries(A, A, A)).toThrow(/unique/i);
  });
});

describe("launch params (pure build, no network)", () => {
  const base = {
    tokenName: "PRINT",
    tokenSymbol: "PRINT",
    tokenUri: "ipfs://bafyexample",
    anchorAddress: GOOGL,
    anchorMidUsd: 323.9,
    startingFdvUsd: 20500,
    feePreset: "BALANCED_1" as const,
    creatorAddress: A,
    beneficiaries: buildBeneficiaries(B, C, A).raw,
    rehypeHookAddress: HOOK,
  };

  it("builds rehype/noOp/noOp params with the 1B supply", () => {
    const params = buildLaunchParams(base);
    const p = params as unknown as {
      sale: { initialSupply: bigint; numTokensToSell: bigint; numeraire: string };
      migration: { type: string };
      governance: { type: string };
      initializer?: { type: string };
      token: { name: string; type?: string };
    };
    expect(p.sale.initialSupply).toBe(10n ** 27n);
    expect(p.sale.numTokensToSell).toBe(10n ** 27n);
    expect(p.sale.numeraire.toLowerCase()).toBe(GOOGL.toLowerCase());
    expect(p.migration.type).toBe("noOp");
    expect(p.token.name).toBe("PRINT");
  });

  it("refuses the disabled DYNAMIC_PROTECTION preset", () => {
    expect(() => buildLaunchParams({ ...base, feePreset: "DYNAMIC_PROTECTION" })).toThrow(
      /disabled/i,
    );
  });
});
