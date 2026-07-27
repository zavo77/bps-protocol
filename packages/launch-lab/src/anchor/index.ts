// Approved-anchor resolution — fail closed on every mismatch. On-chain reads
// use the injected client; official data comes from Robinhood's public
// read-only Stock Token API. Raw REST prices are underlying-equity USD;
// currentMultiplier converts to Stock-Token-equivalent values.
//
// Selection is ALWAYS by approved symbol against the anchor registry; the
// resolved address is re-verified against the on-chain contract and the
// official API. Arbitrary addresses never enter here.

import { erc20Abi, getAddress, type Address, type PublicClient } from "viem";
import {
  getAnchorBySymbol,
  isApprovedAnchorSymbol,
  DEFAULT_ANCHOR_SYMBOL,
} from "../anchors/registry";
import type { AnchorVerification } from "../types/index";

const ASSETS_URL = "https://api.robinhood.com/rhj/assets";
const pricesUrl = (symbol: string): string => `https://api.robinhood.com/rhj/prices/${symbol}`;

/** Cache per symbol within a short window; the API is public and must not be hammered. */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: AnchorVerification }>();

interface RawAsset {
  tokenSymbol?: string;
  symbol?: string;
  tokenName?: string;
  name?: string;
  status?: string;
  assetStatus?: string;
  currentMultiplier?: string;
  deployments?: { chainId: number | string; contractAddress: string }[];
}

function mismatch(symbol: string, address: Address, reason: string): AnchorVerification {
  return {
    status: "mismatch",
    symbol,
    address,
    name: "",
    decimals: 0,
    currentMultiplier: "",
    midPriceUsd: "0",
    bidUsd: "0",
    askUsd: "0",
    fetchedAt: Date.now(),
    mismatchReason: reason,
  };
}

/**
 * Resolve and fail-closed-verify an approved anchor by symbol (default GOOGL).
 * Rejects any symbol not in the approved registry before any network call.
 */
export async function resolveAnchor(
  client: PublicClient,
  opts?: { bypassCache?: boolean; symbol?: string },
): Promise<AnchorVerification> {
  const symbol = opts?.symbol ?? DEFAULT_ANCHOR_SYMBOL;
  if (!isApprovedAnchorSymbol(symbol)) {
    return mismatch(
      symbol,
      "0x0000000000000000000000000000000000000000",
      `Anchor ${symbol} is not approved.`,
    );
  }
  const anchor = getAnchorBySymbol(symbol);
  const anchorAddress = anchor.address;

  const cached = cache.get(symbol);
  if (
    !opts?.bypassCache &&
    cached &&
    Date.now() - cached.at < CACHE_TTL_MS &&
    cached.value.status === "verified"
  ) {
    return cached.value;
  }

  let name: string;
  let onchainSymbol: string;
  let decimals: number;
  try {
    [name, onchainSymbol, decimals] = await Promise.all([
      client.readContract({ address: anchorAddress, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address: anchorAddress, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: anchorAddress, abi: erc20Abi, functionName: "decimals" }),
    ]);
  } catch (e) {
    const parts: string[] = [];
    let cur: unknown = e;
    for (let i = 0; i < 4 && cur; i++) {
      const c = cur as {
        shortMessage?: string;
        details?: string;
        message?: string;
        cause?: unknown;
      };
      parts.push(c.shortMessage ?? c.details ?? c.message ?? String(cur));
      cur = c.cause;
    }
    const detail = parts
      .join(" <- ")
      .replace(/https?:\/\/\S+/g, "[url]")
      .slice(0, 300);
    return mismatch(
      symbol,
      anchorAddress,
      `On-chain ERC-20 reads failed for ${symbol}. (${detail})`,
    );
  }
  if (onchainSymbol !== symbol)
    return mismatch(symbol, anchorAddress, `On-chain symbol "${onchainSymbol}" != ${symbol}.`);
  if (Number(decimals) !== anchor.decimals)
    return mismatch(symbol, anchorAddress, `On-chain decimals ${decimals} != ${anchor.decimals}.`);

  let asset: RawAsset | undefined;
  let bid = NaN;
  let ask = NaN;
  try {
    const [assetsRes, pricesRes] = await Promise.all([fetch(ASSETS_URL), fetch(pricesUrl(symbol))]);
    if (!assetsRes.ok || !pricesRes.ok)
      return mismatch(symbol, anchorAddress, "Official Robinhood API unavailable.");
    const assetsJson: unknown = await assetsRes.json();
    const list: RawAsset[] = Array.isArray(assetsJson)
      ? (assetsJson as RawAsset[])
      : (((assetsJson as Record<string, unknown>).assets ??
          (assetsJson as Record<string, unknown>).results ??
          []) as RawAsset[]);
    asset = list.find((a) => (a.tokenSymbol ?? a.symbol) === symbol);
    const pricesJson = (await pricesRes.json()) as { quotes?: { bid?: string; ask?: string }[] };
    const quote = pricesJson.quotes?.[0] ?? (pricesJson as { bid?: string; ask?: string });
    bid = Number(quote.bid);
    ask = Number(quote.ask);
  } catch {
    return mismatch(symbol, anchorAddress, "Official Robinhood API request failed.");
  }

  if (!asset)
    return mismatch(symbol, anchorAddress, `${symbol} not present in the official asset list.`);
  const status = asset.status ?? asset.assetStatus ?? "";
  if (!status.includes("ACTIVE"))
    return mismatch(symbol, anchorAddress, `${symbol} asset status "${status}" is not active.`);
  const dep = (asset.deployments ?? []).find((d) => Number(d.chainId) === 4663);
  if (!dep) return mismatch(symbol, anchorAddress, `${symbol} has no chainId 4663 deployment.`);
  let apiAddress: Address;
  try {
    apiAddress = getAddress(dep.contractAddress);
  } catch {
    return mismatch(symbol, anchorAddress, `Official ${symbol} contract address is malformed.`);
  }
  if (apiAddress !== anchorAddress) {
    return mismatch(
      symbol,
      anchorAddress,
      `Official ${symbol} address ${apiAddress} != approved ${anchorAddress}.`,
    );
  }
  const multiplier = String(asset.currentMultiplier ?? "");
  if (!/^\d+(\.\d+)?$/.test(multiplier) || Number(multiplier) <= 0) {
    return mismatch(
      symbol,
      anchorAddress,
      `${symbol} currentMultiplier "${multiplier}" is invalid.`,
    );
  }
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) {
    return mismatch(symbol, anchorAddress, `${symbol} bid/ask unavailable.`);
  }

  const mult = Number(multiplier);
  const mid = ((bid + ask) / 2) * mult;
  const verified: AnchorVerification = {
    status: "verified",
    symbol,
    address: anchorAddress,
    name,
    decimals: Number(decimals),
    currentMultiplier: multiplier,
    midPriceUsd: mid.toFixed(6),
    bidUsd: (bid * mult).toFixed(6),
    askUsd: (ask * mult).toFixed(6),
    fetchedAt: Date.now(),
  };
  cache.set(symbol, { at: Date.now(), value: verified });
  return verified;
}
