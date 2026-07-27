// Canonical GOOGL anchor resolution — fail closed on every mismatch.
// On-chain reads use the injected client; official data comes from Robinhood's
// public read-only Stock Token API. Raw REST prices are underlying-equity USD;
// currentMultiplier converts to Stock-Token-equivalent values.

import { erc20Abi, getAddress, type Address, type PublicClient } from "viem";
import { GOOGL_ADDRESS } from "../config/index";
import type { AnchorVerification } from "../types/index";

const ASSETS_URL = "https://api.robinhood.com/rhj/assets";
const PRICES_URL = "https://api.robinhood.com/rhj/prices/GOOGL";

/** Cache within a short window; the API is public and must not be hammered. */
const CACHE_TTL_MS = 30_000;
let cache: { at: number; value: AnchorVerification } | null = null;

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

function mismatch(reason: string): AnchorVerification {
  return {
    status: "mismatch",
    symbol: "GOOGL",
    address: GOOGL_ADDRESS,
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

export async function resolveAnchor(
  client: PublicClient,
  opts?: { bypassCache?: boolean },
): Promise<AnchorVerification> {
  if (
    !opts?.bypassCache &&
    cache &&
    Date.now() - cache.at < CACHE_TTL_MS &&
    cache.value.status === "verified"
  ) {
    return cache.value;
  }

  let name: string;
  let symbol: string;
  let decimals: number;
  try {
    [name, symbol, decimals] = await Promise.all([
      client.readContract({ address: GOOGL_ADDRESS, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address: GOOGL_ADDRESS, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: GOOGL_ADDRESS, abi: erc20Abi, functionName: "decimals" }),
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
    return mismatch(`On-chain ERC-20 reads failed for the canonical GOOGL address. (${detail})`);
  }
  if (symbol !== "GOOGL") return mismatch(`On-chain symbol "${symbol}" is not GOOGL.`);
  if (Number(decimals) !== 18) return mismatch(`On-chain decimals ${decimals} != 18.`);

  let asset: RawAsset | undefined;
  let bid = NaN;
  let ask = NaN;
  try {
    const [assetsRes, pricesRes] = await Promise.all([fetch(ASSETS_URL), fetch(PRICES_URL)]);
    if (!assetsRes.ok || !pricesRes.ok) return mismatch("Official Robinhood API unavailable.");
    const assetsJson: unknown = await assetsRes.json();
    const list: RawAsset[] = Array.isArray(assetsJson)
      ? (assetsJson as RawAsset[])
      : (((assetsJson as Record<string, unknown>).assets ??
          (assetsJson as Record<string, unknown>).results ??
          []) as RawAsset[]);
    asset = list.find((a) => (a.tokenSymbol ?? a.symbol) === "GOOGL");
    const pricesJson = (await pricesRes.json()) as { quotes?: { bid?: string; ask?: string }[] };
    const quote = pricesJson.quotes?.[0] ?? (pricesJson as { bid?: string; ask?: string });
    bid = Number(quote.bid);
    ask = Number(quote.ask);
  } catch {
    return mismatch("Official Robinhood API request failed.");
  }

  if (!asset) return mismatch("GOOGL not present in the official asset list.");
  const status = asset.status ?? asset.assetStatus ?? "";
  if (!status.includes("ACTIVE")) return mismatch(`GOOGL asset status "${status}" is not active.`);
  const dep = (asset.deployments ?? []).find((d) => Number(d.chainId) === 4663);
  if (!dep) return mismatch("GOOGL has no chainId 4663 deployment in the official asset list.");
  let apiAddress: Address;
  try {
    apiAddress = getAddress(dep.contractAddress);
  } catch {
    return mismatch("Official GOOGL contract address is malformed.");
  }
  if (apiAddress !== GOOGL_ADDRESS) {
    return mismatch(
      `Official GOOGL address ${apiAddress} does not match configured ${GOOGL_ADDRESS}.`,
    );
  }
  const multiplier = String(asset.currentMultiplier ?? "");
  if (!/^\d+(\.\d+)?$/.test(multiplier) || Number(multiplier) <= 0) {
    return mismatch(`GOOGL currentMultiplier "${multiplier}" is invalid.`);
  }
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) {
    return mismatch("GOOGL bid/ask unavailable from the official price API.");
  }

  // Stock-Token-equivalent USD = raw underlying price × currentMultiplier.
  const mult = Number(multiplier);
  const mid = ((bid + ask) / 2) * mult;
  const verified: AnchorVerification = {
    status: "verified",
    symbol: "GOOGL",
    address: GOOGL_ADDRESS,
    name,
    decimals: Number(decimals),
    currentMultiplier: multiplier,
    midPriceUsd: mid.toFixed(6),
    bidUsd: (bid * mult).toFixed(6),
    askUsd: (ask * mult).toFixed(6),
    fetchedAt: Date.now(),
  };
  cache = { at: Date.now(), value: verified };
  return verified;
}
