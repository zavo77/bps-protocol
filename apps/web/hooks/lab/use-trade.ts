"use client";
// Client trade state machine for one lab market.
//
// Users pay/receive ETH / WETH / USDG. The market's RWA anchor is an INTERNAL
// routing token — never something the user holds — and is offered only as an
// "advanced" pay/receive option. A trade is one or more legs executed strictly
// in order:
//
//   buy  : pay ETH/WETH/USDG  → receive the market token
//   sell : sell the market token → receive ETH/WETH/USDG
//
// Per leg (see prepareAndTrade):
//   (a) wrong chain          → switch to Robinhood Chain (4663)
//   (b) sign prepare-trade   → EIP-191 envelope via useSignedRequest
//   (c) POST /api/lab/trade/prepare-leg (server re-quotes; client calldata is never trusted)
//   (d) approvals            → ERC20 approve(spender, maxUint256); Permit2.approve(token, router, uint160 max, uint48 exp)
//                              then re-sign + re-prepare for a clean simulation
//   (e) send transaction     → wallet signs {to,data,value,gas,chainId:4663}
//   (f) waitForTransactionReceipt → success/failure
//
// For a COMPOSED route (2 wallet actions via the anchor) the quote's leg 2 is an
// ESTIMATE: after leg 1 confirms we read the actual anchor received (balanceOf
// delta) and re-prepare leg 2 with that exact amount. Every prepare-leg call
// needs a FRESH signed envelope (server enforces single-use replay protection).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  erc20Abi,
  formatUnits,
  isAddress,
  maxUint256,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  CHAIN_ID,
  NATIVE_ETH,
  PAYMENT_TOKENS,
  PERMIT2_ABI,
  type RouteLeg,
  type UserRouteQuote,
} from "@bps/launch-lab";
import { LabApiError, errorMessage, labFetch } from "./api";
import {
  clearPendingTrade,
  isQuoteExpired,
  loadPendingTrade,
  resumePrompt,
  savePendingTrade,
  type PendingComposedTrade,
} from "./trade-recovery";
import { useSignedRequest } from "./use-signed-request";

export type TradeSide = "buy" | "sell";

/** Fallback launch-token decimals until the on-chain read resolves (DopplerERC20V1 = 18). */
export const TRADE_DECIMALS = 18;

/** Price-impact display/warn threshold: 3.00% = 300 bps. */
export const PRICE_IMPACT_WARN_BPS = 300;

const MAX_UINT160 = 2n ** 160n - 1n;
const PERMIT2_EXPIRATION_SECONDS = 30 * 24 * 60 * 60; // ~30 days

export type TradeStatus =
  | "idle"
  | "quoting"
  | "quoted"
  | "no-route"
  | "needs-approval"
  | "approving"
  | "simulating"
  | "awaiting-signature"
  | "pending"
  | "success"
  | "failure"
  | "wrong-chain"
  | "insufficient-balance";

/** A user-selectable pay/receive asset. The anchor is flagged `advanced`. */
export interface TradeToken {
  symbol: string;
  name: string;
  /** NATIVE_ETH sentinel for native ETH. */
  address: Address;
  decimals: number;
  native: boolean;
  /** true = market anchor (internal routing token), offered only under "advanced". */
  advanced: boolean;
}

/** The market's RWA anchor, resolved from the market snapshot. */
export interface AnchorInput {
  symbol: string;
  address: Address;
  decimals: number;
}

export interface UseTradeOptions {
  onTraded?: (() => void) | undefined;
  anchor?: AnchorInput | null | undefined;
  /** Launch-token symbol, persisted with a partial composed trade for resume copy. */
  marketSymbol?: string | null | undefined;
}

/** POST /api/lab/trade/prepare-leg request payload (exactly the server schema keys). */
interface LegPayload {
  kind: RouteLeg["kind"];
  marketToken: string;
  inputToken: Address;
  outputToken: Address;
  exactInputAmount: string;
  slippageBps: number;
  taker: Address;
}

interface PrepareLegResponse {
  leg: {
    kind: RouteLeg["kind"];
    inputToken: Address;
    outputToken: Address;
    exactInputAmount: string;
    expectedOutputWei: string;
    minimumOutputWei: string;
  };
  simulation: "ok" | "reverted" | "skipped-pending-approval";
  approvals: {
    erc20ApprovalNeeded: boolean;
    erc20ApprovalTarget: Address | null;
    permit2ApprovalNeeded: boolean;
    permit2SpenderTarget: Address | null;
  };
  transaction: {
    chainId: number;
    from: Address;
    to: Address;
    data: Hex;
    value: string;
    gas: string;
  };
  staleAfter: number;
}

export interface UseTrade {
  side: TradeSide;
  amount: string;
  slippageBps: number;
  status: TradeStatus;
  quote: UserRouteQuote | null;
  txHash: Hex | null;
  legHashes: Hex[];
  legIndex: number;
  legCount: number;
  error: string | null;
  isConnected: boolean;
  wrongChain: boolean;
  amountWei: bigint;
  /** Standard pay/receive options (ETH / WETH / USDG). */
  payTokens: TradeToken[];
  /** The market anchor as an advanced-only option, or null. */
  anchorToken: TradeToken | null;
  /** Currently selected pay/receive asset. */
  payToken: TradeToken;
  /** Decimals of the asset the amount field is denominated in (buy: pay; sell: market token). */
  inputDecimals: number;
  /** Decimals of the received asset. */
  outputDecimals: number;
  /** Balance (wei) of the input asset for the connected wallet, or null. */
  inputBalanceWei: bigint | null;
  insufficient: boolean;
  setSide: (side: TradeSide) => void;
  setPayToken: (token: TradeToken) => void;
  setAmount: (amount: string) => void;
  setSlippageBps: (bps: number) => void;
  setMax: () => Promise<void>;
  setInputFraction: (percent: number) => Promise<void>;
  getQuote: () => Promise<void>;
  prepareAndTrade: () => Promise<Hex | null>;
  switchToChain: () => Promise<void>;
  reset: () => void;
  /** A partially-completed composed trade for this market/wallet awaiting its final leg. */
  pendingRecovery: PendingComposedTrade | null;
  /** Resume banner copy ({heading, action}) when a pending trade exists, else null. */
  pendingPrompt: { heading: string; action: string } | null;
  /** True when the persisted quote window elapsed — resume re-prepares fresh regardless. */
  pendingExpired: boolean;
  /** Execute ONLY the outstanding second leg from the ACTUAL persisted anchor amount. */
  resumePendingTrade: () => Promise<Hex | null>;
  /** Discard the pending trade; the user keeps the anchor already received. */
  cancelPendingTrade: () => void;
}

function parseAmountWei(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (trimmed === "") return 0n;
  try {
    return parseUnits(trimmed, decimals);
  } catch {
    return 0n;
  }
}

export function useTrade(marketToken: string, options?: UseTradeOptions): UseTrade {
  const { onTraded, anchor, marketSymbol } = options ?? {};
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const signRequest = useSignedRequest();

  const payTokens = useMemo<TradeToken[]>(
    () => PAYMENT_TOKENS.map((t) => ({ ...t, advanced: false })),
    [],
  );
  const anchorToken = useMemo<TradeToken | null>(() => {
    if (!anchor || !isAddress(anchor.address)) return null;
    return {
      symbol: anchor.symbol,
      name: anchor.symbol,
      address: anchor.address,
      decimals: anchor.decimals,
      native: false,
      advanced: true,
    };
  }, [anchor]);

  const [side, setSideState] = useState<TradeSide>("buy");
  const [payToken, setPayTokenState] = useState<TradeToken>(() => payTokens[0]!); // ETH default
  const [amount, setAmountState] = useState("");
  const [slippageBps, setSlippageBpsState] = useState(100);
  const [tokenDecimals, setTokenDecimals] = useState(TRADE_DECIMALS);
  const [status, setStatus] = useState<TradeStatus>("idle");
  const [quote, setQuote] = useState<UserRouteQuote | null>(null);
  const [legIndex, setLegIndex] = useState(0);
  const [legCount, setLegCount] = useState(0);
  const [legHashes, setLegHashes] = useState<Hex[]>([]);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputBalanceWei, setInputBalanceWei] = useState<bigint | null>(null);
  const [pendingRecovery, setPendingRecovery] = useState<PendingComposedTrade | null>(null);
  // Re-entrancy guard: exactly ONE trade execution (full flow or resume) may be
  // in flight at a time — React state (`busy`) lags async work and cannot gate this.
  const executionInFlight = useRef(false);

  const wrongChain = isConnected && chainId !== CHAIN_ID;

  // Detect a partial composed trade for this wallet/market on mount + when they change.
  useEffect(() => {
    if (!address || !isAddress(marketToken)) {
      setPendingRecovery(null);
      return;
    }
    setPendingRecovery(loadPendingTrade(address, marketToken));
  }, [address, marketToken]);

  const pendingPrompt = pendingRecovery ? resumePrompt(pendingRecovery) : null;
  const pendingExpired = pendingRecovery ? isQuoteExpired(pendingRecovery) : false;

  // Buy denominates the amount in the pay token; sell denominates it in the market token.
  const inputDecimals = side === "buy" ? payToken.decimals : tokenDecimals;
  const outputDecimals = side === "buy" ? tokenDecimals : payToken.decimals;
  const amountWei = useMemo(() => parseAmountWei(amount, inputDecimals), [amount, inputDecimals]);
  const insufficient = inputBalanceWei !== null && amountWei > 0n && amountWei > inputBalanceWei;

  // Changing inputs invalidates a stale quote so the UI can't trade on it.
  const invalidateQuote = useCallback(() => {
    setQuote(null);
    setTxHash(null);
    setLegHashes([]);
    setLegIndex(0);
    setLegCount(0);
    setError(null);
    setStatus("idle");
  }, []);

  const setSide = useCallback(
    (next: TradeSide) => {
      setSideState(next);
      invalidateQuote();
    },
    [invalidateQuote],
  );

  const setPayToken = useCallback(
    (token: TradeToken) => {
      setPayTokenState(token);
      invalidateQuote();
    },
    [invalidateQuote],
  );

  const setAmount = useCallback(
    (next: string) => {
      setAmountState(next);
      invalidateQuote();
    },
    [invalidateQuote],
  );

  const setSlippageBps = useCallback(
    (bps: number) => {
      setSlippageBpsState(bps);
      invalidateQuote();
    },
    [invalidateQuote],
  );

  // Read the launch-token decimals once (default 18 until it resolves).
  useEffect(() => {
    if (!publicClient || !isAddress(marketToken)) return;
    let active = true;
    void publicClient
      .readContract({
        address: marketToken as Address,
        abi: erc20Abi,
        functionName: "decimals",
      })
      .then((d) => {
        if (active) setTokenDecimals(Number(d));
      })
      .catch(() => {
        /* keep the 18-decimal fallback */
      });
    return () => {
      active = false;
    };
  }, [publicClient, marketToken]);

  /** Balance (wei) of a token for the connected wallet — native via getBalance, ERC-20 via balanceOf. */
  const readRawBalance = useCallback(
    async (token: { address: Address; native: boolean }): Promise<bigint | null> => {
      if (!publicClient || !address) return null;
      try {
        if (token.native) return await publicClient.getBalance({ address });
        return (await publicClient.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;
      } catch {
        return null;
      }
    },
    [publicClient, address],
  );

  const inputAsset = useMemo<{ address: Address; native: boolean }>(
    () =>
      side === "buy"
        ? { address: payToken.address, native: payToken.native }
        : { address: marketToken as Address, native: false },
    [side, payToken, marketToken],
  );

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setInputBalanceWei(null);
      return;
    }
    setInputBalanceWei(await readRawBalance(inputAsset));
  }, [address, inputAsset, readRawBalance]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const setMax = useCallback(async () => {
    const bal = await readRawBalance(inputAsset);
    if (bal === null) return;
    setAmount(formatUnits(bal, inputDecimals));
  }, [readRawBalance, inputAsset, inputDecimals, setAmount]);

  const setInputFraction = useCallback(
    async (percent: number) => {
      const bal = await readRawBalance(inputAsset);
      if (bal === null) return;
      const clamped = Math.max(0, Math.min(100, Math.trunc(percent)));
      const part = (bal * BigInt(clamped)) / 100n;
      setAmount(formatUnits(part, inputDecimals));
    },
    [readRawBalance, inputAsset, inputDecimals, setAmount],
  );

  const switchToChain = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: CHAIN_ID });
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [switchChainAsync]);

  const mapTradeError = useCallback((e: unknown) => {
    if (e instanceof LabApiError) {
      switch (e.code) {
        case "NO_ROUTE_FOR_PAYMENT_TOKEN":
        case "ROUTE_UNAVAILABLE":
        case "NOT_A_LAB_MARKET":
        case "UNSUPPORTED_PAYMENT_TOKEN":
        case "NO_POOL_LIQUIDITY":
        case "QUOTER_REVERTED":
          setStatus("no-route");
          break;
        case "INSUFFICIENT_BALANCE":
          setStatus("insufficient-balance");
          break;
        default:
          setStatus("failure");
      }
    } else {
      setStatus("failure");
    }
    setError(errorMessage(e));
  }, []);

  const getQuote = useCallback(async () => {
    setError(null);
    setTxHash(null);
    setLegHashes([]);
    if (!address) {
      setError("Connect a wallet to fetch a quote.");
      return;
    }
    const wei = parseAmountWei(amount, inputDecimals);
    if (wei <= 0n) {
      setError("Enter an amount greater than zero.");
      return;
    }
    // buy: pay token → market token; sell: market token → pay token.
    // Native ETH uses the NATIVE_ETH sentinel (already payToken.address for ETH).
    const inputToken = side === "buy" ? payToken.address : (marketToken as Address);
    const outputToken = side === "buy" ? (marketToken as Address) : payToken.address;
    setStatus("quoting");
    try {
      const data = await labFetch<UserRouteQuote>("/api/lab/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          marketToken,
          side,
          inputToken,
          outputToken,
          exactInputAmount: wei.toString(),
          taker: address,
          slippageBps,
        }),
      });
      setQuote(data);
      setStatus(data.legs.length === 0 ? "no-route" : "quoted");
    } catch (e) {
      mapTradeError(e);
    }
  }, [address, amount, inputDecimals, side, payToken, marketToken, slippageBps, mapTradeError]);

  const signAndPrepareLeg = useCallback(
    async (payload: LegPayload): Promise<PrepareLegResponse> => {
      setStatus("awaiting-signature");
      const envelope = await signRequest("prepare-trade", payload);
      setStatus("simulating");
      return labFetch<PrepareLegResponse>("/api/lab/trade/prepare-leg", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ envelope, payload }),
      });
    },
    [signRequest],
  );

  const ensureChain = useCallback(async () => {
    if (chainId !== CHAIN_ID) {
      setStatus("wrong-chain");
      await switchChainAsync({ chainId: CHAIN_ID });
    }
  }, [chainId, switchChainAsync]);

  // Execute exactly ONE leg: sign+prepare, run approvals, re-prepare for a clean
  // simulation, send, and await the receipt. Returns the confirmed hash, or null
  // after setting a failure status. Throws only on unexpected errors (caught by
  // the caller). Used by both the full flow and single-leg composed recovery.
  const executeLeg = useCallback(
    async (payload: LegPayload, legNo: number, legTotal: number): Promise<Hex | null> => {
      if (!publicClient) {
        setStatus("failure");
        setError("No RPC client available for confirmation.");
        return null;
      }
      setLegCount(legTotal);
      setLegIndex(legNo);

      // (b)+(c) sign + prepare (server re-quotes; client calldata is never trusted).
      let prep = await signAndPrepareLeg(payload);

      // (d) approvals in the wallet, then re-prepare for a clean simulation.
      const nativeLegInput = payload.inputToken.toLowerCase() === NATIVE_ETH.toLowerCase();
      let approved = false;
      if (
        !nativeLegInput &&
        prep.approvals.erc20ApprovalNeeded &&
        prep.approvals.erc20ApprovalTarget
      ) {
        setStatus("approving");
        const approveHash = await writeContractAsync({
          address: payload.inputToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [prep.approvals.erc20ApprovalTarget, maxUint256],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        approved = true;
      }
      if (
        !nativeLegInput &&
        prep.approvals.permit2ApprovalNeeded &&
        prep.approvals.permit2SpenderTarget &&
        prep.approvals.erc20ApprovalTarget
      ) {
        setStatus("approving");
        // Permit2 expiration is a uint48 → typed as `number` by abitype.
        const expiration = Math.floor(Date.now() / 1000) + PERMIT2_EXPIRATION_SECONDS;
        const permitHash = await writeContractAsync({
          // erc20ApprovalTarget is the Permit2 contract (leg.allowanceTarget).
          address: prep.approvals.erc20ApprovalTarget,
          abi: PERMIT2_ABI,
          functionName: "approve",
          args: [payload.inputToken, prep.approvals.permit2SpenderTarget, MAX_UINT160, expiration],
        });
        await publicClient.waitForTransactionReceipt({ hash: permitHash });
        approved = true;
      }
      if (approved) prep = await signAndPrepareLeg(payload);

      // Stale leg quote → stop; the user re-quotes and reviews fresh numbers.
      if (Date.now() > prep.staleAfter) {
        setStatus("failure");
        setError("Leg quote expired before signing — re-quote and retry.");
        return null;
      }

      // NEVER request a wallet signature without a successful exact-calldata
      // simulation. If the server still reports the simulation as skipped
      // (e.g. an allowance read lagging the just-confirmed approval), stop.
      if (prep.simulation !== "ok") {
        setStatus("failure");
        setError("The transaction was not successfully simulated — retry in a moment.");
        return null;
      }

      // (e) send
      setStatus("awaiting-signature");
      const hash = await sendTransactionAsync({
        to: prep.transaction.to,
        data: prep.transaction.data,
        value: BigInt(prep.transaction.value),
        gas: BigInt(prep.transaction.gas),
        chainId: CHAIN_ID,
      });
      setTxHash(hash);
      setStatus("pending");

      // (f) receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setStatus("failure");
        setError("Leg transaction reverted on-chain.");
        return null;
      }
      return hash;
    },
    [publicClient, signAndPrepareLeg, writeContractAsync, sendTransactionAsync],
  );

  const prepareAndTrade = useCallback(async (): Promise<Hex | null> => {
    if (executionInFlight.current) return null; // one execution at a time
    setError(null);
    setTxHash(null);
    setLegHashes([]);
    setLegIndex(0);
    setLegCount(0);
    if (!address) {
      setError("Connect a wallet to trade.");
      return null;
    }
    if (!quote || quote.legs.length === 0) {
      setError("Fetch a quote before trading.");
      return null;
    }
    // A stale quote is REJECTED for execution and refreshed instead — the user
    // reviews the fresh numbers and confirms again. Never trade on old pricing.
    if (Date.now() > quote.quoteExpiry) {
      await getQuote();
      setError("The quote had expired and was refreshed — review the updated numbers and confirm again.");
      return null;
    }
    if (!publicClient) {
      setStatus("failure");
      setError("No RPC client available for confirmation.");
      return null;
    }

    const legs = quote.legs;
    const composed = quote.walletActionCount === 2;
    const collected: Hex[] = [];
    let overrideInput: bigint | null = null;

    executionInFlight.current = true;
    try {
      await ensureChain();
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        if (!leg) continue;

        // Composed leg 2 was an estimate — use the amount actually received.
        const legInputWei = overrideInput ?? BigInt(leg.inputAmountWei);
        if (legInputWei <= 0n) {
          setStatus("failure");
          setError("Leg input amount resolved to zero; re-quote and retry.");
          return null;
        }

        const payload: LegPayload = {
          kind: leg.kind,
          marketToken: quote.marketToken,
          inputToken: leg.inputToken,
          outputToken: leg.outputToken,
          exactInputAmount: legInputWei.toString(),
          slippageBps,
          taker: address,
        };

        // For a composed route, snapshot the intermediate (anchor) balance BEFORE
        // this leg so we can measure exactly how much the next leg must spend.
        const hasNext = i < legs.length - 1;
        let intermediateBefore = 0n;
        if (hasNext) {
          intermediateBefore =
            (await readRawBalance({ address: leg.outputToken, native: false })) ?? 0n;
        }

        const hash = await executeLeg(payload, i + 1, legs.length);
        if (!hash) return null; // failure status already set
        collected.push(hash);
        setLegHashes([...collected]);

        if (hasNext) {
          const after = (await readRawBalance({ address: leg.outputToken, native: false })) ?? 0n;
          const delta = after - intermediateBefore;
          if (delta <= 0n) {
            setStatus("failure");
            setError("Could not measure the amount received for the next step.");
            return null;
          }
          overrideInput = delta;

          // Persist the ACTUAL received anchor amount so the outstanding final leg
          // survives a reload/failure. Only non-secret public state — never calldata.
          if (composed) {
            const record: PendingComposedTrade = {
              v: 1,
              side,
              marketToken: quote.marketToken,
              marketSymbol: marketSymbol ?? null,
              anchorSymbol: quote.anchorSymbol,
              anchorAddress: quote.anchorAddress,
              paymentSymbol: payToken.symbol,
              paymentAddress: payToken.address,
              completedLegTxHash: hash,
              actualReceivedAnchorWei: delta.toString(),
              pendingLegNumber: 2,
              quoteExpiry: quote.quoteExpiry,
              createdAt: Date.now(),
            };
            savePendingTrade(address, record);
            setPendingRecovery(record);
          }
        }
      }

      setStatus("success");
      clearPendingTrade(address, quote.marketToken);
      setPendingRecovery(null);
      // Retire the executed quote: the primary button returns to "Get quote"
      // and a completed trade can never be re-submitted from stale pricing.
      setQuote(null);
      void refreshBalance();
      onTraded?.();
      return collected[collected.length - 1] ?? null;
    } catch (e) {
      // Leg 2 interrupted → leave the pending record persisted for resume.
      mapTradeError(e);
      return null;
    } finally {
      executionInFlight.current = false;
    }
  }, [
    address,
    quote,
    publicClient,
    side,
    marketSymbol,
    payToken,
    slippageBps,
    ensureChain,
    executeLeg,
    getQuote,
    readRawBalance,
    refreshBalance,
    onTraded,
    mapTradeError,
  ]);

  // Resume ONLY the outstanding second leg from the ACTUAL persisted anchor amount.
  // Never auto-runs — the UI calls this on an explicit user action. prepare-leg
  // re-quotes server-side, so an expired persisted quote is re-prepared fresh; the
  // persisted amount is used solely as the input size, never as calldata.
  const resumePendingTrade = useCallback(async (): Promise<Hex | null> => {
    if (executionInFlight.current) return null; // one execution at a time
    setError(null);
    setTxHash(null);
    setLegHashes([]);
    const pending = pendingRecovery;
    if (!address) {
      setError("Connect a wallet to resume.");
      return null;
    }
    if (!pending) {
      setError("No partial trade to resume.");
      return null;
    }
    if (!publicClient) {
      setStatus("failure");
      setError("No RPC client available for confirmation.");
      return null;
    }

    // Buy: anchor → market token (BPS Direct). Sell: anchor → payment token via
    // an aggregator leg — the server ALWAYS re-runs the frozen priority chain
    // (Rialto → 1inch → 0x) for aggregator kinds, so the hint below never pins
    // the venue; the response reports the venue actually used.
    const payload: LegPayload =
      pending.side === "buy"
        ? {
            kind: "bpsDirect",
            marketToken: pending.marketToken,
            inputToken: pending.anchorAddress as Address,
            outputToken: pending.marketToken as Address,
            exactInputAmount: pending.actualReceivedAnchorWei,
            slippageBps,
            taker: address,
          }
        : {
            kind: "rialto",
            marketToken: pending.marketToken,
            inputToken: pending.anchorAddress as Address,
            outputToken: pending.paymentAddress as Address,
            exactInputAmount: pending.actualReceivedAnchorWei,
            slippageBps,
            taker: address,
          };

    executionInFlight.current = true;
    try {
      await ensureChain();
      const hash = await executeLeg(payload, 2, 2);
      if (!hash) return null; // failure status already set; pending stays persisted
      setLegHashes([hash]);
      setStatus("success");
      clearPendingTrade(address, pending.marketToken);
      setPendingRecovery(null);
      setQuote(null); // any displayed quote predates the resumed execution
      void refreshBalance();
      onTraded?.();
      return hash;
    } catch (e) {
      mapTradeError(e);
      return null;
    } finally {
      executionInFlight.current = false;
    }
  }, [
    pendingRecovery,
    address,
    publicClient,
    slippageBps,
    ensureChain,
    executeLeg,
    refreshBalance,
    onTraded,
    mapTradeError,
  ]);

  const cancelPendingTrade = useCallback(() => {
    if (address) clearPendingTrade(address, marketToken);
    setPendingRecovery(null);
  }, [address, marketToken]);

  const reset = useCallback(() => {
    setAmountState("");
    setQuote(null);
    setTxHash(null);
    setLegHashes([]);
    setLegIndex(0);
    setLegCount(0);
    setError(null);
    setStatus("idle");
  }, []);

  return {
    side,
    amount,
    slippageBps,
    status,
    quote,
    txHash,
    legHashes,
    legIndex,
    legCount,
    error,
    isConnected,
    wrongChain,
    amountWei,
    payTokens,
    anchorToken,
    payToken,
    inputDecimals,
    outputDecimals,
    inputBalanceWei,
    insufficient,
    setSide,
    setPayToken,
    setAmount,
    setSlippageBps,
    setMax,
    setInputFraction,
    getQuote,
    prepareAndTrade,
    switchToChain,
    reset,
    pendingRecovery,
    pendingPrompt,
    pendingExpired,
    resumePendingTrade,
    cancelPendingTrade,
  };
}
