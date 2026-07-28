// POST /api/lab/trade/ingest — immediate ingestion of a just-confirmed trade.
// The client supplies ONLY a transaction hash; the server reads the receipt
// from chain, verifies it succeeded, verifies the PoolManager Swap log belongs
// to a provenance-verified BPS market's poolId, and inserts it idempotently
// into lab_swaps (ON CONFLICT DO NOTHING — the background indexer reconciles
// later and can never duplicate it). Client-supplied amounts/directions are
// never trusted; everything is decoded from the receipt.

import { decodeEventLog, isAddress, isHex, parseAbiItem } from "viem";
import { z } from "zod";
import { getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { getLabClient } from "../../../../../lib/lab/server";
import { getPg } from "../../../../../lib/lab/store";
import { assertSameOrigin, clientKey, err, mapError, ok, rateLimited } from "../../../../../lib/lab/http";

export const dynamic = "force-dynamic";

const SWAP_EVENT = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
);

const ingestSchema = z.object({
  txHash: z.string().refine((v) => isHex(v) && v.length === 66, "Invalid transaction hash"),
  marketToken: z.string().refine(isAddress, "Invalid market token"),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const originProblem = assertSameOrigin(req);
    if (originProblem) return err("BAD_ORIGIN", originProblem, 403);
    if (rateLimited(`ingest:${clientKey(req)}`, 20)) {
      return err("RATE_LIMITED", "Too many requests.", 429);
    }
    const { txHash, marketToken } = ingestSchema.parse(await req.json());

    // The market must be a provenance-verified BPS launch with a known poolId.
    const pg = await getPg();
    if (!pg) return err("DB_UNAVAILABLE", "Trade ingestion is unavailable right now.", 503);
    const rowRes = await pg.query(
      `SELECT pool_id FROM lab_launches WHERE lower(token_address) = $1 AND provenance_verified = true`,
      [marketToken.toLowerCase()],
    );
    const poolId = rowRes.rows[0]?.pool_id as string | undefined;
    if (!poolId) return err("NOT_A_LAB_MARKET", "That token is not a Launch Lab market.", 404);

    const client = getLabClient();
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt.status !== "success") {
      return err("TX_NOT_SUCCESSFUL", "The transaction did not succeed on-chain.", 409);
    }
    const poolManager = getAddresses(4663).poolManager as string;

    const inserted: Record<string, unknown>[] = [];
    let blockTime: number | null = null;
    for (const l of receipt.logs) {
      if (l.address.toLowerCase() !== poolManager.toLowerCase()) continue;
      let args: {
        id: `0x${string}`;
        sender: `0x${string}`;
        amount0: bigint;
        amount1: bigint;
        sqrtPriceX96: bigint;
        tick: number;
        fee: number;
      };
      try {
        const dec = decodeEventLog({ abi: [SWAP_EVENT], data: l.data, topics: l.topics });
        args = dec.args as typeof args;
      } catch {
        continue; // not a Swap log
      }
      // Only swaps on THIS market's exact poolId are ingested.
      if (args.id.toLowerCase() !== poolId.toLowerCase()) continue;
      if (blockTime === null) {
        const b = await client.getBlock({ blockNumber: receipt.blockNumber });
        blockTime = Number(b.timestamp);
      }
      await pg.query(
        `INSERT INTO lab_swaps (id, pool_id, token_address, block_number, tx_hash, amount0, amount1, sqrt_price_x96, tick, fee, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_timestamp($11))
         ON CONFLICT (id) DO NOTHING`,
        [
          `${txHash}:${l.logIndex}`,
          args.id.toLowerCase(),
          marketToken.toLowerCase(),
          receipt.blockNumber.toString(),
          txHash,
          args.amount0.toString(),
          args.amount1.toString(),
          args.sqrtPriceX96.toString(),
          args.tick,
          args.fee,
          blockTime,
        ],
      );
      inserted.push({
        id: `${txHash}:${l.logIndex}`,
        poolId: args.id.toLowerCase(),
        blockNumber: receipt.blockNumber.toString(),
        amount0: args.amount0.toString(),
        amount1: args.amount1.toString(),
        sqrtPriceX96: args.sqrtPriceX96.toString(),
        tick: args.tick,
        fee: args.fee,
        occurredAt: blockTime,
      });
    }
    if (inserted.length === 0) {
      return err("NO_MARKET_SWAP", "No swap for this market was found in that transaction.", 404);
    }
    return ok({ ingested: inserted.length, swaps: inserted });
  } catch (e) {
    return mapError(e);
  }
}
