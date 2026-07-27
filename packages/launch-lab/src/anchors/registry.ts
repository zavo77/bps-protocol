// Approved-anchor registry. These are the ONLY Stock Tokens a market may be
// paired with. Every entry was resolved from the official Robinhood /assets API,
// verified on-chain (ERC-20 reads) for chain 4663, and proven to pass an exact
// rehype multicurve launch simulation (docs/launch-lab/ANCHOR_VERIFICATION.json,
// 2026-07-27). Arbitrary user-supplied addresses are never accepted — selection
// is by symbol against this list, and the resolved address is re-verified
// fail-closed at runtime.

import { getAddress, type Address } from "viem";

export interface AnchorRecord {
  symbol: string;
  name: string;
  logo: string | null;
  address: Address;
  decimals: number;
  currentMultiplier: string;
  status: string;
  chainId: 4663;
  verifiedAt: string;
}

export const APPROVED_ANCHORS: readonly AnchorRecord[] = [
  {
    symbol: "GOOGL",
    name: "Alphabet Class A • Robinhood Token",
    logo: "https://cdn.robinhood.com/ncw_assets/logos/0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3.png",
    address: getAddress("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3"),
    decimals: 18,
    currentMultiplier: "1.000000000000000000",
    status: "ASSET_STATUS_ACTIVE",
    chainId: 4663,
    verifiedAt: "2026-07-27",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA • Robinhood Token",
    logo: "https://cdn.robinhood.com/ncw_assets/logos/0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec.png",
    address: getAddress("0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC"),
    decimals: 18,
    currentMultiplier: "1.000000000000000000",
    status: "ASSET_STATUS_ACTIVE",
    chainId: 4663,
    verifiedAt: "2026-07-27",
  },
  {
    symbol: "AAPL",
    name: "Apple • Robinhood Token",
    logo: "https://cdn.robinhood.com/ncw_assets/logos/0xaf3d76f1834a1d425780943c99ea8a608f8a93f9.png",
    address: getAddress("0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9"),
    decimals: 18,
    currentMultiplier: "1.000000000000000000",
    status: "ASSET_STATUS_ACTIVE",
    chainId: 4663,
    verifiedAt: "2026-07-27",
  },
  {
    symbol: "TSLA",
    name: "Tesla • Robinhood Token",
    logo: "https://cdn.robinhood.com/ncw_assets/logos/0x322f0929c4625ed5bad873c95208d54e1c003b2d.png",
    address: getAddress("0x322F0929c4625eD5bAd873c95208D54E1c003b2d"),
    decimals: 18,
    currentMultiplier: "1.000000000000000000",
    status: "ASSET_STATUS_ACTIVE",
    chainId: 4663,
    verifiedAt: "2026-07-27",
  },
  {
    symbol: "SPCX",
    name: "Space Exploration Technologies Corp. Class A Common Stock • Robinhood Token",
    logo: "https://cdn.robinhood.com/ncw_assets/logos/0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea.png",
    address: getAddress("0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa"),
    decimals: 18,
    currentMultiplier: "1.000000000000000000",
    status: "ASSET_STATUS_ACTIVE",
    chainId: 4663,
    verifiedAt: "2026-07-27",
  },
] as const;

/** Default anchor when a caller does not specify one (preserves prior behavior). */
export const DEFAULT_ANCHOR_SYMBOL = "GOOGL";

export function isApprovedAnchorSymbol(symbol: string): boolean {
  return APPROVED_ANCHORS.some((a) => a.symbol === symbol);
}

export function getAnchorBySymbol(symbol: string): AnchorRecord {
  const a = APPROVED_ANCHORS.find((x) => x.symbol === symbol);
  if (!a) throw new Error(`UNAPPROVED_ANCHOR: ${symbol}`);
  return a;
}

/** Reverse lookup by numeraire address (used by the indexer + trade routing). */
export function getAnchorByAddress(address: string): AnchorRecord | null {
  const lower = address.toLowerCase();
  return APPROVED_ANCHORS.find((a) => a.address.toLowerCase() === lower) ?? null;
}

export function approvedAnchorAddresses(): Address[] {
  return APPROVED_ANCHORS.map((a) => a.address);
}
