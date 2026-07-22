import { describe, expect, it } from "vitest";
import { ProofOfDistributionError } from "./errors.js";
import { loadCycleFixture } from "./validate.js";
import { A, E0, baseRawFixture } from "./testkit.js";

describe("fixture validation and normalization (strict rejection)", () => {
  it("accepts the base fixture", () => {
    expect(() => loadCycleFixture(baseRawFixture())).not.toThrow();
  });

  it("rejects a malformed address", () => {
    const raw = baseRawFixture();
    raw.eligibility[0]!["wallet"] = "0x1234"; // too short
    expect(() => loadCycleFixture(raw)).toThrow();
  });

  it("rejects a negative amount", () => {
    const raw = baseRawFixture();
    raw.epochStartBalances[0]!["rawBalance"] = "-5";
    expect(() => loadCycleFixture(raw)).toThrow();
  });

  it("rejects a non-integer / unsafe numeric string", () => {
    const raw = baseRawFixture();
    raw.epochStartBalances[0]!["rawBalance"] = "1e30";
    expect(() => loadCycleFixture(raw)).toThrow();
  });

  it("rejects a numeric value supplied as a JSON number instead of a string", () => {
    const raw = baseRawFixture();
    (raw.epochStartBalances[0] as Record<string, unknown>)["rawBalance"] = 100;
    expect(() => loadCycleFixture(raw)).toThrow();
  });

  it("rejects unknown fields under strict schemas", () => {
    const raw = baseRawFixture();
    (raw.cycle as Record<string, unknown>)["surpriseField"] = "x";
    expect(() => loadCycleFixture(raw)).toThrow();
  });

  it("rejects a missing required field", () => {
    const raw = baseRawFixture();
    delete (raw.cycle as Record<string, unknown>)["chainId"];
    expect(() => loadCycleFixture(raw)).toThrow();
  });

  it("rejects a superseded economics version (only BPS-ECON-2.0 is valid, req 35)", () => {
    const raw = baseRawFixture();
    raw.cycle["economicsVersion"] = "BPS-ECON-1.0";
    expect(() => loadCycleFixture(raw)).toThrow();
  });

  it("rejects a snapshot block later than the finalized block", () => {
    const raw = baseRawFixture();
    raw.cycle["startBlock"] = "100";
    raw.cycle["endBlock"] = "400";
    raw.cycle["snapshotBlock"] = "300";
    raw.cycle["finalizedBlock"] = "250";
    expect(() => loadCycleFixture(raw)).toThrow(/SNAPSHOT_AFTER_FINALIZED/);
  });

  it("rejects inconsistent epoch boundaries", () => {
    const raw = baseRawFixture();
    raw.cycle["epochEnd"] = String(E0 + 800); // not exactly +900
    expect(() => loadCycleFixture(raw)).toThrow(/EPOCH_BOUNDARY/);
  });

  it("rejects an unsupported lock tier (req 16)", () => {
    const raw = baseRawFixture();
    raw.locks.push({
      wallet: A.w1,
      rawPrincipal: "10",
      tier: "LOCK_99D",
      startTimestamp: String(E0),
      unlockTimestamp: String(E0 + 900),
    });
    expect(() => loadCycleFixture(raw)).toThrow();
  });

  it("rejects a lock whose duration does not match its tier (req 16)", () => {
    const raw = baseRawFixture();
    raw.locks.push({
      wallet: A.w1,
      rawPrincipal: "10",
      tier: "LOCK_7D",
      startTimestamp: String(E0),
      unlockTimestamp: String(E0 + 900), // 900s != 7 days
    });
    expect(() => loadCycleFixture(raw)).toThrow(/UNSUPPORTED_DURATION/);
  });

  it("rejects a duplicate normalized holder row, including mixed case (req 10)", () => {
    const raw = baseRawFixture();
    raw.eligibility.push({
      wallet: A.w1.toUpperCase().replace("0X", "0x"), // same wallet, different casing
      eligible: true,
      policyVersion: "elig-1",
      validFrom: "1799990000",
      revoked: false,
    });
    expect(() => loadCycleFixture(raw)).toThrow(/DUPLICATE_HOLDER/);
  });

  it("rejects duplicate exclusion and asset identifiers", () => {
    const dupExcl = baseRawFixture();
    dupExcl.excludedAddresses.push(
      { address: A.excluded, category: "BRIDGE", reason: "a", policyVersion: "excl-1" },
      { address: A.excluded, category: "BRIDGE", reason: "b", policyVersion: "excl-1" },
    );
    expect(() => loadCycleFixture(dupExcl)).toThrow(/DUPLICATE_EXCLUSION/);

    const dupAsset = baseRawFixture();
    dupAsset.assets.push({
      ticker: "DUP",
      name: "Dup",
      tokenAddress: A.asset18, // same as the base asset
      decimals: 18,
      acquiredRawAmount: "1",
    });
    expect(() => loadCycleFixture(dupAsset)).toThrow(/DUPLICATE_ASSET/);
  });

  it("throws ProofOfDistributionError for cross-field violations", () => {
    const raw = baseRawFixture();
    raw.cycle["claimStart"] = "2000000000";
    raw.cycle["claimDeadline"] = "1000000000";
    expect(() => loadCycleFixture(raw)).toThrow(ProofOfDistributionError);
  });
});
