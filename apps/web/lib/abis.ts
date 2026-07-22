// Minimal, hand-written ABIs for the user-facing BPS contracts, transcribed from the FROZEN Solidity
// public function/event signatures (BPSTradeRouter, BPSLockingVault, DistributionClaimManager,
// DistributionFundingCoordinator). These are read/encode-only descriptors used by the application to
// build calldata and decode events; they do not modify any contract. Kept intentionally narrow — only
// the surfaces the restricted-beta app uses. `as const` preserves literal types for viem.

export const bpsTradeRouterAbi = [
  {
    type: "function",
    name: "buyExactWethForBps",
    stateMutability: "nonpayable",
    inputs: [
      { name: "grossWethInput", type: "uint256" },
      { name: "minimumUserBpsOutput", type: "uint256" },
      { name: "minimumBurnBpsOutput", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "sellExactBpsForWeth",
    stateMutability: "nonpayable",
    inputs: [
      { name: "grossBpsInput", type: "uint256" },
      { name: "minimumGrossWethOutput", type: "uint256" },
      { name: "minimumUserWethOutput", type: "uint256" },
      { name: "minimumBurnBpsOutput", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "stockBudgetRecipient",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "OfficialBuy",
    inputs: [
      { name: "tradeId", type: "uint256", indexed: true },
      { name: "trader", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "grossWethInput", type: "uint256", indexed: false },
      { name: "stockBudget", type: "uint256", indexed: false },
      { name: "burnBudget", type: "uint256", indexed: false },
      { name: "userWethBudget", type: "uint256", indexed: false },
      { name: "userBpsOutput", type: "uint256", indexed: false },
      { name: "bpsBurned", type: "uint256", indexed: false },
      { name: "adapter", type: "address", indexed: false },
      { name: "stockBudgetRecipient", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "OfficialSell",
    inputs: [
      { name: "tradeId", type: "uint256", indexed: true },
      { name: "trader", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "grossBpsInput", type: "uint256", indexed: false },
      { name: "grossWethOutput", type: "uint256", indexed: false },
      { name: "stockBudget", type: "uint256", indexed: false },
      { name: "burnBudget", type: "uint256", indexed: false },
      { name: "userWethOutput", type: "uint256", indexed: false },
      { name: "bpsBurned", type: "uint256", indexed: false },
      { name: "adapter", type: "address", indexed: false },
      { name: "stockBudgetRecipient", type: "address", indexed: false },
    ],
  },
] as const;

export const bpsLockingVaultAbi = [
  {
    type: "function",
    name: "createLock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "duration", type: "uint32" },
    ],
    outputs: [{ name: "lockId", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "lockId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "policyMultiplierBps",
    stateMutability: "pure",
    inputs: [{ name: "duration", type: "uint32" }],
    outputs: [{ type: "uint16" }],
  },
  {
    type: "function",
    name: "totalLockedPrincipal",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "LockCreated",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "lockId", type: "uint256", indexed: true },
      { name: "principal", type: "uint256", indexed: false },
      { name: "startTime", type: "uint64", indexed: false },
      { name: "duration", type: "uint32", indexed: false },
      { name: "unlockTime", type: "uint64", indexed: false },
      { name: "multiplierBps", type: "uint16", indexed: false },
      { name: "policyVersion", type: "uint16", indexed: false },
    ],
  },
] as const;

export const distributionClaimManagerAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cycleId", type: "uint256" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "leafFor",
    stateMutability: "view",
    inputs: [
      { name: "cycleId", type: "uint256" },
      { name: "claimant", type: "address" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "remaining",
    stateMutability: "view",
    inputs: [
      { name: "cycleId", type: "uint256" },
      { name: "asset", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "cycleId", type: "uint256", indexed: true },
      { name: "claimant", type: "address", indexed: true },
      { name: "asset", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const distributionFundingCoordinatorAbi = [
  {
    type: "event",
    name: "AcquisitionRecorded",
    inputs: [
      { name: "acquisitionId", type: "uint256", indexed: true },
      { name: "stockToken", type: "address", indexed: true },
      { name: "operator", type: "address", indexed: true },
      { name: "wethSpent", type: "uint256", indexed: false },
      { name: "acquiredStock", type: "uint256", indexed: false },
      { name: "distributionAmount", type: "uint256", indexed: false },
      { name: "reserveAmount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AcquisitionFunded",
    inputs: [
      { name: "acquisitionId", type: "uint256", indexed: true },
      { name: "cycleId", type: "uint256", indexed: true },
      { name: "stockToken", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "merkleRoot", type: "bytes32", indexed: false },
      { name: "claimStart", type: "uint64", indexed: false },
      { name: "claimDeadline", type: "uint64", indexed: false },
    ],
  },
] as const;
