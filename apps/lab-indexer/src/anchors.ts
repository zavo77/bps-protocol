// Production-runtime approved-anchor registry for the indexer.
//
// The indexer is a plain-Node ESM service (tsc -> dist -> `node dist/main.js`).
// It must NOT import @bps/launch-lab at runtime: that package exports its
// TypeScript source (extensionless ESM imports) which plain Node cannot
// resolve. These records are a self-contained copy of the approved registry;
// a test (anchors.sync.test.ts) asserts they stay identical to
// @bps/launch-lab's APPROVED_ANCHORS so they can never drift silently.

import { getAddress, type Address } from "viem";

export interface IndexerAnchor {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
}

export const APPROVED_ANCHORS: readonly IndexerAnchor[] = [
  {
    symbol: "GOOGL",
    name: "Alphabet Class A • Robinhood Token",
    address: getAddress("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3"),
    decimals: 18,
  },
  {
    symbol: "NVDA",
    name: "NVIDIA • Robinhood Token",
    address: getAddress("0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC"),
    decimals: 18,
  },
  {
    symbol: "AAPL",
    name: "Apple • Robinhood Token",
    address: getAddress("0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9"),
    decimals: 18,
  },
  {
    symbol: "TSLA",
    name: "Tesla • Robinhood Token",
    address: getAddress("0x322F0929c4625eD5bAd873c95208D54E1c003b2d"),
    decimals: 18,
  },
  {
    symbol: "SPCX",
    name: "Space Exploration Technologies Corp. Class A Common Stock • Robinhood Token",
    address: getAddress("0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa"),
    decimals: 18,
  },
] as const;

export const APPROVED_ANCHOR_ADDRESSES: Address[] = APPROVED_ANCHORS.map((a) => a.address);

export function getAnchorByAddress(address: string): IndexerAnchor | null {
  const lower = address.toLowerCase();
  return APPROVED_ANCHORS.find((a) => a.address.toLowerCase() === lower) ?? null;
}
