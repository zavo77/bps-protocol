import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  evaluateGuardedSettlement,
  productionCandidatePolicy,
  buildIntent,
  computeIntentDigest,
  replayQex1Evidence,
  InMemoryReplayStore,
  evaluateLiveCliAuthorization,
  computeOnchainIntentDigest,
  ONCHAIN_GUARD_DOMAIN,
  validateOpaqueQuoteForIntent,
  OPAQUE_SETTLEMENT_SELECTOR,
  type OpaqueQuote,
  type OpaqueQuoteContext,
  GUARD_VERSION,
  OFFICIAL_REGISTRY,
  WETH,
  NVDA,
  DEAD_ADDRESS,
  ZERO_ADDRESS,
  OBSERVED_SELECTOR_EVIDENCE_ONLY,
  type SettlementPolicy,
  type SettlementIntent,
  type PriceObservation,
  type RegistryFeatureObservation,
  type GuardStatus,
  type ReadinessResult,
} from "./server.js";

// Every test in this suite carries a network tripwire: any fetch attempt fails immediately.
beforeAll(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation((() => {
    throw new Error("NETWORK ACCESS FORBIDDEN IN OFFLINE TEST");
  }) as unknown as typeof fetch);
});
afterAll(() => {
  vi.restoreAllMocks();
});

const ROUTER = "0xc94135b63772b91d79d0a2daab2a8801f32359bd";
const TEST_TAKER = "0x00000000000000000000000000000000000000a1";
const OTHER = "0x00000000000000000000000000000000000000ff";
const TEST_SELECTOR = "0x11223344";
const CALLDATA_HASH = `0x${"ab".repeat(32)}`;
const OBS_TIME = "2026-07-25T18:00:00Z";
const NOW = Math.floor(Date.parse("2026-07-25T18:05:00Z") / 1000); // 300s after OBS_TIME

function fullPolicy(over: Partial<SettlementPolicy> = {}): SettlementPolicy {
  return {
    ...productionCandidatePolicy(),
    allowedSelectors: [TEST_SELECTOR],
    maxSellAmountRawByToken: { [WETH.toLowerCase()]: 1_000000000000000000n },
    maxRegistryObservationAgeSec: 3600,
    maxPriceObservationAgeSec: 3600,
    finalTaker: TEST_TAKER,
    allowedPriceSources: ["test-oracle"],
    ...over,
  };
}

function validIntent(
  over: Partial<Omit<SettlementIntent, "intentDigest" | "version">> = {},
): SettlementIntent {
  return buildIntent({
    chainId: 4663,
    registry: OFFICIAL_REGISTRY,
    feature: 2,
    sellToken: WETH,
    buyToken: NVDA,
    sellAmountRaw: 10_000000000000000n, // 0.01 WETH
    minBuyAmountRaw: 89_402580412743985n,
    expectedTarget: ROUTER,
    selector: TEST_SELECTOR,
    calldataHash: CALLDATA_HASH,
    txValue: 0n,
    platformFeeBps: 5,
    integratorFeePresent: false,
    slippageBps: 50,
    taker: TEST_TAKER,
    nonce: 1n,
    createdAtSec: NOW - 100,
    deadlineSec: NOW + 100,
    ...over,
  });
}

function freshObs(over: Partial<RegistryFeatureObservation> = {}): RegistryFeatureObservation {
  return {
    registry: OFFICIAL_REGISTRY,
    feature: 2,
    currentRouter: ROUTER,
    previousRouter: ZERO_ADDRESS,
    nextRouter: ZERO_ADDRESS,
    paused: false,
    blockNumber: 19223939,
    observationTimeUtc: OBS_TIME,
    ...over,
  };
}

function freshPrice(over: Partial<PriceObservation> = {}): PriceObservation {
  return {
    source: "test-oracle",
    observedTimeSec: NOW - 60,
    observedBlock: null,
    sellToken: WETH,
    buyToken: NVDA,
    refSellAmountRaw: 10_000000000000000n,
    refBuyAmountRaw: 90_000000000000000n,
    sellDecimals: 18,
    buyDecimals: 18,
    ...over,
  };
}

function run(
  opts: {
    policy?: SettlementPolicy;
    intent?: SettlementIntent;
    obs?: RegistryFeatureObservation | null;
    price?: PriceObservation | null;
    store?: InMemoryReplayStore;
    now?: number;
  } = {},
): ReadinessResult {
  return evaluateGuardedSettlement({
    policy: opts.policy ?? fullPolicy(),
    intent: opts.intent ?? validIntent(),
    registryObservation: opts.obs === undefined ? freshObs() : opts.obs,
    priceObservation: opts.price === undefined ? freshPrice() : opts.price,
    replayStore: opts.store ?? new InMemoryReplayStore(),
    nowSec: opts.now ?? NOW,
  });
}

const has = (r: ReadinessResult, s: GuardStatus): boolean => r.failures.some((f) => f.status === s);

const ARTIFACT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/audit/BPS_RIALTO_QEX1_QUOTE_EVIDENCE_2026-07-25.evidence.json",
);

describe("happy path (fully mocked, offline)", () => {
  it("returns READY_OFFLINE_ONLY with an immutable sanitized plan", () => {
    const r = run();
    expect(r.failures).toEqual([]);
    expect(r.ready).toBe(true);
    expect(r.status).toBe("READY_OFFLINE_ONLY");
    expect(r.sanitizedPlan).not.toBeNull();
  });

  it("the plan contains exact-approve, verified-call, min-return, zero-allowance and consume steps", () => {
    const plan = run().sanitizedPlan!;
    const actions = plan.steps.map((s) => s.action);
    expect(actions).toEqual([
      "REVERIFY_REGISTRY",
      "APPROVE_EXACT",
      "CALL_ROUTER",
      "REQUIRE_MIN_BUY",
      "CLEAR_ALLOWANCE",
      "CONSUME_INTENT",
      "RECORD_EVIDENCE",
    ]);
    expect(plan.atomicity.toLowerCase()).toContain("revert");
    expect(plan.disclaimer).toContain("NOT authorization to execute");
    // Sanitized: the plan never carries a calldata blob or hash (only a bounded, high-level description).
    expect(plan).not.toHaveProperty("calldataHash");
    expect(JSON.stringify(plan)).not.toMatch(/0x[0-9a-fA-F]{100,}/);
  });

  it("READY_OFFLINE_ONLY is never described as execution authorization", () => {
    const plan = run().sanitizedPlan!;
    expect(plan.disclaimer).toContain("D-24 stands");
  });
});

describe("QEX-1 evidence stays non-production", () => {
  const raw = readFileSync(ARTIFACT_PATH, "utf8");
  const evidence = JSON.parse(raw) as Record<string, unknown>;

  it("replaying the sanitized evidence is NOT production-ready and lists the real gates", () => {
    const { readiness, distinctFailureStatuses } = replayQex1Evidence(evidence, NOW);
    expect(readiness.ready).toBe(false);
    expect(readiness.status).not.toBe("READY_OFFLINE_ONLY");
    for (const s of [
      "SELECTOR_UNAPPROVED",
      "TAKER_UNRESOLVED",
      "AMOUNT_LIMIT_UNRESOLVED",
      "PRICE_SOURCE_UNRESOLVED",
      "REGISTRY_OBSERVATION_STALE",
    ] as GuardStatus[]) {
      expect(distinctFailureStatuses).toContain(s);
    }
    expect(readiness.remainingProductionGates.length).toBeGreaterThan(0);
  });

  it("emits no secret, raw quote id, complete calldata, or key fragment", () => {
    const { readiness } = replayQex1Evidence(evidence, NOW);
    const s = JSON.stringify(readiness);
    expect(s).not.toContain("rialto_live_");
    expect(s.toLowerCase()).not.toContain("bearer ");
    expect(s).not.toMatch(/0x[0-9a-fA-F]{100,}/); // no complete calldata blob
  });

  it("the observed selector remains unapproved under the production candidate policy", () => {
    const r = evaluateGuardedSettlement({
      policy: productionCandidatePolicy(),
      intent: validIntent({ selector: OBSERVED_SELECTOR_EVIDENCE_ONLY }),
      registryObservation: freshObs(),
      priceObservation: freshPrice(),
      replayStore: new InMemoryReplayStore(),
      nowSec: NOW,
    });
    expect(has(r, "SELECTOR_UNAPPROVED")).toBe(true);
    expect(r.ready).toBe(false);
  });
});

describe("selector guard", () => {
  it("an injected test selector passes only when every other guard is satisfied", () => {
    expect(run({ intent: validIntent({ selector: TEST_SELECTOR }) }).ready).toBe(true);
    // Same approved selector, but another guard fails => not ready.
    expect(run({ intent: validIntent({ selector: TEST_SELECTOR, txValue: 1n }) }).ready).toBe(
      false,
    );
  });

  it("one observed quote cannot self-approve a selector", () => {
    // Even presenting 0x77963966 with an otherwise-valid intent fails under the empty production list.
    const r = run({ policy: fullPolicy({ allowedSelectors: [] }), intent: validIntent() });
    expect(has(r, "SELECTOR_UNAPPROVED")).toBe(true);
  });
});

describe("registry guard fails closed", () => {
  it("missing observation", () =>
    expect(has(run({ obs: null }), "REGISTRY_OBSERVATION_MISSING")).toBe(true));
  it("paused feature", () =>
    expect(has(run({ obs: freshObs({ paused: true }) }), "REGISTRY_PAUSED")).toBe(true));
  it("zero current router", () =>
    expect(has(run({ obs: freshObs({ currentRouter: ZERO_ADDRESS }) }), "ROUTER_MISMATCH")).toBe(
      true,
    ));
  it("malformed current router", () =>
    expect(has(run({ obs: freshObs({ currentRouter: "0x1234" }) }), "ROUTER_MISMATCH")).toBe(true));
  it("target mismatch", () =>
    expect(has(run({ intent: validIntent({ expectedTarget: OTHER }) }), "ROUTER_MISMATCH")).toBe(
      true,
    ));
  it("previous/next-only match does not pass", () => {
    const r = run({
      intent: validIntent({ expectedTarget: OTHER }),
      obs: freshObs({ previousRouter: OTHER }),
    });
    expect(has(r, "ROUTER_MISMATCH")).toBe(true);
    expect(r.ready).toBe(false);
  });
  it("undated snapshot cannot establish readiness", () => {
    const r = run({ obs: freshObs({ blockNumber: null, observationTimeUtc: null }) });
    expect(has(r, "REGISTRY_OBSERVATION_STALE")).toBe(true);
    expect(r.ready).toBe(false);
  });
  it("stale (too old) observation", () => {
    const r = run({ obs: freshObs({ observationTimeUtc: "2026-07-25T00:00:00Z" }) });
    expect(has(r, "REGISTRY_OBSERVATION_STALE")).toBe(true);
  });
  it("wrong registry address / feature in observation", () => {
    expect(has(run({ obs: freshObs({ registry: OTHER }) }), "REGISTRY_MISMATCH")).toBe(true);
    expect(has(run({ obs: freshObs({ feature: 3 }) }), "FEATURE_MISMATCH")).toBe(true);
  });
});

describe("taker guard", () => {
  it("unresolved final taker fails", () =>
    expect(has(run({ policy: fullPolicy({ finalTaker: null }) }), "TAKER_UNRESOLVED")).toBe(true));
  it("dead-address final taker fails", () =>
    expect(has(run({ policy: fullPolicy({ finalTaker: DEAD_ADDRESS }) }), "TAKER_UNRESOLVED")).toBe(
      true,
    ));
  it("dead-address intent taker fails", () =>
    expect(has(run({ intent: validIntent({ taker: DEAD_ADDRESS }) }), "TAKER_UNRESOLVED")).toBe(
      true,
    ));
  it("taker mismatch fails", () =>
    expect(has(run({ intent: validIntent({ taker: OTHER }) }), "TAKER_MISMATCH")).toBe(true));
});

describe("identity, token, amount, fee, value guards", () => {
  it("wrong chain", () =>
    expect(has(run({ intent: validIntent({ chainId: 1 }) }), "WRONG_CHAIN")).toBe(true));
  it("wrong registry", () =>
    expect(has(run({ intent: validIntent({ registry: OTHER }) }), "REGISTRY_MISMATCH")).toBe(true));
  it("wrong feature", () =>
    expect(has(run({ intent: validIntent({ feature: 3 }) }), "FEATURE_MISMATCH")).toBe(true));
  it("token not allowed", () =>
    expect(has(run({ intent: validIntent({ buyToken: WETH }) }), "TOKEN_NOT_ALLOWED")).toBe(true));
  it("reversed direction not allowed", () =>
    expect(
      has(run({ intent: validIntent({ sellToken: NVDA, buyToken: WETH }) }), "TOKEN_NOT_ALLOWED"),
    ).toBe(true));
  it("missing amount cap", () =>
    expect(
      has(
        run({ policy: fullPolicy({ maxSellAmountRawByToken: { [WETH.toLowerCase()]: null } }) }),
        "AMOUNT_LIMIT_UNRESOLVED",
      ),
    ).toBe(true));
  it("excessive sell amount", () =>
    expect(
      has(
        run({ intent: validIntent({ sellAmountRaw: 2_000000000000000000n }) }),
        "AMOUNT_EXCEEDS_LIMIT",
      ),
    ).toBe(true));
  it("zero amounts", () => {
    expect(has(run({ intent: validIntent({ sellAmountRaw: 0n }) }), "AMOUNT_INVALID")).toBe(true);
    expect(has(run({ intent: validIntent({ minBuyAmountRaw: 0n }) }), "AMOUNT_INVALID")).toBe(true);
  });
  it("nonzero tx.value fails for WETH settlement", () =>
    expect(has(run({ intent: validIntent({ txValue: 1n }) }), "NONZERO_TX_VALUE")).toBe(true));
  it("platform fee above 5 bps fails", () =>
    expect(has(run({ intent: validIntent({ platformFeeBps: 6 }) }), "FEE_POLICY_VIOLATION")).toBe(
      true,
    ));
  it("any integrator fee fails", () =>
    expect(
      has(run({ intent: validIntent({ integratorFeePresent: true }) }), "FEE_POLICY_VIOLATION"),
    ).toBe(true));
  it("slippage above 100 bps fails", () =>
    expect(
      has(run({ intent: validIntent({ slippageBps: 101 }) }), "SLIPPAGE_POLICY_VIOLATION"),
    ).toBe(true));
  it("missing/malformed calldata hash fails", () => {
    expect(has(run({ intent: validIntent({ calldataHash: null }) }), "CALLDATA_HASH_INVALID")).toBe(
      true,
    );
    expect(
      has(run({ intent: validIntent({ calldataHash: "0x1234" }) }), "CALLDATA_HASH_INVALID"),
    ).toBe(true);
  });
});

describe("price guard (D-22B)", () => {
  it("no approved production source (candidate policy) fails closed", () => {
    const r = evaluateGuardedSettlement({
      policy: productionCandidatePolicy(),
      intent: validIntent(),
      registryObservation: freshObs(),
      priceObservation: freshPrice(),
      replayStore: new InMemoryReplayStore(),
      nowSec: NOW,
    });
    expect(has(r, "PRICE_SOURCE_UNRESOLVED")).toBe(true);
  });
  it("missing observation fails", () =>
    expect(has(run({ price: null }), "PRICE_SOURCE_UNRESOLVED")).toBe(true));
  it("unapproved source fails", () =>
    expect(has(run({ price: freshPrice({ source: "evil" }) }), "PRICE_SOURCE_UNRESOLVED")).toBe(
      true,
    ));
  it("mismatched pair fails", () =>
    expect(has(run({ price: freshPrice({ buyToken: WETH }) }), "PRICE_PAIR_MISMATCH")).toBe(true));
  it("stale observation fails", () =>
    expect(
      has(run({ price: freshPrice({ observedTimeSec: NOW - 100000 }) }), "PRICE_OBSERVATION_STALE"),
    ).toBe(true));
  it("materially deviating minimum return fails", () =>
    expect(
      has(
        run({ intent: validIntent({ minBuyAmountRaw: 200_000000000000000n }) }),
        "PRICE_DEVIATION_EXCEEDED",
      ),
    ).toBe(true));
  it("uses conservative floor rounding at the deviation boundary", () => {
    // ref 3->3, sell 1 => refBuyForSell = floor(3*1/3)=1; permittedMax = floor(1*10100/10000)=1.
    const policy = fullPolicy({ maxSellAmountRawByToken: { [WETH.toLowerCase()]: 100n } });
    const price = freshPrice({ refSellAmountRaw: 3n, refBuyAmountRaw: 3n });
    const exceeded = run({
      policy,
      price,
      intent: validIntent({ sellAmountRaw: 1n, minBuyAmountRaw: 2n }),
    });
    expect(has(exceeded, "PRICE_DEVIATION_EXCEEDED")).toBe(true);
    const ok = run({
      policy,
      price,
      intent: validIntent({ sellAmountRaw: 1n, minBuyAmountRaw: 1n }),
    });
    expect(has(ok, "PRICE_DEVIATION_EXCEEDED")).toBe(false);
  });
});

describe("replay and expiry", () => {
  it("missing deadline fails", () =>
    expect(has(run({ intent: validIntent({ deadlineSec: 0 }) }), "MISSING_DEADLINE")).toBe(true));
  it("expired intent fails", () =>
    expect(
      has(
        run({ intent: validIntent({ createdAtSec: NOW - 200, deadlineSec: NOW - 10 }) }),
        "INTENT_EXPIRED",
      ),
    ).toBe(true));
  it("excessive lifetime fails", () =>
    expect(
      has(
        run({ intent: validIntent({ createdAtSec: NOW - 10, deadlineSec: NOW + 400 }) }),
        "INTENT_LIFETIME_EXCESSIVE",
      ),
    ).toBe(true));
  it("reused nonce fails", () => {
    const store = new InMemoryReplayStore([], [`${TEST_TAKER.toLowerCase()}:1`]);
    expect(has(run({ store }), "NONCE_REUSED")).toBe(true);
  });
  it("replayed digest fails", () => {
    const intent = validIntent();
    const store = new InMemoryReplayStore([intent.intentDigest]);
    expect(has(run({ intent, store }), "REPLAY_DETECTED")).toBe(true);
  });
  it("digest mismatch fails", () => {
    const intent = validIntent();
    const tampered = { ...intent, nonce: intent.nonce + 5n }; // digest not recomputed
    expect(has(run({ intent: tampered }), "DIGEST_MISMATCH")).toBe(true);
  });
  it("computeIntentDigest is deterministic and domain-separated by nonce", () => {
    const base = {
      version: GUARD_VERSION,
      chainId: 4663,
      registry: OFFICIAL_REGISTRY,
      feature: 2,
      sellToken: WETH,
      buyToken: NVDA,
      sellAmountRaw: 1n,
      minBuyAmountRaw: 1n,
      expectedTarget: ROUTER,
      selector: TEST_SELECTOR,
      calldataHash: CALLDATA_HASH,
      txValue: 0n,
      platformFeeBps: 5,
      integratorFeePresent: false,
      slippageBps: 50,
      taker: TEST_TAKER,
      nonce: 1n,
      createdAtSec: NOW - 100,
      deadlineSec: NOW + 100,
    };
    expect(computeIntentDigest(base)).toBe(computeIntentDigest(base));
    expect(computeIntentDigest(base)).not.toBe(computeIntentDigest({ ...base, nonce: 2n }));
  });
});

describe("on-chain digest parity (matches Solidity GuardedSettlementExecutor)", () => {
  // Shared cross-language vector — the Solidity test test_digestParityVector asserts the same values.
  it("computes the shared vector's domain and digest identically to Solidity", () => {
    expect(ONCHAIN_GUARD_DOMAIN).toBe(
      "0xc7f83144102cea8c4daddf564ae4844c4d4b1339359d09e218eb4420af3bad84",
    );
    const digest = computeOnchainIntentDigest({
      chainId: 4663,
      executor: "0x1111111111111111111111111111111111111111",
      registry: "0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E",
      feature: 2,
      target: "0xc94135b63772b91d79d0a2daab2a8801f32359bd",
      selector: "0x77963966",
      sellToken: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      buyToken: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
      sellAmountRaw: 5_000000000000000n,
      minBuyAmountRaw: 1_000000000000000n,
      platformFeeBps: 5,
      slippageBps: 50,
      taker: "0x1111111111111111111111111111111111111111",
      nonce: 1n,
      deadlineSec: 1893456000n,
      calldataHash: "0x00000000000000000000000000000000000000000000000000000000deadbeef",
    });
    expect(digest).toBe("0x99edf1c907908d0d6f278d7e04c0a6624ba35f59ca6b7b74800b220fdd8e8c06");
  });
});

describe("validateOpaqueQuoteForIntent — opaque quote boundary", () => {
  const ROUTER = "0xc94135b63772b91d79d0a2daab2a8801f32359bd";
  const EXECUTOR = "0x00000000000000000000000000000000000000e1";
  const NOW = 1_800_000_000;
  const CALLDATA = `${OPAQUE_SETTLEMENT_SELECTOR}${"ab".repeat(100)}` as `0x${string}`;

  function quote(over: Partial<OpaqueQuote> = {}): OpaqueQuote {
    return {
      settlement: "allowance",
      txTo: ROUTER,
      txValue: "0",
      selector: OPAQUE_SETTLEMENT_SELECTOR,
      callData: CALLDATA,
      sellToken: WETH,
      buyToken: NVDA,
      taker: EXECUTOR,
      sellAmountRaw: 10_000000000000000n,
      minBuyAmountRaw: 89_402580412743985n,
      platformFeeBps: 5,
      integratorFeePresent: false,
      allowanceSpender: ROUTER,
      expirySec: NOW + 60,
      ...over,
    };
  }
  function ctx(over: Partial<OpaqueQuoteContext> = {}): OpaqueQuoteContext {
    return {
      chainId: 4663,
      resolvedRouter: ROUTER,
      executor: EXECUTOR,
      weth: WETH,
      nvda: NVDA,
      maxPlatformFeeBps: 5,
      nowSec: NOW,
      intentSellAmountRaw: 10_000000000000000n,
      intentMinBuyAmountRaw: 89_402580412743985n,
      ...over,
    };
  }

  it("accepts a well-formed allowance quote and returns only the calldata hash", () => {
    const r = validateOpaqueQuoteForIntent(quote(), ctx());
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
    expect(r.calldataHash).toMatch(/^0x[0-9a-f]{64}$/);
    // The complete calldata never appears in the result.
    expect(JSON.stringify(r)).not.toContain("ababab");
  });

  it.each([
    [{ settlement: "gasless" }, "SETTLEMENT_NOT_ALLOWANCE"],
    [{ txTo: "0x0000000000000000000000000000000000000009" }, "TX_TO_NOT_ROUTER"],
    [
      { allowanceSpender: "0x0000000000000000000000000000000000000009" },
      "ALLOWANCE_SPENDER_NOT_ROUTER",
    ],
    [{ txValue: "1" }, "NONZERO_TX_VALUE"],
    [{ selector: "0x12345678" }, "WRONG_SELECTOR"],
    [{ sellToken: NVDA }, "SELL_TOKEN_NOT_WETH"],
    [{ buyToken: WETH }, "BUY_TOKEN_NOT_NVDA"],
    [{ taker: "0x0000000000000000000000000000000000000009" }, "TAKER_NOT_EXECUTOR"],
    [{ sellAmountRaw: 1n }, "SELL_AMOUNT_MISMATCH"],
    [{ minBuyAmountRaw: 1n }, "MIN_BUY_MISMATCH"],
    [{ platformFeeBps: 6 }, "PLATFORM_FEE_TOO_HIGH"],
    [{ integratorFeePresent: true }, "INTEGRATOR_FEE_PRESENT"],
    [{ expirySec: NOW - 1 }, "QUOTE_EXPIRED"],
    [{ expirySec: null }, "QUOTE_EXPIRED"],
  ])("rejects %o with %s", (over, code) => {
    const r = validateOpaqueQuoteForIntent(quote(over as Partial<OpaqueQuote>), ctx());
    expect(r.ok).toBe(false);
    expect(r.failures).toContain(code);
  });

  it("rejects calldata whose leading selector differs from the declared selector", () => {
    const r = validateOpaqueQuoteForIntent(
      quote({ callData: `0x12345678${"ab".repeat(100)}` as `0x${string}` }),
      ctx(),
    );
    expect(r.failures).toContain("CALLDATA_SELECTOR_MISMATCH");
  });

  it("rejects the wrong chain", () => {
    expect(validateOpaqueQuoteForIntent(quote(), ctx({ chainId: 1 })).failures).toContain(
      "WRONG_CHAIN",
    );
  });
});

describe("module safety", () => {
  it("importing causes no network, process exit, or execution", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((): never => {
      throw new Error("import must not exit");
    }) as never);
    try {
      const mod = await import("./guarded-settlement.js");
      expect(typeof mod.evaluateGuardedSettlement).toBe("function");
      expect(typeof mod.productionCandidatePolicy).toBe("function");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("the QEX-1 live CLI remains consumed and cannot be bypassed", () => {
    const a = evaluateLiveCliAuthorization();
    expect(a.allowed).toBe(false);
    expect(a.status).toBe("QEX1_CONSUMED");
  });

  it("remaining production gates surface the real unresolved facts", () => {
    const gates = run({ policy: productionCandidatePolicy() }).remainingProductionGates.join(" | ");
    expect(gates).toContain("APPROVED_SELECTOR");
    expect(gates).toContain("FINAL_TAKER");
    expect(gates).toContain("PER_TOKEN_AMOUNT_CAP");
    expect(gates).toContain("DATED_REGISTRY_STRATEGY");
    expect(gates).toContain("TRUSTED_PRICE_SOURCE");
  });
});
