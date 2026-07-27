// BPS Launch Lab — 8H hard gate: Doppler/GOOGL integration proof (read-only).
// Proves the exact PRINT/GOOGL multicurve launch can be constructed and simulated
// against live Robinhood Chain mainnet (4663). No transaction is signed or sent.
//
// Run from repo root:  node packages/launch-lab/scripts/spike-launch-proof.mjs
//
// Secrets: reads ROBINHOOD_CHAIN_RPC_URL from apps/web/.env.local. The URL is
// never printed; all error output is passed through redact() first.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  createPublicClient,
  http,
  defineChain,
  keccak256,
  getAddress,
  erc20Abi,
  parseEther,
} from 'viem';
import {
  CHAIN_IDS,
  getAddresses,
  DopplerSDK,
  MulticurveBuilder,
  WAD,
  ZERO_ADDRESS,
  NO_OP_ENABLED_CHAIN_IDS,
  airlockAbi,
  getAirlockOwner,
  VERSION,
} from '@whetstone-research/doppler-sdk/evm';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');

// ---- fixed launch decisions (founder-approved 2026-07-27) ----
const CREATOR = getAddress('0x29244A2309B703F82E292A3db7df0e95d0cdca72');
const CREATOR_FEE = getAddress('0x261Cda9dADdfDC9A0b8de887718af516FA7ee9C2');
const BPS_FEE = getAddress('0xF7F2d76F6364c72ea860512d78ae07e54bBbF8A5');
const GOOGL_EXPECTED = getAddress('0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3');
const SUPPLY = parseEther('1000000000'); // 1B PRINT
const START_FDV_USD = 20_500;
const POOL_FEE = 10_000; // BALANCED_1 = 1.00% (Uniswap fee units)

// ---- env (never printed) ----
function loadEnvLocal() {
  const envPath = path.join(REPO_ROOT, 'apps', 'web', '.env.local');
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = loadEnvLocal();
const RPC_URL = env.ROBINHOOD_CHAIN_RPC_URL;
if (!RPC_URL) {
  console.error('BLOCKED: ROBINHOOD_CHAIN_RPC_URL missing in apps/web/.env.local');
  process.exit(2);
}
const redact = (s) => String(s).split(RPC_URL).join('[RPC_REDACTED]');

const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const client = createPublicClient({ chain: robinhood, transport: http(RPC_URL) });

const report = {
  spike: 'BPS Launch Lab 8H hard gate — Doppler/GOOGL integration proof',
  generatedAtUtc: new Date().toISOString(),
  sdkVersion: VERSION,
  chainId: null,
  noOpEnabledForChain: NO_OP_ENABLED_CHAIN_IDS.includes(CHAIN_IDS.ROBINHOOD),
  modules: {},
  moduleWhitelist: {},
  airlockOwner: null,
  googl: {},
  beneficiaries: [],
  launchTemplate: {},
  simulation: {},
  verdict: 'PENDING',
  failures: [],
};

function fail(msg) {
  report.failures.push(msg);
  console.error('FAIL:', redact(msg));
}

try {
  // 1. Chain identity
  const chainId = await client.getChainId();
  report.chainId = chainId;
  if (chainId !== 4663) throw new Error(`RPC chainId ${chainId} !== 4663`);
  console.log('OK chainId 4663');

  // 2. Module addresses + bytecode
  const addresses = getAddresses(CHAIN_IDS.ROBINHOOD);
  const interesting = Object.fromEntries(
    Object.entries(addresses).filter(
      ([, v]) => typeof v === 'string' && v.startsWith('0x') && v.length === 42,
    ),
  );
  for (const [name, addr] of Object.entries(interesting)) {
    if (addr === ZERO_ADDRESS) {
      report.modules[name] = { address: addr, code: 'ZERO_ADDRESS' };
      continue;
    }
    const code = await client.getCode({ address: addr });
    report.modules[name] = {
      address: addr,
      code: code && code !== '0x' ? `present (${(code.length - 2) / 2} bytes)` : 'EMPTY',
    };
  }
  const required = ['airlock', 'dopplerHookInitializer', 'rehypeDopplerHookInitializer', 'noOpMigrator', 'noOpGovernanceFactory', 'dopplerERC20V1Factory'];
  for (const r of required) {
    const m = report.modules[r];
    if (!m || m.code === 'EMPTY' || m.code === 'ZERO_ADDRESS') fail(`required module ${r} missing/empty on 4663`);
    else console.log(`OK module ${r} ${m.address} ${m.code}`);
  }

  // 3. Airlock owner + module whitelist states
  const owner = await getAirlockOwner(client);
  report.airlockOwner = owner;
  console.log('OK airlock owner', owner);
  for (const r of required.filter((x) => x !== 'airlock')) {
    const addr = report.modules[r]?.address;
    if (!addr) continue;
    const state = await client.readContract({
      address: addresses.airlock,
      abi: airlockAbi,
      functionName: 'getModuleState',
      args: [addr],
    });
    report.moduleWhitelist[r] = Number(state);
    console.log(`whitelist ${r}: state=${state}`);
  }

  // 4. Canonical GOOGL — on-chain + official API, fail closed
  const [gName, gSymbol, gDecimals] = await Promise.all([
    client.readContract({ address: GOOGL_EXPECTED, abi: erc20Abi, functionName: 'name' }),
    client.readContract({ address: GOOGL_EXPECTED, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address: GOOGL_EXPECTED, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  const assetsRes = await fetch('https://api.robinhood.com/rhj/assets');
  const assets = await assetsRes.json();
  const list = Array.isArray(assets) ? assets : (assets.assets ?? assets.results ?? []);
  const googlApi = list.find((a) => (a.tokenSymbol ?? a.symbol) === 'GOOGL');
  if (!googlApi) throw new Error('GOOGL not found in rhj/assets');
  const dep = (googlApi.deployments ?? []).find((d) => Number(d.chainId) === 4663);
  if (!dep) throw new Error('GOOGL has no chainId 4663 deployment in rhj/assets');
  const apiAddr = getAddress(dep.contractAddress);
  if (apiAddr !== GOOGL_EXPECTED) throw new Error(`GOOGL address mismatch: api=${apiAddr} expected=${GOOGL_EXPECTED}`);
  const priceRes = await fetch('https://api.robinhood.com/rhj/prices/GOOGL');
  const priceJson = await priceRes.json();
  const quote = (priceJson.quotes ?? [])[0] ?? priceJson;
  const bid = Number(quote.bid);
  const ask = Number(quote.ask);
  const mid = (bid + ask) / 2;
  if (!Number.isFinite(mid) || mid <= 0) throw new Error('GOOGL price unavailable from rhj/prices');
  const multiplier = String(googlApi.currentMultiplier ?? '');
  report.googl = {
    address: GOOGL_EXPECTED,
    onchain: { name: gName, symbol: gSymbol, decimals: gDecimals },
    api: {
      name: googlApi.tokenName ?? googlApi.name,
      status: googlApi.status ?? googlApi.assetStatus,
      currentMultiplier: multiplier,
      chain4663Address: apiAddr,
      bid, ask, midUsd: mid,
    },
    match: gSymbol === 'GOOGL' && Number(gDecimals) === 18 && apiAddr === GOOGL_EXPECTED,
  };
  if (!report.googl.match) throw new Error('GOOGL fail-closed validation failed');
  console.log(`OK GOOGL verified (${gName}, ${gDecimals}dp, mid $${mid.toFixed(2)}, multiplier ${multiplier})`);

  // 5. Beneficiaries: 85% creator-fee / 10% BPS / 5% airlock owner, sum == WAD
  const beneficiaries = [
    { beneficiary: owner, shares: (WAD * 5n) / 100n },
    { beneficiary: BPS_FEE, shares: (WAD * 10n) / 100n },
    { beneficiary: CREATOR_FEE, shares: (WAD * 85n) / 100n },
  ];
  const sum = beneficiaries.reduce((a, b) => a + b.shares, 0n);
  if (sum !== WAD) throw new Error(`beneficiary shares sum ${sum} != WAD`);
  const uniq = new Set(beneficiaries.map((b) => b.beneficiary.toLowerCase()));
  if (uniq.size !== 3) throw new Error('duplicate beneficiary addresses');
  report.beneficiaries = beneficiaries.map((b) => ({ beneficiary: b.beneficiary, sharesWad: b.shares.toString() }));
  console.log('OK beneficiaries 85/10/5 sum==WAD');

  // 6. Build the launch template.
  // 4663 has NO standard/scheduled/decay multicurve initializer; the deployed
  // multicurve path is rehype (DopplerHookInitializer + RehypeDopplerHookInitializer).
  // All swap fees route to the locked-position beneficiaries; static 1% fee.
  const buildParams = (variant) => {
    const b = new MulticurveBuilder(CHAIN_IDS.ROBINHOOD)
      .tokenConfig({ type: 'dopplerERC20V1', name: 'PRINT', symbol: 'PRINT', tokenURI: 'ipfs://spike-placeholder-not-final' })
      .saleConfig({ initialSupply: SUPPLY, numTokensToSell: SUPPLY, numeraire: GOOGL_EXPECTED })
      .withCurves({
        numerairePrice: mid,
        curves: [
          { marketCap: { start: START_FDV_USD, end: 1_000_000 }, numPositions: 11, shares: (WAD * 60n) / 100n },
          { marketCap: { start: 1_000_000, end: 'max' }, numPositions: 10, shares: (WAD * 40n) / 100n },
        ],
        fee: POOL_FEE,
        beneficiaries,
      })
      .withGovernance({ type: 'noOp' })
      .withMigration({ type: 'noOp' })
      .withUserAddress(CREATOR);
    if (variant === 'rehype') {
      b.withRehypeDopplerHookInitializer({
        hookAddress: addresses.rehypeDopplerHookInitializer,
        startFee: POOL_FEE,
        endFee: POOL_FEE,
        durationSeconds: 0,
        feeRoutingMode: 'routeToBeneficiaryFees',
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
      });
    }
    return b.build();
  };

  const sdk = new DopplerSDK({ publicClient: client, chainId: CHAIN_IDS.ROBINHOOD });

  // 7. Simulate — try rehype first (deployed on 4663), then standard to document its failure.
  for (const variant of ['rehype', 'standard']) {
    try {
      const params = buildParams(variant);
      const sim = await sdk.factory.simulateCreateMulticurve(params);
      const calldataHash = keccak256(sim.createParams && sim.createParams.data ? sim.createParams.data : '0x');
      report.simulation[variant] = {
        status: 'SIMULATION_OK',
        predictedTokenAddress: sim.tokenAddress,
        predictedPoolId: sim.poolId,
        gasEstimate: sim.gasEstimate?.toString() ?? null,
        createParamsKeys: Object.keys(sim.createParams ?? {}),
        calldataHash,
      };
      console.log(`SIMULATION_OK [${variant}] token=${sim.tokenAddress} poolId=${sim.poolId} gas=${sim.gasEstimate}`);
    } catch (e) {
      report.simulation[variant] = { status: 'FAILED', error: redact(e?.shortMessage ?? e?.message ?? String(e)).slice(0, 600) };
      console.error(`SIMULATION FAILED [${variant}]:`, redact(e?.shortMessage ?? e?.message ?? String(e)).slice(0, 600));
    }
  }

  const ok = report.simulation.rehype?.status === 'SIMULATION_OK' || report.simulation.standard?.status === 'SIMULATION_OK';
  report.verdict = ok && report.failures.length === 0 ? 'HARD_GATE_PASSED' : 'HARD_GATE_FAILED';
} catch (e) {
  fail(e?.shortMessage ?? e?.message ?? String(e));
  report.verdict = 'HARD_GATE_FAILED';
}

const outDir = path.join(REPO_ROOT, 'docs', 'launch-lab');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'SPIKE_LAUNCH_PROOF.json'), redact(JSON.stringify(report, null, 2)));
console.log('verdict:', report.verdict);
process.exit(report.verdict === 'HARD_GATE_PASSED' ? 0 : 1);
