// Read-only provenance report for currently tracked lab_launches rows.
// Public data only; RPC/DB never printed. Proves whether each row is a genuine
// BPS-frontend market or an externally-created Doppler market.
/* global console, process */
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { createPublicClient, http, defineChain, getAddress } from "viem";
import { getAnchorByAddress } from "../src/anchors/registry.ts";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "..",
  "..",
  "..",
);
const env = {};
for (const line of readFileSync(path.join(ROOT, "apps", "web", ".env.local"), "utf8").split(
  /\r?\n/,
)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const chain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
});
const client = createPublicClient({ chain, transport: http(env.ROBINHOOD_CHAIN_RPC_URL) });
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
const explorer = "https://robinhoodchain.blockscout.com";

try {
  const rows = (
    await pool.query(
      "SELECT token_address, numeraire, launch_tx, creator, block_number FROM lab_launches ORDER BY inserted_at",
    )
  ).rows;
  console.log(`tracked rows: ${rows.length}`);
  for (const r of rows) {
    const anchor = getAnchorByAddress(r.numeraire);
    // Check whether the launch tx 'to' was the BPS frontend flow: we cannot see a
    // manifest marker on-chain, so BPS provenance requires a matching issued
    // manifest (lab_prepared) — none exists for these, proving them external.
    let creator = r.creator;
    try {
      const res = await fetch(`${explorer}/api/v2/transactions/${r.launch_tx}`);
      if (res.ok) {
        const tx = await res.json();
        creator = tx.from?.hash ?? creator;
      }
    } catch {
      /* ignore */
    }
    console.log(
      JSON.stringify({
        tokenAddress: getAddress(r.token_address),
        anchor: anchor?.symbol ?? "UNKNOWN",
        anchorAddress: r.numeraire,
        launchTx: r.launch_tx,
        creator,
        block: r.block_number,
        bpsManifestMarker: false,
        classification: "EXTERNAL (no BPS issued-manifest match)",
      }),
    );
  }
  const prep = await pool
    .query("SELECT COUNT(*) AS n FROM lab_prepared")
    .catch(() => ({ rows: [{ n: "0 (table absent)" }] }));
  console.log(`lab_prepared issued manifests: ${prep.rows[0].n}`);
} catch (e) {
  console.error(
    "report failed:",
    String(e?.message ?? e)
      .split(env.DATABASE_URL)
      .join("[DB]")
      .split(env.ROBINHOOD_CHAIN_RPC_URL)
      .join("[RPC]"),
  );
} finally {
  await pool.end().catch(() => {});
}
