// Test-only helpers. Excluded from the build (see tsconfig.build.json). Provides a compact but
// fully valid raw cycle fixture that tests deep-clone and mutate.

const Z36 = "000000000000000000000000000000000000";

export const addr = (tag: string): string => `0x${Z36}${tag}`;
export const hash = (tag: string): string => `0x${"0".repeat(64 - tag.length)}${tag}`;

export const A = {
  w1: addr("0001"),
  w2: addr("0002"),
  w3: addr("0003"),
  bps: addr("b005"),
  claim: addr("c1a1"),
  asset18: addr("a018"),
  asset6: addr("a006"),
  asset8: addr("a008"),
  zero: `0x${Z36}0000`,
  excluded: addr("9001"),
} as const;

// Epoch 2_000_000: start 1_800_000_000, end 1_800_000_900.
export const E0 = 1_800_000_000;
export const E1 = 1_800_000_900;

export interface RawFixtureShape {
  cycle: Record<string, unknown>;
  excludedAddresses: Array<Record<string, unknown>>;
  eligibility: Array<Record<string, unknown>>;
  epochStartBalances: Array<Record<string, unknown>>;
  transfers: Array<Record<string, unknown>>;
  locks: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
}

/** A minimal, valid raw fixture: two eligible unlocked wallets, one 18-decimal asset. */
export function baseRawFixture(): RawFixtureShape {
  return structuredClone({
    cycle: {
      schemaVersion: "bps.pod.cycle/1",
      cycleId: "1",
      chainId: "10",
      bpsTokenAddress: A.bps,
      claimManagerAddress: A.claim,
      economicsVersion: "BPS-ECON-2.0",
      rewardPolicyVersion: "vebps-1",
      epochId: "2000000",
      epochStart: String(E0),
      epochEnd: String(E1),
      startBlock: "100",
      endBlock: "200",
      snapshotBlock: "200",
      finalizedBlock: "210",
      confirmationDepth: "5",
      claimStart: "1800001000",
      claimDeadline: "1800600000",
      termsVersion: "terms-1",
      eligibilityPolicyVersion: "elig-1",
      restrictedJurisdictionPolicyVersion: "rjp-1",
    },
    excludedAddresses: [],
    eligibility: [
      {
        wallet: A.w1,
        eligible: true,
        policyVersion: "elig-1",
        validFrom: "1799990000",
        revoked: false,
      },
      {
        wallet: A.w2,
        eligible: true,
        policyVersion: "elig-1",
        validFrom: "1799990000",
        revoked: false,
      },
    ],
    epochStartBalances: [
      { wallet: A.w1, rawBalance: "100" },
      { wallet: A.w2, rawBalance: "300" },
    ],
    transfers: [],
    locks: [],
    assets: [
      {
        ticker: "GOVX",
        name: "Fictional Governance Stock Token",
        tokenAddress: A.asset18,
        decimals: 18,
        acquiredRawAmount: "1000",
      },
    ],
  });
}

/** Build a confirmed-transfer raw object with sensible defaults. */
export function rawTransfer(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    chainId: "10",
    blockNumber: "150",
    blockHash: hash("bb01"),
    transactionHash: hash("aa01"),
    transactionIndex: "0",
    logIndex: "0",
    timestamp: String(E0),
    from: A.zero,
    to: A.w1,
    rawAmount: "0",
    ...overrides,
  };
}
