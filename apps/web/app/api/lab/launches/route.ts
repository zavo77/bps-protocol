// GET: list confirmed lab launches (chain-reconstructed; DB-mirrored when
// configured). POST: idempotently register a just-confirmed launch by tx hash —
// the server verifies everything from the chain; the client is never trusted.

import { parseEventLogs, getAddress, type Address, type Hex } from "viem";
import { airlockAbi, CHAIN_IDS, getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { GOOGL_ADDRESS } from "@bps/launch-lab";
import { getLabClient } from "../../../../lib/lab/server";
import { invalidateLaunchCache, listLaunches } from "../../../../lib/lab/store";
import { clientKey, err, mapError, ok, rateLimited } from "../../../../lib/lab/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return ok({ launches: await listLaunches() });
  } catch (e) {
    return mapError(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    if (rateLimited(`launchreg:${clientKey(req)}`, 10))
      return err("RATE_LIMITED", "Too many requests.", 429);
    const body = (await req.json()) as { transactionHash?: string };
    const hash = body.transactionHash;
    if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash))
      return err("BAD_TX_HASH", "Invalid transaction hash.");

    const client = getLabClient();
    const receipt = await client.getTransactionReceipt({ hash: hash as Hex });
    if (receipt.status !== "success") return err("TX_NOT_SUCCESS", "Transaction did not succeed.");
    const a = getAddresses(CHAIN_IDS.ROBINHOOD) as unknown as {
      airlock: Address;
      dopplerHookInitializer: Address;
    };
    const created = parseEventLogs({
      abi: airlockAbi,
      logs: receipt.logs,
      eventName: "Create",
    }).find((l) => l.address.toLowerCase() === a.airlock.toLowerCase());
    if (!created) return err("NO_CREATE_EVENT", "No Airlock Create event in that transaction.");
    const args = created.args as {
      asset: Address;
      numeraire: Address;
      initializer: Address;
      poolOrHook: Address;
    };
    if (args.numeraire.toLowerCase() !== GOOGL_ADDRESS.toLowerCase()) {
      return err("WRONG_NUMERAIRE", "Launch is not GOOGL-anchored.");
    }
    if (args.initializer.toLowerCase() !== a.dopplerHookInitializer.toLowerCase()) {
      return err("WRONG_INITIALIZER", "Launch did not use the lab initializer.");
    }
    // Registration is just cache invalidation: the authoritative list is
    // re-reconstructed from chain (and mirrored to Postgres when configured).
    invalidateLaunchCache();
    const launches = await listLaunches();
    const found = launches.find(
      (l) => l.tokenAddress.toLowerCase() === getAddress(args.asset).toLowerCase(),
    );
    return ok({ registered: true, indexed: !!found, tokenAddress: getAddress(args.asset) });
  } catch (e) {
    return mapError(e);
  }
}
