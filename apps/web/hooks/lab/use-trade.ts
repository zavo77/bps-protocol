"use client";
// Client trade state machine for one lab market (embedded bidirectional trading).
//
// Flow (prepareAndTrade):
//   (a) wrong chain          → switch to Robinhood Chain (4663)
//   (b) sign prepare-trade   → EIP-191 envelope via useSignedRequest
//   (c) POST /api/lab/trade/prepare (server re-quotes; client calldata is never trusted)
//   (d) approvals            → ERC20 approve(Permit2, maxUint256); Permit2.approve(token, router, uint160 max, uint48 exp)
//                              then re-sign + re-prepare for a clean simulation
//   (e) send transaction     → wallet signs {to,data,value,gas,chainId:4663}
//   (f) waitForTransactionReceipt → success/failure
//
// Every /api/lab/trade/prepare call needs a FRESH signed envelope (server enforces
// single-use replay protection), so a post-approval re-prepare re-signs.
import { useCallback, useMemo, useState } from "react";
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
import { CHAIN_ID, PERMIT2_ABI, type RouteId, type RouteQuote } from "@bps/launch-lab";
import { LabApiError, errorMessage, labFetch } from "./api";
import { useSignedRequest } from "./use-signed-request";

export type TradeSide = "buy" | "sell";

/** Both the launch token and GOOGL are 18-decimal ERC-20s. */
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
  | "ready"
  | "awaiting-signature"
  | "pending"
  | "success"
  | "failure"
  | "wrong-chain"
  | "insufficient-balance";

interface QuoteResponse {
  routes: RouteQuote[];
  selected: RouteId;
  side: TradeSide;
  tokenAddress: Address;
  taker: Address;
}

interface PrepareResponse {
  route: RouteQuote;
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
  routes: RouteQuote[];
  selectedRouteId: RouteId | null;
  selectedRoute: RouteQuote | null;
  txHash: Hex | null;
  error: string | null;
  isConnected: boolean;
  wrongChain: boolean;
  amountWei: bigint;
  setSide: (side: TradeSide) => void;
  setAmount: (amount: string) => void;
  setSlippageBps: (bps: number) => void;
  setMaxSell: () => Promise<void>;
  setSellFraction: (percent: number) => Promise<void>;
  selectRoute: (id: RouteId) => void;
  quote: () => Promise<void>;
  prepareAndTrade: () => Promise<Hex | null>;
  switchToChain: () => Promise<void>;
  reset: () => void;
}

function parseAmountWei(amount: string): bigint {
  const trimmed = amount.trim();
  if (trimmed === "") return 0n;
  try {
    return parseUnits(trimmed, TRADE_DECIMALS);
  } catch {
    return 0n;
  }
}

export function useTrade(tokenAddress: string, onTraded?: () => void): UseTrade {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const signRequest = useSignedRequest();

  const [side, setSideState] = useState<TradeSide>("buy");
  const [amount, setAmountState] = useState("");
  const [slippageBps, setSlippageBpsState] = useState(100);
  const [status, setStatus] = useState<TradeStatus>("idle");
  const [routes, setRoutes] = useState<RouteQuote[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<RouteId | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountWei = useMemo(() => parseAmountWei(amount), [amount]);
  const wrongChain = isConnected && chainId !== CHAIN_ID;
  const selectedRoute = useMemo(
    () => routes.find((r) => r.routeId === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

  // Changing inputs invalidates a stale quote so the UI can't trade on it.
  const invalidateQuote = useCallback(() => {
    setRoutes([]);
    setSelectedRouteId(null);
    setTxHash(null);
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

  const selectRoute = useCallback((id: RouteId) => {
    setSelectedRouteId(id);
  }, []);

  /** Read the launch-token balance for the connected wallet (sell asset). */
  const readTokenBalance = useCallback(async (): Promise<bigint | null> => {
    if (!publicClient || !address || !isAddress(tokenAddress)) return null;
    try {
      return (await publicClient.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
    } catch {
      return null;
    }
  }, [publicClient, address, tokenAddress]);

  const setMaxSell = useCallback(async () => {
    const bal = await readTokenBalance();
    if (bal === null) return;
    setAmount(formatUnits(bal, TRADE_DECIMALS));
  }, [readTokenBalance, setAmount]);

  const setSellFraction = useCallback(
    async (percent: number) => {
      const bal = await readTokenBalance();
      if (bal === null) return;
      const clamped = Math.max(0, Math.min(100, Math.trunc(percent)));
      const part = (bal * BigInt(clamped)) / 100n;
      setAmount(formatUnits(part, TRADE_DECIMALS));
    },
    [readTokenBalance, setAmount],
  );

  const switchToChain = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: CHAIN_ID });
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [switchChainAsync]);

  const quote = useCallback(async () => {
    setError(null);
    setTxHash(null);
    const wei = parseAmountWei(amount);
    if (wei <= 0n) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!address) {
      setError("Connect a wallet to fetch a quote.");
      return;
    }
    setStatus("quoting");
    try {
      const data = await labFetch<QuoteResponse>("/api/lab/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenAddress,
          side,
          amountInWei: wei.toString(),
          taker: address,
          slippageBps,
        }),
      });
      setRoutes(data.routes);
      setSelectedRouteId(data.selected);
      setStatus(data.routes.length === 0 ? "no-route" : "quoted");
    } catch (e) {
      if (
        e instanceof LabApiError &&
        (e.code === "NOT_A_LAB_MARKET" || e.code === "ROUTE_UNAVAILABLE")
      ) {
        setStatus("no-route");
      } else {
        setStatus("failure");
      }
      setError(errorMessage(e));
    }
  }, [amount, address, tokenAddress, side, slippageBps]);

  const signAndPrepare = useCallback(
    async (payload: Record<string, unknown>): Promise<PrepareResponse> => {
      setStatus("awaiting-signature");
      const envelope = await signRequest("prepare-trade", payload);
      setStatus("simulating");
      return labFetch<PrepareResponse>("/api/lab/trade/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ envelope, payload }),
      });
    },
    [signRequest],
  );

  const mapTradeError = useCallback((e: unknown) => {
    if (e instanceof LabApiError) {
      switch (e.code) {
        case "INSUFFICIENT_BALANCE":
          setStatus("insufficient-balance");
          break;
        case "ROUTE_UNAVAILABLE":
        case "NOT_A_LAB_MARKET":
          setStatus("no-route");
          break;
        default:
          setStatus("failure");
      }
    } else {
      setStatus("failure");
    }
    setError(errorMessage(e));
  }, []);

  const prepareAndTrade = useCallback(async (): Promise<Hex | null> => {
    setError(null);
    setTxHash(null);
    if (!address) {
      setError("Connect a wallet to trade.");
      return null;
    }
    if (!selectedRouteId) {
      setError("Fetch a quote before trading.");
      return null;
    }
    const wei = parseAmountWei(amount);
    if (wei <= 0n) {
      setError("Enter an amount greater than zero.");
      return null;
    }

    // (a) Wrong chain → switch to 4663 before anything else.
    if (chainId !== CHAIN_ID) {
      setStatus("wrong-chain");
      try {
        await switchChainAsync({ chainId: CHAIN_ID });
      } catch (e) {
        setError(errorMessage(e));
        return null;
      }
    }
    if (!publicClient) {
      setStatus("failure");
      setError("No RPC client available for confirmation.");
      return null;
    }

    const payload: Record<string, unknown> = {
      tokenAddress,
      side,
      amountInWei: wei.toString(),
      slippageBps,
      routeId: selectedRouteId,
      taker: address,
    };

    try {
      // (b)+(c) sign + prepare
      let prep = await signAndPrepare(payload);

      // (d) approvals in the wallet, then re-prepare for a clean simulation.
      let approved = false;
      if (prep.approvals.erc20ApprovalNeeded && prep.approvals.erc20ApprovalTarget) {
        setStatus("needs-approval");
        setStatus("approving");
        const approveHash = await writeContractAsync({
          address: prep.route.sellToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [prep.approvals.erc20ApprovalTarget, maxUint256],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        approved = true;
      }
      if (
        prep.approvals.permit2ApprovalNeeded &&
        prep.approvals.permit2SpenderTarget &&
        prep.approvals.erc20ApprovalTarget
      ) {
        setStatus("approving");
        // Permit2 expiration is a uint48 → typed as `number` by abitype.
        const expiration = Math.floor(Date.now() / 1000) + PERMIT2_EXPIRATION_SECONDS;
        const permitHash = await writeContractAsync({
          // erc20ApprovalTarget is the Permit2 contract (route.allowanceTarget).
          address: prep.approvals.erc20ApprovalTarget,
          abi: PERMIT2_ABI,
          functionName: "approve",
          args: [
            prep.route.sellToken,
            prep.approvals.permit2SpenderTarget,
            MAX_UINT160,
            expiration,
          ],
        });
        await publicClient.waitForTransactionReceipt({ hash: permitHash });
        approved = true;
      }
      if (approved) {
        prep = await signAndPrepare(payload);
      }

      // Stale quote → re-quote and stop; the user reviews the fresh numbers.
      if (Date.now() > prep.staleAfter) {
        await quote();
        setError("Quote expired before signing; re-quoted — review and retry.");
        return null;
      }

      // (e) send
      setStatus("ready");
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
      if (receipt.status === "success") {
        setStatus("success");
        onTraded?.();
        return hash;
      }
      setStatus("failure");
      setError("Transaction reverted on-chain.");
      return null;
    } catch (e) {
      mapTradeError(e);
      return null;
    }
  }, [
    address,
    selectedRouteId,
    amount,
    chainId,
    publicClient,
    tokenAddress,
    side,
    slippageBps,
    switchChainAsync,
    signAndPrepare,
    writeContractAsync,
    sendTransactionAsync,
    quote,
    mapTradeError,
    onTraded,
  ]);

  const reset = useCallback(() => {
    setAmountState("");
    setRoutes([]);
    setSelectedRouteId(null);
    setTxHash(null);
    setError(null);
    setStatus("idle");
  }, []);

  return {
    side,
    amount,
    slippageBps,
    status,
    routes,
    selectedRouteId,
    selectedRoute,
    txHash,
    error,
    isConnected,
    wrongChain,
    amountWei,
    setSide,
    setAmount,
    setSlippageBps,
    setMaxSell,
    setSellFraction,
    selectRoute,
    quote,
    prepareAndTrade,
    switchToChain,
    reset,
  };
}
