import { describe, expect, it } from "vitest";
import { hashManifest, type LaunchManifest } from "@bps/launch-lab";
import { extractLaunchFacts } from "./launch-facts";

// A minimal manifest carrying the per-launch values the facts record retains.
const manifest = {
  platform: "BPS Launch Lab",
  creatorFeeAddress: "0xAA61254627B7392B0bC922097b10eB0587db2Be7",
  tokenUri: "ipfs://QmbbgZydTF7ySXtEpDszpu9riL8RiSXZQ5yXWRBvkCdSBE",
  anchorSymbol: "GOOGL",
  initialSupply: "1000000000000000000000000000",
  saleInventory: "1000000000000000000000000000",
  startingFdvUsdFixed: "20500",
  feePreset: "BALANCED_1",
  exactPoolFeeUnits: 10000,
  beneficiaries: [
    { beneficiary: "0xaa61254627b7392b0bc922097b10eb0587db2be7", sharesWad: "850000000000000000", label: "Creator fees", percent: "85" },
  ],
} as unknown as LaunchManifest;

const issuedHash = hashManifest(manifest);

describe("extractLaunchFacts — hash-gated immutable launch facts", () => {
  it("extracts per-launch facts when the canonical hash matches the issued manifest", () => {
    const facts = extractLaunchFacts(manifest, issuedHash);
    expect(facts).not.toBeNull();
    expect(facts!.source).toBe("registration");
    expect(facts!.manifestHash).toBe(issuedHash);
    expect(facts!.startingFdvUsd).toBe("20500");
    expect(facts!.feePreset).toBe("BALANCED_1");
    expect(facts!.exactPoolFeeUnits).toBe(10000);
    expect(facts!.creatorFeeAddress).toBe("0xaa61254627b7392b0bc922097b10eb0587db2be7");
    expect(facts!.tokenUri).toBe("ipfs://QmbbgZydTF7ySXtEpDszpu9riL8RiSXZQ5yXWRBvkCdSBE");
    expect(facts!.initialSupplyWei).toBe("1000000000000000000000000000");
    expect(facts!.saleInventoryWei).toBe("1000000000000000000000000000");
  });

  it("rejects a tampered manifest (hash mismatch) — facts stay unavailable", () => {
    const tampered = { ...(manifest as unknown as Record<string, unknown>), startingFdvUsdFixed: "999999" };
    expect(extractLaunchFacts(tampered, issuedHash)).toBeNull();
  });

  it("rejects a manifest bound to a different issued hash", () => {
    expect(extractLaunchFacts(manifest, `0x${"ab".repeat(32)}`)).toBeNull();
  });

  it("rejects garbage bodies without throwing", () => {
    expect(extractLaunchFacts(null, issuedHash)).toBeNull();
    expect(extractLaunchFacts("manifest", issuedHash)).toBeNull();
    expect(extractLaunchFacts(42, issuedHash)).toBeNull();
    expect(extractLaunchFacts({ creatorFeeAddress: null }, issuedHash)).toBeNull();
  });
});
