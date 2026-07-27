// GET /api/lab/route-probe — read-only diagnostic proving the DEPLOYED runtime
// can obtain executable payment↔anchor quotes through the frozen priority chain
// (Rialto → 1inch → 0x). Exists because the user quote API requires a launched
// market token, while venue-side liquidity (payment↔anchor) must be verifiable
// before the first launch and monitorable after.
//
// Fixed founder matrix only (no caller-chosen tokens), tightly rate-limited
// (venue API quota), and fully sanitized: venue name, amounts, fee bps, spender,
// and simulation status — never calldata, headers, or any key material. The
// probe taker is the BPS beneficiary; simulation runs only when that wallet
// actually holds the input (and allowance for ERC-20s) — otherwise it is
// reported as not-simulated, since per-user simulation happens at prepare-leg.

import { erc20Abi, formatUnits, getAddress, type Address } from "viem";
import {
  APPROVED_ANCHORS,
  getPaymentToken,
  getAnchorBySymbol,
  NATIVE_ETH,
} from "@bps/launch-lab";
import { getFlags, getLabClient } from "../../../../lib/lab/server";
import { quoteAggregatorDirect } from "../../../../lib/lab/trade-router";
import { clientKey, err, ok, rateLimited } from "../../../../lib/lab/http";

export const dynamic = "force-dynamic";

// Simulation-only fallback taker for native-ETH pairs when the beneficiary is
// unfunded: a well-funded PUBLIC EOA on 4663 (read-only eth_call binds no one;
// native sells need no approval, so the simulation is fully self-contained).
const SIM_FALLBACK_TAKER: Address = "0x1A18a8b96eac3F980133A18402d04194f1FAA4E7";

// Founder verification matrix: 4 forward payment→anchor pairs + each reverse.
const MATRIX: { sell: string; buy: string }[] = [
  { sell: "ETH", buy: "GOOGL" },
  { sell: "ETH", buy: "NVDA" },
  { sell: "WETH", buy: "NVDA" },
  { sell: "USDG", buy: "GOOGL" },
  { sell: "GOOGL", buy: "ETH" },
  { sell: "NVDA", buy: "ETH" },
  { sell: "NVDA", buy: "WETH" },
  { sell: "GOOGL", buy: "USDG" },
];

// Tiny probe sizes (human units) — quota-friendly, price-realistic.
const PROBE_AMOUNT: Record<string, bigint> = {
  ETH: 500_000_000_000_000n, // 0.0005 ETH
  WETH: 500_000_000_000_000n,
  USDG: 5_000_000n, // 5 USDG (6dp)
  ANCHOR: 10_000_000_000_000_000n, // 0.01 anchor units (18dp)
};

interface TokenRef {
  symbol: string;
  address: Address;
  decimals: number;
  native: boolean;
}

function resolveToken(symbol: string): TokenRef | null {
  const pay = getPaymentToken(symbol);
  if (pay)
    return { symbol: pay.symbol, address: pay.address, decimals: pay.decimals, native: pay.native };
  const anchor = getAnchorBySymbol(symbol);
  if (anchor)
    return { symbol: anchor.symbol, address: getAddress(anchor.address), decimals: 18, native: false };
  return null;
}

export async function GET(req: Request): Promise<Response> {
  try {
    // Tight limit: each call spends venue API quota on 8 quotes.
    if (rateLimited(`routeprobe:${clientKey(req)}`, 3)) {
      return err("RATE_LIMITED", "Too many probe requests.", 429);
    }
    const flags = getFlags();
    const client = getLabClient();
    const taker = flags.bpsFeeAddress ? getAddress(flags.bpsFeeAddress) : null;
    if (!taker) return err("BPS_BENEFICIARY_UNCONFIGURED", "Probe taker unavailable.", 503);

    const results = [];
    for (const pair of MATRIX) {
      const sell = resolveToken(pair.sell);
      const buy = resolveToken(pair.buy);
      if (!sell || !buy) continue;
      const isPaymentSell = getPaymentToken(sell.symbol) !== null;
      const amount = isPaymentSell ? PROBE_AMOUNT[sell.symbol]! : PROBE_AMOUNT.ANCHOR!;

      const q = await quoteAggregatorDirect({
        sellToken: sell.address,
        sellDecimals: sell.decimals,
        buyToken: buy.address,
        sellAmountWei: amount,
        taker,
        slippageBps: 100,
      });

      if (!q) {
        results.push({
          pair: `${sell.symbol}->${buy.symbol}`,
          executable: false,
          venue: null,
          note: "no venue returned an executable route",
        });
        continue;
      }

      // Simulate the EXACT returned calldata only when a taker can actually
      // execute it (balance + allowance); otherwise report honestly. For
      // native-ETH sells (no approval needed) an unfunded beneficiary falls
      // back to re-quoting for a funded PUBLIC EOA and simulating that quote.
      let simulation = "not-simulated";
      let simulationNote = "";
      let simulationTaker: Address | null = null;
      let reported = q;
      try {
        const isNative = sell.address.toLowerCase() === NATIVE_ETH.toLowerCase();
        const balance = isNative
          ? await client.getBalance({ address: taker })
          : ((await client.readContract({
              address: sell.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [taker],
            })) as bigint);
        let allowanceOk = true;
        if (!isNative && q.allowanceTarget) {
          const allowance = (await client.readContract({
            address: sell.address,
            abi: erc20Abi,
            functionName: "allowance",
            args: [taker, q.allowanceTarget],
          })) as bigint;
          allowanceOk = allowance >= amount;
        }
        if (balance >= amount && allowanceOk) {
          await client.call({
            account: taker,
            to: q.transactionTarget,
            data: q.transactionData,
            value: BigInt(q.transactionValue),
          });
          simulation = "ok";
          simulationTaker = taker;
        } else if (isNative) {
          // Quote is taker-bound: re-quote for the funded EOA, simulate THAT tx.
          const q2 = await quoteAggregatorDirect({
            sellToken: sell.address,
            sellDecimals: sell.decimals,
            buyToken: buy.address,
            sellAmountWei: amount,
            taker: SIM_FALLBACK_TAKER,
            slippageBps: 100,
          });
          if (q2) {
            reported = q2;
            await client.call({
              account: SIM_FALLBACK_TAKER,
              to: q2.transactionTarget,
              data: q2.transactionData,
              value: BigInt(q2.transactionValue),
            });
            simulation = "ok";
            simulationTaker = SIM_FALLBACK_TAKER;
            simulationNote = "simulated for a funded public EOA (read-only eth_call)";
          }
        } else {
          simulationNote =
            balance < amount
              ? "probe taker lacks input balance (per-user simulation runs at prepare-leg)"
              : "probe taker lacks venue allowance (per-user simulation runs at prepare-leg)";
        }
      } catch {
        simulation = "reverted";
      }

      results.push({
        pair: `${sell.symbol}->${buy.symbol}`,
        executable: true,
        venue: reported.venue,
        sellAmount: `${formatUnits(amount, sell.decimals)} ${sell.symbol}`,
        buyAmountWei: reported.buyAmountWei,
        minBuyAmountWei: reported.minBuyAmountWei,
        platformFeeBps: reported.platformFeeBps,
        allowanceSpender: reported.allowanceTarget, // exactly as the venue returned; null = native, no approval
        nativeNoApproval: sell.native ? reported.allowanceTarget === null : null,
        transactionTarget: reported.transactionTarget,
        simulation,
        ...(simulationTaker ? { simulationTaker } : {}),
        ...(simulationNote ? { simulationNote } : {}),
      });
    }

    return ok({
      chainId: 4663, // adapters reject any quote not bound to 4663
      priority: ["rialto", "oneInch", "zeroEx"],
      probeTaker: taker,
      pairs: results,
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return err("PROBE_FAILED", "Route probe failed.", 500);
  }
}
