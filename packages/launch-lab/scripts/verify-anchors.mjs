// Multi-anchor verification: for each candidate Stock Token, resolve the 4663
// deployment from the official Robinhood /assets API, verify ERC-20 reads
// on-chain, and run the EXACT rehype multicurve launch simulation with that
// anchor as numeraire. Only anchors whose simulation succeeds are enabled.
// Read-only; RPC never printed. Run: node packages/launch-lab/scripts/verify-anchors.mjs
/* global console, fetch, URL, process */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createPublicClient, http, defineChain, getAddress, erc20Abi, parseEther } from "viem";
import {
  CHAIN_IDS,
  getAddresses,
  DopplerSDK,
  MulticurveBuilder,
  WAD,
  getAirlockOwner,
} from "@whetstone-research/doppler-sdk/evm";

const REPO_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "..",
  "..",
  "..",
);
const CANDIDATES = ["GOOGL", "NVDA", "AAPL", "TSLA", "SPCX"];
const CREATOR = getAddress("0x29244A2309B703F82E292A3db7df0e95d0cdca72");
const CREATOR_FEE = getAddress("0x261Cda9dADdfDC9A0b8de887718af516FA7ee9C2");
const BPS_FEE = getAddress("0xF7F2d76F6364c72ea860512d78ae07e54bBbF8A5");
const SUPPLY = parseEther("1000000000");
const START_FDV = 20_500;
const POOL_FEE = 10_000;

const env = {};
for (const line of readFileSync(path.join(REPO_ROOT, "apps", "web", ".env.local"), "utf8").split(
  /\r?\n/,
)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const RPC = env.ROBINHOOD_CHAIN_RPC_URL;
if (!RPC) {
  console.error("BLOCKED: ROBINHOOD_CHAIN_RPC_URL missing");
  process.exit(2);
}
const redact = (s) => String(s).split(RPC).join("[RPC]");
const chain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
});
const client = createPublicClient({ chain, transport: http(RPC) });

const assetsRes = await fetch("https://api.robinhood.com/rhj/assets");
const assetsJson = await assetsRes.json();
const assetList = Array.isArray(assetsJson)
  ? assetsJson
  : (assetsJson.assets ?? assetsJson.results ?? []);
const addresses = getAddresses(CHAIN_IDS.ROBINHOOD);
const airlockOwner = await getAirlockOwner(client);
const sdk = new DopplerSDK({ publicClient: client, chainId: CHAIN_IDS.ROBINHOOD });
const beneficiaries = [
  { beneficiary: airlockOwner, shares: (WAD * 5n) / 100n },
  { beneficiary: BPS_FEE, shares: (WAD * 10n) / 100n },
  { beneficiary: CREATOR_FEE, shares: (WAD * 85n) / 100n },
];

const registry = [];
for (const symbol of CANDIDATES) {
  const rec = { symbol, enabled: false, reason: "" };
  try {
    const asset = assetList.find((a) => (a.tokenSymbol ?? a.symbol) === symbol);
    if (!asset) throw new Error("not in /assets");
    const dep = (asset.deployments ?? []).find((d) => Number(d.chainId) === 4663);
    if (!dep) throw new Error("no 4663 deployment");
    const address = getAddress(dep.contractAddress);
    const [name, onchainSymbol, decimals] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ]);
    if (onchainSymbol !== symbol) throw new Error(`on-chain symbol ${onchainSymbol} != ${symbol}`);
    const priceRes = await fetch(`https://api.robinhood.com/rhj/prices/${symbol}`);
    const priceJson = await priceRes.json();
    const quote = (priceJson.quotes ?? [])[0] ?? priceJson;
    const mid =
      ((Number(quote.bid) + Number(quote.ask)) / 2) * Number(asset.currentMultiplier ?? 1);
    rec.name = asset.tokenName ?? asset.name ?? name;
    rec.logo = asset.logoUrl ?? asset.iconUrl ?? asset.imageUrl ?? null;
    rec.address = address;
    rec.decimals = Number(decimals);
    rec.currentMultiplier = String(asset.currentMultiplier ?? "");
    rec.status = asset.status ?? asset.assetStatus ?? "";
    rec.chainId = 4663;
    rec.midUsd = Number.isFinite(mid) ? Number(mid.toFixed(4)) : null;

    // Exact rehype multicurve simulation with this anchor as numeraire.
    const params = new MulticurveBuilder(CHAIN_IDS.ROBINHOOD)
      .tokenConfig({
        type: "dopplerERC20V1",
        name: "PROBE",
        symbol: "PROBE",
        tokenURI: "ipfs://probe",
      })
      .saleConfig({ initialSupply: SUPPLY, numTokensToSell: SUPPLY, numeraire: address })
      .withCurves({
        numerairePrice: rec.midUsd ?? 100,
        curves: [
          {
            marketCap: { start: START_FDV, end: 1_000_000 },
            numPositions: 11,
            shares: (WAD * 60n) / 100n,
          },
          {
            marketCap: { start: 1_000_000, end: "max" },
            numPositions: 10,
            shares: (WAD * 40n) / 100n,
          },
        ],
        fee: POOL_FEE,
        beneficiaries,
      })
      .withRehypeDopplerHookInitializer({
        hookAddress: addresses.rehypeDopplerHookInitializer,
        startFee: POOL_FEE,
        endFee: POOL_FEE,
        durationSeconds: 0,
        feeRoutingMode: "routeToBeneficiaryFees",
        feeBeneficiaries: beneficiaries,
        feeDistributionInfo: {
          assetFeesToAssetBuybackWad: 0n,
          assetFeesToNumeraireBuybackWad: 0n,
          assetFeesToBeneficiaryWad: WAD,
          assetFeesToLpWad: 0n,
          numeraireFeesToAssetBuybackWad: 0n,
          numeraireFeesToNumeraireBuybackWad: 0n,
          numeraireFeesToBeneficiaryWad: WAD,
          numeraireFeesToLpWad: 0n,
        },
      })
      .withGovernance({ type: "noOp" })
      .withMigration({ type: "noOp" })
      .withUserAddress(CREATOR)
      .build();
    const sim = await sdk.factory.simulateCreateMulticurve(params);
    rec.simulation = {
      status: "ok",
      predictedToken: sim.tokenAddress,
      gas: (sim.gasEstimate ?? 0n).toString(),
    };
    rec.enabled = true;
    rec.verifiedAt = new Date().toISOString();
    console.log(
      `OK ${symbol} @ ${address} (${rec.decimals}dp, mid $${rec.midUsd}) — SIM OK gas ${rec.simulation.gas}`,
    );
  } catch (e) {
    rec.enabled = false;
    rec.reason = redact(e?.shortMessage ?? e?.message ?? String(e)).slice(0, 200);
    console.error(`FAIL ${symbol}: ${rec.reason}`);
  }
  registry.push(rec);
}

const out = { generatedAt: new Date().toISOString(), chainId: 4663, anchors: registry };
writeFileSync(
  path.join(REPO_ROOT, "docs", "launch-lab", "ANCHOR_VERIFICATION.json"),
  redact(JSON.stringify(out, null, 2)),
);
const enabled = registry.filter((r) => r.enabled).map((r) => r.symbol);
console.log(`ENABLED: ${enabled.join(", ") || "(none)"}`);
process.exit(enabled.length > 0 ? 0 : 1);
