// Fail-closed default canary manifest for the web profile (Task 10B-1). Mirrors the contract-side
// `packages/contracts/deploy/robinhood-mainnet.canary.json`, which is the source of truth. Every unresolved
// address and WETH cap is null → the resolver (`resolveCanary`) fails closed and NO live canary action is
// possible until a future preflight populates real values AND a founder sets both approval flags. Not set here.
export const DEFAULT_CANARY_MANIFEST = {
  schemaVersion: "1.0.0" as const,
  canary: true as const,
  production: false as const,
  chainId: 4663,
  broadcastReady: false,
  liveWritesApproved: false,
  isFixture: false,
  token: { name: "BPS Canary — TEST ONLY", symbol: "BPSC-TEST", decimals: 18 },
  actual: {
    canaryToken: null,
    lockingVault: null,
    claimManager: null,
    stockVault: null,
    coordinator: null,
    tradeRouter: null,
  },
  capitalCaps: {
    lpWethMaxWei: null,
    individualTradeWethMaxWei: null,
    lpWethMaxUsd: 100,
    individualTradeMaxUsd: 2,
    controlledTradesMaxUsd: 20,
    gasMaxUsd: 10,
    aggregateMaxUsd: 130,
  },
};
