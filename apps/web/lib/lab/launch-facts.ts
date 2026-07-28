// Immutable launch facts extraction for registration. The client-supplied
// manifest body is trusted ONLY when its canonical hash equals the hash of the
// manifest THIS server issued at prepare time — anything else yields null and
// the market's facts stay honestly unavailable. Historical markets must never
// change when server defaults change, so ONLY per-launch values are extracted.

import { hashManifest, type LaunchManifest } from "@bps/launch-lab";

export function extractLaunchFacts(
  manifestBody: unknown,
  issuedManifestHash: string,
): Record<string, unknown> | null {
  if (!manifestBody || typeof manifestBody !== "object") return null;
  try {
    if (hashManifest(manifestBody as LaunchManifest) !== issuedManifestHash) return null;
    const m = manifestBody as LaunchManifest;
    return {
      source: "registration",
      manifestHash: issuedManifestHash,
      startingFdvUsd: m.startingFdvUsdFixed,
      feePreset: m.feePreset,
      exactPoolFeeUnits: m.exactPoolFeeUnits,
      creatorFeeAddress: m.creatorFeeAddress.toLowerCase(),
      beneficiaries: m.beneficiaries,
      tokenUri: m.tokenUri,
      anchorSymbol: m.anchorSymbol,
      initialSupplyWei: m.initialSupply,
      saleInventoryWei: m.saleInventory,
    };
  } catch {
    return null; // malformed manifest body — facts stay unavailable
  }
}
