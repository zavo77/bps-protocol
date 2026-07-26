// TASK 10K-3 — Guarded settlement core for the Rialto WETH->stock-token flow (Robinhood Chain, chain 4663).
//
// SCOPE / SAFETY:
// - PURE, DETERMINISTIC, OFFLINE. No environment reads, no network calls, no filesystem reads, no process
//   exits, and no import-time side effects. All external state (registry observation, price observation,
//   replay store, clock) is injected explicitly.
// - This module VALIDATES and PREPARES a settlement plan. It NEVER signs, funds, approves, encodes,
//   simulates, submits, or broadcasts anything. There is no execution/broadcast client here.
// - It is DELIBERATELY DISABLED for production: the production candidate policy leaves the selector
//   allow-list empty, the final taker unresolved, the per-token cap unresolved, the registry/price age
//   limits unresolved, and the approved price-source list empty — so it fails closed until those
//   production facts are supplied AND explicitly approved. D-24 stands: nothing here authorizes execution.
// - Integer-safe arithmetic only (bigint for token amounts; integer bps). No floating-point for amounts,
//   prices, fees, or basis points. Deviation rounding is documented (floor => conservative ceiling).

import { createHash } from "node:crypto";
import { keccak256, encodeAbiParameters, stringToHex } from "viem";
import { reconcileRegistryTarget, type RegistryFeatureObservation } from "./registry-structural.js";

export const GUARD_VERSION = "bps-guarded-settlement/1";
export const OFFICIAL_REGISTRY = "0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E";
export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
export const NVDA = "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC";
export const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const OBSERVED_SELECTOR_EVIDENCE_ONLY = "0x77963966"; // evidence-only; NEVER in the production policy

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SELECTOR_RE = /^0x[0-9a-fA-F]{8}$/;
const HASH32_RE = /^0x[0-9a-fA-F]{64}$/;

const lower = (s: string): string => s.toLowerCase();
const isAddress = (v: unknown): v is string => typeof v === "string" && ADDRESS_RE.test(v);
const isSelector = (v: unknown): v is string => typeof v === "string" && SELECTOR_RE.test(v);
const isHash32 = (v: unknown): v is string => typeof v === "string" && HASH32_RE.test(v);
const sha256Hex = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

export type GuardStatus =
  | "READY_OFFLINE_ONLY"
  | "POLICY_INCOMPLETE"
  | "WRONG_CHAIN"
  | "REGISTRY_MISMATCH"
  | "FEATURE_MISMATCH"
  | "REGISTRY_OBSERVATION_MISSING"
  | "REGISTRY_OBSERVATION_STALE"
  | "REGISTRY_PAUSED"
  | "ROUTER_MISMATCH"
  | "SELECTOR_UNAPPROVED"
  | "TAKER_UNRESOLVED"
  | "TAKER_MISMATCH"
  | "TOKEN_NOT_ALLOWED"
  | "AMOUNT_INVALID"
  | "AMOUNT_LIMIT_UNRESOLVED"
  | "AMOUNT_EXCEEDS_LIMIT"
  | "NONZERO_TX_VALUE"
  | "FEE_POLICY_VIOLATION"
  | "SLIPPAGE_POLICY_VIOLATION"
  | "CALLDATA_HASH_INVALID"
  | "PRICE_SOURCE_UNRESOLVED"
  | "PRICE_PAIR_MISMATCH"
  | "PRICE_OBSERVATION_STALE"
  | "PRICE_DEVIATION_EXCEEDED"
  | "MISSING_DEADLINE"
  | "INTENT_EXPIRED"
  | "INTENT_LIFETIME_EXCESSIVE"
  | "DIGEST_MISMATCH"
  | "REPLAY_DETECTED"
  | "NONCE_REUSED";

export interface TokenPair {
  readonly sellToken: string;
  readonly buyToken: string;
}

export interface SettlementPolicy {
  readonly guardVersion: string;
  readonly chainId: number;
  readonly registry: string;
  readonly feature: number;
  readonly allowedPairs: readonly TokenPair[];
  /** Per sell-token maximum, keyed by lowercased address. `null` = UNRESOLVED (fail closed). */
  readonly maxSellAmountRawByToken: Readonly<Record<string, bigint | null>>;
  /** EMPTY in production. A single observed quote never adds to this. */
  readonly allowedSelectors: readonly string[];
  readonly maxPlatformFeeBps: number;
  readonly integratorFeeAllowed: boolean;
  readonly defaultSlippageBps: number;
  readonly maxSlippageBps: number;
  readonly maxPriceDeviationBps: number;
  readonly maxPriceObservationAgeSec: number | null; // null = UNRESOLVED
  readonly maxRegistryObservationAgeSec: number | null; // null = UNRESOLVED
  readonly maxIntentLifetimeSec: number;
  readonly finalTaker: string | null; // null = UNRESOLVED
  readonly allowedPriceSources: readonly string[]; // EMPTY in production
  readonly paused: boolean;
}

export interface SettlementIntent {
  readonly version: string;
  readonly chainId: number;
  readonly registry: string;
  readonly feature: number;
  readonly sellToken: string;
  readonly buyToken: string;
  readonly sellAmountRaw: bigint;
  readonly minBuyAmountRaw: bigint;
  readonly expectedTarget: string;
  readonly selector: string;
  readonly calldataHash: string | null; // 0x + 64 hex; complete calldata is NEVER stored
  readonly txValue: bigint;
  readonly platformFeeBps: number;
  readonly integratorFeePresent: boolean;
  readonly slippageBps: number;
  readonly taker: string;
  readonly nonce: bigint;
  readonly intentDigest: string;
  readonly createdAtSec: number;
  readonly deadlineSec: number;
}

export interface PriceObservation {
  readonly source: string;
  readonly observedTimeSec: number | null;
  readonly observedBlock: number | null;
  readonly sellToken: string;
  readonly buyToken: string;
  readonly refSellAmountRaw: bigint;
  readonly refBuyAmountRaw: bigint;
  readonly sellDecimals: number;
  readonly buyDecimals: number;
}

/** Read side of replay protection. A durable implementation must back this in production. */
export interface ReplayStore {
  isDigestConsumed(digest: string): boolean;
  isNonceUsed(taker: string, nonce: bigint): boolean;
}

/** NON-PRODUCTION in-memory replay store for tests/offline demos ONLY. Not durable, not atomic. */
export class InMemoryReplayStore implements ReplayStore {
  readonly nonProduction = true as const;
  private readonly digests = new Set<string>();
  private readonly nonces = new Set<string>();
  constructor(consumedDigests: readonly string[] = [], usedNonces: readonly string[] = []) {
    for (const d of consumedDigests) this.digests.add(lower(d));
    for (const n of usedNonces) this.nonces.add(lower(n));
  }
  private nonceKey(taker: string, nonce: bigint): string {
    return `${lower(taker)}:${nonce.toString()}`;
  }
  isDigestConsumed(digest: string): boolean {
    return this.digests.has(lower(digest));
  }
  isNonceUsed(taker: string, nonce: bigint): boolean {
    return this.nonces.has(this.nonceKey(taker, nonce));
  }
  /** Test-only helper mirroring the atomic consume the future durable/on-chain store must perform. */
  markConsumed(digest: string, taker: string, nonce: bigint): void {
    this.digests.add(lower(digest));
    this.nonces.add(this.nonceKey(taker, nonce));
  }
}

export interface SettlementPlanStep {
  readonly order: number;
  readonly action: string;
  readonly detail: string;
}

export interface SettlementPlan {
  readonly guardVersion: string;
  readonly intentDigest: string;
  readonly taker: string;
  readonly target: string;
  readonly sellToken: string;
  readonly buyToken: string;
  readonly sellAmountRaw: string;
  readonly minBuyAmountRaw: string;
  readonly deadlineSec: number;
  readonly steps: readonly SettlementPlanStep[];
  readonly atomicity: string;
  readonly disclaimer: string;
}

export interface GuardFailure {
  readonly status: GuardStatus;
  readonly message: string;
}

export interface ReadinessResult {
  readonly ready: boolean;
  readonly status: GuardStatus;
  readonly failures: readonly GuardFailure[];
  readonly warnings: readonly string[];
  readonly validatedPolicy: {
    readonly guardVersion: string;
    readonly chainId: number;
    readonly registry: string;
    readonly feature: number;
    readonly selectorAllowListSize: number;
    readonly finalTakerResolved: boolean;
    readonly priceSourcesResolved: boolean;
    readonly registryAgeLimitResolved: boolean;
    readonly priceAgeLimitResolved: boolean;
    readonly paused: boolean;
  };
  readonly sanitizedPlan: SettlementPlan | null;
  readonly remainingProductionGates: readonly string[];
}

export interface GuardedSettlementInput {
  readonly policy: SettlementPolicy;
  readonly intent: SettlementIntent;
  readonly registryObservation: RegistryFeatureObservation | null;
  readonly priceObservation: PriceObservation | null;
  readonly replayStore: ReplayStore;
  readonly nowSec: number;
}

/** The production CANDIDATE policy. Deliberately incomplete: fails closed on unresolved production facts. */
export function productionCandidatePolicy(): SettlementPolicy {
  return {
    guardVersion: GUARD_VERSION,
    chainId: 4663,
    registry: OFFICIAL_REGISTRY,
    feature: 2,
    allowedPairs: [{ sellToken: WETH, buyToken: NVDA }],
    maxSellAmountRawByToken: { [lower(WETH)]: null }, // UNRESOLVED — do not guess a cap
    allowedSelectors: [], // EMPTY — 0x77963966 stays evidence-only, NOT approved
    maxPlatformFeeBps: 5,
    integratorFeeAllowed: false,
    defaultSlippageBps: 50,
    maxSlippageBps: 100,
    maxPriceDeviationBps: 100,
    maxPriceObservationAgeSec: null, // UNRESOLVED
    maxRegistryObservationAgeSec: null, // UNRESOLVED
    maxIntentLifetimeSec: 300,
    finalTaker: null, // UNRESOLVED — the dead-address canary is NOT an acceptable production taker
    allowedPriceSources: [], // EMPTY — no approved production price source
    paused: false,
  };
}

/** Deterministic, domain-separated intent digest. Complete calldata is never included (hash only). */
export function computeIntentDigest(i: Omit<SettlementIntent, "intentDigest">): string {
  const parts = [
    "BPS-GUARDED-SETTLEMENT",
    i.version,
    String(i.chainId),
    lower(i.registry),
    String(i.feature),
    lower(i.taker),
    i.nonce.toString(),
    String(i.deadlineSec),
    lower(i.expectedTarget),
    lower(i.selector),
    lower(i.sellToken),
    lower(i.buyToken),
    i.sellAmountRaw.toString(),
    i.minBuyAmountRaw.toString(),
    i.calldataHash ? lower(i.calldataHash) : "NO_CALLDATA_HASH",
  ];
  return `0x${sha256Hex(parts.join("|"))}`;
}

/** Convenience: build a fully-formed intent with a correct digest. */
export function buildIntent(
  i: Omit<SettlementIntent, "intentDigest" | "version">,
): SettlementIntent {
  const withVersion = { ...i, version: GUARD_VERSION };
  return { ...withVersion, intentDigest: computeIntentDigest(withVersion) };
}

/** Floor division for non-negative bigints (documented conservative rounding for the deviation ceiling). */
function floorDiv(a: bigint, b: bigint): bigint {
  return a / b; // bigint division truncates toward zero; a,b >= 0 here => floor
}

function pairAllowed(policy: SettlementPolicy, sellToken: string, buyToken: string): boolean {
  return policy.allowedPairs.some(
    (p) => lower(p.sellToken) === lower(sellToken) && lower(p.buyToken) === lower(buyToken),
  );
}

function computeRemainingGates(policy: SettlementPolicy): string[] {
  const gates: string[] = [];
  if (policy.allowedSelectors.length === 0) {
    gates.push(
      "APPROVED_SELECTOR — production selector allow-list is empty (0x77963966 is evidence-only)",
    );
  }
  if (policy.finalTaker === null || !isAddress(policy.finalTaker)) {
    gates.push("FINAL_TAKER — guarded-executor/Safe taker address unresolved");
  }
  const capUnresolved = policy.allowedPairs.some(
    (p) => (policy.maxSellAmountRawByToken[lower(p.sellToken)] ?? null) === null,
  );
  if (capUnresolved) gates.push("PER_TOKEN_AMOUNT_CAP — maximum sell amount unresolved");
  if (policy.maxRegistryObservationAgeSec === null) {
    gates.push(
      "DATED_REGISTRY_STRATEGY — max registry observation age unresolved (undated snapshots fail closed)",
    );
  }
  if (policy.allowedPriceSources.length === 0 || policy.maxPriceObservationAgeSec === null) {
    gates.push("TRUSTED_PRICE_SOURCE — no approved production price source / age limit (D-22B)");
  }
  return gates;
}

/**
 * Evaluate the full guarded-settlement pipeline OFFLINE. Collects ALL failures (does not collapse them),
 * returns READY_OFFLINE_ONLY only when every guard passes. READY_OFFLINE_ONLY is NEVER authorization to
 * execute — it means the offline plan is internally consistent against the injected inputs.
 */
export function evaluateGuardedSettlement(input: GuardedSettlementInput): ReadinessResult {
  const { policy, intent, registryObservation, priceObservation, replayStore, nowSec } = input;
  const failures: GuardFailure[] = [];
  const warnings: string[] = [];
  const add = (status: GuardStatus, message: string): void => {
    failures.push({ status, message });
  };

  // 0. Policy structural sanity (shape errors, not unresolved-fact gates).
  if (policy.guardVersion !== GUARD_VERSION) add("POLICY_INCOMPLETE", "unexpected guard version");
  if (!isAddress(policy.registry)) add("POLICY_INCOMPLETE", "policy registry is not an address");
  if (policy.maxSlippageBps <= 0 || policy.defaultSlippageBps < 0) {
    add("POLICY_INCOMPLETE", "slippage policy bounds are invalid");
  }
  if (policy.defaultSlippageBps > policy.maxSlippageBps) {
    add("POLICY_INCOMPLETE", "default slippage exceeds the maximum");
  }
  if (policy.maxIntentLifetimeSec <= 0 || policy.maxIntentLifetimeSec > 300) {
    add("POLICY_INCOMPLETE", "intent lifetime must be > 0 and <= 300 seconds");
  }
  if (policy.paused) add("POLICY_INCOMPLETE", "policy is paused (disabled)");

  // 1. Chain / registry / feature identity.
  if (intent.chainId !== policy.chainId)
    add("WRONG_CHAIN", `intent chain ${intent.chainId} != ${policy.chainId}`);
  if (lower(intent.registry) !== lower(policy.registry)) {
    add("REGISTRY_MISMATCH", "intent registry != policy registry");
  }
  if (intent.feature !== policy.feature)
    add("FEATURE_MISMATCH", `intent feature != ${policy.feature}`);

  // 2. Token pair + direction.
  if (!pairAllowed(policy, intent.sellToken, intent.buyToken)) {
    add("TOKEN_NOT_ALLOWED", "sell/buy token pair or direction is not allowed");
  }

  // 3. Amounts + cap.
  if (intent.sellAmountRaw <= 0n || intent.minBuyAmountRaw <= 0n) {
    add("AMOUNT_INVALID", "sell and minimum-buy amounts must be positive");
  }
  const cap = policy.maxSellAmountRawByToken[lower(intent.sellToken)] ?? null;
  if (cap === null) {
    add("AMOUNT_LIMIT_UNRESOLVED", "per-token maximum sell amount is unresolved");
  } else if (intent.sellAmountRaw > cap) {
    add("AMOUNT_EXCEEDS_LIMIT", "sell amount exceeds the per-token maximum");
  }

  // 4. tx.value (ERC-20 WETH settlement => must be exactly zero).
  if (intent.txValue !== 0n)
    add("NONZERO_TX_VALUE", "tx.value must be zero for ERC-20 WETH settlement");

  // 5. Fees.
  if (intent.platformFeeBps > policy.maxPlatformFeeBps || intent.platformFeeBps < 0) {
    add("FEE_POLICY_VIOLATION", "platform fee exceeds the policy maximum");
  }
  if (intent.integratorFeePresent && !policy.integratorFeeAllowed) {
    add("FEE_POLICY_VIOLATION", "an integrator fee is present but forbidden by policy");
  }

  // 6. Slippage.
  if (intent.slippageBps < 0 || intent.slippageBps > policy.maxSlippageBps) {
    add("SLIPPAGE_POLICY_VIOLATION", "slippage exceeds the policy maximum");
  }

  // 7. Calldata hash present + well-formed (complete calldata is never carried).
  if (!isHash32(intent.calldataHash)) {
    add("CALLDATA_HASH_INVALID", "calldata hash is missing or malformed");
  }

  // 8. Selector must be EXPLICITLY approved. A single observed quote never approves it.
  const selectorApproved =
    isSelector(intent.selector) &&
    policy.allowedSelectors.map(lower).includes(lower(intent.selector));
  if (!selectorApproved) add("SELECTOR_UNAPPROVED", "selector is not in the approved allow-list");

  // 9. Taker: policy must resolve a real, non-dead taker and the intent must match it.
  const policyTaker = policy.finalTaker;
  if (
    policyTaker === null ||
    !isAddress(policyTaker) ||
    lower(policyTaker) === ZERO_ADDRESS ||
    lower(policyTaker) === DEAD_ADDRESS
  ) {
    add("TAKER_UNRESOLVED", "final taker is unresolved, zero, or the dead-address canary");
  } else if (!isAddress(intent.taker) || lower(intent.taker) !== lower(policyTaker)) {
    add("TAKER_MISMATCH", "intent taker does not equal the policy final taker");
  }
  if (
    isAddress(intent.taker) &&
    (lower(intent.taker) === DEAD_ADDRESS || lower(intent.taker) === ZERO_ADDRESS)
  ) {
    add("TAKER_UNRESOLVED", "intent taker is the zero or dead-address canary");
  }

  // 10. Registry observation (separate from the quote); dated + fresh + target == current router.
  if (registryObservation === null) {
    add("REGISTRY_OBSERVATION_MISSING", "no registry observation supplied");
  } else {
    if (
      !isAddress(registryObservation.registry) ||
      lower(registryObservation.registry) !== lower(policy.registry)
    ) {
      add("REGISTRY_MISMATCH", "registry observation address != policy registry");
    }
    if (registryObservation.feature !== policy.feature) {
      add("FEATURE_MISMATCH", "registry observation feature != policy feature");
    }
    const rec = reconcileRegistryTarget(intent.expectedTarget, registryObservation);
    if (rec.code === "FEATURE_PAUSED") add("REGISTRY_PAUSED", "registry feature is paused");
    else if (rec.code === "MISSING_REGISTRY_FIELD")
      add("REGISTRY_OBSERVATION_MISSING", "registry field missing");
    else if (rec.code !== "OK")
      add("ROUTER_MISMATCH", `target does not equal the current router (${rec.code})`);
    // Dated + fresh check. Undated, no policy age, or too-old all fail closed as STALE.
    const obsTime = registryObservation.observationTimeUtc;
    const dated = registryObservation.blockNumber != null || obsTime != null;
    if (!dated) {
      add("REGISTRY_OBSERVATION_STALE", "registry observation is undated (cannot prove freshness)");
    } else if (policy.maxRegistryObservationAgeSec === null) {
      add("REGISTRY_OBSERVATION_STALE", "policy max registry observation age is unresolved");
    } else if (obsTime === null) {
      add(
        "REGISTRY_OBSERVATION_STALE",
        "registry observation age is unverifiable offline (no timestamp)",
      );
    } else {
      const obsSec = Math.floor(Date.parse(obsTime) / 1000);
      if (
        !Number.isFinite(obsSec) ||
        nowSec - obsSec > policy.maxRegistryObservationAgeSec ||
        obsSec > nowSec
      ) {
        add("REGISTRY_OBSERVATION_STALE", "registry observation is stale or future-dated");
      }
    }
  }

  // 11. Price guard (D-22B). No approved production source => fail closed.
  if (policy.allowedPriceSources.length === 0 || policy.maxPriceObservationAgeSec === null) {
    add("PRICE_SOURCE_UNRESOLVED", "no approved production price source / age limit");
  } else if (priceObservation === null) {
    add("PRICE_SOURCE_UNRESOLVED", "no price observation supplied");
  } else if (!policy.allowedPriceSources.map(lower).includes(lower(priceObservation.source))) {
    add("PRICE_SOURCE_UNRESOLVED", "price observation source is not approved");
  } else {
    if (
      lower(priceObservation.sellToken) !== lower(intent.sellToken) ||
      lower(priceObservation.buyToken) !== lower(intent.buyToken)
    ) {
      add("PRICE_PAIR_MISMATCH", "price observation pair/direction does not match the intent");
    } else if (priceObservation.refSellAmountRaw <= 0n || priceObservation.refBuyAmountRaw <= 0n) {
      add("PRICE_SOURCE_UNRESOLVED", "price observation reference amounts are non-positive");
    } else {
      const t = priceObservation.observedTimeSec;
      if (t === null || nowSec - t > policy.maxPriceObservationAgeSec || t > nowSec) {
        add("PRICE_OBSERVATION_STALE", "price observation is stale, future-dated, or untimed");
      } else {
        // Deviation: reject a minimum return that exceeds the trusted reference by more than the cap.
        // refBuyForSell = floor(refBuy * sellAmount / refSell); permittedMax = floor(refBuyForSell*(10000+dev)/10000).
        // Floor rounding keeps the ceiling conservative (rejects more).
        const refBuyForSell = floorDiv(
          priceObservation.refBuyAmountRaw * intent.sellAmountRaw,
          priceObservation.refSellAmountRaw,
        );
        const permittedMax = floorDiv(
          refBuyForSell * BigInt(10000 + policy.maxPriceDeviationBps),
          10000n,
        );
        if (intent.minBuyAmountRaw > permittedMax) {
          add(
            "PRICE_DEVIATION_EXCEEDED",
            "minimum buy amount exceeds the permitted deviation from the reference",
          );
        }
      }
    }
  }

  // 12. Replay + expiry.
  if (intent.deadlineSec <= 0) {
    add("MISSING_DEADLINE", "intent has no deadline");
  } else {
    const lifetime = intent.deadlineSec - intent.createdAtSec;
    if (lifetime <= 0) add("INTENT_EXPIRED", "intent deadline is not after its creation time");
    else if (lifetime > policy.maxIntentLifetimeSec) {
      add("INTENT_LIFETIME_EXCESSIVE", "intent lifetime exceeds the policy maximum");
    }
    if (nowSec > intent.deadlineSec) add("INTENT_EXPIRED", "intent deadline is in the past");
  }
  const recomputed = computeIntentDigest(intent);
  if (lower(recomputed) !== lower(intent.intentDigest)) {
    add("DIGEST_MISMATCH", "intent digest does not match its fields");
  }
  if (replayStore.isDigestConsumed(intent.intentDigest))
    add("REPLAY_DETECTED", "intent digest already consumed");
  if (isAddress(intent.taker) && replayStore.isNonceUsed(intent.taker, intent.nonce)) {
    add("NONCE_REUSED", "taker nonce already used");
  }

  if (replayStore instanceof InMemoryReplayStore) {
    warnings.push(
      "replay store is the NON-PRODUCTION in-memory implementation (tests/offline only)",
    );
  }

  const remainingProductionGates = computeRemainingGates(policy);
  const ready = failures.length === 0;
  const status: GuardStatus = ready
    ? "READY_OFFLINE_ONLY"
    : (failures[0]?.status ?? "POLICY_INCOMPLETE");

  const sanitizedPlan: SettlementPlan | null = ready
    ? {
        guardVersion: policy.guardVersion,
        intentDigest: intent.intentDigest,
        taker: intent.taker,
        target: intent.expectedTarget,
        sellToken: intent.sellToken,
        buyToken: intent.buyToken,
        sellAmountRaw: intent.sellAmountRaw.toString(),
        minBuyAmountRaw: intent.minBuyAmountRaw.toString(),
        deadlineSec: intent.deadlineSec,
        steps: [
          {
            order: 1,
            action: "REVERIFY_REGISTRY",
            detail:
              "re-read the current feature-2 router at execution time; abort on mismatch/paused",
          },
          {
            order: 2,
            action: "APPROVE_EXACT",
            detail: "approve exactly the sell amount to the verified current router",
          },
          {
            order: 3,
            action: "CALL_ROUTER",
            detail: "call ONLY the verified current feature-2 router with the intent's calldata",
          },
          {
            order: 4,
            action: "REQUIRE_MIN_BUY",
            detail: "require the received buy-token delta >= the intended minimum",
          },
          {
            order: 5,
            action: "CLEAR_ALLOWANCE",
            detail: "reset the router allowance back to zero",
          },
          {
            order: 6,
            action: "CONSUME_INTENT",
            detail: "mark the intent digest + nonce consumed atomically",
          },
          {
            order: 7,
            action: "RECORD_EVIDENCE",
            detail: "record sanitized execution evidence (no calldata, no secrets)",
          },
        ],
        atomicity:
          "A future on-chain executor MUST revert the ENTIRE operation if the router call, the minimum-return check, the allowance clearing, or the replay-state update fails.",
        disclaimer:
          "READY_OFFLINE_ONLY is NOT authorization to execute. No signing, approval, encoding, submission, or broadcast is performed. D-24 stands.",
      }
    : null;

  return {
    ready,
    status,
    failures,
    warnings,
    validatedPolicy: {
      guardVersion: policy.guardVersion,
      chainId: policy.chainId,
      registry: policy.registry,
      feature: policy.feature,
      selectorAllowListSize: policy.allowedSelectors.length,
      finalTakerResolved:
        policy.finalTaker !== null &&
        isAddress(policy.finalTaker) &&
        lower(policy.finalTaker) !== ZERO_ADDRESS &&
        lower(policy.finalTaker) !== DEAD_ADDRESS,
      priceSourcesResolved:
        policy.allowedPriceSources.length > 0 && policy.maxPriceObservationAgeSec !== null,
      registryAgeLimitResolved: policy.maxRegistryObservationAgeSec !== null,
      priceAgeLimitResolved: policy.maxPriceObservationAgeSec !== null,
      paused: policy.paused,
    },
    sanitizedPlan,
    remainingProductionGates,
  };
}

/**
 * Replay the sanitized QEX-1 evidence through the PRODUCTION CANDIDATE policy to demonstrate why current
 * production readiness is false. Consumes an already-parsed evidence object (the caller reads the file —
 * this function performs NO filesystem, network, env, or key access) and never prints calldata/secrets.
 * The QEX-1 evidence carries no calldata hash (only a byte length), the taker was the dead-address canary,
 * and the registry snapshot is undated — all of which fail closed, alongside the empty production policy.
 */
export function replayQex1Evidence(
  evidence: unknown,
  nowSec: number,
): { readiness: ReadinessResult; distinctFailureStatuses: readonly GuardStatus[] } {
  const ev = (evidence ?? {}) as Record<string, unknown>;
  const q = (ev.originalQuoteResponse ?? {}) as Record<string, unknown>;
  const req = (ev.request ?? {}) as Record<string, unknown>;
  const reg = (ev.registryObservation ?? {}) as Record<string, unknown>;

  const intent = buildIntent({
    chainId: 4663,
    registry: OFFICIAL_REGISTRY,
    feature: 2,
    sellToken: String(req.sellToken ?? WETH),
    buyToken: String(req.buyToken ?? NVDA),
    sellAmountRaw: BigInt(String(q.sellAmountRaw ?? "0")),
    minBuyAmountRaw: BigInt(String(q.minBuyAmountRaw ?? "0")),
    expectedTarget: String(q.txTarget ?? ZERO_ADDRESS),
    selector: String(q.selector ?? "0x00000000"),
    calldataHash: null, // QEX-1 evidence stores only the selector + byte length — no calldata hash
    txValue: BigInt(String(q.txValue ?? "0")),
    platformFeeBps: Number(q.platformFeeTotalBps ?? 0),
    integratorFeePresent: req.integratorFeeRequested === true,
    slippageBps: Number(req.slippageBpsUsedForEvaluation ?? 0),
    taker: String(req.taker ?? ZERO_ADDRESS), // dead-address canary in the evidence
    nonce: 0n,
    createdAtSec: 0,
    deadlineSec: 0, // evidence quote expiry was null => no deadline
  });

  const registryObservation: RegistryFeatureObservation = {
    registry: String(reg.registry ?? OFFICIAL_REGISTRY),
    feature: Number(reg.feature ?? 2),
    currentRouter: String(reg.currentRouter ?? ZERO_ADDRESS),
    previousRouter: String(reg.previousRouter ?? ZERO_ADDRESS),
    nextRouter: String(reg.nextRouter ?? ZERO_ADDRESS),
    paused: reg.paused === true,
    blockNumber: typeof reg.blockNumber === "number" ? reg.blockNumber : null,
    observationTimeUtc: typeof reg.observationTimeUtc === "string" ? reg.observationTimeUtc : null,
  };

  const readiness = evaluateGuardedSettlement({
    policy: productionCandidatePolicy(),
    intent,
    registryObservation,
    priceObservation: null,
    replayStore: new InMemoryReplayStore(),
    nowSec,
  });
  const distinctFailureStatuses = [...new Set(readiness.failures.map((f) => f.status))];
  return { readiness, distinctFailureStatuses };
}

// ---------------------------------------------------------------------------------------------------
// On-chain digest parity (TASK 10K-4).
// This mirrors GuardedSettlementExecutor's on-chain domain-separated intent digest
// (`keccak256(abi.encode(DigestInput))`) so TypeScript and Solidity produce byte-identical digests.
// DigestInput is an all-static struct, so `abi.encode(struct)` equals the concatenation of its encoded
// fields; encoding the 17 fields individually via viem reproduces it exactly. This is distinct from the
// off-chain `computeIntentDigest` above (a SHA-256 canonical-string digest for the offline model).
// ---------------------------------------------------------------------------------------------------

/** keccak256("BPS-GUARDED-SETTLEMENT/1") — equals the Solidity `GUARD_DOMAIN` constant. */
export const ONCHAIN_GUARD_DOMAIN = keccak256(stringToHex("BPS-GUARDED-SETTLEMENT/1"));

export interface OnchainDigestInput {
  readonly chainId: number;
  readonly executor: `0x${string}`;
  readonly registry: `0x${string}`;
  readonly feature: number;
  readonly target: `0x${string}`;
  readonly selector: `0x${string}`; // bytes4
  readonly sellToken: `0x${string}`;
  readonly buyToken: `0x${string}`;
  readonly sellAmountRaw: bigint;
  readonly minBuyAmountRaw: bigint;
  readonly platformFeeBps: number;
  readonly slippageBps: number;
  readonly taker: `0x${string}`;
  readonly nonce: bigint;
  readonly deadlineSec: bigint;
  readonly calldataHash: `0x${string}`; // bytes32
}

// ---------------------------------------------------------------------------------------------------
// Opaque quote-validation boundary (TASK 10K-5).
// The application validates an ALREADY-FETCHED Rialto allowance-mode quote before preparing a guarded
// intent. It NEVER modifies or re-encodes `tx.data` and NEVER logs/returns the complete calldata — only
// its keccak256 hash enters the authorized intent. This is a pure, offline check (no network, no key).
// ---------------------------------------------------------------------------------------------------

export const OPAQUE_SETTLEMENT_SELECTOR = "0x77963966"; // Rialto feature-2 allowance-settlement selector

export interface OpaqueQuote {
  readonly settlement: string;
  readonly txTo: string;
  readonly txValue: string;
  readonly selector: string;
  readonly callData: `0x${string}`; // full calldata — hashed here, never logged/returned
  readonly sellToken: string;
  readonly buyToken: string;
  readonly taker: string;
  readonly sellAmountRaw: bigint;
  readonly minBuyAmountRaw: bigint;
  readonly platformFeeBps: number;
  readonly integratorFeePresent: boolean;
  readonly allowanceSpender: string | null;
  readonly expirySec: number | null;
}

export interface OpaqueQuoteContext {
  readonly chainId: number;
  readonly resolvedRouter: string; // registry.ownerOf(2)
  readonly executor: string; // guarded executor (= taker + recipient)
  readonly weth: string;
  readonly nvda: string;
  readonly maxPlatformFeeBps: number;
  readonly nowSec: number;
  readonly intentSellAmountRaw: bigint;
  readonly intentMinBuyAmountRaw: bigint;
}

export interface OpaqueQuoteValidation {
  readonly ok: boolean;
  readonly failures: readonly string[];
  /** keccak256(callData) — the ONLY calldata-derived value that may enter the authorized intent. */
  readonly calldataHash: `0x${string}`;
}

/**
 * Validate an opaque allowance-mode quote for building a guarded intent. Pure/offline; never modifies
 * `tx.data`, never logs the complete calldata. Returns the calldata HASH (safe) plus a failure list.
 */
export function validateOpaqueQuoteForIntent(
  q: OpaqueQuote,
  ctx: OpaqueQuoteContext,
): OpaqueQuoteValidation {
  const failures: string[] = [];
  const eq = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

  if (ctx.chainId !== 4663) failures.push("WRONG_CHAIN");
  if (q.settlement !== "allowance") failures.push("SETTLEMENT_NOT_ALLOWANCE");
  if (!eq(q.txTo, ctx.resolvedRouter)) failures.push("TX_TO_NOT_ROUTER");
  if (q.allowanceSpender !== null && !eq(q.allowanceSpender, ctx.resolvedRouter)) {
    failures.push("ALLOWANCE_SPENDER_NOT_ROUTER");
  }
  if (q.txValue !== "0") failures.push("NONZERO_TX_VALUE");
  if (!eq(q.selector, OPAQUE_SETTLEMENT_SELECTOR)) failures.push("WRONG_SELECTOR");
  if (!eq(q.callData.slice(0, 10), OPAQUE_SETTLEMENT_SELECTOR))
    failures.push("CALLDATA_SELECTOR_MISMATCH");
  if (!eq(q.sellToken, ctx.weth)) failures.push("SELL_TOKEN_NOT_WETH");
  if (!eq(q.buyToken, ctx.nvda)) failures.push("BUY_TOKEN_NOT_NVDA");
  if (!eq(q.taker, ctx.executor)) failures.push("TAKER_NOT_EXECUTOR");
  if (q.sellAmountRaw <= 0n || q.sellAmountRaw !== ctx.intentSellAmountRaw)
    failures.push("SELL_AMOUNT_MISMATCH");
  if (q.minBuyAmountRaw <= 0n || q.minBuyAmountRaw !== ctx.intentMinBuyAmountRaw) {
    failures.push("MIN_BUY_MISMATCH");
  }
  if (q.platformFeeBps < 0 || q.platformFeeBps > ctx.maxPlatformFeeBps)
    failures.push("PLATFORM_FEE_TOO_HIGH");
  if (q.integratorFeePresent) failures.push("INTEGRATOR_FEE_PRESENT");
  if (q.expirySec === null || q.expirySec <= ctx.nowSec) failures.push("QUOTE_EXPIRED");

  return { ok: failures.length === 0, failures, calldataHash: keccak256(q.callData) };
}

/** Compute the on-chain guarded-settlement intent digest exactly as the Solidity executor does. */
export function computeOnchainIntentDigest(i: OnchainDigestInput): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
        { type: "bytes4" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint16" },
        { type: "uint16" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        ONCHAIN_GUARD_DOMAIN,
        BigInt(i.chainId),
        i.executor,
        i.registry,
        BigInt(i.feature),
        i.target,
        i.selector,
        i.sellToken,
        i.buyToken,
        i.sellAmountRaw,
        i.minBuyAmountRaw,
        i.platformFeeBps,
        i.slippageBps,
        i.taker,
        i.nonce,
        i.deadlineSec,
        i.calldataHash,
      ],
    ),
  );
}
